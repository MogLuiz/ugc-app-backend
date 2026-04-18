import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(ContractRequest)
    private readonly contractRequestRepo: Repository<ContractRequest>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(CreatorPayout)
    private readonly payoutRepo: Repository<CreatorPayout>,
    @Inject(PAYMENT_PROVIDER)
    private readonly provider: IPaymentProvider,
    private readonly configService: ConfigService,
    private readonly companyBalanceService: CompanyBalanceService,
    private readonly dataSource: DataSource,
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

    // 3. Verifica se já existe pagamento ativo
    const existing = await this.paymentRepo.findOne({
      where: { contractRequestId: contract.id },
    });
    if (existing) {
      if (existing.status === PaymentStatus.PAID) {
        throw new ConflictException('Este contrato já foi pago');
      }
      // Se a preferência ainda não foi criada (falha anterior), tenta novamente
      if (!existing.externalPreferenceId && existing.creditAppliedCents < existing.grossAmountCents) {
        const remainderCents = existing.grossAmountCents - existing.creditAppliedCents;
        const frontendBase = this.configService.get<string>('FRONTEND_BASE_URL') ?? '';
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
            pending: `${frontendBase}/pagamento/pendente?paymentId=${existing.id}`,
          },
        });
        existing.externalPreferenceId = intent.preferenceId;
        existing.externalReference = intent.externalReference;
        existing.status = PaymentStatus.PROCESSING;
        await this.paymentRepo.save(existing);
      }
      return this.buildInitiateResponse(existing);
    }

    // 4. Congela snapshot financeiro em centavos
    const grossAmountCents       = Math.round((contract.totalPrice      ?? 0) * 100);
    const platformFeeCents       = Math.round((contract.platformFee     ?? 0) * 100);
    const creatorBaseAmountCents = Math.round((contract.creatorBasePrice ?? 0) * 100);
    const transportFeeCents      = Math.round((contract.transportFee    ?? 0) * 100);
    const creatorNetAmountCents  = creatorBaseAmountCents + transportFeeCents;

    // 5. Verifica crédito disponível
    const balance = await this.companyBalanceService.getBalance(user.id);
    const creditToApply = Math.min(balance?.availableCents ?? 0, grossAmountCents);
    const remainderCents = grossAmountCents - creditToApply;

    // 6. Caso 100% coberto por crédito — confirmar diretamente sem MP
    if (remainderCents === 0 && creditToApply > 0) {
      return this.dataSource.transaction(async (manager) => {
        const payment = manager.getRepository(Payment).create({
          contractRequestId: contract.id,
          companyUserId: contract.companyUserId,
          creatorUserId: contract.creatorUserId,
          grossAmountCents,
          platformFeeCents,
          creatorBaseAmountCents,
          transportFeeCents,
          creatorNetAmountCents,
          currency: contract.currency,
          status: PaymentStatus.PAID,
          payoutStatus: PayoutStatus.PENDING,
          settlementStatus: SettlementStatus.HELD,
          creditAppliedCents: creditToApply,
          gatewayName: 'credit',
          paidAt: new Date(),
        });
        const savedPayment = await manager.save(Payment, payment);

        // Debitar crédito imediatamente (único fluxo sem webhook)
        await this.companyBalanceService.useCredit(user.id, creditToApply, savedPayment.id, manager);

        // Criar CreatorPayout
        const payout = manager.getRepository(CreatorPayout).create({
          paymentId: savedPayment.id,
          creatorUserId: contract.creatorUserId,
          amountCents: creatorNetAmountCents,
          currency: contract.currency,
          status: PayoutStatus.PENDING,
        });
        await manager.save(CreatorPayout, payout);

        // Transicionar contrato se PENDING_PAYMENT → PENDING_ACCEPTANCE
        if (contract.status === ContractRequestStatus.PENDING_PAYMENT) {
          await manager.update(ContractRequest, { id: contract.id }, {
            status: ContractRequestStatus.PENDING_ACCEPTANCE,
            paymentStatus: ContractPaymentStatus.PAID,
          });
        }

        this.logger.log(
          `Pagamento 100% crédito: paymentId=${savedPayment.id} credit=${creditToApply}`,
        );
        return this.buildInitiateResponse(savedPayment);
      });
    }

    // 7. Cria Payment (com crédito parcial ou sem crédito)
    const payment = this.paymentRepo.create({
      contractRequestId: contract.id,
      companyUserId: contract.companyUserId,
      creatorUserId: contract.creatorUserId,
      grossAmountCents,
      platformFeeCents,
      creatorBaseAmountCents,
      transportFeeCents,
      creatorNetAmountCents,
      currency: contract.currency,
      status: PaymentStatus.PENDING,
      payoutStatus: PayoutStatus.NOT_DUE,
      settlementStatus: SettlementStatus.HELD,
      creditAppliedCents: creditToApply,
      gatewayName: 'mercado_pago',
    });
    const savedPayment = await this.paymentRepo.save(payment);

    // 8. Cria intenção de pagamento no gateway pelo valor restante
    const frontendBase = this.configService.get<string>('FRONTEND_BASE_URL') ?? '';
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
        pending: `${frontendBase}/pagamento/pendente?paymentId=${savedPayment.id}`,
      },
    });

    savedPayment.externalPreferenceId = intent.preferenceId;
    savedPayment.externalReference = intent.externalReference;
    savedPayment.status = PaymentStatus.PROCESSING;
    await this.paymentRepo.save(savedPayment);

    this.logger.log(
      `Pagamento iniciado: paymentId=${savedPayment.id} gross=${grossAmountCents} credit=${creditToApply} remainder=${remainderCents}`,
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

    const result = await this.provider.processCardPayment({
      paymentId: payment.id,
      token: dto.token,
      paymentMethodId: dto.paymentMethodId,
      issuerId: dto.issuerId,
      installments: dto.installments,
      transactionAmount: dto.transactionAmount,
      payerEmail: dto.payerEmail,
      payerDocument: dto.payerDocument,
    });

    payment.externalPaymentId = result.externalPaymentId;
    payment.paymentMethod = result.paymentMethod;
    payment.installments = result.installments;
    payment.status = result.status;
    if (result.status === PaymentStatus.PAID && result.paidAt) {
      payment.paidAt = result.paidAt;
      payment.payoutStatus = PayoutStatus.PENDING;
    }

    await this.paymentRepo.save(payment);

    this.logger.log(
      `Pagamento processado: paymentId=${payment.id} status=${result.status} mpId=${result.externalPaymentId}`,
    );

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
    const remainderCents = payment.grossAmountCents - payment.creditAppliedCents;
    return {
      paymentId: payment.id,
      preferenceId: payment.externalPreferenceId ?? '',
      publicKey: mpProvider.getPublicKey?.() ?? '',
      grossAmountCents: payment.grossAmountCents,
      platformFeeCents: payment.platformFeeCents,
      creatorBaseAmountCents: payment.creatorBaseAmountCents,
      transportFeeCents: payment.transportFeeCents,
      creatorNetAmountCents: payment.creatorNetAmountCents,
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
      grossAmountCents: payment.grossAmountCents,
      platformFeeCents: payment.platformFeeCents,
      creatorBaseAmountCents: payment.creatorBaseAmountCents,
      transportFeeCents: payment.transportFeeCents,
      creatorNetAmountCents: payment.creatorNetAmountCents,
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
    };
  }
}
