import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentsTables1767000000000 implements MigrationInterface {
  name = 'CreatePaymentsTables1767000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // payments
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id"                       uuid        NOT NULL DEFAULT gen_random_uuid(),
        "contract_request_id"      uuid        NOT NULL,
        "company_user_id"          uuid        NOT NULL,
        "creator_user_id"          uuid        NOT NULL,
        "gross_amount_cents"       integer     NOT NULL,
        "platform_fee_cents"       integer     NOT NULL,
        "creator_net_amount_cents" integer     NOT NULL,
        "currency"                 varchar(3)  NOT NULL DEFAULT 'BRL',
        "status"                   varchar(30) NOT NULL DEFAULT 'pending',
        "payout_status"            varchar(30) NOT NULL DEFAULT 'not_due',
        "gateway_name"             varchar(50) NOT NULL DEFAULT 'mercado_pago',
        "external_payment_id"      varchar(100),
        "external_preference_id"   varchar(200),
        "external_reference"       varchar(100),
        "payment_method"           varchar(50),
        "installments"             integer,
        "paid_at"                  TIMESTAMPTZ,
        "created_at"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_payments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payments_contract_request_id" UNIQUE ("contract_request_id"),
        CONSTRAINT "FK_payments_contract_request"
          FOREIGN KEY ("contract_request_id")
          REFERENCES "contract_requests"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_payments_company_user"
          FOREIGN KEY ("company_user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_payments_creator_user"
          FOREIGN KEY ("creator_user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_payments_amounts"
          CHECK (
            "gross_amount_cents" > 0
            AND "platform_fee_cents" >= 0
            AND "creator_net_amount_cents" >= 0
            AND "gross_amount_cents" = "platform_fee_cents" + "creator_net_amount_cents"
          )
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_payments_company_user_id" ON "payments" ("company_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_creator_user_id" ON "payments" ("creator_user_id")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_payments_status" ON "payments" ("status")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_payout_status" ON "payments" ("payout_status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_external_payment_id" ON "payments" ("external_payment_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_external_reference" ON "payments" ("external_reference")`,
    );

    // creator_payouts
    await queryRunner.query(`
      CREATE TABLE "creator_payouts" (
        "id"             uuid        NOT NULL DEFAULT gen_random_uuid(),
        "payment_id"     uuid        NOT NULL,
        "creator_user_id" uuid       NOT NULL,
        "amount_cents"   integer     NOT NULL,
        "currency"       varchar(3)  NOT NULL DEFAULT 'BRL',
        "status"         varchar(30) NOT NULL DEFAULT 'pending',
        "scheduled_for"  TIMESTAMPTZ,
        "paid_at"        TIMESTAMPTZ,
        "marked_paid_by" varchar(100),
        "internal_note"  text,
        "receipt_url"    varchar(500),
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_creator_payouts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_creator_payouts_payment"
          FOREIGN KEY ("payment_id")
          REFERENCES "payments"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_creator_payouts_creator"
          FOREIGN KEY ("creator_user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_creator_payouts_amount"
          CHECK ("amount_cents" > 0)
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_creator_payouts_payment_id" ON "creator_payouts" ("payment_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_creator_payouts_creator_user_id_status" ON "creator_payouts" ("creator_user_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_creator_payouts_status" ON "creator_payouts" ("status")`,
    );

    // payment_provider_events
    await queryRunner.query(`
      CREATE TABLE "payment_provider_events" (
        "id"                  uuid        NOT NULL DEFAULT gen_random_uuid(),
        "provider"            varchar(50) NOT NULL,
        "external_event_id"   varchar(100) NOT NULL,
        "external_payment_id" varchar(100),
        "event_type"          varchar(100) NOT NULL,
        "raw_payload"         jsonb        NOT NULL,
        "processing_status"   varchar(30)  NOT NULL DEFAULT 'received',
        "error_message"       text,
        "processed_at"        TIMESTAMPTZ,
        "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_payment_provider_events" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payment_provider_events_external_event_id"
          UNIQUE ("external_event_id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_payment_provider_events_provider_status" ON "payment_provider_events" ("provider", "processing_status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_provider_events_external_payment_id" ON "payment_provider_events" ("external_payment_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_provider_events_created_at" ON "payment_provider_events" ("created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_payment_provider_events_created_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_payment_provider_events_external_payment_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_payment_provider_events_provider_status"`,
    );
    await queryRunner.query(`DROP TABLE "payment_provider_events"`);

    await queryRunner.query(`DROP INDEX "IDX_creator_payouts_status"`);
    await queryRunner.query(
      `DROP INDEX "IDX_creator_payouts_creator_user_id_status"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_creator_payouts_payment_id"`);
    await queryRunner.query(`DROP TABLE "creator_payouts"`);

    await queryRunner.query(
      `DROP INDEX "IDX_payments_external_reference"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_payments_external_payment_id"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_payments_payout_status"`);
    await queryRunner.query(`DROP INDEX "IDX_payments_status"`);
    await queryRunner.query(`DROP INDEX "IDX_payments_creator_user_id"`);
    await queryRunner.query(`DROP INDEX "IDX_payments_company_user_id"`);
    await queryRunner.query(`DROP TABLE "payments"`);
  }
}
