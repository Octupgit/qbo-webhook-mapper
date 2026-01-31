/**
 * Multi-Tenant Auth Service
 *
 * Handles per-organization OAuth flows for QuickBooks Online.
 * Each organization has its own OAuth token stored separately.
 *
 * IMPORTANT: Uses OAuth client factory pattern to avoid race conditions
 * in concurrent multi-tenant OAuth flows.
 */

import OAuthClient from 'intuit-oauth';
import CryptoJS from 'crypto-js';
import crypto from 'crypto';
import config from '../config';
import {
  saveToken,
  getActiveToken,
  updateToken,
  getOrganizationById,
  getOrganizationBySlug,
  getTokensExpiringWithin,
} from './dataService';
import { OAuthToken, Organization } from '../types';

// State signing key for OAuth state parameter
const STATE_SIGNING_KEY = process.env.OAUTH_STATE_SECRET || config.encryptionKey;

// Warn if using fallback key
if (!process.env.OAUTH_STATE_SECRET) {
  console.warn(
    '⚠️  OAUTH_STATE_SECRET not set, falling back to ENCRYPTION_KEY. Set a dedicated secret in production.'
  );
}

/**
 * Create a fresh OAuth client instance
 * Uses factory pattern to avoid singleton race conditions
 */
function createOAuthClient(): OAuthClient {
  // Debug: Log OAuth config (mask secrets)
  console.log('[OAuth] Creating client with config:', {
    clientId: config.qbo.clientId ? `${config.qbo.clientId.substring(0, 8)}...` : 'MISSING',
    clientSecret: config.qbo.clientSecret ? '***SET***' : 'MISSING',
    environment: config.qbo.environment,
    redirectUri: config.qbo.redirectUri,
  });

  // Validate required config
  if (!config.qbo.clientId || config.qbo.clientId === 'your_sandbox_client_id') {
    console.error('[OAuth] ERROR: QBO_CLIENT_ID is not set or is using placeholder value!');
    console.error('[OAuth] Please set QBO_CLIENT_ID in your .env file with a real Intuit Developer credential.');
  }

  return new OAuthClient({
    clientId: config.qbo.clientId,
    clientSecret: config.qbo.clientSecret,
    environment: config.qbo.environment as 'sandbox' | 'production',
    redirectUri: config.qbo.redirectUri,
  });
}

// Encrypt token for storage
function encryptToken(token: string): string {
  return CryptoJS.AES.encrypt(token, config.encryptionKey).toString();
}

// Decrypt token from storage
function decryptToken(encryptedToken: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedToken, config.encryptionKey);
  return bytes.toString(CryptoJS.enc.Utf8);
}

// Generate HMAC for state validation
function signState(data: string): string {
  return crypto.createHmac('sha256', STATE_SIGNING_KEY).update(data).digest('hex');
}

// Verify state signature using timing-safe comparison
function verifyStateSignature(data: string, signature: string): boolean {
  const expected = signState(data);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    // Length mismatch - signatures don't match
    return false;
  }
}

/**
 * Encode OAuth state with organization info and signature
 */
function encodeOAuthState(organizationId: string, slug: string): string {
  const timestamp = Date.now();
  const data = JSON.stringify({ org_id: organizationId, slug, timestamp });
  const signature = signState(data);
  const state = Buffer.from(JSON.stringify({ data, signature })).toString('base64');
  return state;
}

/**
 * Decode and verify OAuth state
 */
function decodeOAuthState(state: string): {
  valid: boolean;
  organizationId?: string;
  slug?: string;
  error?: string;
} {
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
    const { data, signature } = decoded;

    // Verify signature
    if (!verifyStateSignature(data, signature)) {
      console.warn('OAuth state signature verification failed');
      return { valid: false, error: 'Invalid state signature' };
    }

    const parsed = JSON.parse(data);

    // Check timestamp (state should not be older than 30 minutes)
    const age = Date.now() - parsed.timestamp;
    if (age > 30 * 60 * 1000) {
      console.warn(`OAuth state expired: ${age}ms old`);
      return { valid: false, error: 'State expired' };
    }

    return {
      valid: true,
      organizationId: parsed.org_id,
      slug: parsed.slug,
    };
  } catch (error) {
    // Log specific error for debugging
    console.error('OAuth state decode error:', error instanceof Error ? error.message : error);
    return { valid: false, error: 'Invalid state format' };
  }
}

/**
 * Get authorization URL for a specific organization
 */
