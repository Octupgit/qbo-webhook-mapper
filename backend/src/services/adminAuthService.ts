/**
 * Admin Auth Service
 *
 * Handles passwordless authentication for admin dashboard users
 * using magic link (email-based) authentication.
 */

import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
  createMagicLink,
  getMagicLinkByToken,
  markMagicLinkUsed,
  cleanupExpiredMagicLinks,
  getAdminUserByEmail,
  createAdminUser,
  updateAdminLastLogin,
  getAdminUserById,
} from './dataService';
import { AdminUser } from '../types';

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'admin-jwt-secret-change-in-production';
const JWT_EXPIRATION = '24h';
const MAGIC_LINK_EXPIRATION_MINUTES = 15;
const ADMIN_BASE_URL = process.env.ADMIN_BASE_URL || 'http://localhost:3000';

/**
 * Generate a cryptographically secure token
 */
function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a token for storage
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Request a magic link for an email address
 * Returns the magic link URL (in production, this would be emailed)
 */
export async function requestMagicLink(email: string): Promise<{
  success: boolean;
  message: string;
  magicLinkUrl?: string; // Only included in dev/test mode
}> {
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { success: false, message: 'Invalid email format' };
  }

  // Check if user exists
  let user = await getAdminUserByEmail(email);

  // For now, auto-create admin user if they don't exist
  // In production, you'd want to validate against an allowlist
  if (!user) {
    // Only allow specific domains in production
    const allowedDomains = process.env.ADMIN_ALLOWED_DOMAINS?.split(',') || ['example.com'];
    const emailDomain = email.split('@')[1];

    if (process.env.NODE_ENV === 'production' && !allowedDomains.includes(emailDomain)) {
      return { success: false, message: 'Email domain not authorized for admin access' };
    }

    // Create new admin user
    user = await createAdminUser(email, undefined, 'admin');
  }

  if (!user.is_active) {
    return { success: false, message: 'User account is deactivated' };
  }

  // Generate magic link token
  const token = generateSecureToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRATION_MINUTES * 60 * 1000);

  // Store magic link
  await createMagicLink(email, tokenHash, expiresAt);

  // Build magic link URL
  const magicLinkUrl = `${ADMIN_BASE_URL}/auth/verify?token=${token}&email=${encodeURIComponent(email)}`;

  // In production, send email here instead of returning URL
  if (process.env.NODE_ENV === 'production') {
    // TODO: Integrate with email service (SendGrid, SES, etc.)
    console.log(`Magic link generated for ${email}`);
    return {
      success: true,
      message: 'Magic link sent to your email. Check your inbox.',
    };
  }

  // In dev mode, return the URL directly
  return {
    success: true,
    message: 'Magic link generated (dev mode)',
    magicLinkUrl,
  };
}

/**
 * Verify a magic link token and return a JWT
 */
export async function verifyMagicLink(token: string, email: string): Promise<{
  success: boolean;
  message: string;
  jwt?: string;
  user?: AdminUser;
}> {
  // Hash the token to compare with stored hash
  const tokenHash = hashToken(token);

  // Look up the magic link
  const magicLink = await getMagicLinkByToken(tokenHash);

  if (!magicLink) {
    return { success: false, message: 'Invalid or expired magic link' };
  }

  // Verify email matches
  if (magicLink.email.toLowerCase() !== email.toLowerCase()) {
    return { success: false, message: 'Email mismatch' };
  }

  // Check if already used
  if (magicLink.used_at) {
    return { success: false, message: 'Magic link already used' };
  }

  // Check if expired
  if (new Date(magicLink.expires_at) < new Date()) {
    return { success: false, message: 'Magic link has expired' };
  }

  // Mark as used
  await markMagicLinkUsed(magicLink.link_id);

  // Get user
  const user = await getAdminUserByEmail(email);
  if (!user) {
    return { success: false, message: 'User not found' };
  }

  // Update last login
  await updateAdminLastLogin(user.user_id);

  // Generate JWT
  const jwtToken = jwt.sign(
    {
      userId: user.user_id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRATION }
  );

  return {
    success: true,
    message: 'Authentication successful',
    jwt: jwtToken,
    user: {
      ...user,
      last_login_at: new Date(),
    },
  };
}

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
 * Clean up expired magic links (call from cron job)
 */
export async function cleanupExpiredLinks(): Promise<number> {
  return cleanupExpiredMagicLinks();
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
