import { DataSource } from 'typeorm';
import { ContractRequestsService } from './contract-requests.service';
import { DistanceService } from './services/distance.service';
import { PricingService } from './services/pricing.service';
import { TransportService } from './services/transport.service';
import { UserRole } from '../common/enums/user-role.enum';
import { JobMode } from '../common/enums/job-mode.enum';
import { PaymentStatus } from '../common/enums/payment-status.enum';
import { ContractRequestStatus } from '../common/enums/contract-request-status.enum';

// ─── PricingService ──────────────────────────────────────────────────────────

describe('PricingService', () => {
  const pricingService = new PricingService(new TransportService());

  it('calculates transport fee with minimum floor (platformFeeRate = 0)', () => {
    const result = pricingService.buildPricing({
      creatorBasePrice: 200,
      distanceKm: 2,
      transportPricePerKm: 5,
      transportMinimumFee: 20,
    });

    expect(result.transportFee).toBe(20);
    expect(result.transport.isMinimumApplied).toBe(true);
    expect(result.platformFee).toBe(0);
    expect(result.platformFeeRate).toBe(0);
    // totalPrice = creatorBasePrice + transportFee (platformFee não somado à conta da empresa)
    expect(result.totalPrice).toBe(220);
    expect(result.totalAmount).toBe(220);
    expect(result.currency).toBe('BRL');
  });

  it('calculates platformFee correctly when rate is set', () => {
    const result = pricingService.buildPricing({
      creatorBasePrice: 200,
      distanceKm: 10,
      transportPricePerKm: 3,
      transportMinimumFee: 20,
      platformFeeRate: 0.15,
    });

    // platformFee = 200 * 0.15 = 30 (desconto interno do creator)
    expect(result.platformFee).toBe(30);
    expect(result.platformFeeRate).toBe(0.15);
    // transportFee = 10 * 3 = 30
    expect(result.transportFee).toBe(30);
    // totalPrice = creatorBasePrice + transportFee (empresa paga, platformFee não entra)
    expect(result.totalPrice).toBe(230);
    expect(result.totalAmount).toBe(230);
  });

  it('regression: direct hire with rate=0 produces same totalPrice as before refactor', () => {
    const result = pricingService.buildPricing({
      creatorBasePrice: 500,
      distanceKm: 15,
      transportPricePerKm: 2,
      transportMinimumFee: 20,
    });

    // Comportamento idêntico ao pré-refactor: totalPrice = base + transport
    expect(result.platformFee).toBe(0);
    expect(result.totalPrice).toBe(result.creatorBasePrice + result.transportFee);
  });

  it('rounds platformFee to 2 decimal places', () => {
    const result = pricingService.buildPricing({
      creatorBasePrice: 100,
      distanceKm: 5,
      transportPricePerKm: 2,
      transportMinimumFee: 10,
      platformFeeRate: 0.1333,
    });

    // 100 * 0.1333 = 13.33 (rounded)
    expect(result.platformFee).toBe(13.33);
  });
});

// ─── DistanceService ──────────────────────────────────────────────────────────

describe('DistanceService', () => {
  it('calculates rounded distance in km', () => {
    const service = new DistanceService();

    const result = service.calculateDistanceKm(
      { lat: -23.55052, lng: -46.633308 },
      { lat: -23.561684, lng: -46.625378 },
    );

    expect(result).toBeGreaterThan(1);
    expect(result).toBeLessThan(2);
  });
});