export async function getAuthorizationUrl(organizationIdOrSlug: string): Promise<{
  success: boolean;
  authUrl?: string;
  error?: string;
}> {
  console.log('[OAuth] getAuthorizationUrl called for:', organizationIdOrSlug);

  // Try to find organization by ID first, then by slug
  let org: Organization | null = await getOrganizationById(organizationIdOrSlug);
  if (!org) {
    org = await getOrganizationBySlug(organizationIdOrSlug);
  }

  if (!org) {
    console.log('[OAuth] Organization not found:', organizationIdOrSlug);
    return { success: false, error: 'Organization not found' };
  }

  if (!org.is_active) {
    console.log('[OAuth] Organization is deactivated:', org.slug);
    return { success: false, error: 'Organization is deactivated' };
  }

  // Validate OAuth config before proceeding
  if (!config.qbo.clientId || config.qbo.clientId === 'your_sandbox_client_id') {
    console.error('[OAuth] FATAL: Cannot generate auth URL - QBO_CLIENT_ID is not configured!');
    return {
      success: false,
      error: 'QuickBooks OAuth is not configured. Please set QBO_CLIENT_ID in the server environment.',
    };
  }

  // Generate signed state parameter
  const state = encodeOAuthState(org.organization_id, org.slug);

  // Create fresh OAuth client for this request
  const oauthClient = createOAuthClient();

  const authUrl = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state,
  });

  console.log('[OAuth] Generated auth URL for org:', org.slug);
  console.log('[OAuth] Auth URL preview:', authUrl.substring(0, 100) + '...');

  return { success: true, authUrl };
}

/**
 * Handle OAuth callback for multi-tenant flow
 */
export async function handleCallback(url: string): Promise<{
  success: boolean;
  organizationId?: string;
  slug?: string;
  realmId?: string;
  companyName?: string;
  error?: string;
}> {
  // Create fresh OAuth client for this callback
  const oauthClient = createOAuthClient();

  try {
    // Extract state from URL
    const urlObj = new URL(url, 'http://localhost');
    const state = urlObj.searchParams.get('state');

    if (!state) {
      return { success: false, error: 'Missing state parameter' };
    }

    // Decode and verify state
    const stateResult = decodeOAuthState(state);
    if (!stateResult.valid) {
      return { success: false, error: stateResult.error };
    }

    const organizationId = stateResult.organizationId!;
    const slug = stateResult.slug;

    // Verify organization exists and is active
    const org = await getOrganizationById(organizationId);
    if (!org || !org.is_active) {
      return { success: false, error: 'Organization not found or inactive' };
    }

    // Exchange code for tokens
    const authResponse = await oauthClient.createToken(url);
    const token = authResponse.getJson();

    const realmId = oauthClient.getToken().realmId;
    if (!realmId) {
      return { success: false, error: 'No realmId received from QuickBooks' };
    }

    // Get company info to cache company name
    let companyName: string | undefined;
    try {
      companyName = await getCompanyInfoFromToken(realmId, token.access_token);
    } catch {
      // Non-fatal: we can continue without company name
      console.warn('Failed to fetch company name during OAuth callback');
    }

    // Calculate expiration dates
    const accessTokenExpiresAt = new Date(Date.now() + (token.expires_in || 3600) * 1000);
    const refreshTokenExpiresAt = new Date(
      Date.now() + (token.x_refresh_token_expires_in || 8726400) * 1000
    );

    // Save encrypted tokens to storage
    await saveToken(organizationId, {
      realm_id: realmId,
      access_token: encryptToken(token.access_token),
      refresh_token: encryptToken(token.refresh_token),
      access_token_expires_at: accessTokenExpiresAt,
      refresh_token_expires_at: refreshTokenExpiresAt,
      token_type: token.token_type || 'Bearer',
      scope: Array.isArray(token.scope) ? token.scope.join(' ') : token.scope,
      qbo_company_name: companyName,
      sync_status: 'active',
      is_active: true,
    });

    return {
      success: true,
      organizationId,
      slug,
      realmId,
      companyName,
    };
  } catch (error) {
    console.error('OAuth callback error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'OAuth callback failed',
    };
  }
}

/**
 * Get valid token for an organization, refreshing if necessary
 */
