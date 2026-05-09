import { Injectable, signal } from '@angular/core';

/** A single message in the conversation turn. */
export interface CopilotMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** A parsed chunk from the SSE stream. */
interface StreamChunk {
  text?: string;
  error?: string;
}

/**
 * CopilotService
 *
 * Low-level Angular service that communicates with the Node.js proxy
 * at `/api/chat` using the Fetch Streaming API + Server-Sent Events.
 *
 * Exposes reactive signals for stream state so consuming components
 * can bind directly without manual change detection.
 *
 * **Security**: No API keys or SDK imports live here — all sensitive
 * credentials remain on the server side.
 */
/** Model info returned by the /api/models endpoint. */
export interface AvailableModel {
  id: string;
  name: string;
  owner: string;
}

@Injectable({ providedIn: 'root' })
export class CopilotService {
  /** Accumulates the full text of the current streaming response. */
  readonly streamingContent = signal<string>('');

  /** True while a response is being streamed from the backend. */
  readonly isStreaming = signal<boolean>(false);

  /** Non-empty when the last stream attempt produced an error. */
  readonly lastError = signal<string>('');

  /** Available models fetched from the server. */
  readonly availableModels = signal<AvailableModel[]>([]);

  /** True while fetching the model list. */
  readonly modelsLoading = signal<boolean>(false);

  /** Error from the last fetchModels call. */
  readonly modelsError = signal<string>('');

  /** Fetch available models from the backend /api/models endpoint. */
  async fetchModels(): Promise<void> {
    this.modelsLoading.set(true);
    this.modelsError.set('');
    try {
      const res = await fetch('/api/models');
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { models: AvailableModel[] };
      this.availableModels.set(data.models ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.modelsError.set(msg);
    } finally {
      this.modelsLoading.set(false);
    }
  }

  /**
   * Streams a chat completion from the backend proxy.
   *
   * Yields each text delta as it arrives so callers can update UI
   * incrementally without waiting for the full response.
   *
   * @param messages     Full conversation history (user + assistant turns).
   * @param systemPrompt Server-side system instructions injected before messages.
   * @param model        Anthropic model ID (e.g. `claude-sonnet-4-5`).
   * @yields             Individual text deltas from the model.
   * @throws             Re-throws on network errors or backend error events.
   */
  async *stream(
    messages: CopilotMessage[],
    systemPrompt: string,
    model: string,
  ): AsyncGenerator<string> {
    this.isStreaming.set(true);
    this.lastError.set('');
    this.streamingContent.set('');

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, systemPrompt, model }),
      });

      if (!response.ok || !response.body) {
        const errText = await response.text().catch(() => response.statusText);
        throw new Error(`Backend error ${response.status}: ${errText}`);
      }

      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep incomplete last line in buffer for next iteration
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const raw = line.slice(6).trim();
          if (raw === '[DONE]') return;

          let chunk: StreamChunk;
          try {
            chunk = JSON.parse(raw) as StreamChunk;
          } catch {
            // Skip malformed SSE lines (e.g. keep-alive comments)
            continue;
          }

          if (chunk.error) {
            throw new Error(chunk.error);
          }

          if (chunk.text) {
            this.streamingContent.update(v => v + chunk.text!);
            yield chunk.text;
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError.set(msg);
      throw err;
    } finally {
      reader?.cancel().catch(() => undefined);
      this.isStreaming.set(false);
    }
  }
}
