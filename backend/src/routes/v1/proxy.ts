/**
 * Proxy API Routes
 *
 * Unified endpoint for querying QuickBooks Online data.
 * All routes require API key authentication.
 *
 * Endpoints:
 * - GET /api/v1/org/:clientSlug/proxy/data - Query entities by type
 * - GET /api/v1/org/:clientSlug/proxy/data/:type/:id - Get single entity by ID
 */

import { Router, Request, Response } from 'express';
import { tenantContext } from '../../middleware/tenantContext';
import { optionalApiKey } from '../../middleware/apiKeyAuth';
import {
  fetchEntities,
  fetchEntityById,
  getSupportedTypes,
  isValidType,
  QboEntityType,
  ProxyErrorCodes,
} from '../../services/qboProxyService';

const router = Router();

/**
 * GET /api/v1/org/:clientSlug/proxy/data
 *
 * Query QBO entities with filtering and pagination.
 *
 * Query Parameters:
 * - type: Entity type (customers, items, invoices, accounts, vendors) - REQUIRED
 * - search: Search term for name/display name filtering
 * - status: Filter by status (active, inactive, all) - default: active
 * - limit: Max results to return (1-100) - default: 50
 * - offset: Starting position for pagination - default: 0
 *
 * Headers:
 * - X-API-Key: Required API key for authentication
 *
 * Response:
 * - 200: { success: true, data: [...], meta: { type, count, limit, offset, hasMore } }
 * - 400: Invalid type or query parameters
 * - 401: Missing or invalid API key
 * - 403: API key doesn't belong to organization
 * - 503: QBO unavailable or token expired
 */
router.get(
  '/:clientSlug/proxy/data',
  tenantContext,
  optionalApiKey(),
  async (req: Request, res: Response) => {
    try {
      const { organization_id, organization_slug } = req.tenant!;
      const { type, search, status, limit, offset } = req.query;

      // Validate type parameter
      if (!type) {
        return res.status(400).json({
          success: false,
          error: `Missing required parameter: type. Supported types: ${getSupportedTypes().join(', ')}`,
          code: ProxyErrorCodes.INVALID_TYPE,
        });
      }

      if (!isValidType(type as string)) {
        return res.status(400).json({
          success: false,
          error: `Invalid type: ${type}. Supported types: ${getSupportedTypes().join(', ')}`,
          code: ProxyErrorCodes.INVALID_TYPE,
        });
      }

      // Validate and parse pagination parameters
      const parsedLimit = Math.min(Math.max(parseInt(limit as string) || 50, 1), 100);
      const parsedOffset = Math.max(parseInt(offset as string) || 0, 0);

      // Validate status parameter
      const validStatuses = ['active', 'inactive', 'all'];
      const parsedStatus = validStatuses.includes(status as string)
        ? (status as 'active' | 'inactive' | 'all')
        : 'active';

      // Fetch entities
      const result = await fetchEntities(
        organization_id,
        type as QboEntityType,
        {
          search: search as string,
          status: parsedStatus,
          limit: parsedLimit,
          offset: parsedOffset,
        }
      );

      if (!result.success) {
        // Determine appropriate status code
        let statusCode = 500;
        if (result.errorCode === ProxyErrorCodes.TOKEN_EXPIRED ||
            result.errorCode === ProxyErrorCodes.TOKEN_REVOKED) {
          statusCode = 503; // Service Unavailable - needs reconnect
        } else if (result.errorCode === ProxyErrorCodes.QBO_UNAVAILABLE) {
          statusCode = 503;
        } else if (result.errorCode === ProxyErrorCodes.INVALID_QUERY) {
          statusCode = 400;
        }

        // Build connect URL if reconnection needed
        const apiBaseUrl = process.env.API_BASE_URL || req.protocol + '://' + req.get('host');
        const connectUrl = `${apiBaseUrl}/api/v1/connect/${organization_slug}?source=admin`;

        return res.status(statusCode).json({
          success: false,
          error: result.error,
          code: result.errorCode,
          needsReconnect: result.needsReconnect,
          connectUrl: result.needsReconnect ? connectUrl : undefined,
        });
      }

      return res.json({
        success: true,
        data: result.data,
        meta: {
          ...result.meta,
          organization: {
            id: organization_id,
            slug: organization_slug,
          },
        },
      });
    } catch (error) {
      console.error('[ProxyRoutes] Error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'ERR_INTERNAL',
      });
    }
  }
);

