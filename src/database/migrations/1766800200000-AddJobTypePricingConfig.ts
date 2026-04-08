import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJobTypePricingConfig1766800200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_types"
        ADD COLUMN "platform_fee_rate"      DECIMAL(5,4)  NOT NULL DEFAULT 0,
        ADD COLUMN "minimum_offered_amount" DECIMAL(10,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_types"
        DROP COLUMN IF EXISTS "platform_fee_rate",
        DROP COLUMN IF EXISTS "minimum_offered_amount"
    `);
  }
}
