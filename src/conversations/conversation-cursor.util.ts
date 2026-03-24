import { BadRequestException } from '@nestjs/common';

export type MessageCursor = {
  createdAt: Date;
  id: string;
};

type SerializedCursor = {
  createdAt: string;
  id: string;
};

export function encodeMessageCursor(cursor: MessageCursor): string {
  const payload: SerializedCursor = {
    createdAt: cursor.createdAt.toISOString(),
    id: cursor.id,
  };

  return Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
}

export function decodeMessageCursor(raw: string): MessageCursor {
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf-8');
    const payload = JSON.parse(decoded) as SerializedCursor;

    if (!payload?.createdAt || !payload?.id) {
      throw new Error('Cursor incompleto');
    }

    const createdAt = new Date(payload.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      throw new Error('Data inválida no cursor');
    }

    return {
      createdAt,
      id: payload.id,
    };
  } catch {
    throw new BadRequestException('Cursor inválido');
  }
}
