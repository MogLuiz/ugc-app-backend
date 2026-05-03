import { CompanyNotificationsListener } from './company-notifications.listener';
import { ConversationParticipantRole } from '../../conversations/enums/conversation-participant-role.enum';
import { COMPANY_NOTIFICATION_TYPES } from '../company-notification-types';

describe('CompanyNotificationsListener', () => {
  function createListener() {
    const notificationsService = {
      createNotification: jest.fn(),
    };
    const reviewRepo = {
      findOne: jest.fn(),
    };

    const listener = new CompanyNotificationsListener(
      notificationsService as any,
      reviewRepo as any,
    );

    return {
      listener,
      mocks: {
        notificationsService,
        reviewRepo,
      },
    };
  }

  it('creates a company_new_application_received notification', async () => {
    const { listener, mocks } = createListener();

    await listener.handleOpenOfferApplicationCreated({
      openOfferId: 'offer-1',
      applicationId: 'application-1',
      companyUserId: 'company-1',
      creatorId: 'creator-1',
      creatorName: 'Luiz',
      offerTitle: 'Vídeo Presencial',
      occurredAt: new Date('2026-05-03T12:00:00.000Z'),
    });

    expect(mocks.notificationsService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'company-1',
        type: COMPANY_NOTIFICATION_TYPES.NEW_APPLICATION_RECEIVED,
        sourceType: 'open_offer',
        sourceId: 'offer-1',
        dedupeKey: `${COMPANY_NOTIFICATION_TYPES.NEW_APPLICATION_RECEIVED}:application-1`,
        shouldPush: true,
      }),
    );
  });

  it('creates a company_message_received notification for company recipients', async () => {
    const { listener, mocks } = createListener();

    await listener.handleMessageSent({
      messageId: 'message-1',
      conversationId: 'conversation-1',
      contractRequestId: 'contract-1',
      senderUserId: 'creator-1',
      senderName: 'Creator XPTO',
      recipientUserId: 'company-1',
      recipientRole: ConversationParticipantRole.COMPANY,
      createdAt: new Date('2026-05-03T12:00:00.000Z'),
    });

    expect(mocks.notificationsService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'company-1',
        type: COMPANY_NOTIFICATION_TYPES.MESSAGE_RECEIVED,
        sourceType: 'conversation',
        sourceId: 'conversation-1',
        dedupeKey: `${COMPANY_NOTIFICATION_TYPES.MESSAGE_RECEIVED}:message-1`,
        shouldPush: true,
      }),
    );
  });

  it('ignores non-company message recipients', async () => {
    const { listener, mocks } = createListener();

    await listener.handleMessageSent({
      messageId: 'message-1',
      conversationId: 'conversation-1',
      contractRequestId: 'contract-1',
      senderUserId: 'creator-1',
      senderName: 'Creator XPTO',
      recipientUserId: 'creator-1',
      recipientRole: ConversationParticipantRole.CREATOR,
      createdAt: new Date('2026-05-03T12:00:00.000Z'),
    });

    expect(mocks.notificationsService.createNotification).not.toHaveBeenCalled();
  });

  it('creates a company_direct_invite_accepted notification only for direct invites', async () => {
    const { listener, mocks } = createListener();

    await listener.handleContractRequestAccepted({
      contractRequestId: 'contract-1',
      companyUserId: 'company-1',
      creatorId: 'creator-1',
      creatorName: 'Luiz',
      offerTitle: 'Campanha Centro',
      openOfferId: null,
      occurredAt: new Date('2026-05-03T12:00:00.000Z'),
    });

    expect(mocks.notificationsService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'company-1',
        type: COMPANY_NOTIFICATION_TYPES.DIRECT_INVITE_ACCEPTED,
        sourceId: 'contract-1',
        dedupeKey: `${COMPANY_NOTIFICATION_TYPES.DIRECT_INVITE_ACCEPTED}:contract-1`,
        shouldPush: true,
      }),
    );
  });

  it('does not create a direct invite notification for open offer contracts', async () => {
    const { listener, mocks } = createListener();

    await listener.handleContractRequestAccepted({
      contractRequestId: 'contract-1',
      companyUserId: 'company-1',
      creatorId: 'creator-1',
      creatorName: 'Luiz',
      offerTitle: 'Campanha Centro',
      openOfferId: 'offer-1',
      occurredAt: new Date('2026-05-03T12:00:00.000Z'),
    });

    expect(mocks.notificationsService.createNotification).not.toHaveBeenCalled();
  });

  it('creates a company_completion_confirmation_required notification with companyUserId', async () => {
    const { listener, mocks } = createListener();

    await listener.handleAwaitingCompletionConfirmation({
      contractRequestId: 'contract-1',
      creatorUserId: 'creator-1',
      companyUserId: 'company-1',
      contestDeadlineAt: new Date('2026-05-06T12:00:00.000Z'),
      occurredAt: new Date('2026-05-03T12:00:00.000Z'),
    });

    expect(mocks.notificationsService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'company-1',
        type: COMPANY_NOTIFICATION_TYPES.COMPLETION_CONFIRMATION_REQUIRED,
        dedupeKey: `${COMPANY_NOTIFICATION_TYPES.COMPLETION_CONFIRMATION_REQUIRED}:contract-1:awaiting`,
        shouldPush: true,
      }),
    );
  });

  it('creates a review reminder without push when no company review exists', async () => {
    const { listener, mocks } = createListener();
    mocks.reviewRepo.findOne.mockResolvedValue(null);

    await listener.handleContractRequestCompleted({
      contractRequestId: 'contract-1',
      creatorUserId: 'creator-1',
      companyUserId: 'company-1',
      serviceGrossAmountCents: 10000,
      companyTotalAmountCents: 12000,
      currency: 'BRL',
      completedAt: new Date('2026-05-03T12:00:00.000Z'),
    });

    expect(mocks.notificationsService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'company-1',
        type: COMPANY_NOTIFICATION_TYPES.REVIEW_CREATOR_REQUIRED,
        dedupeKey: `${COMPANY_NOTIFICATION_TYPES.REVIEW_CREATOR_REQUIRED}:contract-1`,
        shouldPush: false,
      }),
    );
  });

  it('does not create a review reminder when a company review already exists', async () => {
    const { listener, mocks } = createListener();
    mocks.reviewRepo.findOne.mockResolvedValue({ id: 'review-1' });

    await listener.handleContractRequestCompleted({
      contractRequestId: 'contract-1',
      creatorUserId: 'creator-1',
      companyUserId: 'company-1',
      serviceGrossAmountCents: 10000,
      companyTotalAmountCents: 12000,
      currency: 'BRL',
      completedAt: new Date('2026-05-03T12:00:00.000Z'),
    });

    expect(mocks.notificationsService.createNotification).not.toHaveBeenCalled();
  });
});
