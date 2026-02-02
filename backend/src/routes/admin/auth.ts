/**
 * Admin Authentication Routes
 *
 * Microsoft SSO authentication only.
 * Uses HttpOnly cookies for persistent sessions (12 hours).
 */

import { Router, Request, Response } from 'express';
import {
  getCurrentUser,
  refreshJwt,
  verifyJwt,
} from '../../services/adminAuthService';
import {
  isMicrosoftSSOConfigured,
  getMicrosoftLoginUrl,
  handleMicrosoftCallback,
  getMicrosoftSSOStatus,
} from '../../services/microsoftAuthService';
import { AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS } from '../../middleware/adminAuth';

const router = Router();

/**
 * Helper to set auth cookie
 */
function setAuthCookie(res: Response, token: string): void {
  console.log('[Auth] Setting cookie with options:', AUTH_COOKIE_OPTIONS);
  res.cookie(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);
}

/**
 * Helper to clear auth cookie
 */
function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, { path: '/' });
}

// =============================================================================
// MICROSOFT SSO ROUTES
// =============================================================================

/**
 * GET /api/admin/auth/status
 * Get authentication provider status
 */
router.get('/status', (req: Request, res: Response) => {
  console.log('[Auth/Status] Cookies received:', req.cookies);
  console.log('[Auth/Status] Cookie header:', req.headers.cookie);
  const microsoftStatus = getMicrosoftSSOStatus();

  return res.json({
    success: true,
    data: {
      microsoft: microsoftStatus,
    },
  });
});

/**
 * GET /api/admin/auth/microsoft
 * Initiate Microsoft SSO login
 */
router.get('/microsoft', async (req: Request, res: Response) => {
  try {
    if (!isMicrosoftSSOConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Microsoft SSO is not configured. Please set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET.',
      });
    }

    const { url, state } = await getMicrosoftLoginUrl();

    // Store state in cookie for verification
    res.cookie('msal_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 5 * 60 * 1000, // 5 minutes
    });

    return res.redirect(url);
  } catch (error) {
    console.error('Microsoft login initiation error:', error);
    const adminBaseUrl = process.env.ADMIN_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(`${adminBaseUrl}/login?error=sso_init_failed&message=${encodeURIComponent('Failed to initialize Microsoft login')}`);
  }
});

/**
 * GET /api/admin/auth/microsoft/callback
 * Handle Microsoft OAuth callback
 * Sets HttpOnly cookie for persistent session
 */
router.get('/microsoft/callback', async (req: Request, res: Response) => {
  try {
    const { code, state, error, error_description } = req.query;
    const adminBaseUrl = process.env.ADMIN_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:3000';

    if (error) {
      console.error('Microsoft OAuth error:', error, error_description);
      return res.redirect(`${adminBaseUrl}/login?error=${error}&message=${encodeURIComponent(String(error_description || ''))}`);
    }

    if (!code || !state) {
      return res.redirect(`${adminBaseUrl}/login?error=missing_params`);
    }

    const result = await handleMicrosoftCallback(String(code), String(state));

    // Clear state cookie
    res.clearCookie('msal_state');

    if (result.success && result.jwt) {
      // Set HttpOnly cookie for persistent session
      setAuthCookie(res, result.jwt);
      // Redirect to dashboard
      return res.redirect(`${adminBaseUrl}/admin/organizations`);
    }

    // Auth failed - redirect to login with error
    if (result.redirectUrl) {
      return res.redirect(result.redirectUrl);
    }

    return res.redirect(`${adminBaseUrl}/login?error=auth_failed`);
  } catch (error) {
    console.error('Microsoft callback error:', error);
    const adminBaseUrl = process.env.ADMIN_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(`${adminBaseUrl}/login?error=callback_failed`);
  }
});

// =============================================================================
// SESSION MANAGEMENT ROUTES
// =============================================================================

/**
 * GET /api/admin/auth/me
 * Get current authenticated user (from cookie)
 */
router.get('/me', async (req: Request, res: Response) => {
  try {
    // Check cookie first, then header
    let token = req.cookies?.[AUTH_COOKIE_NAME];

    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader) {
        token = authHeader.replace('Bearer ', '');
      }
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'NO_TOKEN',
      });
    }

    const user = await getCurrentUser(token);

    if (!user) {
      // Clear invalid cookie
      clearAuthCookie(res);
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN',
      });
    }

    return res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('Get current user error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get user',
    });
  }
});

/**
 * POST /api/admin/auth/logout
 * Clear session cookie and logout
 */
router.post('/logout', (req: Request, res: Response) => {
  clearAuthCookie(res);
  return res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

/**
 * POST /api/admin/auth/refresh
 * Refresh session token (heartbeat)
 * Extends session by generating a new token with fresh expiration
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    // Get current token from cookie
    const token = req.cookies?.[AUTH_COOKIE_NAME];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No session to refresh',
        code: 'NO_SESSION',
      });
    }

    // Verify current token is still valid
    const { valid, payload } = verifyJwt(token);

    if (!valid || !payload) {
      clearAuthCookie(res);
      return res.status(401).json({
        success: false,
        error: 'Session expired, please login again',
        code: 'SESSION_EXPIRED',
      });
    }

    // Generate new token with fresh expiration
    const refreshResult = refreshJwt(token);

    if (!refreshResult.success || !refreshResult.jwt) {
      return res.status(401).json({
        success: false,
        error: 'Failed to refresh session',
        code: 'REFRESH_FAILED',
      });
    }

    // Set new cookie
    setAuthCookie(res, refreshResult.jwt);

    return res.json({
      success: true,
      message: 'Session refreshed',
    });
  } catch (error) {
    console.error('Session refresh error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to refresh session',
    });
  }
});

export default router;
