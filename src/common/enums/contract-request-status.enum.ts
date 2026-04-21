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
  /**
   * Horário final do job passou (startsAt + durationMinutes < now).
   * Aguardando confirmação bilateral de conclusão por creator e empresa.
   * Não libera efeitos financeiros — apenas COMPLETED os libera.
   */
  AWAITING_COMPLETION_CONFIRMATION = 'AWAITING_COMPLETION_CONFIRMATION',
  /**
   * Uma das partes reportou problema com a conclusão do serviço.
   * Bloqueia criação de review até resolução por admin.
   */
  COMPLETION_DISPUTE = 'COMPLETION_DISPUTE',
}
