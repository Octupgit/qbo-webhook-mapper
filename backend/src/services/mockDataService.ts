/**
 * Mock Data Service - In-memory storage for development/testing
 * Replaces BigQuery when no GCP credentials are available
 */

import { v4 as uuidv4 } from 'uuid';
import {
  WebhookSource,
  WebhookPayload,
  MappingConfiguration,
  OAuthToken,
  SyncLog,
  FieldMapping,
} from '../types';

// In-memory storage
const sources: Map<string, WebhookSource> = new Map();
const payloads: Map<string, WebhookPayload> = new Map();
const mappings: Map<string, MappingConfiguration> = new Map();
const tokens: Map<string, OAuthToken> = new Map();
const logs: Map<string, SyncLog> = new Map();

// Initialize with sample data
function initSampleData() {
  // Sample webhook source 1 - Shopify Orders
  const sampleSource: WebhookSource = {
    source_id: 'sample-source-001',
    name: 'Shopify Orders',
    description: 'Webhook for Shopify order notifications',
    api_key: 'sk_live_shopify_abc123def456ghi789jkl',
    is_active: true,
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
  };
  sources.set(sampleSource.source_id, sampleSource);

  // Sample webhook source 2 - Stripe Payments
  const stripeSource: WebhookSource = {
    source_id: 'sample-source-002',
    name: 'Stripe Payments',
    description: 'Webhook for Stripe payment events',
    api_key: 'sk_live_stripe_xyz789abc123def456ghi',
    is_active: true,
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
  };
  sources.set(stripeSource.source_id, stripeSource);

  // Sample webhook source 3 - WooCommerce
  const wooSource: WebhookSource = {
    source_id: 'sample-source-003',
    name: 'WooCommerce Store',
    description: 'Webhook for WooCommerce new orders',
    api_key: 'wc_live_key_mno456pqr789stu012vwx',
    is_active: true,
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
  };
  sources.set(wooSource.source_id, wooSource);

  // Sample webhook payload
  const samplePayload: WebhookPayload = {
    payload_id: 'sample-payload-001',
    source_id: sampleSource.source_id,
    raw_payload: JSON.stringify({
      order_id: 'ORD-12345',
      customer: {
        id: 'CUST-001',
        name: 'John Doe',
        email: 'john@example.com',
        phone: '555-1234',
      },
      billing_address: {
        line1: '123 Main Street',
        city: 'San Francisco',
        state: 'CA',
        zip: '94102',
        country: 'USA',
      },
      items: [
        {
          sku: 'WIDGET-001',
          name: 'Premium Widget',
          quantity: 2,
          unit_price: 49.99,
        },
        {
          sku: 'GADGET-002',
          name: 'Super Gadget',
          quantity: 1,
          unit_price: 29.99,
        },
      ],
      subtotal: 129.97,
      tax: 10.40,
      total: 140.37,
      created_at: '2025-01-31T10:30:00Z',
    }),
    received_at: new Date(),
    processed: false,
  };
  payloads.set(samplePayload.payload_id, samplePayload);

  // Sample payload for Stripe
  const stripePayload: WebhookPayload = {
    payload_id: 'sample-payload-002',
    source_id: stripeSource.source_id,
    raw_payload: JSON.stringify({
      id: 'pi_3NxXXX2eZvKYlo2C0Hs9v4vZ',
      object: 'payment_intent',
      amount: 15000,
      currency: 'usd',
      customer: 'cus_OvXXXXXX',
      description: 'Invoice #INV-2024-001',
      metadata: {
        order_id: 'ORD-98765',
        customer_name: 'Jane Smith',
        customer_email: 'jane@company.com',
      },
      receipt_email: 'jane@company.com',
      status: 'succeeded',
      created: 1706745600,
    }),
    received_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    processed: false,
  };
  payloads.set(stripePayload.payload_id, stripePayload);

  // Sample payload for WooCommerce
  const wooPayload: WebhookPayload = {
    payload_id: 'sample-payload-003',
    source_id: wooSource.source_id,
    raw_payload: JSON.stringify({
      id: 54321,
      number: 'WC-54321',
      status: 'processing',
      total: '245.50',
      currency: 'USD',
      billing: {
        first_name: 'Robert',
        last_name: 'Johnson',
        company: 'Tech Corp',
        address_1: '456 Oak Avenue',
        city: 'Los Angeles',
        state: 'CA',
        postcode: '90001',
        country: 'US',
        email: 'robert@techcorp.com',
        phone: '555-9876',
      },
      line_items: [
        {
          id: 1,
          name: 'Pro Software License',
          product_id: 101,
          quantity: 1,
          subtotal: '199.00',
          total: '199.00',
        },
        {
          id: 2,
          name: 'Support Package',
          product_id: 102,
          quantity: 1,
          subtotal: '46.50',
          total: '46.50',
        },
      ],
      date_created: '2025-01-31T14:22:00',
    }),
    received_at: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
    processed: false,
  };
  payloads.set(wooPayload.payload_id, wooPayload);

  // Sample mapping configuration
  const sampleMapping: MappingConfiguration = {
    mapping_id: 'sample-mapping-001',
    source_id: sampleSource.source_id,
    name: 'Shopify to QBO Invoice',
    description: 'Maps Shopify order fields to QuickBooks Invoice',
    version: 1,
    is_active: true,
    field_mappings: [
      { qboField: 'CustomerRef.value', sourceField: '$.customer.id', isRequired: true },
      { qboField: 'CustomerMemo.value', sourceField: '$.order_id', transformation: 'concat:Order #:' },
      { qboField: 'BillEmail.Address', sourceField: '$.customer.email' },
      { qboField: 'Line[0].Amount', sourceField: '$.total', transformation: 'toNumber', isRequired: true },
      { qboField: 'Line[0].Description', sourceField: '$.items[0].name' },
      { qboField: 'Line[0].SalesItemLineDetail.ItemRef.value', staticValue: '1', isRequired: true },
    ],
    created_at: new Date(),
  };
  mappings.set(sampleMapping.mapping_id, sampleMapping);

  // Stripe mapping configuration
  const stripeMapping: MappingConfiguration = {
    mapping_id: 'sample-mapping-002',
    source_id: stripeSource.source_id,
    name: 'Stripe Payment to Invoice',
    description: 'Maps Stripe payment intents to QuickBooks Invoice',
    version: 1,
    is_active: true,
    field_mappings: [
      { qboField: 'CustomerRef.value', sourceField: '$.customer', isRequired: true },
      { qboField: 'DocNumber', sourceField: '$.metadata.order_id', transformation: 'concat:STR-:' },
      { qboField: 'CustomerMemo.value', sourceField: '$.description' },
      { qboField: 'BillEmail.Address', sourceField: '$.receipt_email' },
      { qboField: 'Line[0].Amount', sourceField: '$.amount', transformation: 'multiply:0.01', isRequired: true },
      { qboField: 'Line[0].Description', staticValue: 'Stripe Payment' },
      { qboField: 'Line[0].SalesItemLineDetail.ItemRef.value', staticValue: '1', isRequired: true },
      { qboField: 'CurrencyRef.value', sourceField: '$.currency', transformation: 'toUpperCase' },
    ],
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
  };
  mappings.set(stripeMapping.mapping_id, stripeMapping);

  // WooCommerce mapping configuration
  const wooMapping: MappingConfiguration = {
    mapping_id: 'sample-mapping-003',
    source_id: wooSource.source_id,
    name: 'WooCommerce Order to Invoice',
    description: 'Maps WooCommerce orders to QuickBooks Invoice',
    version: 1,
    is_active: true,
    field_mappings: [
      { qboField: 'CustomerRef.value', sourceField: '$.billing.email', transformation: 'toString', isRequired: true },
      { qboField: 'DocNumber', sourceField: '$.number' },
      { qboField: 'BillEmail.Address', sourceField: '$.billing.email' },
      { qboField: 'BillAddr.Line1', sourceField: '$.billing.address_1' },
      { qboField: 'BillAddr.City', sourceField: '$.billing.city' },
      { qboField: 'BillAddr.CountrySubDivisionCode', sourceField: '$.billing.state' },
      { qboField: 'BillAddr.PostalCode', sourceField: '$.billing.postcode' },
      { qboField: 'Line[0].Amount', sourceField: '$.total', transformation: 'toNumber', isRequired: true },
      { qboField: 'Line[0].Description', sourceField: '$.line_items[0].name' },
      { qboField: 'Line[0].SalesItemLineDetail.ItemRef.value', staticValue: '1', isRequired: true },
      { qboField: 'Line[0].SalesItemLineDetail.Qty', sourceField: '$.line_items[0].quantity', transformation: 'toNumber' },
      { qboField: 'CurrencyRef.value', sourceField: '$.currency' },
      { qboField: 'TxnDate', sourceField: '$.date_created', transformation: 'formatDate' },
    ],
    created_at: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
  };
  mappings.set(wooMapping.mapping_id, wooMapping);

  // Sample sync logs
  const successLog: SyncLog = {
    log_id: 'sample-log-001',
    payload_id: 'sample-payload-001',
    source_id: sampleSource.source_id,
    mapping_id: sampleMapping.mapping_id,
    status: 'success',
    qbo_invoice_id: '178',
    qbo_doc_number: 'INV-1001',
    retry_count: 0,
    created_at: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
  };
  logs.set(successLog.log_id, successLog);

  const failedLog: SyncLog = {
    log_id: 'sample-log-002',
    payload_id: 'sample-payload-002',
    source_id: stripeSource.source_id,
    mapping_id: stripeMapping.mapping_id,
    status: 'failed',
    error_message: 'QBO Error: Invalid customer reference - customer cus_OvXXXXXX not found in QuickBooks',
    retry_count: 1,
    created_at: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
  };
  logs.set(failedLog.log_id, failedLog);

  const pendingLog: SyncLog = {
    log_id: 'sample-log-003',
    payload_id: 'sample-payload-003',
    source_id: wooSource.source_id,
    mapping_id: wooMapping.mapping_id,
    status: 'pending',
    retry_count: 0,
    created_at: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
  };
  logs.set(pendingLog.log_id, pendingLog);

  console.log('✓ Mock data initialized with 3 sources, 3 payloads, 3 mappings, and 3 sync logs');
}

