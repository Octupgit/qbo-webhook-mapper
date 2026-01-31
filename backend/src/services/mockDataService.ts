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
  // Sample webhook source
  const sampleSource: WebhookSource = {
    source_id: 'sample-source-001',
    name: 'Sample Shopify Orders',
    description: 'Test webhook source for Shopify order data',
    api_key: 'test-api-key-12345678901234567890',
    is_active: true,
    created_at: new Date(),
  };
  sources.set(sampleSource.source_id, sampleSource);

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

  console.log('✓ Mock data initialized with sample source, payload, and mapping');
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
