/**
 * Multi-Tenant Types for QBO Webhook Mapper
 *
 * These types support the multi-tenant SaaS architecture with:
 * - Organizations (tenants)
 * - Global mapping templates
 * - Client-specific overrides
 * - Admin users with magic link auth
 */

// ============================================================
// ORGANIZATION TYPES
// ============================================================

export type PlanTier = 'free' | 'starter' | 'professional' | 'enterprise';

export interface OrganizationSettings {
  timezone?: string;
  notification_email?: string;
  webhook_signing_secret?: string;
  auto_sync_enabled?: boolean;
  max_sources?: number;
  max_payloads_per_day?: number;
}

export interface Organization {
  organization_id: string;
  name: string;
  slug: string;                      // URL-safe identifier (e.g., "acme-corp")
  plan_tier: PlanTier;
  is_active: boolean;
  connection_link_enabled: boolean;  // Whether public connect page is accessible
  settings?: OrganizationSettings;
  created_at: Date;
  updated_at?: Date;
  created_by?: string;
}

export interface CreateOrganizationInput {
  name: string;
  slug?: string;                     // Auto-generated if not provided
  plan_tier?: PlanTier;
  settings?: OrganizationSettings;
}

export interface UpdateOrganizationInput {
  name?: string;
  slug?: string;
  plan_tier?: PlanTier;
  is_active?: boolean;
  connection_link_enabled?: boolean;
  settings?: OrganizationSettings;
}

// ============================================================
// ADMIN USER TYPES
// ============================================================

export type AdminRole = 'super_admin' | 'admin';

export interface AdminUser {
  user_id: string;
  email: string;
  name?: string;
  role: AdminRole;
  is_active: boolean;
  last_login_at?: Date;
  created_at: Date;
}

export interface MagicLink {
  link_id: string;
  email: string;
  token_hash: string;
  expires_at: Date;
  used_at?: Date;
  created_at: Date;
}

export interface AdminSession {
  user_id: string;
  email: string;
  role: AdminRole;
  organization_id?: string;          // Current org context (for scoped actions)
  issued_at: Date;
  expires_at: Date;
}

// ============================================================
// GLOBAL MAPPING TEMPLATE TYPES
// ============================================================

export type SourceType = 'shopify' | 'woocommerce' | 'stripe' | 'custom' | string;

export interface GlobalMappingTemplate {
  template_id: string;
  name: string;
  source_type: SourceType;
  description?: string;
  version: number;
  is_active: boolean;
  field_mappings: FieldMappingDefinition[];
  static_values?: Record<string, unknown>;
  priority: number;                  // Lower = higher priority (100 = default global)
  created_at: Date;
  updated_at?: Date;
  created_by?: string;
}

export interface CreateGlobalTemplateInput {
  name: string;
  source_type: SourceType;
  description?: string;
  field_mappings: FieldMappingDefinition[];
  static_values?: Record<string, unknown>;
  priority?: number;
}

export interface UpdateGlobalTemplateInput {
  name?: string;
  source_type?: SourceType;
  description?: string;
  field_mappings?: FieldMappingDefinition[];
  static_values?: Record<string, unknown>;
  priority?: number;
  is_active?: boolean;
}

// ============================================================
// CLIENT MAPPING OVERRIDE TYPES
// ============================================================

export interface ClientMappingOverride {
  override_id: string;
  organization_id: string;
  source_id?: string;                // NULL = applies to all sources for this org
  template_id?: string;              // NULL = standalone override (no global inheritance)
  name: string;
  description?: string;
  field_mappings: FieldMappingDefinition[];  // ONLY the fields to override
  static_values?: Record<string, unknown>;   // ONLY the values to override
  priority: number;                  // Lower = higher priority (50 = default client)
  is_active: boolean;
  created_at: Date;
  updated_at?: Date;
}

export interface CreateClientOverrideInput {
  source_id?: string;
  template_id?: string;
  name: string;
  description?: string;
  field_mappings: FieldMappingDefinition[];
  static_values?: Record<string, unknown>;
  priority?: number;
}

export interface UpdateClientOverrideInput {
  source_id?: string;
  template_id?: string;
  name?: string;
  description?: string;
  field_mappings?: FieldMappingDefinition[];
  static_values?: Record<string, unknown>;
  priority?: number;
  is_active?: boolean;
}

// ============================================================
// FIELD MAPPING TYPES
// ============================================================

