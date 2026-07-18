import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { connectDB } from './config/db';
import authRoutes from './routes/auth.routes';
import documentRoutes from './routes/document.routes';
import publicRoutes from './routes/public.routes';

const app = express();
const PORT = process.env.PORT || 5000;

// ── Process-level safety nets ─────────────────────────────────────────────────
// These MUST be registered first so that even early startup issues are caught.
// We log the FULL error (not just .message) and deliberately do NOT call
// process.exit() — a single recoverable error must never take down the whole
// server or affect unrelated users/sessions.
process.on('unhandledRejection', (reason: unknown) => {
  console.error('UNHANDLED REJECTION:', reason);
  if (reason instanceof Error && reason.stack) {
    console.error(reason.stack);
  }
});

process.on('uncaughtException', (err: Error) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  if (err.stack) {
    console.error(err.stack);
  }
});

// ── Security headers ───────────────────────────────────────────────────────────
app.use(helmet());

// ── Rate limiting (global: 100 req / 15 min per IP) ──────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
});
app.use(limiter);

// ── CORS — strict origin whitelist ────────────────────────────────────────────
const allowedOrigin = process.env.FRONTEND_URL || 'https://signflow-olive-three.vercel.app';
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow same-origin requests and both production and local dev origins
      const whitelist = [process.env.FRONTEND_URL, 'https://signflow-olive-three.vercel.app'].filter(Boolean);
      if (!origin || whitelist.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS policy: origin ${origin} is not allowed`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// ── Database ──────────────────────────────────────────────────────────────────
connectDB();

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/docs', documentRoutes);
app.use('/api/public', publicRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// ── Multer error handler ───────────────────────────────────────────────────────
// Multer runs as middleware, so its errors are NOT caught by a route handler's
// try/catch. Handle them here (before the generic error middleware) so a bad
// upload never reaches the process level.
app.use(
  (err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof multer.MulterError) {
      console.error('[signflow] Multer error:', err.message);
      const message =
        err.code === 'LIMIT_FILE_SIZE' ? 'File is too large.' : err.message || 'File upload error';
      res.status(400).json({ message });
      return;
    }
    next(err);
  }
);

// ── Global Express error-handling middleware (safety net) ──────────────────────
// Registered AFTER all routes. Guarantees every thrown error ends in a clean
// JSON response and never escapes to crash the server.
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('[signflow] Express error middleware:', err);

    // If a response was already started, we cannot safely send another one.
    if (res.headersSent) {
      console.error('[signflow] Headers already sent — could not send error response.');
      return;
    }

    const status = err?.status || err?.statusCode || 500;
    let message = err?.message || 'Internal server error';
    if (status === 500) message = 'Internal server error';
    res.status(status).json({ message });
  }
);

// ── Start server ──────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`[signflow] Server running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[signflow] SIGTERM received — shutting down gracefully');
  server.close(() => process.exit(0));
});
