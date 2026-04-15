import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCreatorProfilePayoutFields1767000100000 implements MigrationInterface {
  name = 'AddCreatorProfilePayoutFields1767000100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "creator_profiles"
        ADD COLUMN "pix_key"              varchar(150),
        ADD COLUMN "pix_key_type"         varchar(20),
        ADD COLUMN "pix_holder_name"      varchar(255),
        ADD COLUMN "pix_holder_document"  varchar(20),
        ADD COLUMN "payout_details_status" varchar(20) NOT NULL DEFAULT 'pending'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "creator_profiles"."pix_key_type" IS
        'cpf | cnpj | email | phone | random'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "creator_profiles"."payout_details_status" IS
        'pending | filled | verified'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "creator_profiles"
        DROP COLUMN "payout_details_status",
        DROP COLUMN "pix_holder_document",
        DROP COLUMN "pix_holder_name",
        DROP COLUMN "pix_key_type",
        DROP COLUMN "pix_key"
    `);
  }
}
