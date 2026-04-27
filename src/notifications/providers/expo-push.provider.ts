import { Injectable, Logger } from '@nestjs/common';
import { Expo, ExpoPushMessage, ExpoPushReceipt, ExpoPushTicket } from 'expo-server-sdk';
import { Notification } from '../entities/notification.entity';
import { UserPushToken } from '../entities/user-push-token.entity';
import {
  PushProvider,
  PushProviderPayload,
  PushProviderResult,
} from './push-provider.interface';

function maskToken(token: string): string {
  if (token.length <= 10) return '***';
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

function stringifyError(code: string, message: string): string {
  return `${code}: ${message}`.slice(0, 500);
}

@Injectable()
export class ExpoPushProvider implements PushProvider {
  private readonly logger = new Logger(ExpoPushProvider.name);
  private readonly expo = new Expo();

  async sendToUser(
    notification: Notification,
    tokens: UserPushToken[],
  ): Promise<PushProviderResult> {
    return this.sendToTokens(tokens, {
      title: notification.title,
      body: notification.body,
      data: {
        notificationId: notification.id,
        type: notification.type,
        sourceType: notification.sourceType,
        sourceId: notification.sourceId,
        data: notification.data ?? {},
      },
    });
  }

  async sendToTokens(
    tokens: UserPushToken[],
    payload: PushProviderPayload,
  ): Promise<PushProviderResult> {
    const activeTokens = tokens.filter((token) => token.invalidatedAt == null);
    if (activeTokens.length === 0) {
      return { sentCount: 0, invalidTokens: [], errors: [] };
    }

    const errors: string[] = [];
    const invalidTokens = new Set<string>();
    const validTokens = activeTokens.filter((token) => {
      const isValid = Expo.isExpoPushToken(token.token);
      if (!isValid) {
        invalidTokens.add(token.token);
        errors.push(
          stringifyError('InvalidExpoPushToken', `Token inválido (${maskToken(token.token)})`),
        );
      }
      return isValid;
    });

    if (validTokens.length === 0) {
      return { sentCount: 0, invalidTokens: [...invalidTokens], errors };
    }

    const messages: ExpoPushMessage[] = validTokens.map((token) => ({
      to: token.token,
      sound: 'default',
      title: payload.title,
      body: payload.body,
      data: payload.data,
    }));

    let sentCount = 0;
    const receiptIdsByToken = new Map<string, string>();

    for (const chunk of this.expo.chunkPushNotifications(messages)) {
      const tickets = await this.expo.sendPushNotificationsAsync(chunk);
      this.handleTickets(chunk, tickets, receiptIdsByToken, invalidTokens, errors);
      sentCount += tickets.filter((ticket) => ticket.status === 'ok').length;
    }

    await this.handleReceipts(receiptIdsByToken, invalidTokens, errors);

    return {
      sentCount,
      invalidTokens: [...invalidTokens],
      errors,
    };
  }

  private handleTickets(
    chunk: ExpoPushMessage[],
    tickets: ExpoPushTicket[],
    receiptIdsByToken: Map<string, string>,
    invalidTokens: Set<string>,
    errors: string[],
  ): void {
    tickets.forEach((ticket, index) => {
      const token = String(chunk[index]?.to ?? '');
      if (ticket.status === 'ok') {
        if (ticket.id) {
          receiptIdsByToken.set(ticket.id, token);
        }
        return;
      }

      const code = ticket.details?.error ?? 'PushTicketError';
      const message = ticket.message ?? 'Falha ao enviar push';
      errors.push(stringifyError(code, message));

      if (code === 'DeviceNotRegistered') {
        invalidTokens.add(token);
      }
    });
  }

  private async handleReceipts(
    receiptIdsByToken: Map<string, string>,
    invalidTokens: Set<string>,
    errors: string[],
  ): Promise<void> {
    const receiptIds = [...receiptIdsByToken.keys()];
    if (receiptIds.length === 0) {
      return;
    }

    for (const chunk of this.expo.chunkPushNotificationReceiptIds(receiptIds)) {
      try {
        const receipts = await this.expo.getPushNotificationReceiptsAsync(chunk);
        for (const [receiptId, receipt] of Object.entries(receipts)) {
          this.handleReceipt(
            receiptId,
            receipt,
            receiptIdsByToken,
            invalidTokens,
            errors,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Falha ao consultar receipts do Expo: ${(error as Error).message}`,
        );
        errors.push(
          stringifyError(
            'ExpoReceiptLookupFailed',
            (error as Error).message ?? 'Falha ao consultar receipts',
          ),
        );
      }
    }
  }

  private handleReceipt(
    receiptId: string,
    receipt: ExpoPushReceipt,
    receiptIdsByToken: Map<string, string>,
    invalidTokens: Set<string>,
    errors: string[],
  ): void {
    if (receipt.status === 'ok') {
      return;
    }

    const code = receipt.details?.error ?? 'PushReceiptError';
    const message = receipt.message ?? 'Falha no receipt do push';
    errors.push(stringifyError(code, message));

    if (code === 'DeviceNotRegistered') {
      const token = receiptIdsByToken.get(receiptId);
      if (token) {
        invalidTokens.add(token);
      }
    }
  }
}
