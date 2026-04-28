import {
  formatStructuredLog,
  sanitizeMercadoPagoApiError,
  sanitizeMercadoPagoPayment,
} from './mercado-pago-logging.util';

describe('mercado-pago-logging.util', () => {
  it('sanitiza resposta de pagamento sem incluir payload PIX sensível', () => {
    const sanitized = sanitizeMercadoPagoPayment(
      {
        id: 123,
        external_reference: 'payment-1',
        status: 'pending',
        status_detail: 'pending_waiting_transfer',
        payment_method_id: 'pix',
        payment_type_id: 'bank_transfer',
        issuer_id: '2001',
        installments: 1,
        transaction_amount: 199.9,
        live_mode: true,
        date_approved: null,
        date_of_expiration: '2026-04-27T22:00:00.000Z',
        transaction_details: { authorization_code: null },
        // @ts-expect-error intentionally passing sensitive fields to ensure they are ignored
        point_of_interaction: { transaction_data: { qr_code: '000201...', qr_code_base64: 'abc' } },
      },
      { paymentId: 'internal-1', contractRequestId: 'contract-1' },
    );

    expect(sanitized).toEqual({
      paymentId: 'internal-1',
      contractRequestId: 'contract-1',
      externalPaymentId: '123',
      externalReference: 'payment-1',
      status: 'pending',
      statusDetail: 'pending_waiting_transfer',
      paymentMethodId: 'pix',
      paymentTypeId: 'bank_transfer',
      issuerId: '2001',
      installments: 1,
      transactionAmount: 199.9,
      liveMode: true,
      dateApproved: null,
      pixExpiresAt: '2026-04-27T22:00:00.000Z',
      authorizationCode: null,
    });
    expect(JSON.stringify(sanitized)).not.toContain('000201');
    expect(JSON.stringify(sanitized)).not.toContain('qr_code_base64');
  });

  it('sanitiza erro da API sem incluir config ou payload bruto', () => {
    const sanitized = sanitizeMercadoPagoApiError(
      {
        message: 'Request failed',
        response: {
          status: 400,
          data: {
            message: 'Bad request',
            error: 'bad_request',
            cause: [
              {
                code: '106',
                description: 'invalid payment_method_id',
                data: { token: 'tok_secret', identification: '12345678900' },
              },
            ],
          },
        },
        config: { headers: { Authorization: 'Bearer secret' } },
      },
      { paymentId: 'internal-2', paymentMethodId: 'visa' },
    );

    expect(sanitized).toEqual({
      paymentId: 'internal-2',
      paymentMethodId: 'visa',
      message: 'Bad request',
      errorCode: 'bad_request',
      status: 400,
      cause: [
        {
          code: '106',
          description: 'invalid payment_method_id',
          message: null,
        },
      ],
    });
    expect(JSON.stringify(sanitized)).not.toContain('tok_secret');
    expect(JSON.stringify(sanitized)).not.toContain('12345678900');
    expect(formatStructuredLog('mercado_pago.error', sanitized)).toContain(
      '"errorCode":"bad_request"',
    );
  });
});
