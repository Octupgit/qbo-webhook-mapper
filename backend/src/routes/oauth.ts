import { Router, Request, Response } from 'express';
import * as qboAuthService from '../services/qboAuthService';
import * as qboInvoiceService from '../services/qboInvoiceService';
import config from '../config';

const router = Router();

// GET /api/oauth/qbo/authorize - Start OAuth flow
router.get('/qbo/authorize', (req: Request, res: Response) => {
  try {
    const authUrl = qboAuthService.getAuthorizationUrl();
    return res.redirect(authUrl);
  } catch (error) {
    console.error('OAuth authorize error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate authorization URL',
    });
  }
});

// GET /api/oauth/qbo/callback - OAuth callback handler
router.get('/qbo/callback', async (req: Request, res: Response) => {
  try {
    const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    const { realmId } = await qboAuthService.handleCallback(fullUrl);

    // Redirect to frontend with success
    const frontendUrl = config.frontendUrl;
    return res.redirect(`${frontendUrl}/settings?oauth=success&realmId=${realmId}`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    const frontendUrl = config.frontendUrl;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return res.redirect(`${frontendUrl}/settings?oauth=error&message=${encodeURIComponent(errorMessage)}`);
  }
});

// GET /api/oauth/qbo/status - Get connection status
router.get('/qbo/status', async (req: Request, res: Response) => {
  try {
    const status = await qboAuthService.getConnectionStatus();

    // If connected, also get company info
    if (status.connected) {
      const companyInfo = await qboInvoiceService.getCompanyInfo();
      return res.json({
        success: true,
        data: {
          ...status,
          company: companyInfo.company,
        },
      });
    }

    return res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('OAuth status error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get connection status',
    });
  }
});

// POST /api/oauth/qbo/disconnect - Revoke tokens
router.post('/qbo/disconnect', async (req: Request, res: Response) => {
  try {
    await qboAuthService.disconnect();

    return res.json({
      success: true,
      message: 'Disconnected from QuickBooks',
    });
  } catch (error) {
    console.error('OAuth disconnect error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to disconnect',
    });
  }
});

// POST /api/oauth/qbo/refresh - Force token refresh
router.post('/qbo/refresh', async (req: Request, res: Response) => {
  try {
    const token = await qboAuthService.getValidToken();

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Not connected to QuickBooks',
      });
    }

    return res.json({
      success: true,
      message: 'Token refreshed',
    });
  } catch (error) {
    console.error('OAuth refresh error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to refresh token',
    });
  }
});

export default router;
