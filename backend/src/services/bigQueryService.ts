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
  MagicLink,
} from '../types';

const TABLES = {
  ORGANIZATIONS: 'organizations',
  ADMIN_USERS: 'admin_users',
  MAGIC_LINKS: 'magic_links',
  GLOBAL_TEMPLATES: 'global_mapping_templates',
  CLIENT_OVERRIDES: 'client_mapping_overrides',
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

// Helper to get full table path
function tablePath(tableName: string): string {
  return `\`${config.bigquery.projectId}.${config.bigquery.dataset}.${tableName}\``;
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
    settings,
    created_at: new Date(),
    created_by: createdBy,
  };

  const table = dataset.table(TABLES.ORGANIZATIONS);
  await table.insert([{
    organization_id: org.organization_id,
    name: org.name,
    slug: org.slug,
    plan_tier: org.plan_tier,
    is_active: org.is_active,
    settings: settings ? JSON.stringify(settings) : null,
    created_at: org.created_at.toISOString(),
    updated_at: org.created_at.toISOString(),
    created_by: createdBy,
  }]);

  return org;
}

export async function getOrganizations(): Promise<Organization[]> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.ORGANIZATIONS)}
    WHERE is_active = TRUE
    ORDER BY created_at DESC
  `;
  return runQuery<Organization>(query);
}

export async function getOrganizationById(orgId: string): Promise<Organization | null> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.ORGANIZATIONS)}
    WHERE organization_id = @orgId
  `;
  const rows = await runQuery<Organization>(query, { orgId });
  return rows[0] || null;
}

export async function getOrganizationBySlug(slug: string): Promise<Organization | null> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.ORGANIZATIONS)}
    WHERE slug = @slug AND is_active = TRUE
  `;
  const rows = await runQuery<Organization>(query, { slug });
  return rows[0] || null;
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
  role: AdminUser['role'] = 'admin'
): Promise<AdminUser> {
  const user: AdminUser = {
    user_id: uuidv4(),
    email,
    name,
    role,
    is_active: true,
    created_at: new Date(),
  };

  const table = dataset.table(TABLES.ADMIN_USERS);
  await table.insert([{
    user_id: user.user_id,
    email: user.email,
    name: user.name || null,
    role: user.role,
    is_active: user.is_active,
    last_login_at: null,
    created_at: user.created_at.toISOString(),
  }]);

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

  const query = `
    UPDATE ${tablePath(TABLES.ADMIN_USERS)}
    SET ${setClauses.join(', ')}
    WHERE user_id = @userId
  `;
  await runQuery(query, params);
}

// ============================================================
// MAGIC LINKS
// ============================================================

export async function createMagicLink(
  email: string,
  tokenHash: string,
  expiresAt: Date
): Promise<MagicLink> {
  const link: MagicLink = {
    link_id: uuidv4(),
    email,
    token_hash: tokenHash,
    expires_at: expiresAt,
    created_at: new Date(),
  };

  const table = dataset.table(TABLES.MAGIC_LINKS);
  await table.insert([{
    link_id: link.link_id,
    email: link.email,
    token_hash: link.token_hash,
    expires_at: link.expires_at.toISOString(),
    used_at: null,
    created_at: link.created_at.toISOString(),
  }]);

  return link;
}

export async function getMagicLinkByToken(tokenHash: string): Promise<MagicLink | null> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.MAGIC_LINKS)}
    WHERE token_hash = @tokenHash
      AND used_at IS NULL
      AND expires_at > CURRENT_TIMESTAMP()
  `;
  const rows = await runQuery<MagicLink>(query, { tokenHash });
  return rows[0] || null;
}

export async function markMagicLinkUsed(linkId: string): Promise<void> {
  const query = `
    UPDATE ${tablePath(TABLES.MAGIC_LINKS)}
    SET used_at = CURRENT_TIMESTAMP()
    WHERE link_id = @linkId
  `;
  await runQuery(query, { linkId });
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

  const table = dataset.table(TABLES.GLOBAL_TEMPLATES);
  await table.insert([{
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
  }]);

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
  const override: ClientMappingOverride = {
    override_id: uuidv4(),
    organization_id: organizationId,
    source_id: sourceId,
    template_id: templateId,
    name,
    description,
    field_mappings: fieldMappings,
    static_values: staticValues,
    priority,
    is_active: true,
    created_at: new Date(),
  };

  const table = dataset.table(TABLES.CLIENT_OVERRIDES);
  await table.insert([{
    override_id: override.override_id,
    organization_id: override.organization_id,
    source_id: override.source_id || null,
    template_id: override.template_id || null,
    name: override.name,
    description: override.description || null,
    field_mappings: JSON.stringify(override.field_mappings),
    static_values: staticValues ? JSON.stringify(staticValues) : null,
    priority: override.priority,
    is_active: override.is_active,
    created_at: override.created_at.toISOString(),
    updated_at: override.created_at.toISOString(),
  }]);

  return override;
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

  const table = dataset.table(TABLES.SOURCES);
  await table.insert([{
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
  }]);

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

  const table = dataset.table(TABLES.PAYLOADS);
  await table.insert([{
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
  }]);

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
  const query = `
    UPDATE ${tablePath(TABLES.PAYLOADS)}
    SET processed = TRUE, processed_at = CURRENT_TIMESTAMP(), invoice_id = @invoiceId
    WHERE payload_id = @payloadId AND organization_id = @organizationId
  `;
  await runQuery(query, { payloadId, organizationId, invoiceId });
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

  const table = dataset.table(TABLES.MAPPINGS);
  await table.insert([{
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
  }]);

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

  const table = dataset.table(TABLES.TOKENS);
  await table.insert([{
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
  }]);

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
  const log: SyncLog = {
    log_id: uuidv4(),
    organization_id: organizationId,
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
    organization_id: log.organization_id,
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
  await runQuery(query, params);
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

  return runQuery<SyncLog>(query, params);
}

export async function getSyncLogById(
  organizationId: string,
  logId: string
): Promise<SyncLog | null> {
  const query = `
    SELECT * FROM ${tablePath(TABLES.LOGS)}
    WHERE log_id = @logId AND organization_id = @organizationId
  `;
  const rows = await runQuery<SyncLog>(query, { logId, organizationId });
  return rows[0] || null;
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
// ADDITIONAL MAGIC LINK FUNCTIONS
// ============================================================

export async function cleanupExpiredMagicLinks(): Promise<number> {
  const countQuery = `
    SELECT COUNT(*) as count FROM ${tablePath(TABLES.MAGIC_LINKS)}
    WHERE expires_at < CURRENT_TIMESTAMP() AND used_at IS NULL
  `;
  const countResult = await runQuery<{ count: number }>(countQuery);
  const deletedCount = countResult[0]?.count || 0;

  const deleteQuery = `
    DELETE FROM ${tablePath(TABLES.MAGIC_LINKS)}
    WHERE expires_at < CURRENT_TIMESTAMP() AND used_at IS NULL
  `;
  await runQuery(deleteQuery);

  return deletedCount;
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