/**
 * GET /api/v1/org/:clientSlug/proxy/data/:type/:id
 *
 * Get a single QBO entity by ID.
 *
 * Path Parameters:
 * - type: Entity type (customers, items, invoices, accounts, vendors)
 * - id: Entity ID
 *
 * Headers:
 * - X-API-Key: Required API key for authentication
 *
 * Response:
 * - 200: { success: true, data: {...} }
 * - 400: Invalid type
 * - 401: Missing or invalid API key
 * - 403: API key doesn't belong to organization
 * - 404: Entity not found
 * - 503: QBO unavailable or token expired
 */
router.get(
  '/:clientSlug/proxy/data/:type/:id',
  tenantContext,
  optionalApiKey(),
  async (req: Request, res: Response) => {
    try {
      const { organization_id, organization_slug } = req.tenant!;
      const { type, id } = req.params;

      // Validate type parameter
      if (!isValidType(type)) {
        return res.status(400).json({
          success: false,
          error: `Invalid type: ${type}. Supported types: ${getSupportedTypes().join(', ')}`,
          code: ProxyErrorCodes.INVALID_TYPE,
        });
      }

      // Fetch entity by ID
      const result = await fetchEntityById(
        organization_id,
        type as QboEntityType,
        id
      );

      if (!result.success) {
        // Determine appropriate status code
        let statusCode = 500;
        if (result.errorCode === ProxyErrorCodes.NOT_FOUND) {
          statusCode = 404;
        } else if (result.errorCode === ProxyErrorCodes.TOKEN_EXPIRED ||
                   result.errorCode === ProxyErrorCodes.TOKEN_REVOKED) {
          statusCode = 503;
        } else if (result.errorCode === ProxyErrorCodes.QBO_UNAVAILABLE) {
          statusCode = 503;
        } else if (result.errorCode === ProxyErrorCodes.INVALID_QUERY) {
          statusCode = 400;
        }

        // Build connect URL if reconnection needed
        const apiBaseUrl = process.env.API_BASE_URL || req.protocol + '://' + req.get('host');
        const connectUrl = `${apiBaseUrl}/api/v1/connect/${organization_slug}?source=admin`;

        return res.status(statusCode).json({
          success: false,
          error: result.error,
          code: result.errorCode,
          needsReconnect: result.needsReconnect,
          connectUrl: result.needsReconnect ? connectUrl : undefined,
        });
      }

      return res.json({
        success: true,
        data: result.data,
        meta: {
          organization: {
            id: organization_id,
            slug: organization_slug,
          },
        },
      });
    } catch (error) {
      console.error('[ProxyRoutes] Error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'ERR_INTERNAL',
      });
    }
  }
);

/**
 * GET /api/v1/org/:clientSlug/proxy/types
 *
 * Get list of supported entity types.
 * Useful for building dynamic UIs.
 */
router.get(
  '/:clientSlug/proxy/types',
  tenantContext,
  optionalApiKey(),
  async (req: Request, res: Response) => {
    return res.json({
      success: true,
      data: {
        types: getSupportedTypes(),
        description: {
          customers: 'QuickBooks customers',
          items: 'Products and services',
          invoices: 'Sales invoices',
          accounts: 'Chart of accounts',
          vendors: 'Vendors/suppliers',
        },
      },
    });
  }
);

export default router;
