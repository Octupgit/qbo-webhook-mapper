/**
 * Admin Auth Service
 *
 * Handles JWT session management for admin dashboard users.
 * Authentication is performed via Microsoft SSO (see microsoftAuthService.ts).
 */

import jwt from 'jsonwebtoken';
import {
  getAdminUserById,
} from './dataService';
import { AdminUser } from '../types';

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'admin-jwt-secret-change-in-production';
const JWT_EXPIRATION = '12h'; // 12 hours for admin sessions

/**
 * Verify a JWT token
 */
export function verifyJwt(token: string): {
  valid: boolean;
  payload?: { userId: string; email: string; role: string };
} {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      email: string;
      role: string;
    };
    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

/**
 * Get current admin user from JWT
 */
export async function getCurrentUser(token: string): Promise<AdminUser | null> {
  const { valid, payload } = verifyJwt(token);
  if (!valid || !payload) {
    return null;
  }

  const user = await getAdminUserById(payload.userId);
  return user;
}

/**
 * Refresh JWT if close to expiration
 */
export function refreshJwt(token: string): {
  success: boolean;
  jwt?: string;
} {
  const { valid, payload } = verifyJwt(token);
  if (!valid || !payload) {
    return { success: false };
  }

  // Generate new token
  const newToken = jwt.sign(
    {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRATION }
  );

  return { success: true, jwt: newToken };
}

/**
 * Check if user has admin role
 */
export function isAdmin(user: AdminUser): boolean {
  return user.role === 'admin' || user.role === 'super_admin';
}

/**
 * Check if user has super admin role
 */
export function isSuperAdmin(user: AdminUser): boolean {
  return user.role === 'super_admin';
}
