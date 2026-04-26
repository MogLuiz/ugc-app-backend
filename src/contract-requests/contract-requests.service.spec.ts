import { DataSource } from 'typeorm';
import { ContractRequestsService } from './contract-requests.service';
import { DistanceService } from './services/distance.service';
import { PricingService } from './services/pricing.service';
import { TransportService } from './services/transport.service';
import { FinancialSnapshotService } from './services/financial-snapshot.service';
import { UserRole } from '../common/enums/user-role.enum';
import { JobMode } from '../common/enums/job-mode.enum';
import { PaymentStatus } from '../common/enums/payment-status.enum';
import { ContractRequestStatus } from '../common/enums/contract-request-status.enum';
import { LegalTermType } from '../common/enums/legal-term-type.enum';

// ─── FinancialSnapshotService ────────────────────────────────────────────────

describe('FinancialSnapshotService', () => {
  const svc = new FinancialSnapshotService();

  it('TC1: R$200 serviço, 25% taxa, R$20 transporte', () => {
    const snap = svc.buildContractSnapshot(20000, 2500, 2000);
    expect(snap.serviceGrossAmountCents).toBe(20000);
    expect(snap.platformFeeBpsSnapshot).toBe(2500);
    expect(snap.platformFeeAmountCents).toBe(5000);
    expect(snap.creatorNetServiceAmountCents).toBe(15000);
    expect(snap.transportFeeAmountCents).toBe(2000);
    expect(snap.creatorPayoutAmountCents).toBe(17000);
    expect(snap.companyTotalAmountCents).toBe(22000);
  });

  it('TC2: transporte não sofre taxa', () => {
    const snap = svc.buildContractSnapshot(20000, 2500, 5000);
    // Empresa paga gross + transporte, não gross + fee + transporte
    expect(snap.companyTotalAmountCents).toBe(20000 + 5000);
    expect(snap.companyTotalAmountCents).not.toBe(20000 + 5000 + 5000);
  });

  it('TC3: taxa zero', () => {
    const snap = svc.buildContractSnapshot(20000, 0, 2000);
    expect(snap.platformFeeAmountCents).toBe(0);
    expect(snap.creatorNetServiceAmountCents).toBe(20000);
    expect(snap.creatorPayoutAmountCents).toBe(22000);
    expect(snap.companyTotalAmountCents).toBe(22000);
  });

  it('TC4: arredondamento BPS — R$333 × 25%', () => {
    const snap = svc.buildContractSnapshot(33300, 2500, 0);
    expect(snap.platformFeeAmountCents).toBe(Math.round(33300 * 2500 / 10000));
    expect(snap.creatorNetServiceAmountCents).toBe(33300 - snap.platformFeeAmountCents);
  });

  it('TC5: invariante creatorPayout = creatorNetService + transport', () => {
    const snap = svc.buildContractSnapshot(50000, 2500, 3000);
    expect(snap.creatorPayoutAmountCents).toBe(snap.creatorNetServiceAmountCents + 3000);
  });

  it('TC6: invariante companyTotal = serviceGross + transport', () => {
    const snap = svc.buildContractSnapshot(50000, 2500, 3000);
    expect(snap.companyTotalAmountCents).toBe(50000 + 3000);
  });

  it('TC7: buildServiceSnapshot não inclui campos de transporte', () => {
    const snap = svc.buildServiceSnapshot(20000, 2500);
    expect(snap.serviceGrossAmountCents).toBe(20000);
    expect(snap.platformFeeAmountCents).toBe(5000);
    expect(snap.creatorNetServiceAmountCents).toBe(15000);
    expect((snap as any).transportFeeAmountCents).toBeUndefined();
    expect((snap as any).creatorPayoutAmountCents).toBeUndefined();
  });
});

// ─── PricingService (transporte apenas) ─────────────────────────────────────

describe('PricingService.buildTransport', () => {
  const svc = new PricingService(new TransportService());

  it('aplica mínimo quando distância × preço é menor', () => {
    const result = svc.buildTransport({ distanceKm: 2, transportPricePerKm: 5, transportMinimumFee: 20 });
    expect(result.transportFeeAmountCents).toBe(2000); // R$20 = mínimo
    expect(result.transportIsMinimumApplied).toBe(true);
  });

  it('usa distância quando maior que mínimo', () => {
    const result = svc.buildTransport({ distanceKm: 10, transportPricePerKm: 3, transportMinimumFee: 20 });
    expect(result.transportFeeAmountCents).toBe(3000); // R$30 = 10×3
    expect(result.transportIsMinimumApplied).toBe(false);
  });

  it('retorna valores em centavos (inteiros)', () => {
    const result = svc.buildTransport({ distanceKm: 5, transportPricePerKm: 2.5, transportMinimumFee: 10 });
    expect(Number.isInteger(result.transportFeeAmountCents)).toBe(true);
  });
});

