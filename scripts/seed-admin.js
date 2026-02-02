/**
 * Seed Admin User Script
 *
 * Creates the first admin user in BigQuery.
 * Run with: node scripts/seed-admin.js
 *
 * Prerequisites:
 * - Set GOOGLE_APPLICATION_CREDENTIALS env var or run from Cloud Shell
 * - npm install in backend directory
 */

const { BigQuery } = require('@google-cloud/bigquery');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const PROJECT_ID = 'octup-testing';
const DATASET = 'qbo_webhook_mapper';
const TABLE = 'admin_users';

const DEFAULT_ADMIN = {
  email: 'admin@octup.com',
  name: 'Admin User',
  role: 'super_admin',
  password: 'Octup@2026!',
};

async function seedAdmin() {
  console.log('🌱 Seeding admin user...\n');

  const bigquery = new BigQuery({ projectId: PROJECT_ID });

  // Check if user already exists
  const checkQuery = `
    SELECT email FROM \`${PROJECT_ID}.${DATASET}.${TABLE}\`
    WHERE email = @email
  `;

  const [existing] = await bigquery.query({
    query: checkQuery,
    params: { email: DEFAULT_ADMIN.email },
  });

  if (existing.length > 0) {
    console.log(`⚠️  User ${DEFAULT_ADMIN.email} already exists. Skipping.`);
    return;
  }

  // Hash the password
  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN.password, 10);
  const userId = uuidv4();
  const now = new Date().toISOString();

  // Insert the user
  const insertQuery = `
    INSERT INTO \`${PROJECT_ID}.${DATASET}.${TABLE}\` (
      user_id, email, name, role, password_hash,
      is_active, must_change_password, created_at, updated_at
    ) VALUES (
      @userId, @email, @name, @role, @passwordHash,
      TRUE, TRUE, @createdAt, @updatedAt
    )
  `;

  await bigquery.query({
    query: insertQuery,
    params: {
      userId,
      email: DEFAULT_ADMIN.email,
      name: DEFAULT_ADMIN.name,
      role: DEFAULT_ADMIN.role,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    },
  });

  console.log('✅ Admin user created successfully!\n');
  console.log('   Email:', DEFAULT_ADMIN.email);
  console.log('   Password:', DEFAULT_ADMIN.password);
  console.log('   Role:', DEFAULT_ADMIN.role);
  console.log('\n⚠️  You will be prompted to change password on first login.');
}

seedAdmin()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
