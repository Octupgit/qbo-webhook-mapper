import { Router, Request, Response } from 'express';
import * as dataService from '../services/dataService';
import * as qboInvoiceService from '../services/qboInvoiceService';
import { transformPayloadToInvoice } from '../services/transformService';

const router = Router();

// POST /api/invoices/sync/:payloadId - Sync single payload to QBO
router.post('/sync/:payloadId', async (req: Request, res: Response) => {
  try {
    const { payloadId } = req.params;

    // Get the payload
    const payload = await dataService.getPayloadById(payloadId);
    if (!payload) {
      return res.status(404).json({
        success: false,
        error: 'Payload not found',
      });
    }

    // Check if already processed
    if (payload.processed && payload.invoice_id) {
      return res.status(400).json({
        success: false,
        error: 'Payload already synced',
        invoiceId: payload.invoice_id,
      });
    }

    // Get active mapping for this source
    const mapping = await dataService.getActiveMapping(payload.source_id);
    if (!mapping) {
      return res.status(400).json({
        success: false,
        error: 'No active mapping found for this source',
      });
    }

    // Create sync log
    const syncLog = await dataService.createSyncLog(
      payloadId,
      payload.source_id,
      mapping.mapping_id
    );

    // Transform payload to invoice
    const sourcePayload = JSON.parse(payload.raw_payload);
    const transformResult = transformPayloadToInvoice(sourcePayload, mapping);

    if (!transformResult.success) {
      await dataService.updateSyncLog(syncLog.log_id, {
        status: 'failed',
        error_message: transformResult.validationErrors.join('; '),
        request_payload: JSON.stringify(transformResult.transformedInvoice),
        completed_at: new Date(),
      });

      return res.status(400).json({
        success: false,
        error: 'Mapping validation failed',
        validationErrors: transformResult.validationErrors,
        warnings: transformResult.warnings,
      });
    }

    // Update sync log with request payload
    await dataService.updateSyncLog(syncLog.log_id, {
      request_payload: JSON.stringify(transformResult.transformedInvoice),
    });

    // Create invoice in QBO
    const qboResult = await qboInvoiceService.createInvoice(transformResult.transformedInvoice!);

    if (!qboResult.success) {
      await dataService.updateSyncLog(syncLog.log_id, {
        status: 'failed',
        error_message: qboResult.error,
        response_payload: JSON.stringify(qboResult.response),
        completed_at: new Date(),
      });

      return res.status(400).json({
        success: false,
        error: qboResult.error,
      });
    }

    // Update sync log with success
    await dataService.updateSyncLog(syncLog.log_id, {
      status: 'success',
      qbo_invoice_id: qboResult.invoiceId,
      qbo_doc_number: qboResult.docNumber,
      response_payload: JSON.stringify(qboResult.response),
      completed_at: new Date(),
    });

    // Mark payload as processed
    await dataService.markPayloadProcessed(payloadId, qboResult.invoiceId!);

    return res.json({
      success: true,
      data: {
        invoiceId: qboResult.invoiceId,
        docNumber: qboResult.docNumber,
        logId: syncLog.log_id,
      },
    });
  } catch (error) {
    console.error('Sync error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to sync invoice',
    });
  }
});

// POST /api/invoices/sync-batch - Sync multiple payloads
router.post('/sync-batch', async (req: Request, res: Response) => {
  try {
    const { payloadIds } = req.body;

    if (!payloadIds || !Array.isArray(payloadIds) || payloadIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'payloadIds array is required',
      });
    }

    const results = [];

    for (const payloadId of payloadIds) {
      try {
        // Process each payload (simplified - in production use queue)
        const payload = await dataService.getPayloadById(payloadId);
        if (!payload) {
          results.push({ payloadId, success: false, error: 'Not found' });
          continue;
        }

        if (payload.processed) {
          results.push({ payloadId, success: false, error: 'Already processed' });
          continue;
        }

        const mapping = await dataService.getActiveMapping(payload.source_id);
        if (!mapping) {
          results.push({ payloadId, success: false, error: 'No active mapping' });
          continue;
        }

        const sourcePayload = JSON.parse(payload.raw_payload);
        const transformResult = transformPayloadToInvoice(sourcePayload, mapping);

        if (!transformResult.success) {
          results.push({
            payloadId,
            success: false,
            error: transformResult.validationErrors.join('; '),
          });
          continue;
        }

        const qboResult = await qboInvoiceService.createInvoice(transformResult.transformedInvoice!);

        if (qboResult.success) {
          await dataService.markPayloadProcessed(payloadId, qboResult.invoiceId!);
          results.push({
            payloadId,
            success: true,
            invoiceId: qboResult.invoiceId,
          });
        } else {
          results.push({
            payloadId,
            success: false,
            error: qboResult.error,
          });
        }
      } catch (err) {
        results.push({
          payloadId,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return res.json({
      success: true,
      data: {
        total: payloadIds.length,
        successful: successCount,
        failed: payloadIds.length - successCount,
        results,
      },
    });
  } catch (error) {
    console.error('Batch sync error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to sync invoices',
    });
  }
});

// GET /api/invoices/:invoiceId - Get QBO invoice status
router.get('/:invoiceId', async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;

    const result = await qboInvoiceService.getInvoice(invoiceId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    return res.json({
      success: true,
      data: result.invoice,
    });
  } catch (error) {
    console.error('Get invoice error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get invoice',
    });
  }
});

// GET /api/invoices/qbo/customers - Get QBO customers
router.get('/qbo/customers', async (req: Request, res: Response) => {
  try {
    const search = req.query.search as string;
    const result = await qboInvoiceService.getCustomers(search);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    return res.json({
      success: true,
      data: result.customers,
    });
  } catch (error) {
    console.error('Get customers error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get customers',
    });
  }
});

// GET /api/invoices/qbo/items - Get QBO items
router.get('/qbo/items', async (req: Request, res: Response) => {
  try {
    const search = req.query.search as string;
    const result = await qboInvoiceService.getItems(search);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    return res.json({
      success: true,
      data: result.items,
    });
  } catch (error) {
    console.error('Get items error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get items',
    });
  }
});

export default router;