// ─── ContractRequestsService ──────────────────────────────────────────────────

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
      creatorProfile: {
        autoAcceptBookings: true,
        serviceRadiusKm: 20,
      },
    };
    const userRepository = {
      findOne: jest.fn().mockResolvedValue(creatorUser),
    };
    const manager = {
      getRepository: jest.fn().mockReturnValue(userRepository),
    };
    const dataSource = {
      transaction: jest.fn(async (callback: (entityManager: unknown) => unknown) =>
        callback(manager),
      ),
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
        platformFeeRate: 0,
        minimumOfferedAmount: 0,
      }),
    };
    const creatorJobTypesRepository = {
      findActiveByCreatorAndJobType: jest.fn().mockResolvedValue({
        basePriceCents: 25000,
      }),
    };
    const platformSettingsService = {
      getCurrent: jest.fn().mockResolvedValue({
        transportPricePerKm: 3.5,
        transportMinimumFee: 15,
      }),
    };
    const geocodingService = {
      geocodeAddress: jest.fn().mockResolvedValue({
        lat: -23.561684,
        lng: -46.625378,
        normalizedAddress: 'Av. Paulista, 1000, Sao Paulo, SP',
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
          km == null || effectiveServiceRadiusKm == null
            ? null
            : km <= effectiveServiceRadiusKm,
        effectiveServiceRadiusKm: effectiveServiceRadiusKm ?? null,
      })),
    };
    const pricingService = new PricingService(new TransportService());
    const schedulingConflictService = {
      hasConflicts: jest.fn().mockResolvedValue(false),
      ensureNoConflicts: jest.fn().mockResolvedValue(undefined),
    };
    const conversationsService = {
      ensureConversationForContractRequest: jest.fn().mockResolvedValue(undefined),
    };
    const eventEmitter = {
      emit: jest.fn(),
    };
    const configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'DEFAULT_CREATOR_SERVICE_RADIUS_KM') return 30;
        if (key === 'GEOCODING_TIMEOUT_MS') return 50;
        if (key === 'TRANSPORT_PRICE_PER_KM') return 2;
        if (key === 'MIN_TRANSPORT_PRICE') return 20;
        return undefined;
      }),
    };

    const companyBalanceService = {
      getBalance: jest.fn().mockResolvedValue(null),
      creditFromPayment: jest.fn().mockResolvedValue(undefined),
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
      schedulingConflictService as never,
      conversationsService as never,
      eventEmitter as never,
      companyBalanceService as never,
    );

    return {
      service,
      manager,
      mocks: {
        companyUser,
        creatorUser,
        dataSource,
        usersRepository,
        jobTypesService,
        creatorJobTypesRepository,
        platformSettingsService,
        geocodingService,
        contractRequestsRepository,
        distanceService,
        pricingService,
        schedulingConflictService,
        conversationsService,
        eventEmitter,
        configService,
      },
    };
  }

  // ─── Contratação direta (regressão) ────────────────────────────────────────

  it('creates contract request with PENDING_PAYMENT even when creator has auto_accept_bookings', async () => {
    const { service, mocks } = createService();

    const result = await service.create(
      { authUserId: 'auth-company' },
      {
        creatorId: 'creator-1',
        jobTypeId: 'job-type-1',
        description: 'Teste',
        startsAt: '2026-06-01T10:00:00.000Z',
        durationMinutes: 120,
        jobAddress: 'Av. Paulista, 1000',
        termsAccepted: true,
      },
    );

    expect(result.status).toBe(ContractRequestStatus.PENDING_PAYMENT);
    expect(mocks.conversationsService.ensureConversationForContractRequest).not.toHaveBeenCalled();
  });

  it('regression: direct hire platformFeeRateSnapshot = 0 when jobType.platformFeeRate = 0', async () => {
    const { service, mocks } = createService();

    await service.create(
      { authUserId: 'auth-company' },
      {
        creatorId: 'creator-1',
        jobTypeId: 'job-type-1',
        description: 'Regressão pricing',
        startsAt: '2026-06-01T10:00:00.000Z',
        durationMinutes: 120,
        jobAddress: 'Av. Paulista, 1000',
        termsAccepted: true,
      },
    );

    const savedPayload = mocks.contractRequestsRepository.createAndSave.mock.calls[0][0];
    expect(savedPayload.platformFeeRateSnapshot).toBe(0);
    expect(savedPayload.openOfferId).toBeNull();
    expect(savedPayload.platformFee).toBe(0);
    // totalPrice = creatorBasePrice + transportFee
    expect(savedPayload.totalPrice).toBe(savedPayload.creatorBasePrice + savedPayload.transportFee);
  });

  it('regression: direct hire with platformFeeRate > 0 snapshots rate but does not add fee to totalPrice', async () => {
    const { service, mocks } = createService();

    mocks.jobTypesService.getActiveByIdOrThrow.mockResolvedValue({
      id: 'job-type-1',
      mode: JobMode.PRESENTIAL,
      durationMinutes: 120,
      platformFeeRate: 0.15,
      minimumOfferedAmount: 0,
    });

    await service.create(
      { authUserId: 'auth-company' },
      {
        creatorId: 'creator-1',
        jobTypeId: 'job-type-1',
        description: 'Com taxa',
        startsAt: '2026-06-01T10:00:00.000Z',
        durationMinutes: 120,
        jobAddress: 'Av. Paulista, 1000',
        termsAccepted: true,
      },
    );

    const saved = mocks.contractRequestsRepository.createAndSave.mock.calls[0][0];
    expect(saved.platformFeeRateSnapshot).toBe(0.15);
    expect(saved.platformFee).toBeGreaterThan(0);
    // Empresa paga base + transport (sem adicionar platformFee)
    expect(saved.totalPrice).toBe(saved.creatorBasePrice + saved.transportFee);
    expect(saved.totalPrice).not.toBe(saved.creatorBasePrice + saved.transportFee + saved.platformFee);
  });

  // ─── createFromOpenOfferSelection ─────────────────────────────────────────

  it('createFromOpenOfferSelection: creates ACCEPTED contract and conversation within manager', async () => {
    const { service, mocks } = createService();
    const fakeManager = { getRepository: jest.fn() } as any;

    mocks.contractRequestsRepository.createAndSave.mockResolvedValue({
      id: 'cr-from-offer',
      status: ContractRequestStatus.ACCEPTED,
      companyUserId: 'company-1',
    });

    const pricing = new PricingService(new TransportService()).buildPricing({
      creatorBasePrice: 300,
      distanceKm: 8,
      transportPricePerKm: 3,
      transportMinimumFee: 20,
      platformFeeRate: 0.10,
    });

    const result = await service.createFromOpenOfferSelection(
      {
        companyUserId: 'company-1',
        creatorUser: mocks.creatorUser,
        jobTypeId: 'job-type-1',
        offeredAmount: 300,
        openOfferId: 'offer-123',
        startsAt: new Date('2026-07-01T09:00:00Z'),
        durationMinutes: 120,
        jobAddress: 'Rua X, 100',
        jobFormattedAddress: 'Rua X, 100, SP',
        jobLatitude: -23.5,
        jobLongitude: -46.6,
        distanceKm: 8,
        effectiveServiceRadiusKm: 30,
        platformFeeRateSnapshot: 0.10,
        pricing,
      },
      fakeManager,
    );

    expect(result.id).toBe('cr-from-offer');

    // Deve ter sido salvo com ACCEPTED e openOfferId corretos
    const savedPayload = mocks.contractRequestsRepository.createAndSave.mock.calls[0][0];
    expect(savedPayload.status).toBe(ContractRequestStatus.ACCEPTED);
    expect(savedPayload.openOfferId).toBe('offer-123');
    expect(savedPayload.platformFeeRateSnapshot).toBe(0.10);
    expect(savedPayload.openOfferId).not.toBeNull();

    // Conversa deve ter sido criada com o mesmo manager
    expect(mocks.conversationsService.ensureConversationForContractRequest).toHaveBeenCalledWith(
      'cr-from-offer',
      'company-1',
      fakeManager,
    );
  });

  it('createFromOpenOfferSelection: totalPrice = offeredAmount + transportFee (not + platformFee)', async () => {
    const { service, mocks } = createService();
    const fakeManager = { getRepository: jest.fn() } as any;

    mocks.contractRequestsRepository.createAndSave.mockImplementation(async (p) => ({
      id: 'cr-1',
      ...p,
    }));

    const pricing = new PricingService(new TransportService()).buildPricing({
      creatorBasePrice: 400,
      distanceKm: 10,
      transportPricePerKm: 3,
      transportMinimumFee: 20,
      platformFeeRate: 0.20,
    });

    await service.createFromOpenOfferSelection(
      {
        companyUserId: 'company-1',
        creatorUser: mocks.creatorUser,
        jobTypeId: 'job-type-1',
        offeredAmount: 400,
        openOfferId: 'offer-abc',
        startsAt: new Date(),
        durationMinutes: 60,
        jobAddress: 'Rua Y',
        jobFormattedAddress: null,
        jobLatitude: -23.5,
        jobLongitude: -46.6,
        distanceKm: 10,
        effectiveServiceRadiusKm: 30,
        platformFeeRateSnapshot: 0.20,
        pricing,
      },
      fakeManager,
    );

    const saved = mocks.contractRequestsRepository.createAndSave.mock.calls[0][0];
    // platformFee = 400 * 0.20 = 80
    expect(saved.platformFee).toBe(80);
    // totalPrice = 400 + transportFee (não + 80)
    expect(saved.totalPrice).toBe(400 + saved.transportFee);
    expect(saved.totalPrice).not.toBe(400 + saved.transportFee + 80);
  });
});

