import { ContractCompletedListener } from './contract-completed.listener';

const baseEvent = {
  contractRequestId: 'cr-1',
  creatorUserId: 'creator-1',
  companyUserId: 'company-1',
  serviceGrossAmountCents: 30000,
  companyTotalAmountCents: 36000,
  currency: 'BRL',
  completedAt: new Date('2026-03-28T12:00:00Z'),
};

describe('ContractCompletedListener', () => {
  function createListener() {
    const referralsService = {
      handleContractCompleted: jest.fn().mockResolvedValue(undefined),
    };
    const listener = new ContractCompletedListener(referralsService as never);
    return { listener, referralsService };
  }

  it('delegates to ReferralsService.handleContractCompleted', async () => {
    const { listener, referralsService } = createListener();

    await listener.handleContractCompleted(baseEvent);

    expect(referralsService.handleContractCompleted).toHaveBeenCalledWith(baseEvent);
  });

  it('catches and does not propagate errors from handleContractCompleted', async () => {
    const { listener, referralsService } = createListener();
    referralsService.handleContractCompleted.mockRejectedValue(new Error('DB timeout'));

    await expect(listener.handleContractCompleted(baseEvent)).resolves.toBeUndefined();
  });

  it('processes event independently of whether referral exists', async () => {
    const { listener, referralsService } = createListener();
    referralsService.handleContractCompleted.mockResolvedValue(undefined);

    await listener.handleContractCompleted(baseEvent);

    expect(referralsService.handleContractCompleted).toHaveBeenCalledTimes(1);
  });
});
