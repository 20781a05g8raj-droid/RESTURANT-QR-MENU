import express from 'express';
import os from 'node:os';
import path from 'node:path';
import { AuthManager } from '../serverAuth';
import { createApiRouter } from '../serverApi';

const authManager = new AuthManager({
  baseDir: path.join(os.tmpdir(), 'tablepulse-data'),
});

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/api', createApiRouter(authManager));

export default app;
