/**
 * BigQuery Data Service - Production storage for QBO Webhook Mapper
 *
 * Multi-tenant aware: All queries include organization_id filtering
 */

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
  Organization,
  GlobalMappingTemplate,
  ClientMappingOverride,
  AdminUser,
} from '../types';
import { ApiKey, ApiUsageLog } from '../types/apiKey';

const TABLES = {
  ORGANIZATIONS: 'organizations',
  ADMIN_USERS: 'admin_users',
  GLOBAL_TEMPLATES: 'global_mapping_templates',
  CLIENT_OVERRIDES: 'client_mapping_overrides',
  SOURCES: 'webhook_sources_v2',           // v2 table with organization_id
  PAYLOADS: 'webhook_payloads_v2',         // v2 table with organization_id
  MAPPINGS: 'mapping_configurations_v2',   // v2 table with organization_id
  TOKENS: 'oauth_tokens_v2',               // v2 table with organization_id
  LOGS: 'sync_logs_v2',                    // v2 table with organization_id
  API_KEYS: 'api_keys',
  API_USAGE_LOGS: 'api_usage_logs',
};

// Log BigQuery configuration on module load
console.log('[BigQuery] Initializing with config:', {
  projectId: config.bigquery.projectId,
  dataset: config.bigquery.dataset,
  tables: Object.keys(TABLES).join(', '),
});

// Custom error class for BigQuery-specific errors
export class BigQueryError extends Error {
  public readonly code: string;
  public readonly reason: string;
  public readonly isConnectionError: boolean;
  public readonly isNotFoundError: boolean;
  public readonly isPermissionError: boolean;

  constructor(
    message: string,
    code: string,
    reason: string,
    originalError?: unknown
  ) {
    super(message);
    this.name = 'BigQueryError';
    this.code = code;
    this.reason = reason;
    this.isConnectionError = ['ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'UNAVAILABLE'].includes(code);
    this.isNotFoundError = code === 'NOT_FOUND' || reason === 'notFound';
    this.isPermissionError = code === 'PERMISSION_DENIED' || reason === 'accessDenied';

    // Preserve stack trace
    if (originalError instanceof Error && originalError.stack) {
      this.stack = originalError.stack;
    }
  }
}

// Helper to classify and wrap BigQuery errors
function classifyBigQueryError(error: unknown, context: string): BigQueryError {
  const gcpError = error as {
    code?: string | number;
    message?: string;
    errors?: Array<{ reason?: string; message?: string }>;
  };

  const errorCode = String(gcpError.code || 'UNKNOWN');
  const errorReason = gcpError.errors?.[0]?.reason || 'unknown';
  const errorMessage = gcpError.message || 'Unknown BigQuery error';

  // Create descriptive message based on error type
  let descriptiveMessage: string;
  if (['ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND'].includes(errorCode)) {
    descriptiveMessage = `BigQuery connection timeout in ${context}: Unable to reach BigQuery service`;
  } else if (errorCode === 'PERMISSION_DENIED' || errorReason === 'accessDenied') {
    descriptiveMessage = `BigQuery permission denied in ${context}: Service account lacks required permissions`;
  } else if (errorCode === 'NOT_FOUND' || errorReason === 'notFound') {
    descriptiveMessage = `BigQuery resource not found in ${context}: Table or dataset may not exist`;
  } else if (errorReason === 'invalidQuery') {
    descriptiveMessage = `BigQuery invalid query in ${context}: ${errorMessage}`;
  } else {
    descriptiveMessage = `BigQuery error in ${context}: ${errorMessage}`;
  }

  return new BigQueryError(descriptiveMessage, errorCode, errorReason, error);
}

// Helper to handle BigQuery insert operations with PartialFailureError logging
async function runInsert(
  tableName: string,
  rows: Record<string, unknown>[],
  context?: string
): Promise<void> {
  const insertContext = context || `insert into ${tableName}`;

  try {
    const table = dataset.table(tableName);
    await table.insert(rows);
    console.log(`[BigQuery] ${insertContext}: inserted ${rows.length} row(s)`);
  } catch (error: unknown) {
    // Check if this is a PartialFailureError (BigQuery streaming insert error)
    const bqError = error as {
      name?: string;
      errors?: Array<{
        row?: unknown;
        errors?: Array<{ reason?: string; message?: string; location?: string }>;
      }>;
      message?: string;
    };

    if (bqError.name === 'PartialFailureError' || bqError.errors) {
      console.error(`[BigQuery] PartialFailureError in ${insertContext}:`);
      console.error('[BigQuery] Full error.errors:', JSON.stringify(bqError.errors, null, 2));

      // Also log a summary for quick diagnosis
      if (Array.isArray(bqError.errors)) {
        bqError.errors.forEach((rowError, index) => {
          console.error(`[BigQuery] Row ${index} errors:`, rowError.errors);
        });
      }
    } else {
      // Not a PartialFailureError, log normally
      console.error(`[BigQuery] Insert error in ${insertContext}:`, error);
    }

    // Re-throw the error so callers can handle it
    throw error;
  }
}

// Helper to run queries with detailed error logging
async function runQuery<T>(query: string, params?: Record<string, unknown>, context?: string): Promise<T[]> {
  const options = {
    query,
    params,
    location: 'US',
  };

  const queryContext = context || 'query';

  try {
    console.log(`[BigQuery] Executing ${queryContext}:`, {
      projectId: config.bigquery.projectId,
      dataset: config.bigquery.dataset,
      queryPreview: query.substring(0, 100).replace(/\s+/g, ' ').trim() + '...',
    });

    const [rows] = await bigquery.query(options);
    console.log(`[BigQuery] ${queryContext} returned ${rows.length} rows`);
    return rows as T[];
  } catch (error) {
    // Classify and log the error with full context
    const bqError = classifyBigQueryError(error, queryContext);
    console.error('[BigQuery] Query failed:', {
      context: queryContext,
      projectId: config.bigquery.projectId,
      dataset: config.bigquery.dataset,
      errorCode: bqError.code,
      errorReason: bqError.reason,
      errorMessage: bqError.message,
      isConnectionError: bqError.isConnectionError,
      isNotFoundError: bqError.isNotFoundError,
      isPermissionError: bqError.isPermissionError,
      queryPreview: query.substring(0, 200) + '...',
      params: params ? Object.keys(params) : [],
    });
    throw bqError;
  }
}

// Helper to get full table path
function tablePath(tableName: string): string {
  return `\`${config.bigquery.projectId}.${config.bigquery.dataset}.${tableName}\``;
}

// Helper to parse BigQuery timestamp format
function parseTimestamp(value: unknown): Date | undefined {
  if (!value) return undefined;
  // BigQuery can return timestamps as {value: "2024-01-01T00:00:00Z"} or as plain strings
  if (typeof value === 'object' && value !== null && 'value' in value) {
    return new Date((value as { value: string }).value);
  }
  if (typeof value === 'string') {
    return new Date(value);
  }
  if (value instanceof Date) {
    return value;
  }
  return undefined;
}

// Helper to parse organization from BigQuery row
function parseOrganization(row: Record<string, unknown>): Organization {
  // Safely parse settings JSON
  let settings: Organization['settings'] | undefined;
  if (row.settings) {
    try {
      settings = typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings;
    } catch (e) {
      console.error('[BigQuery] Failed to parse organization settings:', e);
      settings = undefined;
    }
  }

  return {
    organization_id: row.organization_id as string,
    name: row.name as string,
    slug: row.slug as string,
    plan_tier: (row.plan_tier as Organization['plan_tier']) || 'free',
    is_active: row.is_active as boolean,
    connection_link_enabled: row.connection_link_enabled !== false, // Default to true
    settings,
    created_at: parseTimestamp(row.created_at) || new Date(),
    updated_at: parseTimestamp(row.updated_at),
    created_by: row.created_by as string | undefined,
  };
}

// ============================================================
// ORGANIZATIONS
// ============================================================

export async function createOrganization(
  name: string,
  slug: string,
  planTier: Organization['plan_tier'] = 'free',
  settings?: Organization['settings'],
  createdBy?: string
): Promise<Organization> {
  const org: Organization = {
    organization_id: uuidv4(),
    name,
    slug,
    plan_tier: planTier,
    is_active: true,
    connection_link_enabled: true,
    settings,
    created_at: new Date(),
    created_by: createdBy,
  };

  await runInsert(TABLES.ORGANIZATIONS, [{
    organization_id: org.organization_id,
    name: org.name,
    slug: org.slug,
    plan_tier: org.plan_tier,
    is_active: org.is_active,
    connection_link_enabled: org.connection_link_enabled,
    settings: settings ? JSON.stringify(settings) : null,
    created_at: org.created_at.toISOString(),
    updated_at: org.created_at.toISOString(),
    created_by: createdBy,
  }], `createOrganization(${slug})`);

  return org;
}

export async function getOrganizations(): Promise<Organization[]> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.ORGANIZATIONS)}
    WHERE is_active = TRUE
    ORDER BY created_at DESC
  `;
  const rows = await runQuery<Record<string, unknown>>(query);
  return rows.map(parseOrganization);
}

export async function getOrganizationById(orgId: string): Promise<Organization | null> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.ORGANIZATIONS)}
    WHERE organization_id = @orgId
  `;
  const rows = await runQuery<Record<string, unknown>>(query, { orgId });
  return rows[0] ? parseOrganization(rows[0]) : null;
}

