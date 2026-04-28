import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterPixCopyPasteToText1767001900000 implements MigrationInterface {
  name = 'AlterPixCopyPasteToText1767001900000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payments"
        ALTER COLUMN "pix_copy_paste" TYPE TEXT
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payments"
        ALTER COLUMN "pix_copy_paste" TYPE VARCHAR(1000)
    `);
  }
}
