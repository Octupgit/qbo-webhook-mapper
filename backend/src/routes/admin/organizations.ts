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
  getLatestPayload,
  getClientOverrides,
  createClientOverride,
  updateClientOverride,
  deleteClientOverride,
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

/**
 * GET /api/admin/organizations/:orgId/sources/:sourceId/latest-payload
 * Get the latest webhook payload for a source
 */
router.get('/:orgId/sources/:sourceId/latest-payload', async (req: Request, res: Response) => {
  try {
    const { orgId, sourceId } = req.params;

    const organization = await getOrganizationById(orgId);
    if (!organization) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found',
      });
    }

    const payload = await getLatestPayload(orgId, sourceId);

    if (!payload) {
      return res.json({
        success: true,
        data: null,
        message: 'No payloads received yet for this source',
      });
    }

    return res.json({
      success: true,
      data: {
        payload_id: payload.payload_id,
        raw_payload: payload.raw_payload,
        received_at: payload.received_at,
        processed: payload.processed,
      },
    });
  } catch (error) {
    console.error('Get latest payload error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get latest payload',
    });
  }
});

/**
 * GET /api/admin/organizations/:orgId/mappings
 * Get all client mapping overrides for an organization
 */
router.get('/:orgId/mappings', async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const { sourceId } = req.query;

    const organization = await getOrganizationById(orgId);
    if (!organization) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found',
      });
    }

    const overrides = await getClientOverrides(orgId, sourceId as string | undefined);

    return res.json({
      success: true,
      data: overrides,
    });
  } catch (error) {
    console.error('Get mappings error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get mappings',
    });
  }
});

/**
 * POST /api/admin/organizations/:orgId/mappings
 * Create a new client mapping override
 */
router.post('/:orgId/mappings', async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const { name, field_mappings, source_id, template_id, description, priority, static_values } = req.body;

    const organization = await getOrganizationById(orgId);
    if (!organization) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found',
      });
    }

    if (!name || !field_mappings || !Array.isArray(field_mappings)) {
      return res.status(400).json({
        success: false,
        error: 'Name and field_mappings are required',
      });
    }

    const override = await createClientOverride(
      orgId,
      name,
      field_mappings,
      source_id,
      template_id,
      description,
      priority,
      static_values
    );

    return res.status(201).json({
      success: true,
      data: override,
    });
  } catch (error) {
    console.error('Create mapping error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create mapping',
    });
  }
});

/**
 * PUT /api/admin/organizations/:orgId/mappings/:overrideId
 * Update an existing client mapping override
 */
router.put('/:orgId/mappings/:overrideId', async (req: Request, res: Response) => {
  try {
    const { orgId, overrideId } = req.params;
    const updates = req.body;

    const organization = await getOrganizationById(orgId);
    if (!organization) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found',
      });
    }

    await updateClientOverride(overrideId, updates);

    return res.json({
      success: true,
      message: 'Mapping updated successfully',
    });
  } catch (error) {
    console.error('Update mapping error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update mapping',
    });
  }
});

/**
 * DELETE /api/admin/organizations/:orgId/mappings/:overrideId
 * Delete a client mapping override
 */
router.delete('/:orgId/mappings/:overrideId', async (req: Request, res: Response) => {
  try {
    const { orgId, overrideId } = req.params;

    const organization = await getOrganizationById(orgId);
    if (!organization) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found',
      });
    }

    await deleteClientOverride(overrideId);

    return res.json({
      success: true,
      message: 'Mapping deleted successfully',
    });
  } catch (error) {
    console.error('Delete mapping error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete mapping',
    });
  }
});

export default router;
