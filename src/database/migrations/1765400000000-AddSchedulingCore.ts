import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSchedulingCore1765400000000 implements MigrationInterface {
  name = 'AddSchedulingCore1765400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "availability_rules_day_of_week_enum" AS ENUM (
        'SUNDAY',
        'MONDAY',
        'TUESDAY',
        'WEDNESDAY',
        'THURSDAY',
        'FRIDAY',
        'SATURDAY'
      );
      CREATE TYPE "job_types_mode_enum" AS ENUM ('PRESENTIAL', 'REMOTE', 'HYBRID');
      CREATE TYPE "bookings_mode_enum" AS ENUM ('PRESENTIAL', 'REMOTE', 'HYBRID');
      CREATE TYPE "bookings_status_enum" AS ENUM (
        'PENDING',
        'CONFIRMED',
        'REJECTED',
        'CANCELLED',
        'COMPLETED'
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "availability_rules" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "creator_user_id" uuid NOT NULL,
        "day_of_week" "availability_rules_day_of_week_enum" NOT NULL,
        "start_time" time,
        "end_time" time,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_availability_rules" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_availability_rules_creator_day" UNIQUE ("creator_user_id", "day_of_week"),
        CONSTRAINT "FK_availability_rules_creator_user" FOREIGN KEY ("creator_user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "job_types" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(120) NOT NULL,
        "mode" "job_types_mode_enum" NOT NULL,
        "duration_minutes" int NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_job_types" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_job_types_name" UNIQUE ("name")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "bookings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_user_id" uuid NOT NULL,
        "creator_user_id" uuid NOT NULL,
        "job_type_id" uuid NOT NULL,
        "title" varchar(255) NOT NULL,
        "description" text,
        "mode" "bookings_mode_enum" NOT NULL,
        "status" "bookings_status_enum" NOT NULL DEFAULT 'PENDING',
        "start_date_time" TIMESTAMPTZ NOT NULL,
        "end_date_time" TIMESTAMPTZ NOT NULL,
        "origin" varchar(100) NOT NULL,
        "notes" text,
        "job_type_name_snapshot" varchar(120) NOT NULL,
        "duration_minutes_snapshot" int NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bookings" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bookings_company_user" FOREIGN KEY ("company_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_bookings_creator_user" FOREIGN KEY ("creator_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_bookings_job_type" FOREIGN KEY ("job_type_id") REFERENCES "job_types"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_availability_rules_creator_day" ON "availability_rules" ("creator_user_id", "day_of_week");
      CREATE INDEX "IDX_job_types_is_active" ON "job_types" ("is_active");
      CREATE INDEX "IDX_bookings_creator_start_date_time" ON "bookings" ("creator_user_id", "start_date_time");
      CREATE INDEX "IDX_bookings_company_start_date_time" ON "bookings" ("company_user_id", "start_date_time");
      CREATE INDEX "IDX_bookings_status" ON "bookings" ("status");
      CREATE INDEX "IDX_bookings_job_type_id" ON "bookings" ("job_type_id");
      CREATE INDEX "IDX_bookings_creator_status_start" ON "bookings" ("creator_user_id", "status", "start_date_time");
      CREATE INDEX "IDX_bookings_creator_blocking_window" ON "bookings" ("creator_user_id", "start_date_time", "end_date_time")
      WHERE "status" IN ('PENDING', 'CONFIRMED');
    `);

    await queryRunner.query(`
      INSERT INTO "job_types" ("name", "mode", "duration_minutes", "is_active")
      VALUES
        ('Briefing Remoto', 'REMOTE', 60, true),
        ('Workshop Presencial', 'PRESENTIAL', 120, true),
        ('Reunião Estratégica Híbrida', 'HYBRID', 90, true)
      ON CONFLICT ("name") DO UPDATE
      SET
        "mode" = EXCLUDED."mode",
        "duration_minutes" = EXCLUDED."duration_minutes",
        "is_active" = EXCLUDED."is_active",
        "updated_at" = now()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_bookings_creator_blocking_window"`);
    await queryRunner.query(`DROP INDEX "IDX_bookings_creator_status_start"`);
    await queryRunner.query(`DROP INDEX "IDX_bookings_job_type_id"`);
    await queryRunner.query(`DROP INDEX "IDX_bookings_status"`);
    await queryRunner.query(`DROP INDEX "IDX_bookings_company_start_date_time"`);
    await queryRunner.query(`DROP INDEX "IDX_bookings_creator_start_date_time"`);
    await queryRunner.query(`DROP INDEX "IDX_job_types_is_active"`);
    await queryRunner.query(`DROP INDEX "IDX_availability_rules_creator_day"`);
    await queryRunner.query(`DROP TABLE "bookings"`);
    await queryRunner.query(`DROP TABLE "job_types"`);
    await queryRunner.query(`DROP TABLE "availability_rules"`);
    await queryRunner.query(`DROP TYPE "bookings_status_enum"`);
    await queryRunner.query(`DROP TYPE "bookings_mode_enum"`);
    await queryRunner.query(`DROP TYPE "job_types_mode_enum"`);
    await queryRunner.query(`DROP TYPE "availability_rules_day_of_week_enum"`);
  }
}
