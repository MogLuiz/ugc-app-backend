export const CONTRACT_AWAITING_COMPLETION_CONFIRMATION_EVENT =
  'contract-request.awaiting-completion-confirmation';

export type ContractAwaitingCompletionConfirmationEvent = {
  contractRequestId: string;
  creatorUserId: string;
  occurredAt: Date;
};
