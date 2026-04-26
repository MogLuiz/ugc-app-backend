import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renomeia colunas de payments para nomenclatura clara, adiciona
 * creator_net_service_amount_cents e corrige a CHECK constraint que estava
 * matematicamente errada para o nosso modelo de negócio.
 */
export class PaymentFinancials1767001500000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_financial_snapshot_check
    `);

    await runner.query(`ALTER TABLE payments RENAME COLUMN gross_amount_cents        TO company_total_amount_cents`);
    await runner.query(`ALTER TABLE payments RENAME COLUMN creator_base_amount_cents TO service_gross_amount_cents`);
    await runner.query(`ALTER TABLE payments RENAME COLUMN creator_net_amount_cents  TO creator_payout_amount_cents`);
    await runner.query(`ALTER TABLE payments RENAME COLUMN platform_fee_cents        TO platform_fee_amount_cents`);
    await runner.query(`ALTER TABLE payments RENAME COLUMN transport_fee_cents       TO transport_fee_amount_cents`);

    await runner.query(`
      ALTER TABLE payments ADD COLUMN creator_net_service_amount_cents INTEGER
    `);

    await runner.query(`
      UPDATE payments
        SET creator_net_service_amount_cents = service_gross_amount_cents - platform_fee_amount_cents
    `);

    await runner.query(`
      ALTER TABLE payments ALTER COLUMN creator_net_service_amount_cents SET NOT NULL
    `);

    await runner.query(`
      ALTER TABLE payments ADD CONSTRAINT payments_financial_check CHECK (
        service_gross_amount_cents        >= 0
        AND platform_fee_amount_cents     >= 0
        AND transport_fee_amount_cents    >= 0
        AND company_total_amount_cents    > 0
        AND creator_net_service_amount_cents = service_gross_amount_cents - platform_fee_amount_cents
        AND creator_payout_amount_cents   = creator_net_service_amount_cents + transport_fee_amount_cents
        AND company_total_amount_cents    = service_gross_amount_cents + transport_fee_amount_cents
      )
    `);
  }

  async down(_runner: QueryRunner): Promise<void> {
    // Rollback omitido intencionalmente — sem dados de produção.
  }
}
