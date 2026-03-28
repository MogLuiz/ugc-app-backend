import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCommissions1766700300000 implements MigrationInterface {
  name = 'CreateCommissions1766700300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "commissions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "referral_id" uuid NOT NULL,
        "contract_request_id" uuid NOT NULL,
        "partner_user_id" uuid NOT NULL,
        "gross_amount_cents" integer NOT NULL,
        "commission_rate_percent" decimal(5,2) NOT NULL,
        "commission_amount_cents" integer NOT NULL,
        "currency" varchar(3) NOT NULL DEFAULT 'BRL',
        "status" varchar(30) NOT NULL DEFAULT 'PENDING',
        "paid_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_commissions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_commissions_referral" FOREIGN KEY ("referral_id")
          REFERENCES "referrals"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_commissions_contract_request" FOREIGN KEY ("contract_request_id")
          REFERENCES "contract_requests"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_commissions_partner" FOREIGN KEY ("partner_user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "UQ_commissions_contract_request_id" UNIQUE ("contract_request_id"),
        CONSTRAINT "CHK_commissions_amounts"
          CHECK ("gross_amount_cents" > 0 AND "commission_amount_cents" >= 0)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_commissions_referral_id" ON "commissions" ("referral_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_commissions_partner_user_id_status" ON "commissions" ("partner_user_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_commissions_status" ON "commissions" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_commissions_created_at" ON "commissions" ("created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_commissions_created_at"`);
    await queryRunner.query(`DROP INDEX "IDX_commissions_status"`);
    await queryRunner.query(`DROP INDEX "IDX_commissions_partner_user_id_status"`);
    await queryRunner.query(`DROP INDEX "IDX_commissions_referral_id"`);
    await queryRunner.query(`DROP TABLE "commissions"`);
  }
}
