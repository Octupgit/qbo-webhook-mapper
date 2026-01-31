import { v4 as uuidv4 } from 'uuid';
import { bigquery, dataset } from '../config/bigquery';
import config from '../config';
import {
  WebhookSource,
  WebhookPayload,
  MappingConfiguration,
  OAuthToken,
  SyncLog,
  FieldMapping,
} from '../types';

const TABLES = {
  SOURCES: 'webhook_sources',
  PAYLOADS: 'webhook_payloads',
  MAPPINGS: 'mapping_configurations',
  TOKENS: 'oauth_tokens',
  LOGS: 'sync_logs',
};

// Helper to run queries
async function runQuery<T>(query: string, params?: Record<string, unknown>): Promise<T[]> {
  const options = {
    query,
    params,
    location: 'US',
  };
  const [rows] = await bigquery.query(options);
  return rows as T[];
}

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

  const table = dataset.table(TABLES.SOURCES);
  await table.insert([{
    source_id: source.source_id,
    name: source.name,
    description: source.description || null,
    api_key: source.api_key,
    is_active: source.is_active,
    created_at: source.created_at.toISOString(),
    updated_at: source.created_at.toISOString(),
  }]);

  return source;
}

export async function getSources(): Promise<WebhookSource[]> {
  const query = `
    SELECT * FROM \`${config.bigquery.projectId}.${config.bigquery.dataset}.${TABLES.SOURCES}\`
    WHERE is_active = TRUE
    ORDER BY created_at DESC
  `;
  return runQuery<WebhookSource>(query);
}

export async function getSourceById(sourceId: string): Promise<WebhookSource | null> {
  const query = `
    SELECT * FROM \`${config.bigquery.projectId}.${config.bigquery.dataset}.${TABLES.SOURCES}\`
    WHERE source_id = @sourceId
  `;
  const rows = await runQuery<WebhookSource>(query, { sourceId });
  return rows[0] || null;
}

export async function getSourceByApiKey(apiKey: string): Promise<WebhookSource | null> {
  const query = `
    SELECT * FROM \`${config.bigquery.projectId}.${config.bigquery.dataset}.${TABLES.SOURCES}\`
    WHERE api_key = @apiKey AND is_active = TRUE
  `;
  const rows = await runQuery<WebhookSource>(query, { apiKey });
  return rows[0] || null;
}

export async function updateSource(sourceId: string, updates: Partial<WebhookSource>): Promise<void> {
  const setClauses: string[] = [];
  const params: Record<string, unknown> = { sourceId };

  if (updates.name !== undefined) {
    setClauses.push('name = @name');
    params.name = updates.name;
  }
  if (updates.description !== undefined) {
    setClauses.push('description = @description');
    params.description = updates.description;
  }
  if (updates.is_active !== undefined) {
    setClauses.push('is_active = @is_active');
    params.is_active = updates.is_active;
  }

  setClauses.push('updated_at = CURRENT_TIMESTAMP()');

  const query = `
    UPDATE \`${config.bigquery.projectId}.${config.bigquery.dataset}.${TABLES.SOURCES}\`
    SET ${setClauses.join(', ')}
    WHERE source_id = @sourceId
  `;
  await runQuery(query, params);
}

export async function regenerateApiKey(sourceId: string): Promise<string> {
  const newApiKey = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
  const query = `
    UPDATE \`${config.bigquery.projectId}.${config.bigquery.dataset}.${TABLES.SOURCES}\`
    SET api_key = @apiKey, updated_at = CURRENT_TIMESTAMP()
    WHERE source_id = @sourceId
  `;
  await runQuery(query, { sourceId, apiKey: newApiKey });
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

  const table = dataset.table(TABLES.PAYLOADS);
  await table.insert([{
    payload_id: webhookPayload.payload_id,
    source_id: webhookPayload.source_id,
    raw_payload: webhookPayload.raw_payload,
    headers: webhookPayload.headers || null,
    received_at: webhookPayload.received_at.toISOString(),
    processed: webhookPayload.processed,
    processed_at: null,
    invoice_id: null,
  }]);

  return webhookPayload;
}

