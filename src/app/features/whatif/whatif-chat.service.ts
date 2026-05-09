import { Injectable, inject, signal } from '@angular/core';
import { CopilotService } from '../../core/copilot.service';

const MODEL_KEY = 'pp_copilot_model';

/** Default model when no preference is stored. */
export const DEFAULT_MODEL = 'gpt-4o';

/** A single allocation change action suggested by the AI. */
export interface AllocationAction {
  type: 'add' | 'update' | 'remove';
  personName: string;
  projectName: string;
  allocationPercentage?: number;
  endDate?: string;
}

/** A set of actions for a single recommended option. */
export interface OptionActions {
  option: number;
  label: string;
  actions: AllocationAction[];
}

/** A single turn in the conversation. */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  /** True while the assistant is still streaming this message. */
  streaming?: boolean;
  /** True when the message represents a backend or network error. */
  error?: boolean;
  /** Parsed structured options from the AI response. */
  options?: OptionActions[];
}

/** Parse pp-actions JSON block from AI response content. */
function parseOptionActions(content: string): { cleanContent: string; options: OptionActions[] } {
  const match = content.match(/```pp-actions\s*\n([\s\S]*?)\n```/);
  if (!match) return { cleanContent: content, options: [] };

  const cleanContent = content.replace(/```pp-actions[\s\S]*?```/, '').trimEnd();
  try {
    const parsed = JSON.parse(match[1]) as OptionActions[];
    if (!Array.isArray(parsed)) return { cleanContent, options: [] };
    // Basic validation
    const valid = parsed.filter(
      o => typeof o.option === 'number' && typeof o.label === 'string' && Array.isArray(o.actions),
    );
    return { cleanContent, options: valid };
  } catch {
    return { cleanContent, options: [] };
  }
}

/**
 * WhatifChatService
 *
 * Manages chat history and orchestrates streaming completions from the
 * Node.js Copilot proxy via {@link CopilotService}.
 *
 * No API keys are stored here — all credentials live on the server.
 */
@Injectable({ providedIn: 'root' })
export class WhatifChatService {
  private readonly copilot = inject(CopilotService);

  readonly model    = signal<string>(localStorage.getItem(MODEL_KEY) ?? DEFAULT_MODEL);
  readonly messages = signal<ChatMessage[]>([]);
  readonly loading  = signal<boolean>(false);

  /** Dynamic models from the server. */
  readonly availableModels = this.copilot.availableModels;
  readonly modelsLoading   = this.copilot.modelsLoading;
  readonly modelsError     = this.copilot.modelsError;

  /** Fetch models from the backend. */
  async fetchModels(): Promise<void> {
    await this.copilot.fetchModels();
  }

  /** Save the selected model to localStorage. */
  saveModel(value: string): void {
    const v = value.trim() || DEFAULT_MODEL;
    this.model.set(v);
    localStorage.setItem(MODEL_KEY, v);
  }

  /** Clear all chat messages (called on scenario fork). */
  clearChat(): void {
    this.messages.set([]);
  }

  /**
   * Send a user message and stream the assistant response token-by-token.
   *
   * Tokens are appended in-place to a pre-inserted assistant message so the
   * UI updates reactively as each chunk arrives.
   *
   * @param userText     The user's input text.
   * @param systemPrompt The system-level context sent to the model.
   */
  async send(userText: string, systemPrompt: string): Promise<void> {
    if (this.loading() || !userText.trim()) return;

    // Capture history before the new user message is added
    const priorHistory = this.messages().map(m => ({
      role:    m.role,
      content: m.content,
    }));

    // Add user message
    this.messages.update(msgs => [
      ...msgs,
      { id: crypto.randomUUID(), role: 'user', content: userText.trim(), timestamp: new Date() },
    ]);

    this.loading.set(true);

    // Pre-insert a streaming placeholder for the assistant reply
    const aiId = crypto.randomUUID();
    this.messages.update(msgs => [
      ...msgs,
      { id: aiId, role: 'assistant', content: '', timestamp: new Date(), streaming: true },
    ]);

    const history = [...priorHistory, { role: 'user' as const, content: userText.trim() }];

    try {
      for await (const token of this.copilot.stream(history, systemPrompt, this.model())) {
        this.messages.update(msgs =>
          msgs.map(m => m.id === aiId ? { ...m, content: m.content + token } : m),
        );
      }
      // Mark streaming complete and parse structured options
      this.messages.update(msgs =>
        msgs.map(m => {
          if (m.id !== aiId) return m;
          const parsed = parseOptionActions(m.content);
          return { ...m, content: parsed.cleanContent, options: parsed.options, streaming: false };
        }),
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.messages.update(msgs =>
        msgs.map(m =>
          m.id === aiId ? { ...m, content: msg, streaming: false, error: true } : m,
        ),
      );
    } finally {
      this.loading.set(false);
    }
  }
}
