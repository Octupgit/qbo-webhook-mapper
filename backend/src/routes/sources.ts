import { Router, Request, Response } from 'express';
import {
  legacyGetSources,
  legacyGetSourceById,
  legacyCreateSource,
  legacyGetPayloads,
  legacyGetLatestPayload,
  updateSource,
  regenerateApiKey,
  DEFAULT_ORGANIZATION_ID,
} from '../services/dataService';

const router = Router();

// GET /api/sources - List all sources
router.get('/', async (req: Request, res: Response) => {
  try {
    const sources = await legacyGetSources();

    // Hide API keys in list view
    const safeSources = sources.map((s) => ({
      ...s,
      api_key: s.api_key.substring(0, 8) + '...',
    }));

    return res.json({
      success: true,
      data: safeSources,
    });
  } catch (error) {
    console.error('Get sources error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get sources',
    });
  }
});

// GET /api/sources/:sourceId - Get source details
router.get('/:sourceId', async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;
    const source = await legacyGetSourceById(sourceId);

    if (!source) {
      return res.status(404).json({
        success: false,
        error: 'Source not found',
      });
    }

    return res.json({
      success: true,
      data: source,
    });
  } catch (error) {
    console.error('Get source error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get source',
    });
  }
});

// POST /api/sources - Create new source
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description, source_type } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Name is required',
      });
    }

    const source = await legacyCreateSource(name, description, source_type);

    return res.status(201).json({
      success: true,
      data: source,
      message: 'Source created. Save the API key - it will not be shown again.',
    });
  } catch (error) {
    console.error('Create source error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create source',
    });
  }
});

// PUT /api/sources/:sourceId - Update source
router.put('/:sourceId', async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;
    const { name, description, is_active } = req.body;

    const source = await legacyGetSourceById(sourceId);
    if (!source) {
      return res.status(404).json({
        success: false,
        error: 'Source not found',
      });
    }

    await updateSource(DEFAULT_ORGANIZATION_ID, sourceId, { name, description, is_active });

    return res.json({
      success: true,
      message: 'Source updated',
    });
  } catch (error) {
    console.error('Update source error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update source',
    });
  }
});

// DELETE /api/sources/:sourceId - Deactivate source
router.delete('/:sourceId', async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;

    const source = await legacyGetSourceById(sourceId);
    if (!source) {
      return res.status(404).json({
        success: false,
        error: 'Source not found',
      });
    }

    await updateSource(DEFAULT_ORGANIZATION_ID, sourceId, { is_active: false });

    return res.json({
      success: true,
      message: 'Source deactivated',
    });
  } catch (error) {
    console.error('Delete source error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to deactivate source',
    });
  }
});

// POST /api/sources/:sourceId/regenerate-key - Regenerate API key
router.post('/:sourceId/regenerate-key', async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;

    const source = await legacyGetSourceById(sourceId);
    if (!source) {
      return res.status(404).json({
        success: false,
        error: 'Source not found',
      });
    }

    const newApiKey = await regenerateApiKey(DEFAULT_ORGANIZATION_ID, sourceId);

    return res.json({
      success: true,
      data: { api_key: newApiKey },
      message: 'API key regenerated. Save the new key - it will not be shown again.',
    });
  } catch (error) {
    console.error('Regenerate key error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to regenerate API key',
    });
  }
});

// GET /api/sources/:sourceId/payloads - List payloads for source
router.get('/:sourceId/payloads', async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    const source = await legacyGetSourceById(sourceId);
    if (!source) {
      return res.status(404).json({
        success: false,
        error: 'Source not found',
      });
    }

    const payloads = await legacyGetPayloads(sourceId, limit);

    // Parse raw_payload JSON for response with error handling
    const parsedPayloads = payloads.map((p) => {
      let rawPayload = null;
      let headers = null;

      try {
        rawPayload = JSON.parse(p.raw_payload);
      } catch {
        rawPayload = p.raw_payload; // Return as-is if not valid JSON
      }

      if (p.headers) {
        try {
          headers = JSON.parse(p.headers);
        } catch {
          headers = p.headers; // Return as-is if not valid JSON
        }
      }

      return {
        ...p,
        raw_payload: rawPayload,
        headers,
      };
    });

    return res.json({
      success: true,
      data: parsedPayloads,
    });
  } catch (error) {
    console.error('Get payloads error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get payloads',
    });
  }
});

// GET /api/sources/:sourceId/payloads/sample - Get latest payload as sample
router.get('/:sourceId/payloads/sample', async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;

    const payload = await legacyGetLatestPayload(sourceId);

    if (!payload) {
      return res.status(404).json({
        success: false,
        error: 'No payloads found for this source',
      });
    }

    let parsedPayload = null;
    try {
      parsedPayload = JSON.parse(payload.raw_payload);
    } catch {
      parsedPayload = payload.raw_payload; // Return as-is if not valid JSON
    }

    return res.json({
      success: true,
      data: {
        payload_id: payload.payload_id,
        received_at: payload.received_at,
        payload: parsedPayload,
      },
    });
  } catch (error) {
    console.error('Get sample error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get sample payload',
    });
  }
});

export default router;
