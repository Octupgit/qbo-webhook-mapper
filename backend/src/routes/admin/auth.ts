/**
 * Admin Authentication Routes
 *
 * Email/Password authentication with JWT tokens.
 * Uses Authorization: Bearer <token> header (no cookies).
 */

import { Router, Request, Response } from 'express';
import {
  loginAdmin,
  changePassword,
  getCurrentUser,
  refreshJwt,
  verifyJwt,
} from '../../services/adminAuthService';
import { adminAuth } from '../../middleware/adminAuth';

const router = Router();

/**
 * POST /api/admin/auth/login
 * Authenticate with email and password
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
      });
    }

    const result = await loginAdmin(email, password);

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
        must_change_password: result.must_change_password,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      error: 'Login failed',
    });
  }
});

/**
 * POST /api/admin/auth/change-password
 * Change password (authenticated)
 */
router.post('/change-password', adminAuth, async (req: Request, res: Response) => {
  try {
    const { current_password, new_password } = req.body;
    const userId = req.admin!.user_id;

    if (!new_password) {
      return res.status(400).json({
        success: false,
        error: 'New password is required',
      });
    }

    const result = await changePassword(userId, current_password || '', new_password);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }

    return res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to change password',
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
        error: 'Authentication required',
        code: 'NO_TOKEN',
      });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const user = await getCurrentUser(token);

    if (!user) {
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
 * POST /api/admin/auth/refresh
 * Refresh JWT token
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'No token to refresh',
        code: 'NO_TOKEN',
      });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    // Verify current token is still valid
    const { valid } = verifyJwt(token);

    if (!valid) {
      return res.status(401).json({
        success: false,
        error: 'Token expired, please login again',
        code: 'TOKEN_EXPIRED',
      });
    }

    // Generate new token
    const refreshResult = refreshJwt(token);

    if (!refreshResult.success || !refreshResult.jwt) {
      return res.status(401).json({
        success: false,
        error: 'Failed to refresh token',
        code: 'REFRESH_FAILED',
      });
    }

    return res.json({
      success: true,
      data: {
        token: refreshResult.jwt,
      },
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to refresh token',
    });
  }
});

/**
 * POST /api/admin/auth/logout
 * Logout (client-side token removal)
 */
router.post('/logout', (req: Request, res: Response) => {
  // With JWT in localStorage, logout is client-side only
  // This endpoint exists for API completeness
  return res.json({
    success: true,
    message: 'Logged out successfully. Please remove the token from localStorage.',
  });
});

export default router;
