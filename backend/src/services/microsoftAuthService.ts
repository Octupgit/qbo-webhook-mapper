/**
 * Microsoft SSO Auth Service
 *
 * Handles Microsoft Entra ID (Azure AD) authentication for admin users
 * using OAuth2/OpenID Connect.
 */

import { ConfidentialClientApplication, AuthorizationCodeRequest } from '@azure/msal-node';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {
  getAdminUserByEmail,
  createAdminUser,
  updateAdminLastLogin,
} from './dataService';
import { AdminUser } from '../types';

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'admin-jwt-secret-change-in-production';
const JWT_EXPIRATION = '12h'; // 12 hours for admin sessions
const ADMIN_BASE_URL = process.env.ADMIN_BASE_URL || 'http://localhost:3000';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

// Microsoft Entra ID Configuration
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || '';
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || '';
const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID || 'common';
const MICROSOFT_REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI || `${BACKEND_URL}/api/admin/auth/microsoft/callback`;

// Allowed email domains (comma-separated)
const ALLOWED_EMAIL_DOMAINS = process.env.ADMIN_ALLOWED_DOMAINS?.split(',').map(d => d.trim().toLowerCase()) || [];

// MSAL Configuration
const msalConfig = {
  auth: {
    clientId: MICROSOFT_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}`,
    clientSecret: MICROSOFT_CLIENT_SECRET,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level: number, message: string) => {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`MSAL [${level}]: ${message}`);
        }
      },
      piiLoggingEnabled: false,
      logLevel: 3, // Error only
    },
  },
};

// Create MSAL application instance
let msalClient: ConfidentialClientApplication | null = null;

function getMsalClient(): ConfidentialClientApplication {
  if (!msalClient) {
    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
      throw new Error('Microsoft SSO not configured. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET.');
    }
    msalClient = new ConfidentialClientApplication(msalConfig);
  }
  return msalClient;
}

// PKCE helper functions
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function generateState(): string {
  return crypto.randomBytes(16).toString('hex');
}

// Store PKCE verifiers temporarily (in production, use Redis or similar)
const pkceVerifiers = new Map<string, { verifier: string; challenge: string; createdAt: number }>();

// Cleanup old PKCE verifiers every 5 minutes
setInterval(() => {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [state, data] of pkceVerifiers.entries()) {
    if (data.createdAt < fiveMinutesAgo) {
      pkceVerifiers.delete(state);
    }
  }
}, 5 * 60 * 1000);

/**
 * Check if Microsoft SSO is configured
 */
export function isMicrosoftSSOConfigured(): boolean {
  return !!(MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_SECRET);
}

/**
 * Generate Microsoft login URL with PKCE
 */
export async function getMicrosoftLoginUrl(): Promise<{
  url: string;
  state: string;
}> {
  const client = getMsalClient();

  // Generate PKCE codes
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);

  // Generate state for CSRF protection
  const state = generateState();

  // Store verifier for later use
  pkceVerifiers.set(state, {
    verifier,
    challenge,
    createdAt: Date.now(),
  });

  const authCodeUrlParameters = {
    scopes: ['openid', 'profile', 'email', 'User.Read'],
    redirectUri: MICROSOFT_REDIRECT_URI,
    state,
    codeChallenge: challenge,
    codeChallengeMethod: 'S256' as const,
    prompt: 'select_account' as const,
  };

  const url = await client.getAuthCodeUrl(authCodeUrlParameters);

  return { url, state };
}

/**
 * Handle Microsoft OAuth callback
 */
export async function handleMicrosoftCallback(
  code: string,
  state: string
): Promise<{
  success: boolean;
  message: string;
  jwt?: string;
  user?: AdminUser;
  redirectUrl?: string;
}> {
  // Verify state and get PKCE verifier
  const pkceData = pkceVerifiers.get(state);
  if (!pkceData) {
    return {
      success: false,
      message: 'Invalid or expired state parameter',
      redirectUrl: `${ADMIN_BASE_URL}/login?error=invalid_state`,
    };
  }

  // Clean up used verifier
  pkceVerifiers.delete(state);

  try {
    const client = getMsalClient();

    const tokenRequest: AuthorizationCodeRequest = {
      code,
      scopes: ['openid', 'profile', 'email', 'User.Read'],
      redirectUri: MICROSOFT_REDIRECT_URI,
      codeVerifier: pkceData.verifier,
    };

    const response = await client.acquireTokenByCode(tokenRequest);

    if (!response || !response.account) {
      return {
        success: false,
        message: 'Failed to acquire token from Microsoft',
        redirectUrl: `${ADMIN_BASE_URL}/login?error=token_failed`,
      };
    }

    // Extract user info from the token response
    const email = response.account.username?.toLowerCase();
    const name = response.account.name || undefined;

    if (!email) {
      return {
        success: false,
        message: 'No email found in Microsoft response',
        redirectUrl: `${ADMIN_BASE_URL}/login?error=no_email`,
      };
    }

    // Verify user is authorized
    const authResult = await verifyAndCreateUser(email, name);

    if (!authResult.success) {
      return {
        success: false,
        message: authResult.message,
        redirectUrl: `${ADMIN_BASE_URL}/login?error=unauthorized&message=${encodeURIComponent(authResult.message)}`,
      };
    }

    // Generate JWT
    const jwtToken = jwt.sign(
      {
        userId: authResult.user!.user_id,
        email: authResult.user!.email,
        role: authResult.user!.role,
        authProvider: 'microsoft',
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRATION }
    );

    return {
      success: true,
      message: 'Authentication successful',
      jwt: jwtToken,
      user: authResult.user,
      redirectUrl: `${ADMIN_BASE_URL}/auth/callback?token=${jwtToken}`,
    };
  } catch (error) {
    console.error('Microsoft OAuth error:', error);
    return {
      success: false,
      message: 'Microsoft authentication failed',
      redirectUrl: `${ADMIN_BASE_URL}/login?error=auth_failed`,
    };
  }
}

/**
 * Verify user authorization and create if needed
 */
async function verifyAndCreateUser(
  email: string,
  name?: string
): Promise<{
  success: boolean;
  message: string;
  user?: AdminUser;
}> {
  // Check if user already exists in admin_users table
  let user = await getAdminUserByEmail(email);

  if (user) {
    // User exists - check if active
    if (!user.is_active) {
      return {
        success: false,
        message: 'User account is deactivated',
      };
    }

    // Update last login
    await updateAdminLastLogin(user.user_id);

    return {
      success: true,
      message: 'User authenticated',
      user: {
        ...user,
        last_login_at: new Date(),
      },
    };
  }

  // User doesn't exist - check if their domain is allowed
  const emailDomain = email.split('@')[1]?.toLowerCase();

  if (!emailDomain) {
    return {
      success: false,
      message: 'Invalid email format',
    };
  }

  // Check domain allowlist
  if (ALLOWED_EMAIL_DOMAINS.length > 0 && !ALLOWED_EMAIL_DOMAINS.includes(emailDomain)) {
    return {
      success: false,
      message: `Email domain '${emailDomain}' is not authorized for admin access`,
    };
  }

  // Auto-create new admin user
  user = await createAdminUser(email, name, 'admin');

  return {
    success: true,
    message: 'User created and authenticated',
    user,
  };
}

/**
 * Get Microsoft SSO configuration status
 */
export function getMicrosoftSSOStatus(): {
  configured: boolean;
  tenantId?: string;
  redirectUri?: string;
} {
  return {
    configured: isMicrosoftSSOConfigured(),
    tenantId: MICROSOFT_TENANT_ID !== 'common' ? MICROSOFT_TENANT_ID : undefined,
    redirectUri: MICROSOFT_REDIRECT_URI,
  };
}
