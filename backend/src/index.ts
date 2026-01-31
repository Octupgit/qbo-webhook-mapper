import express from 'express';
import cors from 'cors';
import path from 'path';
import config from './config';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

const app = express();

// Middleware
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
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

// API Routes
app.use('/api', routes);

// Serve React app for non-API routes in production
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../../frontend/dist');
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// Error handling
app.use(notFoundHandler);
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
