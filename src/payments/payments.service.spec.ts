import { BadRequestException, ConflictException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { ContractRequestStatus } from '../common/enums/contract-request-status.enum';
import { PaymentStatus } from './enums/payment-status.enum';
import { PayoutStatus } from './enums/payout-status.enum';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const paymentRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
const contractRequestRepo = { findOne: jest.fn() };
const payoutRepo = { findOne: jest.fn() };
const userRepo = { findOne: jest.fn() };
const provider = {
  createPaymentIntent: jest.fn(),
  processCardPayment: jest.fn(),
  processPixPayment: jest.fn(),
  getPublicKey: jest.fn().mockReturnValue('pk_test'),
};
const configService = { get: jest.fn() };
const companyBalanceService = { getBalance: jest.fn(), isCreditAlreadyDebited: jest.fn() };
const dataSource = { transaction: jest.fn() };
const eventEmitter = { emit: jest.fn() };

const service = new PaymentsService(
  paymentRepo as never,
  contractRequestRepo as never,
  payoutRepo as never,
  userRepo as never,
  provider as never,
  configService as never,
  companyBalanceService as never,
  dataSource as never,
  eventEmitter as never,
);

const AUTH_USER = { authUserId: 'auth-company-1', email: 'company@test.com' };
const USER = { id: 'user-1', authUserId: AUTH_USER.authUserId };

const PAST = new Date('2000-01-01T00:00:00Z');
const FUTURE = new Date('2099-01-01T00:00:00Z');
const PIX_EXPIRES_FUTURE = new Date(Date.now() + 25 * 60 * 1000); // 25 min

const BASE_CONTRACT = {
  companyUserId: USER.id,
  creatorUserId: 'creator-1',
  serviceGrossAmountCents: 10000,
  platformFeeAmountCents: 2500,
  creatorNetServiceAmountCents: 7500,
  transportFeeAmountCents: 2000,
  creatorPayoutAmountCents: 9500,
  companyTotalAmountCents: 12000,
  currency: 'BRL',
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── KAN-66: Bloquear initiatePayment para contratos expirados ───────────────

describe('PaymentsService.initiatePayment — expiration guard (KAN-66)', () => {
  it('lança BadRequestException quando expiresAt está no passado', async () => {
    userRepo.findOne.mockResolvedValue(USER);
    contractRequestRepo.findOne.mockResolvedValue({
      ...BASE_CONTRACT,
      id: 'contract-1',
      status: ContractRequestStatus.PENDING_PAYMENT,
      expiresAt: PAST,
    });

    await expect(
      service.initiatePayment({ contractRequestId: 'contract-1' }, AUTH_USER),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.initiatePayment({ contractRequestId: 'contract-1' }, AUTH_USER),
    ).rejects.toThrow('expirou');
  });

  it('NÃO lança erro de expiração quando expiresAt é null (open offer)', async () => {
    userRepo.findOne.mockResolvedValue(USER);
    contractRequestRepo.findOne.mockResolvedValue({
      ...BASE_CONTRACT,
      id: 'contract-2',
      status: ContractRequestStatus.ACCEPTED,
      expiresAt: null,
    });
    paymentRepo.findOne.mockResolvedValue(null);
    companyBalanceService.getBalance.mockResolvedValue({ availableCents: 0 });
    configService.get.mockImplementation((key: string) => {
      if (key === 'FRONTEND_BASE_URL') return undefined;
      if (key === 'FRONTEND_URL') return 'https://app.ugclocal.com.br';
      return undefined;
    });
    provider.createPaymentIntent.mockResolvedValue({
      preferenceId: 'pref-123',
      externalReference: 'contract-2',
    });
    paymentRepo.create.mockReturnValue({ id: 'payment-1', creditAppliedCents: 0 });
    paymentRepo.save.mockResolvedValue({
      id: 'payment-1',
      companyTotalAmountCents: 12000,
      creditAppliedCents: 0,
      status: PaymentStatus.PROCESSING,
      externalPreferenceId: 'pref-123',
    });

    const result = await service.initiatePayment(
      { contractRequestId: 'contract-2' },
      AUTH_USER,
    );
    expect(result).toBeDefined();
    expect(result.paymentId).toBe('payment-1');
  });

  it('NÃO lança erro de expiração quando expiresAt é no futuro', async () => {
    userRepo.findOne.mockResolvedValue(USER);
    contractRequestRepo.findOne.mockResolvedValue({
      ...BASE_CONTRACT,
      id: 'contract-3',
      status: ContractRequestStatus.PENDING_PAYMENT,
      expiresAt: FUTURE,
    });
    paymentRepo.findOne.mockResolvedValue(null);
    companyBalanceService.getBalance.mockResolvedValue({ availableCents: 0 });
    configService.get.mockImplementation((key: string) => {
      if (key === 'FRONTEND_BASE_URL') return undefined;
      if (key === 'FRONTEND_URL') return 'https://app.ugclocal.com.br';
      return undefined;
    });
    provider.createPaymentIntent.mockResolvedValue({
      preferenceId: 'pref-456',
      externalReference: 'contract-3',
    });
    paymentRepo.create.mockReturnValue({ id: 'payment-2', creditAppliedCents: 0 });
    paymentRepo.save.mockResolvedValue({
      id: 'payment-2',
      companyTotalAmountCents: 12000,
      creditAppliedCents: 0,
      status: PaymentStatus.PROCESSING,
      externalPreferenceId: 'pref-456',
    });

    const result = await service.initiatePayment(
      { contractRequestId: 'contract-3' },
      AUTH_USER,
    );
    expect(result).toBeDefined();
  });

  it('lança BadRequestException (status inválido) antes de checar expiração', async () => {
    userRepo.findOne.mockResolvedValue(USER);
    contractRequestRepo.findOne.mockResolvedValue({
      ...BASE_CONTRACT,
      id: 'contract-4',
      status: ContractRequestStatus.COMPLETED,
      expiresAt: PAST,
    });

    await expect(
      service.initiatePayment({ contractRequestId: 'contract-4' }, AUTH_USER),
    ).rejects.toThrow(BadRequestException);
  });

  it('lança ConflictException quando pagamento já existe e está PAID', async () => {
    userRepo.findOne.mockResolvedValue(USER);
    contractRequestRepo.findOne.mockResolvedValue({
      ...BASE_CONTRACT,
      id: 'contract-5',
      status: ContractRequestStatus.PENDING_PAYMENT,
      expiresAt: FUTURE,
    });
    paymentRepo.findOne.mockResolvedValue({ status: PaymentStatus.PAID });

    await expect(
      service.initiatePayment({ contractRequestId: 'contract-5' }, AUTH_USER),
    ).rejects.toThrow(ConflictException);
  });
});

// ─── KAN-72/73: processPayment PIX ───────────────────────────────────────────

const BASE_PAYMENT = {
  id: 'payment-pix-1',
  companyUserId: USER.id,
  creatorUserId: 'creator-1',
  contractRequestId: 'contract-pix-1',
  companyTotalAmountCents: 10000,
  creatorPayoutAmountCents: 8000,
  creditAppliedCents: 0,
  currency: 'BRL',
  gatewayName: 'mercado_pago',
  payoutStatus: PayoutStatus.NOT_DUE,
  externalPaymentId: null,
  pixCopyPaste: null,
  pixQrCodeBase64: null,
  pixExpiresAt: null,
  paymentType: null,
};

const PIX_PROVIDER_RESULT = {
  status: PaymentStatus.PROCESSING,
  externalPaymentId: 'mp-pix-999',
  externalReference: 'payment-pix-1',
  paymentMethod: 'pix',
  pixCopyPaste: '00020101...',
  pixQrCodeBase64: 'iVBORw...',
  pixExpiresAt: PIX_EXPIRES_FUTURE,
  rawStatus: 'pending',
};

const PIX_DTO = {
  paymentMethodId: 'pix',
  token: null,
  transactionAmount: 100,
  payerEmail: 'company@test.com',
  payerDocument: { type: 'CPF', number: '12345678900' },
  issuerId: null,
};

describe('PaymentsService.processPayment — PIX (KAN-72)', () => {
  it('cria PIX no MP e persiste pixCopyPaste/pixExpiresAt', async () => {
    userRepo.findOne.mockResolvedValue(USER);
    paymentRepo.findOne.mockResolvedValue({
      ...BASE_PAYMENT,
      status: PaymentStatus.PROCESSING,
    });
    provider.processPixPayment.mockResolvedValue(PIX_PROVIDER_RESULT);
    paymentRepo.save.mockImplementation((p: typeof BASE_PAYMENT) => Promise.resolve(p));

    const result = await service.processPayment('payment-pix-1', PIX_DTO as never, AUTH_USER);

    expect(provider.processPixPayment).toHaveBeenCalledWith({
      paymentId: 'payment-pix-1',
      transactionAmount: 100,
      payerEmail: 'company@test.com',
      payerDocument: { type: 'CPF', number: '12345678900' },
    });
    expect(paymentRepo.save).toHaveBeenCalled();
    expect(result.pixCopyPaste).toBe('00020101...');
    expect(result.pixExpiresAt).toBe(PIX_EXPIRES_FUTURE);
    expect(result.paymentType).toBe('pix');
  });

  it('retorna PIX existente (idempotente) quando ativo e não expirado', async () => {
    userRepo.findOne.mockResolvedValue(USER);
    paymentRepo.findOne.mockResolvedValue({
      ...BASE_PAYMENT,
      status: PaymentStatus.PROCESSING,
      externalPaymentId: 'mp-pix-existing',
      pixCopyPaste: '00020101existing...',
      pixQrCodeBase64: 'base64existing',
      pixExpiresAt: PIX_EXPIRES_FUTURE,
      paymentType: 'pix',
    });

    const result = await service.processPayment('payment-pix-1', PIX_DTO as never, AUTH_USER);

    expect(provider.processPixPayment).not.toHaveBeenCalled();
    expect(result.pixCopyPaste).toBe('00020101existing...');
  });

  it('cria novo PIX quando anterior está expirado (retry KAN-73)', async () => {
    userRepo.findOne.mockResolvedValue(USER);
    paymentRepo.findOne.mockResolvedValue({
      ...BASE_PAYMENT,
      status: PaymentStatus.PROCESSING,
      externalPaymentId: 'mp-pix-old',
      pixCopyPaste: '00020101old...',
      pixExpiresAt: PAST, // expirado
      paymentType: 'pix',
    });
    provider.processPixPayment.mockResolvedValue(PIX_PROVIDER_RESULT);
    paymentRepo.save.mockImplementation((p: typeof BASE_PAYMENT) => Promise.resolve(p));

    const result = await service.processPayment('payment-pix-1', PIX_DTO as never, AUTH_USER);

    expect(provider.processPixPayment).toHaveBeenCalled();
    expect(result.pixCopyPaste).toBe('00020101...');
  });

  it('cria novo PIX quando anterior foi CANCELED (retry KAN-73)', async () => {
    userRepo.findOne.mockResolvedValue(USER);
    paymentRepo.findOne.mockResolvedValue({
      ...BASE_PAYMENT,
      status: PaymentStatus.CANCELED,
      externalPaymentId: 'mp-pix-old',
      pixCopyPaste: '00020101old...',
      pixExpiresAt: PAST,
      paymentType: 'pix',
    });
    provider.processPixPayment.mockResolvedValue(PIX_PROVIDER_RESULT);
    paymentRepo.save.mockImplementation((p: typeof BASE_PAYMENT) => Promise.resolve(p));

    await service.processPayment('payment-pix-1', PIX_DTO as never, AUTH_USER);

    expect(provider.processPixPayment).toHaveBeenCalled();
  });

  it('lança ConflictException se PIX já está PAID', async () => {
    userRepo.findOne.mockResolvedValue(USER);
    paymentRepo.findOne.mockResolvedValue({
      ...BASE_PAYMENT,
      status: PaymentStatus.PAID,
    });

    await expect(
      service.processPayment('payment-pix-1', PIX_DTO as never, AUTH_USER),
    ).rejects.toThrow(ConflictException);

    expect(provider.processPixPayment).not.toHaveBeenCalled();
  });
});

// ─── KAN-72: processPayment Cartão — sem regressão ───────────────────────────

describe('PaymentsService.processPayment — Cartão sem regressão (KAN-72)', () => {
  it('lança BadRequestException se token ausente para cartão', async () => {
    userRepo.findOne.mockResolvedValue(USER);
    paymentRepo.findOne.mockResolvedValue({
      ...BASE_PAYMENT,
      status: PaymentStatus.PROCESSING,
    });

    await expect(
      service.processPayment(
        'payment-pix-1',
        { paymentMethodId: 'visa', token: null, transactionAmount: 100, payerEmail: 'x@x.com', payerDocument: null, issuerId: null } as never,
        AUTH_USER,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(provider.processCardPayment).not.toHaveBeenCalled();
  });

  it('não chama processPixPayment para pagamento com cartão', async () => {
    userRepo.findOne.mockResolvedValue(USER);
    paymentRepo.findOne.mockResolvedValue({
      ...BASE_PAYMENT,
      status: PaymentStatus.PROCESSING,
    });
    provider.processCardPayment.mockResolvedValue({
      status: PaymentStatus.PROCESSING,
      externalPaymentId: 'mp-card-1',
      externalReference: null,
      paymentMethod: 'visa',
      installments: 1,
      paidAt: null,
      rawStatus: 'in_process',
    });
    paymentRepo.save.mockImplementation((p: typeof BASE_PAYMENT) => Promise.resolve(p));

    await service.processPayment(
      'payment-pix-1',
      { paymentMethodId: 'visa', token: 'tok_123', transactionAmount: 100, payerEmail: 'x@x.com', payerDocument: null, issuerId: null, installments: 1 } as never,
      AUTH_USER,
    );

    expect(provider.processPixPayment).not.toHaveBeenCalled();
    expect(provider.processCardPayment).toHaveBeenCalled();
  });
});
