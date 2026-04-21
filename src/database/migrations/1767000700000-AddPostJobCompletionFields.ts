import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPostJobCompletionFields1767000700000 implements MigrationInterface {
  name = 'AddPostJobCompletionFields1767000700000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Novos valores no enum de status
    await queryRunner.query(`
      ALTER TYPE "contract_requests_status_enum"
        ADD VALUE IF NOT EXISTS 'AWAITING_COMPLETION_CONFIRMATION'
    `);
    await queryRunner.query(`
      ALTER TYPE "contract_requests_status_enum"
        ADD VALUE IF NOT EXISTS 'COMPLETION_DISPUTE'
    `);

    // 2. Novos campos de confirmação bilateral e disputa
    await queryRunner.query(`
      ALTER TABLE "contract_requests"
        ADD COLUMN IF NOT EXISTS "creator_confirmed_completed_at" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "company_confirmed_completed_at" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "contest_deadline_at"            TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "completion_dispute_reason"      TEXT,
        ADD COLUMN IF NOT EXISTS "completion_disputed_at"         TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "completion_disputed_by_user_id" UUID,
        ADD COLUMN IF NOT EXISTS "completion_phase_entered_at"    TIMESTAMPTZ
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contract_requests"
        DROP COLUMN IF EXISTS "creator_confirmed_completed_at",
        DROP COLUMN IF EXISTS "company_confirmed_completed_at",
        DROP COLUMN IF EXISTS "contest_deadline_at",
        DROP COLUMN IF EXISTS "completion_dispute_reason",
        DROP COLUMN IF EXISTS "completion_disputed_at",
        DROP COLUMN IF EXISTS "completion_disputed_by_user_id",
        DROP COLUMN IF EXISTS "completion_phase_entered_at"
    `);
    // PostgreSQL não suporta remover valores de enum diretamente.
  }
}
