import { Router, Request, Response } from 'express';
import {
  legacyGetSourceById,
  legacyGetMappings,
  createMapping,
  getMappingById,
  updateMapping,
  DEFAULT_ORGANIZATION_ID,
} from '../services/dataService';
import {
  transformPayloadToInvoice,
  getQBOInvoiceFields,
  getAvailableTransformations,
  extractJsonPaths,
} from '../services/transformService';

const router = Router();

// GET /api/sources/:sourceId/mappings - List mappings for source
router.get('/sources/:sourceId/mappings', async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;

    const source = await legacyGetSourceById(sourceId);
    if (!source) {
      return res.status(404).json({
        success: false,
        error: 'Source not found',
      });
    }

    const mappings = await legacyGetMappings(sourceId);

    return res.json({
      success: true,
      data: mappings,
    });
  } catch (error) {
    console.error('Get mappings error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get mappings',
    });
  }
});

// POST /api/sources/:sourceId/mappings - Create new mapping
router.post('/sources/:sourceId/mappings', async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;
    const { name, description, field_mappings, static_values } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Name is required',
      });
    }

    if (!field_mappings || !Array.isArray(field_mappings)) {
      return res.status(400).json({
        success: false,
        error: 'field_mappings array is required',
      });
    }

    const source = await legacyGetSourceById(sourceId);
    if (!source) {
      return res.status(404).json({
        success: false,
        error: 'Source not found',
      });
    }

    const mapping = await createMapping(
      DEFAULT_ORGANIZATION_ID,
      sourceId,
      name,
      field_mappings,
      static_values,
      description
    );

    return res.status(201).json({
      success: true,
      data: mapping,
    });
  } catch (error) {
    console.error('Create mapping error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create mapping',
    });
  }
});

// GET /api/mappings/:mappingId - Get mapping details
router.get('/:mappingId', async (req: Request, res: Response) => {
  try {
    const { mappingId } = req.params;

    const mapping = await getMappingById(DEFAULT_ORGANIZATION_ID, mappingId);

    if (!mapping) {
      return res.status(404).json({
        success: false,
        error: 'Mapping not found',
      });
    }

    return res.json({
      success: true,
      data: mapping,
    });
  } catch (error) {
    console.error('Get mapping error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get mapping',
    });
  }
});

// PUT /api/mappings/:mappingId - Update mapping
router.put('/:mappingId', async (req: Request, res: Response) => {
  try {
    const { mappingId } = req.params;
    const { name, description, field_mappings, static_values, is_active } = req.body;

    const mapping = await getMappingById(DEFAULT_ORGANIZATION_ID, mappingId);
    if (!mapping) {
      return res.status(404).json({
        success: false,
        error: 'Mapping not found',
      });
    }

    await updateMapping(DEFAULT_ORGANIZATION_ID, mappingId, {
      name,
      description,
      field_mappings,
      static_values,
      is_active,
    });

    return res.json({
      success: true,
      message: 'Mapping updated',
    });
  } catch (error) {
    console.error('Update mapping error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update mapping',
    });
  }
});

// DELETE /api/mappings/:mappingId - Delete mapping
router.delete('/:mappingId', async (req: Request, res: Response) => {
  try {
    const { mappingId } = req.params;

    const mapping = await getMappingById(DEFAULT_ORGANIZATION_ID, mappingId);
    if (!mapping) {
      return res.status(404).json({
        success: false,
        error: 'Mapping not found',
      });
    }

    await updateMapping(DEFAULT_ORGANIZATION_ID, mappingId, { is_active: false });

    return res.json({
      success: true,
      message: 'Mapping deleted',
    });
  } catch (error) {
    console.error('Delete mapping error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete mapping',
    });
  }
});

// POST /api/mappings/:mappingId/test - Test mapping with sample payload
router.post('/:mappingId/test', async (req: Request, res: Response) => {
  try {
    const { mappingId } = req.params;
    const { samplePayload } = req.body;

    if (!samplePayload) {
      return res.status(400).json({
        success: false,
        error: 'samplePayload is required',
      });
    }

    const mapping = await getMappingById(DEFAULT_ORGANIZATION_ID, mappingId);
    if (!mapping) {
      return res.status(404).json({
        success: false,
        error: 'Mapping not found',
      });
    }

    const result = transformPayloadToInvoice(samplePayload, mapping);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Test mapping error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to test mapping',
    });
  }
});

// POST /api/mappings/:mappingId/activate - Set as active mapping for source
router.post('/:mappingId/activate', async (req: Request, res: Response) => {
  try {
    const { mappingId } = req.params;

    const mapping = await getMappingById(DEFAULT_ORGANIZATION_ID, mappingId);
    if (!mapping) {
      return res.status(404).json({
        success: false,
        error: 'Mapping not found',
      });
    }

    // Deactivate other mappings for this source
    const otherMappings = await legacyGetMappings(mapping.source_id);
    for (const m of otherMappings) {
      if (m.mapping_id !== mappingId && m.is_active) {
        await updateMapping(DEFAULT_ORGANIZATION_ID, m.mapping_id, { is_active: false });
      }
    }

    // Activate this mapping
    await updateMapping(DEFAULT_ORGANIZATION_ID, mappingId, { is_active: true });

    return res.json({
      success: true,
      message: 'Mapping activated',
    });
  } catch (error) {
    console.error('Activate mapping error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to activate mapping',
    });
  }
});

// GET /api/mappings/meta/qbo-fields - Get available QBO invoice fields
router.get('/meta/qbo-fields', (req: Request, res: Response) => {
  const fields = getQBOInvoiceFields();
  return res.json({
    success: true,
    data: fields,
  });
});

// GET /api/mappings/meta/transformations - Get available transformations
router.get('/meta/transformations', (req: Request, res: Response) => {
  const transformations = getAvailableTransformations();
  return res.json({
    success: true,
    data: transformations,
  });
});

// POST /api/mappings/meta/extract-paths - Extract JSON paths from sample
router.post('/meta/extract-paths', (req: Request, res: Response) => {
  const { samplePayload } = req.body;

  if (!samplePayload) {
    return res.status(400).json({
      success: false,
      error: 'samplePayload is required',
    });
  }

  const paths = extractJsonPaths(samplePayload);

  return res.json({
    success: true,
    data: paths,
  });
});

export default router;
