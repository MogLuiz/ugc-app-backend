import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReferralCodes1766700100000 implements MigrationInterface {
  name = 'CreateReferralCodes1766700100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "referral_codes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "partner_user_id" uuid NOT NULL,
        "code" varchar(50) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_referral_codes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_referral_codes_partner" FOREIGN KEY ("partner_user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_referral_codes_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_referral_codes_partner_user_id" ON "referral_codes" ("partner_user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_referral_codes_partner_user_id"`);
    await queryRunner.query(`DROP TABLE "referral_codes"`);
  }
}
