// Webhook Source
export interface WebhookSource {
  source_id: string;
  organization_id?: string;
  name: string;
  description?: string;
  source_type?: string;
  api_key: string;
  webhook_url?: string;
  is_active: boolean;
  created_at: string;
}

// Webhook Payload
export interface WebhookPayload {
  payload_id: string;
  source_id: string;
  raw_payload: Record<string, unknown>;
  headers?: Record<string, string>;
  received_at: string;
  processed: boolean;
  invoice_id?: string;
}

// Field Mapping
export interface FieldMapping {
  qboField: string;
  sourceField?: string;
  staticValue?: string;
  transformation?: string;
  isRequired?: boolean;
}

// Mapping Configuration
export interface MappingConfiguration {
  mapping_id: string;
  source_id: string;
  name: string;
  description?: string;
  version: number;
  is_active: boolean;
  field_mappings: FieldMapping[];
  static_values?: Record<string, unknown>;
  created_at: string;
}

// QBO Field Info
export interface QBOField {
  path: string;
  label: string;
  type: string;
  required: boolean;
  description: string;
}

// Transformation Info
export interface Transformation {
  value: string;
  label: string;
  description: string;
  hasArgs: boolean;
}

// Sync Log
export interface SyncLog {
  log_id: string;
  payload_id: string;
  source_id: string;
  mapping_id?: string;
  status: 'pending' | 'success' | 'failed' | 'retrying';
  qbo_invoice_id?: string;
  qbo_doc_number?: string;
  error_message?: string;
  created_at: string;
  completed_at?: string;
}

// OAuth Status
export interface OAuthStatus {
  connected: boolean;
  realmId?: string;
  expiresAt?: string;
  company?: {
    id: string;
    name: string;
    country: string;
  };
}

// API Response
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Transform Test Result
export interface TransformTestResult {
  success: boolean;
  transformedInvoice?: Record<string, unknown>;
  validationErrors: string[];
  warnings: string[];
}

// =============================================================================
// MULTI-TENANT TYPES
// =============================================================================

// Organization
export interface Organization {
  organization_id: string;
  name: string;
  slug: string;
  plan_tier: 'free' | 'starter' | 'professional' | 'enterprise';
  is_active: boolean;
  connection_link_enabled: boolean;
  settings?: OrganizationSettings;
  created_at: string;
  updated_at?: string;
}

export interface OrganizationSettings {
  timezone?: string;
  notification_email?: string;
  auto_sync_enabled?: boolean;
}

// Organization Stats
export interface OrganizationStats {
  sourceCount: number;
  qboConnected: boolean;
  syncStats: {
    total: number;
    success: number;
    failed: number;
    pending: number;
  };
  planLimits: {
    maxSources: number;
    maxPayloadsPerDay: number;
    sourcesUsed: number;
  };
}

// Global Mapping Template
export interface GlobalMappingTemplate {
  template_id: string;
  name: string;
  source_type: string;
  description?: string;
  version: number;
  is_active: boolean;
  field_mappings: FieldMapping[];
  static_values?: Record<string, unknown>;
  priority: number;
  created_at: string;
}

// Client Mapping Override
export interface ClientMappingOverride {
  override_id: string;
  organization_id: string;
  source_id?: string;
  template_id?: string;
  name: string;
  description?: string;
  field_mappings: FieldMapping[];
  static_values?: Record<string, unknown>;
  priority: number;
  is_active: boolean;
  created_at: string;
}

// Merged/Effective Mapping
export interface MergedMapping {
  organization_id: string;
  source_id: string;
  effective_field_mappings: FieldMapping[];
  static_values?: Record<string, unknown>;
  merge_log: MergeLogEntry[];
  global_template?: GlobalMappingTemplate;
  client_override?: ClientMappingOverride;
}

export interface MergeLogEntry {
  source: 'global_template' | 'client_override' | 'source_mapping';
  template_id?: string;
  override_id?: string;
  mapping_id?: string;
  fields_applied: string[];
  priority: number;
}

