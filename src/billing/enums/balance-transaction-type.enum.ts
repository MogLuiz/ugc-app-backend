export enum BalanceTransactionType {
  /** Pagamento convertido em crédito por rejeição do creator. */
  CREDIT_FROM_REJECTION = 'CREDIT_FROM_REJECTION',
  /** Pagamento convertido em crédito por expiração do convite. */
  CREDIT_FROM_EXPIRATION = 'CREDIT_FROM_EXPIRATION',
  /** Crédito utilizado em uma nova contratação. */
  CREDIT_USED = 'CREDIT_USED',
  /** Reembolso processado pelo admin. */
  REFUND_PROCESSED = 'REFUND_PROCESSED',
}
