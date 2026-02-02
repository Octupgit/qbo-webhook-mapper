/**
 * Admin Auth Service
 *
 * Handles email/password authentication for admin dashboard users.
 * Uses bcrypt for password hashing and JWT for session tokens.
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import {
  getAdminUserById,
  getAdminUserByEmail,
  updateAdminUser,
  updateAdminLastLogin,
} from './dataService';
import { AdminUser } from '../types';

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'admin-jwt-secret-change-in-production';
const JWT_EXPIRATION = '12h'; // 12 hours for admin sessions
const BCRYPT_ROUNDS = 10;

// Password validation regex: min 8 chars, 1 uppercase, 1 number
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Validate password meets requirements
 */
export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }
  if (!/\d/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }
  return { valid: true };
}

/**
 * Authenticate admin user with email and password
 */
export async function loginAdmin(email: string, password: string): Promise<{
  success: boolean;
  message: string;
  jwt?: string;
  user?: Omit<AdminUser, 'password_hash'>;
  must_change_password?: boolean;
}> {
  // Validate inputs
  if (!email || !password) {
    return { success: false, message: 'Email and password are required' };
  }

  // Find user by email
  const user = await getAdminUserByEmail(email.toLowerCase());
  if (!user) {
    return { success: false, message: 'Invalid email or password' };
  }

  // Check if user is active
  if (!user.is_active) {
    return { success: false, message: 'Account is deactivated' };
  }

  // Verify password
  if (!user.password_hash) {
    return { success: false, message: 'Account not properly configured. Contact administrator.' };
  }

  const passwordValid = await verifyPassword(password, user.password_hash);
  if (!passwordValid) {
    return { success: false, message: 'Invalid email or password' };
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

  // Return user without password_hash
  const { password_hash, ...safeUser } = user;

  return {
    success: true,
    message: 'Login successful',
    jwt: jwtToken,
    user: safeUser,
    must_change_password: user.must_change_password,
  };
}

/**
 * Change admin user password
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<{
  success: boolean;
  message: string;
}> {
  // Get user
  const user = await getAdminUserById(userId);
  if (!user) {
    return { success: false, message: 'User not found' };
  }

  // Verify current password (skip if must_change_password is true - first login)
  if (!user.must_change_password) {
    if (!user.password_hash) {
      return { success: false, message: 'Account not properly configured' };
    }
    const currentValid = await verifyPassword(currentPassword, user.password_hash);
    if (!currentValid) {
      return { success: false, message: 'Current password is incorrect' };
    }
  }

  // Validate new password
  const validation = validatePassword(newPassword);
  if (!validation.valid) {
    return { success: false, message: validation.error || 'Invalid password' };
  }

  // Hash new password and update
  const newHash = await hashPassword(newPassword);
  await updateAdminUser(userId, {
    password_hash: newHash,
    must_change_password: false,
  });

  return { success: true, message: 'Password changed successfully' };
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
export async function getCurrentUser(token: string): Promise<Omit<AdminUser, 'password_hash'> | null> {
  const { valid, payload } = verifyJwt(token);
  if (!valid || !payload) {
    return null;
  }

  const user = await getAdminUserById(payload.userId);
  if (!user) {
    return null;
  }

  // Return user without password_hash
  const { password_hash, ...safeUser } = user;
  return safeUser;
}

/**
 * Refresh JWT token
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
export function isAdmin(user: AdminUser | Omit<AdminUser, 'password_hash'>): boolean {
  return user.role === 'admin' || user.role === 'super_admin';
}

/**
 * Check if user has super admin role
 */
export function isSuperAdmin(user: AdminUser | Omit<AdminUser, 'password_hash'>): boolean {
  return user.role === 'super_admin';
}
