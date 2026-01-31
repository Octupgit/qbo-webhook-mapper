/**
 * Admin Global Template Routes
 *
 * CRUD operations for global mapping templates.
 * Templates define reusable field mappings for source types (Shopify, Stripe, etc.)
 */

import { Router, Request, Response } from 'express';
import {
  createGlobalTemplate,
  getGlobalTemplates,
  getGlobalTemplateById,
  getGlobalTemplatesBySourceType,
  updateGlobalTemplate,
} from '../../services/dataService';

const router = Router();

/**
 * GET /api/admin/templates
 * List all global templates, optionally filtered by source type
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const sourceType = req.query.sourceType as string | undefined;

    let templates;
    if (sourceType) {
      templates = await getGlobalTemplatesBySourceType(sourceType);
    } else {
      templates = await getGlobalTemplates();
    }

    return res.json({
      success: true,
      data: templates,
    });
  } catch (error) {
    console.error('List templates error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to list templates',
    });
  }
});

/**
 * GET /api/admin/templates/:templateId
 * Get a specific template by ID
 */
router.get('/:templateId', async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;

    const template = await getGlobalTemplateById(templateId);
    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    return res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error('Get template error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get template',
    });
  }
});

/**
 * POST /api/admin/templates
 * Create a new global template
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      name,
      source_type,
      description,
      field_mappings,
      static_values,
      priority = 100,
    } = req.body;

    // Validate required fields
    if (!name || !source_type || !field_mappings) {
      return res.status(400).json({
        success: false,
        error: 'Name, source_type, and field_mappings are required',
      });
    }

    // Validate field_mappings is an array
    if (!Array.isArray(field_mappings)) {
      return res.status(400).json({
        success: false,
        error: 'field_mappings must be an array',
      });
    }

    // Validate each field mapping has required fields
    for (const mapping of field_mappings) {
      if (!mapping.qboField) {
        return res.status(400).json({
          success: false,
          error: 'Each field mapping must have a qboField',
        });
      }
      if (!mapping.sourceField && !mapping.staticValue) {
        return res.status(400).json({
          success: false,
          error: 'Each field mapping must have either sourceField or staticValue',
        });
      }
    }

    const template = await createGlobalTemplate(
      name,
      source_type,
      field_mappings,
      description,
      priority,
      static_values
    );

    return res.status(201).json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error('Create template error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create template',
    });
  }
});

/**
 * PUT /api/admin/templates/:templateId
 * Update an existing template
 */
router.put('/:templateId', async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const updates = req.body;

    // Check template exists
    const existing = await getGlobalTemplateById(templateId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    // Validate field_mappings if provided
    if (updates.field_mappings) {
      if (!Array.isArray(updates.field_mappings)) {
        return res.status(400).json({
          success: false,
          error: 'field_mappings must be an array',
        });
      }
    }

    await updateGlobalTemplate(templateId, updates);

    // Fetch updated template
    const updated = await getGlobalTemplateById(templateId);

    return res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('Update template error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update template',
    });
  }
});

/**
 * DELETE /api/admin/templates/:templateId
 * Soft delete a template (set is_active = false)
 */
router.delete('/:templateId', async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;

    const existing = await getGlobalTemplateById(templateId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    await updateGlobalTemplate(templateId, { is_active: false });

    return res.json({
      success: true,
      message: 'Template deactivated',
    });
  } catch (error) {
    console.error('Delete template error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete template',
    });
  }
});

/**
 * POST /api/admin/templates/:templateId/test
 * Test a template against sample payload
 */
router.post('/:templateId/test', async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const { sample_payload } = req.body;

    if (!sample_payload) {
      return res.status(400).json({
        success: false,
        error: 'sample_payload is required',
      });
    }

    const template = await getGlobalTemplateById(templateId);
    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    // Import transform service dynamically
    const { transformPayloadToInvoice } = await import('../../services/transformService');

    // Create a mock mapping configuration from template
    const mockMapping = {
      mapping_id: 'test',
      organization_id: 'test',
      source_id: 'test',
      name: template.name,
      version: template.version,
      is_active: true,
      field_mappings: template.field_mappings,
      static_values: template.static_values,
      created_at: new Date(),
    };

    const result = transformPayloadToInvoice(sample_payload, mockMapping);

    return res.json({
      success: true,
      data: {
        transformedInvoice: result.transformedInvoice,
        validationErrors: result.validationErrors,
        warnings: result.warnings || [],
        isValid: result.success,
      },
    });
  } catch (error) {
    console.error('Test template error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to test template',
    });
  }
});

export default router;
