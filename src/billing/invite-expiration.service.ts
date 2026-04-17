import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { ContractRequest } from '../contract-requests/entities/contract-request.entity';
import { ContractRequestStatus } from '../common/enums/contract-request-status.enum';
import { Payment } from '../payments/entities/payment.entity';
import { CompanyBalanceService } from './company-balance.service';
import { BalanceTransactionType } from './enums/balance-transaction-type.enum';

/**
 * Detecta convites expirados (PENDING_ACCEPTANCE + expiresAt < now)
 * e converte o pagamento em crédito para a empresa.
 *
 * Executa a cada hora. Idempotente: creditFromPayment é no-op se já processado.
 */
@Injectable()
export class InviteExpirationService {
  private readonly logger = new Logger(InviteExpirationService.name);

  constructor(
    @InjectRepository(ContractRequest)
    private readonly contractRequestRepo: Repository<ContractRequest>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    private readonly companyBalanceService: CompanyBalanceService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async processExpiredInvites(): Promise<void> {
    const now = new Date();

    const expired = await this.contractRequestRepo.find({
      where: {
        status: ContractRequestStatus.PENDING_ACCEPTANCE,
        expiresAt: LessThan(now),
      },
      select: ['id', 'companyUserId'],
    });

    if (expired.length === 0) return;

    this.logger.log(`Processando ${expired.length} convite(s) expirado(s)`);

    for (const contract of expired) {
      try {
        // Marcar contrato como EXPIRED
        await this.contractRequestRepo.update(
          { id: contract.id, status: ContractRequestStatus.PENDING_ACCEPTANCE },
          { status: ContractRequestStatus.EXPIRED },
        );

        // Converter pagamento em crédito (idempotente)
        const payment = await this.paymentRepo.findOne({
          where: { contractRequestId: contract.id },
        });

        if (payment) {
          await this.companyBalanceService.creditFromPayment(
            payment.id,
            BalanceTransactionType.CREDIT_FROM_EXPIRATION,
          );
        }

        this.logger.log(`Convite expirado processado: contractId=${contract.id}`);
      } catch (err) {
        this.logger.error(
          `Erro ao processar expiração do contrato ${contract.id}: ${String(err)}`,
        );
        // Continua para os próximos — não interrompe o loop
      }
    }
  }
}
