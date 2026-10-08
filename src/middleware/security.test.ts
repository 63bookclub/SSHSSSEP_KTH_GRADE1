import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import express from 'express';
import { setupSecurityMiddleware, getCorsOptions } from './security.ts';

describe('Security Middleware Tests', () => {
  const originalEnv = process.env.ALLOWED_ORIGINS;

  beforeEach(() => {
    delete process.env.ALLOWED_ORIGINS;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ALLOWED_ORIGINS = originalEnv;
    } else {
      delete process.env.ALLOWED_ORIGINS;
    }
  });

  it('should return default CORS options when ALLOWED_ORIGINS is not set', () => {
    const options = getCorsOptions();
    expect(options.origin).toBe(true);
    expect(options.credentials).toBe(true);
  });

  it('should validate allowed origins when ALLOWED_ORIGINS env var is provided', () => {
    process.env.ALLOWED_ORIGINS = 'https://example.com, https://app.example.com';
    const options = getCorsOptions();

    expect(typeof options.origin).toBe('function');

    if (typeof options.origin === 'function') {
      let allowed: boolean | undefined;
      let err: Error | null = null;

      options.origin('https://example.com', (e, a) => {
        err = e;
        allowed = a as boolean;
      });
      expect(err).toBeNull();
      expect(allowed).toBe(true);

      options.origin('https://disallowed.com', (e, a) => {
        err = e;
        allowed = a as boolean;
      });
      expect(err).toBeInstanceOf(Error);
    }
  });

  it('should attach helmet security headers to responses', async () => {
    const app = express();
    setupSecurityMiddleware(app);
    app.get('/test', (_req, res) => {
      res.send('ok');
    });

    const server = app.listen(0);
    const address = server.address() as any;
    const port = address.port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/test`);
      expect(res.status).toBe(200);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
      expect(res.headers.get('content-security-policy')).toBeDefined();
    } finally {
      server.close();
    }
  });
});