export async function getOrganizationBySlug(slug: string): Promise<Organization | null> {
  // Case-insensitive slug lookup to handle variations like 'Apricoa' vs 'apricoa'
  const normalizedSlug = slug.toLowerCase().trim();
  const query = `
    SELECT * FROM ${tablePath(TABLES.ORGANIZATIONS)}
    WHERE LOWER(slug) = @slug AND is_active = TRUE
  `;
  const rows = await runQuery<Record<string, unknown>>(
    query,
    { slug: normalizedSlug },
    `getOrganizationBySlug(${slug})`
  );

  if (!rows[0]) {
    console.log(`[BigQuery] Organization not found for slug: "${slug}" (normalized: "${normalizedSlug}")`);
    return null;
  }

  return parseOrganization(rows[0]);
}

export async function updateOrganization(orgId: string, updates: Partial<Organization>): Promise<Organization | null> {
  const setClauses: string[] = [];
  const params: Record<string, unknown> = { orgId };

  if (updates.name !== undefined) {
    setClauses.push('name = @name');
    params.name = updates.name;
  }
  if (updates.slug !== undefined) {
    setClauses.push('slug = @slug');
    params.slug = updates.slug;
  }
  if (updates.plan_tier !== undefined) {
    setClauses.push('plan_tier = @plan_tier');
    params.plan_tier = updates.plan_tier;
  }
  if (updates.is_active !== undefined) {
    setClauses.push('is_active = @is_active');
    params.is_active = updates.is_active;
  }
  if (updates.settings !== undefined) {
    setClauses.push('settings = @settings');
    params.settings = JSON.stringify(updates.settings);
  }

  setClauses.push('updated_at = CURRENT_TIMESTAMP()');

  const query = `
    UPDATE ${tablePath(TABLES.ORGANIZATIONS)}
    SET ${setClauses.join(', ')}
    WHERE organization_id = @orgId
  `;
  await runQuery(query, params);

  // Return the updated organization
  return getOrganizationById(orgId);
}

// ============================================================
// ADMIN USERS
// ============================================================

export async function getAdminUserByEmail(email: string): Promise<AdminUser | null> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.ADMIN_USERS)}
    WHERE email = @email AND is_active = TRUE
  `;
  const rows = await runQuery<AdminUser>(query, { email });
  return rows[0] || null;
}

export async function createAdminUser(
  email: string,
  name?: string,
  role: AdminUser['role'] = 'admin',
  passwordHash?: string,
  mustChangePassword: boolean = true
): Promise<AdminUser> {
  const user: AdminUser = {
    user_id: uuidv4(),
    email,
    name,
    password_hash: passwordHash || '',
    must_change_password: mustChangePassword,
    role,
    is_active: true,
    created_at: new Date(),
  };

  await runInsert(TABLES.ADMIN_USERS, [{
    user_id: user.user_id,
    email: user.email,
    name: user.name || null,
    password_hash: user.password_hash,
    must_change_password: user.must_change_password,
    role: user.role,
    is_active: user.is_active,
    last_login_at: null,
    created_at: user.created_at.toISOString(),
  }], `createAdminUser(${email})`);

  return user;
}

export async function updateAdminUser(userId: string, updates: Partial<AdminUser>): Promise<void> {
  const setClauses: string[] = [];
  const params: Record<string, unknown> = { userId };

  if (updates.name !== undefined) {
    setClauses.push('name = @name');
    params.name = updates.name;
  }
  if (updates.role !== undefined) {
    setClauses.push('role = @role');
    params.role = updates.role;
  }
  if (updates.is_active !== undefined) {
    setClauses.push('is_active = @is_active');
    params.is_active = updates.is_active;
  }
  if (updates.last_login_at !== undefined) {
    setClauses.push('last_login_at = @last_login_at');
    params.last_login_at = updates.last_login_at;
  }
  if (updates.password_hash !== undefined) {
    setClauses.push('password_hash = @password_hash');
    params.password_hash = updates.password_hash;
  }
  if (updates.must_change_password !== undefined) {
    setClauses.push('must_change_password = @must_change_password');
    params.must_change_password = updates.must_change_password;
  }

  if (setClauses.length === 0) {
    return; // Nothing to update
  }

  const query = `
    UPDATE ${tablePath(TABLES.ADMIN_USERS)}
    SET ${setClauses.join(', ')}
    WHERE user_id = @userId
  `;
  await runQuery(query, params);
}

// ============================================================
// GLOBAL MAPPING TEMPLATES
// ============================================================

export async function createGlobalTemplate(
  name: string,
  sourceType: string,
  fieldMappings: FieldMapping[],
  description?: string,
  priority = 100,
  staticValues?: Record<string, unknown>
): Promise<GlobalMappingTemplate> {
  const template: GlobalMappingTemplate = {
    template_id: uuidv4(),
    name,
    source_type: sourceType,
    description,
    version: 1,
    is_active: true,
    field_mappings: fieldMappings,
    static_values: staticValues,
    priority,
    created_at: new Date(),
  };

  await runInsert(TABLES.GLOBAL_TEMPLATES, [{
    template_id: template.template_id,
    name: template.name,
    source_type: template.source_type,
    description: template.description || null,
    version: template.version,
    is_active: template.is_active,
    field_mappings: JSON.stringify(template.field_mappings),
    static_values: staticValues ? JSON.stringify(staticValues) : null,
    priority: template.priority,
    created_at: template.created_at.toISOString(),
    updated_at: template.created_at.toISOString(),
  }], `createGlobalTemplate(${name})`);

  return template;
}

export async function getGlobalTemplates(sourceType?: string): Promise<GlobalMappingTemplate[]> {
  let query = `
    SELECT * FROM ${tablePath(TABLES.GLOBAL_TEMPLATES)}
    WHERE is_active = TRUE
  `;
  const params: Record<string, unknown> = {};

  if (sourceType) {
    query += ` AND (source_type = @sourceType OR source_type = 'custom')`;
    params.sourceType = sourceType;
  }

  query += ` ORDER BY priority ASC`;

  const rows = await runQuery<GlobalMappingTemplate & { field_mappings: string; static_values: string }>(
    query,
    params
  );

  return rows.map((row) => ({
    ...row,
    field_mappings: JSON.parse(row.field_mappings),
    static_values: row.static_values ? JSON.parse(row.static_values) : undefined,
  }));
}

export async function getGlobalTemplateById(templateId: string): Promise<GlobalMappingTemplate | null> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.GLOBAL_TEMPLATES)}
    WHERE template_id = @templateId
  `;
  const rows = await runQuery<GlobalMappingTemplate & { field_mappings: string; static_values: string }>(
    query,
    { templateId }
  );

  if (!rows[0]) return null;

  return {
    ...rows[0],
    field_mappings: JSON.parse(rows[0].field_mappings),
    static_values: rows[0].static_values ? JSON.parse(rows[0].static_values) : undefined,
  };
}

