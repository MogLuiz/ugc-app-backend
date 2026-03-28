import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContractRequestCompletedAt1766600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contract_requests"
      ADD COLUMN "completed_at" TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contract_requests"
      DROP COLUMN IF EXISTS "completed_at"
    `);
  }
}
