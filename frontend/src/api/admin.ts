/**
 * Admin API Client
 *
 * API functions for admin dashboard and multi-tenant operations
 */

import apiClient from './client';
import {
  ApiResponse,
  Organization,
  OrganizationStats,
  GlobalMappingTemplate,
  ClientMappingOverride,
  MergedMapping,
  OrgConnectionStatus,
  QBOCustomer,
  QBOItem,
  FieldMapping,
  WebhookSource,
  WebhookPayload,
  SyncLog,
  ApiKey,
  CreateApiKeyResult,
  RotateApiKeyResult,
  CreateApiKeyInput,
  TenantConnectionStatus,
  SystemHealthResponse,
  TokenExpiryAlert,
  RecentSyncFailure,
} from '../types';

// =============================================================================
// ORGANIZATIONS
// =============================================================================

export async function getOrganizations(): Promise<Organization[]> {
  const response = await apiClient.get<ApiResponse<Organization[]>>('/admin/organizations');
  return response.data.data || [];
}

export async function getOrganization(orgId: string): Promise<Organization> {
  const response = await apiClient.get<ApiResponse<Organization>>(`/admin/organizations/${orgId}`);
  return response.data.data!;
}

export async function createOrganization(data: {
  name: string;
  slug: string;
  plan_tier?: Organization['plan_tier'];
}): Promise<Organization> {
  const response = await apiClient.post<ApiResponse<Organization>>('/admin/organizations', data);
  return response.data.data!;
}

export async function updateOrganization(
  orgId: string,
  data: Partial<Organization>
): Promise<void> {
  await apiClient.put(`/admin/organizations/${orgId}`, data);
}

export async function getOrganizationStats(orgId: string): Promise<OrganizationStats> {
  const response = await apiClient.get<ApiResponse<OrganizationStats>>(
    `/admin/organizations/${orgId}/stats`
  );
  return response.data.data!;
}

// =============================================================================
// GLOBAL TEMPLATES
// =============================================================================

export async function getGlobalTemplates(sourceType?: string): Promise<GlobalMappingTemplate[]> {
  const params = sourceType ? `?sourceType=${sourceType}` : '';
  const response = await apiClient.get<ApiResponse<GlobalMappingTemplate[]>>(
    `/admin/templates${params}`
  );
  return response.data.data || [];
}

export async function getGlobalTemplate(templateId: string): Promise<GlobalMappingTemplate> {
  const response = await apiClient.get<ApiResponse<GlobalMappingTemplate>>(
    `/admin/templates/${templateId}`
  );
  return response.data.data!;
}

export async function createGlobalTemplate(data: {
  name: string;
  source_type: string;
  description?: string;
  field_mappings: FieldMapping[];
  static_values?: Record<string, unknown>;
  priority?: number;
}): Promise<GlobalMappingTemplate> {
  const response = await apiClient.post<ApiResponse<GlobalMappingTemplate>>(
    '/admin/templates',
    data
  );
  return response.data.data!;
}

export async function updateGlobalTemplate(
  templateId: string,
  data: Partial<GlobalMappingTemplate>
): Promise<void> {
  await apiClient.put(`/admin/templates/${templateId}`, data);
}

// =============================================================================
// V1 MULTI-TENANT API
// =============================================================================

/**
 * Get connection status for an organization by slug
 */
export async function getOrgStatus(clientSlug: string): Promise<OrgConnectionStatus> {
  const response = await apiClient.get<ApiResponse<OrgConnectionStatus>>(
    `/v1/org/${clientSlug}/status`
  );
  return response.data.data!;
}

/**
 * Get OAuth connect URL for an organization
 */
export function getConnectUrl(clientSlug: string, source: 'admin' | 'public' = 'admin'): string {
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
  return `${baseUrl}/v1/connect/${clientSlug}?source=${source}`;
}

/**
 * Disconnect organization from QBO
 */
export async function disconnectOrg(clientSlug: string): Promise<void> {
  await apiClient.post(`/v1/org/${clientSlug}/disconnect`);
}

/**
 * Get QBO customers for an organization
 */
export async function getOrgCustomers(
  clientSlug: string,
  search?: string
): Promise<QBOCustomer[]> {
  const params = search ? `?search=${encodeURIComponent(search)}` : '';
  const response = await apiClient.get<ApiResponse<QBOCustomer[]>>(
    `/v1/org/${clientSlug}/qbo/customers${params}`
  );
  return response.data.data || [];
}

/**
 * Get QBO items for an organization
 */
