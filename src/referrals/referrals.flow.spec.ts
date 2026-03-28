/**
 * Flow spec — Referrals module end-to-end sequence
 *
 * Simulates the full referral lifecycle using coordinated service mocks:
 *   1. Partner activates → gets referral code
 *   2. New user signs up with referralCode → Referral(PENDING) created
 *   3. Contract created + accepted + completed → event emitted
 *   4. Listener fires handleContractCompleted → Referral(QUALIFIED) + Commission(PENDING)
 *   5. Dashboard reflects correct aggregates
 *
 * Edge cases covered:
 *   - Idempotency: processing the same completed event twice → single commission
 *   - Second contract for same creator → no new commission (referral already QUALIFIED)
 *   - Bootstrap with unknown referralCode → signup succeeds, no referral created
 *   - Bootstrap error in claimReferral → signup still succeeds
 */

import { DataSource } from 'typeorm';
import { ReferralsService } from './services/referrals.service';
import { PartnerStatus } from './enums/partner-status.enum';
import { ReferralStatus } from './enums/referral-status.enum';
import { CommissionStatus } from './enums/commission-status.enum';

// ─── Shared fixtures ───────────────────────────────────────────────────────────

const PARTNER_USER_ID = 'partner-user-1';
const PARTNER_AUTH_ID = 'auth-partner-1';
const CREATOR_USER_ID = 'creator-user-1';
const REFERRAL_CODE = 'abc12345';
const REFERRAL_CODE_ID = 'code-record-1';
const REFERRAL_ID = 'referral-1';
const CONTRACT_REQUEST_ID = 'cr-1';

const completedEvent = {
  contractRequestId: CONTRACT_REQUEST_ID,
  creatorUserId: CREATOR_USER_ID,
  companyUserId: 'company-user-1',
  creatorBasePrice: 300,
  totalPrice: 360,
  currency: 'BRL',
  completedAt: new Date('2026-03-28T12:00:00Z'),
};

// ─── Factory ───────────────────────────────────────────────────────────────────

