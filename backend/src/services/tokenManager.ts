/**
 * Token Manager Service
 *
 * Robust token management for QuickBooks Online OAuth.
 * Provides:
 * - Automatic token refresh with retry logic
 * - 401 response handling with token refresh retry
 * - Encrypted token persistence
 * - Graceful error handling with status tracking
 * - Connection health monitoring
 */

import OAuthClient from 'intuit-oauth';
import CryptoJS from 'crypto-js';
import config from '../config';
import {
  getActiveToken,
  updateToken,
  getOrganizationById,
} from './dataService';
import { OAuthToken } from '../types';

// Token refresh buffer (refresh 5 minutes before expiry)
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

// Maximum retry attempts for token refresh
const MAX_REFRESH_RETRIES = 2;

// Token status types
export type TokenStatus = 'active' | 'expired' | 'revoked' | 'refresh_failed' | 'disconnected';

// Error codes for specific token issues
export const TokenErrorCodes = {
  NO_TOKEN: 'NO_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  REFRESH_FAILED: 'REFRESH_FAILED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  INVALID_GRANT: 'INVALID_GRANT',
  UNAUTHORIZED: 'UNAUTHORIZED',
} as const;

export type TokenErrorCode = typeof TokenErrorCodes[keyof typeof TokenErrorCodes];

// Token result interface
export interface TokenResult {
  success: boolean;
  accessToken?: string;
  realmId?: string;
  error?: string;
  errorCode?: TokenErrorCode;
  needsReconnect?: boolean;
}

// API call result interface
export interface ApiCallResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: TokenErrorCode;
  needsReconnect?: boolean;
  statusCode?: number;
}

/**
 * Encrypt token for secure storage
 */
export function encryptToken(token: string): string {
  if (!config.encryptionKey || config.encryptionKey === 'dev-encryption-key-change-in-prod') {
    console.warn('⚠️ Using default encryption key. Set ENCRYPTION_KEY in production!');
  }
  return CryptoJS.AES.encrypt(token, config.encryptionKey).toString();
}

/**
 * Decrypt token from storage
 */
export function decryptToken(encryptedToken: string): string {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedToken, config.encryptionKey);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    if (!decrypted) {
      throw new Error('Decryption resulted in empty string');
    }
    return decrypted;
  } catch (error) {
    console.error('Token decryption failed:', error);
    throw new Error('Failed to decrypt token. The encryption key may have changed.');
  }
}

/**
 * Create a fresh OAuth client instance
 */
function createOAuthClient(): OAuthClient {
  const backendUrl = config.backendUrl || 'http://localhost:3001';
  const redirectUri = `${backendUrl}/api/v1/oauth/callback`;

  return new OAuthClient({
    clientId: config.qbo.clientId,
    clientSecret: config.qbo.clientSecret,
    environment: config.qbo.environment as 'sandbox' | 'production',
    redirectUri,
  });
}

/**
 * Check if a token is expired or about to expire
 */
export function isTokenExpired(token: OAuthToken): boolean {
  const expiresAt = new Date(token.access_token_expires_at).getTime();
  return expiresAt - Date.now() < TOKEN_REFRESH_BUFFER_MS;
}

/**
 * Check if refresh token is expired
 */
export function isRefreshTokenExpired(token: OAuthToken): boolean {
  // If no refresh_token_expires_at, assume it's valid (some older tokens may not have this)
  if (!token.refresh_token_expires_at) {
    return false;
  }
  const expiresAt = new Date(token.refresh_token_expires_at).getTime();
  return expiresAt < Date.now();
}

/**
 * Parse OAuth error to determine the type of failure
 */
function parseOAuthError(error: unknown): {
  errorCode: TokenErrorCode;
  message: string;
  needsReconnect: boolean;
} {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStr = errorMessage.toLowerCase();

  // Check for revoked/invalid grant errors
  if (
    errorStr.includes('invalid_grant') ||
    errorStr.includes('token has been revoked') ||
    errorStr.includes('refresh token is invalid') ||
    errorStr.includes('authorization_revoked')
  ) {
    return {
      errorCode: TokenErrorCodes.TOKEN_REVOKED,
      message: 'QuickBooks connection was revoked. Please reconnect.',
      needsReconnect: true,
    };
  }

  // Check for expired token errors
  if (errorStr.includes('token expired') || errorStr.includes('access_denied')) {
    return {
      errorCode: TokenErrorCodes.TOKEN_EXPIRED,
      message: 'QuickBooks token expired. Attempting refresh...',
      needsReconnect: false,
    };
  }

  // Network errors
  if (
    errorStr.includes('network') ||
    errorStr.includes('econnrefused') ||
    errorStr.includes('timeout') ||
    errorStr.includes('enotfound')
  ) {
    return {
      errorCode: TokenErrorCodes.NETWORK_ERROR,
      message: 'Network error connecting to QuickBooks. Please try again.',
      needsReconnect: false,
    };
  }

  // Default to refresh failed
  return {
    errorCode: TokenErrorCodes.REFRESH_FAILED,
    message: `Token refresh failed: ${errorMessage}`,
    needsReconnect: true,
  };
}

