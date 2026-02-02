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

// CORS configuration - allow all origins with Authorization header
app.use(cors({
  origin: true, // Reflect origin
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files in production
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendPath));
}

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

// Start server
app.listen(config.port, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║       QBO Webhook Mapper API Server                       ║
╠═══════════════════════════════════════════════════════════╣
║  Port:        ${config.port}                                       ║
║  Environment: ${config.nodeEnv.padEnd(12)}                        ║
║  BigQuery:    ${config.bigquery.projectId}/${config.bigquery.dataset.substring(0, 10)}...       ║
║  QBO Env:     ${config.qbo.environment.padEnd(12)}                        ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;
