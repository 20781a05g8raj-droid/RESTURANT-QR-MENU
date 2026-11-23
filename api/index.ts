import express from 'express';
import os from 'node:os';
import path from 'node:path';
import { AuthManager } from '../serverAuth.js';
import { createApiRouter } from '../serverApi.js';

const authManager = new AuthManager({
  baseDir: path.join(os.tmpdir(), 'tablepulse-data'),
});

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));

const apiRouter = createApiRouter(authManager);
// Mount on both /api and / so Vercel rewrites work whether /api prefix is preserved or stripped
app.use('/api', apiRouter);
app.use('/', apiRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    const message = err instanceof Error ? err.message : 'Internal server error.';
    console.error('[Vercel API Error]', message);
    res.status(500).json({ error: message });
  }
);

export default app;
