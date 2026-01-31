/**
 * Admin Client Override Routes
 *
 * CRUD operations for client-specific mapping overrides.
 * Overrides allow organizations to customize global templates for their needs.
 */

import { Router, Request, Response } from 'express';
import {
  createClientOverride,
  getClientOverrides,
  getClientOverrideById,
  getClientOverridesForSource,
  updateClientOverride,
  deleteClientOverride,
  getOrganizationById,
  getOrganizationBySlug,
  getSourceById,
  getGlobalTemplateById,
  getSources,
  getPayloads,
  getLatestPayload,
  getSyncLogs,
} from '../../services/dataService';
import { getEffectiveMapping } from '../../services/mappingMergerService';

const router = Router();

// =============================================================================
// CLIENT MAPPING OVERRIDES
// =============================================================================

/**
 * GET /api/admin/organizations/:orgId/overrides
 * List all overrides for an organization
 */
router.get('/organizations/:orgId/overrides', async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const sourceId = req.query.sourceId as string | undefined;

    // Verify organization exists
    const org = await getOrganizationById(orgId);
    if (!org) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found',
      });
    }

    let overrides;
    if (sourceId) {
      overrides = await getClientOverridesForSource(orgId, sourceId);
    } else {
      overrides = await getClientOverrides(orgId);
    }

    return res.json({
      success: true,
      data: overrides,
    });
  } catch (error) {
    console.error('List overrides error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to list overrides',
    });
  }
});

/**
 * POST /api/admin/organizations/:orgId/overrides
 * Create a new override for an organization
 */
router.post('/organizations/:orgId/overrides', async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const {
      source_id,
      template_id,
      name,
      description,
      field_mappings,
      static_values,
      priority = 50,
    } = req.body;

    // Verify organization exists
    const org = await getOrganizationById(orgId);
    if (!org) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found',
      });
    }

    // Validate required fields
    if (!name || !field_mappings) {
      return res.status(400).json({
        success: false,
        error: 'Name and field_mappings are required',
      });
    }

    // Validate field_mappings is an array
    if (!Array.isArray(field_mappings)) {
      return res.status(400).json({
        success: false,
        error: 'field_mappings must be an array',
      });
    }

    // If source_id provided, verify it exists and belongs to org
    if (source_id) {
      const source = await getSourceById(orgId, source_id);
      if (!source) {
        return res.status(400).json({
          success: false,
          error: 'Source not found or does not belong to this organization',
        });
      }
    }

    // If template_id provided, verify it exists
    if (template_id) {
      const template = await getGlobalTemplateById(template_id);
      if (!template) {
        return res.status(400).json({
          success: false,
          error: 'Template not found',
        });
      }
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
    console.error('Create override error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create override',
    });
  }
});

/**
 * GET /api/admin/overrides/:overrideId
 * Get a specific override by ID
 */
router.get('/overrides/:overrideId', async (req: Request, res: Response) => {
  try {
    const { overrideId } = req.params;

    const override = await getClientOverrideById(overrideId);
    if (!override) {
      return res.status(404).json({
        success: false,
        error: 'Override not found',
      });
    }

    return res.json({
      success: true,
      data: override,
    });
  } catch (error) {
    console.error('Get override error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get override',
    });
  }
});

/**
 * PUT /api/admin/overrides/:overrideId
 * Update an existing override
 */
router.put('/overrides/:overrideId', async (req: Request, res: Response) => {
  try {
    const { overrideId } = req.params;
    const updates = req.body;

    // Check override exists
    const existing = await getClientOverrideById(overrideId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Override not found',
      });
    }

    // Validate field_mappings if provided
    if (updates.field_mappings && !Array.isArray(updates.field_mappings)) {
      return res.status(400).json({
        success: false,
        error: 'field_mappings must be an array',
      });
    }

    await updateClientOverride(overrideId, updates);

    // Fetch updated override
    const updated = await getClientOverrideById(overrideId);

    return res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('Update override error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update override',
    });
  }
});

/**
 * DELETE /api/admin/overrides/:overrideId
 * Delete an override
 */
router.delete('/overrides/:overrideId', async (req: Request, res: Response) => {
  try {
    const { overrideId } = req.params;

    const existing = await getClientOverrideById(overrideId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Override not found',
      });
    }

    await deleteClientOverride(overrideId);

    return res.json({
      success: true,
      message: 'Override deleted',
    });
  } catch (error) {
    console.error('Delete override error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete override',
    });
  }
});

// =============================================================================
// EFFECTIVE MAPPING
// =============================================================================

/**
 * GET /api/admin/organizations/:orgId/sources/:sourceId/effective-mapping
 * Get the merged/effective mapping for a specific source
 */