export async function updateGlobalTemplate(
  templateId: string,
  updates: Partial<GlobalMappingTemplate>
): Promise<void> {
  const setClauses: string[] = [];
  const params: Record<string, unknown> = { templateId };

  if (updates.name !== undefined) {
    setClauses.push('name = @name');
    params.name = updates.name;
  }
  if (updates.source_type !== undefined) {
    setClauses.push('source_type = @source_type');
    params.source_type = updates.source_type;
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
  if (updates.priority !== undefined) {
    setClauses.push('priority = @priority');
    params.priority = updates.priority;
  }
  if (updates.is_active !== undefined) {
    setClauses.push('is_active = @is_active');
    params.is_active = updates.is_active;
  }

  setClauses.push('version = version + 1');
  setClauses.push('updated_at = CURRENT_TIMESTAMP()');

  const query = `
    UPDATE ${tablePath(TABLES.GLOBAL_TEMPLATES)}
    SET ${setClauses.join(', ')}
    WHERE template_id = @templateId
  `;
  await runQuery(query, params);
}

// ============================================================
// CLIENT MAPPING OVERRIDES
// ============================================================

export async function createClientOverride(
  organizationId: string,
  name: string,
  fieldMappings: FieldMapping[],
  sourceId?: string,
  templateId?: string,
  description?: string,
  priority = 50,
  staticValues?: Record<string, unknown>
): Promise<ClientMappingOverride> {
  const overrideId = uuidv4();
  const createdAt = new Date();

  // Use regular INSERT query instead of streaming insert
  // This avoids the "streaming buffer" limitation that prevents immediate updates
  const query = `
    INSERT INTO ${tablePath(TABLES.CLIENT_OVERRIDES)}
    (override_id, organization_id, source_id, template_id, name, description,
     field_mappings, static_values, priority, is_active, created_at, updated_at)
    VALUES
    (@overrideId, @organizationId, @sourceId, @templateId, @name, @description,
     @fieldMappings, @staticValues, @priority, TRUE, @createdAt, @createdAt)
  `;

  await runQuery(query, {
    overrideId,
    organizationId,
    sourceId: sourceId || null,
    templateId: templateId || null,
    name,
    description: description || null,
    fieldMappings: JSON.stringify(fieldMappings),
    staticValues: staticValues ? JSON.stringify(staticValues) : null,
    priority,
    createdAt: createdAt.toISOString(),
  }, `createClientOverride(${organizationId}, ${name})`);

  return {
    override_id: overrideId,
    organization_id: organizationId,
    source_id: sourceId,
    template_id: templateId,
    name,
    description,
    field_mappings: fieldMappings,
    static_values: staticValues,
    priority,
    is_active: true,
    created_at: createdAt,
  };
}

export async function getClientOverrides(
  organizationId: string,
  sourceId?: string
): Promise<ClientMappingOverride[]> {
  let query = `
    SELECT * FROM ${tablePath(TABLES.CLIENT_OVERRIDES)}
    WHERE organization_id = @organizationId AND is_active = TRUE
  `;
  const params: Record<string, unknown> = { organizationId };

  if (sourceId) {
    query += ` AND (source_id = @sourceId OR source_id IS NULL)`;
    params.sourceId = sourceId;
  }

  query += ` ORDER BY priority ASC`;

  const rows = await runQuery<ClientMappingOverride & { field_mappings: string; static_values: string }>(
    query,
    params
  );

  return rows.map((row) => ({
    ...row,
    field_mappings: JSON.parse(row.field_mappings),
    static_values: row.static_values ? JSON.parse(row.static_values) : undefined,
  }));
}

export async function getClientOverrideById(overrideId: string): Promise<ClientMappingOverride | null> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.CLIENT_OVERRIDES)}
    WHERE override_id = @overrideId
  `;
  const rows = await runQuery<ClientMappingOverride & { field_mappings: string; static_values: string }>(
    query,
    { overrideId }
  );

  if (!rows[0]) return null;

  return {
    ...rows[0],
    field_mappings: JSON.parse(rows[0].field_mappings),
    static_values: rows[0].static_values ? JSON.parse(rows[0].static_values) : undefined,
  };
}

export async function updateClientOverride(
  overrideId: string,
  updates: Partial<ClientMappingOverride>
): Promise<void> {
  const setClauses: string[] = [];
  const params: Record<string, unknown> = { overrideId };

  if (updates.name !== undefined) {
    setClauses.push('name = @name');
    params.name = updates.name;
  }
  if (updates.description !== undefined) {
    setClauses.push('description = @description');
    params.description = updates.description;
  }
  if (updates.source_id !== undefined) {
    setClauses.push('source_id = @source_id');
    params.source_id = updates.source_id;
  }
  if (updates.template_id !== undefined) {
    setClauses.push('template_id = @template_id');
    params.template_id = updates.template_id;
  }
  if (updates.field_mappings !== undefined) {
    setClauses.push('field_mappings = @field_mappings');
    params.field_mappings = JSON.stringify(updates.field_mappings);
  }
  if (updates.static_values !== undefined) {
    setClauses.push('static_values = @static_values');
    params.static_values = JSON.stringify(updates.static_values);
  }
  if (updates.priority !== undefined) {
    setClauses.push('priority = @priority');
    params.priority = updates.priority;
  }
  if (updates.is_active !== undefined) {
    setClauses.push('is_active = @is_active');
    params.is_active = updates.is_active;
  }

  setClauses.push('updated_at = CURRENT_TIMESTAMP()');

  const query = `
    UPDATE ${tablePath(TABLES.CLIENT_OVERRIDES)}
    SET ${setClauses.join(', ')}
    WHERE override_id = @overrideId
  `;
  await runQuery(query, params);
}

export async function deleteClientOverride(overrideId: string): Promise<void> {
  const query = `
    UPDATE ${tablePath(TABLES.CLIENT_OVERRIDES)}
    SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP()
    WHERE override_id = @overrideId
  `;
  await runQuery(query, { overrideId });
}

// ============================================================
// WEBHOOK SOURCES (Multi-tenant)
// ============================================================

export async function createSource(
  organizationId: string,
  name: string,
  description?: string,
  sourceType: string = 'custom'
): Promise<WebhookSource> {
  // Get org slug for webhook URL
  const org = await getOrganizationById(organizationId);
  const sourceId = uuidv4();

  const source: WebhookSource = {
    source_id: sourceId,
    organization_id: organizationId,
    name,
    description,
    source_type: sourceType,
    api_key: uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, ''),
    webhook_url: org ? `/api/v1/webhook/${org.slug}/${sourceId}` : undefined,
    is_active: true,
    created_at: new Date(),
  };

  await runInsert(TABLES.SOURCES, [{
    source_id: source.source_id,
    organization_id: source.organization_id,
    name: source.name,
    description: source.description || null,
    source_type: source.source_type,
    api_key: source.api_key,
    webhook_url: source.webhook_url || null,
    is_active: source.is_active,
    created_at: source.created_at.toISOString(),
    updated_at: source.created_at.toISOString(),
  }], `createSource(${organizationId}, ${name})`);

  return source;
}

export async function getSources(organizationId: string): Promise<WebhookSource[]> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.SOURCES)}
    WHERE organization_id = @organizationId AND is_active = TRUE
    ORDER BY created_at DESC
  `;
  return runQuery<WebhookSource>(query, { organizationId });
}

