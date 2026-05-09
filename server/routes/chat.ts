import { Router, Request, Response } from 'express';

/** GitHub Models OpenAI-compatible base URL */
const GITHUB_MODELS_BASE = 'https://models.inference.ai.azure.com';

/** Default model when none is specified in the request */
const DEFAULT_MODEL = 'gpt-4o';

export const chatRouter = Router();

// ── GET /api/models — Fetch available models from GitHub Models ──────────────
chatRouter.get('/models', async (_req: Request, res: Response): Promise<void> => {
  const token = process.env['GITHUB_TOKEN'];
  if (!token) {
    res.status(503).json({ error: 'GITHUB_TOKEN is not configured on the server.' });
    return;
  }

  try {
    const upstream = await fetch(`${GITHUB_MODELS_BASE}/models`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      res.status(upstream.status).json({
        error: `GitHub Models API error ${upstream.status}: ${errorText}`,
      });
      return;
    }

    // GitHub Models returns an array of model objects (not OpenAI format)
    interface GHModel {
      name: string;
      friendly_name?: string;
      publisher?: string;
      task?: string;
    }
    const body = await upstream.json() as GHModel[] | { data?: GHModel[] };
    const rawList = Array.isArray(body) ? body : (body.data ?? []);

    // Only show chat-completion models (skip embeddings, etc.)
    const models = rawList
      .filter((m) => m.task === 'chat-completion')
      .map((m) => ({
        id: m.name,
        name: m.friendly_name ?? m.name,
        owner: m.publisher ?? '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ models });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// ── POST /api/chat — Stream a chat completion via GitHub Models ──────────────
chatRouter.post('/chat', async (req: Request, res: Response): Promise<void> => {
  const token = process.env['GITHUB_TOKEN'];
  if (!token) {
    res.status(503).json({
      error: 'GITHUB_TOKEN is not configured on the server. Add it to the .env file.',
    });
    return;
  }

  const { messages, systemPrompt, model } = req.body as {
    messages:     Array<{ role: 'user' | 'assistant'; content: string }>;
    systemPrompt: string;
    model?:       string;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array is required and must not be empty.' });
    return;
  }

  // ── SSE headers ────────────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendEvent = (payload: Record<string, unknown> | '[DONE]'): void => {
    const data = payload === '[DONE]' ? '[DONE]' : JSON.stringify(payload);
    res.write(`data: ${data}\n\n`);
  };

  // Prepend system prompt as a system message (OpenAI format)
  const allMessages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    ...messages,
  ];

  try {
    const upstream = await fetch(`${GITHUB_MODELS_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        model:       model ?? DEFAULT_MODEL,
        messages:    allMessages,
        max_tokens:  2048,
        temperature: 0.5,
        stream:      true,
      }),
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      sendEvent({ error: `GitHub Models API error ${upstream.status}: ${errorText}` });
      res.end();
      return;
    }

    if (!upstream.body) {
      sendEvent({ error: 'No response body from GitHub Models API.' });
      res.end();
      return;
    }

    // Parse OpenAI-style SSE stream
    const decoder = new TextDecoder();
    let buffer = '';

    for await (const chunk of upstream.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const raw = trimmed.slice(5).trim();
        if (raw === '[DONE]') {
          sendEvent('[DONE]');
          res.end();
          return;
        }

        try {
          const parsed = JSON.parse(raw) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const text = parsed.choices?.[0]?.delta?.content;
          if (text) sendEvent({ text });
        } catch {
          // Ignore malformed SSE lines
        }
      }
    }

    sendEvent('[DONE]');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    sendEvent({ error: message });
  } finally {
    res.end();
  }
});
