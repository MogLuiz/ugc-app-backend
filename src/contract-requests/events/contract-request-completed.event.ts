export const CONTRACT_REQUEST_COMPLETED_EVENT = 'contract-request.completed';

export interface ContractRequestCompletedEvent {
  contractRequestId: string;
  creatorUserId: string;
  companyUserId: string;
  serviceGrossAmountCents: number;
  companyTotalAmountCents: number;
  currency: string;
  completedAt: Date;
}
