import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Remove a constraint CHK_payments_amounts que sobreviveu após a migração
 * PaymentFinancials (1767001500000).
 *
 * Contexto: a migração 1767001500000 tentou dropar "payments_financial_snapshot_check"
 * (nome errado) e adicionou "payments_financial_check" com a fórmula correta do modelo
 * atual. A CHK_payments_amounts, criada em 1767000200000, não foi removida — o PostgreSQL
 * apenas atualizou as referências de coluna ao renomear, mas manteve a fórmula antiga
 * (creator_payout = service_gross + transport), que é incompatível com o modelo correto
 * (creator_payout = creator_net_service + transport).
 *
 * A constraint correta é "payments_financial_check" (já existente).
 */
export class DropStalePaymentsAmountsConstraint1767001700000 implements MigrationInterface {
  name = 'DropStalePaymentsAmountsConstraint1767001700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "CHK_payments_amounts"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-adiciona com a fórmula correta do modelo atual caso necessário reverter.
    await queryRunner.query(`
      ALTER TABLE "payments" ADD CONSTRAINT "CHK_payments_amounts" CHECK (
        "service_gross_amount_cents"        >= 0
        AND "platform_fee_amount_cents"     >= 0
        AND "transport_fee_amount_cents"    >= 0
        AND "company_total_amount_cents"    > 0
        AND "creator_net_service_amount_cents" = "service_gross_amount_cents" - "platform_fee_amount_cents"
        AND "creator_payout_amount_cents"   = "creator_net_service_amount_cents" + "transport_fee_amount_cents"
        AND "company_total_amount_cents"    = "service_gross_amount_cents" + "transport_fee_amount_cents"
      )
    `);
  }
}
