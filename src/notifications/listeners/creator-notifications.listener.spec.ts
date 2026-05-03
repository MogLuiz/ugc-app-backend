import { CreatorNotificationsListener } from './creator-notifications.listener';
import { ConversationParticipantRole } from '../../conversations/enums/conversation-participant-role.enum';
import { CREATOR_NOTIFICATION_TYPES } from '../creator-notification-types';
import { PayoutStatus } from '../../payments/enums/payout-status.enum';

describe('CreatorNotificationsListener', () => {
  function createListener() {
    const notificationsService = {
      createNotification: jest.fn(),
    };
    const contractRequestRepo = {
      findOne: jest.fn(),
    };
    const payoutRepo = {
      findOne: jest.fn(),
    };

    const listener = new CreatorNotificationsListener(
      notificationsService as any,
      contractRequestRepo as any,
      payoutRepo as any,
    );

    return {
      listener,
      mocks: {
        notificationsService,
        contractRequestRepo,
        payoutRepo,
      },
    };
  }

  it('creates a message_received notification for creator recipients', async () => {
    const { listener, mocks } = createListener();

    await listener.handleMessageSent({
      messageId: 'message-1',
      conversationId: 'conversation-1',
      contractRequestId: 'contract-1',
      senderUserId: 'company-1',
      senderName: 'Empresa XPTO',
      recipientUserId: 'creator-1',
      recipientRole: ConversationParticipantRole.CREATOR,
      createdAt: new Date('2026-04-27T12:00:00.000Z'),
    });

    expect(mocks.notificationsService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'creator-1',
        type: CREATOR_NOTIFICATION_TYPES.MESSAGE_RECEIVED,
        sourceType: 'conversation',
        sourceId: 'conversation-1',
        dedupeKey: `${CREATOR_NOTIFICATION_TYPES.MESSAGE_RECEIVED}:message-1`,
      }),
    );
  });

  it('creates a direct_invite_received notification once the contract becomes visible', async () => {
    const { listener, mocks } = createListener();
    mocks.contractRequestRepo.findOne.mockResolvedValue({
      id: 'contract-1',
      openOfferId: null,
      companyUser: {
        profile: { name: 'Empresa fallback' },
        companyProfile: { companyName: 'UGC Company' },
      },
    });

    await listener.handleContractVisibleToCreator({
      contractRequestId: 'contract-1',
      creatorUserId: 'creator-1',
      reason: 'direct_invite_received',
      paymentId: 'payment-1',
      occurredAt: new Date('2026-04-27T12:00:00.000Z'),
    });

    expect(mocks.notificationsService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'creator-1',
        type: CREATOR_NOTIFICATION_TYPES.DIRECT_INVITE_RECEIVED,
        sourceType: 'contract_request',
        sourceId: 'contract-1',
        dedupeKey: 'direct_invite_received:contract-1:visible',
        data: expect.objectContaining({
          companyName: 'UGC Company',
          paymentId: 'payment-1',
        }),
      }),
    );
  });

  it('creates a completion_confirmation_required notification', async () => {
    const { listener, mocks } = createListener();

    await listener.handleAwaitingCompletionConfirmation({
      contractRequestId: 'contract-1',
      creatorUserId: 'creator-1',
      companyUserId: 'company-1',
      contestDeadlineAt: new Date('2026-05-01T12:00:00.000Z'),
      occurredAt: new Date('2026-04-27T12:00:00.000Z'),
    });

    expect(mocks.notificationsService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'creator-1',
        type: CREATOR_NOTIFICATION_TYPES.COMPLETION_CONFIRMATION_REQUIRED,
        dedupeKey: `${CREATOR_NOTIFICATION_TYPES.COMPLETION_CONFIRMATION_REQUIRED}:contract-1:awaiting`,
      }),
    );
  });

  it('creates a payout_updated notification for paid payouts', async () => {
    const { listener, mocks } = createListener();
    mocks.payoutRepo.findOne.mockResolvedValue({
      id: 'payout-1',
      amountCents: 17000,
      currency: 'BRL',
    });

    await listener.handleCreatorPayoutUpdated({
      payoutId: 'payout-1',
      creatorUserId: 'creator-1',
      paymentId: 'payment-1',
      contractRequestId: 'contract-1',
      status: PayoutStatus.PAID,
      occurredAt: new Date('2026-04-27T12:00:00.000Z'),
    });

    expect(mocks.notificationsService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'creator-1',
        type: CREATOR_NOTIFICATION_TYPES.PAYOUT_UPDATED,
        sourceType: 'payout',
        sourceId: 'payout-1',
        dedupeKey: `${CREATOR_NOTIFICATION_TYPES.PAYOUT_UPDATED}:payout-1:${PayoutStatus.PAID}`,
      }),
    );
  });
});