export async function getOrgItems(clientSlug: string, search?: string): Promise<QBOItem[]> {
  const params = search ? `?search=${encodeURIComponent(search)}` : '';
  const response = await apiClient.get<ApiResponse<QBOItem[]>>(
    `/v1/org/${clientSlug}/qbo/items${params}`
  );
  return response.data.data || [];
}

/**
 * Get webhook sources for an organization
 */
export async function getOrgSources(clientSlug: string): Promise<WebhookSource[]> {
  const response = await apiClient.get<ApiResponse<WebhookSource[]>>(
    `/v1/webhook/${clientSlug}/sources`
  );
  return response.data.data || [];
}

// =============================================================================
// CLIENT MAPPING OVERRIDES
// =============================================================================

export async function getClientOverrides(orgId: string, sourceId?: string): Promise<ClientMappingOverride[]> {
  const params = sourceId ? `?sourceId=${sourceId}` : '';
  const response = await apiClient.get<ApiResponse<ClientMappingOverride[]>>(
    `/admin/organizations/${orgId}/mappings${params}`
  );
  return response.data.data || [];
}

export async function createClientOverride(
  orgId: string,
  data: {
    source_id?: string;
    template_id?: string;
    name: string;
    description?: string;
    field_mappings: FieldMapping[];
    static_values?: Record<string, unknown>;
    priority?: number;
  }
): Promise<ClientMappingOverride> {
  const response = await apiClient.post<ApiResponse<ClientMappingOverride>>(
    `/admin/organizations/${orgId}/mappings`,
    data
  );
  return response.data.data!;
}

export async function updateClientOverride(
  orgId: string,
  overrideId: string,
  data: Partial<ClientMappingOverride>
): Promise<void> {
  await apiClient.put(`/admin/organizations/${orgId}/mappings/${overrideId}`, data);
}

export async function deleteClientOverride(orgId: string, overrideId: string): Promise<void> {
  await apiClient.delete(`/admin/organizations/${orgId}/mappings/${overrideId}`);
}

/**
 * Get latest webhook payload for a source
 */
export async function getLatestPayload(orgId: string, sourceId: string): Promise<WebhookPayload | null> {
  const response = await apiClient.get<ApiResponse<WebhookPayload | null>>(
    `/admin/organizations/${orgId}/sources/${sourceId}/latest-payload`
  );
  return response.data.data || null;
}

// =============================================================================
// EFFECTIVE MAPPING
// =============================================================================

export async function getEffectiveMapping(
  orgId: string,
  sourceId: string
): Promise<MergedMapping | null> {
  const response = await apiClient.get<ApiResponse<MergedMapping>>(
    `/admin/organizations/${orgId}/sources/${sourceId}/effective-mapping`
  );
  return response.data.data || null;
}

// =============================================================================
// PAYLOAD & LOGS (per org)
// =============================================================================

export async function getOrgPayloads(
  orgId: string,
  sourceId: string,
  limit?: number
): Promise<WebhookPayload[]> {
  const params = limit ? `?limit=${limit}` : '';
  const response = await apiClient.get<ApiResponse<WebhookPayload[]>>(
    `/admin/organizations/${orgId}/sources/${sourceId}/payloads${params}`
  );
  return response.data.data || [];
}

export async function getOrgSyncLogs(
  orgId: string,
  limit?: number,
  sourceId?: string
): Promise<SyncLog[]> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', limit.toString());
  if (sourceId) params.set('sourceId', sourceId);
  const queryString = params.toString() ? `?${params.toString()}` : '';

  const response = await apiClient.get<ApiResponse<SyncLog[]>>(
    `/admin/organizations/${orgId}/logs${queryString}`
  );
  return response.data.data || [];
}

// =============================================================================
// API KEYS
// =============================================================================

/**
 * List all API keys for an organization
 */
export async function getApiKeys(orgId: string): Promise<ApiKey[]> {
  const response = await apiClient.get<ApiResponse<ApiKey[]>>(
    `/admin/organizations/${orgId}/api-keys`
  );
  return response.data.data || [];
}

/**
 * Get details of a specific API key
 */
export async function getApiKey(orgId: string, keyId: string): Promise<ApiKey> {
  const response = await apiClient.get<ApiResponse<ApiKey>>(
    `/admin/organizations/${orgId}/api-keys/${keyId}`
  );
  return response.data.data!;
}

/**
 * Create a new API key for an organization
 * Returns the full key - save it immediately as it won't be shown again!
 */
