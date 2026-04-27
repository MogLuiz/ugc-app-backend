import { PayoutStatus } from '../enums/payout-status.enum';

export const CREATOR_PAYOUT_UPDATED_EVENT = 'creator-payout.updated';

export type CreatorPayoutUpdatedEvent = {
  payoutId: string;
  creatorUserId: string;
  paymentId: string;
  contractRequestId: string;
  status: PayoutStatus;
  occurredAt: Date;
};