/**
 * Refresh an OAuth token and persist the new tokens
 */
async function refreshToken(
  organizationId: string,
  storedToken: OAuthToken
): Promise<TokenResult> {
  const oauthClient = createOAuthClient();

  try {
    const decryptedAccessToken = decryptToken(storedToken.access_token);
    const decryptedRefreshToken = decryptToken(storedToken.refresh_token);

    // Set token on client
    oauthClient.setToken({
      access_token: decryptedAccessToken,
      refresh_token: decryptedRefreshToken,
      token_type: storedToken.token_type,
      realmId: storedToken.realm_id,
    });

    console.log(`[TokenManager] Refreshing token for org: ${organizationId}`);

    // Perform refresh
    const authResponse = await oauthClient.refresh();
    const newToken = authResponse.getJson();

    // Calculate new expiration times
    const newAccessTokenExpiresAt = new Date(
      Date.now() + (newToken.expires_in || 3600) * 1000
    );
    const newRefreshTokenExpiresAt = new Date(
      Date.now() + (newToken.x_refresh_token_expires_in || 8726400) * 1000
    );

    // CRITICAL: Persist BOTH tokens immediately after refresh
    // Intuit may return a new refresh_token that we must save
    await updateToken(organizationId, storedToken.token_id, {
      access_token: encryptToken(newToken.access_token),
      refresh_token: encryptToken(newToken.refresh_token),
      access_token_expires_at: newAccessTokenExpiresAt,
      refresh_token_expires_at: newRefreshTokenExpiresAt,
      sync_status: 'active',
    });

    console.log(`[TokenManager] Token refreshed successfully for org: ${organizationId}`);

    return {
      success: true,
      accessToken: newToken.access_token,
      realmId: storedToken.realm_id,
    };
  } catch (error) {
    const parsedError = parseOAuthError(error);
    console.error(`[TokenManager] Token refresh failed for org ${organizationId}:`, parsedError);

    // Update token status based on error type
    const newStatus: TokenStatus = parsedError.needsReconnect ? 'revoked' : 'refresh_failed';
    await updateToken(organizationId, storedToken.token_id, {
      sync_status: newStatus,
      is_active: !parsedError.needsReconnect,
    });

    // Log for monitoring/alerting
    if (parsedError.needsReconnect) {
      console.error(
        `[TokenManager] ALERT: Organization ${organizationId} needs to reconnect to QuickBooks. ` +
          `Reason: ${parsedError.message}`
      );
    }

    return {
      success: false,
      error: parsedError.message,
      errorCode: parsedError.errorCode,
      needsReconnect: parsedError.needsReconnect,
    };
  }
}

/**
 * Get a valid access token for an organization
 * Automatically refreshes if expired
 */
export async function getValidToken(
  organizationId: string,
  forceRefresh: boolean = false
): Promise<TokenResult> {
  // Get stored token
  const storedToken = await getActiveToken(organizationId);

  if (!storedToken) {
    return {
      success: false,
      error: 'No QuickBooks connection found. Please connect first.',
      errorCode: TokenErrorCodes.NO_TOKEN,
      needsReconnect: true,
    };
  }

  // Check if refresh token is expired (user needs to reconnect)
  if (isRefreshTokenExpired(storedToken)) {
    console.warn(`[TokenManager] Refresh token expired for org: ${organizationId}`);

    await updateToken(organizationId, storedToken.token_id, {
      sync_status: 'expired',
      is_active: false,
    });

    return {
      success: false,
      error: 'QuickBooks connection expired. Please reconnect.',
      errorCode: TokenErrorCodes.TOKEN_EXPIRED,
      needsReconnect: true,
    };
  }

  // Check if access token needs refresh
  if (forceRefresh || isTokenExpired(storedToken)) {
    return refreshToken(organizationId, storedToken);
  }

  // Token is valid, return it
  try {
    const decryptedAccessToken = decryptToken(storedToken.access_token);
    return {
      success: true,
      accessToken: decryptedAccessToken,
      realmId: storedToken.realm_id,
    };
  } catch (error) {
    return {
      success: false,
      error: 'Failed to decrypt stored token',
      errorCode: TokenErrorCodes.REFRESH_FAILED,
      needsReconnect: true,
    };
  }
}

/**
 * Execute a QBO API call with automatic token refresh on 401
 */
