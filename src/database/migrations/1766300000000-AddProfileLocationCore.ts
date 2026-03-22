import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProfileLocationCore1766300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "profiles"
      ADD COLUMN "formatted_address" varchar(500),
      ADD COLUMN "address_hash" varchar(64),
      ADD COLUMN "latitude" decimal(10,7),
      ADD COLUMN "longitude" decimal(10,7),
      ADD COLUMN "geocoding_status" varchar(20) NOT NULL DEFAULT 'pending',
      ADD COLUMN "geocoded_at" TIMESTAMPTZ,
      ADD COLUMN "has_valid_coordinates" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE "contract_requests"
      ADD COLUMN "job_formatted_address" varchar(500),
      ADD COLUMN "effective_service_radius_km_used" decimal(8,2)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contract_requests"
      DROP COLUMN "effective_service_radius_km_used",
      DROP COLUMN "job_formatted_address"
    `);

    await queryRunner.query(`
      ALTER TABLE "profiles"
      DROP COLUMN "has_valid_coordinates",
      DROP COLUMN "geocoded_at",
      DROP COLUMN "geocoding_status",
      DROP COLUMN "longitude",
      DROP COLUMN "latitude",
      DROP COLUMN "address_hash",
      DROP COLUMN "formatted_address"
    `);
  }
}
