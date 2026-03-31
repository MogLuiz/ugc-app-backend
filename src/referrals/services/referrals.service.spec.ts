import { DataSource } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { PartnerStatus } from '../enums/partner-status.enum';
import { ReferralStatus } from '../enums/referral-status.enum';
import { CommissionStatus } from '../enums/commission-status.enum';

describe('ReferralsService', () => {
  function createService() {
    const user = { id: 'user-1', authUserId: 'auth-user-1' };

    const userRepo = {
      findOne: jest.fn().mockImplementation(
        async ({ where }: { where: { authUserId?: string; id?: string } }) => {
          if (where.id === 'user-1') return user;
          if (where.authUserId === 'auth-user-1') return user;
          return null;
        },
      ),
    };

    const partnerProfilesRepository = {
      findByUserId: jest.fn().mockResolvedValue(null),
      createAndSave: jest.fn().mockImplementation(async (data) => ({
        ...data,
        createdAt: new Date('2026-03-28T10:00:00Z'),
        updatedAt: new Date('2026-03-28T10:00:00Z'),
      })),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };

    const referralCodesRepository = {
      findActiveByPartnerUserId: jest.fn().mockResolvedValue(null),
      findByCode: jest.fn().mockResolvedValue(null),
      createAndSave: jest.fn().mockImplementation(async (data) => ({
        id: 'code-1',
        ...data,
        createdAt: new Date('2026-03-28T10:00:00Z'),
      })),
      deactivateAllForPartnerUserId: jest.fn().mockResolvedValue(undefined),
    };

    const referralsRepository = {
      findByReferredUserId: jest.fn().mockResolvedValue(null),
      findPendingByReferredUserIdForUpdate: jest.fn().mockResolvedValue(null),
      qualify: jest.fn().mockResolvedValue(undefined),
      createReferral: jest.fn().mockResolvedValue({ id: 'referral-1' }),
      listByPartner: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      getAggregatesByPartner: jest.fn().mockResolvedValue({
        totalReferrals: 0,
        pendingReferrals: 0,
        qualifiedReferrals: 0,
      }),
    };

    const commissionsRepository = {
      insertIdempotent: jest.fn().mockResolvedValue(undefined),
      listByPartner: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      getDashboardAggregates: jest.fn().mockResolvedValue({
        totalCommissionAmountCents: 0,
        pendingCommissionAmountCents: 0,
        currency: 'BRL',
      }),
    };

    const commissionsService = {
      createCommission: jest.fn().mockResolvedValue(undefined),
    };

    const referralCodeGeneratorService = {
      generateUniqueCode: jest.fn().mockResolvedValue('abc12345'),
    };

    const manager = {
      getRepository: jest.fn().mockImplementation(() => ({
        create: jest.fn().mockImplementation((data: unknown) => data),
        save: jest.fn().mockImplementation(async (data: unknown) => data),
      })),
    };

    const dataSource = {
      transaction: jest.fn(async (callback: (em: unknown) => unknown) => callback(manager)),
    } as unknown as DataSource;

    const configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'APP_URL') return 'https://ugclocal.com.br';
        return undefined;
      }),
    };

    const service = new ReferralsService(
      configService as never,
      dataSource,
      userRepo as never,
      partnerProfilesRepository as never,
      referralCodesRepository as never,
      referralsRepository as never,
      commissionsRepository as never,
      commissionsService as never,
      referralCodeGeneratorService as never,
    );

    return {
      service,
      mocks: {
        user,
        userRepo,
        partnerProfilesRepository,
        referralCodesRepository,
        referralsRepository,
        commissionsRepository,
        commissionsService,
        referralCodeGeneratorService,
        configService,
      },
    };
  }

  describe('activatePartnerByUserId()', () => {
    it('creates partner profile and referral code for new partner', async () => {
      const { service, mocks } = createService();

      const result = await service.activatePartnerByUserId('user-1');

      expect(result.userId).toBe('user-1');
      expect(result.status).toBe(PartnerStatus.ACTIVE);
      expect(result.referralCode).toBe('abc12345');
      expect(result.referralLink).toBe('https://ugclocal.com.br/cadastro?ref=abc12345');
      expect(result.commissionRatePercent).toBe(10);
      expect(mocks.partnerProfilesRepository.createAndSave).toHaveBeenCalledTimes(1);
      expect(mocks.referralCodeGeneratorService.generateUniqueCode).toHaveBeenCalledTimes(1);
    });

    it('returns existing profile when already activated (idempotent)', async () => {
      const { service, mocks } = createService();

      mocks.partnerProfilesRepository.findByUserId.mockResolvedValue({
        userId: 'user-1',
        status: PartnerStatus.ACTIVE,
        commissionRatePercent: 10,
        activatedAt: new Date('2026-03-20T10:00:00Z'),
      });
      mocks.referralCodesRepository.findActiveByPartnerUserId.mockResolvedValue({
        id: 'code-existing',
        code: 'existing1',
        isActive: true,
        createdAt: new Date('2026-03-20T10:00:00Z'),
      });

      const result = await service.activatePartnerByUserId('user-1');

      expect(result.referralCode).toBe('existing1');
      expect(mocks.partnerProfilesRepository.createAndSave).not.toHaveBeenCalled();
      expect(mocks.referralCodeGeneratorService.generateUniqueCode).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when user does not exist', async () => {
      const { service, mocks } = createService();
      mocks.userRepo.findOne.mockResolvedValue(null);

      await expect(service.activatePartnerByUserId('unknown-uuid')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivatePartnerByUserId()', () => {
    it('sets partner SUSPENDED and deactivates referral codes', async () => {
      const { service, mocks } = createService();
      mocks.partnerProfilesRepository.findByUserId.mockResolvedValue({
        userId: 'user-1',
        status: PartnerStatus.ACTIVE,
        commissionRatePercent: 10,
        activatedAt: new Date('2026-03-20T10:00:00Z'),
      });
      mocks.referralCodesRepository.findActiveByPartnerUserId.mockResolvedValue({
        code: 'abc12345',
        isActive: true,
      });

      const result = await service.deactivatePartnerByUserId('user-1');

      expect(result.partnerStatus).toBe(PartnerStatus.SUSPENDED);
      expect(result.referralCode).toEqual({ code: 'abc12345', isActive: false });
      expect(result.userId).toBe('user-1');
      expect(mocks.partnerProfilesRepository.updateStatus).toHaveBeenCalledWith(
        'user-1',
        PartnerStatus.SUSPENDED,
        expect.anything(),
      );
      expect(mocks.referralCodesRepository.deactivateAllForPartnerUserId).toHaveBeenCalled();
    });

    it('throws when partner profile missing', async () => {
      const { service } = createService();

      await expect(service.deactivatePartnerByUserId('user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMyPartnerProfile()', () => {
    it('returns partner profile with referral code', async () => {
      const { service, mocks } = createService();

      mocks.partnerProfilesRepository.findByUserId.mockResolvedValue({
        userId: 'user-1',
        status: PartnerStatus.ACTIVE,
        commissionRatePercent: 10,
        displayName: null,
        activatedAt: new Date('2026-03-20T10:00:00Z'),
      });
      mocks.referralCodesRepository.findActiveByPartnerUserId.mockResolvedValue({
        code: 'abc12345',
        isActive: true,
      });

      const result = await service.getMyPartnerProfile({ authUserId: 'auth-user-1' });

      expect(result.userId).toBe('user-1');
      expect(result.referralCode).toBe('abc12345');
      expect(result.referralLink).toBe('https://ugclocal.com.br/cadastro?ref=abc12345');
    });

    it('throws NotFoundException when partner profile not found', async () => {
      const { service } = createService();

      await expect(service.getMyPartnerProfile({ authUserId: 'auth-user-1' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMyReferralCode()', () => {
    it('returns referral code details', async () => {
      const { service, mocks } = createService();

      mocks.referralCodesRepository.findActiveByPartnerUserId.mockResolvedValue({
        code: 'abc12345',
        isActive: true,
        createdAt: new Date('2026-03-20T10:00:00Z'),
      });

      const result = await service.getMyReferralCode({ authUserId: 'auth-user-1' });

      expect(result.code).toBe('abc12345');
      expect(result.link).toBe('https://ugclocal.com.br/cadastro?ref=abc12345');
    });

    it('throws NotFoundException when no active code exists', async () => {
      const { service } = createService();

      await expect(service.getMyReferralCode({ authUserId: 'auth-user-1' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('claimReferral()', () => {
    function setupActiveCode(
      mocks: ReturnType<typeof createService>['mocks'],
      overrides?: { isActive?: boolean; partnerUserId?: string; partnerStatus?: PartnerStatus },
    ) {
      const codeRecord = {
        id: 'code-1',
        code: 'abc12345',
        isActive: overrides?.isActive ?? true,
        partnerUserId: overrides?.partnerUserId ?? 'partner-1',
      };
      mocks.referralCodesRepository.findByCode.mockResolvedValue(codeRecord);
      mocks.partnerProfilesRepository.findByUserId.mockResolvedValue({
        userId: overrides?.partnerUserId ?? 'partner-1',
        status: overrides?.partnerStatus ?? PartnerStatus.ACTIVE,
      });
      return codeRecord;
    }

    it('creates referral when code is valid', async () => {
      const { service, mocks } = createService();
      setupActiveCode(mocks);

      await service.claimReferral('abc12345', 'referred-user-1');

      expect(mocks.referralsRepository.createReferral).toHaveBeenCalledWith(
        expect.objectContaining({
          partnerUserId: 'partner-1',
          referredUserId: 'referred-user-1',
          status: ReferralStatus.PENDING,
        }),
      );
    });

    it('skips silently when code does not exist', async () => {
      const { service, mocks } = createService();

      await service.claimReferral('nonexistent', 'referred-user-1');

      expect(mocks.referralsRepository.createReferral).not.toHaveBeenCalled();
    });

    it('skips silently when code is inactive', async () => {
      const { service, mocks } = createService();
      setupActiveCode(mocks, { isActive: false });

      await service.claimReferral('abc12345', 'referred-user-1');

      expect(mocks.referralsRepository.createReferral).not.toHaveBeenCalled();
    });

    it('skips silently when partner is not active', async () => {
      const { service, mocks } = createService();
      setupActiveCode(mocks, { partnerStatus: PartnerStatus.SUSPENDED });

      await service.claimReferral('abc12345', 'referred-user-1');

      expect(mocks.referralsRepository.createReferral).not.toHaveBeenCalled();
    });

    it('skips silently on self-referral', async () => {
      const { service, mocks } = createService();
      setupActiveCode(mocks, { partnerUserId: 'same-user' });

      await service.claimReferral('abc12345', 'same-user');

      expect(mocks.referralsRepository.createReferral).not.toHaveBeenCalled();
    });

    it('skips silently when user already has a referral', async () => {
      const { service, mocks } = createService();
      setupActiveCode(mocks);
      mocks.referralsRepository.findByReferredUserId.mockResolvedValue({ id: 'existing-referral' });

      await service.claimReferral('abc12345', 'referred-user-1');

      expect(mocks.referralsRepository.createReferral).not.toHaveBeenCalled();
    });
  });

  describe('handleContractCompleted()', () => {
    const baseEvent = {
      contractRequestId: 'cr-1',
      creatorUserId: 'creator-1',
      companyUserId: 'company-1',
      creatorBasePrice: 250,
      totalPrice: 300,
      currency: 'BRL',
      completedAt: new Date('2026-03-28T10:00:00Z'),
    };

    function setupPendingReferral(mocks: ReturnType<typeof createService>['mocks']) {
      mocks.referralsRepository.findPendingByReferredUserIdForUpdate.mockResolvedValue({
        id: 'referral-1',
        partnerUserId: 'partner-1',
        referredUserId: 'creator-1',
        status: ReferralStatus.PENDING,
      });
      mocks.partnerProfilesRepository.findByUserId.mockResolvedValue({
        userId: 'partner-1',
        commissionRatePercent: 10,
        status: PartnerStatus.ACTIVE,
      });
    }

    it('qualifies referral and creates commission on first COMPLETED', async () => {
      const { service, mocks } = createService();
      setupPendingReferral(mocks);

      await service.handleContractCompleted(baseEvent);

      expect(mocks.referralsRepository.qualify).toHaveBeenCalledWith('referral-1', 'cr-1', expect.anything());
      expect(mocks.commissionsService.createCommission).toHaveBeenCalledWith(
        expect.objectContaining({
          referralId: 'referral-1',
          contractRequestId: 'cr-1',
          partnerUserId: 'partner-1',
          grossAmountCents: 25000,
          commissionRatePercent: 10,
          commissionAmountCents: 2500,
          currency: 'BRL',
        }),
        expect.anything(),
      );
    });

    it('calculates commission with floor for fractional cents', async () => {
      const { service, mocks } = createService();
      setupPendingReferral(mocks);

      await service.handleContractCompleted({ ...baseEvent, creatorBasePrice: 250.99 });

      expect(mocks.commissionsService.createCommission).toHaveBeenCalledWith(
        expect.objectContaining({ grossAmountCents: 25099, commissionAmountCents: 2509 }),
        expect.anything(),
      );
    });

    it('does nothing when creator has no referral', async () => {
      const { service, mocks } = createService();

      await service.handleContractCompleted(baseEvent);

      expect(mocks.referralsRepository.qualify).not.toHaveBeenCalled();
      expect(mocks.commissionsService.createCommission).not.toHaveBeenCalled();
    });

    it('does nothing on second COMPLETED (referral already QUALIFIED)', async () => {
      const { service, mocks } = createService();
      mocks.referralsRepository.findPendingByReferredUserIdForUpdate.mockResolvedValue(null);

      await service.handleContractCompleted(baseEvent);

      expect(mocks.commissionsService.createCommission).not.toHaveBeenCalled();
    });
  });

  describe('getMyReferrals()', () => {
    it('returns paginated referrals list', async () => {
      const { service, mocks } = createService();
      const items = [
        {
          id: 'referral-1',
          referredUser: { name: 'João', photoUrl: null },
          status: ReferralStatus.PENDING,
          qualifiedAt: null,
          createdAt: new Date('2026-03-28T10:00:00Z'),
        },
      ];
      mocks.referralsRepository.listByPartner.mockResolvedValue({ items, total: 1 });

      const result = await service.getMyReferrals({ authUserId: 'auth-user-1' }, { page: 1, limit: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(mocks.referralsRepository.listByPartner).toHaveBeenCalledWith(
        expect.objectContaining({ partnerUserId: 'user-1', page: 1, limit: 20 }),
      );
    });

    it('passes status filter to repository', async () => {
      const { service, mocks } = createService();

      await service.getMyReferrals(
        { authUserId: 'auth-user-1' },
        { page: 1, limit: 10, status: ReferralStatus.QUALIFIED },
      );

      expect(mocks.referralsRepository.listByPartner).toHaveBeenCalledWith(
        expect.objectContaining({ status: ReferralStatus.QUALIFIED }),
      );
    });
  });

  describe('getMyCommissions()', () => {
    it('returns paginated commissions list', async () => {
      const { service, mocks } = createService();
      const items = [
        {
          id: 'commission-1',
          referredUserName: 'João',
          grossAmountCents: 25000,
          commissionAmountCents: 2500,
          commissionRatePercent: 10,
          currency: 'BRL',
          status: CommissionStatus.PENDING,
          createdAt: new Date('2026-03-28T10:00:00Z'),
        },
      ];
      mocks.commissionsRepository.listByPartner.mockResolvedValue({ items, total: 1 });

      const result = await service.getMyCommissions({ authUserId: 'auth-user-1' }, { page: 1, limit: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mocks.commissionsRepository.listByPartner).toHaveBeenCalledWith(
        expect.objectContaining({ partnerUserId: 'user-1', page: 1, limit: 20 }),
      );
    });

    it('passes status filter to repository', async () => {
      const { service, mocks } = createService();

      await service.getMyCommissions(
        { authUserId: 'auth-user-1' },
        { page: 1, limit: 10, status: CommissionStatus.PENDING },
      );

      expect(mocks.commissionsRepository.listByPartner).toHaveBeenCalledWith(
        expect.objectContaining({ status: CommissionStatus.PENDING }),
      );
    });
  });

  describe('getMyDashboard()', () => {
    it('returns aggregated dashboard data', async () => {
      const { service, mocks } = createService();

      mocks.referralsRepository.getAggregatesByPartner.mockResolvedValue({
        totalReferrals: 5,
        pendingReferrals: 3,
        qualifiedReferrals: 2,
      });
      mocks.commissionsRepository.getDashboardAggregates.mockResolvedValue({
        totalCommissionAmountCents: 7500,
        pendingCommissionAmountCents: 5000,
        currency: 'BRL',
      });

      const result = await service.getMyDashboard({ authUserId: 'auth-user-1' });

      expect(result).toEqual({
        totalReferrals: 5,
        pendingReferrals: 3,
        qualifiedReferrals: 2,
        totalCommissionAmountCents: 7500,
        pendingCommissionAmountCents: 5000,
        currency: 'BRL',
      });
    });
  });
});
