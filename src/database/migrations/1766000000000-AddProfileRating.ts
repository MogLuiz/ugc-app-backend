import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProfileRating1766000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "profiles"
      ADD COLUMN "rating" decimal(3,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "profiles" DROP COLUMN "rating"
    `);
  }
}
