import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenSchedulingContracts1765600000000 implements MigrationInterface {
  name = 'HardenSchedulingContracts1765600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "availability_rules"
      ADD CONSTRAINT "CHK_availability_rules_active_window"
      CHECK (
        ("is_active" = false AND "start_time" IS NULL AND "end_time" IS NULL)
        OR
        ("is_active" = true AND "start_time" IS NOT NULL AND "end_time" IS NOT NULL AND "start_time" < "end_time")
      )
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'bookings_origin_enum'
        ) THEN
          CREATE TYPE "bookings_origin_enum" AS ENUM (
            'COMPANY_REQUEST',
            'MANUAL_INTERNAL',
            'SYSTEM'
          );
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      UPDATE "bookings"
      SET "origin" = CASE
        WHEN "origin" IS NULL OR btrim("origin") = '' THEN 'SYSTEM'
        WHEN upper(btrim("origin")) IN ('MARKETPLACE', 'COMPANY_REQUEST', 'COMPANY', 'REQUEST', 'COMPANY-REQUEST') THEN 'COMPANY_REQUEST'
        WHEN upper(btrim("origin")) IN ('MANUAL_INTERNAL', 'MANUAL', 'INTERNAL', 'ADMIN', 'BACKOFFICE') THEN 'MANUAL_INTERNAL'
        WHEN upper(btrim("origin")) = 'SYSTEM' THEN 'SYSTEM'
        ELSE 'SYSTEM'
      END
    `);

    await queryRunner.query(`
      ALTER TABLE "bookings"
      ALTER COLUMN "origin" TYPE "bookings_origin_enum"
      USING "origin"::"bookings_origin_enum"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bookings"
      ALTER COLUMN "origin" TYPE varchar(100)
      USING "origin"::text
    `);

    await queryRunner.query(`DROP TYPE "bookings_origin_enum"`);
    await queryRunner.query(
      `ALTER TABLE "availability_rules" DROP CONSTRAINT "CHK_availability_rules_active_window"`,
    );
  }
}
