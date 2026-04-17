import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPendingPaymentAndExpiredStatuses1767000600000
  implements MigrationInterface
{
  name = 'AddPendingPaymentAndExpiredStatuses1767000600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Adicionar os novos valores ao enum de status do contract_requests
    await queryRunner.query(`
      ALTER TYPE "contract_requests_status_enum"
        ADD VALUE IF NOT EXISTS 'PENDING_PAYMENT'
    `);

    await queryRunner.query(`
      ALTER TYPE "contract_requests_status_enum"
        ADD VALUE IF NOT EXISTS 'EXPIRED'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL não suporta remover valores de enum diretamente.
    // Para reverter, seria necessário recriar o tipo — omitido intencionalmente
    // pois a remoção de valores de enum é destrutiva e requer downtime.
  }
}
