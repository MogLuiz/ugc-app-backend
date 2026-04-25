import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHiringTermsSnapshotToContractRequests1767001200000
  implements MigrationInterface
{
  name = 'AddHiringTermsSnapshotToContractRequests1767001200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contract_requests"
        ADD COLUMN IF NOT EXISTS "hiring_terms_version" varchar(50),
        ADD COLUMN IF NOT EXISTS "hiring_terms_accepted_at" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "hiring_terms_acceptance_id" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "contract_requests"
        ADD CONSTRAINT "FK_contract_requests_hiring_terms_acceptance"
        FOREIGN KEY ("hiring_terms_acceptance_id")
        REFERENCES "legal_acceptances"("id")
        ON DELETE SET NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contract_requests"
        DROP CONSTRAINT IF EXISTS "FK_contract_requests_hiring_terms_acceptance"
    `);

    await queryRunner.query(`
      ALTER TABLE "contract_requests"
        DROP COLUMN IF EXISTS "hiring_terms_acceptance_id",
        DROP COLUMN IF EXISTS "hiring_terms_accepted_at",
        DROP COLUMN IF EXISTS "hiring_terms_version"
    `);
  }
}
