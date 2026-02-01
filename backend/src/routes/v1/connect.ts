/**
 * V1 OAuth Connect Routes
 *
 * Multi-tenant OAuth endpoints for connecting organizations to QuickBooks Online.
 *
 * Routes:
 * GET  /api/v1/connect/:clientSlug - Get OAuth authorization URL
 * GET  /api/v1/oauth/callback - Handle OAuth callback (shared for all orgs)
 * GET  /api/v1/org/:clientSlug/status - Get connection status
 * POST /api/v1/org/:clientSlug/disconnect - Disconnect from QBO
 */

import { Router, Request, Response } from 'express';
import { tenantContext } from '../../middleware/tenantContext';
import config from '../../config';
import {
  getAuthorizationUrl,
  handleCallback,
  getConnectionStatus,
  disconnect,
} from '../../services/multiTenantAuthService';

const router = Router();

// Frontend URLs for redirects - in production, empty string means same origin
const FRONTEND_BASE_URL = config.frontendUrl;

/**
 * GET /api/v1/connect/:clientSlug
 *
 * Get OAuth authorization URL for a specific organization.
 * Redirects directly to QBO or returns URL based on ?redirect param.
 *
 * Query params:
 * - redirect: 'false' to return URL instead of redirecting
 * - source: 'public' for client-facing connect, 'admin' for admin dashboard
 * - return_url: Optional URL to redirect to after OAuth callback
 */
router.get('/connect/:clientSlug', tenantContext, async (req: Request, res: Response) => {
  try {
    const { organization_id, organization_slug } = req.tenant!;
    const shouldRedirect = req.query.redirect !== 'false';
    const source = req.query.source === 'public' ? 'public' : 'admin';
    const returnUrl = req.query.return_url as string | undefined;

    // Generate authorization URL with org context in state
    const result = await getAuthorizationUrl(organization_id, source, returnUrl);

    if (!result.success) {
      const errorPath = source === 'public'
        ? `/connect/${organization_slug}?error=${encodeURIComponent(result.error!)}`
        : `/org/${organization_slug}/settings?error=${encodeURIComponent(result.error!)}`;

      if (shouldRedirect) {
        return res.redirect(`${FRONTEND_BASE_URL}${errorPath}`);
      }
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    if (shouldRedirect) {
      // Redirect to QBO authorization page
      return res.redirect(result.authUrl!);
    }

    // Return URL for client-side redirect
    return res.json({
      success: true,
      data: {
        authUrl: result.authUrl,
      },
    });
  } catch (error) {
    console.error('OAuth connect error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to initiate OAuth flow',
    });
  }
});

/**
 * GET /api/v1/oauth/callback
 *
 * Handle OAuth callback from QuickBooks.
 * Extracts organization from state parameter and redirects to frontend.
 */