// Initialize on module load
initSampleData();

// ============ WEBHOOK SOURCES ============

export async function createSource(name: string, description?: string): Promise<WebhookSource> {
  const source: WebhookSource = {
    source_id: uuidv4(),
    name,
    description,
    api_key: uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, ''),
    is_active: true,
    created_at: new Date(),
  };
  sources.set(source.source_id, source);
  return source;
}

export async function getSources(): Promise<WebhookSource[]> {
  return Array.from(sources.values())
    .filter(s => s.is_active)
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
}

export async function getSourceById(sourceId: string): Promise<WebhookSource | null> {
  return sources.get(sourceId) || null;
}

export async function getSourceByApiKey(apiKey: string): Promise<WebhookSource | null> {
  return Array.from(sources.values()).find(s => s.api_key === apiKey && s.is_active) || null;
}

export async function updateSource(sourceId: string, updates: Partial<WebhookSource>): Promise<void> {
  const source = sources.get(sourceId);
  if (source) {
    sources.set(sourceId, { ...source, ...updates, updated_at: new Date() });
  }
}

export async function regenerateApiKey(sourceId: string): Promise<string> {
  const newApiKey = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
  const source = sources.get(sourceId);
  if (source) {
    sources.set(sourceId, { ...source, api_key: newApiKey, updated_at: new Date() });
  }
  return newApiKey;
}