export async function getPayloads(sourceId: string, limit = 50): Promise<WebhookPayload[]> {
  const query = `
    SELECT * FROM \`${config.bigquery.projectId}.${config.bigquery.dataset}.${TABLES.PAYLOADS}\`
    WHERE source_id = @sourceId
    ORDER BY received_at DESC
    LIMIT @limit
  `;
  return runQuery<WebhookPayload>(query, { sourceId, limit });
}

export async function getPayloadById(payloadId: string): Promise<WebhookPayload | null> {
  const query = `
    SELECT * FROM \`${config.bigquery.projectId}.${config.bigquery.dataset}.${TABLES.PAYLOADS}\`
    WHERE payload_id = @payloadId
  `;
  const rows = await runQuery<WebhookPayload>(query, { payloadId });
  return rows[0] || null;
}

export async function getLatestPayload(sourceId: string): Promise<WebhookPayload | null> {
  const query = `
    SELECT * FROM \`${config.bigquery.projectId}.${config.bigquery.dataset}.${TABLES.PAYLOADS}\`
    WHERE source_id = @sourceId
    ORDER BY received_at DESC
    LIMIT 1
  `;
  const rows = await runQuery<WebhookPayload>(query, { sourceId });
  return rows[0] || null;
}

export async function markPayloadProcessed(payloadId: string, invoiceId: string): Promise<void> {
  const query = `
    UPDATE \`${config.bigquery.projectId}.${config.bigquery.dataset}.${TABLES.PAYLOADS}\`
    SET processed = TRUE, processed_at = CURRENT_TIMESTAMP(), invoice_id = @invoiceId
    WHERE payload_id = @payloadId
  `;
  await runQuery(query, { payloadId, invoiceId });
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

  const table = dataset.table(TABLES.MAPPINGS);
  await table.insert([{
    mapping_id: mapping.mapping_id,
    source_id: mapping.source_id,
    name: mapping.name,
    description: mapping.description || null,
    version: mapping.version,
    is_active: mapping.is_active,
    field_mappings: JSON.stringify(mapping.field_mappings),
    static_values: mapping.static_values ? JSON.stringify(mapping.static_values) : null,
    created_at: mapping.created_at.toISOString(),
    updated_at: mapping.created_at.toISOString(),
  }]);

  return mapping;
}

export async function getMappings(sourceId: string): Promise<MappingConfiguration[]> {
  const query = `
    SELECT * FROM \`${config.bigquery.projectId}.${config.bigquery.dataset}.${TABLES.MAPPINGS}\`
    WHERE source_id = @sourceId
    ORDER BY created_at DESC
  `;
  const rows = await runQuery<MappingConfiguration & { field_mappings: string; static_values: string }>(
    query,
    { sourceId }
  );

  return rows.map((row) => ({
    ...row,
    field_mappings: JSON.parse(row.field_mappings),
    static_values: row.static_values ? JSON.parse(row.static_values) : undefined,
  }));
}

export async function getMappingById(mappingId: string): Promise<MappingConfiguration | null> {
  const query = `
    SELECT * FROM \`${config.bigquery.projectId}.${config.bigquery.dataset}.${TABLES.MAPPINGS}\`
    WHERE mapping_id = @mappingId
  `;
  const rows = await runQuery<MappingConfiguration & { field_mappings: string; static_values: string }>(
    query,
    { mappingId }
  );

  if (!rows[0]) return null;

  return {
    ...rows[0],
    field_mappings: JSON.parse(rows[0].field_mappings),
    static_values: rows[0].static_values ? JSON.parse(rows[0].static_values) : undefined,
  };
}

