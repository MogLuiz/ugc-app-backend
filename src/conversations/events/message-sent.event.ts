import { ConversationParticipantRole } from '../enums/conversation-participant-role.enum';

export const MESSAGE_SENT_EVENT = 'conversation.message.sent';

export type MessageSentEvent = {
  messageId: string;
  conversationId: string;
  contractRequestId: string;
  senderUserId: string;
  senderName: string;
  recipientUserId: string;
  recipientRole: ConversationParticipantRole;
  createdAt: Date;
};
