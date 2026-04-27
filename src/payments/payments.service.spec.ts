import { BadRequestException, ConflictException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { ContractRequestStatus } from '../common/enums/contract-request-status.enum';
import { PaymentStatus } from './enums/payment-status.enum';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const paymentRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
const contractRequestRepo = { findOne: jest.fn() };
const payoutRepo = { findOne: jest.fn() };
const userRepo = { findOne: jest.fn() };
const provider = {
  createPaymentIntent: jest.fn(),
  processCardPayment: jest.fn(),
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
