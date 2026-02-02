/**
 * Data Service - Multi-Tenant Data Access Layer
 *
 * Switches between BigQuery and Mock based on config.
 * All functions require organizationId for data isolation.
 * Legacy functions use DEFAULT_ORGANIZATION_ID for backward compatibility.
 */

import { DEFAULT_ORGANIZATION_ID } from '../types';

// Check if we should use mock data
const useMock = !process.env.GOOGLE_APPLICATION_CREDENTIALS ||
                process.env.GOOGLE_APPLICATION_CREDENTIALS.includes('/path/to/') ||
                process.env.USE_MOCK_DATA === 'true';

let dataService: typeof import('./bigQueryService') | typeof import('./mockDataService');

if (useMock) {
  console.log('📦 Using MOCK data service (in-memory storage)');
  dataService = require('./mockDataService');
} else {
  console.log('☁️ Using BigQuery data service');
  dataService = require('./bigQueryService');
}

// =============================================================================
// MULTI-TENANT EXPORTS (All require organizationId)
// =============================================================================

// --- Organizations ---
export const {
  createOrganization,
  getOrganizations,
  getOrganizationById,
  getOrganizationBySlug,
  updateOrganization,
} = dataService;

// --- Admin Users ---
export const {
  createAdminUser,
  getAdminUsers,
  getAdminUserById,
  getAdminUserByEmail,
  updateAdminUser,
  updateAdminLastLogin,
} = dataService;

// --- Global Mapping Templates ---
export const {
  createGlobalTemplate,
  getGlobalTemplates,
  getGlobalTemplateById,
  getGlobalTemplatesBySourceType,
  updateGlobalTemplate,
} = dataService;

// --- Client Mapping Overrides ---
export const {
  createClientOverride,
  getClientOverrides,
  getClientOverrideById,
  getClientOverridesForSource,
  updateClientOverride,
  deleteClientOverride,
} = dataService;

// --- Sources (Multi-Tenant) ---
export const {
  createSource,
  getSources,
  getSourceById,
  getSourceByApiKey,
  updateSource,
  regenerateApiKey,
} = dataService;

// --- Payloads (Multi-Tenant) ---
export const {
  savePayload,
  getPayloads,
  getPayloadById,
  getLatestPayload,
  markPayloadProcessed,
} = dataService;

// --- Mappings (Multi-Tenant) ---
export const {
  createMapping,
  getMappings,
  getMappingById,
  getActiveMapping,
  updateMapping,
} = dataService;

// --- OAuth Tokens (Multi-Tenant) ---
export const {
  saveToken,
  getActiveToken,
  updateToken,
  getAllActiveTokens,
  getTokensExpiringWithin,
} = dataService;

// --- Sync Logs (Multi-Tenant) ---
export const {
  createSyncLog,
  updateSyncLog,
  getSyncLogs,
  getSyncLogById,
} = dataService;

// --- API Keys ---
export const {
  createApiKey,
  getApiKeyByHash,
  getApiKeyById,
  getApiKeysByOrganization,
  getGlobalApiKeys,
  updateApiKey,
  updateApiKeyLastUsed,
} = dataService;

// --- API Usage Logs ---
export const {
  logApiUsage,
  getApiUsageLogs,
  getApiUsageStats,
} = dataService;

// =============================================================================
// LEGACY BACKWARD COMPATIBILITY FUNCTIONS
// These use DEFAULT_ORGANIZATION_ID for routes that don't specify an org
// =============================================================================

/**
 * Legacy function: Get sources for default organization
 * @deprecated Use getSources(organizationId) instead
 */
export async function legacyGetSources() {
  return dataService.getSources(DEFAULT_ORGANIZATION_ID);
}

/**
 * Legacy function: Get source by ID from default organization
 * @deprecated Use getSourceById(organizationId, sourceId) instead
 */
export async function legacyGetSourceById(sourceId: string) {
  return dataService.getSourceById(DEFAULT_ORGANIZATION_ID, sourceId);
}

/**
 * Legacy function: Create source in default organization
 * @deprecated Use createSource(organizationId, ...) instead
 */
export async function legacyCreateSource(name: string, description?: string, sourceType?: string) {
  return dataService.createSource(DEFAULT_ORGANIZATION_ID, name, description, sourceType);
}

/**
 * Legacy function: Get active OAuth token from default organization
 * @deprecated Use getActiveToken(organizationId) instead
 */
export async function legacyGetActiveToken() {
  return dataService.getActiveToken(DEFAULT_ORGANIZATION_ID);
}

/**
 * Legacy function: Save OAuth token to default organization
 * @deprecated Use saveToken(organizationId, token) instead
 */
export async function legacySaveToken(token: Parameters<typeof dataService.saveToken>[1]) {
  return dataService.saveToken(DEFAULT_ORGANIZATION_ID, token);
}

/**
 * Legacy function: Get sync logs from default organization
 * @deprecated Use getSyncLogs(organizationId, ...) instead
 */
export async function legacyGetSyncLogs(limit?: number, sourceId?: string) {
  return dataService.getSyncLogs(DEFAULT_ORGANIZATION_ID, limit, sourceId);
}

/**
 * Legacy function: Get mappings from default organization
 * @deprecated Use getMappings(organizationId, sourceId) instead
 */
export async function legacyGetMappings(sourceId: string) {
  return dataService.getMappings(DEFAULT_ORGANIZATION_ID, sourceId);
}

/**
 * Legacy function: Get active mapping from default organization
 * @deprecated Use getActiveMapping(organizationId, sourceId) instead
 */
export async function legacyGetActiveMapping(sourceId: string) {
  return dataService.getActiveMapping(DEFAULT_ORGANIZATION_ID, sourceId);
}

/**
 * Legacy function: Save payload to default organization
 * @deprecated Use savePayload(organizationId, ...) instead
 */
export async function legacySavePayload(
  sourceId: string,
  payload: unknown,
  headers?: Record<string, string>
) {
  return dataService.savePayload(DEFAULT_ORGANIZATION_ID, sourceId, payload, headers);
}

/**
 * Legacy function: Get payloads from default organization
 * @deprecated Use getPayloads(organizationId, sourceId, limit) instead
 */
export async function legacyGetPayloads(sourceId: string, limit?: number) {
  return dataService.getPayloads(DEFAULT_ORGANIZATION_ID, sourceId, limit);
}

/**
 * Legacy function: Get latest payload from default organization
 * @deprecated Use getLatestPayload(organizationId, sourceId) instead
 */
export async function legacyGetLatestPayload(sourceId: string) {
  return dataService.getLatestPayload(DEFAULT_ORGANIZATION_ID, sourceId);
}

/**
 * Legacy function: Create sync log in default organization
 * @deprecated Use createSyncLog(organizationId, ...) instead
 */
export async function legacyCreateSyncLog(
  payloadId: string,
  sourceId: string,
  mappingId?: string
) {
  return dataService.createSyncLog(DEFAULT_ORGANIZATION_ID, payloadId, sourceId, mappingId);
}

// =============================================================================
// UTILITY EXPORTS
// =============================================================================

// Note: getEffectiveMapping and mergeFieldMappings are in mappingMergerService.ts
// Use that service for all mapping merge operations

export { DEFAULT_ORGANIZATION_ID };

/**
 * Check if we're using mock data service
 */
export const isUsingMockData = useMock;

/**
 * Get the raw data service for advanced operations
 */
export const getRawDataService = () => dataService;
