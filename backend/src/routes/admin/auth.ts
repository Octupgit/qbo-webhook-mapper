/**
 * Admin Authentication Routes
 *
 * Magic link authentication for admin users.
 * In development mode, also supports direct login for testing.
 */

import { Router, Request, Response } from 'express';
import {
  requestMagicLink,
  verifyMagicLink,
  getCurrentUser,
} from '../../services/adminAuthService';

const router = Router();

/**
 * POST /api/admin/auth/magic-link
 * Request a magic link for email
 */
router.post('/magic-link', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required',
      });
    }

    const result = await requestMagicLink(email);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }

    // In development, return the magic link URL for testing
    if (process.env.NODE_ENV !== 'production' && result.magicLinkUrl) {
      return res.json({
        success: true,
        message: result.message,
        magicLinkUrl: result.magicLinkUrl, // Only in dev!
      });
    }

    return res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error('Magic link request error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send magic link',
    });
  }
});

/**
 * POST /api/admin/auth/verify
 * Verify magic link token and return JWT
 */
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { token, email } = req.body;

    if (!token || !email) {
      return res.status(400).json({
        success: false,
        error: 'Token and email are required',
      });
    }

    const result = await verifyMagicLink(token, email);

    if (!result.success) {
      return res.status(401).json({
        success: false,
        error: result.message,
      });
    }

    return res.json({
      success: true,
      data: {
        token: result.jwt,
        user: result.user,
      },
    });
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to verify token',
    });
  }
});

/**
 * GET /api/admin/auth/me
 * Get current authenticated user
 */
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header required',
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const user = await getCurrentUser(token);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
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
 * POST /api/admin/auth/dev-login (Development only)
 * Quick login for development/testing - bypasses email verification
 */
router.post('/dev-login', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const { email = 'admin@test.com' } = req.body;

    // Request magic link to auto-create user if needed
    const linkResult = await requestMagicLink(email);
    if (!linkResult.success) {
      return res.status(400).json({
        success: false,
        error: linkResult.message,
      });
    }

    // Extract token from magic link URL
    if (!linkResult.magicLinkUrl) {
      return res.status(400).json({
        success: false,
        error: 'Magic link URL not available',
      });
    }

    const urlParams = new URL(linkResult.magicLinkUrl).searchParams;
    const token = urlParams.get('token');

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Could not extract token',
      });
    }

    // Immediately verify it
    const verifyResult = await verifyMagicLink(token, email);
    if (!verifyResult.success) {
      return res.status(400).json({
        success: false,
        error: verifyResult.message,
      });
    }

    return res.json({
      success: true,
      data: {
        token: verifyResult.jwt,
        user: verifyResult.user,
      },
    });
  } catch (error) {
    console.error('Dev login error:', error);
    return res.status(500).json({
      success: false,
      error: 'Dev login failed',
    });
  }
});

export default router;