router.get('/oauth/callback', async (req: Request, res: Response) => {
  console.log('[OAuth V1 Callback] Received callback');
  console.log('[OAuth V1 Callback] Query params:', {
    hasCode: !!req.query.code,
    hasState: !!req.query.state,
    statePreview: req.query.state ? String(req.query.state).substring(0, 50) + '...' : 'NONE'
  });

  try {
    const { code, state, error: oauthError, error_description } = req.query;

    // Handle OAuth errors from QBO
    if (oauthError) {
      console.error('[OAuth V1 Callback] Error from QBO:', oauthError, error_description);
      return res.redirect(
        `${FRONTEND_BASE_URL}/settings?error=${encodeURIComponent(
          (error_description as string) || (oauthError as string) || 'OAuth authorization failed'
        )}`
      );
    }

    if (!code || !state) {
      console.error('[OAuth V1 Callback] Missing params - code:', !!code, 'state:', !!state);
      return res.redirect(
        `${FRONTEND_BASE_URL}/settings?error=${encodeURIComponent('Missing OAuth parameters')}`
      );
    }

    // Build callback URL for the service to parse
    // Handle Cloud Run's forwarded protocol
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const callbackUrl = `${protocol}://${req.get('host')}${req.originalUrl}`;
    console.log('[OAuth V1 Callback] Processing callback URL:', callbackUrl.substring(0, 100) + '...');

    // Process the callback
    const result = await handleCallback(callbackUrl);
    console.log('[OAuth V1 Callback] Result:', {
      success: result.success,
      organizationId: result.organizationId,
      slug: result.slug,
      realmId: result.realmId,
      source: result.source,
      returnUrl: result.returnUrl,
      error: result.error
    });

    // Determine redirect path based on source (public vs admin) and returnUrl
    const isPublic = result.source === 'public';

    // Build success/error params
    const buildRedirectUrl = (basePath: string, params: Record<string, string>): string => {
      // If returnUrl is provided, use it as the base
      if (result.returnUrl) {
        try {
          const url = new URL(result.returnUrl);
          Object.entries(params).forEach(([key, value]) => {
            url.searchParams.set(key, value);
          });
          return url.toString();
        } catch {
          // Invalid URL, fall back to default behavior
          console.warn('[OAuth V1 Callback] Invalid returnUrl:', result.returnUrl);
        }
      }
      // Default behavior: use FRONTEND_BASE_URL + basePath
      const queryString = new URLSearchParams(params).toString();
      return `${FRONTEND_BASE_URL}${basePath}${queryString ? '?' + queryString : ''}`;
    };

    if (!result.success) {
      console.error('OAuth callback failed:', result.error);
      const errorPath = isPublic && result.slug
        ? `/connect/${result.slug}`
        : `/settings`;
      return res.redirect(buildRedirectUrl(errorPath, { error: result.error! }));
    }

    // Success - build params
    const successParams: Record<string, string> = {
      connected: 'true',
      realmId: result.realmId!,
    };

    if (result.companyName) {
      successParams.companyName = result.companyName;
    }

    // Public connects go to /connect/:slug, admin connects go to /org/:slug/settings
    let defaultRedirectPath: string;
    if (isPublic && result.slug) {
      defaultRedirectPath = `/connect/${result.slug}`;
    } else if (result.slug) {
      defaultRedirectPath = `/org/${result.slug}/settings`;
    } else {
      defaultRedirectPath = '/settings';
    }

    return res.redirect(buildRedirectUrl(defaultRedirectPath, successParams));
  } catch (error) {
    console.error('OAuth callback error:', error);
    return res.redirect(
      `${FRONTEND_BASE_URL}/settings?error=${encodeURIComponent('OAuth callback failed')}`
    );
  }
});

/**
 * GET /api/v1/org/:clientSlug/status
 *
 * Get QBO connection status for an organization
 */
router.get('/org/:clientSlug/status', tenantContext, async (req: Request, res: Response) => {
  try {
    const { organization_id, organization_slug, organization_name, plan_tier } = req.tenant!;

    const status = await getConnectionStatus(organization_id);

    // Build base URL for connect link
    const apiBaseUrl = process.env.API_BASE_URL || req.protocol + '://' + req.get('host');
    const connectUrl = `${apiBaseUrl}/api/v1/connect/${organization_slug}?source=admin`;

    // Determine if reconnection is needed
    const needsReconnect =
      !status.connected ||
      status.syncStatus === 'expired' ||
      status.syncStatus === 'revoked' ||
      status.syncStatus === 'disconnected';

    return res.json({
      success: true,
      data: {
        organization: {
          id: organization_id,
          slug: organization_slug,
          name: organization_name,
          planTier: plan_tier,
        },
        qbo: {
          connected: status.connected,
          realmId: status.realmId,
          companyName: status.companyName,
          expiresAt: status.expiresAt,
          syncStatus: status.syncStatus,
          needsReconnect,
        },
        connectUrl: needsReconnect ? connectUrl : null,
      },
    });
  } catch (error) {
    console.error('Get status error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get connection status',
    });
  }
});

/**
 * GET /api/v1/org/:clientSlug/health
 *
 * Detailed health check for QBO connection.
 * Returns token expiration times and specific status for debugging.
 */
