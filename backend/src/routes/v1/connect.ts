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
import {
  getAuthorizationUrl,
  handleCallback,
  getConnectionStatus,
  disconnect,
} from '../../services/multiTenantAuthService';

const router = Router();

// Frontend URLs for redirects
const FRONTEND_BASE_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * GET /api/v1/connect/:clientSlug
 *
 * Get OAuth authorization URL for a specific organization.
 * Redirects directly to QBO or returns URL based on ?redirect param.
 */
router.get('/connect/:clientSlug', tenantContext, async (req: Request, res: Response) => {
  try {
    const { organization_id, organization_slug } = req.tenant!;
    const shouldRedirect = req.query.redirect !== 'false';

    // Generate authorization URL with org context in state
    const result = await getAuthorizationUrl(organization_id);

    if (!result.success) {
      if (shouldRedirect) {
        return res.redirect(
          `${FRONTEND_BASE_URL}/org/${organization_slug}/settings?error=${encodeURIComponent(result.error!)}`
        );
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
  try {
    const { code, state, error: oauthError, error_description } = req.query;

    // Handle OAuth errors from QBO
    if (oauthError) {
      console.error('OAuth error from QBO:', oauthError, error_description);
      return res.redirect(
        `${FRONTEND_BASE_URL}/settings?error=${encodeURIComponent(
          (error_description as string) || (oauthError as string) || 'OAuth authorization failed'
        )}`
      );
    }

    if (!code || !state) {
      return res.redirect(
        `${FRONTEND_BASE_URL}/settings?error=${encodeURIComponent('Missing OAuth parameters')}`
      );
    }

    // Build callback URL for the service to parse
    const callbackUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    // Process the callback
    const result = await handleCallback(callbackUrl);

    if (!result.success) {
      console.error('OAuth callback failed:', result.error);
      return res.redirect(
        `${FRONTEND_BASE_URL}/settings?error=${encodeURIComponent(result.error!)}`
      );
    }

    // Success - redirect to organization-specific settings page
    const successParams = new URLSearchParams({
      connected: 'true',
      realmId: result.realmId!,
    });

    if (result.companyName) {
      successParams.set('companyName', result.companyName);
    }

    // Use the organization slug from the callback result for org-specific redirect
    const redirectPath = result.slug
      ? `/org/${result.slug}/settings`
      : '/settings';

    return res.redirect(
      `${FRONTEND_BASE_URL}${redirectPath}?${successParams.toString()}`
    );
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
        },
        connectUrl: status.connected
          ? null
          : `${process.env.API_BASE_URL || req.protocol + '://' + req.get('host')}/api/v1/connect/${organization_slug}`,
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
        connectUrl: `${process.env.API_BASE_URL || req.protocol + '://' + req.get('host')}/api/v1/connect/${organization_slug}`,
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
    const { organization_id } = req.tenant!;
    const search = req.query.search as string;

    // Import dynamically to avoid circular deps
    const qboInvoiceService = await import('../../services/qboInvoiceService');
    const result = await qboInvoiceService.getCustomers(search, organization_id);

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

/**
 * GET /api/v1/org/:clientSlug/qbo/items
 *
 * Search QBO items for this organization
 */
router.get('/org/:clientSlug/qbo/items', tenantContext, async (req: Request, res: Response) => {
  try {
    const { organization_id } = req.tenant!;
    const search = req.query.search as string;

    // Import dynamically to avoid circular deps
    const qboInvoiceService = await import('../../services/qboInvoiceService');
    const result = await qboInvoiceService.getItems(search, organization_id);

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
