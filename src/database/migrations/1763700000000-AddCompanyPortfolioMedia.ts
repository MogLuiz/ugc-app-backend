import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanyPortfolioMedia1763700000000 implements MigrationInterface {
  name = 'AddCompanyPortfolioMedia1763700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "portfolio_media_type_enum" AS ENUM ('IMAGE', 'VIDEO');
      CREATE TYPE "portfolio_media_status_enum" AS ENUM ('PROCESSING', 'READY', 'FAILED');
    `);

    await queryRunner.query(`
      ALTER TABLE "company_profiles"
      ADD COLUMN "website_url" varchar(500),
      ADD COLUMN "instagram_username" varchar(100),
      ADD COLUMN "tiktok_username" varchar(100)
    `);

    await queryRunner.query(`
      CREATE TABLE "portfolios" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_portfolios" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_portfolios_user_id" UNIQUE ("user_id"),
        CONSTRAINT "FK_portfolios_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "portfolio_media" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "portfolio_id" uuid NOT NULL,
        "type" "portfolio_media_type_enum" NOT NULL,
        "storage_path" varchar(500) NOT NULL,
        "public_url" varchar(500) NOT NULL,
        "thumbnail_url" varchar(500),
        "mime_type" varchar(100) NOT NULL,
        "sort_order" int NOT NULL DEFAULT 0,
        "status" "portfolio_media_status_enum" NOT NULL DEFAULT 'READY',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_portfolio_media" PRIMARY KEY ("id"),
        CONSTRAINT "FK_portfolio_media_portfolio" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "portfolio_media"`);
    await queryRunner.query(`DROP TABLE "portfolios"`);
    await queryRunner.query(`
      ALTER TABLE "company_profiles"
      DROP COLUMN "tiktok_username",
      DROP COLUMN "instagram_username",
      DROP COLUMN "website_url"
    `);
    await queryRunner.query(`DROP TYPE "portfolio_media_status_enum"`);
    await queryRunner.query(`DROP TYPE "portfolio_media_type_enum"`);
  }
}
