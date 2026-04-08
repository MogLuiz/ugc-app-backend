import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOpenOffersTable1766800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "open_offer_status_enum" AS ENUM (
        'OPEN', 'FILLED', 'CANCELLED', 'EXPIRED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "open_offers" (
        "id"                              UUID          NOT NULL DEFAULT gen_random_uuid(),
        "company_user_id"                 UUID          NOT NULL,
        "job_type_id"                     UUID          NOT NULL,
        "description"                     TEXT          NOT NULL,
        "starts_at"                       TIMESTAMPTZ   NOT NULL,
        "duration_minutes"                INT           NOT NULL,
        "job_address"                     TEXT          NOT NULL,
        "job_formatted_address"           VARCHAR(500)  NULL,
        "job_latitude"                    DECIMAL(10,7) NOT NULL,
        "job_longitude"                   DECIMAL(10,7) NOT NULL,
        "offered_amount"                  DECIMAL(10,2) NOT NULL,
        "expires_at"                      TIMESTAMPTZ   NOT NULL,
        "status"                          "open_offer_status_enum" NOT NULL DEFAULT 'OPEN',
        "platform_fee_rate_snapshot"      DECIMAL(5,4)  NOT NULL DEFAULT 0,
        "minimum_offered_amount_snapshot" DECIMAL(10,2) NOT NULL DEFAULT 0,
        "created_at"                      TIMESTAMP     NOT NULL DEFAULT now(),
        "updated_at"                      TIMESTAMP     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_open_offers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_open_offers_company_user" FOREIGN KEY ("company_user_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_open_offers_job_type"     FOREIGN KEY ("job_type_id")     REFERENCES "job_types"("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_open_offers_company_created_at"
        ON "open_offers" ("company_user_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_open_offers_status_expires_at"
        ON "open_offers" ("status", "expires_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_open_offers_status_starts_at"
        ON "open_offers" ("status", "starts_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_open_offers_job_type_id"
        ON "open_offers" ("job_type_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "open_offers"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "open_offer_status_enum"`);
  }
}
