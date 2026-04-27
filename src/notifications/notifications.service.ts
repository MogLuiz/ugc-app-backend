import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { Notification } from './entities/notification.entity';
import { UserPushToken } from './entities/user-push-token.entity';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { PUSH_PROVIDER, PushProvider } from './providers/push-provider.interface';

type CreateNotificationParams = {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sourceType: string;
  sourceId?: string | null;
  dedupeKey?: string | null;
};

type NotificationResponse = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sourceType: string;
  sourceId: string | null;
  dedupeKey: string | null;
  readAt: string | null;
  pushedAt: string | null;
  lastPushError: string | null;
  createdAt: string;
  updatedAt: string;
};

type NotificationsPageResponse = {
  items: NotificationResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type UnreadCountResponse = {
  count: number;
};

type PushTokenResponse = {
  id: string;
  provider: string;
  token: string;
  deviceId: string | null;
  deviceName: string | null;
  platform: string | null;
  appVersion: string | null;
  permissionGranted: boolean;
  lastSeenAt: string;
  invalidatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(UserPushToken)
    private readonly pushTokenRepo: Repository<UserPushToken>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @Inject(PUSH_PROVIDER)
    private readonly pushProvider: PushProvider,
  ) {}

  async createNotification(params: CreateNotificationParams): Promise<NotificationResponse> {
    const title = params.title?.trim() ?? '';
    const body = params.body?.trim() ?? '';
    const type = params.type?.trim() ?? '';
    const sourceType = params.sourceType?.trim() ?? '';
    const sourceId = params.sourceId?.trim() || null;
    const dedupeKey = params.dedupeKey?.trim() || null;

    if (!type) throw new BadRequestException('type é obrigatório');
    if (!title) throw new BadRequestException('title é obrigatório');
    if (!body) throw new BadRequestException('body é obrigatório');
    if (!sourceType) throw new BadRequestException('sourceType é obrigatório');

    if (dedupeKey) {
      const existing = await this.notificationRepo.findOne({
        where: { userId: params.userId, dedupeKey },
      });
      if (existing) {
        return this.toNotificationResponse(existing);
      }
    }

    const notification = this.notificationRepo.create({
      userId: params.userId,
      type,
      title,
      body,
      data: params.data ?? {},
      sourceType,
      sourceId,
      dedupeKey,
      readAt: null,
      pushedAt: null,
      lastPushError: null,
    });

    const saved = await this.notificationRepo.save(notification);
    await this.trySendPush(saved);
    return this.toNotificationResponse(saved);
  }

  async listMyNotifications(
    authUser: AuthUser,
    query: ListNotificationsDto,
  ): Promise<NotificationsPageResponse> {
    const user = await this.requireUser(authUser.authUserId);
    const page = parsePositiveInt(query.page, 1);
    const limit = Math.min(parsePositiveInt(query.limit, 20), 100);
    const skip = (page - 1) * limit;

    const [items, total] = await this.notificationRepo.findAndCount({
      where: { userId: user.id },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip,
      take: limit,
    });

    return {
      items: items.map((item) => this.toNotificationResponse(item)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getUnreadCount(authUser: AuthUser): Promise<UnreadCountResponse> {
    const user = await this.requireUser(authUser.authUserId);
    const count = await this.notificationRepo.count({
      where: {
        userId: user.id,
        readAt: IsNull(),
      },
    });

    return { count };
  }

  async markAsRead(authUser: AuthUser, notificationId: string): Promise<NotificationResponse> {
    const user = await this.requireUser(authUser.authUserId);
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notificação não encontrada');
    }

    if (notification.userId !== user.id) {
      throw new ForbiddenException('Você não pode alterar esta notificação');
    }

    if (!notification.readAt) {
      notification.readAt = new Date();
      await this.notificationRepo.save(notification);
    }

    return this.toNotificationResponse(notification);
  }

  async markAllAsRead(authUser: AuthUser): Promise<{ updatedCount: number }> {
    const user = await this.requireUser(authUser.authUserId);
    const now = new Date();

    const result = await this.notificationRepo
      .createQueryBuilder()
      .update(Notification)
      .set({ readAt: now })
      .where('user_id = :userId', { userId: user.id })
      .andWhere('read_at IS NULL')
      .execute();

    return { updatedCount: result.affected ?? 0 };
  }

  async registerPushToken(
    authUser: AuthUser,
    dto: RegisterPushTokenDto,
  ): Promise<PushTokenResponse> {
    const user = await this.requireUser(authUser.authUserId);
    const token = dto.token?.trim() ?? '';
    const provider = dto.provider?.trim() || 'expo';
    const now = new Date();

    if (!token) {
      throw new BadRequestException('token é obrigatório');
    }

    const existing = await this.pushTokenRepo.findOne({ where: { token } });
    const entity = existing ?? this.pushTokenRepo.create({ token });

    entity.userId = user.id;
    entity.provider = provider;
    entity.token = token;
    entity.deviceId = dto.deviceId?.trim() || null;
    entity.deviceName = dto.deviceName?.trim() || null;
    entity.platform = dto.platform?.trim() || null;
    entity.appVersion = dto.appVersion?.trim() || null;
    entity.permissionGranted = dto.permissionGranted ?? true;
    entity.lastSeenAt = now;
    entity.invalidatedAt = null;

    const saved = await this.pushTokenRepo.save(entity);
    return this.toPushTokenResponse(saved);
  }

  async unregisterPushToken(
    authUser: AuthUser,
    token: string,
  ): Promise<{ success: true; invalidatedAt: string | null }> {
    const user = await this.requireUser(authUser.authUserId);
    const trimmedToken = token?.trim() ?? '';

    if (!trimmedToken) {
      throw new BadRequestException('token é obrigatório');
    }

    const existing = await this.pushTokenRepo.findOne({
      where: { userId: user.id, token: trimmedToken },
    });

    if (!existing) {
      return { success: true, invalidatedAt: null };
    }

    if (!existing.invalidatedAt) {
      existing.invalidatedAt = new Date();
      await this.pushTokenRepo.save(existing);
    }

    return {
      success: true,
      invalidatedAt: existing.invalidatedAt?.toISOString() ?? null,
    };
  }

  private async requireUser(authUserId: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { authUserId } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return user;
  }

  private async trySendPush(notification: Notification): Promise<void> {
    try {
      const activeTokens = await this.pushTokenRepo.find({
        where: {
          userId: notification.userId,
          invalidatedAt: IsNull(),
        },
      });

      if (activeTokens.length === 0) {
        return;
      }

      const result = await this.pushProvider.sendToUser(notification, activeTokens);

      if (result.invalidTokens.length > 0) {
        await this.invalidateTokens(result.invalidTokens);
      }

      let shouldPersist = false;

      if (result.sentCount > 0 && !notification.pushedAt) {
        notification.pushedAt = new Date();
        shouldPersist = true;
      }

      const nextError = result.errors.length > 0 ? result.errors.join(' | ').slice(0, 2000) : null;
      if (notification.lastPushError !== nextError) {
        notification.lastPushError = nextError;
        shouldPersist = true;
      }

      if (shouldPersist) {
        await this.notificationRepo.save(notification);
      }
    } catch (error) {
      notification.lastPushError = this.formatPushError(error);
      await this.notificationRepo.save(notification);
    }
  }

  private async invalidateTokens(tokens: string[]): Promise<void> {
    if (tokens.length === 0) {
      return;
    }

    await this.pushTokenRepo
      .createQueryBuilder()
      .update(UserPushToken)
      .set({ invalidatedAt: new Date() })
      .where('token IN (:...tokens)', { tokens })
      .andWhere('invalidated_at IS NULL')
      .execute();
  }

  private formatPushError(error: unknown): string {
    if (error instanceof Error) {
      return error.message.slice(0, 2000);
    }

    return 'Falha ao enviar push'.slice(0, 2000);
  }

  private toNotificationResponse(item: Notification): NotificationResponse {
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      body: item.body,
      data: item.data ?? {},
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      dedupeKey: item.dedupeKey,
      readAt: item.readAt?.toISOString() ?? null,
      pushedAt: item.pushedAt?.toISOString() ?? null,
      lastPushError: item.lastPushError,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private toPushTokenResponse(item: UserPushToken): PushTokenResponse {
    return {
      id: item.id,
      provider: item.provider,
      token: item.token,
      deviceId: item.deviceId,
      deviceName: item.deviceName,
      platform: item.platform,
      appVersion: item.appVersion,
      permissionGranted: item.permissionGranted,
      lastSeenAt: item.lastSeenAt.toISOString(),
      invalidatedAt: item.invalidatedAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}
