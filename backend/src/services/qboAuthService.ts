import OAuthClient from 'intuit-oauth';
import CryptoJS from 'crypto-js';
import config from '../config';
import {
  legacySaveToken,
  legacyGetActiveToken,
  updateToken,
  DEFAULT_ORGANIZATION_ID,
} from './dataService';

// Initialize OAuth client
const oauthClient = new OAuthClient({
  clientId: config.qbo.clientId,
  clientSecret: config.qbo.clientSecret,
  environment: config.qbo.environment as 'sandbox' | 'production',
  redirectUri: config.qbo.redirectUri,
});

// Encrypt token for storage
function encryptToken(token: string): string {
  return CryptoJS.AES.encrypt(token, config.encryptionKey).toString();
}

// Decrypt token from storage
function decryptToken(encryptedToken: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedToken, config.encryptionKey);
  return bytes.toString(CryptoJS.enc.Utf8);
}

// Get authorization URL
export function getAuthorizationUrl(): string {
  return oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state: 'qbo-webhook-mapper',
  });
}

// Handle OAuth callback and exchange code for tokens
export async function handleCallback(url: string): Promise<{
  realmId: string;
  accessToken: string;
  refreshToken: string;
}> {
  const authResponse = await oauthClient.createToken(url);
  const token = authResponse.getJson();

  const realmId = oauthClient.getToken().realmId;
  if (!realmId) {
    throw new Error('No realmId received from QuickBooks');
  }

  // Calculate expiration dates
  const accessTokenExpiresAt = new Date(Date.now() + (token.expires_in || 3600) * 1000);
  const refreshTokenExpiresAt = new Date(Date.now() + (token.x_refresh_token_expires_in || 8726400) * 1000);

  // Save encrypted tokens to storage (uses DEFAULT_ORGANIZATION_ID for legacy routes)
  await legacySaveToken({
    realm_id: realmId,
    access_token: encryptToken(token.access_token),
    refresh_token: encryptToken(token.refresh_token),
    access_token_expires_at: accessTokenExpiresAt,
    refresh_token_expires_at: refreshTokenExpiresAt,
    token_type: token.token_type || 'Bearer',
    scope: Array.isArray(token.scope) ? token.scope.join(' ') : token.scope,
    is_active: true,
  });

  return {
    realmId,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
  };
}

// Get active token, refreshing if necessary
export async function getValidToken(): Promise<{
  accessToken: string;
  realmId: string;
} | null> {
  const storedToken = await legacyGetActiveToken();
  if (!storedToken) {
    return null;
  }

  const decryptedAccessToken = decryptToken(storedToken.access_token);
  const decryptedRefreshToken = decryptToken(storedToken.refresh_token);

  // Check if access token is expired (with 5 min buffer)
  const expiresAt = new Date(storedToken.access_token_expires_at);
  const isExpired = expiresAt.getTime() - Date.now() < 5 * 60 * 1000;

  if (!isExpired) {
    // Token is still valid
    oauthClient.setToken({
      access_token: decryptedAccessToken,
      refresh_token: decryptedRefreshToken,
      token_type: storedToken.token_type,
      expires_in: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
      realmId: storedToken.realm_id,
    });

    return {
      accessToken: decryptedAccessToken,
      realmId: storedToken.realm_id,
    };
  }

  // Token is expired, refresh it
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
    await updateToken(DEFAULT_ORGANIZATION_ID, storedToken.token_id, {
      access_token: encryptToken(newToken.access_token),
      refresh_token: encryptToken(newToken.refresh_token),
      access_token_expires_at: newAccessTokenExpiresAt,
    });

    return {
      accessToken: newToken.access_token,
      realmId: storedToken.realm_id,
    };
  } catch (error) {
    console.error('Failed to refresh token:', error);
    // Mark token as inactive
    await updateToken(DEFAULT_ORGANIZATION_ID, storedToken.token_id, { is_active: false });
    return null;
  }
}

// Get connection status
export async function getConnectionStatus(): Promise<{
  connected: boolean;
  realmId?: string;
  expiresAt?: Date;
}> {
  const token = await legacyGetActiveToken();
  if (!token) {
    return { connected: false };
  }

  return {
    connected: true,
    realmId: token.realm_id,
    expiresAt: new Date(token.access_token_expires_at),
  };
}

// Disconnect (revoke tokens)
export async function disconnect(): Promise<void> {
  const token = await legacyGetActiveToken();
  if (!token) {
    return;
  }

  try {
    const decryptedAccessToken = decryptToken(token.access_token);
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
  await updateToken(DEFAULT_ORGANIZATION_ID, token.token_id, { is_active: false });
}

// Get OAuth client for making API calls
export function getOAuthClient(): OAuthClient {
  return oauthClient;
}
