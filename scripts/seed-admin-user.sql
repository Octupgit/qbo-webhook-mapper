-- Seed Admin User Script for BigQuery
-- Run this in BigQuery Console to create the first admin user
--
-- Default credentials:
--   Email: admin@octup.com
--   Password: Octup@2026!
--
-- The password hash below is bcrypt hash of 'Octup@2026!'
-- User will be forced to change password on first login

INSERT INTO `octup-testing.qbo_webhook_mapper.admin_users` (
  user_id,
  email,
  name,
  role,
  password_hash,
  is_active,
  must_change_password,
  created_at,
  updated_at
) VALUES (
  GENERATE_UUID(),
  'admin@octup.com',
  'Admin User',
  'super_admin',
  '$2b$10$8K1p/a0dR1xqM8K3hE9HQeQZJOkHv0Qd5wKXr6KZmEbFr.gO/lyGm',  -- Octup@2026!
  TRUE,
  TRUE,
  CURRENT_TIMESTAMP(),
  CURRENT_TIMESTAMP()
);

-- Verify the user was created
SELECT user_id, email, name, role, is_active, must_change_password
FROM `octup-testing.qbo_webhook_mapper.admin_users`
WHERE email = 'admin@octup.com';
