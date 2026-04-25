import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLegalAcceptances1767001100000 implements MigrationInterface {
  name = 'AddLegalAcceptances1767001100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "legal_acceptances_term_type_enum" AS ENUM (
        'COMPANY_SIGNUP',
        'CREATOR_SIGNUP',
        'COMPANY_HIRING'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "legal_acceptances" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "term_type" "legal_acceptances_term_type_enum" NOT NULL,
        "term_version" varchar(50) NOT NULL,
        "accepted_at" TIMESTAMPTZ NOT NULL,
        "ip_address" varchar(64),
        "user_agent" varchar(512),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_legal_acceptances" PRIMARY KEY ("id"),
        CONSTRAINT "FK_legal_acceptances_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_legal_acceptances_user_term_version"
      ON "legal_acceptances" ("user_id", "term_type", "term_version")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_legal_acceptances_user_term_accepted_at"
      ON "legal_acceptances" ("user_id", "term_type", "accepted_at" DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_legal_acceptances_user_term_accepted_at"`);
    await queryRunner.query(`DROP INDEX "UQ_legal_acceptances_user_term_version"`);
    await queryRunner.query(`DROP TABLE "legal_acceptances"`);
    await queryRunner.query(`DROP TYPE "legal_acceptances_term_type_enum"`);
  }
}