export async function getSourceById(organizationId: string, sourceId: string): Promise<WebhookSource | null> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.SOURCES)}
    WHERE source_id = @sourceId AND organization_id = @organizationId
  `;
  const rows = await runQuery<WebhookSource>(query, { sourceId, organizationId });
  return rows[0] || null;
}

export async function getSourceByApiKey(apiKey: string): Promise<WebhookSource | null> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.SOURCES)}
    WHERE api_key = @apiKey AND is_active = TRUE
  `;
  const rows = await runQuery<WebhookSource>(query, { apiKey });
  return rows[0] || null;
}

export async function updateSource(
  organizationId: string,
  sourceId: string,
  updates: Partial<WebhookSource>
): Promise<void> {
  const setClauses: string[] = [];
  const params: Record<string, unknown> = { sourceId, organizationId };

  if (updates.name !== undefined) {
    setClauses.push('name = @name');
    params.name = updates.name;
  }
  if (updates.description !== undefined) {
    setClauses.push('description = @description');
    params.description = updates.description;
  }
  if (updates.source_type !== undefined) {
    setClauses.push('source_type = @source_type');
    params.source_type = updates.source_type;
  }
  if (updates.is_active !== undefined) {
    setClauses.push('is_active = @is_active');
    params.is_active = updates.is_active;
  }

  setClauses.push('updated_at = CURRENT_TIMESTAMP()');

  const query = `
    UPDATE ${tablePath(TABLES.SOURCES)}
    SET ${setClauses.join(', ')}
    WHERE source_id = @sourceId AND organization_id = @organizationId
  `;
  await runQuery(query, params);
}

export async function regenerateApiKey(organizationId: string, sourceId: string): Promise<string> {
  const newApiKey = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
  const query = `
    UPDATE ${tablePath(TABLES.SOURCES)}
    SET api_key = @apiKey, updated_at = CURRENT_TIMESTAMP()
    WHERE source_id = @sourceId AND organization_id = @organizationId
  `;
  await runQuery(query, { sourceId, organizationId, apiKey: newApiKey });
  return newApiKey;
}

// ============================================================
// WEBHOOK PAYLOADS (Multi-tenant)
// ============================================================

export async function savePayload(
  organizationId: string,
  sourceId: string,
  payload: unknown,
  headers?: Record<string, string>
): Promise<WebhookPayload> {
  const webhookPayload: WebhookPayload = {
    payload_id: uuidv4(),
    organization_id: organizationId,
    source_id: sourceId,
    raw_payload: JSON.stringify(payload),
    headers: headers ? JSON.stringify(headers) : undefined,
    received_at: new Date(),
    processed: false,
  };

  await runInsert(TABLES.PAYLOADS, [{
    payload_id: webhookPayload.payload_id,
    organization_id: webhookPayload.organization_id,
    source_id: webhookPayload.source_id,
    raw_payload: webhookPayload.raw_payload,
    payload_hash: null,
    headers: webhookPayload.headers || null,
    received_at: webhookPayload.received_at.toISOString(),
    processed: webhookPayload.processed,
    processed_at: null,
    invoice_id: null,
  }], `savePayload(${organizationId}, ${sourceId})`);

  return webhookPayload;
}

export async function getPayloads(
  organizationId: string,
  sourceId: string,
  limit = 50
): Promise<WebhookPayload[]> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.PAYLOADS)}
    WHERE organization_id = @organizationId AND source_id = @sourceId
    ORDER BY received_at DESC
    LIMIT @limit
  `;
  return runQuery<WebhookPayload>(query, { organizationId, sourceId, limit });
}

export async function getPayloadById(
  organizationId: string,
  payloadId: string
): Promise<WebhookPayload | null> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.PAYLOADS)}
    WHERE payload_id = @payloadId AND organization_id = @organizationId
  `;
  const rows = await runQuery<WebhookPayload>(query, { payloadId, organizationId });
  return rows[0] || null;
}

export async function getLatestPayload(
  organizationId: string,
  sourceId: string
): Promise<WebhookPayload | null> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.PAYLOADS)}
    WHERE organization_id = @organizationId AND source_id = @sourceId
    ORDER BY received_at DESC
    LIMIT 1
  `;
  const rows = await runQuery<WebhookPayload>(query, { organizationId, sourceId });
  return rows[0] || null;
}

export async function markPayloadProcessed(
  organizationId: string,
  payloadId: string,
  invoiceId: string
): Promise<void> {
  try {
    const query = `
      UPDATE ${tablePath(TABLES.PAYLOADS)}
      SET processed = TRUE, processed_at = CURRENT_TIMESTAMP(), invoice_id = @invoiceId
      WHERE payload_id = @payloadId AND organization_id = @organizationId
    `;
    await runQuery(query, { payloadId, organizationId, invoiceId });
  } catch (error) {
    // Handle BigQuery streaming buffer limitation gracefully
    // Rows in the streaming buffer (~90 minutes) cannot be updated
    // The sync_log already tracks success, so this is non-critical
    const errorMessage = error instanceof Error ? error.message : '';
    if (errorMessage.includes('streaming buffer')) {
      console.warn(`[BigQuery] Cannot update payload ${payloadId} - still in streaming buffer. Sync log tracks success.`);
      return; // Don't throw - invoice was created successfully
    }
    throw error; // Re-throw other errors
  }
}

// ============================================================
// MAPPING CONFIGURATIONS (Multi-tenant)
// ============================================================

export async function createMapping(
  organizationId: string,
  sourceId: string,
  name: string,
  fieldMappings: FieldMapping[],
  staticValues?: Record<string, unknown>,
  description?: string,
  inheritsFromTemplateId?: string
): Promise<MappingConfiguration> {
  const mapping: MappingConfiguration = {
    mapping_id: uuidv4(),
    organization_id: organizationId,
    source_id: sourceId,
    inherits_from_template_id: inheritsFromTemplateId,
    name,
    description,
    version: 1,
    is_active: true,
    field_mappings: fieldMappings,
    static_values: staticValues,
    created_at: new Date(),
  };

  await runInsert(TABLES.MAPPINGS, [{
    mapping_id: mapping.mapping_id,
    organization_id: mapping.organization_id,
    source_id: mapping.source_id,
    inherits_from_template_id: mapping.inherits_from_template_id || null,
    name: mapping.name,
    description: mapping.description || null,
    version: mapping.version,
    is_active: mapping.is_active,
    field_mappings: JSON.stringify(mapping.field_mappings),
    static_values: mapping.static_values ? JSON.stringify(mapping.static_values) : null,
    created_at: mapping.created_at.toISOString(),
    updated_at: mapping.created_at.toISOString(),
  }], `createMapping(${organizationId}, ${sourceId}, ${name})`);

  return mapping;
}

export async function getMappings(
  organizationId: string,
  sourceId: string
): Promise<MappingConfiguration[]> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.MAPPINGS)}
    WHERE organization_id = @organizationId AND source_id = @sourceId
    ORDER BY created_at DESC
  `;
  const rows = await runQuery<MappingConfiguration & { field_mappings: string; static_values: string }>(
    query,
    { organizationId, sourceId }
  );

  return rows.map((row) => ({
    ...row,
    field_mappings: JSON.parse(row.field_mappings),
    static_values: row.static_values ? JSON.parse(row.static_values) : undefined,
  }));
}

