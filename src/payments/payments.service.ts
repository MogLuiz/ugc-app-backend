import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ContractRequest } from '../contract-requests/entities/contract-request.entity';
import { ContractRequestStatus } from '../common/enums/contract-request-status.enum';
import { PaymentStatus as ContractPaymentStatus } from '../common/enums/payment-status.enum';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { User } from '../users/entities/user.entity';
import { Payment } from './entities/payment.entity';
import { PaymentStatus } from './enums/payment-status.enum';
import { PayoutStatus } from './enums/payout-status.enum';
import { SettlementStatus } from './enums/settlement-status.enum';
import {
  PAYMENT_PROVIDER,
  IPaymentProvider,
} from './providers/payment-provider.interface';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { ProcessPaymentDto } from './dto/process-payment.dto';
import {
  InitiatePaymentResponseDto,
  PaymentResponseDto,
} from './dto/payment-response.dto';
import { CompanyBalanceService } from '../billing/company-balance.service';
import { CreatorPayout } from './entities/creator-payout.entity';
import {
  CONTRACT_VISIBLE_TO_CREATOR_EVENT,
  ContractVisibleToCreatorEvent,
} from '../contract-requests/events/contract-visible-to-creator.event';
import {
  CREATOR_PAYOUT_UPDATED_EVENT,
  CreatorPayoutUpdatedEvent,
} from './events/creator-payout-updated.event';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(ContractRequest)
    private readonly contractRequestRepo: Repository<ContractRequest>,
    @InjectRepository(CreatorPayout)
    private readonly payoutRepo: Repository<CreatorPayout>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @Inject(PAYMENT_PROVIDER)
    private readonly provider: IPaymentProvider,
    private readonly configService: ConfigService,
    private readonly companyBalanceService: CompanyBalanceService,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async initiatePayment(
    dto: InitiatePaymentDto,
    authUser: AuthUser,
  ): Promise<InitiatePaymentResponseDto> {
    // 1. Resolve user interno
    const user = await this.userRepo.findOne({ where: { authUserId: authUser.authUserId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    // 2. Valida o contrato
    const contract = await this.contractRequestRepo.findOne({
      where: { id: dto.contractRequestId, companyUserId: user.id },
    });
    if (!contract) throw new NotFoundException('Contrato não encontrado');

    const allowedStatuses: ContractRequestStatus[] = [
      ContractRequestStatus.PENDING_PAYMENT,
      ContractRequestStatus.ACCEPTED,
    ];
    if (!allowedStatuses.includes(contract.status)) {
      throw new BadRequestException(
        `Pagamento só pode ser iniciado para contratos com status PENDING_PAYMENT ou ACCEPTED (atual: ${contract.status})`,
      );
    }

    if (contract.expiresAt && contract.expiresAt <= new Date()) {
      throw new BadRequestException(
        'Este convite expirou e não pode mais ser pago. Um novo convite precisa ser enviado.',
      );
    }

    // 3. Verifica se já existe pagamento ativo
    const existing = await this.paymentRepo.findOne({
      where: { contractRequestId: contract.id },
    });
    if (existing) {
      if (existing.status === PaymentStatus.PAID) {
        throw new ConflictException('Este contrato já foi pago');
      }
      // Se a preferência ainda não foi criada (falha anterior), tenta novamente
      if (!existing.externalPreferenceId && existing.creditAppliedCents < existing.companyTotalAmountCents) {
        const remainderCents = existing.companyTotalAmountCents - existing.creditAppliedCents;
        const frontendBase =
          this.configService.get<string>('FRONTEND_BASE_URL') ||
          this.configService.get<string>('FRONTEND_URL') ||
          '';
        const intent = await this.provider.createPaymentIntent({
          paymentId: existing.id,
          amountCents: remainderCents,
          currency: 'BRL',
          payerEmail: authUser.email ?? '',
          description: `Contrato UGC #${contract.id.slice(0, 8)}`,
          contractRequestId: contract.id,
          callbackUrls: {
            success: `${frontendBase}/pagamento/sucesso?paymentId=${existing.id}`,
            failure: `${frontendBase}/pagamento/falhou?paymentId=${existing.id}`,
            pending: `${frontendBase}/pagamento/aguardando?paymentId=${existing.id}`,
          },
        });
        existing.externalPreferenceId = intent.preferenceId;
        existing.externalReference = intent.externalReference;
        existing.status = PaymentStatus.PROCESSING;
        await this.paymentRepo.save(existing);
      }
      return this.buildInitiateResponse(existing);
    }

    // 4. Copia snapshot financeiro do ContractRequest — sem recalcular.
    const serviceGrossAmountCents       = contract.serviceGrossAmountCents;
    const platformFeeAmountCents        = contract.platformFeeAmountCents;
    const creatorNetServiceAmountCents  = contract.creatorNetServiceAmountCents;
    const transportFeeAmountCents       = contract.transportFeeAmountCents;
    const creatorPayoutAmountCents      = contract.creatorPayoutAmountCents;
    const companyTotalAmountCents       = contract.companyTotalAmountCents;

    // 5. Verifica crédito disponível
    const balance = await this.companyBalanceService.getBalance(user.id);
    const creditToApply = Math.min(balance?.availableCents ?? 0, companyTotalAmountCents);
    const remainderCents = companyTotalAmountCents - creditToApply;

    const paymentBase = {
      contractRequestId: contract.id,
      companyUserId: contract.companyUserId,
      creatorUserId: contract.creatorUserId,
      serviceGrossAmountCents,
      platformFeeAmountCents,
      creatorNetServiceAmountCents,
      transportFeeAmountCents,
      creatorPayoutAmountCents,
      companyTotalAmountCents,
      currency: contract.currency,
    };

    // 6. Caso 100% coberto por crédito — confirmar diretamente sem MP
    if (remainderCents === 0 && creditToApply > 0) {
      const { response, visibleEvent, payoutEvent } = await this.dataSource.transaction(
        async (manager) => {
          const payment = manager.getRepository(Payment).create({
            ...paymentBase,
            status: PaymentStatus.PAID,
            payoutStatus: PayoutStatus.PENDING,
            settlementStatus: SettlementStatus.HELD,
            creditAppliedCents: creditToApply,
            gatewayName: 'credit',
            paidAt: new Date(),
          });
          const savedPayment = await manager.save(Payment, payment);

          // Debitar crédito imediatamente (único fluxo sem webhook)
          await this.companyBalanceService.useCredit(
            user.id,
            creditToApply,
            savedPayment.id,
            manager,
          );

          // Criar CreatorPayout
          const payout = manager.getRepository(CreatorPayout).create({
            paymentId: savedPayment.id,
            creatorUserId: contract.creatorUserId,
            amountCents: creatorPayoutAmountCents,
            currency: contract.currency,
            status: PayoutStatus.PENDING,
          });
          const savedPayout = await manager.save(CreatorPayout, payout);

          // Transicionar contrato se PENDING_PAYMENT → PENDING_ACCEPTANCE
          if (contract.status === ContractRequestStatus.PENDING_PAYMENT) {
            await manager.update(
              ContractRequest,
              { id: contract.id },
              {
                status: ContractRequestStatus.PENDING_ACCEPTANCE,
                paymentStatus: ContractPaymentStatus.PAID,
              },
            );
          }

          this.logger.log(
            `Pagamento 100% crédito: paymentId=${savedPayment.id} credit=${creditToApply}`,
          );
          return {
            response: this.buildInitiateResponse(savedPayment),
            visibleEvent: this.buildContractVisibleToCreatorEvent(
              contract,
              savedPayment.id,
            ),
            payoutEvent: {
              payoutId: savedPayout.id,
              creatorUserId: savedPayout.creatorUserId,
              paymentId: savedPayment.id,
              contractRequestId: contract.id,
              status: savedPayout.status,
              occurredAt: new Date(),
            } satisfies CreatorPayoutUpdatedEvent,
          };
        },
      );

      this.emitPostPaymentEvents(visibleEvent, payoutEvent);
      return response;
    }

    // 7. Cria Payment (com crédito parcial ou sem crédito)
    const payment = this.paymentRepo.create({
      ...paymentBase,
      status: PaymentStatus.PENDING,
      payoutStatus: PayoutStatus.NOT_DUE,
      settlementStatus: SettlementStatus.HELD,
      creditAppliedCents: creditToApply,
      gatewayName: 'mercado_pago',
    });
    const savedPayment = await this.paymentRepo.save(payment);

    // 8. Cria intenção de pagamento no gateway pelo valor restante
    const frontendBase =
      this.configService.get<string>('FRONTEND_BASE_URL') ||
      this.configService.get<string>('FRONTEND_URL') ||
      '';
    const intent = await this.provider.createPaymentIntent({
      paymentId: savedPayment.id,
      amountCents: remainderCents,
      currency: 'BRL',
      payerEmail: authUser.email ?? '',
      description: `Contrato UGC #${contract.id.slice(0, 8)}`,
      contractRequestId: contract.id,
      callbackUrls: {
        success: `${frontendBase}/pagamento/sucesso?paymentId=${savedPayment.id}`,
        failure: `${frontendBase}/pagamento/falhou?paymentId=${savedPayment.id}`,
        pending: `${frontendBase}/pagamento/aguardando?paymentId=${savedPayment.id}`,
      },
    });

    savedPayment.externalPreferenceId = intent.preferenceId;
    savedPayment.externalReference = intent.externalReference;
    savedPayment.status = PaymentStatus.PROCESSING;
    await this.paymentRepo.save(savedPayment);

    this.logger.log(
      `Pagamento iniciado: paymentId=${savedPayment.id} total=${companyTotalAmountCents} credit=${creditToApply} remainder=${remainderCents}`,
    );

    return this.buildInitiateResponse(savedPayment);
  }

  async processPayment(
    paymentId: string,
    dto: ProcessPaymentDto,
    authUser: AuthUser,
  ): Promise<PaymentResponseDto> {
    const user = await this.userRepo.findOne({ where: { authUserId: authUser.authUserId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId, companyUserId: user.id },
    });
    if (!payment) throw new NotFoundException('Pagamento não encontrado');

    if (payment.status === PaymentStatus.PAID) {
      throw new ConflictException('Este pagamento já foi processado');
    }

    // ── Branch PIX ──────────────────────────────────────────────────────────
    if (dto.paymentMethodId === 'pix') {
      return this.processPixBranch(payment, dto);
    }

    // ── Branch Cartão ────────────────────────────────────────────────────────
    if (!dto.token) {
      throw new BadRequestException('Token é obrigatório para pagamentos com cartão');
    }

    const result = await this.provider.processCardPayment({
      paymentId: payment.id,
      token: dto.token,
      paymentMethodId: dto.paymentMethodId,
      issuerId: dto.issuerId,
      installments: dto.installments ?? 1,
      transactionAmount: dto.transactionAmount,
      payerEmail: dto.payerEmail,
      payerDocument: dto.payerDocument,
    });

    payment.externalPaymentId = result.externalPaymentId;
    payment.paymentMethod = result.paymentMethod;
    payment.installments = result.installments;
    payment.status = result.status;
    payment.paymentType = 'card';

    if (result.status === PaymentStatus.PAID) {
      payment.paidAt = result.paidAt ?? new Date();
      payment.payoutStatus = PayoutStatus.PENDING;

      let visibleEvent: ContractVisibleToCreatorEvent | null = null;
      let payoutEvent: CreatorPayoutUpdatedEvent | null = null;

      await this.dataSource.transaction(async (manager) => {
        await manager.save(Payment, payment);

        const existingPayout = await manager.findOne(CreatorPayout, {
          where: { paymentId: payment.id },
        });
        if (!existingPayout) {
          const payout = manager.create(CreatorPayout, {
            paymentId: payment.id,
            creatorUserId: payment.creatorUserId,
            amountCents: payment.creatorPayoutAmountCents,
            currency: payment.currency,
            status: PayoutStatus.PENDING,
          });
          const savedPayout = await manager.save(CreatorPayout, payout);
          payoutEvent = {
            payoutId: savedPayout.id,
            creatorUserId: savedPayout.creatorUserId,
            paymentId: payment.id,
            contractRequestId: payment.contractRequestId,
            status: savedPayout.status,
            occurredAt: new Date(),
          };
          this.logger.log(
            `CreatorPayout criado (sync): id=${savedPayout.id} creatorUserId=${savedPayout.creatorUserId} amount=${savedPayout.amountCents}`,
          );
        }

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
            reason: contract.openOfferId ? 'open_offer_selected' : 'direct_invite_received',
            paymentId: payment.id,
            occurredAt: new Date(),
          };
          this.logger.log(
            `Contrato ${contract.id} transitado (sync): PENDING_PAYMENT → PENDING_ACCEPTANCE`,
          );
        } else if (contract) {
          await manager.update(ContractRequest, { id: contract.id }, {
            paymentStatus: ContractPaymentStatus.PAID,
          });
          if (contract.openOfferId) {
            visibleEvent = {
              contractRequestId: contract.id,
              creatorUserId: contract.creatorUserId,
              reason: 'open_offer_selected',
              paymentId: payment.id,
              occurredAt: new Date(),
            };
          }
        }

        if (payment.creditAppliedCents > 0) {
          const alreadyDebited = await this.companyBalanceService.isCreditAlreadyDebited(
            payment.id,
          );
          if (!alreadyDebited) {
            await this.companyBalanceService.useCredit(
              payment.companyUserId,
              payment.creditAppliedCents,
              payment.id,
              manager,
            );
          }
        }
      });

      this.emitPostPaymentEvents(visibleEvent, payoutEvent);
    } else {
      await this.paymentRepo.save(payment);
    }

    this.logger.log(
      `Cartão processado: paymentId=${payment.id} status=${result.status} mpId=${result.externalPaymentId}`,
    );

    return this.toResponseDto(payment);
  }

  /**
   * Cria (ou reutiliza) um pagamento PIX no Mercado Pago.
   *
   * Anti-duplicata: se já existe um PIX ativo (PROCESSING + não expirado),
   * retorna os dados existentes sem criar novo pagamento no MP.
   * Isso protege contra duplo-submit e double-click.
   *
   * Retry seguro: se o PIX anterior expirou ou falhou, cria novo pagamento
   * substituindo externalPaymentId. Qualquer webhook do PIX antigo é ignorado
   * pelo stale-ID check no WebhooksService.
   */
  private async processPixBranch(
    payment: Payment,
    dto: ProcessPaymentDto,
  ): Promise<PaymentResponseDto> {
    const now = new Date();

    // Anti-duplicata: PIX ativo não expirado → retornar idempotente
    if (
      payment.externalPaymentId &&
      payment.pixExpiresAt &&
      payment.pixExpiresAt > now &&
      (payment.status === PaymentStatus.PROCESSING || payment.status === PaymentStatus.PENDING)
    ) {
      this.logger.log(
        `PIX ativo retornado (idempotente): paymentId=${payment.id} expires=${payment.pixExpiresAt.toISOString()}`,
      );
      return this.toResponseDto(payment);
    }

    const result = await this.provider.processPixPayment({
      paymentId: payment.id,
      transactionAmount: dto.transactionAmount,
      payerEmail: dto.payerEmail,
      payerDocument: dto.payerDocument,
    });

    payment.externalPaymentId = result.externalPaymentId;
    payment.paymentMethod = result.paymentMethod;
    payment.paymentType = 'pix';
    payment.status = result.status;
    payment.pixCopyPaste = result.pixCopyPaste;
    payment.pixQrCodeBase64 = result.pixQrCodeBase64;
    payment.pixExpiresAt = result.pixExpiresAt;
    // Não incluir pixCopyPaste/pixQrCodeBase64 no log (dados de pagamento)
    this.logger.log(
      `PIX criado: paymentId=${payment.id} mpId=${result.externalPaymentId} expires=${result.pixExpiresAt?.toISOString() ?? 'null'}`,
    );

    await this.paymentRepo.save(payment);
    return this.toResponseDto(payment);
  }

  async getPaymentById(paymentId: string, authUser: AuthUser): Promise<PaymentResponseDto> {
    const user = await this.userRepo.findOne({ where: { authUserId: authUser.authUserId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const payment = await this.paymentRepo.findOne({
      where: [
        { id: paymentId, companyUserId: user.id },
        { id: paymentId, creatorUserId: user.id },
      ],
    });

    if (!payment) throw new NotFoundException('Pagamento não encontrado');

    return this.toResponseDto(payment);
  }

  // ---------------------------------------------------------------------------

  private buildInitiateResponse(payment: Payment): InitiatePaymentResponseDto {
    const mpProvider = this.provider as { getPublicKey?: () => string };
    const remainderCents = payment.companyTotalAmountCents - payment.creditAppliedCents;
    return {
      paymentId: payment.id,
      preferenceId: payment.externalPreferenceId ?? '',
      publicKey: mpProvider.getPublicKey?.() ?? '',
      serviceGrossAmountCents: payment.serviceGrossAmountCents,
      platformFeeAmountCents: payment.platformFeeAmountCents,
      creatorNetServiceAmountCents: payment.creatorNetServiceAmountCents,
      transportFeeAmountCents: payment.transportFeeAmountCents,
      creatorPayoutAmountCents: payment.creatorPayoutAmountCents,
      companyTotalAmountCents: payment.companyTotalAmountCents,
      currency: payment.currency,
      creditAppliedCents: payment.creditAppliedCents,
      remainderCents,
      alreadyPaid: payment.status === PaymentStatus.PAID,
    };
  }

  async getCompanyPayments(
    companyUserId: string,
    status?: PaymentStatus,
  ): Promise<PaymentResponseDto[]> {
    const payments = await this.paymentRepo.find({
      where: { companyUserId, ...(status ? { status } : {}) },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    return payments.map((p) => this.toResponseDto(p));
  }

  private toResponseDto(payment: Payment): PaymentResponseDto {
    return {
      id: payment.id,
      contractRequestId: payment.contractRequestId,
      serviceGrossAmountCents: payment.serviceGrossAmountCents,
      platformFeeAmountCents: payment.platformFeeAmountCents,
      creatorNetServiceAmountCents: payment.creatorNetServiceAmountCents,
      transportFeeAmountCents: payment.transportFeeAmountCents,
      creatorPayoutAmountCents: payment.creatorPayoutAmountCents,
      companyTotalAmountCents: payment.companyTotalAmountCents,
      creditAppliedCents: payment.creditAppliedCents,
      currency: payment.currency,
      status: payment.status,
      payoutStatus: payment.payoutStatus,
      settlementStatus: payment.settlementStatus ?? null,
      gatewayName: payment.gatewayName,
      paymentMethod: payment.paymentMethod,
      installments: payment.installments,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      paymentType: payment.paymentType ?? null,
      pixCopyPaste: payment.pixCopyPaste ?? null,
      pixQrCodeBase64: payment.pixQrCodeBase64 ?? null,
      pixExpiresAt: payment.pixExpiresAt ?? null,
    };
  }

  private buildContractVisibleToCreatorEvent(
    contract: ContractRequest,
    paymentId: string,
  ): ContractVisibleToCreatorEvent {
    return {
      contractRequestId: contract.id,
      creatorUserId: contract.creatorUserId,
      reason: contract.openOfferId
        ? 'open_offer_selected'
        : 'direct_invite_received',
      paymentId,
      occurredAt: new Date(),
    };
  }

  private emitPostPaymentEvents(
    visibleEvent: ContractVisibleToCreatorEvent | null,
    payoutEvent: CreatorPayoutUpdatedEvent | null,
  ): void {
    if (visibleEvent) {
      this.eventEmitter.emit(CONTRACT_VISIBLE_TO_CREATOR_EVENT, visibleEvent);
    }
    if (payoutEvent) {
      this.eventEmitter.emit(CREATOR_PAYOUT_UPDATED_EVENT, payoutEvent);
    }
  }
}
