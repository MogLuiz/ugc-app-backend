import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a UNIQUE constraint on users.email.
 *
 * Prerequisites (must be completed before running this migration):
 *   1. Fase 0: manual deduplication audit — ensure no duplicate normalized emails exist.
 *   2. 1766700400000-NormalizeUserEmails: all emails already LOWER(TRIM(...)).
 *
 * The application enforces normalization via normalizeEmail() on every write/read,
 * so the DB constraint acts as a safety net for any bypass (direct writes, imports, etc.).
 *
 * Note on case-insensitive enforcement at DB level:
 *   This constraint is case-sensitive at the DB level, but application-level normalization
 *   ensures emails are always stored lowercase. If future requirements demand DB-enforced
 *   case-insensitivity (e.g. multi-auth-provider or direct DB writes), migrate to citext
 *   or add a functional index on LOWER(email) and drop this constraint.
 */
export class AddUniqueEmailToUsers1766700500000 implements MigrationInterface {
  name = 'AddUniqueEmailToUsers1766700500000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "UQ_users_email" UNIQUE ("email")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "UQ_users_email"`,
    );
  }
}
