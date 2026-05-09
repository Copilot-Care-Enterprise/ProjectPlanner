import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { chatRouter } from './routes/chat';

dotenv.config();

const app = express();

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors({ origin: ['http://localhost:4200', 'http://localhost:4201'] }));
app.use(express.json({ limit: '2mb' })); // Scenario JSON can be large

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api', chatRouter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    hasToken: Boolean(process.env['GITHUB_TOKEN']),
    timestamp: new Date().toISOString(),
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = Number(process.env['PORT'] ?? 3000);
app.listen(PORT, () => {
  const hasToken = Boolean(process.env['GITHUB_TOKEN']);
  console.log(`[Copilot Proxy] Listening on http://localhost:${PORT}`);
  console.log(`[Copilot Proxy] GitHub token: ${hasToken ? '✓ configured' : '✗ MISSING — add GITHUB_TOKEN to .env'}`);
});
