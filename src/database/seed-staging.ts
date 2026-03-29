/**
 * Seed script for staging environment.
 * Creates minimal test users and profiles for manual QA.
 *
 * Usage:
 *   DATABASE_URL=<staging-url> SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> \
 *   npx ts-node -r tsconfig-paths/register src/database/seed-staging.ts
 *
 * WARNING: Only run against staging. Never run against production.
 */

import { createClient } from '@supabase/supabase-js';
import { AppDataSource } from './data-source';
import { config } from 'dotenv';

config();

const STAGING_USERS = [
  {
    email: 'creator@staging.test',
    password: 'Staging@1234',
    role: 'creator' as const,
    name: 'Creator Teste',
  },
  {
    email: 'company@staging.test',
    password: 'Staging@1234',
    role: 'company' as const,
    name: 'Empresa Teste',
  },
  {
    email: 'admin@staging.test',
    password: 'Staging@1234',
    role: 'creator' as const,
    name: 'Admin QA',
  },
];

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ Refusing to seed production database.');
    process.exit(1);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  await AppDataSource.initialize();

  for (const user of STAGING_USERS) {
    // Upsert user in Supabase Auth (idempotent)
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: { name: user.name },
    });

    if (error && !error.message.includes('already been registered')) {
      console.error(`Failed to create ${user.email}:`, error.message);
      continue;
    }

    console.log(`✓ ${user.role} — ${user.email}`);
    if (data?.user) {
      console.log(`  id: ${data.user.id}`);
    }
  }

  await AppDataSource.destroy();
  console.log('\nStaging seed complete.');
  console.log('Login credentials: password = Staging@1234 for all users.');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
