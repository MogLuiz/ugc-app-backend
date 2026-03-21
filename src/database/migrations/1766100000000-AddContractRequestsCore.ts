import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContractRequestsCore1766100000000 implements MigrationInterface {
  name = 'AddContractRequestsCore1766100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "contract_requests_status_enum" AS ENUM (
        'PENDING_ACCEPTANCE',
        'ACCEPTED',
        'REJECTED',
        'CANCELLED',
        'COMPLETED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "payment_status_enum" AS ENUM (
        'PENDING',
        'PAID'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "creator_profiles"
      ADD COLUMN "auto_accept_bookings" boolean NOT NULL DEFAULT false,
      ADD COLUMN "service_radius_km" decimal(8,2),
      ADD COLUMN "latitude" decimal(10,7),
      ADD COLUMN "longitude" decimal(10,7)
    `);

    await queryRunner.query(`
      CREATE TABLE "platform_settings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "transport_price_per_km" decimal(10,2) NOT NULL,
        "transport_minimum_fee" decimal(10,2) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_platform_settings" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "contract_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_user_id" uuid NOT NULL,
        "creator_user_id" uuid NOT NULL,
        "job_type_id" uuid NOT NULL,
        "mode" "job_types_mode_enum" NOT NULL,
        "description" text NOT NULL,
        "status" "contract_requests_status_enum" NOT NULL DEFAULT 'PENDING_ACCEPTANCE',
        "payment_status" "payment_status_enum" NOT NULL DEFAULT 'PAID',
        "currency" varchar(3) NOT NULL DEFAULT 'BRL',
        "terms_accepted_at" TIMESTAMPTZ NOT NULL,
        "starts_at" TIMESTAMPTZ NOT NULL,
        "duration_minutes" int NOT NULL,
        "location_address" text NOT NULL,
        "location_lat" decimal(10,7) NOT NULL,
        "location_lng" decimal(10,7) NOT NULL,
        "distance_km" decimal(8,2) NOT NULL,
        "transport_fee" decimal(10,2) NOT NULL,
        "creator_base_price" decimal(10,2) NOT NULL,
        "platform_fee" decimal(10,2) NOT NULL,
        "total_price" decimal(10,2) NOT NULL,
        "transport_price_per_km_used" decimal(10,2) NOT NULL,
        "transport_minimum_fee_used" decimal(10,2) NOT NULL,
        "rejection_reason" text,
        "creator_name_snapshot" varchar(255) NOT NULL,
        "creator_avatar_url_snapshot" varchar(500),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_contract_requests" PRIMARY KEY ("id"),
        CONSTRAINT "FK_contract_requests_company" FOREIGN KEY ("company_user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_contract_requests_creator" FOREIGN KEY ("creator_user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_contract_requests_job_type" FOREIGN KEY ("job_type_id")
          REFERENCES "job_types"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_contract_requests_company_created_at"
      ON "contract_requests" ("company_user_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_contract_requests_company_status_created_at"
      ON "contract_requests" ("company_user_id", "status", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_contract_requests_creator_status_starts_at"
      ON "contract_requests" ("creator_user_id", "status", "starts_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_contract_requests_job_type_id"
      ON "contract_requests" ("job_type_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_contract_requests_job_type_id"`);
    await queryRunner.query(`DROP INDEX "IDX_contract_requests_creator_status_starts_at"`);
    await queryRunner.query(`DROP INDEX "IDX_contract_requests_company_status_created_at"`);
    await queryRunner.query(`DROP INDEX "IDX_contract_requests_company_created_at"`);
    await queryRunner.query(`DROP TABLE "contract_requests"`);
    await queryRunner.query(`DROP TABLE "platform_settings"`);

    await queryRunner.query(`
      ALTER TABLE "creator_profiles"
      DROP COLUMN "longitude",
      DROP COLUMN "latitude",
      DROP COLUMN "service_radius_km",
      DROP COLUMN "auto_accept_bookings"
    `);

    await queryRunner.query(`DROP TYPE "payment_status_enum"`);
    await queryRunner.query(`DROP TYPE "contract_requests_status_enum"`);
  }
}
