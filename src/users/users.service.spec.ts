import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { User } from './entities/user.entity';
import { Profile } from '../profiles/entities/profile.entity';
import { CreatorProfile } from '../profiles/entities/creator-profile.entity';
import { CompanyProfile } from '../profiles/entities/company-profile.entity';
import { Portfolio } from '../portfolio/entities/portfolio.entity';
import { PortfolioMedia } from '../portfolio/entities/portfolio-media.entity';
import { ReferralsService } from '../referrals/services/referrals.service';
import { UserRole } from '../common/enums/user-role.enum';

const UNIQUE_VIOLATION = { code: '23505' };

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    authUserId: 'auth-1',
    email: 'test@example.com',
    role: UserRole.CREATOR,
    phone: null,
    status: 'ACTIVE' as any,
    createdAt: new Date(),
    updatedAt: new Date(),
    profile: {
      userId: 'user-1',
      name: 'test',
    } as any,
    creatorProfile: { userId: 'user-1' } as any,
    companyProfile: null as any,
    ...overrides,
  };
}

function makePortfolio(userId = 'user-1') {
  return {
    id: 'portfolio-1',
    user: { id: userId },
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;
}

describe('UsersService.bootstrap', () => {
  let service: UsersService;
  let usersRepo: jest.Mocked<UsersRepository>;
  let profileRepo: any;
  let creatorProfileRepo: any;
  let companyProfileRepo: any;
  let portfolioRepo: any;
  let portfolioMediaRepo: any;
  let referralsService: jest.Mocked<ReferralsService>;
  let dataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    const mockManager = {
      create: jest.fn((EntityClass: any, data: any) => ({ ...data })),
      save: jest.fn((entity: any) => Promise.resolve(entity.id ? entity : { ...entity, id: 'user-1' })),
    };

    usersRepo = {
      findByAuthUserIdWithProfiles: jest.fn(),
      findByEmail: jest.fn(),
      updateAuthUserId: jest.fn(),
      create: jest.fn(),
    } as any;

    profileRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    creatorProfileRepo = { create: jest.fn(), save: jest.fn() };
    companyProfileRepo = { create: jest.fn(), save: jest.fn() };
    portfolioRepo = {
      findOne: jest.fn(),
      create: jest.fn((d: any) => d),
      save: jest.fn(),
    };
    portfolioMediaRepo = { find: jest.fn().mockResolvedValue([]) };

    referralsService = { claimReferral: jest.fn() } as any;

    dataSource = {
      transaction: jest.fn(async (cb: any) => cb(mockManager)),
    } as any;

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: usersRepo },
        { provide: getRepositoryToken(Profile), useValue: profileRepo },
        { provide: getRepositoryToken(CreatorProfile), useValue: creatorProfileRepo },
        { provide: getRepositoryToken(CompanyProfile), useValue: companyProfileRepo },
        { provide: getRepositoryToken(Portfolio), useValue: portfolioRepo },
        { provide: getRepositoryToken(PortfolioMedia), useValue: portfolioMediaRepo },
        { provide: ReferralsService, useValue: referralsService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  describe('Step 1 — idempotência', () => {
    it('retorna usuário existente sem criar nada quando authUserId já existe', async () => {
      const user = makeUser();
      usersRepo.findByAuthUserIdWithProfiles.mockResolvedValue(user);
      portfolioRepo.findOne.mockResolvedValue(makePortfolio());

      const result = await service.bootstrap('auth-1', 'test@example.com', UserRole.CREATOR);

      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(referralsService.claimReferral).not.toHaveBeenCalled();
      expect(result.referralStatus).toBe('ok');
    });

    it('bootstrap chamado duas vezes em sequência retorna o mesmo usuário sem duplicar entidades', async () => {
      const user = makeUser();
      usersRepo.findByAuthUserIdWithProfiles
        .mockResolvedValueOnce(null)
        .mockResolvedValue(user);
      usersRepo.findByEmail.mockResolvedValue(null);
      portfolioRepo.findOne.mockResolvedValue(makePortfolio());

      await service.bootstrap('auth-1', 'test@example.com', UserRole.CREATOR);
      await service.bootstrap('auth-1', 'test@example.com', UserRole.CREATOR);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('Step 2 — recuperação de identidade auth', () => {
    it('revincula authUserId quando email já existe com authUserId diferente', async () => {
      const existingUser = makeUser({ authUserId: 'old-auth' });
      const relinked = makeUser();
      usersRepo.findByAuthUserIdWithProfiles.mockResolvedValueOnce(null).mockResolvedValue(relinked);
      usersRepo.findByEmail.mockResolvedValue(existingUser);
      portfolioRepo.findOne.mockResolvedValue(makePortfolio());

      const result = await service.bootstrap('new-auth', 'test@example.com', UserRole.CREATOR);

      expect(usersRepo.updateAuthUserId).toHaveBeenCalledWith('user-1', 'new-auth');
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(result.referralStatus).toBe('ok');
    });
  });

  describe('Step 3 — criação atômica', () => {
    beforeEach(() => {
      usersRepo.findByAuthUserIdWithProfiles
        .mockResolvedValueOnce(null)
        .mockResolvedValue(makeUser());
      usersRepo.findByEmail.mockResolvedValue(null);
      portfolioRepo.findOne.mockResolvedValue(makePortfolio());
    });

    it('cria usuário CREATOR via transação', async () => {
      await service.bootstrap('auth-1', 'test@example.com', UserRole.CREATOR);
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('cria usuário COMPANY via transação', async () => {
      usersRepo.findByAuthUserIdWithProfiles
        .mockReset()
        .mockResolvedValueOnce(null)
        .mockResolvedValue(makeUser({ role: UserRole.COMPANY }));
      await service.bootstrap('auth-1', 'test@example.com', UserRole.COMPANY);
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('usa name fornecido no profile quando informado', async () => {
      const mockManager = { create: jest.fn((_, d) => d), save: jest.fn((e) => Promise.resolve({ ...e, id: 'user-1' })) };
      dataSource.transaction.mockImplementationOnce(async (cb: any) => cb(mockManager));

      await service.bootstrap('auth-1', 'test@example.com', UserRole.CREATOR, undefined, 'João Silva');

      const profileCreated = mockManager.create.mock.calls.find(
        ([EntityClass]) => EntityClass?.name === 'Profile' || EntityClass === Profile,
      );
      // name deve ser "João Silva", não o prefixo do email
      const profileData = mockManager.create.mock.calls
        .map((c) => c[1])
        .find((d: any) => 'name' in d);
      expect(profileData?.name).toBe('João Silva');
    });

    it('usa prefixo do email quando name não é fornecido', async () => {
      const mockManager = { create: jest.fn((_, d) => d), save: jest.fn((e) => Promise.resolve({ ...e, id: 'user-1' })) };
      dataSource.transaction.mockImplementationOnce(async (cb: any) => cb(mockManager));

      await service.bootstrap('auth-1', 'joao@example.com', UserRole.CREATOR);

      const profileData = mockManager.create.mock.calls
        .map((c) => c[1])
        .find((d: any) => 'name' in d);
      expect(profileData?.name).toBe('joao');
    });

    it('race condition: unique violation retorna usuário completo via findByAuthUserIdWithProfiles', async () => {
      usersRepo.findByAuthUserIdWithProfiles.mockReset();
      usersRepo.findByAuthUserIdWithProfiles
        .mockResolvedValueOnce(null) // Step 1
        .mockResolvedValue(makeUser()); // fallback de race
      usersRepo.findByEmail.mockResolvedValue(null);
      dataSource.transaction.mockRejectedValueOnce(UNIQUE_VIOLATION);
      portfolioRepo.findOne.mockResolvedValue(makePortfolio());

      const result = await service.bootstrap('auth-1', 'test@example.com', UserRole.CREATOR);

      expect(result.profile).not.toBeNull();
      expect(result.referralStatus).toBe('ok');
      expect(usersRepo.findByAuthUserIdWithProfiles).toHaveBeenCalledTimes(2);
    });

    it('race condition: lança erro se user não encontrado após unique violation', async () => {
      usersRepo.findByAuthUserIdWithProfiles.mockReset().mockResolvedValue(null);
      usersRepo.findByEmail.mockResolvedValue(null);
      dataSource.transaction.mockRejectedValueOnce(UNIQUE_VIOLATION);

      await expect(
        service.bootstrap('auth-1', 'test@example.com', UserRole.CREATOR),
      ).rejects.toEqual(UNIQUE_VIOLATION);
    });
  });

  describe('referral', () => {
    beforeEach(() => {
      usersRepo.findByAuthUserIdWithProfiles
        .mockResolvedValueOnce(null)
        .mockResolvedValue(makeUser());
      usersRepo.findByEmail.mockResolvedValue(null);
      portfolioRepo.findOne.mockResolvedValue(makePortfolio());
    });

    it('chama claimReferral quando referralCode é fornecido', async () => {
      referralsService.claimReferral.mockResolvedValue();
      await service.bootstrap('auth-1', 'test@example.com', UserRole.CREATOR, 'REF123');
      expect(referralsService.claimReferral).toHaveBeenCalledWith('REF123', 'user-1');
    });

    it('não chama claimReferral quando referralCode não é fornecido', async () => {
      await service.bootstrap('auth-1', 'test@example.com', UserRole.CREATOR);
      expect(referralsService.claimReferral).not.toHaveBeenCalled();
    });

    it('não lança erro se claimReferral falhar', async () => {
      referralsService.claimReferral.mockRejectedValue(new Error('referral error'));
      await expect(
        service.bootstrap('auth-1', 'test@example.com', UserRole.CREATOR, 'BAD_CODE'),
      ).resolves.toBeDefined();
    });

    it('retorna referralStatus: error quando claimReferral lança erro inesperado', async () => {
      referralsService.claimReferral.mockRejectedValue(new Error('db error'));
      const result = await service.bootstrap('auth-1', 'test@example.com', UserRole.CREATOR, 'REF123');
      expect(result.referralStatus).toBe('error');
    });

    it('retorna referralStatus: ok quando nenhum referralCode é fornecido', async () => {
      const result = await service.bootstrap('auth-1', 'test@example.com', UserRole.CREATOR);
      expect(result.referralStatus).toBe('ok');
    });

    it('retorna referralStatus: ok quando claimReferral conclui sem erro', async () => {
      referralsService.claimReferral.mockResolvedValue(undefined);
      const result = await service.bootstrap('auth-1', 'test@example.com', UserRole.CREATOR, 'REF_OK');
      expect(result.referralStatus).toBe('ok');
    });
  });

  describe('buildPayload — portfolio fallback', () => {
    it('cria portfolio se não existir para usuário legado', async () => {
      const user = makeUser();
      usersRepo.findByAuthUserIdWithProfiles.mockResolvedValue(user);
      portfolioRepo.findOne.mockResolvedValue(null);
      portfolioRepo.save.mockResolvedValue(makePortfolio());

      await service.bootstrap('auth-1', 'test@example.com', UserRole.CREATOR);

      expect(portfolioRepo.save).toHaveBeenCalled();
    });

    it('resolve silenciosamente unique violation ao criar portfolio em buildPayload', async () => {
      const user = makeUser();
      usersRepo.findByAuthUserIdWithProfiles.mockResolvedValue(user);
      portfolioRepo.findOne
        .mockResolvedValueOnce(null) // primeiro findOne: não existe
        .mockResolvedValue(makePortfolio()); // segundo findOne após corrida
      portfolioRepo.save.mockRejectedValue(UNIQUE_VIOLATION);

      await expect(
        service.bootstrap('auth-1', 'test@example.com', UserRole.CREATOR),
      ).resolves.toBeDefined();
    });
  });
});