router.get('/org/:clientSlug/health', tenantContext, async (req: Request, res: Response) => {
  try {
    const { organization_id, organization_slug } = req.tenant!;

    // Import tokenManager dynamically
    const { checkConnectionHealth } = await import('../../services/tokenManager');
    const health = await checkConnectionHealth(organization_id);

    // Build connect URL
    const apiBaseUrl = process.env.API_BASE_URL || req.protocol + '://' + req.get('host');
    const connectUrl = `${apiBaseUrl}/api/v1/connect/${organization_slug}?source=admin`;

    return res.json({
      success: true,
      data: {
        healthy: health.healthy,
        status: health.status,
        message: health.message,
        companyName: health.companyName,
        accessTokenExpiresAt: health.accessTokenExpiresAt,
        refreshTokenExpiresAt: health.refreshTokenExpiresAt,
        connectUrl: health.healthy ? null : connectUrl,
      },
    });
  } catch (error) {
    console.error('Health check error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to check connection health',
    });
  }
});

/**
 * POST /api/v1/org/:clientSlug/disconnect
 *
 * Disconnect organization from QuickBooks
 */
router.post('/org/:clientSlug/disconnect', tenantContext, async (req: Request, res: Response) => {
  try {
    const { organization_id, organization_slug } = req.tenant!;

    // Check current status
    const currentStatus = await getConnectionStatus(organization_id);

    if (!currentStatus.connected) {
      return res.status(400).json({
        success: false,
        error: 'Not connected to QuickBooks',
      });
    }

    // Disconnect
    await disconnect(organization_id);

    return res.json({
      success: true,
      message: 'Disconnected from QuickBooks',
      data: {
        previousRealmId: currentStatus.realmId,
        connectUrl: `${process.env.API_BASE_URL || req.protocol + '://' + req.get('host')}/api/v1/connect/${organization_slug}?source=admin`,
      },
    });
  } catch (error) {
    console.error('Disconnect error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to disconnect from QuickBooks',
    });
  }
});

/**
 * GET /api/v1/org/:clientSlug/qbo/customers
 *
 * Search QBO customers for this organization
 */
router.get('/org/:clientSlug/qbo/customers', tenantContext, async (req: Request, res: Response) => {
  try {
    const { organization_id, organization_slug } = req.tenant!;
    const search = req.query.search as string;

    // Import dynamically to avoid circular deps
    const qboInvoiceService = await import('../../services/qboInvoiceService');
    const result = await qboInvoiceService.getCustomers(search, organization_id);

    if (!result.success) {
      // Build connect URL if reconnection is needed
      const apiBaseUrl = process.env.API_BASE_URL || req.protocol + '://' + req.get('host');
      const connectUrl = `${apiBaseUrl}/api/v1/connect/${organization_slug}?source=admin`;

      return res.status(result.needsReconnect ? 401 : 400).json({
        success: false,
        error: result.error,
        needsReconnect: result.needsReconnect,
        connectUrl: result.needsReconnect ? connectUrl : undefined,
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

/**
 * GET /api/v1/org/:clientSlug/qbo/items
 *
 * Search QBO items for this organization
 */
router.get('/org/:clientSlug/qbo/items', tenantContext, async (req: Request, res: Response) => {
  try {
    const { organization_id, organization_slug } = req.tenant!;
    const search = req.query.search as string;

    // Import dynamically to avoid circular deps
    const qboInvoiceService = await import('../../services/qboInvoiceService');
    const result = await qboInvoiceService.getItems(search, organization_id);

    if (!result.success) {
      // Build connect URL if reconnection is needed
      const apiBaseUrl = process.env.API_BASE_URL || req.protocol + '://' + req.get('host');
      const connectUrl = `${apiBaseUrl}/api/v1/connect/${organization_slug}?source=admin`;

      return res.status(result.needsReconnect ? 401 : 400).json({
        success: false,
        error: result.error,
        needsReconnect: result.needsReconnect,
        connectUrl: result.needsReconnect ? connectUrl : undefined,
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
