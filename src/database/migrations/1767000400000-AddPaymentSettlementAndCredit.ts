import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentSettlementAndCredit1767000400000 implements MigrationInterface {
  name = 'AddPaymentSettlementAndCredit1767000400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payments"
        ADD COLUMN "settlement_status"   VARCHAR(30) DEFAULT NULL,
        ADD COLUMN "credit_applied_cents" INTEGER     NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_payments_settlement_status"
        ON "payments" ("settlement_status")
        WHERE "settlement_status" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payments_settlement_status"`);
    await queryRunner.query(`
      ALTER TABLE "payments"
        DROP COLUMN IF EXISTS "settlement_status",
        DROP COLUMN IF EXISTS "credit_applied_cents"
    `);
  }
}
