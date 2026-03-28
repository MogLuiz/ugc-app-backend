import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePartnerProfiles1766700000000 implements MigrationInterface {
  name = 'CreatePartnerProfiles1766700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "partner_profiles" (
        "user_id" uuid NOT NULL,
        "status" varchar(30) NOT NULL DEFAULT 'ACTIVE',
        "commission_rate_percent" decimal(5,2) NOT NULL DEFAULT 10.00,
        "display_name" varchar(255),
        "activated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_partner_profiles" PRIMARY KEY ("user_id"),
        CONSTRAINT "FK_partner_profiles_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_partner_profiles_commission_rate"
          CHECK ("commission_rate_percent" >= 0 AND "commission_rate_percent" <= 100)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_partner_profiles_status" ON "partner_profiles" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_partner_profiles_status"`);
    await queryRunner.query(`DROP TABLE "partner_profiles"`);
  }
}
