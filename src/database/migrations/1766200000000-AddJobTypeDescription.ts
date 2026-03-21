import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJobTypeDescription1766200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_types"
      ADD COLUMN "description" varchar(255) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_types" DROP COLUMN "description"
    `);
  }
}
