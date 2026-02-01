/**
 * Admin Authentication Middleware
 *
 * Verifies JWT tokens for admin dashboard routes.
 * Supports both HttpOnly cookies (preferred) and Authorization header.
 * Uses the adminAuthService for token verification.
 */

import { Request, Response, NextFunction } from 'express';
import { verifyJwt, getCurrentUser, isAdmin, isSuperAdmin } from '../services/adminAuthService';
import { AdminContext, AdminRole } from '../types';

// Note: Express Request extension is declared in types/multiTenant.ts

// Cookie configuration
export const AUTH_COOKIE_NAME = 'admin_session';
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 12 * 60 * 60 * 1000, // 12 hours
  path: '/',
};

/**
 * Extract JWT from cookie first, then Authorization header
 */
function extractToken(req: Request): string | null {
  // 1. Check HttpOnly cookie first (preferred for persistence)
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];
  if (cookieToken) {
    return cookieToken;
  }

  // 2. Fall back to Authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return null;
  }

  // Support "Bearer <token>" format
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Also support raw token
  return authHeader;
}

/**
 * Middleware to verify admin JWT and attach admin context to request
 *
 * Usage:
 * router.use(adminAuth);
 * router.get('/organizations', (req, res) => {
 *   const { user_id, role } = req.admin!;
 *   // ...
 * });
 */
export async function adminAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractToken(req);

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'NO_TOKEN',
      });
      return;
    }

    // Verify JWT
    const { valid, payload } = verifyJwt(token);

    if (!valid || !payload) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN',
      });
      return;
    }

    // Get full user details
    const user = await getCurrentUser(token);

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      });
      return;
    }

    if (!user.is_active) {
      res.status(403).json({
        success: false,
        error: 'User account is deactivated',
        code: 'USER_INACTIVE',
      });
      return;
    }

    // Attach admin context to request (using snake_case per AdminContext interface)
    req.admin = {
      user_id: user.user_id,
      email: user.email,
      role: user.role as AdminRole,
    };

    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_ERROR',
    });
  }
}

/**
 * Optional admin auth - doesn't fail if no token provided
 * Useful for routes that can work with or without admin context
 */
export async function optionalAdminAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractToken(req);

    if (token) {
      const { valid, payload } = verifyJwt(token);

      if (valid && payload) {
        const user = await getCurrentUser(token);

        if (user && user.is_active) {
          req.admin = {
            user_id: user.user_id,
            email: user.email,
            role: user.role as AdminRole,
          };
        }
      }
    }

    next();
  } catch (error) {
    console.error('Optional admin auth error:', error);
    // Don't fail, just continue without admin context
    next();
  }
}

/**
 * Require admin role (admin or super_admin)
 */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.admin) {
    res.status(401).json({
      success: false,
      error: 'Admin authentication required',
      code: 'NO_ADMIN',
    });
    return;
  }

  // Get user for role check
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Admin authentication required',
      code: 'NO_ADMIN',
    });
    return;
  }

  const user = await getCurrentUser(token);
  if (!user || !isAdmin(user)) {
    res.status(403).json({
      success: false,
      error: 'Admin role required',
      code: 'NOT_ADMIN',
    });
    return;
  }

  next();
}

/**
 * Require super_admin role
 */
export async function requireSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.admin) {
    res.status(401).json({
      success: false,
      error: 'Admin authentication required',
      code: 'NO_ADMIN',
    });
    return;
  }

  // Get user for role check
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Admin authentication required',
      code: 'NO_ADMIN',
    });
    return;
  }

  const user = await getCurrentUser(token);
  if (!user || !isSuperAdmin(user)) {
    res.status(403).json({
      success: false,
      error: 'Super admin role required',
      code: 'NOT_SUPER_ADMIN',
    });
    return;
  }

  next();
}

/**
 * Rate limiting for admin routes (basic implementation)
 */
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function adminRateLimit(maxRequests: number = 100, windowMs: number = 60000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.admin?.user_id || req.ip || 'anonymous';
    const now = Date.now();

    const entry = rateLimitMap.get(key);

    if (!entry || now > entry.resetTime) {
      // Reset or create new entry
      rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
      next();
      return;
    }

    if (entry.count >= maxRequests) {
      res.status(429).json({
        success: false,
        error: 'Too many requests',
        code: 'RATE_LIMITED',
        retryAfter: Math.ceil((entry.resetTime - now) / 1000),
      });
      return;
    }

    entry.count++;
    next();
  };
}
