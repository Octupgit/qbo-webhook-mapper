/**
 * Admin Organization Routes
 *
 * CRUD operations for managing organizations (multi-tenant).
 */

import { Router, Request, Response } from 'express';
import {
  getOrganizations,
  getOrganizationById,
  getOrganizationBySlug,
  createOrganization,
  updateOrganization,
  getSources,
  getSyncLogs,
  getActiveToken,
} from '../../services/dataService';

const router = Router();

/**
 * GET /api/admin/organizations
 * List all organizations
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const organizations = await getOrganizations();
    return res.json({
      success: true,
      data: organizations,
    });
  } catch (error) {
    console.error('List organizations error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to list organizations',
    });
  }
});

/**
 * POST /api/admin/organizations
 * Create a new organization
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, slug, plan_tier = 'free', settings } = req.body;

    // Validate required fields
    if (!name || !slug) {
      return res.status(400).json({
        success: false,
        error: 'Name and slug are required',
      });
    }

    // Validate slug format
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && !/^[a-z0-9]+$/.test(slug)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid slug format. Use lowercase letters, numbers, and hyphens only.',
      });
    }

    // Check if slug already exists
    const existing = await getOrganizationBySlug(slug);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'An organization with this slug already exists',
      });
    }

    // Create organization
    const organization = await createOrganization(
      name,
      slug,
      plan_tier,
      settings, // Pass settings object directly
      req.admin?.user_id // created_by (if admin auth is present)
    );

    return res.status(201).json({
      success: true,
      data: organization,
    });
  } catch (error) {
    console.error('Create organization error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create organization',
    });
  }
});

/**
 * GET /api/admin/organizations/:orgId
 * Get organization by ID
 */
router.get('/:orgId', async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;

    const organization = await getOrganizationById(orgId);
    if (!organization) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found',
      });
    }

    return res.json({
      success: true,
      data: organization,
    });
  } catch (error) {
    console.error('Get organization error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get organization',
    });
  }
});

/**
 * PUT /api/admin/organizations/:orgId
 * Update organization
 */
router.put('/:orgId', async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const updates = req.body;

    const organization = await getOrganizationById(orgId);
    if (!organization) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found',
      });
    }

    const updated = await updateOrganization(orgId, updates);

    return res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('Update organization error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update organization',
    });
  }
});

/**
 * GET /api/admin/organizations/:orgId/stats
 * Get organization statistics
 */
router.get('/:orgId/stats', async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;

    const organization = await getOrganizationById(orgId);
    if (!organization) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found',
      });
    }

    // Get sources count
    const sources = await getSources(orgId);
    const sourceCount = sources.length;

    // Get QBO connection status
    const token = await getActiveToken(orgId);
    const qboConnected = !!token;

    // Get sync logs for stats (last 24 hours)
    const logs = await getSyncLogs(orgId, 1000);
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentLogs = logs.filter(l => new Date(l.created_at) > last24h);

    const syncStats = {
      total: recentLogs.length,
      success: recentLogs.filter(l => l.status === 'success').length,
      failed: recentLogs.filter(l => l.status === 'failed').length,
      pending: recentLogs.filter(l => l.status === 'pending').length,
    };

    // Plan limits (simplified)
    const planLimits = {
      free: { maxSources: 2, maxPayloadsPerDay: 100 },
      starter: { maxSources: 5, maxPayloadsPerDay: 500 },
      professional: { maxSources: 20, maxPayloadsPerDay: 5000 },
      enterprise: { maxSources: 100, maxPayloadsPerDay: 50000 },
    };

    const limits = planLimits[organization.plan_tier as keyof typeof planLimits] || planLimits.free;

    return res.json({
      success: true,
      data: {
        sourceCount,
        qboConnected,
        syncStats,
        planLimits: {
          ...limits,
          sourcesUsed: sourceCount,
        },
      },
    });
  } catch (error) {
    console.error('Get organization stats error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get organization statistics',
    });
  }
});

export default router;
