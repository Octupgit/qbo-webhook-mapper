// Re-export multi-tenant types
export * from './multiTenant';

// Source type constants
export type SourceType = 'shopify' | 'woocommerce' | 'stripe' | 'custom' | string;

// Webhook Source
export interface WebhookSource {
  source_id: string;
  organization_id: string;           // Multi-tenant: links source to organization
  name: string;
  description?: string;
  source_type: SourceType;           // Type of webhook source
  api_key: string;
  webhook_url?: string;              // Generated webhook URL
  is_active: boolean;
  created_at: Date;
  updated_at?: Date;
  created_by?: string;
}

// Webhook Payload
export interface WebhookPayload {
  payload_id: string;
  organization_id: string;           // Multi-tenant: links payload to organization
  source_id: string;
  raw_payload: string;
  payload_hash?: string;             // SHA256 hash for deduplication
  headers?: string;
  received_at: Date;
  processed: boolean;
  processed_at?: Date;
  invoice_id?: string;
}

// Field Mapping
export interface FieldMapping {
  qboField: string;
  sourceField?: string;
  staticValue?: string;
  transformation?: string;
  isRequired?: boolean;
  lookupType?: 'customer' | 'item';  // For dynamic QBO entity lookup in Visual Mapper
}

// Mapping Configuration
export interface MappingConfiguration {
  mapping_id: string;
  organization_id: string;           // Multi-tenant: links mapping to organization
  source_id: string;
  inherits_from_template_id?: string; // FK to global_mapping_templates
  name: string;
  description?: string;
  version: number;
  is_active: boolean;
  field_mappings: FieldMapping[];
  static_values?: Record<string, unknown>;
  created_at: Date;
  updated_at?: Date;
}

// OAuth Token
export interface OAuthToken {
  token_id: string;
  organization_id: string;           // Multi-tenant: links token to organization
  realm_id: string;                  // QBO Company ID
  access_token: string;
  refresh_token: string;
  access_token_expires_at: Date;
  refresh_token_expires_at?: Date;
  token_type: string;
  scope?: string;
  qbo_company_name?: string;         // Cached company name from QBO
  connection_name?: string;          // User-defined friendly name
  last_sync_at?: Date;               // Last successful sync time
  sync_status?: 'active' | 'expired' | 'error';
  is_active: boolean;
  created_at: Date;
  updated_at?: Date;
}

// Sync Log
export interface SyncLog {
  log_id: string;
  organization_id: string;           // Multi-tenant: links log to organization
  payload_id: string;
  source_id: string;
  mapping_id?: string;
  status: 'pending' | 'success' | 'failed' | 'retrying';
  qbo_invoice_id?: string;
  qbo_doc_number?: string;
  request_payload?: string;
  response_payload?: string;
  error_message?: string;
  error_code?: string;
  retry_count: number;
  created_at: Date;
  completed_at?: Date;
}

// QBO Invoice Types
export interface QBOCustomerRef {
  value: string;
  name?: string;
}

export interface QBOItemRef {
  value: string;
  name?: string;
}

export interface QBOSalesItemLineDetail {
  ItemRef: QBOItemRef;
  UnitPrice?: number;
  Qty?: number;
  TaxCodeRef?: { value: string };
  ServiceDate?: string;
  DiscountAmt?: number;
  DiscountRate?: number;
}

export interface QBOInvoiceLine {
  Amount: number;
  DetailType: 'SalesItemLineDetail';
  Description?: string;
  SalesItemLineDetail: QBOSalesItemLineDetail;
}

export interface QBOAddress {
  Line1?: string;
  Line2?: string;
  City?: string;
  CountrySubDivisionCode?: string;
  PostalCode?: string;
  Country?: string;
}

export interface QBOInvoice {
  CustomerRef: QBOCustomerRef;
  Line: QBOInvoiceLine[];
  DocNumber?: string;
  TxnDate?: string;
  DueDate?: string;
  PrivateNote?: string;
  CustomerMemo?: { value: string };
  BillEmail?: { Address: string };
  BillAddr?: QBOAddress;
  ShipAddr?: QBOAddress;
  SalesTermRef?: { value: string };
  CurrencyRef?: { value: string };
  AllowOnlineCreditCardPayment?: boolean;
  AllowOnlineACHPayment?: boolean;
}

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Transform Test Result
export interface TransformTestResult {
  success: boolean;
  transformedInvoice?: QBOInvoice;
  validationErrors: string[];
  warnings: string[];
}

// QBO Field Definition (for Visual Mapper UI)
export interface QBOField {
  path: string;
  label: string;
  required: boolean;
  type?: string;
  description?: string;
}

// Transformation Definition
export interface Transformation {
  value: string;
  label: string;
  description?: string;
  example?: string;
}

// Default organization ID for backward compatibility
export const DEFAULT_ORGANIZATION_ID = 'default-org-001';