// ─── Concorrência na seleção (OpenOffersService) ──────────────────────────────
// Teste de unidade que simula race condition na seleção de creator.

describe('OpenOffersService.selectCreator — concorrência', () => {
  it('throws ConflictException when offer is already FILLED (race condition simulation)', async () => {
    const { OpenOffersService } = await import('../open-offers/open-offers.service').catch(() => {
      throw new Error('OpenOffersService não encontrado — verificar import path');
    });

    const filledOffer = {
      id: 'offer-1',
      companyUserId: 'company-1',
      status: 'FILLED',
      expiresAt: new Date(Date.now() + 3_600_000),
      jobTypeId: 'jt-1',
      startsAt: new Date(Date.now() + 86_400_000),
      durationMinutes: 120,
      jobAddress: 'Rua Z',
      jobFormattedAddress: null,
      jobLatitude: -23.5,
      jobLongitude: -46.6,
      offeredAmount: 300,
      platformFeeRateSnapshot: 0,
    };

    const openOffersRepository = {
      findByIdForUpdate: jest.fn().mockResolvedValue(filledOffer),
      findApplicationByIdForUpdate: jest.fn(),
      saveApplication: jest.fn(),
      updatePendingApplicationsToRejected: jest.fn(),
      save: jest.fn(),
    };

    const manager = { getRepository: jest.fn() };
    const dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => unknown) => cb(manager)),
    };

    const usersRepository = {
      findByAuthUserIdWithProfiles: jest.fn().mockResolvedValue({
        id: 'company-1',
        role: 'COMPANY',
        profile: {},
        creatorProfile: null,
      }),
    };

    const service = new OpenOffersService(
      dataSource as any,
      openOffersRepository as any,
      usersRepository as any,
      {} as any, // jobTypesService
      {} as any, // platformSettingsService
      {} as any, // geocodingService
      {} as any, // distanceService
      {} as any, // pricingService
      {} as any, // schedulingConflictService
      {} as any, // contractRequestsService
      { get: jest.fn() } as any,
    );

    await expect(
      service.selectCreator({ authUserId: 'auth-company' }, 'offer-1', 'app-1'),
    ).rejects.toMatchObject({ message: expect.stringContaining('FILLED') });
  });

  it('throws ConflictException when scheduling conflict detected during selection', async () => {
    const { OpenOffersService } = await import('../open-offers/open-offers.service').catch(() => {
      throw new Error('OpenOffersService não encontrado');
    });

    const openOffer = {
      id: 'offer-2',
      companyUserId: 'company-1',
      status: 'OPEN',
      expiresAt: new Date(Date.now() + 3_600_000),
      jobTypeId: 'jt-1',
      startsAt: new Date(Date.now() + 86_400_000),
      durationMinutes: 120,
      jobAddress: 'Rua A',
      jobFormattedAddress: null,
      jobLatitude: -23.5,
      jobLongitude: -46.6,
      offeredAmount: 300,
      platformFeeRateSnapshot: 0,
    };

    const application = {
      id: 'app-2',
      openOfferId: 'offer-2',
      creatorUserId: 'creator-1',
      status: 'PENDING',
    };

    const creatorUser = {
      id: 'creator-1',
      profile: { latitude: -23.5, longitude: -46.6, hasValidCoordinates: true },
      creatorProfile: { serviceRadiusKm: 30 },
    };

    const manager = {
      getRepository: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue(creatorUser),
      }),
    };

    const openOffersRepository = {
      findByIdForUpdate: jest.fn().mockResolvedValue(openOffer),
      findApplicationByIdForUpdate: jest.fn().mockResolvedValue(application),
      saveApplication: jest.fn(),
      updatePendingApplicationsToRejected: jest.fn(),
      save: jest.fn(),
    };

    const dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => unknown) => cb(manager)),
    };

    const usersRepository = {
      findByAuthUserIdWithProfiles: jest.fn().mockResolvedValue({
        id: 'company-1',
        role: 'COMPANY',
        profile: {},
      }),
    };

    // Scheduling conflict retorna true — agenda ocupada
    const schedulingConflictService = {
      hasConflicts: jest.fn().mockResolvedValue(true),
    };

    const distanceService = {
      calculateDistanceKm: jest.fn().mockReturnValue(5),
    };

    const service = new OpenOffersService(
      dataSource as any,
      openOffersRepository as any,
      usersRepository as any,
      {} as any,
      {} as any,
      {} as any,
      distanceService as any,
      {} as any,
      schedulingConflictService as any,
      {} as any,
      { get: jest.fn().mockReturnValue(30) } as any,
    );

    await expect(
      service.selectCreator({ authUserId: 'auth-company' }, 'offer-2', 'app-2'),
    ).rejects.toMatchObject({
      message: expect.stringContaining('agenda'),
    });

    expect(schedulingConflictService.hasConflicts).toHaveBeenCalledWith(
      expect.objectContaining({ manager, creatorUserId: 'creator-1' }),
    );
  });
});
