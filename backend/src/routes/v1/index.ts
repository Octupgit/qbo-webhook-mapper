/**
 * V1 API Routes Index
 *
 * Multi-tenant API routes (v1)
 * All routes are scoped by organization via :clientSlug parameter
 */

import { Router } from 'express';
import webhooksRouter from './webhooks';
import connectRouter from './connect';

const router = Router();

// Mount v1 route modules
router.use('/webhook', webhooksRouter);
router.use('/', connectRouter);

export default router;
