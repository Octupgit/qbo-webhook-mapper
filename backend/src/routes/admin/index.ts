/**
 * Admin Routes Index
 *
 * Combines all admin routes under /api/admin
 */

import { Router } from 'express';
import authRouter from './auth';
import organizationsRouter from './organizations';
import templatesRouter from './templates';
import overridesRouter from './overrides';
import { optionalAdminAuth } from '../../middleware/adminAuth';

const router = Router();

// Auth routes (no auth required)
router.use('/auth', authRouter);

// Organization routes (optional auth for now - can be tightened later)
router.use('/organizations', optionalAdminAuth, organizationsRouter);

// Global template routes
router.use('/templates', optionalAdminAuth, templatesRouter);

// Client override routes (includes effective-mapping, payloads, logs)
// These are mounted at root because some paths start with /organizations/:orgId
router.use('/', optionalAdminAuth, overridesRouter);

export default router;
