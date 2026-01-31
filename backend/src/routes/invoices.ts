import { Router, Request, Response } from 'express';
import {
  getPayloadById,
  legacyGetActiveMapping,
  legacyCreateSyncLog,
  updateSyncLog,
  markPayloadProcessed,
  getOrganizations,
  getActiveMapping,
  createSyncLog,
  DEFAULT_ORGANIZATION_ID,
} from '../services/dataService';
import * as qboInvoiceService from '../services/qboInvoiceService';
import { transformPayloadToInvoice } from '../services/transformService';

const router = Router();

/**
 * Helper: Find payload across all organizations
 */
async function findPayloadAcrossOrgs(payloadId: string): Promise<{
  payload: Awaited<ReturnType<typeof getPayloadById>> | null;
  organizationId: string | null;
}> {
  const orgs = await getOrganizations();
  for (const org of orgs) {
    const payload = await getPayloadById(org.organization_id, payloadId);
    if (payload) {
      return { payload, organizationId: org.organization_id };
    }
  }
  return { payload: null, organizationId: null };
}

// POST /api/invoices/sync/:payloadId - Sync single payload to QBO
router.post('/sync/:payloadId', async (req: Request, res: Response) => {
  try {
    const { payloadId } = req.params;

    // Get the payload (search across all orgs)
    const { payload, organizationId } = await findPayloadAcrossOrgs(payloadId);
    if (!payload || !organizationId) {
      return res.status(404).json({
        success: false,
        error: 'Payload not found',
      });
    }

    console.log(`[Sync] Found payload ${payloadId} in org ${organizationId}`);

    // Check if already processed
    if (payload.processed && payload.invoice_id) {
      return res.status(400).json({
        success: false,
        error: 'Payload already synced',
        invoiceId: payload.invoice_id,
      });
    }

    // Get active mapping for this source (use org-specific lookup)
    const mapping = await getActiveMapping(organizationId, payload.source_id);
    if (!mapping) {
      return res.status(400).json({
        success: false,
        error: 'No active mapping found for this source',
      });
    }

    // Create sync log for the correct organization
    const syncLog = await createSyncLog(
      organizationId,
      payloadId,
      payload.source_id,
      mapping.mapping_id
    );

    // Transform payload to invoice
    const sourcePayload = JSON.parse(payload.raw_payload);
    const transformResult = transformPayloadToInvoice(sourcePayload, mapping);

    if (!transformResult.success) {
      await updateSyncLog(organizationId, syncLog.log_id, {
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
    await updateSyncLog(organizationId, syncLog.log_id, {
      request_payload: JSON.stringify(transformResult.transformedInvoice),
    });

    // Create invoice in QBO (use the payload's organization)
    const qboResult = await qboInvoiceService.createInvoice(transformResult.transformedInvoice!, organizationId);

    if (!qboResult.success) {
      await updateSyncLog(organizationId, syncLog.log_id, {
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
    await updateSyncLog(organizationId, syncLog.log_id, {
      status: 'success',
      qbo_invoice_id: qboResult.invoiceId,
      qbo_doc_number: qboResult.docNumber,
      response_payload: JSON.stringify(qboResult.response),
      completed_at: new Date(),
    });

    // Mark payload as processed
    await markPayloadProcessed(organizationId, payloadId, qboResult.invoiceId!);

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
        // Process each payload - search across all organizations
        const { payload, organizationId } = await findPayloadAcrossOrgs(payloadId);
        if (!payload || !organizationId) {
          results.push({ payloadId, success: false, error: 'Not found' });
          continue;
        }

        if (payload.processed) {
          results.push({ payloadId, success: false, error: 'Already processed' });
          continue;
        }

        const mapping = await getActiveMapping(organizationId, payload.source_id);
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

        const qboResult = await qboInvoiceService.createInvoice(transformResult.transformedInvoice!, organizationId);

        if (qboResult.success) {
          await markPayloadProcessed(organizationId, payloadId, qboResult.invoiceId!);
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

    const result = await qboInvoiceService.getInvoice(invoiceId, DEFAULT_ORGANIZATION_ID);

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
    const result = await qboInvoiceService.getCustomers(search, DEFAULT_ORGANIZATION_ID);

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
    const result = await qboInvoiceService.getItems(search, DEFAULT_ORGANIZATION_ID);

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
