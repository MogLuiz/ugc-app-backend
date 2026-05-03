export const CONTRACT_REQUEST_ACCEPTED_EVENT = 'contract-request.accepted';

export type ContractRequestAcceptedEvent = {
  contractRequestId: string;
  companyUserId: string;
  creatorId: string;
  creatorName: string;
  offerTitle: string;
  openOfferId: string | null;
  occurredAt: Date;
};
