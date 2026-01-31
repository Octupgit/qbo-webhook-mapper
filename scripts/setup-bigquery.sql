-- BigQuery Setup Script for QBO Webhook Mapper
-- Project: octup-testing
-- Dataset: qbo_webhook_mapper

-- Create dataset (run this first if it doesn't exist)
-- CREATE SCHEMA IF NOT EXISTS `octup-testing.qbo_webhook_mapper`
-- OPTIONS (location = 'US');

-- ============================================================
-- TABLE 1: webhook_sources
-- Stores registered webhook endpoints with API keys
-- ============================================================
CREATE TABLE IF NOT EXISTS `octup-testing.qbo_webhook_mapper.webhook_sources` (
  source_id STRING NOT NULL,           -- UUID primary key
  name STRING NOT NULL,                 -- Human-readable name (e.g., "Shopify Orders")
  description STRING,                   -- Optional description
  api_key STRING NOT NULL,              -- API key for authentication
  is_active BOOL DEFAULT TRUE,          -- Enable/disable source
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  created_by STRING                     -- User who created
)
OPTIONS(
  description = "Registered webhook sources for receiving external JSON data"
);

-- ============================================================
-- TABLE 2: webhook_payloads
-- Stores raw incoming webhook payloads
-- ============================================================
CREATE TABLE IF NOT EXISTS `octup-testing.qbo_webhook_mapper.webhook_payloads` (
  payload_id STRING NOT NULL,           -- UUID primary key
  source_id STRING NOT NULL,            -- FK to webhook_sources
  raw_payload STRING NOT NULL,          -- Full JSON payload (stored as string)
  payload_hash STRING,                  -- SHA256 hash for deduplication
  headers STRING,                       -- Request headers as JSON
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  processed BOOL DEFAULT FALSE,         -- Has been synced to QBO
  processed_at TIMESTAMP,               -- When processed
  invoice_id STRING                     -- QBO Invoice ID if synced
)
PARTITION BY DATE(received_at)
CLUSTER BY source_id
OPTIONS(
  description = "Raw incoming webhook payloads"
);

-- ============================================================
-- TABLE 3: mapping_configurations
-- Stores field mapping configurations per source
-- ============================================================
CREATE TABLE IF NOT EXISTS `octup-testing.qbo_webhook_mapper.mapping_configurations` (
  mapping_id STRING NOT NULL,           -- UUID primary key
  source_id STRING NOT NULL,            -- FK to webhook_sources
  name STRING NOT NULL,                 -- Mapping name
  description STRING,
  version INT64 DEFAULT 1,              -- Version number
  is_active BOOL DEFAULT TRUE,          -- Active mapping for source
  field_mappings STRING NOT NULL,       -- JSON array of field mappings
  static_values STRING,                 -- JSON object of static values
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(created_at)
CLUSTER BY source_id
OPTIONS(
  description = "Field mapping configurations for transforming webhooks to QBO invoices"
);

-- ============================================================
-- TABLE 4: oauth_tokens
-- Stores QBO OAuth tokens (encrypted)
-- ============================================================
CREATE TABLE IF NOT EXISTS `octup-testing.qbo_webhook_mapper.oauth_tokens` (
  token_id STRING NOT NULL,             -- UUID primary key
  realm_id STRING NOT NULL,             -- QBO Company ID
  access_token STRING NOT NULL,         -- Encrypted access token
  refresh_token STRING NOT NULL,        -- Encrypted refresh token
  access_token_expires_at TIMESTAMP,
  refresh_token_expires_at TIMESTAMP,
  token_type STRING DEFAULT 'Bearer',
  scope STRING,                         -- OAuth scopes
  is_active BOOL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
OPTIONS(
  description = "QuickBooks Online OAuth tokens (encrypted)"
);

-- ============================================================
-- TABLE 5: sync_logs
-- Stores invoice sync operation logs
-- ============================================================
CREATE TABLE IF NOT EXISTS `octup-testing.qbo_webhook_mapper.sync_logs` (
  log_id STRING NOT NULL,               -- UUID primary key
  payload_id STRING NOT NULL,           -- FK to webhook_payloads
  source_id STRING NOT NULL,            -- FK to webhook_sources
  mapping_id STRING,                    -- FK to mapping_configurations
  status STRING NOT NULL,               -- 'pending', 'success', 'failed', 'retrying'
  qbo_invoice_id STRING,                -- QBO Invoice ID if successful
  qbo_doc_number STRING,                -- QBO Invoice DocNumber
  request_payload STRING,               -- Transformed JSON sent to QBO
  response_payload STRING,              -- QBO API response
  error_message STRING,                 -- Error details if failed
  error_code STRING,                    -- QBO error code
  retry_count INT64 DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  completed_at TIMESTAMP
)
PARTITION BY DATE(created_at)
CLUSTER BY source_id, status
OPTIONS(
  description = "Invoice sync operation logs"
);

-- ============================================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================================

-- Insert a sample webhook source
-- INSERT INTO `octup-testing.qbo_webhook_mapper.webhook_sources`
-- (source_id, name, description, api_key, is_active, created_at, updated_at)
-- VALUES (
--   'sample-source-001',
--   'Test Webhook Source',
--   'A sample source for testing',
--   'test-api-key-12345',
--   TRUE,
--   CURRENT_TIMESTAMP(),
--   CURRENT_TIMESTAMP()
-- );

-- ============================================================
-- USEFUL QUERIES
-- ============================================================

-- Get recent payloads for a source
-- SELECT * FROM `octup-testing.qbo_webhook_mapper.webhook_payloads`
-- WHERE source_id = 'your-source-id'
-- ORDER BY received_at DESC
-- LIMIT 10;

-- Get sync statistics by source
-- SELECT
--   source_id,
--   status,
--   COUNT(*) as count
-- FROM `octup-testing.qbo_webhook_mapper.sync_logs`
-- GROUP BY source_id, status
-- ORDER BY source_id, status;

-- Get failed syncs with errors
-- SELECT
--   log_id,
--   payload_id,
--   error_message,
--   created_at
-- FROM `octup-testing.qbo_webhook_mapper.sync_logs`
-- WHERE status = 'failed'
-- ORDER BY created_at DESC
-- LIMIT 20;
