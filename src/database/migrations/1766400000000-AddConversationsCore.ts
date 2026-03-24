import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConversationsCore1766400000000 implements MigrationInterface {
  name = 'AddConversationsCore1766400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "conversation_participants_role_enum" AS ENUM ('COMPANY', 'CREATOR')
    `);

    await queryRunner.query(`
      CREATE TYPE "messages_content_type_enum" AS ENUM ('TEXT')
    `);

    await queryRunner.query(`
      CREATE TABLE "conversations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "contract_request_id" uuid NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "last_message_at" TIMESTAMPTZ,
        "closed_at" TIMESTAMPTZ,
        CONSTRAINT "PK_conversations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_conversations_contract_request_id" UNIQUE ("contract_request_id"),
        CONSTRAINT "FK_conversations_contract_request" FOREIGN KEY ("contract_request_id")
          REFERENCES "contract_requests"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_conversations_last_message_at"
      ON "conversations" ("last_message_at")
    `);

    await queryRunner.query(`
      CREATE TABLE "conversation_participants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "conversation_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "role" "conversation_participants_role_enum" NOT NULL,
        "last_read_at" TIMESTAMPTZ,
        CONSTRAINT "PK_conversation_participants" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_conversation_participants_conversation_user" UNIQUE ("conversation_id", "user_id"),
        CONSTRAINT "FK_conversation_participants_conversation" FOREIGN KEY ("conversation_id")
          REFERENCES "conversations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_conversation_participants_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_conversation_participants_conversation_id"
      ON "conversation_participants" ("conversation_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_conversation_participants_user_id"
      ON "conversation_participants" ("user_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "conversation_id" uuid NOT NULL,
        "sender_user_id" uuid NOT NULL,
        "content" text NOT NULL,
        "content_type" "messages_content_type_enum" NOT NULL DEFAULT 'TEXT',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_messages_conversation" FOREIGN KEY ("conversation_id")
          REFERENCES "conversations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_messages_sender_user" FOREIGN KEY ("sender_user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_messages_conversation_created_id_desc"
      ON "messages" ("conversation_id", "created_at" DESC, "id" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_messages_conversation_created_id_desc"`);
    await queryRunner.query(`DROP TABLE "messages"`);
    await queryRunner.query(`DROP INDEX "IDX_conversation_participants_user_id"`);
    await queryRunner.query(`DROP INDEX "IDX_conversation_participants_conversation_id"`);
    await queryRunner.query(`DROP TABLE "conversation_participants"`);
    await queryRunner.query(`DROP INDEX "IDX_conversations_last_message_at"`);
    await queryRunner.query(`DROP TABLE "conversations"`);
    await queryRunner.query(`DROP TYPE "messages_content_type_enum"`);
    await queryRunner.query(`DROP TYPE "conversation_participants_role_enum"`);
  }
}
