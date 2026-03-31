import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Normalizes all existing user emails to LOWER(TRIM(email)).
 *
 * ⚠️  IRREVERSIBLE: The down() migration does NOT restore original casing or whitespace.
 * Rolling back this migration only removes it from the migrations table — the data
 * transformation is permanent. Real rollback requires a database backup taken before
 * running this migration.
 *
 * This migration must run AFTER Fase 0 (manual deduplication audit), since the
 * subsequent AddUniqueEmailToUsers migration will fail if normalized duplicates still exist.
 */
export class NormalizeUserEmails1766700400000 implements MigrationInterface {
  name = 'NormalizeUserEmails1766700400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "users" SET "email" = LOWER(TRIM("email"))`);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Intentionally a no-op.
    // The normalization (trim + lowercase) cannot be reversed without a backup.
    // See migration header for details.
  }
}
