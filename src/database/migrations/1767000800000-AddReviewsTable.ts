import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReviewsTable1767000800000 implements MigrationInterface {
  name = 'AddReviewsTable1767000800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "reviews_reviewer_role_enum" AS ENUM ('COMPANY', 'CREATOR')
    `);

    await queryRunner.query(`
      CREATE TABLE "reviews" (
        "id"                   UUID         NOT NULL DEFAULT gen_random_uuid(),
        "contract_request_id"  UUID         NOT NULL,
        "reviewer_user_id"     UUID         NOT NULL,
        "reviewee_user_id"     UUID         NOT NULL,
        "reviewer_role"        "reviews_reviewer_role_enum" NOT NULL,
        "rating"               INT          NOT NULL,
        "comment"              VARCHAR(1000),
        "created_at"           TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reviews" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_reviews_contract_reviewer"
          UNIQUE ("contract_request_id", "reviewer_user_id"),
        CONSTRAINT "CHK_reviews_rating"
          CHECK ("rating" BETWEEN 1 AND 5)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_reviews_contract_request_id" ON "reviews" ("contract_request_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_reviews_reviewee_user_id" ON "reviews" ("reviewee_user_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_reviews_reviewee_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_reviews_contract_request_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reviews"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "reviews_reviewer_role_enum"`);
  }
}