// ─── DistanceService ─────────────────────────────────────────────────────────

describe('DistanceService', () => {
  it('calcula distância arredondada em km', () => {
    const service = new DistanceService();
    const result = service.calculateDistanceKm(
      { lat: -23.55052, lng: -46.633308 },
      { lat: -23.561684, lng: -46.625378 },
    );
    expect(result).toBeGreaterThan(1);
    expect(result).toBeLessThan(2);
  });
});

// ─── ContractRequestsService ─────────────────────────────────────────────────

describe('ContractRequestsService', () => {
  function createService(overrides: Record<string, unknown> = {}) {
    const companyUser = {
      id: 'company-1',
      authUserId: 'auth-company',
      role: UserRole.COMPANY,
      profile: { name: 'Empresa X' },
    };
    const creatorUser: any = {
      id: 'creator-1',
      authUserId: 'auth-creator',
      role: UserRole.CREATOR,
      profile: {
        name: 'Creator Teste',
        photoUrl: 'https://cdn.test/avatar.png',
        latitude: -23.55052,
        longitude: -46.633308,
        hasValidCoordinates: true,
      },
      creatorProfile: { autoAcceptBookings: true, serviceRadiusKm: 20 },
    };
    const userRepository = { findOne: jest.fn().mockResolvedValue(creatorUser) };
    const manager = { getRepository: jest.fn().mockReturnValue(userRepository) };
    const dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => unknown) => cb(manager)),
      getRepository: jest.fn().mockReturnValue(userRepository),
    } as unknown as DataSource;
    const usersRepository = {
      findByAuthUserIdWithProfiles: jest.fn().mockResolvedValue(companyUser),
    };
    const jobTypesService = {
      getActiveByIdOrThrow: jest.fn().mockResolvedValue({
        id: 'job-type-1',
        mode: JobMode.PRESENTIAL,
        durationMinutes: 120,
        price: 250,
        minimumOfferedAmount: 0,
      }),
    };
    const creatorJobTypesRepository = {
      findActiveByCreatorAndJobType: jest.fn().mockResolvedValue({ basePriceCents: 25000 }),
    };
    const platformSettingsService = {
      getCurrent: jest.fn().mockResolvedValue({
        transportPricePerKm: 3.5,
        transportMinimumFee: 15,
        platformFeeBps: 2500,
      }),
    };
    const geocodingService = {
      geocodeAddress: jest.fn().mockResolvedValue({
        lat: -23.561684,
        lng: -46.625378,
        normalizedAddress: 'Av. Paulista, 1000, São Paulo, SP',
      }),
    };
    const contractRequestsRepository = {
      createAndSave: jest.fn().mockImplementation(async (payload) => ({
        id: 'contract-1',
        ...payload,
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
        updatedAt: new Date('2026-03-20T10:00:00.000Z'),
      })),
      listByCompany: jest.fn(),
      listPendingByCreator: jest.fn(),
      findByIdForUpdate: jest.fn(),
      save: jest.fn(),
    };
    const distanceService = {
      calculateDistanceKm: jest.fn().mockReturnValue(10),
      buildSummary: jest.fn().mockImplementation((km, effectiveServiceRadiusKm) => ({
        km,
        formatted: km == null ? null : `${km.toFixed(1)} km`,
        isWithinServiceRadius:
          km == null || effectiveServiceRadiusKm == null ? null : km <= effectiveServiceRadiusKm,
        effectiveServiceRadiusKm: effectiveServiceRadiusKm ?? null,
      })),
    };
    const pricingService = new PricingService(new TransportService());
    const financialSnapshotService = new FinancialSnapshotService();
    const schedulingConflictService = { hasConflicts: jest.fn().mockResolvedValue(false) };
    const conversationsService = {
      ensureConversationForContractRequest: jest.fn().mockResolvedValue(undefined),
    };
    const eventEmitter = { emit: jest.fn() };
    const configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'DEFAULT_CREATOR_SERVICE_RADIUS_KM') return 30;
        if (key === 'GEOCODING_TIMEOUT_MS') return 50;
        if (key === 'TRANSPORT_PRICE_PER_KM') return 2;
        if (key === 'MIN_TRANSPORT_PRICE') return 20;
        return undefined;
      }),
    };
    const companyBalanceService = { getBalance: jest.fn().mockResolvedValue(null) };
    const legalService = {
      resolveCurrentAcceptance: jest.fn().mockResolvedValue({
        id: 'legal-1',
        termVersion: '2026-04-25',
        acceptedAt: new Date('2026-04-25T12:00:00.000Z'),
      }),
    };

    const service = new ContractRequestsService(
      configService as never,
      dataSource,
      usersRepository as never,
      jobTypesService as never,
      creatorJobTypesRepository as never,
      platformSettingsService as never,
      geocodingService as never,
      contractRequestsRepository as never,
      distanceService as never,
      pricingService as never,
      financialSnapshotService as never,
      schedulingConflictService as never,
      conversationsService as never,
      eventEmitter as never,
      companyBalanceService as never,
      legalService as never,
    );

    return { service, mocks: { contractRequestsRepository, platformSettingsService, legalService } };
  }

  const baseDto = {
    creatorId: 'creator-1',
    jobTypeId: 'job-type-1',
    description: 'Teste',
    startsAt: '2026-06-01T10:00:00.000Z',
    durationMinutes: 120,
    jobAddress: 'Av. Paulista, 1000',
    legalAcceptance: {
      termType: LegalTermType.COMPANY_HIRING,
      termVersion: '2026-04-25',
      accepted: true,
    },
  };

  it('cria contrato com PENDING_PAYMENT', async () => {
    const { service } = createService();
    const result = await service.create({ authUserId: 'auth-company' }, baseDto);
    expect(result.status).toBe(ContractRequestStatus.PENDING_PAYMENT);
    expect(result.paymentStatus).toBe(PaymentStatus.PENDING);
  });

  it('TC8: snapshot financeiro usa platformFeeBps do PlatformSettings', async () => {
    const { service, mocks } = createService();
    // creator.basePriceCents = 25000, platformFeeBps = 2500
    await service.create({ authUserId: 'auth-company' }, baseDto);

    const saved = mocks.contractRequestsRepository.createAndSave.mock.calls[0][0];
    expect(saved.serviceGrossAmountCents).toBe(25000);
    expect(saved.platformFeeBpsSnapshot).toBe(2500);
    expect(saved.platformFeeAmountCents).toBe(6250); // 25000 * 25% = 6250
    expect(saved.creatorNetServiceAmountCents).toBe(18750);
    expect(saved.companyTotalAmountCents).toBe(saved.serviceGrossAmountCents + saved.transportFeeAmountCents);
  });

  it('TC9: creator payload não expõe taxa nem valor bruto', async () => {
    const { service, mocks } = createService();
    const contract: any = {
      id: 'c1',
      companyUserId: 'company-1',
      creatorUserId: 'creator-1',
      mode: JobMode.PRESENTIAL,
      description: 'desc',
      status: ContractRequestStatus.PENDING_ACCEPTANCE,
      paymentStatus: PaymentStatus.PENDING,
      currency: 'BRL',
      termsAcceptedAt: new Date(),
      startsAt: new Date(),
      durationMinutes: 120,
      jobAddress: 'Av. Paulista',
      jobFormattedAddress: null,
      jobLatitude: -23.55,
      jobLongitude: -46.63,
      distanceKm: 10,
      effectiveServiceRadiusKmUsed: 20,
      serviceGrossAmountCents: 25000,
      platformFeeBpsSnapshot: 2500,
      platformFeeAmountCents: 6250,
      creatorNetServiceAmountCents: 18750,
      transportFeeAmountCents: 2000,
      creatorPayoutAmountCents: 20750,
      companyTotalAmountCents: 27000,
      transportPricePerKmUsed: 3.5,
      transportMinimumFeeUsed: 15,
      creatorNameSnapshot: 'Creator',
      creatorAvatarUrlSnapshot: null,
      rejectionReason: null,
      openOfferId: null,
      expiresAt: new Date(Date.now() + 86400000),
      completedAt: null,
      creatorConfirmedCompletedAt: null,
      companyConfirmedCompletedAt: null,
      contestDeadlineAt: null,
      completionDisputeReason: null,
      completionDisputedAt: null,
      completionDisputedByUserId: null,
      completionPhaseEnteredAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      jobTypeId: 'job-type-1',
      companyUser: null,
    };

    const payload = (service as any).buildCreatorOfferPayload(contract);
    expect(payload).not.toHaveProperty('platformFeeAmountCents');
    expect(payload).not.toHaveProperty('platformFeeBpsSnapshot');
    expect(payload).not.toHaveProperty('serviceGrossAmountCents');
    expect(payload.creatorNetServiceAmountCents).toBe(18750);
    expect(payload.transportFeeAmountCents).toBe(2000);
    expect(payload.creatorPayoutAmountCents).toBe(20750);
    expect(payload.totalAmount).toBe(20750);
  });
});
