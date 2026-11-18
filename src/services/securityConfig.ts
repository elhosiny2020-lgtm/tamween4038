import helmet from 'helmet';
import cors, { type CorsOptions } from 'cors';

function normalizeOrigin(raw: string | undefined): string {
  if (!raw) return '';
  try {
    const parsed = new URL(raw.trim());
    return `${parsed.protocol}//${parsed.host}`.toLowerCase();
  } catch {
    return '';
  }
}

export function getAllowedOrigins(): Set<string> {
  const allowed = new Set<string>();
  const envLists = [
    process.env.ALLOWED_ORIGINS || '',
    process.env.APP_URL || '',
    process.env.PUBLIC_APP_URL || '',
  ];
  for (const list of envLists) {
    for (const item of list.split(',')) {
      const normalized = normalizeOrigin(item);
      if (normalized) allowed.add(normalized);
    }
  }
  const isProd =
    process.env.NODE_ENV === 'production' || process.env.npm_lifecycle_event === 'start';
  if (!isProd) {
    allowed.add('http://localhost:3000');
    allowed.add('http://127.0.0.1:3000');
  }
  return allowed;
}

export function isAllowedOrigin(origin: string | undefined, requestHost?: string): boolean {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;

  const allowed = getAllowedOrigins();
  if (allowed.has(normalized)) return true;

  // Same-host check for Cloud Run / reverse proxy deployments serving the active origin
  if (requestHost) {
    const cleanHost = String(requestHost).split(',')[0].trim().toLowerCase();
    try {
      const parsed = new URL(normalized);
      if (parsed.host.toLowerCase() === cleanHost) {
        return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && cleanHost.startsWith('localhost'));
      }
    } catch {
      return false;
    }
  }
  return false;
}

export function buildCorsOptionsForRequest(requestHost?: string): CorsOptions {
  return {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin, requestHost)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Tamween-Client-Id',
      'X-Google-OAuth-Token',
    ],
  };
}

export const corsOptions: CorsOptions = buildCorsOptionsForRequest();

function getFrameAncestors(): string[] {
  const custom = (process.env.ALLOWED_FRAME_ANCESTORS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return ["'self'", 'https://aistudio.google.com', 'https://*.googleusercontent.com', ...custom];
}

export const securityHelmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://apis.google.com', 'https://cdnjs.cloudflare.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: [
        "'self'",
        'https://*.supabase.co',
        'wss://*.supabase.co',
        'https://identitytoolkit.googleapis.com',
        'https://securetoken.googleapis.com',
        'https://www.googleapis.com',
        'https://accounts.google.com',
        'https://gmail.googleapis.com',
        'https://firestore.googleapis.com',
        'ws:',
        'wss:',
      ],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'self'", 'https://accounts.google.com', 'https://*.firebaseapp.com'],
      frameAncestors: getFrameAncestors(),
      upgradeInsecureRequests:
        process.env.NODE_ENV === 'production' || process.env.npm_lifecycle_event === 'start' ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  dnsPrefetchControl: { allow: false },
  frameguard: false, // Controlled explicitly via CSP frame-ancestors
  hidePoweredBy: true,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xXssProtection: false,
});

export function applySecurityMiddlewares(app: any) {
  app.use((_req: any, res: any, next: () => void) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    next();
  });
  app.use(securityHelmetMiddleware);
  const dynamicCors = cors((req: any, cb) => {
    const reqHost = String(req.headers['x-forwarded-host'] || req.headers.host || '');
    cb(null, buildCorsOptionsForRequest(reqHost));
  });
  app.use('/api', dynamicCors);
  app.use(dynamicCors);
}