export async function getActiveMapping(sourceId: string): Promise<MappingConfiguration | null> {
  const query = `
    SELECT * FROM \`${config.bigquery.projectId}.${config.bigquery.dataset}.${TABLES.MAPPINGS}\`
    WHERE source_id = @sourceId AND is_active = TRUE
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const rows = await runQuery<MappingConfiguration & { field_mappings: string; static_values: string }>(
    query,
    { sourceId }
  );

  if (!rows[0]) return null;

  return {
    ...rows[0],
    field_mappings: JSON.parse(rows[0].field_mappings),
    static_values: rows[0].static_values ? JSON.parse(rows[0].static_values) : undefined,
  };
}

export async function updateMapping(
  mappingId: string,
  updates: Partial<Pick<MappingConfiguration, 'name' | 'description' | 'field_mappings' | 'static_values' | 'is_active'>>
): Promise<void> {
  const setClauses: string[] = [];
  const params: Record<string, unknown> = { mappingId };

  if (updates.name !== undefined) {
    setClauses.push('name = @name');
    params.name = updates.name;
  }
  if (updates.description !== undefined) {
    setClauses.push('description = @description');
    params.description = updates.description;
  }
  if (updates.field_mappings !== undefined) {
    setClauses.push('field_mappings = @field_mappings');
    params.field_mappings = JSON.stringify(updates.field_mappings);
  }
  if (updates.static_values !== undefined) {
    setClauses.push('static_values = @static_values');
    params.static_values = JSON.stringify(updates.static_values);
  }
  if (updates.is_active !== undefined) {
    setClauses.push('is_active = @is_active');
    params.is_active = updates.is_active;
  }

  setClauses.push('updated_at = CURRENT_TIMESTAMP()');
  setClauses.push('version = version + 1');

  const query = `
    UPDATE \`${config.bigquery.projectId}.${config.bigquery.dataset}.${TABLES.MAPPINGS}\`
    SET ${setClauses.join(', ')}
    WHERE mapping_id = @mappingId
  `;
  await runQuery(query, params);
}

// ============ OAUTH TOKENS ============

export async function saveToken(token: Omit<OAuthToken, 'token_id' | 'created_at'>): Promise<OAuthToken> {
  const oauthToken: OAuthToken = {
    token_id: uuidv4(),
    ...token,
    created_at: new Date(),
  };

  // Deactivate existing tokens for this realm
  await runQuery(
    `UPDATE \`${config.bigquery.projectId}.${config.bigquery.dataset}.${TABLES.TOKENS}\`
     SET is_active = FALSE WHERE realm_id = @realmId`,
    { realmId: token.realm_id }
  );

  const table = dataset.table(TABLES.TOKENS);
  await table.insert([{
    token_id: oauthToken.token_id,
    realm_id: oauthToken.realm_id,
    access_token: oauthToken.access_token,
    refresh_token: oauthToken.refresh_token,
    access_token_expires_at: oauthToken.access_token_expires_at.toISOString(),
    refresh_token_expires_at: oauthToken.refresh_token_expires_at?.toISOString() || null,
    token_type: oauthToken.token_type,
    scope: oauthToken.scope || null,
    is_active: oauthToken.is_active,
    created_at: oauthToken.created_at.toISOString(),
    updated_at: oauthToken.created_at.toISOString(),
  }]);

  return oauthToken;
}

