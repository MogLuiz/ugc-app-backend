import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adiciona colunas PIX à tabela payments para suportar o fluxo completo
 * de PIX (KAN-72): QR code, copia-e-cola, expiração e tipo de pagamento.
 *
 * Todas as colunas são nullable — compatibilidade retroativa com pagamentos
 * de cartão existentes.
 */
export class AddPixFieldsToPayments1767001800000 implements MigrationInterface {
  name = 'AddPixFieldsToPayments1767001800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payments"
        ADD COLUMN IF NOT EXISTS "payment_type"       VARCHAR(10),
        ADD COLUMN IF NOT EXISTS "pix_copy_paste"     VARCHAR(1000),
        ADD COLUMN IF NOT EXISTS "pix_qr_code_base64" TEXT,
        ADD COLUMN IF NOT EXISTS "pix_expires_at"     TIMESTAMPTZ
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "payment_type"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "pix_copy_paste"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "pix_qr_code_base64"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "pix_expires_at"`);
  }
}
