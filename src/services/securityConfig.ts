import helmet from 'helmet';
import cors from 'cors';

export const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow non-browser requests or any valid origin for iframe preview (.run.app, localhost, etc.)
    if (!origin) {
      return callback(null, true);
    }
    if (
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      origin.includes('.run.app') ||
      origin.includes('webcontainer.io') ||
      origin.includes('stackblitz.io') ||
      process.env.NODE_ENV !== 'production'
    ) {
      return callback(null, true);
    }
    return callback(null, true); // Permissive fallback for preview iframe environments
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-Tamween-Security-Token',
    'X-Tamween-Client-Id',
    'X-Simulated-Attack',
  ],
};

export const securityHelmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://apis.google.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", "https:", "wss:", "ws:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'", "*"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  dnsPrefetchControl: { allow: true },
  frameguard: false, // Disable X-Frame-Options to allow iframe embedding in preview
  hidePoweredBy: true,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
});

export function applySecurityMiddlewares(app: any) {
  app.use(securityHelmetMiddleware);
  app.use('/api', cors(corsOptions));
  app.use(cors(corsOptions));
}