export async function getValidToken(organizationId: string): Promise<{
  success: boolean;
  accessToken?: string;
  realmId?: string;
  error?: string;
}> {
  const storedToken = await getActiveToken(organizationId);
  if (!storedToken) {
    return { success: false, error: 'No active token found' };
  }

  const decryptedAccessToken = decryptToken(storedToken.access_token);
  const decryptedRefreshToken = decryptToken(storedToken.refresh_token);

  // Check if access token is expired (with 5 min buffer)
  const expiresAt = new Date(storedToken.access_token_expires_at);
  const isExpired = expiresAt.getTime() - Date.now() < 5 * 60 * 1000;

  if (!isExpired) {
    // Token is still valid
    return {
      success: true,
      accessToken: decryptedAccessToken,
      realmId: storedToken.realm_id,
    };
  }

  // Token is expired, refresh it using a fresh client
  const oauthClient = createOAuthClient();

  try {
    oauthClient.setToken({
      access_token: decryptedAccessToken,
      refresh_token: decryptedRefreshToken,
      token_type: storedToken.token_type,
      realmId: storedToken.realm_id,
    });

    const authResponse = await oauthClient.refresh();
    const newToken = authResponse.getJson();

    const newAccessTokenExpiresAt = new Date(Date.now() + (newToken.expires_in || 3600) * 1000);

    // Update token in database
    await updateToken(organizationId, storedToken.token_id, {
      access_token: encryptToken(newToken.access_token),
      refresh_token: encryptToken(newToken.refresh_token),
      access_token_expires_at: newAccessTokenExpiresAt,
      sync_status: 'active',
    });

    return {
      success: true,
      accessToken: newToken.access_token,
      realmId: storedToken.realm_id,
    };
  } catch (error) {
    console.error('Failed to refresh token:', error);

    // Mark token as expired/error
    await updateToken(organizationId, storedToken.token_id, {
      sync_status: 'expired',
      is_active: false,
    });

    return {
      success: false,
      error: 'Token refresh failed. Please reconnect to QuickBooks.',
    };
  }
}

/**
 * Get connection status for an organization
 */
export async function getConnectionStatus(organizationId: string): Promise<{
  connected: boolean;
  realmId?: string;
  companyName?: string;
  expiresAt?: Date;
  syncStatus?: 'active' | 'expired' | 'error';
}> {
  const token = await getActiveToken(organizationId);
  if (!token) {
    return { connected: false };
  }

  return {
    connected: true,
    realmId: token.realm_id,
    companyName: token.qbo_company_name,
    expiresAt: new Date(token.access_token_expires_at),
    syncStatus: token.sync_status as 'active' | 'expired' | 'error',
  };
}

/**
 * Disconnect an organization from QuickBooks
 */
export async function disconnect(organizationId: string): Promise<void> {
  const token = await getActiveToken(organizationId);
  if (!token) {
    return;
  }

  try {
    const decryptedAccessToken = decryptToken(token.access_token);

    // Create fresh client for revocation
    const oauthClient = createOAuthClient();
    oauthClient.setToken({
      access_token: decryptedAccessToken,
      refresh_token: decryptToken(token.refresh_token),
      realmId: token.realm_id,
    });

    await oauthClient.revoke({ access_token: decryptedAccessToken });
  } catch (error) {
    console.error('Failed to revoke token:', error);
  }

  // Mark token as inactive
  await updateToken(organizationId, token.token_id, { is_active: false });
}

/**
 * Refresh all tokens that are about to expire (for cron job)
 */
export async function refreshExpiringTokens(withinMinutes: number = 60): Promise<{
  refreshed: number;
  failed: number;
  errors: Array<{ organizationId: string; error: string }>;
}> {
  const expiringTokens = await getTokensExpiringWithin(withinMinutes);
  let refreshed = 0;
  let failed = 0;
  const errors: Array<{ organizationId: string; error: string }> = [];

  for (const token of expiringTokens) {
    const result = await getValidToken(token.organization_id);
    if (result.success) {
      refreshed++;
    } else {
      failed++;
      errors.push({
        organizationId: token.organization_id,
        error: result.error || 'Unknown error',
      });
    }
  }

  return { refreshed, failed, errors };
}

/**
 * Get company info from QuickBooks (internal helper)
 */
async function getCompanyInfoFromToken(
  realmId: string,
  accessToken: string
): Promise<string | undefined> {
  try {
    const baseUrl =
      config.qbo.environment === 'sandbox'
        ? 'https://sandbox-quickbooks.api.intuit.com'
        : 'https://quickbooks.api.intuit.com';

    const response = await fetch(
      `${baseUrl}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=65`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      return undefined;
    }

    const data = (await response.json()) as {
      CompanyInfo?: { CompanyName?: string };
    };
    return data.CompanyInfo?.CompanyName;
  } catch {
    return undefined;
  }
}

/**
 * Get OAuth client for making API calls (with org context)
 * Returns a fresh client instance configured with the org's token
 */
export async function getOAuthClientForOrg(organizationId: string): Promise<{
  success: boolean;
  client?: OAuthClient;
  realmId?: string;
  error?: string;
}> {
  const tokenResult = await getValidToken(organizationId);
  if (!tokenResult.success) {
    return { success: false, error: tokenResult.error };
  }

  // Create fresh client for this org
  const oauthClient = createOAuthClient();
  oauthClient.setToken({
    access_token: tokenResult.accessToken!,
    realmId: tokenResult.realmId,
  });

  return {
    success: true,
    client: oauthClient,
    realmId: tokenResult.realmId,
  };
}