export async function createApiKey(
  orgId: string,
  data: CreateApiKeyInput
): Promise<CreateApiKeyResult> {
  const response = await apiClient.post<ApiResponse<CreateApiKeyResult>>(
    `/admin/organizations/${orgId}/api-keys`,
    data
  );
  return response.data.data!;
}

/**
 * Rotate an API key - generates a new key with optional grace period
 * Returns the new full key - save it immediately!
 */
export async function rotateApiKey(
  orgId: string,
  keyId: string,
  gracePeriodHours: number = 24
): Promise<RotateApiKeyResult> {
  const response = await apiClient.post<ApiResponse<RotateApiKeyResult>>(
    `/admin/organizations/${orgId}/api-keys/${keyId}/rotate`,
    { grace_period_hours: gracePeriodHours }
  );
  return response.data.data!;
}

/**
 * Revoke an API key immediately
 */
export async function revokeApiKey(orgId: string, keyId: string): Promise<void> {
  await apiClient.delete(`/admin/organizations/${orgId}/api-keys/${keyId}`);
}

/**
 * List all global admin API keys (super_admin only)
 */
export async function getGlobalApiKeys(): Promise<ApiKey[]> {
  const response = await apiClient.get<ApiResponse<ApiKey[]>>('/admin/global/api-keys');
  return response.data.data || [];
}

/**
 * Create a global admin API key (super_admin only)
 */
export async function createGlobalApiKey(name: string): Promise<CreateApiKeyResult> {
  const response = await apiClient.post<ApiResponse<CreateApiKeyResult>>(
    '/admin/global/api-keys',
    { name }
  );
  return response.data.data!;
}

// =============================================================================
// SYSTEM MONITORING
// =============================================================================

/**
 * Get connection status for all tenants
 */
export async function getSystemConnections(): Promise<TenantConnectionStatus[]> {
  const response = await apiClient.get<ApiResponse<TenantConnectionStatus[]>>(
    '/admin/system/connections'
  );
  return response.data.data || [];
}

/**
 * Get system health summary and issues
 */
export async function getSystemHealth(): Promise<SystemHealthResponse> {
  const response = await apiClient.get<ApiResponse<SystemHealthResponse>>(
    '/admin/system/health'
  );
  return response.data.data!;
}

/**
 * Get tokens expiring within specified hours
 */
export async function getExpiringTokens(withinHours: number = 24): Promise<TokenExpiryAlert[]> {
  const response = await apiClient.get<ApiResponse<TokenExpiryAlert[]>>(
    `/admin/system/alerts/tokens?hours=${withinHours}`
  );
  return response.data.data || [];
}

/**
 * Get recent sync failures across all organizations
 */
export async function getRecentSyncFailures(limit: number = 20): Promise<RecentSyncFailure[]> {
  const response = await apiClient.get<ApiResponse<RecentSyncFailure[]>>(
    `/admin/system/alerts/failures?limit=${limit}`
  );
  return response.data.data || [];
}

// =============================================================================
// AUTHENTICATION
// =============================================================================

export interface AdminUser {
  user_id: string;
  email: string;
  name?: string;
  role: 'admin' | 'super_admin';
  is_active: boolean;
  last_login_at?: string;
  created_at: string;
}

/**
 * Get current authenticated admin user
 * Uses session cookie automatically
 */
export async function getCurrentUser(): Promise<AdminUser | null> {
  try {
    const response = await apiClient.get<ApiResponse<AdminUser>>('/admin/auth/me');
    return response.data.data || null;
  } catch (error) {
    // Not authenticated
    return null;
  }
}

/**
 * Logout - clears session cookie
 */
export async function logout(): Promise<void> {
  await apiClient.post('/admin/auth/logout');
}

/**
 * Refresh session (heartbeat)
 * Call periodically to keep session alive
 */
export async function refreshSession(): Promise<boolean> {
  try {
    await apiClient.post('/admin/auth/refresh');
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get auth status (what providers are available)
 */
export async function getAuthStatus(): Promise<{
  microsoft: { configured: boolean };
  magicLink: { enabled: boolean };
}> {
  const response = await apiClient.get<ApiResponse<{
    microsoft: { configured: boolean };
    magicLink: { enabled: boolean };
  }>>('/admin/auth/status');
  return response.data.data!;
}

/**
 * Get Microsoft SSO login URL
 * Redirects browser to Microsoft for authentication
 */
export function getMicrosoftLoginUrl(): string {
  const baseUrl = import.meta.env.VITE_API_URL || '/api';
  return `${baseUrl}/admin/auth/microsoft`;
}
