// Immediate startup logging for Cloud Run debugging
console.log('[Startup] Process starting...');
console.log('[Startup] NODE_ENV:', process.env.NODE_ENV);
console.log('[Startup] PORT:', process.env.PORT);

import express from 'express';
import cors from 'cors';
import path from 'path';
import config from './config';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import {
  standardRateLimiter,
  proxyRateLimiter,
  authRateLimiter,
  webhookRateLimiter,
} from './middleware/rateLimit';
import { logEnvWarnings } from './utils/envCheck';

console.log('[Startup] All imports loaded successfully');

// =============================================================================
// GLOBAL ERROR HANDLERS
// =============================================================================

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  console.error('Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// =============================================================================
// EXPRESS APPLICATION
// =============================================================================

const app = express();

// CORS configuration - whitelist allowed origins
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
  'http://localhost:5173',
  'http://localhost:3000',
];
// In production, add the deployed frontend URL
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

// Log allowed origins on startup for debugging
console.log('[CORS] Allowed origins:', allowedOrigins);
console.log('[CORS] FRONTEND_URL env:', process.env.FRONTEND_URL);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    // Check exact match first
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Allow any Cloud Run URL from the same project (*.run.app)
    // This handles the dynamic URL format from Cloud Run
    if (origin.endsWith('.run.app') && origin.includes('qbo-webhook-mapper-frontend')) {
      console.log('[CORS] Allowing Cloud Run frontend origin:', origin);
      return callback(null, true);
    }

    // In development, allow any origin
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    console.error('[CORS] Rejected origin:', origin, 'Allowed:', allowedOrigins);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files in production
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendPath));
}

// Health check endpoint (required for Cloud Run)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    // In production, serve the frontend or redirect
    return res.redirect('/api');
  }
  res.json({ message: 'QBO Webhook Mapper API', status: 'running' });
});

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// =============================================================================
// RATE LIMITING
// =============================================================================

// Auth endpoints - moderate rate limiting (20 requests per 15 minutes)
app.use('/api/admin/auth/login', authRateLimiter);

// Proxy API - per API key rate limiting (60 requests per minute)
app.use('/api/v1/org/:slug/proxy', proxyRateLimiter);

// Webhook endpoints - generous rate limiting (300 requests per minute)
app.use('/api/v1/webhook', webhookRateLimiter);

// Standard rate limiting for all other API routes (100 requests per 15 minutes)
app.use('/api', standardRateLimiter);

// API Routes
app.use('/api', routes);

// Serve React app for non-API routes in production
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../../frontend/dist');

  // Catch-all for SPA routing - serve index.html for any non-API, non-static routes
  app.get('*', (req, res, next) => {
    // Skip API routes and static file requests with extensions
    if (req.path.startsWith('/api') || req.path.includes('.')) {
      return next();
    }
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// Error handling - only for API routes
app.use('/api', notFoundHandler);
app.use(errorHandler);

// Start server - bind to 0.0.0.0 for Cloud Run compatibility
const HOST = '0.0.0.0';
const PORT = config.port;

console.log(`[Startup] Attempting to start server...`);
console.log(`[Startup] Config port: ${PORT}, Host: ${HOST}`);

try {
  const server = app.listen(PORT, HOST, () => {
    console.log(`[Startup] Server is now listening on ${HOST}:${PORT}`);
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║       QBO Webhook Mapper API Server                       ║
╠═══════════════════════════════════════════════════════════╣
║  Port:        ${PORT}                                       ║
║  Host:        ${HOST}                                     ║
║  Environment: ${config.nodeEnv.padEnd(12)}                        ║
║  BigQuery:    ${config.bigquery.projectId}/${config.bigquery.dataset.substring(0, 10)}...       ║
║  QBO Env:     ${config.qbo.environment.padEnd(12)}                        ║
╚═══════════════════════════════════════════════════════════╝
    `);

    // Log environment configuration warnings
    logEnvWarnings();
  });

  server.on('error', (err: Error) => {
    console.error('[Startup] Server error:', err);
    process.exit(1);
  });
} catch (err) {
  console.error('[Startup] Failed to start server:', err);
  process.exit(1);
}

export default app;
