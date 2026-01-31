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
