export enum ContractRequestStatus {
  /** Criado, aguardando pagamento da empresa antes de enviar ao creator. */
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  /** Pago, aguardando resposta do creator. */
  PENDING_ACCEPTANCE = 'PENDING_ACCEPTANCE',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
  /** Expirou sem resposta do creator (PENDING_ACCEPTANCE ultrapassou expiresAt). */
  EXPIRED = 'EXPIRED',
}
