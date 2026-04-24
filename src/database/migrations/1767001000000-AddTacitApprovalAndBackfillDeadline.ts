import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTacitApprovalAndBackfillDeadline1767001000000 implements MigrationInterface {
  name = 'AddTacitApprovalAndBackfillDeadline1767001000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Novo campo de auditoria: indica conclusão por aprovação tácita
    await queryRunner.query(`
      ALTER TABLE "contract_requests"
        ADD COLUMN IF NOT EXISTS "completed_by_tacit_approval" BOOLEAN NOT NULL DEFAULT FALSE
    `);

    // 2. Backfill: contratos presos em AWAITING_COMPLETION_CONFIRMATION sem contestDeadlineAt
    //    Usa completionPhaseEnteredAt + 72h como prazo retroativo.
    //    Guards: status correto, contestDeadlineAt nulo, completionPhaseEnteredAt preenchido.
    //    Após esta migration, o cron de auto-conclusão processará contratos com prazo já
    //    expirado na próxima execução (aprovação tácita para os sem confirmação).
    await queryRunner.query(`
      UPDATE "contract_requests"
      SET "contest_deadline_at" = "completion_phase_entered_at" + INTERVAL '72 hours'
      WHERE "status" = 'AWAITING_COMPLETION_CONFIRMATION'
        AND "contest_deadline_at" IS NULL
        AND "completion_phase_entered_at" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contract_requests"
        DROP COLUMN IF EXISTS "completed_by_tacit_approval"
    `);
    // Não desfaz o backfill de contest_deadline_at — dados retroativos são seguros de manter.
  }
}
