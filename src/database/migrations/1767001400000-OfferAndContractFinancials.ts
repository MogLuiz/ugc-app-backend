import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migra open_offers e contract_requests de campos decimais para centavos.
 * Backfill seguro: dados de teste tinham platform_fee_rate = 0, portanto
 * platform_fee_amount_cents = 0 e creator_net = service_gross.
 */
export class OfferAndContractFinancials1767001400000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    // ── open_offers ──────────────────────────────────────────────────────────
    await runner.query(`
      ALTER TABLE open_offers
        ADD COLUMN service_gross_amount_cents        INTEGER,
        ADD COLUMN platform_fee_bps_snapshot         INTEGER,
        ADD COLUMN platform_fee_amount_cents         INTEGER,
        ADD COLUMN creator_net_service_amount_cents  INTEGER
    `);

    await runner.query(`
      UPDATE open_offers SET
        service_gross_amount_cents       = ROUND(offered_amount * 100)::INTEGER,
        platform_fee_bps_snapshot        = 0,
        platform_fee_amount_cents        = 0,
        creator_net_service_amount_cents = ROUND(offered_amount * 100)::INTEGER
    `);

    await runner.query(`
      ALTER TABLE open_offers
        ALTER COLUMN service_gross_amount_cents       SET NOT NULL,
        ALTER COLUMN platform_fee_bps_snapshot        SET NOT NULL,
        ALTER COLUMN platform_fee_amount_cents        SET NOT NULL,
        ALTER COLUMN creator_net_service_amount_cents SET NOT NULL
    `);

    await runner.query(`
      ALTER TABLE open_offers
        DROP COLUMN IF EXISTS offered_amount,
        DROP COLUMN IF EXISTS platform_fee_rate_snapshot,
        DROP COLUMN IF EXISTS minimum_offered_amount_snapshot
    `);

    // ── contract_requests ────────────────────────────────────────────────────
    await runner.query(`
      ALTER TABLE contract_requests
        ADD COLUMN service_gross_amount_cents        INTEGER,
        ADD COLUMN platform_fee_bps_snapshot         INTEGER,
        ADD COLUMN platform_fee_amount_cents         INTEGER,
        ADD COLUMN creator_net_service_amount_cents  INTEGER,
        ADD COLUMN transport_fee_amount_cents        INTEGER,
        ADD COLUMN creator_payout_amount_cents       INTEGER,
        ADD COLUMN company_total_amount_cents        INTEGER
    `);

    await runner.query(`
      UPDATE contract_requests SET
        service_gross_amount_cents       = ROUND(creator_base_price * 100)::INTEGER,
        platform_fee_bps_snapshot        = 0,
        platform_fee_amount_cents        = ROUND(platform_fee * 100)::INTEGER,
        creator_net_service_amount_cents = ROUND(creator_base_price * 100)::INTEGER
                                         - ROUND(platform_fee * 100)::INTEGER,
        transport_fee_amount_cents       = ROUND(transport_fee * 100)::INTEGER,
        creator_payout_amount_cents      = ROUND(creator_base_price * 100)::INTEGER
                                         - ROUND(platform_fee * 100)::INTEGER
                                         + ROUND(transport_fee * 100)::INTEGER,
        company_total_amount_cents       = ROUND(creator_base_price * 100)::INTEGER
                                         + ROUND(transport_fee * 100)::INTEGER
    `);

    await runner.query(`
      ALTER TABLE contract_requests
        ALTER COLUMN service_gross_amount_cents       SET NOT NULL,
        ALTER COLUMN platform_fee_bps_snapshot        SET NOT NULL,
        ALTER COLUMN platform_fee_amount_cents        SET NOT NULL,
        ALTER COLUMN creator_net_service_amount_cents SET NOT NULL,
        ALTER COLUMN transport_fee_amount_cents       SET NOT NULL,
        ALTER COLUMN creator_payout_amount_cents      SET NOT NULL,
        ALTER COLUMN company_total_amount_cents       SET NOT NULL
    `);

    await runner.query(`
      ALTER TABLE contract_requests
        DROP COLUMN IF EXISTS creator_base_price,
        DROP COLUMN IF EXISTS platform_fee,
        DROP COLUMN IF EXISTS platform_fee_rate_snapshot,
        DROP COLUMN IF EXISTS transport_fee,
        DROP COLUMN IF EXISTS total_price
    `);
  }

  async down(_runner: QueryRunner): Promise<void> {
    // Rollback omitido intencionalmente — sem dados de produção.
  }
}
