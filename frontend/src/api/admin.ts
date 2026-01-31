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
export function getConnectUrl(clientSlug: string): string {
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
  return `${baseUrl}/v1/connect/${clientSlug}`;
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

export async function getClientOverrides(orgId: string): Promise<ClientMappingOverride[]> {
  const response = await apiClient.get<ApiResponse<ClientMappingOverride[]>>(
    `/admin/organizations/${orgId}/overrides`
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
    `/admin/organizations/${orgId}/overrides`,
    data
  );
  return response.data.data!;
}

export async function updateClientOverride(
  overrideId: string,
  data: Partial<ClientMappingOverride>
): Promise<void> {
  await apiClient.put(`/admin/overrides/${overrideId}`, data);
}

export async function deleteClientOverride(overrideId: string): Promise<void> {
  await apiClient.delete(`/admin/overrides/${overrideId}`);
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
