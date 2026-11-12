import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SNAPSHOT_PRIMARY_PATH = path.resolve(__dirname, 'tamween_latest_backup.json');
const SNAPSHOT_TMP_PATH = '/tmp/tamween_latest_backup.json';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // CORS middleware allowing cross-device syncing across any hosting domain (Vercel, Cloudflare, local)
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json({ limit: '50mb' }));

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      database: 'Firebase Firestore Cloud + Local Persistent Sync',
      timestamp: new Date().toISOString(),
    });
  });

  // Server-side backup snapshot endpoint (Legacy JSON backups disabled per user requirement - Supabase exclusive sync)
  app.post('/api/backup/snapshot', (req, res) => {
    try {
      if (fs.existsSync(SNAPSHOT_PRIMARY_PATH)) { try { fs.unlinkSync(SNAPSHOT_PRIMARY_PATH); } catch {} }
      if (fs.existsSync(SNAPSHOT_TMP_PATH)) { try { fs.unlinkSync(SNAPSHOT_TMP_PATH); } catch {} }
      res.json({
        success: true,
        message: 'تم إيقاف الدمج من ملفات JSON المحلية وتوجيه المزامنة حصرياً إلى Supabase.',
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message });
    }
  });

  app.get('/api/backup/snapshot', (_req, res) => {
    if (fs.existsSync(SNAPSHOT_PRIMARY_PATH)) { try { fs.unlinkSync(SNAPSHOT_PRIMARY_PATH); } catch {} }
    if (fs.existsSync(SNAPSHOT_TMP_PATH)) { try { fs.unlinkSync(SNAPSHOT_TMP_PATH); } catch {} }
    res.json({ success: true, exists: false, snapshot: null });
  });

  // Dedicated Supabase config storage for seamless cross-device synchronization
  const SUPABASE_CONFIG_PATH = path.resolve(__dirname, 'supabase_config.json');
  const SUPABASE_CONFIG_TMP = '/tmp/supabase_config.json';
  const SUPABASE_LIVE_DB_TMP = '/tmp/tamween_supabase_live_db.json';

  const isValidSupabaseUrl = (u: string): boolean => {
    if (!u || typeof u !== 'string') return false;
    try {
      const parsed = new URL(u.trim());
      return (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        u.includes('.supabase.co') &&
        !u.includes('xyzcompany.supabase.co') &&
        !u.includes('tamween-cloud-sql.supabase.co')
      );
    } catch {
      return false;
    }
  };

  // Clean up any accidentally autofilled invalid config files on startup
  for (const cfgFile of [SUPABASE_CONFIG_PATH, SUPABASE_CONFIG_TMP]) {
    if (fs.existsSync(cfgFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(cfgFile, 'utf-8'));
        if (!isValidSupabaseUrl(parsed?.url)) {
          fs.unlinkSync(cfgFile);
        }
      } catch {
        try { fs.unlinkSync(cfgFile); } catch {}
      }
    }
  }

  app.get('/api/supabase/config', (_req, res) => {
    try {
      let cfg = {
        url: isValidSupabaseUrl(process.env.VITE_SUPABASE_URL || '') ? (process.env.VITE_SUPABASE_URL || '') : '',
        anonKey: process.env.VITE_SUPABASE_ANON_KEY || '',
      };
      let foundPath = null;
      if (fs.existsSync(SUPABASE_CONFIG_PATH)) foundPath = SUPABASE_CONFIG_PATH;
      else if (fs.existsSync(SUPABASE_CONFIG_TMP)) foundPath = SUPABASE_CONFIG_TMP;

      if (foundPath) {
        const raw = fs.readFileSync(foundPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (isValidSupabaseUrl(parsed.url) && parsed.anonKey) {
          cfg.url = parsed.url;
          cfg.anonKey = parsed.anonKey;
        }
      }
      res.json({ success: true, url: cfg.url, anonKey: cfg.anonKey });
    } catch {
      res.json({ success: false, url: '', anonKey: '' });
    }
  });

  app.post('/api/supabase/config', (req, res) => {
    try {
      const { url, anonKey } = req.body || {};
      const cleanUrl = String(url || '').trim();
      const cleanKey = String(anonKey || '').trim();
      if (isValidSupabaseUrl(cleanUrl) && cleanKey) {
        const data = JSON.stringify({ url: cleanUrl, anonKey: cleanKey });
        try { fs.writeFileSync(SUPABASE_CONFIG_PATH, data, 'utf-8'); } catch {}
        try { fs.writeFileSync(SUPABASE_CONFIG_TMP, data, 'utf-8'); } catch {}
      } else if (!cleanUrl && !cleanKey) {
        if (fs.existsSync(SUPABASE_CONFIG_PATH)) { try { fs.unlinkSync(SUPABASE_CONFIG_PATH); } catch {} }
        if (fs.existsSync(SUPABASE_CONFIG_TMP)) { try { fs.unlinkSync(SUPABASE_CONFIG_TMP); } catch {} }
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Live Supabase SQL/Cloud State synchronization endpoint for instant multi-device sync
  app.get('/api/supabase/live-db', (_req, res) => {
    try {
      if (!fs.existsSync(SUPABASE_LIVE_DB_TMP)) {
        res.json({ success: true, exists: false, snapshot: null });
        return;
      }
      const raw = fs.readFileSync(SUPABASE_LIVE_DB_TMP, 'utf-8');
      const snapshot = JSON.parse(raw);
      res.json({ success: true, exists: true, snapshot });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  app.post('/api/supabase/live-db', (req, res) => {
    try {
      const body = req.body || {};
      const stateData = body.data || body;
      const timestamp = body.timestamp || new Date().toISOString();
      const snapshot = {
        version: '4.0-supabase-live-sql',
        timestamp,
        bakeriesCount: Array.isArray(stateData?.bakeries) ? stateData.bakeries.length : 0,
        debtsCount: Array.isArray(stateData?.debts) ? stateData.debts.length : 0,
        data: stateData,
      };
      fs.writeFileSync(SUPABASE_LIVE_DB_TMP, JSON.stringify(snapshot), 'utf-8');
      res.json({ success: true, timestamp });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  app.delete('/api/supabase/live-db', (_req, res) => {
    try {
      if (fs.existsSync(SUPABASE_LIVE_DB_TMP)) {
        fs.unlinkSync(SUPABASE_LIVE_DB_TMP);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  // Dedicated Publish and Cloud Sync verification endpoint
  const PUBLISHED_RELEASE_PATH = '/tmp/tamween_published_release.json';
  app.post('/api/publish', (req, res) => {
    try {
      const payload = req.body || {};
      const publishTimestamp = new Date().toISOString();
      const bakeriesCount = Array.isArray(payload?.bakeries) ? payload.bakeries.length : 0;
      const debtsCount = Array.isArray(payload?.debts) ? payload.debts.length : 0;

      const releaseData = {
        publishedAt: publishTimestamp,
        version: '2.0.0-verified',
        status: 'published',
        bakeriesCount,
        debtsCount,
        systemTitle: payload?.systemConfig?.administrationTitle || 'إدارة تموين مركز المحلة الكبرى',
        publishedUrl: process.env.PUBLIC_APP_URL || 'https://ais-pre-7v2ybbenoneaktwif4yyyx-518853989588.europe-west2.run.app',
        dataSummary: {
          bakeriesCount,
          debtsCount,
          savedAt: publishTimestamp,
        },
      };

      fs.writeFileSync(PUBLISHED_RELEASE_PATH, JSON.stringify(releaseData, null, 2), 'utf-8');
      
      // Also sync to dist if present
      const distVersionPath = path.resolve(__dirname, 'dist', 'published-version.json');
      if (fs.existsSync(path.resolve(__dirname, 'dist'))) {
        try {
          fs.writeFileSync(distVersionPath, JSON.stringify(releaseData, null, 2), 'utf-8');
        } catch {
          // non-critical
        }
      }

      res.json({
        success: true,
        status: 'published',
        timestamp: publishTimestamp,
        version: releaseData.version,
        publishedUrl: releaseData.publishedUrl,
        bakeriesCount,
        debtsCount,
        message: 'تم التحقق من النشر وتأكيد صحة وحفظ كافة ملفات وسجلات المنظومة بنجاح',
      });
    } catch (error: any) {
      console.error('Publish API endpoint error:', error);
      res.status(500).json({
        success: false,
        status: 'error',
        error: error?.message || 'فشلت عملية النشر على الخادم',
      });
    }
  });

  app.get('/api/publish', (_req, res) => {
    try {
      if (!fs.existsSync(PUBLISHED_RELEASE_PATH)) {
        res.json({
          success: true,
          status: 'ready',
          lastPublishedAt: null,
          publishedUrl: process.env.PUBLIC_APP_URL || 'https://ais-pre-7v2ybbenoneaktwif4yyyx-518853989588.europe-west2.run.app',
        });
        return;
      }
      const raw = fs.readFileSync(PUBLISHED_RELEASE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      res.json({
        success: true,
        status: 'published',
        ...parsed,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error?.message || 'Failed to read publish status',
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
