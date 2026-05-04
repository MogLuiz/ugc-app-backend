import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { UserRole } from '../common/enums/user-role.enum';
import { PartnerStatus } from '../referrals/enums/partner-status.enum';

describe('ProfilesService', () => {
  function createService() {
    const usersRepository = {
      findByAuthUserIdWithProfiles: jest.fn(),
    };
    const profileRepo = { findOne: jest.fn(), save: jest.fn() };
    const creatorProfileRepo = {
      findOne: jest.fn(),
      create: jest.fn((payload) => payload),
      save: jest.fn(async (payload) => ({
        payoutDetailsStatus: 'filled',
        ...payload,
      })),
    };
    const companyProfileRepo = { findOne: jest.fn(), save: jest.fn() };
    const portfolioService = { buildPortfolioPayload: jest.fn().mockResolvedValue(null) };
    const availabilityRepository = {};
    const profileLocationService = {};
    const creatorJobTypesRepository = {};
    const distanceService = {};
    const configService = { get: jest.fn() };
    const partnerProfileRepo = { findOne: jest.fn().mockResolvedValue(null) };

    const service = new ProfilesService(
      configService as any,
      usersRepository as any,
      profileRepo as any,
      creatorProfileRepo as any,
      companyProfileRepo as any,
      portfolioService as any,
      availabilityRepository as any,
      profileLocationService as any,
      creatorJobTypesRepository as any,
      distanceService as any,
      partnerProfileRepo as any,
    );

    return {
      service,
      mocks: {
        usersRepository,
        creatorProfileRepo,
        partnerProfileRepo,
        portfolioService,
      },
    };
  }

  function makeCreatorUser(overrides: Record<string, unknown> = {}) {
    return {
      id: 'creator-1',
      authUserId: 'auth-creator',
      role: UserRole.CREATOR,
      creatorProfile: null,
      ...overrides,
    };
  }

  it('returns empty payout settings when creator has not configured PIX', async () => {
    const { service, mocks } = createService();
    mocks.usersRepository.findByAuthUserIdWithProfiles.mockResolvedValue(makeCreatorUser());

    await expect(service.getCreatorPayoutSettings('auth-creator')).resolves.toEqual({
      isConfigured: false,
      pixKeyType: null,
      pixKey: null,
      pixKeyMasked: null,
      holderName: null,
      holderDocument: null,
    });
  });

  it('updates payout settings with normalized cpf key', async () => {
    const { service, mocks } = createService();
    mocks.usersRepository.findByAuthUserIdWithProfiles.mockResolvedValue(makeCreatorUser());

    const result = await service.updateCreatorPayoutSettings('auth-creator', {
      pixKeyType: 'cpf',
      pixKey: '529.982.247-25',
      holderName: '  Maria   Silva  ',
      holderDocument: '529.982.247-25',
    });

    expect(mocks.creatorProfileRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'creator-1',
        pixKeyType: 'cpf',
        pixKey: '52998224725',
        pixHolderName: 'Maria Silva',
        pixHolderDocument: '52998224725',
        payoutDetailsStatus: 'filled',
      }),
    );

    expect(result).toEqual({
      isConfigured: true,
      pixKeyType: 'cpf',
      pixKey: '52998224725',
      pixKeyMasked: '529***25',
      holderName: 'Maria Silva',
      holderDocument: '52998224725',
    });
  });

  it('normalizes email and phone keys', async () => {
    const { service, mocks } = createService();
    mocks.usersRepository.findByAuthUserIdWithProfiles.mockResolvedValue(makeCreatorUser());

    const email = await service.updateCreatorPayoutSettings('auth-creator', {
      pixKeyType: 'email',
      pixKey: '  Creator@Test.COM ',
    });
    const phone = await service.updateCreatorPayoutSettings('auth-creator', {
      pixKeyType: 'phone',
      pixKey: '(31) 99876-5432',
    });

    expect(email.pixKey).toBe('creator@test.com');
    expect(phone.pixKey).toBe('+5531998765432');
  });

  it('rejects invalid cpf and random pix keys', async () => {
    const { service, mocks } = createService();
    mocks.usersRepository.findByAuthUserIdWithProfiles.mockResolvedValue(makeCreatorUser());

    await expect(
      service.updateCreatorPayoutSettings('auth-creator', {
        pixKeyType: 'cpf',
        pixKey: '111.111.111-11',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.updateCreatorPayoutSettings('auth-creator', {
        pixKeyType: 'random',
        pixKey: 'not-a-valid-key',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates and normalizes cnpj key', async () => {
    const { service, mocks } = createService();
    mocks.usersRepository.findByAuthUserIdWithProfiles.mockResolvedValue(makeCreatorUser());

    const result = await service.updateCreatorPayoutSettings('auth-creator', {
      pixKeyType: 'cnpj',
      pixKey: '11.222.333/0001-81',
    });
    expect(result.pixKey).toBe('11222333000181');

    await expect(
      service.updateCreatorPayoutSettings('auth-creator', {
        pixKeyType: 'cnpj',
        pixKey: '11.111.111/1111-11',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid email and phone keys', async () => {
    const { service, mocks } = createService();
    mocks.usersRepository.findByAuthUserIdWithProfiles.mockResolvedValue(makeCreatorUser());

    await expect(
      service.updateCreatorPayoutSettings('auth-creator', {
        pixKeyType: 'email',
        pixKey: 'not-an-email',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.updateCreatorPayoutSettings('auth-creator', {
        pixKeyType: 'phone',
        pixKey: '123',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts valid random pix key (uuid v4)', async () => {
    const { service, mocks } = createService();
    mocks.usersRepository.findByAuthUserIdWithProfiles.mockResolvedValue(makeCreatorUser());

    const result = await service.updateCreatorPayoutSettings('auth-creator', {
      pixKeyType: 'random',
      pixKey: '123e4567-e89b-42d3-a456-556642440000',
    });
    expect(result.pixKey).toBe('123e4567-e89b-42d3-a456-556642440000');
  });

  it('updates payout settings on existing creator profile', async () => {
    const { service, mocks } = createService();
    const existingProfile = {
      userId: 'creator-1',
      pixKeyType: 'cpf',
      pixKey: '52998224725',
      pixHolderName: 'Nome Antigo',
      pixHolderDocument: '52998224725',
      payoutDetailsStatus: 'filled',
    };
    mocks.usersRepository.findByAuthUserIdWithProfiles.mockResolvedValue(
      makeCreatorUser({ creatorProfile: existingProfile }),
    );

    const result = await service.updateCreatorPayoutSettings('auth-creator', {
      pixKeyType: 'email',
      pixKey: 'novo@email.com',
    });

    expect(mocks.creatorProfileRepo.create).not.toHaveBeenCalled();
    expect(result.pixKeyType).toBe('email');
    expect(result.pixKey).toBe('novo@email.com');
  });

  it('stores null for optional holder fields when not provided', async () => {
    const { service, mocks } = createService();
    mocks.usersRepository.findByAuthUserIdWithProfiles.mockResolvedValue(makeCreatorUser());

    const result = await service.updateCreatorPayoutSettings('auth-creator', {
      pixKeyType: 'email',
      pixKey: 'creator@test.com',
      holderName: null,
      holderDocument: null,
    });

    expect(result.holderName).toBeNull();
    expect(result.holderDocument).toBeNull();
    expect(mocks.creatorProfileRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        pixHolderName: null,
        pixHolderDocument: null,
      }),
    );
  });

  it('rejects non-creator users', async () => {
    const { service, mocks } = createService();
    mocks.usersRepository.findByAuthUserIdWithProfiles.mockResolvedValue({
      id: 'company-1',
      authUserId: 'auth-company',
      role: UserRole.COMPANY,
      creatorProfile: null,
    });

    await expect(service.getCreatorPayoutSettings('auth-company')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('throws when authenticated user is not found', async () => {
    const { service, mocks } = createService();
    mocks.usersRepository.findByAuthUserIdWithProfiles.mockResolvedValue(null);

    await expect(service.getCreatorPayoutSettings('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  describe('getMe — partner field', () => {
    function makeUser(overrides: Record<string, unknown> = {}) {
      return {
        id: 'user-1',
        authUserId: 'auth-1',
        email: 'user@test.com',
        role: UserRole.CREATOR,
        profile: null,
        creatorProfile: null,
        companyProfile: null,
        ...overrides,
      };
    }

    it('returns partner: null when user has no partner profile', async () => {
      const { service, mocks } = createService();
      mocks.usersRepository.findByAuthUserIdWithProfiles.mockResolvedValue(makeUser());
      mocks.partnerProfileRepo.findOne.mockResolvedValue(null);

      const result = await service.getMe('auth-1');

      expect(result.partner).toBeNull();
    });

    it('returns partner with id and status ACTIVE when partner profile exists', async () => {
      const { service, mocks } = createService();
      mocks.usersRepository.findByAuthUserIdWithProfiles.mockResolvedValue(makeUser());
      mocks.partnerProfileRepo.findOne.mockResolvedValue({
        userId: 'user-1',
        status: PartnerStatus.ACTIVE,
      });

      const result = await service.getMe('auth-1');

      expect(result.partner).toEqual({ id: 'user-1', status: PartnerStatus.ACTIVE });
    });

    it('returns partner with status SUSPENDED when partner is suspended', async () => {
      const { service, mocks } = createService();
      mocks.usersRepository.findByAuthUserIdWithProfiles.mockResolvedValue(makeUser());
      mocks.partnerProfileRepo.findOne.mockResolvedValue({
        userId: 'user-1',
        status: PartnerStatus.SUSPENDED,
      });

      const result = await service.getMe('auth-1');

      expect(result.partner).toEqual({ id: 'user-1', status: PartnerStatus.SUSPENDED });
    });

    it('fetches partner profile in parallel with portfolio (both called once)', async () => {
      const { service, mocks } = createService();
      mocks.usersRepository.findByAuthUserIdWithProfiles.mockResolvedValue(makeUser());

      await service.getMe('auth-1');

      expect(mocks.portfolioService.buildPortfolioPayload).toHaveBeenCalledTimes(1);
      expect(mocks.partnerProfileRepo.findOne).toHaveBeenCalledTimes(1);
      expect(mocks.partnerProfileRepo.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        select: { userId: true, status: true },
      });
    });
  });
});
