/**
 * V1 Webhook Routes
 *
 * Multi-tenant webhook endpoints for receiving and processing webhooks
 * from external sources (Shopify, WooCommerce, Stripe, etc.)
 *
 * Routes:
 * POST /api/v1/webhook/:clientSlug - Universal webhook endpoint
 * POST /api/v1/webhook/:clientSlug/:sourceId - Source-specific webhook
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { tenantContext } from '../../middleware/tenantContext';
import {
  savePayload,
  getSourceById,
  getSourceByApiKey,
  getSources,
  createSyncLog,
  updateSyncLog,
  markPayloadProcessed,
} from '../../services/dataService';
import { getEffectiveMapping } from '../../services/mappingMergerService';
import { transformPayloadToInvoice } from '../../services/transformService';
import * as qboInvoiceService from '../../services/qboInvoiceService';
import { getValidToken } from '../../services/multiTenantAuthService';

const router = Router();

/**
 * Validate API key from request
 */
function extractApiKey(req: Request): string | null {
  // Try multiple locations for API key
  return (
    (req.headers['x-api-key'] as string) ||
    (req.headers['authorization']?.replace('Bearer ', '')) ||
    (req.query.api_key as string) ||
    null
  );
}

/**
 * Generate SHA256 hash for payload deduplication
 */
function hashPayload(payload: unknown): string {
  const content = JSON.stringify(payload);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * POST /api/v1/webhook/:clientSlug
 *
 * Universal webhook endpoint - automatically routes based on API key
 */
router.post('/:clientSlug', tenantContext, async (req: Request, res: Response) => {
  try {
    const { organization_id, organization_slug } = req.tenant!;
    const apiKey = extractApiKey(req);

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'API key required',
        code: 'MISSING_API_KEY',
      });
    }

    // Find source by API key
    const source = await getSourceByApiKey(apiKey);

    if (!source) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key',
        code: 'INVALID_API_KEY',
      });
    }

    // Verify source belongs to this organization
    if (source.organization_id !== organization_id) {
      return res.status(403).json({
        success: false,
        error: 'API key does not belong to this organization',
        code: 'API_KEY_ORG_MISMATCH',
      });
    }

    if (!source.is_active) {
      return res.status(403).json({
        success: false,
        error: 'Source is deactivated',
        code: 'SOURCE_INACTIVE',
      });
    }

    // Process the webhook
    const result = await processWebhook(
      organization_id,
      source.source_id,
      source.source_type,
      req.body,
      req.headers as Record<string, string>
    );

    if (result.success) {
      return res.status(200).json({
        success: true,
        data: {
          payloadId: result.payloadId,
          processed: result.processed,
          invoiceId: result.invoiceId,
          logId: result.logId,
        },
      });
    } else {
      return res.status(result.statusCode || 400).json({
        success: false,
        error: result.error,
        code: result.code,
        payloadId: result.payloadId,
      });
    }
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process webhook',
      code: 'WEBHOOK_ERROR',
    });
  }
});

/**
 * POST /api/v1/webhook/:clientSlug/:sourceId
 *
 * Source-specific webhook endpoint
 */
router.post('/:clientSlug/:sourceId', tenantContext, async (req: Request, res: Response) => {
  try {
    const { organization_id } = req.tenant!;
    const { sourceId } = req.params;
    const apiKey = extractApiKey(req);

    // Get source
    const source = await getSourceById(organization_id, sourceId);

    if (!source) {
      return res.status(404).json({
        success: false,
        error: 'Source not found',
        code: 'SOURCE_NOT_FOUND',
      });
    }

    if (!source.is_active) {
      return res.status(403).json({
        success: false,
        error: 'Source is deactivated',
        code: 'SOURCE_INACTIVE',
      });
    }

    // Validate API key if provided
    if (apiKey && source.api_key !== apiKey) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key for this source',
        code: 'INVALID_API_KEY',
      });
    }

    // Process the webhook
    const result = await processWebhook(
      organization_id,
      sourceId,
      source.source_type,
      req.body,
      req.headers as Record<string, string>
    );

    if (result.success) {
      return res.status(200).json({
        success: true,
        data: {
          payloadId: result.payloadId,
          processed: result.processed,
          invoiceId: result.invoiceId,
          logId: result.logId,
        },
      });
    } else {
      return res.status(result.statusCode || 400).json({
        success: false,
        error: result.error,
        code: result.code,
        payloadId: result.payloadId,
      });
    }
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process webhook',
      code: 'WEBHOOK_ERROR',
    });
  }
});

/**
 * Core webhook processing logic
 */