export async function getMappingById(
  organizationId: string,
  mappingId: string
): Promise<MappingConfiguration | null> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.MAPPINGS)}
    WHERE mapping_id = @mappingId AND organization_id = @organizationId
  `;
  const rows = await runQuery<MappingConfiguration & { field_mappings: string; static_values: string }>(
    query,
    { mappingId, organizationId }
  );

  if (!rows[0]) return null;

  return {
    ...rows[0],
    field_mappings: JSON.parse(rows[0].field_mappings),
    static_values: rows[0].static_values ? JSON.parse(rows[0].static_values) : undefined,
  };
}

export async function getActiveMapping(
  organizationId: string,
  sourceId: string
): Promise<MappingConfiguration | null> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.MAPPINGS)}
    WHERE organization_id = @organizationId AND source_id = @sourceId AND is_active = TRUE
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const rows = await runQuery<MappingConfiguration & { field_mappings: string; static_values: string }>(
    query,
    { organizationId, sourceId }
  );

  if (!rows[0]) return null;

  return {
    ...rows[0],
    field_mappings: JSON.parse(rows[0].field_mappings),
    static_values: rows[0].static_values ? JSON.parse(rows[0].static_values) : undefined,
  };
}

export async function updateMapping(
  organizationId: string,
  mappingId: string,
  updates: Partial<Pick<MappingConfiguration, 'name' | 'description' | 'field_mappings' | 'static_values' | 'is_active'>>
): Promise<void> {
  const setClauses: string[] = [];
  const params: Record<string, unknown> = { mappingId, organizationId };

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
    UPDATE ${tablePath(TABLES.MAPPINGS)}
    SET ${setClauses.join(', ')}
    WHERE mapping_id = @mappingId AND organization_id = @organizationId
  `;
  await runQuery(query, params);
}

// ============================================================
// OAUTH TOKENS (Multi-tenant)
// ============================================================

export async function saveToken(
  organizationId: string,
  token: Omit<OAuthToken, 'token_id' | 'organization_id' | 'created_at'>
): Promise<OAuthToken> {
  const oauthToken: OAuthToken = {
    token_id: uuidv4(),
    organization_id: organizationId,
    ...token,
    created_at: new Date(),
  };

  // Deactivate existing tokens for this org and realm
  await runQuery(
    `UPDATE ${tablePath(TABLES.TOKENS)}
     SET is_active = FALSE
     WHERE organization_id = @organizationId AND realm_id = @realmId`,
    { organizationId, realmId: token.realm_id }
  );

  await runInsert(TABLES.TOKENS, [{
    token_id: oauthToken.token_id,
    organization_id: oauthToken.organization_id,
    realm_id: oauthToken.realm_id,
    access_token: oauthToken.access_token,
    refresh_token: oauthToken.refresh_token,
    access_token_expires_at: oauthToken.access_token_expires_at.toISOString(),
    refresh_token_expires_at: oauthToken.refresh_token_expires_at?.toISOString() || null,
    token_type: oauthToken.token_type,
    scope: oauthToken.scope || null,
    qbo_company_name: oauthToken.qbo_company_name || null,
    connection_name: oauthToken.connection_name || null,
    last_sync_at: null,
    sync_status: oauthToken.sync_status || 'active',
    is_active: oauthToken.is_active,
    created_at: oauthToken.created_at.toISOString(),
    updated_at: oauthToken.created_at.toISOString(),
  }], `saveToken(${organizationId}, realm=${token.realm_id})`);

  return oauthToken;
}

export async function getActiveToken(organizationId: string): Promise<OAuthToken | null> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.TOKENS)}
    WHERE organization_id = @organizationId AND is_active = TRUE
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const rows = await runQuery<OAuthToken>(query, { organizationId });
  return rows[0] || null;
}

export async function getExpiringTokens(withinMinutes: number): Promise<OAuthToken[]> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.TOKENS)}
    WHERE is_active = TRUE
      AND access_token_expires_at < TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL @minutes MINUTE)
  `;
  return runQuery<OAuthToken>(query, { minutes: withinMinutes });
}

export async function updateToken(
  organizationId: string,
  tokenId: string,
  updates: Partial<OAuthToken>
): Promise<void> {
  const setClauses: string[] = [];
  const params: Record<string, unknown> = { tokenId, organizationId };

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
  if (updates.qbo_company_name !== undefined) {
    setClauses.push('qbo_company_name = @qbo_company_name');
    params.qbo_company_name = updates.qbo_company_name;
  }
  if (updates.last_sync_at !== undefined) {
    setClauses.push('last_sync_at = @last_sync_at');
    params.last_sync_at = updates.last_sync_at;
  }
  if (updates.sync_status !== undefined) {
    setClauses.push('sync_status = @sync_status');
    params.sync_status = updates.sync_status;
  }

  setClauses.push('updated_at = CURRENT_TIMESTAMP()');

  const query = `
    UPDATE ${tablePath(TABLES.TOKENS)}
    SET ${setClauses.join(', ')}
    WHERE token_id = @tokenId AND organization_id = @organizationId
  `;
  await runQuery(query, params);
}

// ============================================================
// SYNC LOGS (Multi-tenant)
// ============================================================

export async function createSyncLog(
  organizationId: string,
  payloadId: string,
  sourceId: string,
  mappingId?: string
): Promise<SyncLog> {
  const logId = uuidv4();
  const createdAt = new Date();

  // Use regular INSERT query instead of streaming insert
  // This avoids the "streaming buffer" limitation that prevents immediate updates
  const query = `
    INSERT INTO ${tablePath(TABLES.LOGS)}
    (log_id, organization_id, payload_id, source_id, mapping_id, status,
     qbo_invoice_id, qbo_doc_number, request_payload, response_payload,
     error_message, error_code, retry_count, created_at, completed_at)
    VALUES
    (@logId, @organizationId, @payloadId, @sourceId, @mappingId, @status,
     NULL, NULL, NULL, NULL, NULL, NULL, @retryCount, @createdAt, NULL)
  `;

  await runQuery(query, {
    logId,
    organizationId,
    payloadId,
    sourceId,
    mappingId: mappingId || null,
    status: 'pending',
    retryCount: 0,
    createdAt: createdAt.toISOString(),
  }, `createSyncLog(${organizationId}, ${sourceId})`);

  return {
    log_id: logId,
    organization_id: organizationId,
    payload_id: payloadId,
    source_id: sourceId,
    mapping_id: mappingId,
    status: 'pending',
    retry_count: 0,
    created_at: createdAt,
  };
}

export async function updateSyncLog(
  organizationId: string,
  logId: string,
  updates: Partial<SyncLog>
): Promise<void> {
  const setClauses: string[] = [];
  const params: Record<string, unknown> = { logId, organizationId };

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
    UPDATE ${tablePath(TABLES.LOGS)}
    SET ${setClauses.join(', ')}
    WHERE log_id = @logId AND organization_id = @organizationId
  `;

  try {
    await runQuery(query, params);
  } catch (error) {
    // Handle BigQuery streaming buffer limitation gracefully
    const errorMessage = error instanceof Error ? error.message : '';
    if (errorMessage.includes('streaming buffer')) {
      console.warn(`[BigQuery] Cannot update sync log ${logId} - still in streaming buffer`);
      return; // Don't throw - this is a non-critical update
    }
    throw error;
  }
}

