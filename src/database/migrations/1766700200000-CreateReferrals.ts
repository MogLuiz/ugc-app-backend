import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReferrals1766700200000 implements MigrationInterface {
  name = 'CreateReferrals1766700200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "referrals" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "partner_user_id" uuid NOT NULL,
        "referred_user_id" uuid NOT NULL,
        "referral_code_id" uuid NOT NULL,
        "status" varchar(30) NOT NULL DEFAULT 'PENDING',
        "qualified_at" TIMESTAMPTZ,
        "qualifying_contract_request_id" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_referrals" PRIMARY KEY ("id"),
        CONSTRAINT "FK_referrals_partner" FOREIGN KEY ("partner_user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_referrals_referred" FOREIGN KEY ("referred_user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_referrals_code" FOREIGN KEY ("referral_code_id")
          REFERENCES "referral_codes"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_referrals_qualifying_cr" FOREIGN KEY ("qualifying_contract_request_id")
          REFERENCES "contract_requests"("id") ON DELETE SET NULL,
        CONSTRAINT "UQ_referrals_referred_user_id" UNIQUE ("referred_user_id"),
        CONSTRAINT "CHK_referrals_no_self_referral" CHECK ("partner_user_id" <> "referred_user_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_referrals_partner_user_id" ON "referrals" ("partner_user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_referrals_status" ON "referrals" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_referrals_referral_code_id" ON "referrals" ("referral_code_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_referrals_referral_code_id"`);
    await queryRunner.query(`DROP INDEX "IDX_referrals_status"`);
    await queryRunner.query(`DROP INDEX "IDX_referrals_partner_user_id"`);
    await queryRunner.query(`DROP TABLE "referrals"`);
  }
}
