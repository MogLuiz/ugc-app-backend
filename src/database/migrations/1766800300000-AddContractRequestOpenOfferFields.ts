import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContractRequestOpenOfferFields1766800300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contract_requests"
        ADD COLUMN "platform_fee_rate_snapshot" DECIMAL(5,4) NULL,
        ADD COLUMN "open_offer_id"              UUID         NULL
          REFERENCES "open_offers"("id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_contract_requests_open_offer_id"
        ON "contract_requests" ("open_offer_id")
        WHERE "open_offer_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_contract_requests_open_offer_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "contract_requests"
        DROP COLUMN IF EXISTS "platform_fee_rate_snapshot",
        DROP COLUMN IF EXISTS "open_offer_id"
    `);
  }
}
