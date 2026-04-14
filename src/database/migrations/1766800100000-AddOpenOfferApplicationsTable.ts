import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOpenOfferApplicationsTable1766800100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "application_status_enum" AS ENUM (
        'PENDING', 'SELECTED', 'REJECTED', 'WITHDRAWN'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "open_offer_applications" (
        "id"             UUID          NOT NULL DEFAULT gen_random_uuid(),
        "open_offer_id"  UUID          NOT NULL,
        "creator_user_id" UUID         NOT NULL,
        "status"         "application_status_enum" NOT NULL DEFAULT 'PENDING',
        "applied_at"     TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "responded_at"   TIMESTAMPTZ   NULL,
        "created_at"     TIMESTAMP     NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMP     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_open_offer_applications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_open_offer_applications_offer"
          FOREIGN KEY ("open_offer_id") REFERENCES "open_offers"("id"),
        CONSTRAINT "FK_open_offer_applications_creator"
          FOREIGN KEY ("creator_user_id") REFERENCES "users"("id"),
        CONSTRAINT "UQ_open_offer_applications_offer_creator"
          UNIQUE ("open_offer_id", "creator_user_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_open_offer_applications_offer_status"
        ON "open_offer_applications" ("open_offer_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_open_offer_applications_creator_status"
        ON "open_offer_applications" ("creator_user_id", "status", "applied_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "open_offer_applications"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "application_status_enum"`);
  }
}
