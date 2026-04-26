import { MigrationInterface, QueryRunner } from 'typeorm';

export class PlatformFeeBps1767001300000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE platform_settings
        ADD COLUMN IF NOT EXISTS platform_fee_bps INTEGER NOT NULL DEFAULT 2500
    `);

    await runner.query(`
      ALTER TABLE job_types DROP COLUMN IF EXISTS platform_fee_rate
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE platform_settings DROP COLUMN IF EXISTS platform_fee_bps
    `);
    await runner.query(`
      ALTER TABLE job_types
        ADD COLUMN IF NOT EXISTS platform_fee_rate DECIMAL(5,4) NOT NULL DEFAULT 0
    `);
  }
}
