import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCreatorJobTypes1765800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "creator_job_types" (
        "creator_profile_user_id" uuid NOT NULL,
        "job_type_id" uuid NOT NULL,
        "base_price_cents" int,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_creator_job_types" PRIMARY KEY ("creator_profile_user_id", "job_type_id"),
        CONSTRAINT "FK_creator_job_types_creator" FOREIGN KEY ("creator_profile_user_id")
          REFERENCES "creator_profiles"("user_id") ON DELETE CASCADE,
        CONSTRAINT "FK_creator_job_types_job_type" FOREIGN KEY ("job_type_id")
          REFERENCES "job_types"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_creator_job_types_job_type" ON "creator_job_types" ("job_type_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_creator_job_types_job_type"`);
    await queryRunner.query(`DROP TABLE "creator_job_types"`);
  }
}
