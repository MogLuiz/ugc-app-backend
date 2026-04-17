export enum SettlementStatus {
  /** Pago, aguardando resposta do creator. Estado inicial após pagamento confirmado. */
  HELD = 'HELD',
  /** Creator aceitou — contrato em andamento. */
  APPLIED = 'APPLIED',
  /** Creator recusou ou convite expirou — valor convertido em crédito para a empresa. */
  CONVERTED_TO_CREDIT = 'CONVERTED_TO_CREDIT',
}
