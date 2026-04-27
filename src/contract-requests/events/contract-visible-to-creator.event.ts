export const CONTRACT_VISIBLE_TO_CREATOR_EVENT =
  'contract-request.visible-to-creator';

export type ContractVisibleToCreatorReason =
  | 'direct_invite_received'
  | 'open_offer_selected';

export type ContractVisibleToCreatorEvent = {
  contractRequestId: string;
  creatorUserId: string;
  reason: ContractVisibleToCreatorReason;
  paymentId: string;
  occurredAt: Date;
};
