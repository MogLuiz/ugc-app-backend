import { DataSource } from 'typeorm';
import { ContractRequestsService } from './contract-requests.service';
import { DistanceService } from './services/distance.service';
import { PricingService } from './services/pricing.service';
import { UserRole } from '../common/enums/user-role.enum';
import { JobMode } from '../common/enums/job-mode.enum';
import { PaymentStatus } from '../common/enums/payment-status.enum';
import { ContractRequestStatus } from '../common/enums/contract-request-status.enum';

describe('PricingService', () => {
  it('calculates transport fee with minimum floor', () => {
    const service = new PricingService();

    const result = service.buildPricing({
      creatorBasePrice: 200,
      distanceKm: 2,
      transportPricePerKm: 5,
      transportMinimumFee: 20,
    });

    expect(result.transportFee).toBe(20);
    expect(result.platformFee).toBe(0);
    expect(result.totalPrice).toBe(220);
    expect(result.currency).toBe('BRL');
  });
});

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

describe('ContractRequestsService', () => {
  function createService() {
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
      },
      creatorProfile: {
        autoAcceptBookings: true,
        latitude: -23.55052,
        longitude: -46.633308,
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
      }),
    };
    const creatorJobTypesRepository = {
      findActiveByCreatorAndJobType: jest.fn().mockResolvedValue({
        basePriceCents: 25000,
      }),
    };
    const platformSettingsService = {
      getCurrentOrThrow: jest.fn().mockResolvedValue({
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
    };
    const pricingService = {
      buildPricing: jest.fn().mockReturnValue({
        currency: 'BRL',
        creatorBasePrice: 250,
        distanceKm: 10,
        transportFee: 35,
        platformFee: 0,
        totalPrice: 285,
        transportPricePerKmUsed: 3.5,
        transportMinimumFeeUsed: 15,
      }),
    };
    const schedulingConflictService = {
      hasConflicts: jest.fn().mockResolvedValue(false),
    };

    const service = new ContractRequestsService(
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
      },
    };
  }

  it('creates accepted contract request when creator auto-accepts', async () => {
    const { service, mocks } = createService();

    const result = await service.create(
      { authUserId: 'auth-company' },
      {
        creatorId: 'creator-1',
        jobTypeId: 'job-type-1',
        description: 'Captação presencial',
        startsAt: '2026-03-21T10:00:00.000Z',
        durationMinutes: 120,
        locationAddress: 'Av. Paulista, 1000',
        termsAccepted: true,
      },
    );

    expect(mocks.contractRequestsRepository.createAndSave).toHaveBeenCalled();
    expect(result.status).toBe(ContractRequestStatus.ACCEPTED);
    expect(result.paymentStatus).toBe(PaymentStatus.PAID);
    expect(result.totalPrice).toBe(285);
    expect(result.transportPricePerKmUsed).toBe(3.5);
  });

  it('creates pending contract request when creator does not auto-accept', async () => {
    const { service, mocks } = createService();
    mocks.creatorUser.creatorProfile.autoAcceptBookings = false;

    const result = await service.create(
      { authUserId: 'auth-company' },
      {
        creatorId: 'creator-1',
        jobTypeId: 'job-type-1',
        description: 'Captação presencial',
        startsAt: '2026-03-21T10:00:00.000Z',
        durationMinutes: 120,
        locationAddress: 'Av. Paulista, 1000',
        termsAccepted: true,
      },
    );

    expect(result.status).toBe(ContractRequestStatus.PENDING_ACCEPTANCE);
  });

  it('blocks preview when creator has no valid coordinates', async () => {
    const { service, mocks } = createService();
    mocks.creatorUser.creatorProfile.latitude = null;

    await expect(
      service.preview(
        { authUserId: 'auth-company' },
        {
          creatorId: 'creator-1',
          jobTypeId: 'job-type-1',
          description: 'Captação presencial',
          startsAt: '2026-03-21T10:00:00.000Z',
          durationMinutes: 120,
          locationAddress: 'Av. Paulista, 1000',
          termsAccepted: true,
        },
      ),
    ).rejects.toThrow(
      'Este creator ainda não possui coordenadas ou raio de atendimento configurados para contratação presencial',
    );
  });

  it('rejects accept when contract request is not pending acceptance', async () => {
    const { service, mocks } = createService();
    const actor = {
      id: 'creator-1',
      authUserId: 'auth-creator',
      role: UserRole.CREATOR,
      profile: { name: 'Creator Teste' },
      creatorProfile: { autoAcceptBookings: true },
    };
    const actorRepo = {
      findOne: jest.fn().mockResolvedValue(actor),
    };
    (mocks.dataSource as any).getRepository = jest.fn().mockReturnValue(actorRepo);
    (mocks.dataSource as any).transaction = jest.fn(async (callback: any) =>
      callback({
        getRepository: jest.fn().mockReturnValue(actorRepo),
      }),
    );
    mocks.contractRequestsRepository.findByIdForUpdate.mockResolvedValue({
      id: 'contract-1',
      creatorUserId: 'creator-1',
      status: ContractRequestStatus.ACCEPTED,
      startsAt: new Date('2026-03-21T10:00:00.000Z'),
      durationMinutes: 120,
    });

    await expect(
      service.accept({ authUserId: 'auth-creator' }, 'contract-1'),
    ).rejects.toThrow(
      `Não é possível aceitar uma contratação com status ${ContractRequestStatus.ACCEPTED}`,
    );
  });

  it('rejects pending contract request and stores rejection reason', async () => {
    const { service, mocks } = createService();
    const actor = {
      id: 'creator-1',
      authUserId: 'auth-creator',
      role: UserRole.CREATOR,
      profile: { name: 'Creator Teste' },
      creatorProfile: { autoAcceptBookings: true },
    };
    const actorRepo = {
      findOne: jest.fn().mockResolvedValue(actor),
    };
    const manager = {
      getRepository: jest.fn().mockReturnValue(actorRepo),
    };
    (mocks.dataSource as any).transaction = jest.fn(async (callback: any) =>
      callback(manager),
    );
    mocks.contractRequestsRepository.findByIdForUpdate.mockResolvedValue({
      id: 'contract-1',
      creatorUserId: 'creator-1',
      status: ContractRequestStatus.PENDING_ACCEPTANCE,
      startsAt: new Date('2026-03-21T10:00:00.000Z'),
      durationMinutes: 120,
      paymentStatus: PaymentStatus.PAID,
      mode: JobMode.PRESENTIAL,
      companyUserId: 'company-1',
      jobTypeId: 'job-type-1',
      description: 'Captação presencial',
      currency: 'BRL',
      termsAcceptedAt: new Date('2026-03-20T10:00:00.000Z'),
      locationAddress: 'Av. Paulista, 1000',
      locationLat: -23.561684,
      locationLng: -46.625378,
      distanceKm: 10,
      transportFee: 35,
      creatorBasePrice: 250,
      platformFee: 0,
      totalPrice: 285,
      transportPricePerKmUsed: 3.5,
      transportMinimumFeeUsed: 15,
      creatorNameSnapshot: 'Creator Teste',
      creatorAvatarUrlSnapshot: null,
      rejectionReason: null,
      createdAt: new Date('2026-03-20T10:00:00.000Z'),
      updatedAt: new Date('2026-03-20T10:00:00.000Z'),
    });
    mocks.contractRequestsRepository.save.mockImplementation(async (payload) => payload);

    const result = await service.reject(
      { authUserId: 'auth-creator' },
      'contract-1',
      { rejectionReason: 'Indisponível nesta data' },
    );

    expect(result.status).toBe(ContractRequestStatus.REJECTED);
    expect(result.rejectionReason).toBe('Indisponível nesta data');
  });

  it('blocks preview when geocoding fails', async () => {
    const { service, mocks } = createService();
    mocks.geocodingService.geocodeAddress.mockResolvedValue(null);

    await expect(
      service.preview(
        { authUserId: 'auth-company' },
        {
          creatorId: 'creator-1',
          jobTypeId: 'job-type-1',
          description: 'Captação presencial',
          startsAt: '2026-03-21T10:00:00.000Z',
          durationMinutes: 120,
          locationAddress: 'Endereco invalido',
          termsAccepted: true,
        },
      ),
    ).rejects.toThrow(
      'Não foi possível geocodificar o endereço informado para a contratação',
    );
  });
});
