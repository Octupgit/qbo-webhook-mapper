/**
 * Create Admin User Script
 *
 * Creates an admin user with a default password that must be changed on first login.
 *
 * Usage:
 *   npx ts-node scripts/create-admin.ts
 *   npx ts-node scripts/create-admin.ts --email custom@example.com
 *   npx ts-node scripts/create-admin.ts --email admin@company.com --name "John Doe" --role super_admin
 */

import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

// Default password that must be changed on first login
const DEFAULT_PASSWORD = 'Octup@2026!';
const BCRYPT_ROUNDS = 10;

interface AdminUserInput {
  email: string;
  name?: string;
  role: 'admin' | 'super_admin';
}

async function createAdmin(input: AdminUserInput) {
  console.log('\n=== Admin User Creation Script ===\n');

  // Hash the default password
  console.log('Generating password hash...');
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

  // Create user object
  const user = {
    user_id: uuidv4(),
    email: input.email.toLowerCase(),
    name: input.name || 'Admin User',
    password_hash: passwordHash,
    must_change_password: true,
    role: input.role,
    is_active: true,
    created_at: new Date().toISOString(),
  };

  console.log('\n--- Admin User Created ---');
  console.log(`User ID: ${user.user_id}`);
  console.log(`Email: ${user.email}`);
  console.log(`Name: ${user.name}`);
  console.log(`Role: ${user.role}`);
  console.log(`Must Change Password: ${user.must_change_password}`);
  console.log('\n--- Default Credentials ---');
  console.log(`Email: ${user.email}`);
  console.log(`Password: ${DEFAULT_PASSWORD}`);
  console.log('\n[!] User MUST change password on first login.\n');

  // Output SQL for BigQuery
  console.log('--- BigQuery INSERT Statement ---');
  console.log(`
INSERT INTO \`your-project.qbo_webhook_mapper.admin_users\`
(user_id, email, name, password_hash, must_change_password, role, is_active, created_at)
VALUES
('${user.user_id}', '${user.email}', '${user.name}', '${user.password_hash}', true, '${user.role}', true, CURRENT_TIMESTAMP());
  `);

  // Output JSON for mock data service
  console.log('--- JSON for Mock Data Service ---');
  console.log(JSON.stringify(user, null, 2));

  return user;
}

// Parse command line arguments
function parseArgs(): AdminUserInput {
  const args = process.argv.slice(2);
  const input: AdminUserInput = {
    email: 'admin@octup.com',
    role: 'super_admin',
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--email':
      case '-e':
        input.email = args[++i];
        break;
      case '--name':
      case '-n':
        input.name = args[++i];
        break;
      case '--role':
      case '-r':
        input.role = args[++i] as 'admin' | 'super_admin';
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: npx ts-node scripts/create-admin.ts [options]

Options:
  --email, -e    Admin email address (default: admin@octup.com)
  --name, -n     Admin display name (default: Admin User)
  --role, -r     Admin role: admin or super_admin (default: super_admin)
  --help, -h     Show this help message

Default password: ${DEFAULT_PASSWORD}
The user will be required to change this password on first login.
        `);
        process.exit(0);
    }
  }

  return input;
}

// Run the script
const input = parseArgs();
createAdmin(input)
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error creating admin:', error);
    process.exit(1);
  });
