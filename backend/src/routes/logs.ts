import { Router, Request, Response } from 'express';
import * as dataService from '../services/dataService';

const router = Router();

// GET /api/logs - List all sync logs
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const sourceId = req.query.sourceId as string;

    const logs = await dataService.getSyncLogs(limit, sourceId);

    return res.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    console.error('Get logs error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get logs',
    });
  }
});

// GET /api/logs/:logId - Get log details
router.get('/:logId', async (req: Request, res: Response) => {
  try {
    const { logId } = req.params;

    const log = await dataService.getSyncLogById(logId);

    if (!log) {
      return res.status(404).json({
        success: false,
        error: 'Log not found',
      });
    }

    // Parse JSON fields
    const parsedLog = {
      ...log,
      request_payload: log.request_payload ? JSON.parse(log.request_payload) : null,
      response_payload: log.response_payload ? JSON.parse(log.response_payload) : null,
    };

    return res.json({
      success: true,
      data: parsedLog,
    });
  } catch (error) {
    console.error('Get log error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get log',
    });
  }
});

// POST /api/logs/:logId/retry - Retry failed sync
router.post('/:logId/retry', async (req: Request, res: Response) => {
  try {
    const { logId } = req.params;

    const log = await dataService.getSyncLogById(logId);

    if (!log) {
      return res.status(404).json({
        success: false,
        error: 'Log not found',
      });
    }

    if (log.status === 'success') {
      return res.status(400).json({
        success: false,
        error: 'Cannot retry a successful sync',
      });
    }

    // Reset the payload's processed status
    const payload = await dataService.getPayloadById(log.payload_id);
    if (payload) {
      // Note: In a real implementation, you'd want a proper "reset" function
      // For now, we'll just redirect to the sync endpoint
      return res.json({
        success: true,
        message: 'Please use POST /api/invoices/sync/:payloadId to retry',
        payloadId: log.payload_id,
      });
    }

    return res.status(404).json({
      success: false,
      error: 'Original payload not found',
    });
  } catch (error) {
    console.error('Retry error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retry sync',
    });
  }
});

export default router;