// ============ WEBHOOK PAYLOADS ============

export async function savePayload(
  sourceId: string,
  payload: unknown,
  headers?: Record<string, string>
): Promise<WebhookPayload> {
  const webhookPayload: WebhookPayload = {
    payload_id: uuidv4(),
    source_id: sourceId,
    raw_payload: JSON.stringify(payload),
    headers: headers ? JSON.stringify(headers) : undefined,
    received_at: new Date(),
    processed: false,
  };
  payloads.set(webhookPayload.payload_id, webhookPayload);
  return webhookPayload;
}

export async function getPayloads(sourceId: string, limit = 50): Promise<WebhookPayload[]> {
  return Array.from(payloads.values())
    .filter(p => p.source_id === sourceId)
    .sort((a, b) => b.received_at.getTime() - a.received_at.getTime())
    .slice(0, limit);
}

export async function getPayloadById(payloadId: string): Promise<WebhookPayload | null> {
  return payloads.get(payloadId) || null;
}

export async function getLatestPayload(sourceId: string): Promise<WebhookPayload | null> {
  const sourcePayloads = Array.from(payloads.values())
    .filter(p => p.source_id === sourceId)
    .sort((a, b) => b.received_at.getTime() - a.received_at.getTime());
  return sourcePayloads[0] || null;
}