// QBO Entities
export interface QBOCustomer {
  id: string;
  name: string;
  email?: string;
  company?: string;
}

export interface QBOItem {
  id: string;
  name: string;
  type: string;
  unitPrice?: number;
  description?: string;
}

// Multi-tenant Connection Status
export interface OrgConnectionStatus {
  organization: {
    id: string;
    slug: string;
    name: string;
    planTier: string;
  };
  qbo: {
    connected: boolean;
    realmId?: string;
    companyName?: string;
    expiresAt?: string;
    syncStatus?: 'active' | 'expired' | 'error';
  };
  connectUrl?: string;
}

// Admin User
export interface AdminUser {
  user_id: string;
  email: string;
  name?: string;
  role: 'admin' | 'super_admin';
  is_active: boolean;
  last_login_at?: string;
  created_at: string;
}

// Lookup type for Visual Mapper
export type LookupType = 'customer' | 'item';

// Extended Field Mapping for Visual Mapper
export interface VisualFieldMapping extends FieldMapping {
  lookupType?: LookupType;
  lookupValue?: { id: string; name: string };
}

// =============================================================================
// API KEY TYPES
// =============================================================================

// API Key permissions
export interface ApiKeyPermissions {
  endpoints: string[];
  rate_limit_tier: 'standard' | 'premium' | 'unlimited';
}

// API Key (without the actual key - only shown on creation)
export interface ApiKey {
  key_id: string;
  organization_id?: string;
  key_prefix: string;
  name: string;
  key_type: 'tenant' | 'global_admin';
  permissions?: ApiKeyPermissions;
  is_active: boolean;
  created_at: string;
  created_by?: string;
  last_used_at?: string;
  expires_at?: string;
  revoked_at?: string;
  revoked_by?: string;
  grace_period_ends_at?: string;
}

// Response when creating a new API key (includes the full key)
export interface CreateApiKeyResult {
  key_id: string;
  key: string; // Full key - only shown once!
  key_prefix: string;
  name: string;
  key_type: 'tenant' | 'global_admin';
  organization_id?: string;
  created_at: string;
  expires_at?: string;
}

// Response when rotating a key
export interface RotateApiKeyResult {
  new_key_id: string;
  new_key: string; // Full new key - only shown once!
  new_key_prefix: string;
  old_key_id: string;
  grace_period_ends_at?: string;
}

// Input for creating a new API key
export interface CreateApiKeyInput {
  name: string;
  permissions?: ApiKeyPermissions;
  expires_at?: string;
}

// =============================================================================
// SYSTEM MONITORING TYPES
// =============================================================================

// Tenant connection status for system dashboard
export interface TenantConnectionStatus {
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  plan_tier: string;
  is_active: boolean;
  qbo_connected: boolean;
  realm_id?: string;
  qbo_company_name?: string;
  token_status?: 'active' | 'expired' | 'error' | 'revoked' | 'disconnected' | 'refresh_failed';
  token_expires_at?: string;
  last_sync_at?: string;
  last_sync_status?: 'success' | 'failed';
  total_sources: number;
  sync_stats_24h: {
    total: number;
    success: number;
    failed: number;
  };
  created_at: string;
}

// System health summary
export interface SystemHealthSummary {
  total_organizations: number;
  active_organizations: number;
  connected_organizations: number;
  disconnected_organizations: number;
  expiring_tokens_24h: number;
  failed_syncs_24h: number;
  total_syncs_24h: number;
  success_rate_24h: number;
}

// System health response
export interface SystemHealthResponse {
  status: 'healthy' | 'warning' | 'critical';
  issues: string[];
  summary: SystemHealthSummary;
  timestamp: string;
}

// Token expiry alert
export interface TokenExpiryAlert {
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  realm_id: string;
  qbo_company_name?: string;
  expires_at: string;
  hours_until_expiry: number;
}

// Recent sync failure
export interface RecentSyncFailure {
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  log_id: string;
  source_id: string;
  error_message?: string;
  error_code?: string;
  created_at: string;
}
