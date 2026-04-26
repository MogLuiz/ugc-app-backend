import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CompanyBalance } from './entities/company-balance.entity';
import { CompanyBalanceTransaction } from './entities/company-balance-transaction.entity';
import { RefundRequest } from './entities/refund-request.entity';
import { BalanceTransactionType } from './enums/balance-transaction-type.enum';
import { RefundRequestStatus } from './enums/refund-request-status.enum';
import { Payment } from '../payments/entities/payment.entity';
import { SettlementStatus } from '../payments/enums/settlement-status.enum';

@Injectable()
export class CompanyBalanceService {
  private readonly logger = new Logger(CompanyBalanceService.name);

  constructor(
    @InjectRepository(CompanyBalance)
    private readonly balanceRepo: Repository<CompanyBalance>,
    @InjectRepository(CompanyBalanceTransaction)
    private readonly txRepo: Repository<CompanyBalanceTransaction>,
    @InjectRepository(RefundRequest)
    private readonly refundRepo: Repository<RefundRequest>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Obtém o saldo atual da empresa. Retorna null se não existir ainda.
   */
  async getBalance(companyUserId: string): Promise<CompanyBalance | null> {
    return this.balanceRepo.findOne({ where: { companyUserId } });
  }

  /**
   * Obtém o saldo + histórico de transações da empresa.
   */
  async getBalanceWithHistory(companyUserId: string) {
    const balance = await this.balanceRepo.findOne({ where: { companyUserId } });
    const transactions = await this.txRepo.find({
      where: { companyUserId },
      order: { createdAt: 'DESC' },
      take: 50,
    });

    return {
      availableCents: balance?.availableCents ?? 0,
      maxCreditCents: balance?.maxCreditCents ?? 500000,
      currency: balance?.currency ?? 'BRL',
      transactions,
    };
  }

  /**
   * Converte um Payment em crédito para a empresa.
   *
   * Idempotência garantida por UPDATE condicional:
   *   UPDATE payments SET settlement_status = CONVERTED_TO_CREDIT
   *   WHERE id = :id AND settlement_status = 'HELD'
   * Se affected_rows = 0, outro processo já processou — skip silencioso.
   *
   * Limite antifraude: não creditá além de maxCreditCents.
   */
  async creditFromPayment(
    paymentId: string,
    type: BalanceTransactionType.CREDIT_FROM_REJECTION | BalanceTransactionType.CREDIT_FROM_EXPIRATION,
    managerOverride?: EntityManager,
  ): Promise<void> {
    const run = async (manager: EntityManager) => {
      // 1. Atualização condicional atômica — guard de idempotência
      const result = await manager
        .createQueryBuilder()
        .update(Payment)
        .set({ settlementStatus: SettlementStatus.CONVERTED_TO_CREDIT })
        .where('id = :id AND settlement_status = :held', {
          id: paymentId,
          held: SettlementStatus.HELD,
        })
        .execute();

      if (result.affected === 0) {
        this.logger.log(
          `creditFromPayment: skip idempotente — paymentId=${paymentId} já convertido ou não era HELD`,
        );
        return;
      }

      // 2. Busca payment para obter valores
      const payment = await manager.findOne(Payment, { where: { id: paymentId } });
      if (!payment) {
        this.logger.error(`creditFromPayment: payment não encontrado após update: ${paymentId}`);
        return;
      }

      const companyUserId = payment.companyUserId;
      const creditAmountCents = payment.companyTotalAmountCents;

      // 3. Upsert CompanyBalance com lock pessimista
      let balance = await manager
        .getRepository(CompanyBalance)
        .createQueryBuilder('b')
        .setLock('pessimistic_write')
        .where('b.company_user_id = :companyUserId', { companyUserId })
        .getOne();

      if (!balance) {
        balance = manager.getRepository(CompanyBalance).create({
          companyUserId,
          availableCents: 0,
          maxCreditCents: 500000,
          currency: payment.currency,
        });
      }

      // 4. Limite antifraude
      const effectiveCredit = Math.min(
        creditAmountCents,
        balance.maxCreditCents - balance.availableCents,
      );

      if (effectiveCredit <= 0) {
        this.logger.warn(
          `creditFromPayment: limite de crédito atingido para companyUserId=${companyUserId}. Nenhum crédito adicionado.`,
        );
        await manager.save(CompanyBalance, balance);
        // Salva transação com valor zero para auditoria
        const tx = manager.getRepository(CompanyBalanceTransaction).create({
          companyUserId,
          amountCents: 0,
          type,
          referenceType: 'payment',
          referenceId: paymentId,
          note: 'Limite de crédito atingido — nenhum crédito adicionado',
        });
        await manager.save(CompanyBalanceTransaction, tx);
        return;
      }

      if (effectiveCredit < creditAmountCents) {
        this.logger.warn(
          `creditFromPayment: crédito parcial aplicado (${effectiveCredit} de ${creditAmountCents}) por limite antifraude — companyUserId=${companyUserId}`,
        );
      }

      balance.availableCents += effectiveCredit;
      await manager.save(CompanyBalance, balance);

      // 5. Registra transação
      const tx = manager.getRepository(CompanyBalanceTransaction).create({
        companyUserId,
        amountCents: effectiveCredit,
        type,
        referenceType: 'payment',
        referenceId: paymentId,
        note: null,
      });
      await manager.save(CompanyBalanceTransaction, tx);

      this.logger.log(
        `Crédito gerado: companyUserId=${companyUserId} amount=${effectiveCredit} type=${type} paymentId=${paymentId}`,
      );
    };

    if (managerOverride) {
      await run(managerOverride);
    } else {
      await this.dataSource.transaction(run);
    }
  }

  /**
   * Debita crédito do saldo da empresa.
   *
   * Usa lock pessimista para evitar saldo negativo em concorrência.
   * Lança InsufficientBalanceException se saldo insuficiente.
   */
  async useCredit(
    companyUserId: string,
    amountCents: number,
    referenceId: string,
    manager: EntityManager,
  ): Promise<void> {
    const balance = await manager
      .getRepository(CompanyBalance)
      .createQueryBuilder('b')
      .setLock('pessimistic_write')
      .where('b.company_user_id = :companyUserId', { companyUserId })
      .getOne();

    if (!balance || balance.availableCents < amountCents) {
      throw new BadRequestException('Saldo insuficiente para aplicar crédito');
    }

    balance.availableCents -= amountCents;
    await manager.save(CompanyBalance, balance);

    const tx = manager.getRepository(CompanyBalanceTransaction).create({
      companyUserId,
      amountCents: -amountCents,
      type: BalanceTransactionType.CREDIT_USED,
      referenceType: 'payment',
      referenceId,
      note: null,
    });
    await manager.save(CompanyBalanceTransaction, tx);

    this.logger.log(
      `Crédito debitado: companyUserId=${companyUserId} amount=${amountCents} paymentId=${referenceId}`,
    );
  }

  /**
   * Verifica se o crédito de um pagamento já foi debitado (idempotência do webhook).
   */
  async isCreditAlreadyDebited(paymentId: string): Promise<boolean> {
    const count = await this.txRepo.count({
      where: {
        referenceType: 'payment',
        referenceId: paymentId,
        type: BalanceTransactionType.CREDIT_USED,
      },
    });
    return count > 0;
  }

  /**
   * Cria uma solicitação de reembolso.
   * Valida que o valor não excede o saldo disponível.
   */
  async requestRefund(
    companyUserId: string,
    amountCents: number,
    reason: string | null,
  ): Promise<RefundRequest> {
    if (amountCents <= 0) {
      throw new BadRequestException('O valor de reembolso deve ser maior que zero');
    }

    const balance = await this.balanceRepo.findOne({ where: { companyUserId } });
    const available = balance?.availableCents ?? 0;

    if (amountCents > available) {
      throw new BadRequestException(
        `Valor de reembolso (${amountCents}) excede o saldo disponível (${available})`,
      );
    }

    // Verifica se já existe solicitação pendente
    const pending = await this.refundRepo.count({
      where: { companyUserId, status: RefundRequestStatus.PENDING },
    });
    if (pending > 0) {
      throw new ConflictException('Já existe uma solicitação de reembolso pendente');
    }

    const refund = this.refundRepo.create({
      companyUserId,
      amountCents,
      status: RefundRequestStatus.PENDING,
      reason: reason ?? null,
    });

    return this.refundRepo.save(refund);
  }

  /**
   * Lista reembolsos da empresa autenticada.
   * companyUserId vem sempre do token — nunca aceito via client.
   */
  async listCompanyRefundRequests(companyUserId: string): Promise<RefundRequest[]> {
    return this.refundRepo.find({
      where: { companyUserId },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }

  /**
   * Lista solicitações de reembolso (admin).
   */
  async listRefundRequests(status?: RefundRequestStatus): Promise<RefundRequest[]> {
    return this.refundRepo.find({
      where: status ? { status } : undefined,
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Admin aprova uma solicitação de reembolso.
   */
  async approveRefund(refundRequestId: string, adminNote: string | null): Promise<RefundRequest> {
    const refund = await this.refundRepo.findOne({ where: { id: refundRequestId } });
    if (!refund) throw new NotFoundException('Solicitação de reembolso não encontrada');

    if (refund.status !== RefundRequestStatus.PENDING) {
      throw new BadRequestException(`Solicitação não está pendente (status: ${refund.status})`);
    }

    refund.status = RefundRequestStatus.APPROVED;
    refund.adminNote = adminNote ?? null;
    return this.refundRepo.save(refund);
  }

  /**
   * Admin rejeita uma solicitação de reembolso.
   */
  async rejectRefund(refundRequestId: string, adminNote: string): Promise<RefundRequest> {
    const refund = await this.refundRepo.findOne({ where: { id: refundRequestId } });
    if (!refund) throw new NotFoundException('Solicitação de reembolso não encontrada');

    if (refund.status !== RefundRequestStatus.PENDING) {
      throw new BadRequestException(`Solicitação não está pendente (status: ${refund.status})`);
    }

    refund.status = RefundRequestStatus.REJECTED;
    refund.adminNote = adminNote;
    refund.processedAt = new Date();
    return this.refundRepo.save(refund);
  }

  /**
   * Admin marca PIX externo como executado.
   * Debita o saldo e registra a transação de reembolso.
   */
  async markRefundPaid(
    refundRequestId: string,
    processedBy: string,
    adminNote: string | null,
  ): Promise<RefundRequest> {
    return this.dataSource.transaction(async (manager) => {
      const refund = await manager.findOne(RefundRequest, { where: { id: refundRequestId } });
      if (!refund) throw new NotFoundException('Solicitação de reembolso não encontrada');

      if (refund.status !== RefundRequestStatus.APPROVED) {
        throw new BadRequestException(`Solicitação deve estar aprovada para marcar como paga (status: ${refund.status})`);
      }

      // Lock pessimista no saldo
      const balance = await manager
        .getRepository(CompanyBalance)
        .createQueryBuilder('b')
        .setLock('pessimistic_write')
        .where('b.company_user_id = :companyUserId', { companyUserId: refund.companyUserId })
        .getOne();

      if (!balance || balance.availableCents < refund.amountCents) {
        throw new BadRequestException('Saldo insuficiente para processar reembolso');
      }

      balance.availableCents -= refund.amountCents;
      await manager.save(CompanyBalance, balance);

      const tx = manager.getRepository(CompanyBalanceTransaction).create({
        companyUserId: refund.companyUserId,
        amountCents: -refund.amountCents,
        type: BalanceTransactionType.REFUND_PROCESSED,
        referenceType: 'refund_request',
        referenceId: refund.id,
        note: adminNote ?? null,
      });
      await manager.save(CompanyBalanceTransaction, tx);

      refund.status = RefundRequestStatus.PAID;
      refund.processedBy = processedBy;
      refund.adminNote = adminNote ?? refund.adminNote;
      refund.processedAt = new Date();
      const saved = await manager.save(RefundRequest, refund);

      this.logger.log(
        `Reembolso pago: refundId=${refund.id} companyUserId=${refund.companyUserId} amount=${refund.amountCents} by=${processedBy}`,
      );

      return saved;
    });
  }
}
