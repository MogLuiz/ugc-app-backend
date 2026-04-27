import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationsBase1767001600000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "type" varchar(100) NOT NULL,
        "title" varchar(200) NOT NULL,
        "body" text NOT NULL,
        "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "source_type" varchar(100) NOT NULL,
        "source_id" text,
        "dedupe_key" varchar(255),
        "read_at" TIMESTAMPTZ,
        "pushed_at" TIMESTAMPTZ,
        "last_push_error" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notifications_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await runner.query(`
      CREATE INDEX "IDX_notifications_user_created_id_desc"
      ON "notifications" ("user_id", "created_at" DESC, "id" DESC)
    `);

    await runner.query(`
      CREATE INDEX "IDX_notifications_user_read_created"
      ON "notifications" ("user_id", "read_at", "created_at" DESC)
    `);

    await runner.query(`
      CREATE UNIQUE INDEX "UQ_notifications_user_dedupe_key_not_null"
      ON "notifications" ("user_id", "dedupe_key")
      WHERE "dedupe_key" IS NOT NULL
    `);

    await runner.query(`
      CREATE TABLE "user_push_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "provider" varchar(30) NOT NULL DEFAULT 'expo',
        "token" varchar(255) NOT NULL,
        "device_id" varchar(255),
        "device_name" varchar(255),
        "platform" varchar(50),
        "app_version" varchar(50),
        "permission_granted" boolean NOT NULL DEFAULT true,
        "last_seen_at" TIMESTAMPTZ NOT NULL,
        "invalidated_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_push_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_push_tokens_token" UNIQUE ("token"),
        CONSTRAINT "FK_user_push_tokens_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await runner.query(`
      CREATE INDEX "IDX_user_push_tokens_user_provider"
      ON "user_push_tokens" ("user_id", "provider")
    `);

    await runner.query(`
      CREATE INDEX "IDX_user_push_tokens_user_invalidated_last_seen"
      ON "user_push_tokens" ("user_id", "invalidated_at", "last_seen_at" DESC)
    `);
  }

  async down(_runner: QueryRunner): Promise<void> {
    // Rollback omitido intencionalmente — sem dados de produção.
  }
}
