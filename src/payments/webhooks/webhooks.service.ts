import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ContractRequest } from '../../contract-requests/entities/contract-request.entity';
import { ContractRequestStatus } from '../../common/enums/contract-request-status.enum';
import { PaymentStatus as ContractPaymentStatus } from '../../common/enums/payment-status.enum';
import { Payment } from '../entities/payment.entity';
import { CreatorPayout } from '../entities/creator-payout.entity';
import { PaymentProviderEvent } from '../entities/payment-provider-event.entity';
import { PaymentStatus } from '../enums/payment-status.enum';
import { PayoutStatus } from '../enums/payout-status.enum';
import {
  PAYMENT_PROVIDER,
  IPaymentProvider,
} from '../providers/payment-provider.interface';
import { CompanyBalanceService } from '../../billing/company-balance.service';
import {
  CONTRACT_VISIBLE_TO_CREATOR_EVENT,
  ContractVisibleToCreatorEvent,
} from '../../contract-requests/events/contract-visible-to-creator.event';
import {
  CREATOR_PAYOUT_UPDATED_EVENT,
  CreatorPayoutUpdatedEvent,
} from '../events/creator-payout-updated.event';

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === '23505'
  );
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(CreatorPayout)
    private readonly payoutRepo: Repository<CreatorPayout>,
    @InjectRepository(PaymentProviderEvent)
    private readonly eventRepo: Repository<PaymentProviderEvent>,
    @InjectRepository(ContractRequest)
    private readonly contractRequestRepo: Repository<ContractRequest>,
    @Inject(PAYMENT_PROVIDER)
    private readonly provider: IPaymentProvider,
    private readonly dataSource: DataSource,
    private readonly companyBalanceService: CompanyBalanceService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Processa um evento de webhook do Mercado Pago.
   *
   * Estratégia de idempotência:
   * - Sempre retorna sem lançar exceção para que o MP receba 200 OK
   * - Idempotência via UNIQUE(external_event_id)
   * - Eventos duplicados → processingStatus = 'ignored'
   * - Payment não encontrado → processingStatus = 'orphan' (reprocessável)
   * - Falha no processamento → processingStatus = 'failed' (reprocessável)
   *
   * Decisão: sempre retornar 200 para evitar retry storm do MP.
   * Compensado por processingStatus persistido + logs detalhados.
   */
  async processWebhook(payload: unknown, headers: Record<string, string>): Promise<void> {
    // 1. Valida assinatura
    if (!this.provider.validateWebhookSignature(payload, headers)) {
      this.logger.warn('Webhook recebido com assinatura inválida — ignorado');
      return;
    }

    // 2. Parseia o evento
    let parsed: Awaited<ReturnType<IPaymentProvider['parseWebhookEvent']>>;
    try {
      parsed = await this.provider.parseWebhookEvent(payload, headers);
    } catch (err) {
      this.logger.warn(`Falha ao parsear webhook: ${String(err)}`);
      return;
    }

    this.logger.log(
      `Webhook recebido: eventId=${parsed.externalEventId} type=${parsed.eventType} paymentId=${parsed.externalPaymentId}`,
    );

    // 3. Persiste o evento (idempotência via UNIQUE)
    const event = this.eventRepo.create({
      provider: 'mercado_pago',
      externalEventId: parsed.externalEventId,
      externalPaymentId: parsed.externalPaymentId,
      eventType: parsed.eventType,
      rawPayload: parsed.rawPayload,
      processingStatus: 'received',
    });

    try {
      await this.eventRepo.save(event);
    } catch (err) {
      if (isUniqueViolation(err)) {
        this.logger.log(
          `Evento duplicado ignorado: externalEventId=${parsed.externalEventId}`,
        );
        return;
      }
      this.logger.error(`Falha ao persistir evento: ${String(err)}`);
      return;
    }

    // 4. Processa o evento
    try {
      await this.applyPaymentUpdate(event.id, parsed.externalPaymentId);
      await this.eventRepo.update(event.id, {
        processingStatus: 'processed',
        processedAt: new Date(),
      });
      this.logger.log(`Evento processado: id=${event.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isOrphan = message.includes('orphan');
      await this.eventRepo.update(event.id, {
        processingStatus: isOrphan ? 'orphan' : 'failed',
        errorMessage: message,
      });
      this.logger.error(`Falha ao processar evento ${event.id}: ${message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Lógica interna
  // ---------------------------------------------------------------------------

  private async applyPaymentUpdate(
    eventId: string,
    externalPaymentId: string,
  ): Promise<void> {
    // 1. Busca status real no gateway
    const normalized = await this.provider.getPaymentStatus(externalPaymentId);

    // 2. Localiza o Payment — prioridade: externalReference (nosso id) → externalPaymentId
    const payment = await this.findPayment(
      normalized.externalReference,
      normalized.externalPaymentId,
    );

    if (!payment) {
      this.logger.warn(
        `Payment não encontrado para externalRef=${normalized.externalReference ?? 'null'} externalPaymentId=${externalPaymentId}. Evento marcado como orphan.`,
      );
      throw new Error(
        `orphan: Payment não encontrado (externalReference=${normalized.externalReference}, externalPaymentId=${externalPaymentId})`,
      );
    }

    this.logger.log(
      `Atualizando Payment id=${payment.id} status: ${payment.status} → ${normalized.status}`,
    );

    // Evita reprocessar um pagamento já concluído (ex: 'paid' não deve voltar para 'processing')
    if (!this.shouldUpdateStatus(payment.status, normalized.status)) {
      this.logger.log(
        `Transição de status ignorada: ${payment.status} → ${normalized.status}`,
      );
      return;
    }

    let visibleEvent: ContractVisibleToCreatorEvent | null = null;
    let payoutEvent: CreatorPayoutUpdatedEvent | null = null;

    await this.dataSource.transaction(async (manager) => {
      // 3. Atualiza Payment
      payment.status = normalized.status;
      payment.externalPaymentId = normalized.externalPaymentId;
      payment.paymentMethod = normalized.paymentMethod;
      payment.installments = normalized.installments;

      if (normalized.status === PaymentStatus.PAID) {
        payment.paidAt = normalized.paidAt ?? new Date();
        payment.payoutStatus = PayoutStatus.PENDING;

        // 4. Cria CreatorPayout
        const payout = manager.create(CreatorPayout, {
          paymentId: payment.id,
          creatorUserId: payment.creatorUserId,
          amountCents: payment.creatorPayoutAmountCents,
          currency: payment.currency,
          status: PayoutStatus.PENDING,
        });
        await manager.save(CreatorPayout, payout);
        payoutEvent = {
          payoutId: payout.id,
          creatorUserId: payout.creatorUserId,
          paymentId: payment.id,
          contractRequestId: payment.contractRequestId,
          status: payout.status,
          occurredAt: new Date(),
        };
        this.logger.log(
          `CreatorPayout criado: id=${payout.id} creatorUserId=${payout.creatorUserId} amount=${payout.amountCents}`,
        );

        // 5. Transição de contrato: PENDING_PAYMENT → PENDING_ACCEPTANCE
        const contract = await manager.findOne(ContractRequest, {
          where: { id: payment.contractRequestId },
        });
        if (contract?.status === ContractRequestStatus.PENDING_PAYMENT) {
          await manager.update(ContractRequest, { id: contract.id }, {
            status: ContractRequestStatus.PENDING_ACCEPTANCE,
            paymentStatus: ContractPaymentStatus.PAID,
          });
          visibleEvent = {
            contractRequestId: contract.id,
            creatorUserId: contract.creatorUserId,
            reason: 'direct_invite_received',
            paymentId: payment.id,
            occurredAt: new Date(),
          };
          this.logger.log(
            `Contrato ${contract.id} transitado: PENDING_PAYMENT → PENDING_ACCEPTANCE`,
          );
        } else {
          // Contratos já ACCEPTED (oferta aberta) — só atualiza paymentStatus
          await manager.update(
            ContractRequest,
            { id: payment.contractRequestId },
            { paymentStatus: ContractPaymentStatus.PAID },
          );
          if (contract?.openOfferId) {
            visibleEvent = {
              contractRequestId: contract.id,
              creatorUserId: contract.creatorUserId,
              reason: 'open_offer_selected',
              paymentId: payment.id,
              occurredAt: new Date(),
            };
          }
        }

        // 6. Débito de crédito parcial (com idempotência via CompanyBalanceTransaction)
        if (payment.creditAppliedCents > 0) {
          const alreadyDebited = await this.companyBalanceService.isCreditAlreadyDebited(payment.id);
          if (!alreadyDebited) {
            await this.companyBalanceService.useCredit(
              payment.companyUserId,
              payment.creditAppliedCents,
              payment.id,
              manager,
            );
            this.logger.log(
              `Crédito debitado no webhook: paymentId=${payment.id} amount=${payment.creditAppliedCents}`,
            );
          } else {
            this.logger.log(
              `Crédito já debitado anteriormente (idempotência): paymentId=${payment.id}`,
            );
          }
        }
      }

      await manager.save(Payment, payment);
    });

    if (visibleEvent) {
      this.eventEmitter.emit(CONTRACT_VISIBLE_TO_CREATOR_EVENT, visibleEvent);
    }
    if (payoutEvent) {
      this.eventEmitter.emit(CREATOR_PAYOUT_UPDATED_EVENT, payoutEvent);
    }
  }

  /**
   * Busca o Payment com a prioridade correta:
   * 1. externalReference (nosso payment.id) — mapeamento mais confiável
   * 2. externalPaymentId (ID do MP) — fallback
   */
  private async findPayment(
    externalReference: string | null,
    externalPaymentId: string,
  ): Promise<Payment | null> {
    if (externalReference) {
      const byRef = await this.paymentRepo.findOne({
        where: { externalReference },
      });
      if (byRef) return byRef;
    }

    return this.paymentRepo.findOne({ where: { externalPaymentId } });
  }

  /**
   * Determina se a transição de status é válida.
   * Evita regredir um pagamento já pago/cancelado.
   */
  private shouldUpdateStatus(current: PaymentStatus, next: PaymentStatus): boolean {
    const terminalStatuses: PaymentStatus[] = [
      PaymentStatus.PAID,
      PaymentStatus.REFUNDED,
      PaymentStatus.PARTIALLY_REFUNDED,
      PaymentStatus.CANCELED,
    ];

    if (terminalStatuses.includes(current) && current === next) return false;
    if (current === PaymentStatus.PAID && next === PaymentStatus.PROCESSING) return false;
    if (current === PaymentStatus.PAID && next === PaymentStatus.PENDING) return false;

    return true;
  }

  /** Reprocessa manualmente eventos com status 'orphan' ou 'failed'. */
  async reprocessEvent(eventId: string): Promise<void> {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) throw new Error(`Evento não encontrado: ${eventId}`);
    if (!event.externalPaymentId) throw new Error('Evento sem externalPaymentId');

    this.logger.log(`Reprocessando evento: id=${eventId}`);
    await this.applyPaymentUpdate(eventId, event.externalPaymentId);
    await this.eventRepo.update(eventId, {
      processingStatus: 'processed',
      processedAt: new Date(),
    });
  }
}
