import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContractExpiresAt1767000500000 implements MigrationInterface {
  name = 'AddContractExpiresAt1767000500000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contract_requests"
        ADD COLUMN "expires_at" TIMESTAMPTZ DEFAULT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_contract_requests_expires_at"
        ON "contract_requests" ("expires_at")
        WHERE "expires_at" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_contract_requests_expires_at"`);
    await queryRunner.query(`
      ALTER TABLE "contract_requests"
        DROP COLUMN IF EXISTS "expires_at"
    `);
  }
}