async function processWebhook(
  organizationId: string,
  sourceId: string,
  sourceType: string,
  payload: unknown,
  headers: Record<string, string>
): Promise<{
  success: boolean;
  payloadId?: string;
  processed?: boolean;
  invoiceId?: string;
  logId?: string;
  error?: string;
  code?: string;
  statusCode?: number;
}> {
  // Compute payload hash for deduplication
  const payloadHash = hashPayload(payload);

  // Save the payload
  const savedPayload = await savePayload(
    organizationId,
    sourceId,
    payload,
    headers
  );

  // Get effective mapping for this source
  const effectiveMapping = await getEffectiveMapping(organizationId, sourceId);

  if (!effectiveMapping) {
    // No mapping configured - just store the payload
    return {
      success: true,
      payloadId: savedPayload.payload_id,
      processed: false,
      code: 'NO_MAPPING',
    };
  }

  // Check if QBO is connected
  const tokenResult = await getValidToken(organizationId);
  if (!tokenResult.success) {
    // QBO not connected - store payload for later processing
    return {
      success: true,
      payloadId: savedPayload.payload_id,
      processed: false,
      code: 'QBO_NOT_CONNECTED',
    };
  }

  // Create sync log
  const syncLog = await createSyncLog(
    organizationId,
    savedPayload.payload_id,
    sourceId,
    effectiveMapping.source_mapping?.mapping_id ||
      effectiveMapping.client_override?.override_id ||
      effectiveMapping.global_template?.template_id
  );

  // Transform payload to QBO invoice
  const transformResult = transformPayloadToInvoice(payload, {
    mapping_id: 'effective',
    organization_id: organizationId,
    source_id: sourceId,
    name: 'Effective Mapping',
    version: 1,
    is_active: true,
    field_mappings: effectiveMapping.effective_field_mappings,
    static_values: effectiveMapping.static_values,
    created_at: new Date(),
  });

  if (!transformResult.success) {
    // Transform failed
    await updateSyncLog(organizationId, syncLog.log_id, {
      status: 'failed',
      error_message: transformResult.validationErrors.join('; '),
      request_payload: JSON.stringify(transformResult.transformedInvoice),
      completed_at: new Date(),
    });

    return {
      success: false,
      payloadId: savedPayload.payload_id,
      logId: syncLog.log_id,
      error: 'Mapping validation failed: ' + transformResult.validationErrors.join('; '),
      code: 'TRANSFORM_FAILED',
      statusCode: 400,
    };
  }

  // Update sync log with request payload
  await updateSyncLog(organizationId, syncLog.log_id, {
    request_payload: JSON.stringify(transformResult.transformedInvoice),
  });

  // Create invoice in QBO
  try {
    const qboResult = await qboInvoiceService.createInvoice(
      transformResult.transformedInvoice!,
      organizationId
    );

    if (!qboResult.success) {
      // Capture detailed error information for admin visibility
      // error_message: human-readable error with detail
      // error_code: machine-readable code for filtering
      // response_payload: full QBO API response for debugging
      const errorMessage = qboResult.errorDetail
        ? `${qboResult.error}: ${qboResult.errorDetail}`
        : qboResult.error;

      await updateSyncLog(organizationId, syncLog.log_id, {
        status: 'failed',
        error_message: errorMessage,
        error_code: qboResult.errorCode || 'QBO_ERROR',
        response_payload: JSON.stringify(qboResult.response),
        completed_at: new Date(),
      });

      return {
        success: false,
        payloadId: savedPayload.payload_id,
        logId: syncLog.log_id,
        error: qboResult.error,
        code: qboResult.errorCode || 'QBO_CREATE_FAILED',
        statusCode: 400,
      };
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
    await markPayloadProcessed(organizationId, savedPayload.payload_id, qboResult.invoiceId!);

    return {
      success: true,
      payloadId: savedPayload.payload_id,
      processed: true,
      invoiceId: qboResult.invoiceId,
      logId: syncLog.log_id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown QBO error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Determine error code based on error type
    let errorCode = 'QBO_ERROR';
    if (errorMessage.includes('Token refresh failed') || errorMessage.includes('Not connected')) {
      errorCode = 'TOKEN_EXPIRED';
    } else if (errorMessage.includes('fetch') || errorMessage.includes('ECONNREFUSED')) {
      errorCode = 'NETWORK_ERROR';
    }

    // Log full error details for debugging
    console.error('QBO Invoice Creation Error:', {
      organizationId,
      sourceId,
      payloadId: savedPayload.payload_id,
      logId: syncLog.log_id,
      errorMessage,
      errorCode,
      errorStack,
    });

    await updateSyncLog(organizationId, syncLog.log_id, {
      status: 'failed',
      error_message: errorMessage,
      error_code: errorCode,
      completed_at: new Date(),
    });

    return {
      success: false,
      payloadId: savedPayload.payload_id,
      logId: syncLog.log_id,
      error: errorMessage,
      code: errorCode,
      statusCode: 500,
    };
  }
}

/**
 * GET /api/v1/webhook/:clientSlug/sources
 *
 * List available webhook sources for an organization
 */
router.get('/:clientSlug/sources', tenantContext, async (req: Request, res: Response) => {
  try {
    const { organization_id, organization_slug } = req.tenant!;

    const sources = await getSources(organization_id);
    const activeSources = sources.filter(s => s.is_active);

    // Return sources with webhook URLs
    const baseUrl = process.env.API_BASE_URL || `${req.protocol}://${req.get('host')}`;
    const sourcesWithUrls = activeSources.map(s => ({
      source_id: s.source_id,
      name: s.name,
      source_type: s.source_type,
      webhook_url: `${baseUrl}/api/v1/webhook/${organization_slug}/${s.source_id}`,
      api_key_preview: s.api_key.substring(0, 8) + '...',
      created_at: s.created_at,
    }));

    return res.json({
      success: true,
      data: sourcesWithUrls,
    });
  } catch (error) {
    console.error('List sources error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to list sources',
    });
  }
});

export default router;
