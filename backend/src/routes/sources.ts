import { Router, Request, Response } from 'express';
import * as dataService from '../services/dataService';

const router = Router();

// GET /api/sources - List all sources
router.get('/', async (req: Request, res: Response) => {
  try {
    const sources = await dataService.getSources();

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
    const source = await dataService.getSourceById(sourceId);

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
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Name is required',
      });
    }

    const source = await dataService.createSource(name, description);

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

    const source = await dataService.getSourceById(sourceId);
    if (!source) {
      return res.status(404).json({
        success: false,
        error: 'Source not found',
      });
    }

    await dataService.updateSource(sourceId, { name, description, is_active });

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

    const source = await dataService.getSourceById(sourceId);
    if (!source) {
      return res.status(404).json({
        success: false,
        error: 'Source not found',
      });
    }

    await dataService.updateSource(sourceId, { is_active: false });

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

    const source = await dataService.getSourceById(sourceId);
    if (!source) {
      return res.status(404).json({
        success: false,
        error: 'Source not found',
      });
    }

    const newApiKey = await dataService.regenerateApiKey(sourceId);

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

    const source = await dataService.getSourceById(sourceId);
    if (!source) {
      return res.status(404).json({
        success: false,
        error: 'Source not found',
      });
    }

    const payloads = await dataService.getPayloads(sourceId, limit);

    // Parse raw_payload JSON for response
    const parsedPayloads = payloads.map((p) => ({
      ...p,
      raw_payload: JSON.parse(p.raw_payload),
      headers: p.headers ? JSON.parse(p.headers) : null,
    }));

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

    const payload = await dataService.getLatestPayload(sourceId);

    if (!payload) {
      return res.status(404).json({
        success: false,
        error: 'No payloads found for this source',
      });
    }

    return res.json({
      success: true,
      data: {
        payload_id: payload.payload_id,
        received_at: payload.received_at,
        payload: JSON.parse(payload.raw_payload),
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
