import helmet from 'helmet';
import cors, { CorsOptions } from 'cors';
import { Express } from 'express';

export function getCorsOptions(): CorsOptions {
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;

  if (allowedOriginsEnv && allowedOriginsEnv.trim().length > 0) {
    const allowedOrigins = allowedOriginsEnv.split(',').map((o) => o.trim()).filter(Boolean);
    return {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
          callback(null, true);
        } else {
          callback(new Error(`Not allowed by CORS: ${origin}`));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    };
  }

  // Default CORS behavior: allow all origins in non-production or same-origin/all if unspecified
  return {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  };
}

export function setupSecurityMiddleware(app: Express): void {
  // Helmet security headers with CSP configured to allow local assets & 3Dmol scripts
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'blob:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          connectSrc: ["'self'", 'https:', 'http:', 'ws:', 'wss:'],
          workerSrc: ["'self'", 'blob:'],
          objectSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  // CORS middleware
  app.use(cors(getCorsOptions()));
}
