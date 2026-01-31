-- ============================================================
-- Multi-Tenant Migration Script for QBO Webhook Mapper
-- Target: Google BigQuery
-- Project: octup-testing
-- Dataset: qbo_webhook_mapper
-- ============================================================

-- ============================================================
-- PHASE 1: CREATE NEW TABLES
-- ============================================================

-- Organizations Table (Core tenant entity)
CREATE TABLE IF NOT EXISTS `octup-testing.qbo_webhook_mapper.organizations` (
  organization_id STRING NOT NULL,
  name STRING NOT NULL,
  slug STRING NOT NULL,
  plan_tier STRING DEFAULT 'free',
  is_active BOOL DEFAULT TRUE,
  settings STRING,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  created_by STRING
);

-- Admin Users Table (Internal admin dashboard users)
CREATE TABLE IF NOT EXISTS `octup-testing.qbo_webhook_mapper.admin_users` (
  user_id STRING NOT NULL,
  email STRING NOT NULL,
  name STRING,
  role STRING DEFAULT 'admin',
  is_active BOOL DEFAULT TRUE,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- Magic Links Table (Passwordless auth tokens)
CREATE TABLE IF NOT EXISTS `octup-testing.qbo_webhook_mapper.magic_links` (
  link_id STRING NOT NULL,
  email STRING NOT NULL,
  token_hash STRING NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- Global Mapping Templates Table (Master templates for all clients)
CREATE TABLE IF NOT EXISTS `octup-testing.qbo_webhook_mapper.global_mapping_templates` (
  template_id STRING NOT NULL,
  name STRING NOT NULL,
  source_type STRING NOT NULL,
  description STRING,
  version INT64 DEFAULT 1,
  is_active BOOL DEFAULT TRUE,
  field_mappings STRING NOT NULL,
  static_values STRING,
  priority INT64 DEFAULT 100,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  created_by STRING
);

-- Client Mapping Overrides Table (Per-organization overrides)
CREATE TABLE IF NOT EXISTS `octup-testing.qbo_webhook_mapper.client_mapping_overrides` (
  override_id STRING NOT NULL,
  organization_id STRING NOT NULL,
  source_id STRING,
  template_id STRING,
  name STRING NOT NULL,
  description STRING,
  field_mappings STRING NOT NULL,
  static_values STRING,
  priority INT64 DEFAULT 50,
  is_active BOOL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- ============================================================
-- PHASE 2: ADD ORGANIZATION_ID TO EXISTING TABLES
-- ============================================================

-- Note: BigQuery doesn't support ALTER TABLE ADD COLUMN directly.
-- We need to recreate tables with new schema or use DDL statements.
-- For existing tables, we'll create new versions and migrate data.

-- Step 2.1: Create new webhook_sources table with organization_id
CREATE TABLE IF NOT EXISTS `octup-testing.qbo_webhook_mapper.webhook_sources_v2` (
  source_id STRING NOT NULL,
  organization_id STRING NOT NULL,
  name STRING NOT NULL,
  description STRING,
  source_type STRING DEFAULT 'custom',
  api_key STRING NOT NULL,
  webhook_url STRING,
  is_active BOOL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  created_by STRING
);

-- Step 2.2: Create new webhook_payloads table with organization_id
CREATE TABLE IF NOT EXISTS `octup-testing.qbo_webhook_mapper.webhook_payloads_v2` (
  payload_id STRING NOT NULL,
  organization_id STRING NOT NULL,
  source_id STRING NOT NULL,
  raw_payload STRING NOT NULL,
  payload_hash STRING,
  headers STRING,
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  processed BOOL DEFAULT FALSE,
  processed_at TIMESTAMP,
  invoice_id STRING
)
PARTITION BY DATE(received_at)
CLUSTER BY organization_id, source_id;

-- Step 2.3: Create new mapping_configurations table with organization_id
CREATE TABLE IF NOT EXISTS `octup-testing.qbo_webhook_mapper.mapping_configurations_v2` (
  mapping_id STRING NOT NULL,
  organization_id STRING NOT NULL,
  source_id STRING NOT NULL,
  inherits_from_template_id STRING,
  name STRING NOT NULL,
  description STRING,
  version INT64 DEFAULT 1,
  is_active BOOL DEFAULT TRUE,
  field_mappings STRING NOT NULL,
  static_values STRING,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(created_at)
CLUSTER BY organization_id, source_id;

-- Step 2.4: Create new oauth_tokens table with organization_id
CREATE TABLE IF NOT EXISTS `octup-testing.qbo_webhook_mapper.oauth_tokens_v2` (
  token_id STRING NOT NULL,
  organization_id STRING NOT NULL,
  realm_id STRING NOT NULL,
  access_token STRING NOT NULL,
  refresh_token STRING NOT NULL,
  access_token_expires_at TIMESTAMP,
  refresh_token_expires_at TIMESTAMP,
  token_type STRING DEFAULT 'Bearer',
  scope STRING,
  qbo_company_name STRING,
  connection_name STRING,
  last_sync_at TIMESTAMP,
  sync_status STRING DEFAULT 'active',
  is_active BOOL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- Step 2.5: Create new sync_logs table with organization_id
CREATE TABLE IF NOT EXISTS `octup-testing.qbo_webhook_mapper.sync_logs_v2` (
  log_id STRING NOT NULL,
  organization_id STRING NOT NULL,
  payload_id STRING NOT NULL,
  source_id STRING NOT NULL,
  mapping_id STRING,
  status STRING NOT NULL,
  qbo_invoice_id STRING,
  qbo_doc_number STRING,
  request_payload STRING,
  response_payload STRING,
  error_message STRING,
  error_code STRING,
  retry_count INT64 DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  completed_at TIMESTAMP
)
PARTITION BY DATE(created_at)
CLUSTER BY organization_id, source_id, status;

-- ============================================================
-- PHASE 3: CREATE DEFAULT ORGANIZATION FOR MIGRATION
-- ============================================================

-- Insert default organization for existing data
INSERT INTO `octup-testing.qbo_webhook_mapper.organizations`
  (organization_id, name, slug, plan_tier, is_active, created_at)
VALUES
  ('default-org-001', 'Default Organization', 'default', 'enterprise', TRUE, CURRENT_TIMESTAMP());

-- ============================================================
-- PHASE 4: MIGRATE EXISTING DATA TO V2 TABLES
-- ============================================================

-- Migrate webhook_sources
INSERT INTO `octup-testing.qbo_webhook_mapper.webhook_sources_v2`
  (source_id, organization_id, name, description, source_type, api_key, is_active, created_at, updated_at, created_by)
SELECT
  source_id,
  'default-org-001' AS organization_id,
  name,
  description,
  'custom' AS source_type,
  api_key,
  is_active,
  created_at,
  updated_at,
  created_by
FROM `octup-testing.qbo_webhook_mapper.webhook_sources`;

-- Migrate webhook_payloads
INSERT INTO `octup-testing.qbo_webhook_mapper.webhook_payloads_v2`
  (payload_id, organization_id, source_id, raw_payload, payload_hash, headers, received_at, processed, processed_at, invoice_id)
SELECT
  payload_id,
  'default-org-001' AS organization_id,
  source_id,
  raw_payload,
  payload_hash,
  headers,
  received_at,
  processed,
  processed_at,
  invoice_id
FROM `octup-testing.qbo_webhook_mapper.webhook_payloads`;

-- Migrate mapping_configurations
INSERT INTO `octup-testing.qbo_webhook_mapper.mapping_configurations_v2`
  (mapping_id, organization_id, source_id, name, description, version, is_active, field_mappings, static_values, created_at, updated_at)
SELECT
  mapping_id,
  'default-org-001' AS organization_id,
  source_id,
  name,
  description,
  version,
  is_active,
  field_mappings,
  static_values,
  created_at,
  updated_at
FROM `octup-testing.qbo_webhook_mapper.mapping_configurations`;

-- Migrate oauth_tokens
INSERT INTO `octup-testing.qbo_webhook_mapper.oauth_tokens_v2`
  (token_id, organization_id, realm_id, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at, token_type, scope, is_active, created_at, updated_at)
SELECT
  token_id,
  'default-org-001' AS organization_id,
  realm_id,
  access_token,
  refresh_token,
  access_token_expires_at,
  refresh_token_expires_at,
  token_type,
  scope,
  is_active,
  created_at,
  updated_at
FROM `octup-testing.qbo_webhook_mapper.oauth_tokens`;

-- Migrate sync_logs
INSERT INTO `octup-testing.qbo_webhook_mapper.sync_logs_v2`
  (log_id, organization_id, payload_id, source_id, mapping_id, status, qbo_invoice_id, qbo_doc_number, request_payload, response_payload, error_message, error_code, retry_count, created_at, completed_at)
SELECT
  log_id,
  'default-org-001' AS organization_id,
  payload_id,
  source_id,
  mapping_id,
  status,
  qbo_invoice_id,
  qbo_doc_number,
  request_payload,
  response_payload,
  error_message,
  error_code,
  retry_count,
  created_at,
  completed_at
FROM `octup-testing.qbo_webhook_mapper.sync_logs`;

-- ============================================================
-- PHASE 5: RENAME TABLES (SWAP OLD WITH V2)
-- ============================================================
-- Note: Run these manually after verifying data migration

-- DROP TABLE `octup-testing.qbo_webhook_mapper.webhook_sources`;
-- ALTER TABLE `octup-testing.qbo_webhook_mapper.webhook_sources_v2` RENAME TO webhook_sources;

-- DROP TABLE `octup-testing.qbo_webhook_mapper.webhook_payloads`;
-- ALTER TABLE `octup-testing.qbo_webhook_mapper.webhook_payloads_v2` RENAME TO webhook_payloads;

-- DROP TABLE `octup-testing.qbo_webhook_mapper.mapping_configurations`;
-- ALTER TABLE `octup-testing.qbo_webhook_mapper.mapping_configurations_v2` RENAME TO mapping_configurations;

-- DROP TABLE `octup-testing.qbo_webhook_mapper.oauth_tokens`;
-- ALTER TABLE `octup-testing.qbo_webhook_mapper.oauth_tokens_v2` RENAME TO oauth_tokens;

-- DROP TABLE `octup-testing.qbo_webhook_mapper.sync_logs`;
-- ALTER TABLE `octup-testing.qbo_webhook_mapper.sync_logs_v2` RENAME TO sync_logs;

-- ============================================================
-- PHASE 6: INSERT SAMPLE GLOBAL TEMPLATES
-- ============================================================

-- Shopify Standard Template
INSERT INTO `octup-testing.qbo_webhook_mapper.global_mapping_templates`
  (template_id, name, source_type, description, version, is_active, field_mappings, priority, created_at)
VALUES (
  'template-shopify-001',
  'Shopify Orders Standard',
  'shopify',
  'Default mapping for Shopify order webhooks',
  1,
  TRUE,
  '[{"qboField":"CustomerRef.value","sourceField":"$.customer.id","isRequired":true},{"qboField":"Line[0].Amount","sourceField":"$.total_price","transformation":"toNumber","isRequired":true},{"qboField":"Line[0].DetailType","staticValue":"SalesItemLineDetail","isRequired":true},{"qboField":"Line[0].SalesItemLineDetail.ItemRef.value","staticValue":"1","isRequired":true},{"qboField":"DocNumber","sourceField":"$.order_number","transformation":"concat:SHOP-:"}]',
  100,
  CURRENT_TIMESTAMP()
);

-- WooCommerce Standard Template
INSERT INTO `octup-testing.qbo_webhook_mapper.global_mapping_templates`
  (template_id, name, source_type, description, version, is_active, field_mappings, priority, created_at)
VALUES (
  'template-woocommerce-001',
  'WooCommerce Orders Standard',
  'woocommerce',
  'Default mapping for WooCommerce order webhooks',
  1,
  TRUE,
  '[{"qboField":"CustomerRef.value","sourceField":"$.billing.customer_id","isRequired":true},{"qboField":"Line[0].Amount","sourceField":"$.total","transformation":"toNumber","isRequired":true},{"qboField":"Line[0].DetailType","staticValue":"SalesItemLineDetail","isRequired":true},{"qboField":"Line[0].SalesItemLineDetail.ItemRef.value","staticValue":"1","isRequired":true},{"qboField":"DocNumber","sourceField":"$.id","transformation":"concat:WOO-:"}]',
  100,
  CURRENT_TIMESTAMP()
);

-- Stripe Payments Template
INSERT INTO `octup-testing.qbo_webhook_mapper.global_mapping_templates`
  (template_id, name, source_type, description, version, is_active, field_mappings, priority, created_at)
VALUES (
  'template-stripe-001',
  'Stripe Payments Standard',
  'stripe',
  'Default mapping for Stripe payment webhooks',
  1,
  TRUE,
  '[{"qboField":"CustomerRef.value","sourceField":"$.data.object.customer","isRequired":true},{"qboField":"Line[0].Amount","sourceField":"$.data.object.amount","transformation":"multiply:0.01","isRequired":true},{"qboField":"Line[0].DetailType","staticValue":"SalesItemLineDetail","isRequired":true},{"qboField":"Line[0].SalesItemLineDetail.ItemRef.value","staticValue":"1","isRequired":true},{"qboField":"DocNumber","sourceField":"$.data.object.id","transformation":"substring:3:15"}]',
  100,
  CURRENT_TIMESTAMP()
);

-- Generic/Custom Template
INSERT INTO `octup-testing.qbo_webhook_mapper.global_mapping_templates`
  (template_id, name, source_type, description, version, is_active, field_mappings, priority, created_at)
VALUES (
  'template-custom-001',
  'Custom Webhook Default',
  'custom',
  'Minimal template for custom webhook sources',
  1,
  TRUE,
  '[{"qboField":"CustomerRef.value","sourceField":"$.customer_id","isRequired":true},{"qboField":"Line[0].Amount","sourceField":"$.amount","transformation":"toNumber","isRequired":true},{"qboField":"Line[0].DetailType","staticValue":"SalesItemLineDetail","isRequired":true},{"qboField":"Line[0].SalesItemLineDetail.ItemRef.value","staticValue":"1","isRequired":true}]',
  200,
  CURRENT_TIMESTAMP()
);
