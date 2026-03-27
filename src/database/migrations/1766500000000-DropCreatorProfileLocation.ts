import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropCreatorProfileLocation1766500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "creator_profiles"
      DROP COLUMN IF EXISTS "latitude",
      DROP COLUMN IF EXISTS "longitude"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "creator_profiles"
      ADD COLUMN "latitude" decimal(10,7),
      ADD COLUMN "longitude" decimal(10,7)
    `);
  }
}