router.get(
  '/organizations/:orgId/sources/:sourceId/effective-mapping',
  async (req: Request, res: Response) => {
    try {
      const { orgId, sourceId } = req.params;

      // Verify organization exists
      const org = await getOrganizationById(orgId);
      if (!org) {
        return res.status(404).json({
          success: false,
          error: 'Organization not found',
        });
      }

      // Verify source exists
      const source = await getSourceById(orgId, sourceId);
      if (!source) {
        return res.status(404).json({
          success: false,
          error: 'Source not found',
        });
      }

      const effectiveMapping = await getEffectiveMapping(orgId, sourceId);

      return res.json({
        success: true,
        data: effectiveMapping,
      });
    } catch (error) {
      console.error('Get effective mapping error:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get effective mapping',
      });
    }
  }
);

// =============================================================================
// ORGANIZATION SOURCES, PAYLOADS & LOGS
// =============================================================================

/**
 * GET /api/admin/organizations/:orgId/sources
 * List sources for an organization
 */
router.get('/organizations/:orgId/sources', async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;

    const org = await getOrganizationById(orgId);
    if (!org) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found',
      });
    }

    const sources = await getSources(orgId);

    return res.json({
      success: true,
      data: sources,
    });
  } catch (error) {
    console.error('List org sources error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to list sources',
    });
  }
});

/**
 * GET /api/admin/organizations/:orgId/sources/:sourceId/payloads
 * List payloads for a specific source
 */
router.get(
  '/organizations/:orgId/sources/:sourceId/payloads',
  async (req: Request, res: Response) => {
    try {
      const { orgId, sourceId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;

      const org = await getOrganizationById(orgId);
      if (!org) {
        return res.status(404).json({
          success: false,
          error: 'Organization not found',
        });
      }

      const source = await getSourceById(orgId, sourceId);
      if (!source) {
        return res.status(404).json({
          success: false,
          error: 'Source not found',
        });
      }

      const payloads = await getPayloads(orgId, sourceId, limit);

      // Parse raw_payload JSON for each payload
      const parsedPayloads = payloads.map((p) => {
        let parsedPayload = null;
        try {
          parsedPayload = p.raw_payload ? JSON.parse(p.raw_payload) : null;
        } catch {
          parsedPayload = p.raw_payload; // Return as-is if not valid JSON
        }
        return {
          ...p,
          parsed_payload: parsedPayload,
        };
      });

      return res.json({
        success: true,
        data: parsedPayloads,
      });
    } catch (error) {
      console.error('List payloads error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to list payloads',
      });
    }
  }
);

/**
 * GET /api/admin/organizations/:orgId/sources/:sourceId/latest-payload
 * Get the most recent payload for a source (useful for Visual Mapper)
 */
router.get(
  '/organizations/:orgId/sources/:sourceId/latest-payload',
  async (req: Request, res: Response) => {
    try {
      const { orgId, sourceId } = req.params;

      const source = await getSourceById(orgId, sourceId);
      if (!source) {
        return res.status(404).json({
          success: false,
          error: 'Source not found',
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

      let parsedPayload = null;
      try {
        parsedPayload = payload.raw_payload ? JSON.parse(payload.raw_payload) : null;
      } catch {
        parsedPayload = payload.raw_payload;
      }

      return res.json({
        success: true,
        data: {
          ...payload,
          parsed_payload: parsedPayload,
        },
      });
    } catch (error) {
      console.error('Get latest payload error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get latest payload',
      });
    }
  }
);

/**
 * GET /api/admin/organizations/:orgId/logs
 * List sync logs for an organization (supports orgId or slug)
 */
router.get('/organizations/:orgId/logs', async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    const sourceId = req.query.sourceId as string | undefined;
    const status = req.query.status as string | undefined;

    // Try to find org by ID first, then by slug
    let org = await getOrganizationById(orgId);
    if (!org) {
      org = await getOrganizationBySlug(orgId);
    }
    if (!org) {
      console.log(`[Admin Logs] Organization not found: ${orgId}`);
      return res.status(404).json({
        success: false,
        error: 'Organization not found',
      });
    }

    console.log(`[Admin Logs] Fetching logs for org ${org.organization_id} (${org.slug})`);
    let logs = await getSyncLogs(org.organization_id, limit, sourceId);

    // Filter by status if provided
    if (status) {
      logs = logs.filter((l) => l.status === status);
    }

    // Parse JSON payloads safely
    const parsedLogs = logs.map((log) => {
      let requestPayload = null;
      let responsePayload = null;

      try {
        requestPayload = log.request_payload ? JSON.parse(log.request_payload) : null;
      } catch {
        requestPayload = log.request_payload;
      }

      try {
        responsePayload = log.response_payload ? JSON.parse(log.response_payload) : null;
      } catch {
        responsePayload = log.response_payload;
      }

      return {
        ...log,
        request_payload: requestPayload,
        response_payload: responsePayload,
      };
    });

    return res.json({
      success: true,
      data: parsedLogs,
    });
  } catch (error) {
    console.error('List logs error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to list logs',
    });
  }
});

export default router;
