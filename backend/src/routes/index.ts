import { Router } from 'express';
import webhooksRouter from './webhooks';
import sourcesRouter from './sources';
import mappingsRouter from './mappings';
import oauthRouter from './oauth';
import invoicesRouter from './invoices';
import logsRouter from './logs';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'QBO Webhook Mapper API is running',
    timestamp: new Date().toISOString(),
  });
});

// Mount routes
router.use('/webhooks', webhooksRouter);
router.use('/sources', sourcesRouter);
router.use('/mappings', mappingsRouter);
router.use('/oauth', oauthRouter);
router.use('/invoices', invoicesRouter);
router.use('/logs', logsRouter);

export default router;
