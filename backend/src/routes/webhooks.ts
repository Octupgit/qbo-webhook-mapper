import { Router, Request, Response } from 'express';
import * as dataService from '../services/dataService';
import { authenticateWebhook } from '../middleware/auth';

const router = Router();

// POST /api/webhooks/:sourceId - Receive webhook payload
router.post('/:sourceId', authenticateWebhook, async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;

    // Validate source ID matches authenticated source
    if (req.source?.source_id !== sourceId) {
      return res.status(403).json({
        success: false,
        error: 'Source ID does not match API key',
      });
    }

    const payload = req.body;

    if (!payload || Object.keys(payload).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Request body is empty',
      });
    }

    // Extract relevant headers
    const headers: Record<string, string> = {};
    ['content-type', 'user-agent', 'x-forwarded-for', 'x-request-id'].forEach((h) => {
      if (req.headers[h]) {
        headers[h] = req.headers[h] as string;
      }
    });

    // Save payload to BigQuery
    const savedPayload = await dataService.savePayload(sourceId, payload, headers);

    return res.status(200).json({
      success: true,
      payloadId: savedPayload.payload_id,
      message: 'Webhook received successfully',
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process webhook',
    });
  }
});

export default router;
