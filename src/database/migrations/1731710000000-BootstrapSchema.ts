import { MigrationInterface, QueryRunner } from 'typeorm';

export class BootstrapSchema1731710000000 implements MigrationInterface {
  name = 'BootstrapSchema1731710000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TYPE "users_role_enum" AS ENUM ('CREATOR', 'COMPANY');
      CREATE TYPE "users_status_enum" AS ENUM ('PENDING', 'ACTIVE', 'BLOCKED');
      CREATE TYPE "company_profiles_document_type_enum" AS ENUM ('CPF', 'CNPJ');
    `);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "auth_user_id" varchar(255) NOT NULL,
        "email" varchar(255) NOT NULL,
        "phone" varchar(50),
        "role" "users_role_enum" NOT NULL,
        "status" "users_status_enum" NOT NULL DEFAULT 'PENDING',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_auth_user_id" UNIQUE ("auth_user_id"),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "profiles" (
        "user_id" uuid NOT NULL,
        "name" varchar(255) NOT NULL,
        "birth_date" date,
        "gender" varchar(50),
        "photo_url" varchar(500),
        "address_street" varchar(255),
        "address_number" varchar(50),
        "address_city" varchar(100),
        "address_state" varchar(50),
        "address_zip_code" varchar(20),
        "bio" text,
        "onboarding_step" int NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_profiles" PRIMARY KEY ("user_id"),
        CONSTRAINT "FK_profiles_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "creator_profiles" (
        "user_id" uuid NOT NULL,
        "cpf" varchar(20),
        "instagram_username" varchar(100),
        "tiktok_username" varchar(100),
        "referral_source" varchar(255),
        "portfolio_url" varchar(500),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_creator_profiles" PRIMARY KEY ("user_id"),
        CONSTRAINT "FK_creator_profiles_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "company_profiles" (
        "user_id" uuid NOT NULL,
        "document_type" "company_profiles_document_type_enum",
        "document_number" varchar(20),
        "company_name" varchar(255),
        "job_title" varchar(100),
        "business_niche" varchar(255),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_company_profiles" PRIMARY KEY ("user_id"),
        CONSTRAINT "FK_company_profiles_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "company_profiles"`);
    await queryRunner.query(`DROP TABLE "creator_profiles"`);
    await queryRunner.query(`DROP TABLE "profiles"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "company_profiles_document_type_enum"`);
    await queryRunner.query(`DROP TYPE "users_status_enum"`);
    await queryRunner.query(`DROP TYPE "users_role_enum"`);
  }
}