// Helper to normalize BigQuery timestamp to ISO string
function normalizeTimestamp(value: unknown): string | undefined {
  if (!value) return undefined;
  // BigQuery can return timestamps as {value: "2024-01-01T00:00:00Z"} or as plain strings
  if (typeof value === 'object' && value !== null && 'value' in value) {
    return (value as { value: string }).value;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return undefined;
}

// Helper to normalize sync log timestamps from BigQuery format
function normalizeSyncLog(row: Record<string, unknown>): SyncLog {
  const createdAtStr = normalizeTimestamp(row.created_at) || new Date().toISOString();
  const completedAtStr = normalizeTimestamp(row.completed_at);

  return {
    log_id: row.log_id as string,
    organization_id: row.organization_id as string,
    payload_id: row.payload_id as string,
    source_id: row.source_id as string,
    mapping_id: row.mapping_id as string | undefined,
    status: row.status as 'pending' | 'success' | 'failed' | 'retrying',
    qbo_invoice_id: row.qbo_invoice_id as string | undefined,
    qbo_doc_number: row.qbo_doc_number as string | undefined,
    request_payload: row.request_payload as string | undefined,
    response_payload: row.response_payload as string | undefined,
    error_message: row.error_message as string | undefined,
    error_code: row.error_code as string | undefined,
    retry_count: row.retry_count as number,
    created_at: new Date(createdAtStr),
    completed_at: completedAtStr ? new Date(completedAtStr) : undefined,
  };
}

export async function getSyncLogs(
  organizationId: string,
  limit = 100,
  sourceId?: string
): Promise<SyncLog[]> {
  let query = `
    SELECT * FROM ${tablePath(TABLES.LOGS)}
    WHERE organization_id = @organizationId
  `;
  const params: Record<string, unknown> = { organizationId, limit };

  if (sourceId) {
    query += ' AND source_id = @sourceId';
    params.sourceId = sourceId;
  }

  query += ' ORDER BY created_at DESC LIMIT @limit';

  const rows = await runQuery<Record<string, unknown>>(query, params);
  return rows.map(normalizeSyncLog);
}

export async function getSyncLogById(
  organizationId: string,
  logId: string
): Promise<SyncLog | null> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.LOGS)}
    WHERE log_id = @logId AND organization_id = @organizationId
  `;
  const rows = await runQuery<Record<string, unknown>>(query, { logId, organizationId });
  return rows[0] ? normalizeSyncLog(rows[0]) : null;
}

// ============================================================
// ADDITIONAL ADMIN USER FUNCTIONS
// ============================================================

export async function getAdminUsers(): Promise<AdminUser[]> {
  const query = `SELECT * FROM ${tablePath(TABLES.ADMIN_USERS)} WHERE is_active = TRUE`;
  return runQuery<AdminUser>(query);
}

export async function getAdminUserById(userId: string): Promise<AdminUser | null> {
  const query = `SELECT * FROM ${tablePath(TABLES.ADMIN_USERS)} WHERE user_id = @userId`;
  const rows = await runQuery<AdminUser>(query, { userId });
  return rows[0] || null;
}

export async function updateAdminLastLogin(userId: string): Promise<void> {
  const query = `
    UPDATE ${tablePath(TABLES.ADMIN_USERS)}
    SET last_login_at = CURRENT_TIMESTAMP()
    WHERE user_id = @userId
  `;
  await runQuery(query, { userId });
}

// ============================================================
// ADDITIONAL TEMPLATE & OVERRIDE FUNCTIONS
// ============================================================

export async function getGlobalTemplatesBySourceType(sourceType: string): Promise<GlobalMappingTemplate[]> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.GLOBAL_TEMPLATES)}
    WHERE source_type = @sourceType
    ORDER BY priority ASC
  `;
  const rows = await runQuery<GlobalMappingTemplate & { field_mappings: string; static_values?: string }>(
    query,
    { sourceType }
  );
  return rows.map(row => ({
    ...row,
    field_mappings: typeof row.field_mappings === 'string' ? JSON.parse(row.field_mappings) : row.field_mappings,
    static_values: row.static_values ? (typeof row.static_values === 'string' ? JSON.parse(row.static_values) : row.static_values) : undefined,
  }));
}

export async function getClientOverridesForSource(
  organizationId: string,
  sourceId: string
): Promise<ClientMappingOverride[]> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.CLIENT_OVERRIDES)}
    WHERE organization_id = @organizationId
    AND (source_id = @sourceId OR source_id IS NULL)
    ORDER BY priority ASC
  `;
  const rows = await runQuery<ClientMappingOverride & { field_mappings: string; static_values?: string }>(
    query,
    { organizationId, sourceId }
  );
  return rows.map(row => ({
    ...row,
    field_mappings: typeof row.field_mappings === 'string' ? JSON.parse(row.field_mappings) : row.field_mappings,
    static_values: row.static_values ? (typeof row.static_values === 'string' ? JSON.parse(row.static_values) : row.static_values) : undefined,
  }));
}

// ============================================================
// ADDITIONAL TOKEN FUNCTIONS
// ============================================================

export async function getAllActiveTokens(): Promise<OAuthToken[]> {
  const query = `SELECT * FROM ${tablePath(TABLES.TOKENS)} WHERE is_active = TRUE`;
  return runQuery<OAuthToken>(query);
}

export async function getTokensExpiringWithin(minutes: number): Promise<OAuthToken[]> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.TOKENS)}
    WHERE is_active = TRUE
    AND access_token_expires_at < TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL @minutes MINUTE)
  `;
  return runQuery<OAuthToken>(query, { minutes });
}

// ============================================================
// API KEYS
// ============================================================

/**
 * Create a new API key (key_hash is pre-computed by apiKeyService)
 */
export async function createApiKey(apiKey: ApiKey): Promise<ApiKey> {
  await runInsert(TABLES.API_KEYS, [{
    key_id: apiKey.key_id,
    organization_id: apiKey.organization_id,
    key_hash: apiKey.key_hash,
    key_prefix: apiKey.key_prefix,
    name: apiKey.name,
    key_type: apiKey.key_type,
    permissions: apiKey.permissions ? JSON.stringify(apiKey.permissions) : null,
    is_active: apiKey.is_active,
    created_at: apiKey.created_at.toISOString(),
    created_by: apiKey.created_by,
    last_used_at: apiKey.last_used_at?.toISOString() || null,
    expires_at: apiKey.expires_at?.toISOString() || null,
    revoked_at: apiKey.revoked_at?.toISOString() || null,
    revoked_by: apiKey.revoked_by,
    grace_period_ends_at: apiKey.grace_period_ends_at?.toISOString() || null,
  }], `createApiKey(${apiKey.name}, org=${apiKey.organization_id})`);

  return apiKey;
}

/**
 * Get API key by its hash (for validation)
 */
