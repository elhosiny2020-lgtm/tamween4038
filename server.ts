import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SNAPSHOT_FILE_PATH = '/tmp/tamween_latest_backup.json';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '50mb' }));

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      database: 'Firebase Firestore Cloud + Local Persistent Sync',
      timestamp: new Date().toISOString(),
    });
  });

  // Server-side scheduled/manual backup snapshot endpoint
  app.post('/api/backup/snapshot', (req, res) => {
    try {
      const payload = req.body;
      const snapshotWrapper = {
        savedAt: new Date().toISOString(),
        bakeriesCount: Array.isArray(payload?.bakeries) ? payload.bakeries.length : 0,
        debtsCount: Array.isArray(payload?.debts) ? payload.debts.length : 0,
        data: payload,
      };
      fs.writeFileSync(SNAPSHOT_FILE_PATH, JSON.stringify(snapshotWrapper, null, 2), 'utf-8');
      res.json({
        success: true,
        savedAt: snapshotWrapper.savedAt,
        bakeriesCount: snapshotWrapper.bakeriesCount,
        debtsCount: snapshotWrapper.debtsCount,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error?.message || 'Failed to write server backup snapshot',
      });
    }
  });

  app.get('/api/backup/snapshot', (_req, res) => {
    try {
      if (!fs.existsSync(SNAPSHOT_FILE_PATH)) {
        res.json({ success: true, exists: false, snapshot: null });
        return;
      }
      const raw = fs.readFileSync(SNAPSHOT_FILE_PATH, 'utf-8');
      res.json({ success: true, exists: true, snapshot: JSON.parse(raw) });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error?.message || 'Failed to read server backup snapshot',
      });
    }
  });

  // Vite development middleware vs Static Production files
  const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.K_SERVICE);
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      try {
        const url = req.originalUrl;
        const indexHtmlPath = path.resolve(__dirname, 'index.html');
        const rawHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
        const template = await vite.transformIndexHtml(url, rawHtml);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Tamween Server running on http://localhost:${PORT}`);
  });
}

startServer();
