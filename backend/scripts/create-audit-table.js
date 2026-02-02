/**
 * BigQuery Migration: Create audit_logs table
 *
 * Run this script to create the audit_logs table in BigQuery
 * Usage: node scripts/create-audit-table.js
 */

const { BigQuery } = require('@google-cloud/bigquery');

const PROJECT_ID = process.env.PROJECT_ID || 'octup-testing';
const DATASET_ID = process.env.DATASET_ID || 'qbo_webhook_mapper';
const TABLE_ID = 'audit_logs';

const schema = [
  { name: 'log_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'timestamp', type: 'TIMESTAMP', mode: 'REQUIRED' },
  { name: 'category', type: 'STRING', mode: 'REQUIRED' },
  { name: 'action', type: 'STRING', mode: 'REQUIRED' },
  { name: 'result', type: 'STRING', mode: 'REQUIRED' },
  { name: 'actor_type', type: 'STRING', mode: 'REQUIRED' },
  { name: 'actor_id', type: 'STRING', mode: 'NULLABLE' },
  { name: 'actor_email', type: 'STRING', mode: 'NULLABLE' },
  { name: 'actor_ip', type: 'STRING', mode: 'NULLABLE' },
  { name: 'target_type', type: 'STRING', mode: 'NULLABLE' },
  { name: 'target_id', type: 'STRING', mode: 'NULLABLE' },
  { name: 'organization_id', type: 'STRING', mode: 'NULLABLE' },
  { name: 'details', type: 'STRING', mode: 'NULLABLE' },
  { name: 'error_message', type: 'STRING', mode: 'NULLABLE' },
  { name: 'user_agent', type: 'STRING', mode: 'NULLABLE' },
  { name: 'request_path', type: 'STRING', mode: 'NULLABLE' },
  { name: 'request_method', type: 'STRING', mode: 'NULLABLE' },
];

async function createAuditLogsTable() {
  console.log('='.repeat(60));
  console.log('BigQuery Migration: Create audit_logs table');
  console.log('='.repeat(60));
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Dataset: ${DATASET_ID}`);
  console.log(`Table:   ${TABLE_ID}`);
  console.log('='.repeat(60));

  const bigquery = new BigQuery({ projectId: PROJECT_ID });
  const dataset = bigquery.dataset(DATASET_ID);

  // Check if table already exists
  console.log('\n1. Checking if table exists...');
  const [tables] = await dataset.getTables();
  const tableExists = tables.some(t => t.id === TABLE_ID);

  if (tableExists) {
    console.log(`   ✓ Table ${TABLE_ID} already exists.`);

    // Verify schema
    console.log('\n2. Verifying schema...');
    const [metadata] = await dataset.table(TABLE_ID).getMetadata();
    console.log(`   Current schema has ${metadata.schema.fields.length} fields.`);
    console.log('   ✓ Table is ready for use.');
    return;
  }

  // Create the table
  console.log('\n2. Creating table with partitioning...');

  const options = {
    schema: schema,
    timePartitioning: {
      type: 'DAY',
      field: 'timestamp',
      expirationMs: 90 * 24 * 60 * 60 * 1000, // 90 days in milliseconds
    },
    labels: {
      environment: 'production',
      app: 'qbo-webhook-mapper',
    },
  };

  try {
    const [table] = await dataset.createTable(TABLE_ID, options);
    console.log(`   ✓ Table ${table.id} created successfully!`);
    console.log('\n3. Table configuration:');
    console.log(`   - Partitioning: By DAY on 'timestamp' column`);
    console.log(`   - Partition expiration: 90 days`);
    console.log(`   - Schema fields: ${schema.length}`);

    console.log('\n4. Schema fields:');
    schema.forEach(field => {
      console.log(`   - ${field.name}: ${field.type} (${field.mode})`);
    });

    console.log('\n' + '='.repeat(60));
    console.log('Migration completed successfully!');
    console.log('='.repeat(60));
  } catch (error) {
    if (error.code === 409) {
      console.log('   Table already exists (created by another process).');
    } else {
      throw error;
    }
  }
}

// Run the migration
createAuditLogsTable()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  });
