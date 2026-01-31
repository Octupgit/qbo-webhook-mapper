// Webhook Source
export interface WebhookSource {
  source_id: string;
  name: string;
  description?: string;
  api_key: string;
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