export async function markPayloadProcessed(payloadId: string, invoiceId: string): Promise<void> {
  const payload = payloads.get(payloadId);
  if (payload) {
    payloads.set(payloadId, {
      ...payload,
      processed: true,
      processed_at: new Date(),
      invoice_id: invoiceId,
    });
  }
}

// ============ MAPPING CONFIGURATIONS ============

export async function createMapping(
  sourceId: string,
  name: string,
  fieldMappings: FieldMapping[],
  staticValues?: Record<string, unknown>,
  description?: string
): Promise<MappingConfiguration> {
  const mapping: MappingConfiguration = {
    mapping_id: uuidv4(),
    source_id: sourceId,
    name,
    description,
    version: 1,
    is_active: true,
    field_mappings: fieldMappings,
    static_values: staticValues,
    created_at: new Date(),
  };
  mappings.set(mapping.mapping_id, mapping);
  return mapping;
}

export async function getMappings(sourceId: string): Promise<MappingConfiguration[]> {
  return Array.from(mappings.values())
    .filter(m => m.source_id === sourceId)
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
}

export async function getMappingById(mappingId: string): Promise<MappingConfiguration | null> {
  return mappings.get(mappingId) || null;
}

export async function getActiveMapping(sourceId: string): Promise<MappingConfiguration | null> {
  const sourceMappings = Array.from(mappings.values())
    .filter(m => m.source_id === sourceId && m.is_active)
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  return sourceMappings[0] || null;
}

export async function updateMapping(
  mappingId: string,
  updates: Partial<Pick<MappingConfiguration, 'name' | 'description' | 'field_mappings' | 'static_values' | 'is_active'>>
): Promise<void> {
  const mapping = mappings.get(mappingId);
  if (mapping) {
    mappings.set(mappingId, {
      ...mapping,
      ...updates,
      version: mapping.version + 1,
      updated_at: new Date(),
    });
  }
}

// ============ OAUTH TOKENS ============

export async function saveToken(token: Omit<OAuthToken, 'token_id' | 'created_at'>): Promise<OAuthToken> {
  // Deactivate existing tokens for this realm
  for (const [id, t] of tokens) {
    if (t.realm_id === token.realm_id) {
      tokens.set(id, { ...t, is_active: false });
    }
  }

  const oauthToken: OAuthToken = {
    token_id: uuidv4(),
    ...token,
    created_at: new Date(),
  };
  tokens.set(oauthToken.token_id, oauthToken);
  return oauthToken;
}

export async function getActiveToken(): Promise<OAuthToken | null> {
  const activeTokens = Array.from(tokens.values())
    .filter(t => t.is_active)
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  return activeTokens[0] || null;
}

export async function updateToken(tokenId: string, updates: Partial<OAuthToken>): Promise<void> {
  const token = tokens.get(tokenId);
  if (token) {
    tokens.set(tokenId, { ...token, ...updates, updated_at: new Date() });
  }
}

// ============ SYNC LOGS ============

export async function createSyncLog(
  payloadId: string,
  sourceId: string,
  mappingId?: string
): Promise<SyncLog> {
  const log: SyncLog = {
    log_id: uuidv4(),
    payload_id: payloadId,
    source_id: sourceId,
    mapping_id: mappingId,
    status: 'pending',
    retry_count: 0,
    created_at: new Date(),
  };
  logs.set(log.log_id, log);
  return log;
}

export async function updateSyncLog(logId: string, updates: Partial<SyncLog>): Promise<void> {
  const log = logs.get(logId);
  if (log) {
    logs.set(logId, { ...log, ...updates });
  }
}

export async function getSyncLogs(limit = 100, sourceId?: string): Promise<SyncLog[]> {
  let result = Array.from(logs.values());
  if (sourceId) {
    result = result.filter(l => l.source_id === sourceId);
  }
  return result
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    .slice(0, limit);
}

export async function getSyncLogById(logId: string): Promise<SyncLog | null> {
  return logs.get(logId) || null;
}