export async function getApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.API_KEYS)}
    WHERE key_hash = @keyHash
    LIMIT 1
  `;
  const rows = await runQuery<ApiKey>(query, { keyHash });
  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    ...row,
    permissions: row.permissions
      ? (typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions)
      : null,
    created_at: new Date(row.created_at),
    last_used_at: row.last_used_at ? new Date(row.last_used_at) : null,
    expires_at: row.expires_at ? new Date(row.expires_at) : null,
    revoked_at: row.revoked_at ? new Date(row.revoked_at) : null,
    grace_period_ends_at: row.grace_period_ends_at ? new Date(row.grace_period_ends_at) : null,
  };
}

/**
 * Get API key by ID
 */
export async function getApiKeyById(keyId: string): Promise<ApiKey | null> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.API_KEYS)}
    WHERE key_id = @keyId
    LIMIT 1
  `;
  const rows = await runQuery<ApiKey>(query, { keyId });
  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    ...row,
    permissions: row.permissions
      ? (typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions)
      : null,
    created_at: new Date(row.created_at),
    last_used_at: row.last_used_at ? new Date(row.last_used_at) : null,
    expires_at: row.expires_at ? new Date(row.expires_at) : null,
    revoked_at: row.revoked_at ? new Date(row.revoked_at) : null,
    grace_period_ends_at: row.grace_period_ends_at ? new Date(row.grace_period_ends_at) : null,
  };
}

/**
 * Get all API keys for an organization
 */
export async function getApiKeysByOrganization(organizationId: string): Promise<ApiKey[]> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.API_KEYS)}
    WHERE organization_id = @organizationId
    ORDER BY created_at DESC
  `;
  const rows = await runQuery<ApiKey>(query, { organizationId });

  return rows.map(row => ({
    ...row,
    permissions: row.permissions
      ? (typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions)
      : null,
    created_at: new Date(row.created_at),
    last_used_at: row.last_used_at ? new Date(row.last_used_at) : null,
    expires_at: row.expires_at ? new Date(row.expires_at) : null,
    revoked_at: row.revoked_at ? new Date(row.revoked_at) : null,
    grace_period_ends_at: row.grace_period_ends_at ? new Date(row.grace_period_ends_at) : null,
  }));
}

/**
 * Get all global admin API keys (organization_id IS NULL)
 */
export async function getGlobalApiKeys(): Promise<ApiKey[]> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.API_KEYS)}
    WHERE organization_id IS NULL
    ORDER BY created_at DESC
  `;
  const rows = await runQuery<ApiKey>(query);

  return rows.map(row => ({
    ...row,
    permissions: row.permissions
      ? (typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions)
      : null,
    created_at: new Date(row.created_at),
    last_used_at: row.last_used_at ? new Date(row.last_used_at) : null,
    expires_at: row.expires_at ? new Date(row.expires_at) : null,
    revoked_at: row.revoked_at ? new Date(row.revoked_at) : null,
    grace_period_ends_at: row.grace_period_ends_at ? new Date(row.grace_period_ends_at) : null,
  }));
}

/**
 * Update API key fields
 */
export async function updateApiKey(
  keyId: string,
  updates: Partial<Pick<ApiKey, 'is_active' | 'revoked_at' | 'revoked_by' | 'grace_period_ends_at' | 'expires_at'>>
): Promise<void> {
  const setClauses: string[] = [];
  const params: Record<string, unknown> = { keyId };

  if (updates.is_active !== undefined) {
    setClauses.push('is_active = @is_active');
    params.is_active = updates.is_active;
  }

  if (updates.revoked_at !== undefined) {
    setClauses.push('revoked_at = @revoked_at');
    params.revoked_at = updates.revoked_at ? updates.revoked_at.toISOString() : null;
  }

  if (updates.revoked_by !== undefined) {
    setClauses.push('revoked_by = @revoked_by');
    params.revoked_by = updates.revoked_by;
  }

  if (updates.grace_period_ends_at !== undefined) {
    setClauses.push('grace_period_ends_at = @grace_period_ends_at');
    params.grace_period_ends_at = updates.grace_period_ends_at
      ? updates.grace_period_ends_at.toISOString()
      : null;
  }

  if (updates.expires_at !== undefined) {
    setClauses.push('expires_at = @expires_at');
    params.expires_at = updates.expires_at ? updates.expires_at.toISOString() : null;
  }

  if (setClauses.length === 0) return;

  const query = `
    UPDATE ${tablePath(TABLES.API_KEYS)}
    SET ${setClauses.join(', ')}
    WHERE key_id = @keyId
  `;

  await runQuery(query, params);
}

/**
 * Update last_used_at timestamp for an API key
 */
export async function updateApiKeyLastUsed(keyId: string): Promise<void> {
  const query = `
    UPDATE ${tablePath(TABLES.API_KEYS)}
    SET last_used_at = CURRENT_TIMESTAMP()
    WHERE key_id = @keyId
  `;
  await runQuery(query, { keyId });
}

// ============================================================
// API USAGE LOGS
// ============================================================

/**
 * Log an API request
 */
export async function logApiUsage(log: ApiUsageLog): Promise<void> {
  await runInsert(TABLES.API_USAGE_LOGS, [{
    log_id: log.log_id,
    timestamp: log.timestamp.toISOString(),
    organization_id: log.organization_id,
    api_key_id: log.api_key_id,
    endpoint: log.endpoint,
    method: log.method,
    query_params: log.query_params ? JSON.stringify(log.query_params) : null,
    status_code: log.status_code,
    response_time_ms: log.response_time_ms,
    request_size_bytes: log.request_size_bytes,
    response_size_bytes: log.response_size_bytes,
    error_code: log.error_code,
    user_agent: log.user_agent,
    ip_address: log.ip_address,
  }], `logApiUsage(${log.endpoint})`);
}

/**
 * Get API usage logs for an organization
 */
export async function getApiUsageLogs(
  organizationId: string,
  options: { limit?: number; offset?: number; startDate?: Date; endDate?: Date } = {}
): Promise<ApiUsageLog[]> {
  const { limit = 100, offset = 0, startDate, endDate } = options;

  let query = `
    SELECT * FROM ${tablePath(TABLES.API_USAGE_LOGS)}
    WHERE organization_id = @organizationId
  `;
  const params: Record<string, unknown> = { organizationId, limit, offset };

  if (startDate) {
    query += ' AND timestamp >= @startDate';
    params.startDate = startDate.toISOString();
  }

  if (endDate) {
    query += ' AND timestamp <= @endDate';
    params.endDate = endDate.toISOString();
  }

  query += ' ORDER BY timestamp DESC LIMIT @limit OFFSET @offset';

  const rows = await runQuery<ApiUsageLog>(query, params);

  return rows.map(row => ({
    ...row,
    timestamp: new Date(row.timestamp),
    query_params: row.query_params
      ? (typeof row.query_params === 'string' ? JSON.parse(row.query_params) : row.query_params)
      : null,
  }));
}

/**
 * Get API usage statistics for an organization
 */
export async function getApiUsageStats(
  organizationId: string,
  hoursBack: number = 24
): Promise<{
  total_requests: number;
  success_count: number;
  error_count: number;
  avg_response_time_ms: number;
}> {
  const query = `
    SELECT
      COUNT(*) as total_requests,
      COUNTIF(status_code < 400) as success_count,
      COUNTIF(status_code >= 400) as error_count,
      AVG(response_time_ms) as avg_response_time_ms
    FROM ${tablePath(TABLES.API_USAGE_LOGS)}
    WHERE organization_id = @organizationId
    AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @hoursBack HOUR)
  `;

  const rows = await runQuery<{
    total_requests: number;
    success_count: number;
    error_count: number;
    avg_response_time_ms: number;
  }>(query, { organizationId, hoursBack });

  return rows[0] || {
    total_requests: 0,
    success_count: 0,
    error_count: 0,
    avg_response_time_ms: 0,
  };
}

// ============================================================
// AUDIT LOGS
// ============================================================

import { AuditLog, AuditLogFilters, AuditLogResponse } from '../types/auditLog';

/**
 * Insert multiple audit logs (batch insert from queue flush)
 */