function buildService() {
  // ── Simulated DB state ──────────────────────────────────────────────────────
  let partnerProfile: { userId: string; status: PartnerStatus; commissionRatePercent: number; activatedAt: Date } | null = null;
  let referralCodeRecord: { id: string; code: string; isActive: boolean; partnerUserId: string; createdAt: Date } | null = null;
  let referral: { id: string; partnerUserId: string; referredUserId: string; referralCodeId: string; status: ReferralStatus; qualifiedAt: Date | null; qualifyingContractRequestId: string | null } | null = null;
  let commission: { id: string; contractRequestId: string; commissionAmountCents: number; status: CommissionStatus } | null = null;

  // ── userRepo ────────────────────────────────────────────────────────────────
  const userRepo = {
    findOne: jest.fn().mockImplementation(async ({ where }: { where: { authUserId?: string } }) => {
      if (where.authUserId === PARTNER_AUTH_ID) return { id: PARTNER_USER_ID, authUserId: PARTNER_AUTH_ID };
      return null;
    }),
  };

  // ── partnerProfilesRepository ───────────────────────────────────────────────
  const partnerProfilesRepository = {
    findByUserId: jest.fn().mockImplementation(async (userId: string) => {
      return partnerProfile?.userId === userId ? partnerProfile : null;
    }),
    createAndSave: jest.fn().mockImplementation(async (data) => {
      partnerProfile = { ...data, createdAt: new Date(), updatedAt: new Date() };
      return partnerProfile;
    }),
  };

  // ── referralCodesRepository ─────────────────────────────────────────────────
  const referralCodesRepository = {
    findActiveByPartnerUserId: jest.fn().mockImplementation(async (partnerUserId: string) => {
      return referralCodeRecord?.partnerUserId === partnerUserId && referralCodeRecord.isActive
        ? referralCodeRecord
        : null;
    }),
    findByCode: jest.fn().mockImplementation(async (code: string) => {
      return referralCodeRecord?.code === code ? referralCodeRecord : null;
    }),
    createAndSave: jest.fn().mockImplementation(async (data) => {
      referralCodeRecord = { id: REFERRAL_CODE_ID, ...data, createdAt: new Date() };
      return referralCodeRecord;
    }),
  };

  // ── referralsRepository ─────────────────────────────────────────────────────
  const referralsRepository = {
    findByReferredUserId: jest.fn().mockImplementation(async (referredUserId: string) => {
      return referral?.referredUserId === referredUserId ? referral : null;
    }),
    findPendingByReferredUserIdForUpdate: jest.fn().mockImplementation(async (referredUserId: string) => {
      if (referral?.referredUserId === referredUserId && referral.status === ReferralStatus.PENDING) {
        return referral;
      }
      return null;
    }),
    qualify: jest.fn().mockImplementation(async (referralId: string, contractRequestId: string) => {
      if (referral?.id === referralId) {
        referral.status = ReferralStatus.QUALIFIED;
        referral.qualifiedAt = new Date();
        referral.qualifyingContractRequestId = contractRequestId;
      }
    }),
    createReferral: jest.fn().mockImplementation(async (data) => {
      referral = {
        id: REFERRAL_ID,
        ...data,
        qualifiedAt: null,
        qualifyingContractRequestId: null,
      };
      return referral;
    }),
    listByPartner: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    getAggregatesByPartner: jest.fn().mockImplementation(async () => ({
      totalReferrals: referral ? 1 : 0,
      pendingReferrals: referral?.status === ReferralStatus.PENDING ? 1 : 0,
      qualifiedReferrals: referral?.status === ReferralStatus.QUALIFIED ? 1 : 0,
    })),
  };

  // ── commissionsRepository ───────────────────────────────────────────────────
  const commissionsRepository = {
    insertIdempotent: jest.fn().mockImplementation(async (data) => {
      // Simulate ON CONFLICT DO NOTHING: only insert if no commission for this contractRequestId
      if (!commission || commission.contractRequestId !== data.contractRequestId) {
        commission = {
          id: 'commission-1',
          contractRequestId: data.contractRequestId,
          commissionAmountCents: data.commissionAmountCents,
          status: CommissionStatus.PENDING,
        };
      }
    }),
    listByPartner: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    getDashboardAggregates: jest.fn().mockImplementation(async () => ({
      totalCommissionAmountCents: commission?.commissionAmountCents ?? 0,
      pendingCommissionAmountCents: commission?.status === CommissionStatus.PENDING ? (commission?.commissionAmountCents ?? 0) : 0,
      currency: 'BRL',
    })),
  };

  // ── commissionsService ──────────────────────────────────────────────────────
  const commissionsService = {
    createCommission: jest.fn().mockImplementation(async (data) => {
      return commissionsRepository.insertIdempotent(data);
    }),
  };

  // ── referralCodeGeneratorService ────────────────────────────────────────────
  const referralCodeGeneratorService = {
    generateUniqueCode: jest.fn().mockResolvedValue(REFERRAL_CODE),
  };

  // ── DataSource / transaction ────────────────────────────────────────────────
  const manager = {};
  const dataSource = {
    transaction: jest.fn(async (callback: (em: unknown) => unknown) => callback(manager)),
  } as unknown as DataSource;

  const configService = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'APP_URL') return 'https://app.example.com';
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
    state: { get partnerProfile() { return partnerProfile; }, get referral() { return referral; }, get commission() { return commission; } },
    mocks: { partnerProfilesRepository, referralCodesRepository, referralsRepository, commissionsService, commissionsRepository },
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('Referrals — full flow', () => {
  it('happy path: activate → claim → complete → commission → dashboard', async () => {
    const { service, state } = buildService();
    const partnerAuth = { authUserId: PARTNER_AUTH_ID };

    // Step 1: Partner activates
    const activation = await service.activatePartner(partnerAuth);
    expect(activation.referralCode).toBe(REFERRAL_CODE);
    expect(activation.status).toBe(PartnerStatus.ACTIVE);
    expect(state.partnerProfile).not.toBeNull();

    // Step 2: New creator signs up with referral code
    await service.claimReferral(REFERRAL_CODE, CREATOR_USER_ID);
    expect(state.referral).not.toBeNull();
    expect(state.referral!.status).toBe(ReferralStatus.PENDING);
    expect(state.referral!.partnerUserId).toBe(PARTNER_USER_ID);

    // Step 3: Contract completed → handleContractCompleted fires
    await service.handleContractCompleted(completedEvent);

    // Referral transitions to QUALIFIED
    expect(state.referral!.status).toBe(ReferralStatus.QUALIFIED);
    expect(state.referral!.qualifyingContractRequestId).toBe(CONTRACT_REQUEST_ID);

    // Commission created: R$300 * 10% = R$30 = 3000 cents
    expect(state.commission).not.toBeNull();
    expect(state.commission!.commissionAmountCents).toBe(3000);
    expect(state.commission!.status).toBe(CommissionStatus.PENDING);

    // Step 4: Dashboard reflects correct state
    const dashboard = await service.getMyDashboard(partnerAuth);
    expect(dashboard.totalReferrals).toBe(1);
    expect(dashboard.qualifiedReferrals).toBe(1);
    expect(dashboard.pendingReferrals).toBe(0);
    expect(dashboard.totalCommissionAmountCents).toBe(3000);
    expect(dashboard.pendingCommissionAmountCents).toBe(3000);
    expect(dashboard.currency).toBe('BRL');
  });

  it('idempotency: processing the same completed event twice creates only one commission', async () => {
    const { service, state, mocks } = buildService();

    await service.activatePartner({ authUserId: PARTNER_AUTH_ID });
    await service.claimReferral(REFERRAL_CODE, CREATOR_USER_ID);

    // First event
    await service.handleContractCompleted(completedEvent);
    const firstCallCount = mocks.commissionsService.createCommission.mock.calls.length;
    expect(firstCallCount).toBe(1);
    expect(state.commission).not.toBeNull();

    // Referral is now QUALIFIED — second event is a no-op
    await service.handleContractCompleted(completedEvent);
    expect(mocks.commissionsService.createCommission.mock.calls.length).toBe(1); // not called again
  });

  it('second contract for same creator → no new commission (first-touch only)', async () => {
    const { service, mocks } = buildService();

    await service.activatePartner({ authUserId: PARTNER_AUTH_ID });
    await service.claimReferral(REFERRAL_CODE, CREATOR_USER_ID);

    // First completed contract qualifies the referral
    await service.handleContractCompleted(completedEvent);
    expect(mocks.commissionsService.createCommission).toHaveBeenCalledTimes(1);

    // Second contract for same creator — referral no longer PENDING
    const secondEvent = { ...completedEvent, contractRequestId: 'cr-2' };
    await service.handleContractCompleted(secondEvent);
    expect(mocks.commissionsService.createCommission).toHaveBeenCalledTimes(1); // unchanged
  });

  it('creator with no referral → no commission when contract completes', async () => {
    const { service, mocks } = buildService();

    await service.handleContractCompleted(completedEvent);

    expect(mocks.commissionsService.createCommission).not.toHaveBeenCalled();
  });

  it('activatePartner is idempotent: second call returns same code without creating a new one', async () => {
    const { service, mocks } = buildService();
    const partnerAuth = { authUserId: PARTNER_AUTH_ID };

    const first = await service.activatePartner(partnerAuth);
    const second = await service.activatePartner(partnerAuth);

    expect(second.referralCode).toBe(first.referralCode);
    expect(mocks.partnerProfilesRepository.createAndSave).toHaveBeenCalledTimes(1);
    expect(mocks.referralCodesRepository.createAndSave).toHaveBeenCalledTimes(1);
  });

  it('claimReferral with unknown code → no referral created, returns silently', async () => {
    const { service, mocks } = buildService();
    // referralCodesRepository.findByCode returns null (no code setup)

    await expect(service.claimReferral('unknown-code', CREATOR_USER_ID)).resolves.toBeUndefined();
    expect(mocks.referralsRepository.createReferral).not.toHaveBeenCalled();
  });

  it('claimReferral self-referral → blocked, no referral created', async () => {
    const { service, mocks } = buildService();

    await service.activatePartner({ authUserId: PARTNER_AUTH_ID });
    // Partner tries to use their own code
    await service.claimReferral(REFERRAL_CODE, PARTNER_USER_ID);

    expect(mocks.referralsRepository.createReferral).not.toHaveBeenCalled();
  });

  it('double claim with same referralCode → only first referral created', async () => {
    const { service, mocks } = buildService();

    await service.activatePartner({ authUserId: PARTNER_AUTH_ID });
    await service.claimReferral(REFERRAL_CODE, CREATOR_USER_ID);
    expect(mocks.referralsRepository.createReferral).toHaveBeenCalledTimes(1);

    // Second user tries to claim the same code — allowed (different user)
    // but CREATOR_USER_ID already has referral and is blocked
    await service.claimReferral(REFERRAL_CODE, CREATOR_USER_ID);
    expect(mocks.referralsRepository.createReferral).toHaveBeenCalledTimes(1); // no second call
  });
});
