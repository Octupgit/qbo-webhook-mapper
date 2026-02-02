-- ============================================================================
-- BigQuery DDL: Audit Logs Table
-- QBO Webhook Mapper - Admin & Audit System
-- ============================================================================
--
-- Table: audit_logs
-- Purpose: Store all platform activity and security events
-- Retention: 90 days (via partition expiration)
-- Partitioning: By timestamp (daily partitions)
--
-- ============================================================================

CREATE TABLE IF NOT EXISTS `octup-testing.qbo_webhook_mapper.audit_logs` (
  -- Primary Key
  log_id STRING NOT NULL,

  -- Timestamp (partition column)
  timestamp TIMESTAMP NOT NULL,

  -- Event Classification
  category STRING NOT NULL,          -- auth, user_mgmt, api_key, qbo, webhook, organization, mapping, system
  action STRING NOT NULL,            -- login_success, user_created, etc.
  result STRING NOT NULL,            -- success, failure, error

  -- Actor Information (who performed the action)
  actor_type STRING NOT NULL,        -- admin_user, api_key, system, anonymous
  actor_id STRING,                   -- user_id, api_key_id, or null
  actor_email STRING,                -- For admin users
  actor_ip STRING,                   -- Client IP address

  -- Target Information (what was affected)
  target_type STRING,                -- user, organization, api_key, webhook, etc.
  target_id STRING,
  organization_id STRING,

  -- Additional Context
  details STRING,                    -- JSON: sanitized metadata
  error_message STRING,              -- Error details for failures
  user_agent STRING,                 -- Browser/client info
  request_path STRING,               -- API endpoint path
  request_method STRING              -- HTTP method
)
PARTITION BY DATE(timestamp)
OPTIONS (
  description = 'Audit logs for QBO Webhook Mapper platform',
  labels = [('environment', 'production'), ('app', 'qbo-webhook-mapper')],
  partition_expiration_days = 90,
  require_partition_filter = false
);

-- ============================================================================
-- Index-like optimization: Clustering
-- Cluster by commonly filtered columns for faster queries
-- ============================================================================

-- Note: BigQuery doesn't support ALTER TABLE for clustering on existing tables.
-- If you need clustering, recreate the table with:
--
-- CREATE OR REPLACE TABLE `octup-testing.qbo_webhook_mapper.audit_logs`
-- PARTITION BY DATE(timestamp)
-- CLUSTER BY category, actor_email, result
-- AS SELECT * FROM `octup-testing.qbo_webhook_mapper.audit_logs`;

-- ============================================================================
-- Sample Queries for Verification
-- ============================================================================

-- Query 1: Get recent logs
-- SELECT * FROM `octup-testing.qbo_webhook_mapper.audit_logs`
-- WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
-- ORDER BY timestamp DESC
-- LIMIT 100;

-- Query 2: Get failed logins
-- SELECT * FROM `octup-testing.qbo_webhook_mapper.audit_logs`
-- WHERE category = 'auth' AND action = 'login_failed'
-- AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
-- ORDER BY timestamp DESC;

-- Query 3: Get user management activity
-- SELECT * FROM `octup-testing.qbo_webhook_mapper.audit_logs`
-- WHERE category = 'user_mgmt'
-- AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
-- ORDER BY timestamp DESC;

-- Query 4: Get activity by specific admin
-- SELECT * FROM `octup-testing.qbo_webhook_mapper.audit_logs`
-- WHERE actor_email = 'admin@octup.com'
-- AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
-- ORDER BY timestamp DESC;
