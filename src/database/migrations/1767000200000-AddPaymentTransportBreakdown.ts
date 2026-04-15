import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adiciona colunas de breakdown de transporte ao snapshot financeiro de Payment.
 *
 * Backfill de legado:
 * Registros existentes não possuem dados reais de deslocamento separados.
 * Fallback aplicado:
 *   creator_base_amount_cents = creator_net_amount_cents  (equivalente: sem transporte)
 *   transport_fee_cents       = 0
 *
 * Estes valores são semanticamente corretos para pagamentos criados antes desta migração
 * (contrato presencial com frete absorvido no valor líquido) mas NÃO representam
 * o breakdown real. Registros legados devem ser interpretados com esta ressalva.
 *
 * Novos registros sempre terão os valores corretos calculados a partir do ContractRequest.
 */
export class AddPaymentTransportBreakdown1767000200000 implements MigrationInterface {
  name = 'AddPaymentTransportBreakdown1767000200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Adicionar colunas nullable
    await queryRunner.query(`
      ALTER TABLE "payments"
        ADD COLUMN "creator_base_amount_cents" integer,
        ADD COLUMN "transport_fee_cents"        integer
    `);

    // 2. Backfill para registros legados
    await queryRunner.query(`
      UPDATE "payments"
      SET
        "creator_base_amount_cents" = "creator_net_amount_cents",
        "transport_fee_cents"       = 0
      WHERE "creator_base_amount_cents" IS NULL
    `);

    // 3. Tornar NOT NULL após backfill
    await queryRunner.query(`
      ALTER TABLE "payments"
        ALTER COLUMN "creator_base_amount_cents" SET NOT NULL,
        ALTER COLUMN "transport_fee_cents"        SET NOT NULL
    `);

    // 4. Substituir CHECK constraint com invariantes explícitas
    await queryRunner.query(`
      ALTER TABLE "payments" DROP CONSTRAINT "CHK_payments_amounts"
    `);

    await queryRunner.query(`
      ALTER TABLE "payments"
        ADD CONSTRAINT "CHK_payments_amounts" CHECK (
          "gross_amount_cents"            > 0
          AND "platform_fee_cents"        >= 0
          AND "creator_base_amount_cents" >= 0
          AND "transport_fee_cents"       >= 0
          AND "creator_net_amount_cents"  >= 0
          AND "creator_net_amount_cents"  = "creator_base_amount_cents" + "transport_fee_cents"
          AND "gross_amount_cents"        = "platform_fee_cents" + "creator_base_amount_cents" + "transport_fee_cents"
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payments" DROP CONSTRAINT "CHK_payments_amounts"
    `);

    await queryRunner.query(`
      ALTER TABLE "payments"
        ADD CONSTRAINT "CHK_payments_amounts" CHECK (
          "gross_amount_cents"          > 0
          AND "platform_fee_cents"      >= 0
          AND "creator_net_amount_cents" >= 0
          AND "gross_amount_cents"      = "platform_fee_cents" + "creator_net_amount_cents"
        )
    `);

    await queryRunner.query(`
      ALTER TABLE "payments"
        DROP COLUMN "creator_base_amount_cents",
        DROP COLUMN "transport_fee_cents"
    `);
  }
}