export async function insertAuditLogs(logs: AuditLog[]): Promise<void> {
  if (logs.length === 0) return;

  const rows = logs.map((log) => ({
    log_id: log.log_id,
    timestamp: log.timestamp instanceof Date ? log.timestamp.toISOString() : log.timestamp,
    category: log.category,
    action: log.action,
    result: log.result,
    actor_type: log.actor_type,
    actor_id: log.actor_id,
    actor_email: log.actor_email,
    actor_ip: log.actor_ip,
    target_type: log.target_type,
    target_id: log.target_id,
    organization_id: log.organization_id,
    details: JSON.stringify(log.details),
    error_message: log.error_message,
    user_agent: log.user_agent,
    request_path: log.request_path,
    request_method: log.request_method,
  }));

  await runInsert('audit_logs', rows, `insertAuditLogs(${logs.length} logs)`);
}

/**
 * Query audit logs with filters
 */
export async function queryAuditLogs(filters: AuditLogFilters): Promise<AuditLogResponse> {
  let query = `SELECT * FROM \`${config.bigquery.projectId}.${config.bigquery.dataset}.audit_logs\` WHERE 1=1`;
  const params: Record<string, unknown> = {};

  if (filters.start_date) {
    query += ' AND timestamp >= @startDate';
    params.startDate = filters.start_date;
  }

  if (filters.end_date) {
    query += ' AND timestamp <= @endDate';
    params.endDate = filters.end_date;
  }

  if (filters.category) {
    const categories = Array.isArray(filters.category) ? filters.category : [filters.category];
    query += ' AND category IN UNNEST(@categories)';
    params.categories = categories;
  }

  if (filters.action) {
    const actions = Array.isArray(filters.action) ? filters.action : [filters.action];
    query += ' AND action IN UNNEST(@actions)';
    params.actions = actions;
  }

  if (filters.result) {
    query += ' AND result = @result';
    params.result = filters.result;
  }

  if (filters.actor_type) {
    query += ' AND actor_type = @actorType';
    params.actorType = filters.actor_type;
  }

  if (filters.actor_id) {
    query += ' AND actor_id = @actorId';
    params.actorId = filters.actor_id;
  }

  if (filters.actor_email) {
    query += ' AND actor_email = @actorEmail';
    params.actorEmail = filters.actor_email;
  }

  if (filters.organization_id) {
    query += ' AND organization_id = @organizationId';
    params.organizationId = filters.organization_id;
  }

  // Get total count
  const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
  const countRows = await runQuery<{ total: number }>(countQuery, params);
  const total = countRows[0]?.total || 0;

  // Add ordering and pagination
  query += ' ORDER BY timestamp DESC';
  const limit = filters.limit || 50;
  const offset = filters.offset || 0;
  query += ` LIMIT ${limit} OFFSET ${offset}`;

  const rows = await runQuery<AuditLog>(query, params);

  return {
    logs: rows.map((row) => ({
      ...row,
      details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details,
    })),
    total,
    limit,
    offset,
    has_more: offset + rows.length < total,
  };
}

// ============================================================
// ADDITIONAL ADMIN USER FUNCTIONS
// ============================================================

/**
 * Get all admin users (including inactive for user management)
 */
export async function getAllAdminUsers(): Promise<AdminUser[]> {
  const query = `
    SELECT * FROM \`${config.bigquery.projectId}.${config.bigquery.dataset}.admin_users\`
    ORDER BY created_at DESC
  `;
  return runQuery<AdminUser>(query);
}

/**
 * Delete an admin user (soft delete by setting is_active = false)
 */
export async function deleteAdminUser(userId: string): Promise<void> {
  const query = `
    UPDATE \`${config.bigquery.projectId}.${config.bigquery.dataset}.admin_users\`
    SET is_active = FALSE
    WHERE user_id = @userId
  `;
  await runQuery(query, { userId });
}

/**
 * Count active super admins
 */
export async function countSuperAdmins(): Promise<number> {
  const query = `
    SELECT COUNT(*) as count
    FROM \`${config.bigquery.projectId}.${config.bigquery.dataset}.admin_users\`
    WHERE role = 'super_admin' AND is_active = TRUE
  `;
  const rows = await runQuery<{ count: number }>(query);
  return rows[0]?.count || 0;
}

// ============================================================
// CONNECT TOKENS (Masked URLs for external QBO connection)
// ============================================================

import { ConnectToken } from '../types';

const CONNECT_TOKENS_TABLE = 'connect_tokens';

/**
 * Create a new connect token for an organization
 */
export async function createConnectToken(
  organizationId: string,
  tokenHash: string,
  options: { name?: string; expires_at?: Date; max_uses?: number; created_by?: string } = {}
): Promise<ConnectToken> {
  const token: ConnectToken = {
    token_id: uuidv4(),
    organization_id: organizationId,
    token_hash: tokenHash,
    name: options.name,
    expires_at: options.expires_at,
    max_uses: options.max_uses,
    use_count: 0,
    is_active: true,
    created_at: new Date(),
    created_by: options.created_by,
  };

  await runInsert(CONNECT_TOKENS_TABLE, [{
    token_id: token.token_id,
    organization_id: token.organization_id,
    token_hash: token.token_hash,
    name: token.name || null,
    expires_at: token.expires_at?.toISOString() || null,
    max_uses: token.max_uses || null,
    use_count: token.use_count,
    is_active: token.is_active,
    created_at: token.created_at.toISOString(),
    created_by: token.created_by || null,
    last_used_at: null,
  }], `createConnectToken(${organizationId})`);

  return token;
}

/**
 * Get a connect token by its hash (for URL validation)
 */
export async function getConnectTokenByHash(tokenHash: string): Promise<ConnectToken | null> {
  const query = `
    SELECT * FROM ${tablePath(CONNECT_TOKENS_TABLE)}
    WHERE token_hash = @tokenHash AND is_active = TRUE
  `;
  const rows = await runQuery<ConnectToken>(query, { tokenHash });

  if (!rows[0]) return null;

  const row = rows[0];
  return {
    ...row,
    created_at: parseTimestamp(row.created_at) || new Date(),
    expires_at: parseTimestamp(row.expires_at),
    last_used_at: parseTimestamp(row.last_used_at),
  };
}

/**
 * Get all connect tokens for an organization
 */
export async function getConnectTokensByOrganization(organizationId: string): Promise<ConnectToken[]> {
  const query = `
    SELECT * FROM ${tablePath(CONNECT_TOKENS_TABLE)}
    WHERE organization_id = @organizationId
    ORDER BY created_at DESC
  `;
  const rows = await runQuery<ConnectToken>(query, { organizationId });

  return rows.map(row => ({
    ...row,
    created_at: parseTimestamp(row.created_at) || new Date(),
    expires_at: parseTimestamp(row.expires_at),
    last_used_at: parseTimestamp(row.last_used_at),
  }));
}

/**
 * Increment use count and update last_used_at for a connect token
 */
export async function incrementConnectTokenUsage(tokenId: string): Promise<void> {
  const query = `
    UPDATE ${tablePath(CONNECT_TOKENS_TABLE)}
    SET use_count = use_count + 1, last_used_at = CURRENT_TIMESTAMP()
    WHERE token_id = @tokenId
  `;
  await runQuery(query, { tokenId });
}

/**
 * Deactivate a connect token
 */
export async function deactivateConnectToken(tokenId: string): Promise<void> {
  const query = `
    UPDATE ${tablePath(CONNECT_TOKENS_TABLE)}
    SET is_active = FALSE
    WHERE token_id = @tokenId
  `;
  await runQuery(query, { tokenId });
}
