import { Notification } from '../entities/notification.entity';
import { UserPushToken } from '../entities/user-push-token.entity';

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

export type PushProviderPayload = {
  title: string;
  body: string;
  data: Record<string, unknown>;
};

export type PushProviderResult = {
  sentCount: number;
  invalidTokens: string[];
  errors: string[];
};

export interface PushProvider {
  sendToUser(
    notification: Notification,
    tokens: UserPushToken[],
  ): Promise<PushProviderResult>;
  sendToTokens(
    tokens: UserPushToken[],
    payload: PushProviderPayload,
  ): Promise<PushProviderResult>;
}
