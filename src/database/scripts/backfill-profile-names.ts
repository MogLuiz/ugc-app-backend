/**
 * Backfill: atualiza profiles.name de usuários cujo nome ainda é o prefixo do email.
 *
 * Uso:
 *   ts-node -r tsconfig-paths/register src/database/scripts/backfill-profile-names.ts
 *
 * Requer: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e DATABASE_URL (ou DB_*) no .env
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { AppDataSource } from '../data-source';

config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  await AppDataSource.initialize();
  const queryRunner = AppDataSource.createQueryRunner();

  try {
    // Carrega todos os usuários do auth (paginado)
    const authUsers: { id: string; email: string; displayName: string | null }[] = [];
    let page = 1;
    const perPage = 1000;

    while (true) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
      if (error) throw error;
      if (!data.users.length) break;

      for (const u of data.users) {
        const meta = u.user_metadata as Record<string, string> | null;
        const displayName =
          meta?.full_name?.trim() || meta?.name?.trim() || null;
        authUsers.push({ id: u.id, email: u.email ?? '', displayName });
      }

      if (data.users.length < perPage) break;
      page++;
    }

    console.log(`Auth users carregados: ${authUsers.length}`);

    let updated = 0;
    let skipped = 0;

    for (const authUser of authUsers) {
      if (!authUser.displayName) {
        skipped++;
        continue;
      }

      const emailPrefix = authUser.email.split('@')[0];

      // Atualiza apenas se o nome atual ainda é o prefixo do email
      const result = await queryRunner.query(
        `UPDATE profiles p
         SET name = $1, updated_at = NOW()
         FROM users u
         WHERE p.user_id = u.id
           AND u.auth_user_id = $2
           AND p.name = $3
           AND p.name <> $1`,
        [authUser.displayName, authUser.id, emailPrefix],
      );

      const affected = result[1] as number;
      if (affected > 0) {
        console.log(`  ✓ ${authUser.email} → "${authUser.displayName}"`);
        updated++;
      } else {
        skipped++;
      }
    }

    console.log(`\nConcluído: ${updated} atualizados, ${skipped} ignorados.`);
  } finally {
    await queryRunner.release();
    await AppDataSource.destroy();
  }
}

run().catch((err) => {
  console.error('Erro no backfill:', err);
  process.exit(1);
});