export interface FieldMappingDefinition {
  qboField: string;                  // Target QBO invoice field path
  sourceField?: string;              // JSONPath to source field (e.g., "$.customer.id")
  staticValue?: string;              // Static value (used if no sourceField)
  transformation?: string;           // Transformation function (e.g., "toNumber", "concat:prefix:")
  isRequired?: boolean;              // Whether this field is required for invoice creation
  lookupType?: 'customer' | 'item';  // For dynamic QBO entity lookup
}

// ============================================================
// MERGED MAPPING TYPES
// ============================================================

export interface MergedMapping {
  organization_id: string;
  source_id: string;
  effective_field_mappings: FieldMappingDefinition[];
  static_values?: Record<string, unknown>;
  merge_log: MergeLogEntry[];
  global_template?: GlobalMappingTemplate;
  client_override?: ClientMappingOverride;
  source_mapping?: {
    mapping_id: string;
    name: string;
    field_mappings: FieldMappingDefinition[];
  };
}

export interface MergeLogEntry {
  source: 'global_template' | 'client_override' | 'source_mapping';
  template_id?: string;
  override_id?: string;
  mapping_id?: string;
  fields_applied: string[];
  priority: number;
}

// ============================================================
// OAUTH MULTI-TENANT TYPES
// ============================================================

export interface MultiTenantOAuthToken {
  token_id: string;
  organization_id: string;
  realm_id: string;                  // QBO Company ID
  access_token: string;              // Encrypted
  refresh_token: string;             // Encrypted
  access_token_expires_at: Date;
  refresh_token_expires_at?: Date;
  token_type: string;
  scope?: string;
  qbo_company_name?: string;         // Cached company name
  connection_name?: string;          // User-defined friendly name
  last_sync_at?: Date;
  sync_status?: 'active' | 'expired' | 'error' | 'revoked' | 'disconnected' | 'refresh_failed';
  is_active: boolean;
  created_at: Date;
  updated_at?: Date;
}

export interface OAuthState {
  organization_id: string;
  slug: string;
  timestamp: number;
  hmac: string;
}

// ============================================================
// API REQUEST/RESPONSE TYPES
// ============================================================

export interface TenantContext {
  organization_id: string;
  organization_slug: string;
  organization_name: string;
  plan_tier: PlanTier;
}

export interface AdminContext {
  user_id: string;
  email: string;
  role: AdminRole;
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
      admin?: AdminContext;
    }
  }
}

// ============================================================
// VISUAL MAPPER TYPES
// ============================================================

export interface QBOFieldDefinition {
  path: string;                      // e.g., "CustomerRef.value"
  label: string;                     // e.g., "Customer"
  required: boolean;
  lookupType?: 'customer' | 'item';
  defaultValue?: string;
  description?: string;
}

export const REQUIRED_QBO_FIELDS: QBOFieldDefinition[] = [
  {
    path: 'CustomerRef.value',
    label: 'Customer',
    required: true,
    lookupType: 'customer',
    description: 'QBO Customer ID - required for invoice creation'
  },
  {
    path: 'Line[0].Amount',
    label: 'Line Amount',
    required: true,
    description: 'Amount for the first line item'
  },
  {
    path: 'Line[0].DetailType',
    label: 'Detail Type',
    required: true,
    defaultValue: 'SalesItemLineDetail',
    description: 'Must be SalesItemLineDetail for product/service invoices'
  },
  {
    path: 'Line[0].SalesItemLineDetail.ItemRef.value',
    label: 'Item/Product',
    required: true,
    lookupType: 'item',
    description: 'QBO Item/Product ID for the line item'
  },
];

export const OPTIONAL_QBO_FIELDS: QBOFieldDefinition[] = [
  { path: 'DocNumber', label: 'Invoice Number', required: false },
  { path: 'TxnDate', label: 'Transaction Date', required: false },
  { path: 'DueDate', label: 'Due Date', required: false },
  { path: 'BillEmail.Address', label: 'Bill Email', required: false },
  { path: 'CustomerMemo.value', label: 'Customer Memo', required: false },
  { path: 'PrivateNote', label: 'Private Note', required: false },
  { path: 'Line[0].Description', label: 'Line Description', required: false },
  { path: 'Line[0].SalesItemLineDetail.Qty', label: 'Quantity', required: false },
  { path: 'Line[0].SalesItemLineDetail.UnitPrice', label: 'Unit Price', required: false },
];

// ============================================================
// STATISTICS TYPES
// ============================================================

export interface OrganizationStats {
  organization_id: string;
  total_sources: number;
  total_payloads: number;
  total_invoices_synced: number;
  total_sync_failures: number;
  last_webhook_at?: Date;
  last_sync_at?: Date;
  connection_status: 'connected' | 'disconnected' | 'expired' | 'error';
}
