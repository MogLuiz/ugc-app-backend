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
import { Repository } from 'typeorm';
import { ContractRequest } from '../contract-requests/entities/contract-request.entity';
import { ContractRequestStatus } from '../common/enums/contract-request-status.enum';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { User } from '../users/entities/user.entity';
import { Payment } from './entities/payment.entity';
import { PaymentStatus } from './enums/payment-status.enum';
import { PayoutStatus } from './enums/payout-status.enum';
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
    @Inject(PAYMENT_PROVIDER)
    private readonly provider: IPaymentProvider,
    private readonly configService: ConfigService,
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

    if (!contract) {
      throw new NotFoundException('Contrato não encontrado');
    }

    if (contract.status !== ContractRequestStatus.ACCEPTED) {
      throw new BadRequestException(
        'Pagamento só pode ser iniciado para contratos com status ACCEPTED',
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
      if (!existing.externalPreferenceId) {
        const frontendBase = this.configService.get<string>('FRONTEND_BASE_URL') ?? '';
        const intent = await this.provider.createPaymentIntent({
          paymentId: existing.id,
          amountCents: existing.grossAmountCents,
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
      // Retorna o payment existente para o frontend continuar do mesmo ponto
      return this.buildInitiateResponse(existing);
    }

    // 4. Congela snapshot financeiro em centavos
    // Fallback seguro para campos potencialmente nulos no ContractRequest
    const grossAmountCents       = Math.round((contract.totalPrice      ?? 0) * 100);
    const platformFeeCents       = Math.round((contract.platformFee     ?? 0) * 100);
    const creatorBaseAmountCents = Math.round((contract.creatorBasePrice ?? 0) * 100);
    const transportFeeCents      = Math.round((contract.transportFee    ?? 0) * 100);
    const creatorNetAmountCents  = creatorBaseAmountCents + transportFeeCents;

    // 5. Cria Payment
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
      gatewayName: 'mercado_pago',
    });
    const savedPayment = await this.paymentRepo.save(payment);

    // 6. Cria intenção de pagamento no gateway
    const frontendBase = this.configService.get<string>('FRONTEND_BASE_URL') ?? '';
    const payerEmail = authUser.email ?? '';
    const description = `Contrato UGC #${contract.id.slice(0, 8)}`;

    const intent = await this.provider.createPaymentIntent({
      paymentId: savedPayment.id,
      amountCents: grossAmountCents,
      currency: 'BRL',
      payerEmail,
      description,
      contractRequestId: contract.id,
      callbackUrls: {
        success: `${frontendBase}/pagamento/sucesso?paymentId=${savedPayment.id}`,
        failure: `${frontendBase}/pagamento/falhou?paymentId=${savedPayment.id}`,
        pending: `${frontendBase}/pagamento/pendente?paymentId=${savedPayment.id}`,
      },
    });

    // 7. Persiste os IDs do gateway
    savedPayment.externalPreferenceId = intent.preferenceId;
    savedPayment.externalReference = intent.externalReference;
    savedPayment.status = PaymentStatus.PROCESSING;
    await this.paymentRepo.save(savedPayment);

    this.logger.log(
      `Pagamento iniciado: paymentId=${savedPayment.id} preferenceId=${intent.preferenceId}`,
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
    };
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
      currency: payment.currency,
      status: payment.status,
      payoutStatus: payment.payoutStatus,
      gatewayName: payment.gatewayName,
      paymentMethod: payment.paymentMethod,
      installments: payment.installments,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }
}