export async function executeWithTokenRefresh<T>(
  organizationId: string,
  apiCall: (accessToken: string, realmId: string) => Promise<Response>,
  parseResponse: (response: Response) => Promise<T>
): Promise<ApiCallResult<T>> {
  let retryCount = 0;

  while (retryCount <= MAX_REFRESH_RETRIES) {
    // Get valid token
    const tokenResult = await getValidToken(organizationId, retryCount > 0);

    if (!tokenResult.success) {
      return {
        success: false,
        error: tokenResult.error,
        errorCode: tokenResult.errorCode,
        needsReconnect: tokenResult.needsReconnect,
      };
    }

    try {
      // Execute the API call
      const response = await apiCall(tokenResult.accessToken!, tokenResult.realmId!);

      // Check for 401 Unauthorized
      if (response.status === 401) {
        console.warn(
          `[TokenManager] 401 Unauthorized for org ${organizationId}, attempt ${retryCount + 1}`
        );

        retryCount++;

        if (retryCount <= MAX_REFRESH_RETRIES) {
          console.log(`[TokenManager] Retrying with token refresh...`);
          continue;
        }

        // Max retries reached
        return {
          success: false,
          error: 'QuickBooks authorization failed after retry. Please reconnect.',
          errorCode: TokenErrorCodes.UNAUTHORIZED,
          needsReconnect: true,
          statusCode: 401,
        };
      }

      // Check for other error status codes
      if (!response.ok) {
        const errorBody = await response.text();
        let errorMessage = `QuickBooks API error: ${response.status}`;

        try {
          const errorJson = JSON.parse(errorBody);
          if (errorJson.Fault?.Error?.[0]?.Message) {
            errorMessage = errorJson.Fault.Error[0].Message;
          }
        } catch {
          // Use status text if JSON parsing fails
          errorMessage = `${response.status}: ${response.statusText}`;
        }

        return {
          success: false,
          error: errorMessage,
          statusCode: response.status,
        };
      }

      // Parse successful response
      const data = await parseResponse(response);

      return {
        success: true,
        data,
        statusCode: response.status,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Network error';

      // Check for network errors
      if (
        errorMessage.includes('fetch') ||
        errorMessage.includes('network') ||
        errorMessage.includes('ECONNREFUSED')
      ) {
        return {
          success: false,
          error: 'Network error connecting to QuickBooks. Please try again.',
          errorCode: TokenErrorCodes.NETWORK_ERROR,
        };
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  // Should not reach here, but return error just in case
  return {
    success: false,
    error: 'Unexpected error in token refresh loop',
    errorCode: TokenErrorCodes.REFRESH_FAILED,
  };
}

/**
 * Check the health of an organization's QBO connection
 */
export async function checkConnectionHealth(organizationId: string): Promise<{
  healthy: boolean;
  status: TokenStatus | 'not_connected';
  accessTokenExpiresAt?: Date;
  refreshTokenExpiresAt?: Date;
  companyName?: string;
  message: string;
}> {
  const storedToken = await getActiveToken(organizationId);

  if (!storedToken) {
    return {
      healthy: false,
      status: 'not_connected',
      message: 'No QuickBooks connection found',
    };
  }

  // Check refresh token expiration
  if (isRefreshTokenExpired(storedToken)) {
    return {
      healthy: false,
      status: 'expired',
      accessTokenExpiresAt: new Date(storedToken.access_token_expires_at),
      refreshTokenExpiresAt: storedToken.refresh_token_expires_at
        ? new Date(storedToken.refresh_token_expires_at)
        : undefined,
      companyName: storedToken.qbo_company_name,
      message: 'QuickBooks connection expired. Please reconnect.',
    };
  }

  // Check access token expiration
  const accessTokenExpired = isTokenExpired(storedToken);

  return {
    healthy: !accessTokenExpired || storedToken.sync_status === 'active',
    status: (storedToken.sync_status as TokenStatus) || 'active',
    accessTokenExpiresAt: new Date(storedToken.access_token_expires_at),
    refreshTokenExpiresAt: storedToken.refresh_token_expires_at
      ? new Date(storedToken.refresh_token_expires_at)
      : undefined,
    companyName: storedToken.qbo_company_name,
    message: accessTokenExpired
      ? 'Access token expired but will auto-refresh'
      : 'Connection is healthy',
  };
}

/**
 * Mark an organization's connection as disconnected
 * Call this when you detect the user revoked access from Intuit's side
 */
export async function markConnectionDisconnected(
  organizationId: string,
  reason: string
): Promise<void> {
  const storedToken = await getActiveToken(organizationId);

  if (storedToken) {
    await updateToken(organizationId, storedToken.token_id, {
      sync_status: 'disconnected',
      is_active: false,
    });

    console.error(
      `[TokenManager] Connection marked as disconnected for org ${organizationId}. Reason: ${reason}`
    );
  }
}
