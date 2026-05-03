import { NotificationsService } from './notifications.service';
import { Notification } from './entities/notification.entity';
import { UserPushToken } from './entities/user-push-token.entity';

describe('NotificationsService', () => {
  function createService() {
    const notificationRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
    };
    const pushTokenUpdate = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    };
    const pushTokenRepo = {
      find: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(pushTokenUpdate),
    };
    const userRepo = {
      findOne: jest.fn(),
    };
    const pushProvider = {
      sendToUser: jest.fn(),
    };

    const service = new NotificationsService(
      notificationRepo as any,
      pushTokenRepo as any,
      userRepo as any,
      pushProvider as any,
    );

    return {
      service,
      mocks: {
        notificationRepo,
        pushTokenRepo,
        pushTokenUpdate,
        userRepo,
        pushProvider,
      },
    };
  }

  function buildNotification(overrides: Partial<Notification> = {}): Notification {
    return {
      id: 'notification-1',
      userId: 'user-1',
      type: 'message_received',
      title: 'Nova mensagem',
      body: 'Você recebeu uma nova mensagem',
      data: {},
      sourceType: 'conversation',
      sourceId: 'conversation-1',
      dedupeKey: null,
      readAt: null,
      pushedAt: null,
      lastPushError: null,
      createdAt: new Date('2026-04-27T12:00:00.000Z'),
      updatedAt: new Date('2026-04-27T12:00:00.000Z'),
      user: undefined as any,
      ...overrides,
    };
  }

  it('creates a notification without trying push when the user has no active token', async () => {
    const { service, mocks } = createService();
    const notification = buildNotification();

    mocks.notificationRepo.findOne.mockResolvedValue(null);
    mocks.notificationRepo.create.mockReturnValue(notification);
    mocks.notificationRepo.save.mockResolvedValue(notification);
    mocks.pushTokenRepo.find.mockResolvedValue([]);

    const result = await service.createNotification({
      userId: 'user-1',
      type: 'message_received',
      title: 'Nova mensagem',
      body: 'Você recebeu uma nova mensagem',
      sourceType: 'conversation',
      sourceId: 'conversation-1',
    });

    expect(mocks.pushProvider.sendToUser).not.toHaveBeenCalled();
    expect(result.pushedAt).toBeNull();
    expect(result.lastPushError).toBeNull();
  });

  it('fills pushedAt when push is accepted for an active token', async () => {
    const { service, mocks } = createService();
    const notification = buildNotification();
    const savedWithPush = buildNotification({
      pushedAt: new Date('2026-04-27T12:01:00.000Z'),
    });
    const token: UserPushToken = {
      id: 'token-1',
      userId: 'user-1',
      provider: 'expo',
      token: 'ExponentPushToken[test123]',
      deviceId: null,
      deviceName: null,
      platform: null,
      appVersion: null,
      permissionGranted: true,
      lastSeenAt: new Date('2026-04-27T12:00:00.000Z'),
      invalidatedAt: null,
      createdAt: new Date('2026-04-27T12:00:00.000Z'),
      updatedAt: new Date('2026-04-27T12:00:00.000Z'),
      user: undefined as any,
    };

    mocks.notificationRepo.findOne.mockResolvedValue(null);
    mocks.notificationRepo.create.mockReturnValue(notification);
    mocks.notificationRepo.save
      .mockResolvedValueOnce(notification)
      .mockResolvedValueOnce(savedWithPush);
    mocks.pushTokenRepo.find.mockResolvedValue([token]);
    mocks.pushProvider.sendToUser.mockResolvedValue({
      sentCount: 1,
      invalidTokens: [],
      errors: [],
    });

    const result = await service.createNotification({
      userId: 'user-1',
      type: 'message_received',
      title: 'Nova mensagem',
      body: 'Você recebeu uma nova mensagem',
      sourceType: 'conversation',
      sourceId: 'conversation-1',
    });

    expect(mocks.pushProvider.sendToUser).toHaveBeenCalledWith(notification, [token]);
    expect(mocks.notificationRepo.save).toHaveBeenCalledTimes(2);
    expect(result.pushedAt).not.toBeNull();
    expect(result.lastPushError).toBeNull();
  });

  it('does not break notification creation when push provider throws', async () => {
    const { service, mocks } = createService();
    const notification = buildNotification();
    const savedWithError = buildNotification({
      lastPushError: 'Expo indisponível',
    });
    const token: UserPushToken = {
      id: 'token-1',
      userId: 'user-1',
      provider: 'expo',
      token: 'ExponentPushToken[test123]',
      deviceId: null,
      deviceName: null,
      platform: null,
      appVersion: null,
      permissionGranted: true,
      lastSeenAt: new Date('2026-04-27T12:00:00.000Z'),
      invalidatedAt: null,
      createdAt: new Date('2026-04-27T12:00:00.000Z'),
      updatedAt: new Date('2026-04-27T12:00:00.000Z'),
      user: undefined as any,
    };

    mocks.notificationRepo.findOne.mockResolvedValue(null);
    mocks.notificationRepo.create.mockReturnValue(notification);
    mocks.notificationRepo.save
      .mockResolvedValueOnce(notification)
      .mockResolvedValueOnce(savedWithError);
    mocks.pushTokenRepo.find.mockResolvedValue([token]);
    mocks.pushProvider.sendToUser.mockRejectedValue(new Error('Expo indisponível'));

    const result = await service.createNotification({
      userId: 'user-1',
      type: 'message_received',
      title: 'Nova mensagem',
      body: 'Você recebeu uma nova mensagem',
      sourceType: 'conversation',
      sourceId: 'conversation-1',
    });

    expect(result.id).toBe('notification-1');
    expect(mocks.notificationRepo.save).toHaveBeenCalledTimes(2);
    expect(result.lastPushError).toBe(savedWithError.lastPushError);
  });

  it('invalidates tokens logically when the push provider reports invalid tokens', async () => {
    const { service, mocks } = createService();
    const notification = buildNotification();
    const token: UserPushToken = {
      id: 'token-1',
      userId: 'user-1',
      provider: 'expo',
      token: 'ExponentPushToken[test123]',
      deviceId: null,
      deviceName: null,
      platform: null,
      appVersion: null,
      permissionGranted: true,
      lastSeenAt: new Date('2026-04-27T12:00:00.000Z'),
      invalidatedAt: null,
      createdAt: new Date('2026-04-27T12:00:00.000Z'),
      updatedAt: new Date('2026-04-27T12:00:00.000Z'),
      user: undefined as any,
    };

    mocks.notificationRepo.findOne.mockResolvedValue(null);
    mocks.notificationRepo.create.mockReturnValue(notification);
    mocks.notificationRepo.save.mockResolvedValue(notification);
    mocks.pushTokenRepo.find.mockResolvedValue([token]);
    mocks.pushProvider.sendToUser.mockResolvedValue({
      sentCount: 0,
      invalidTokens: [token.token],
      errors: ['DeviceNotRegistered: Token inválido'],
    });

    await service.createNotification({
      userId: 'user-1',
      type: 'message_received',
      title: 'Nova mensagem',
      body: 'Você recebeu uma nova mensagem',
      sourceType: 'conversation',
      sourceId: 'conversation-1',
    });

    expect(mocks.pushTokenRepo.createQueryBuilder).toHaveBeenCalled();
    expect(mocks.pushTokenUpdate.update).toHaveBeenCalledWith(UserPushToken);
    expect(mocks.pushTokenUpdate.where).toHaveBeenCalledWith('token IN (:...tokens)', {
      tokens: [token.token],
    });
    expect(mocks.pushTokenUpdate.execute).toHaveBeenCalled();
  });

  it('creates an in-app only notification when shouldPush is false', async () => {
    const { service, mocks } = createService();
    const notification = buildNotification();

    mocks.notificationRepo.findOne.mockResolvedValue(null);
    mocks.notificationRepo.create.mockReturnValue(notification);
    mocks.notificationRepo.save.mockResolvedValue(notification);

    const result = await service.createNotification({
      userId: 'user-1',
      type: 'company_review_creator_required',
      title: 'Avalie o creator',
      body: 'O trabalho foi concluído. Falta sua avaliação.',
      sourceType: 'contract_request',
      sourceId: 'contract-1',
      shouldPush: false,
    });

    expect(mocks.pushProvider.sendToUser).not.toHaveBeenCalled();
    expect(mocks.pushTokenRepo.find).not.toHaveBeenCalled();
    expect(result.pushedAt).toBeNull();
  });
});
