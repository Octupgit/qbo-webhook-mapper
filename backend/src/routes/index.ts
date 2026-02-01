import { Router } from 'express';
import webhooksRouter from './webhooks';
import sourcesRouter from './sources';
import mappingsRouter from './mappings';
import oauthRouter from './oauth';
import invoicesRouter from './invoices';
import logsRouter from './logs';

// V1 Multi-Tenant Routes
import v1Router from './v1';

// Admin Routes
import adminRouter from './admin';

// Public Routes (unauthenticated)
import publicRouter from './public';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'QBO Webhook Mapper API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    multiTenant: true,
  });
});

// =============================================================================
// PUBLIC ROUTES (Unauthenticated)
// =============================================================================
// Minimal public endpoints for client-facing features
router.use('/public', publicRouter);

// =============================================================================
// ADMIN ROUTES
// =============================================================================
// Internal admin dashboard routes for managing organizations and templates
router.use('/admin', adminRouter);

// =============================================================================
// V1 MULTI-TENANT ROUTES (NEW)
// =============================================================================
// These routes are scoped by organization using :clientSlug parameter
router.use('/v1', v1Router);

// =============================================================================
// LEGACY ROUTES (Backward Compatible)
// =============================================================================
// These routes use the DEFAULT_ORGANIZATION_ID for backward compatibility
router.use('/webhooks', webhooksRouter);
router.use('/sources', sourcesRouter);
router.use('/mappings', mappingsRouter);
router.use('/oauth', oauthRouter);
router.use('/invoices', invoicesRouter);
router.use('/logs', logsRouter);

export default router;
