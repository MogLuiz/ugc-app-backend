import { MigrationInterface, QueryRunner } from 'typeorm';
import { createClient } from '@supabase/supabase-js';

export class BackfillProfileNameFromAuthMetadata1766900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.warn('BackfillProfileNames: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidos — pulando backfill.');
      return;
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let updated = 0;
    let skipped = 0;
    let page = 1;
    const perPage = 1000;

    while (true) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
      if (error) throw error;
      if (!data.users.length) break;

      for (const u of data.users) {
        const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
        const rawDisplayName =
          typeof meta.full_name === 'string'
            ? meta.full_name
            : typeof meta.name === 'string'
              ? meta.name
              : '';
        const displayName = rawDisplayName.trim().replace(/\s+/g, ' ') || null;

        if (!displayName) { skipped++; continue; }

        const emailPrefix = (u.email ?? '').split('@')[0];
        if (!emailPrefix) { skipped++; continue; }

        const result = await queryRunner.query(
          `UPDATE profiles p
           SET name = $1, updated_at = NOW()
           FROM users u
           WHERE p.user_id = u.id
             AND u.auth_user_id = $2
             AND p.name = $3
             AND p.name <> $1
           RETURNING p.user_id`,
          [displayName, u.id, emailPrefix],
        );

        if (result.length > 0) {
          console.log(`  ✓ ${u.email} → "${displayName}"`);
          updated++;
        } else {
          skipped++;
        }
      }

      if (data.users.length < perPage) break;
      page++;
    }

    console.log(`BackfillProfileNames: ${updated} atualizados, ${skipped} ignorados.`);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Backfill irreversível intencionalmente sem rollback.
  }
}
