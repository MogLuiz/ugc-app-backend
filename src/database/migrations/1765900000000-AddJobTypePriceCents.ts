import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJobTypePriceCents1765900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_types"
      ADD COLUMN "price" decimal(10,2) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      UPDATE "job_types" SET "price" = CASE
        WHEN "name" = 'Briefing Remoto' THEN 150.00
        WHEN "name" = 'Workshop Presencial' THEN 600.00
        WHEN "name" = 'Reunião Estratégica Híbrida' THEN 350.00
        ELSE 0
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_types" DROP COLUMN "price"
    `);
  }
}
