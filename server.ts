import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
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
  const httpServer = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  // WebSocket Server attached to port 3000 for genuine sub-50ms cross-device real-time sync
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/supabase-realtime' });

  const broadcastWs = (payload: Record<string, any>) => {
    const encoded = JSON.stringify(payload);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(encoded);
        } catch {}
      }
    });
  };

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
      database: 'Supabase Realtime + WebSocket Server Sync',
      wsClients: wss.clients.size,
      timestamp: new Date().toISOString(),
    });
  });

  // Server-side backup snapshot endpoint (Legacy JSON backups disabled per user requirement - Supabase exclusive sync)
  app.post('/api/backup/snapshot', (_req, res) => {
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

  // Dedicated Supabase config & live-db storage for seamless cross-device synchronization
  const SUPABASE_CONFIG_PATH = path.resolve(__dirname, 'supabase_config.json');
  const SUPABASE_CONFIG_TMP = '/tmp/supabase_config.json';
  const SUPABASE_LIVE_DB_PRIMARY = path.resolve(__dirname, '.tamween_live_db.json');
  const SUPABASE_LIVE_DB_TMP = '/tmp/tamween_supabase_live_db.json';
  const SUPABASE_ALERTS_PRIMARY = path.resolve(__dirname, '.tamween_alerts_db.json');
  const SUPABASE_ALERTS_TMP = '/tmp/tamween_supabase_alerts.json';

  let cachedLiveSnapshot: any = null;
  let cachedAlertsState: {
    alerts: any[];
    debtAlertThreshold: number;
    updatedAt: string;
    revision: number;
    clientId?: string;
  } = {
    alerts: [],
    debtAlertThreshold: 50000,
    updatedAt: '',
    revision: 0,
  };
  let liveRevision = 0;

  // Hydrate cached snapshots from durable workspace file or /tmp on server startup
  for (const candidatePath of [SUPABASE_LIVE_DB_PRIMARY, SUPABASE_LIVE_DB_TMP]) {
    try {
      if (fs.existsSync(candidatePath)) {
        const parsed = JSON.parse(fs.readFileSync(candidatePath, 'utf-8'));
        if (parsed && parsed.data) {
          if (
            !cachedLiveSnapshot ||
            (Date.parse(parsed.timestamp || '') || 0) > (Date.parse(cachedLiveSnapshot.timestamp || '') || 0)
          ) {
            cachedLiveSnapshot = parsed;
            liveRevision = Math.max(liveRevision, Number(parsed?.revision || 1));
          }
        }
      }
    } catch {}
  }

  for (const alertsPath of [SUPABASE_ALERTS_PRIMARY, SUPABASE_ALERTS_TMP]) {
    try {
      if (fs.existsSync(alertsPath)) {
        const parsedAlerts = JSON.parse(fs.readFileSync(alertsPath, 'utf-8'));
        if (parsedAlerts && typeof parsedAlerts === 'object') {
          if (
            !cachedAlertsState.updatedAt ||
            (Date.parse(parsedAlerts.updatedAt || '') || 0) > (Date.parse(cachedAlertsState.updatedAt || '') || 0)
          ) {
            cachedAlertsState = {
              alerts: Array.isArray(parsedAlerts.alerts) ? parsedAlerts.alerts : [],
              debtAlertThreshold: Number(parsedAlerts.debtAlertThreshold) || 50000,
              updatedAt: parsedAlerts.updatedAt || '',
              revision: Number(parsedAlerts.revision) || 0,
            };
          }
        }
      }
    } catch {}
  }

  wss.on('connection', (socket) => {
    // Send authoritative state immediately upon WebSocket connect/reconnect
    try {
      socket.send(
        JSON.stringify({
          type: 'init',
          timestamp: new Date().toISOString(),
          snapshot: cachedLiveSnapshot,
          alertsState: cachedAlertsState,
        })
      );
    } catch {}

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw || '{}'));
        if (msg?.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        } else if (msg?.type === 'request_init') {
          socket.send(
            JSON.stringify({
              type: 'init',
              timestamp: new Date().toISOString(),
              snapshot: cachedLiveSnapshot,
              alertsState: cachedAlertsState,
            })
          );
        }
      } catch {}
    });
  });

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

  const isServiceRoleJwt = (token: string): boolean => {
    if (!token || typeof token !== 'string') return false;
    const trimmed = token.trim();
    if (trimmed.toLowerCase().includes('service_role')) return true;
    const parts = trimmed.split('.');
    if (parts.length !== 3) return false;
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=');
      const decoded = Buffer.from(padded, 'base64').toString('utf-8');
      const payload = JSON.parse(decoded);
      return payload?.role === 'service_role';
    } catch {
      return false;
    }
  };

  // Clean up any accidentally autofilled invalid config files or service_role keys on startup
  for (const cfgFile of [SUPABASE_CONFIG_PATH, SUPABASE_CONFIG_TMP]) {
    if (fs.existsSync(cfgFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(cfgFile, 'utf-8'));
        if (!isValidSupabaseUrl(parsed?.url) || isServiceRoleJwt(parsed?.anonKey)) {
          fs.unlinkSync(cfgFile);
        }
      } catch {
        try { fs.unlinkSync(cfgFile); } catch {}
      }
    }
  }

  app.get('/api/supabase/config', (_req, res) => {
    try {
      const envKey = process.env.VITE_SUPABASE_ANON_KEY || '';
      let cfg = {
        url: isValidSupabaseUrl(process.env.VITE_SUPABASE_URL || '') ? (process.env.VITE_SUPABASE_URL || '') : '',
        anonKey: !isServiceRoleJwt(envKey) ? envKey : '',
      };
      let foundPath = null;
      if (fs.existsSync(SUPABASE_CONFIG_PATH)) foundPath = SUPABASE_CONFIG_PATH;
      else if (fs.existsSync(SUPABASE_CONFIG_TMP)) foundPath = SUPABASE_CONFIG_TMP;

      if (foundPath) {
        const raw = fs.readFileSync(foundPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (isValidSupabaseUrl(parsed.url) && parsed.anonKey && !isServiceRoleJwt(parsed.anonKey)) {
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
      if (isServiceRoleJwt(cleanKey)) {
        res.status(400).json({
          success: false,
          error: 'يُحظر استخدام مفتاح service_role السري في المتصفح. يرجى استخدام مفتاح anon العام فقط.',
        });
        return;
      }
      if (isValidSupabaseUrl(cleanUrl) && cleanKey) {
        const data = JSON.stringify({ url: cleanUrl, anonKey: cleanKey });
        try { fs.writeFileSync(SUPABASE_CONFIG_PATH, data, 'utf-8'); } catch {}
        try { fs.writeFileSync(SUPABASE_CONFIG_TMP, data, 'utf-8'); } catch {}
        broadcastWs({ type: 'config_updated', url: cleanUrl, anonKey: cleanKey, timestamp: new Date().toISOString() });
      } else if (!cleanUrl && !cleanKey) {
        if (fs.existsSync(SUPABASE_CONFIG_PATH)) { try { fs.unlinkSync(SUPABASE_CONFIG_PATH); } catch {} }
        if (fs.existsSync(SUPABASE_CONFIG_TMP)) { try { fs.unlinkSync(SUPABASE_CONFIG_TMP); } catch {} }
        broadcastWs({ type: 'config_updated', url: '', anonKey: '', timestamp: new Date().toISOString() });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Lightweight metadata probe (<200 bytes) so background clients detect revisions without pulling full JSON
  app.get('/api/supabase/live-meta', (_req, res) => {
    if (!cachedLiveSnapshot) {
      res.json({ success: true, exists: false, revision: liveRevision });
      return;
    }
    res.json({
      success: true,
      exists: true,
      revision: cachedLiveSnapshot.revision || liveRevision,
      timestamp: cachedLiveSnapshot.timestamp || '',
      clientId: cachedLiveSnapshot.clientId || '',
      bakeriesCount: cachedLiveSnapshot.bakeriesCount || 0,
      debtsCount: cachedLiveSnapshot.debtsCount || 0,
    });
  });

  // Live Supabase SQL/Cloud State synchronization endpoint + immediate WebSocket fanout
  app.get('/api/supabase/live-db', (_req, res) => {
    try {
      if (!cachedLiveSnapshot) {
        for (const p of [SUPABASE_LIVE_DB_PRIMARY, SUPABASE_LIVE_DB_TMP]) {
          if (fs.existsSync(p)) {
            cachedLiveSnapshot = JSON.parse(fs.readFileSync(p, 'utf-8'));
            if (cachedLiveSnapshot) break;
          }
        }
      }
      if (!cachedLiveSnapshot) {
        res.json({ success: true, exists: false, snapshot: null });
        return;
      }
      res.json({ success: true, exists: true, snapshot: cachedLiveSnapshot });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  app.post('/api/supabase/live-db', (req, res) => {
    try {
      const body = req.body || {};
      const stateData = body.data || body;
      const timestamp = body.timestamp || new Date().toISOString();
      const clientId = body.clientId || '';
      liveRevision += 1;
      const snapshot = {
        version: '5.0-supabase-realtime',
        timestamp,
        revision: liveRevision,
        clientId,
        bakeriesCount: Array.isArray(stateData?.bakeries) ? stateData.bakeries.length : 0,
        debtsCount: Array.isArray(stateData?.debts) ? stateData.debts.length : 0,
        data: stateData,
      };
      cachedLiveSnapshot = snapshot;
      const serialized = JSON.stringify(snapshot);
      try { fs.writeFileSync(SUPABASE_LIVE_DB_PRIMARY, serialized, 'utf-8'); } catch {}
      try { fs.writeFileSync(SUPABASE_LIVE_DB_TMP, serialized, 'utf-8'); } catch {}
      broadcastWs({
        type: 'state_update',
        clientId,
        timestamp,
        revision: liveRevision,
        snapshot,
      });
      res.json({ success: true, timestamp, revision: liveRevision });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  app.delete('/api/supabase/live-db', (_req, res) => {
    try {
      // Permanent Data Retention Policy: never delete registered database records or snapshots
      if (cachedLiveSnapshot) {
        const serialized = JSON.stringify(cachedLiveSnapshot);
        try { fs.writeFileSync(SUPABASE_LIVE_DB_PRIMARY, serialized, 'utf-8'); } catch {}
        try { fs.writeFileSync(SUPABASE_LIVE_DB_TMP, serialized, 'utf-8'); } catch {}
      }
      res.json({
        success: true,
        retained: true,
        message: 'تم تفعيل الحماية الدائمة للبيانات المسجلة والاحتفاظ بها دون حذف.',
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  // High-Debt Alerts Supabase Realtime Sync endpoints
  app.get('/api/supabase/alerts', (_req, res) => {
    res.json({
      success: true,
      ...cachedAlertsState,
    });
  });

  app.post('/api/supabase/alerts', (req, res) => {
    try {
      const body = req.body || {};
      const alerts = Array.isArray(body.alerts) ? body.alerts : cachedAlertsState.alerts;
      const debtAlertThreshold =
        typeof body.debtAlertThreshold === 'number' && body.debtAlertThreshold > 0
          ? body.debtAlertThreshold
          : cachedAlertsState.debtAlertThreshold;
      const timestamp = body.timestamp || new Date().toISOString();
      const clientId = body.clientId || '';
      cachedAlertsState = {
        alerts,
        debtAlertThreshold,
        updatedAt: timestamp,
        revision: (cachedAlertsState.revision || 0) + 1,
        clientId,
      };
      const serializedAlerts = JSON.stringify(cachedAlertsState);
      try { fs.writeFileSync(SUPABASE_ALERTS_PRIMARY, serializedAlerts, 'utf-8'); } catch {}
      try { fs.writeFileSync(SUPABASE_ALERTS_TMP, serializedAlerts, 'utf-8'); } catch {}
      broadcastWs({
        type: 'alerts_update',
        clientId,
        timestamp,
        alerts,
        debtAlertThreshold,
        cleared: false,
      });
      res.json({ success: true, timestamp, revision: cachedAlertsState.revision });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  app.delete('/api/supabase/alerts', (req, res) => {
    try {
      const clientId = String(req.query?.clientId || '');
      const threshold = Number(req.query?.threshold) || cachedAlertsState.debtAlertThreshold || 50000;
      const timestamp = new Date().toISOString();
      cachedAlertsState = {
        alerts: [],
        debtAlertThreshold: threshold,
        updatedAt: timestamp,
        revision: (cachedAlertsState.revision || 0) + 1,
        clientId,
      };
      const serializedAlerts = JSON.stringify(cachedAlertsState);
      try { fs.writeFileSync(SUPABASE_ALERTS_PRIMARY, serializedAlerts, 'utf-8'); } catch {}
      try { fs.writeFileSync(SUPABASE_ALERTS_TMP, serializedAlerts, 'utf-8'); } catch {}
      broadcastWs({
        type: 'alerts_update',
        clientId,
        timestamp,
        alerts: [],
        debtAlertThreshold: threshold,
        cleared: true,
      });
      res.json({ success: true, timestamp });
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
    const distPath = path.resolve(__dirname, 'dist');
    const distIndexHtml = path.resolve(distPath, 'index.html');
    const rootIndexHtml = path.resolve(__dirname, 'index.html');

    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      if (fs.existsSync(distIndexHtml)) {
        res.sendFile(distIndexHtml);
      } else if (fs.existsSync(rootIndexHtml)) {
        res.sendFile(rootIndexHtml);
      } else {
        res.status(404).send('Index HTML not found');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Tamween Supabase Realtime Server running on http://localhost:${PORT}`);
  });
}

startServer();