export async function getActiveToken(): Promise<OAuthToken | null> {
  const query = `
    SELECT * FROM \`${config.bigquery.projectId}.${config.bigquery.dataset}.${TABLES.TOKENS}\`
    WHERE is_active = TRUE
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const rows = await runQuery<OAuthToken>(query);
  return rows[0] || null;
}

export async function updateToken(tokenId: string, updates: Partial<OAuthToken>): Promise<void> {
  const setClauses: string[] = [];
  const params: Record<string, unknown> = { tokenId };

  if (updates.access_token !== undefined) {
    setClauses.push('access_token = @access_token');
    params.access_token = updates.access_token;
  }
  if (updates.refresh_token !== undefined) {
    setClauses.push('refresh_token = @refresh_token');
    params.refresh_token = updates.refresh_token;
  }
  if (updates.access_token_expires_at !== undefined) {
    setClauses.push('access_token_expires_at = @access_token_expires_at');
    params.access_token_expires_at = updates.access_token_expires_at;
  }
  if (updates.is_active !== undefined) {
    setClauses.push('is_active = @is_active');
    params.is_active = updates.is_active;
  }

  setClauses.push('updated_at = CURRENT_TIMESTAMP()');

  const query = `
    UPDATE \`${config.bigquery.projectId}.${config.bigquery.dataset}.${TABLES.TOKENS}\`
    SET ${setClauses.join(', ')}
    WHERE token_id = @tokenId
  `;
  await runQuery(query, params);
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

  const table = dataset.table(TABLES.LOGS);
  await table.insert([{
    log_id: log.log_id,
    payload_id: log.payload_id,
    source_id: log.source_id,
    mapping_id: log.mapping_id || null,
    status: log.status,
    qbo_invoice_id: null,
    qbo_doc_number: null,
    request_payload: null,
    response_payload: null,
    error_message: null,
    error_code: null,
    retry_count: log.retry_count,
    created_at: log.created_at.toISOString(),
    completed_at: null,
  }]);

  return log;
}

export async function updateSyncLog(
  logId: string,
  updates: Partial<SyncLog>
): Promise<void> {
  const setClauses: string[] = [];
  const params: Record<string, unknown> = { logId };

  if (updates.status !== undefined) {
    setClauses.push('status = @status');
    params.status = updates.status;
  }
  if (updates.qbo_invoice_id !== undefined) {
    setClauses.push('qbo_invoice_id = @qbo_invoice_id');
    params.qbo_invoice_id = updates.qbo_invoice_id;
  }
  if (updates.qbo_doc_number !== undefined) {
    setClauses.push('qbo_doc_number = @qbo_doc_number');
    params.qbo_doc_number = updates.qbo_doc_number;
  }
  if (updates.request_payload !== undefined) {
    setClauses.push('request_payload = @request_payload');
    params.request_payload = updates.request_payload;
  }
  if (updates.response_payload !== undefined) {
    setClauses.push('response_payload = @response_payload');
    params.response_payload = updates.response_payload;
  }
  if (updates.error_message !== undefined) {
    setClauses.push('error_message = @error_message');
    params.error_message = updates.error_message;
  }
  if (updates.error_code !== undefined) {
    setClauses.push('error_code = @error_code');
    params.error_code = updates.error_code;
  }
  if (updates.retry_count !== undefined) {
    setClauses.push('retry_count = @retry_count');
    params.retry_count = updates.retry_count;
  }
  if (updates.completed_at !== undefined) {
    setClauses.push('completed_at = @completed_at');
    params.completed_at = updates.completed_at;
  }

  const query = `
    UPDATE \`${config.bigquery.projectId}.${config.bigquery.dataset}.${TABLES.LOGS}\`
    SET ${setClauses.join(', ')}
    WHERE log_id = @logId
  `;
  await runQuery(query, params);
}

export async function getSyncLogs(limit = 100, sourceId?: string): Promise<SyncLog[]> {
  let query = `
    SELECT * FROM \`${config.bigquery.projectId}.${config.bigquery.dataset}.${TABLES.LOGS}\`
  `;
  const params: Record<string, unknown> = { limit };

  if (sourceId) {
    query += ' WHERE source_id = @sourceId';
    params.sourceId = sourceId;
  }

  query += ' ORDER BY created_at DESC LIMIT @limit';

  return runQuery<SyncLog>(query, params);
}

export async function getSyncLogById(logId: string): Promise<SyncLog | null> {
  const query = `
    SELECT * FROM \`${config.bigquery.projectId}.${config.bigquery.dataset}.${TABLES.LOGS}\`
    WHERE log_id = @logId
  `;
  const rows = await runQuery<SyncLog>(query, { logId });
  return rows[0] || null;
}
