import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBillingTables1767000300000 implements MigrationInterface {
  name = 'AddBillingTables1767000300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "company_balance" (
        "id"                UUID         NOT NULL DEFAULT gen_random_uuid(),
        "company_user_id"   UUID         NOT NULL,
        "available_cents"   INTEGER      NOT NULL DEFAULT 0,
        "max_credit_cents"  INTEGER      NOT NULL DEFAULT 500000,
        "currency"          VARCHAR(3)   NOT NULL DEFAULT 'BRL',
        "updated_at"        TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_company_balance" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_company_balance_company_user_id" UNIQUE ("company_user_id"),
        CONSTRAINT "CHK_company_balance_non_negative" CHECK ("available_cents" >= 0)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_company_balance_company_user_id"
        ON "company_balance" ("company_user_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "company_balance_transactions" (
        "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
        "company_user_id" UUID         NOT NULL,
        "amount_cents"    INTEGER      NOT NULL,
        "type"            VARCHAR(50)  NOT NULL,
        "reference_type"  VARCHAR(50)  NOT NULL,
        "reference_id"    UUID         NOT NULL,
        "note"            TEXT,
        "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_company_balance_transactions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_cbt_company_user_id"
        ON "company_balance_transactions" ("company_user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_cbt_reference"
        ON "company_balance_transactions" ("reference_type", "reference_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_cbt_type_reference"
        ON "company_balance_transactions" ("type", "reference_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "refund_requests" (
        "id"               UUID          NOT NULL DEFAULT gen_random_uuid(),
        "company_user_id"  UUID          NOT NULL,
        "amount_cents"     INTEGER       NOT NULL,
        "status"           VARCHAR(30)   NOT NULL DEFAULT 'PENDING',
        "reason"           TEXT,
        "admin_note"       TEXT,
        "processed_by"     VARCHAR(100),
        "created_at"       TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "processed_at"     TIMESTAMPTZ,
        CONSTRAINT "PK_refund_requests" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_refund_requests_positive_amount" CHECK ("amount_cents" > 0)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_refund_requests_company_user_id"
        ON "refund_requests" ("company_user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_refund_requests_status"
        ON "refund_requests" ("status")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "refund_requests"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "company_balance_transactions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "company_balance"`);
  }
}
