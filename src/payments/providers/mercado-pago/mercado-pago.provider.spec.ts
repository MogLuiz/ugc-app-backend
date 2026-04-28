const preferenceCreateMock = jest.fn();

jest.mock('mercadopago', () => {
  class MercadoPagoMock {
    constructor(_config: unknown) {}
  }

  class PreferenceMock {
    constructor(_client: unknown) {}

    create = preferenceCreateMock;
  }

  class PaymentMock {
    constructor(_client: unknown) {}
  }

  return {
    __esModule: true,
    default: MercadoPagoMock,
    Preference: PreferenceMock,
    Payment: PaymentMock,
  };
});

import { ConfigService } from '@nestjs/config';
import { MercadoPagoProvider } from './mercado-pago.provider';

describe('MercadoPagoProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    preferenceCreateMock.mockResolvedValue({
      id: 'pref-123',
      external_reference: 'payment-123',
    });
  });

  it('envia payload completo da preference com item, payer e statement descriptor', async () => {
    const configService = {
      get: jest.fn((key: string) => {
        switch (key) {
          case 'MP_ACCESS_TOKEN':
            return 'TEST-123';
          case 'MP_PUBLIC_KEY':
            return 'TEST-PUBLIC-123';
          case 'MP_WEBHOOK_SECRET':
            return 'secret';
          case 'API_BASE_URL':
            return 'https://api.ugclocal.com.br';
          case 'FRONTEND_BASE_URL':
            return 'https://app.ugclocal.com.br';
          case 'MP_STATEMENT_DESCRIPTOR':
            return 'UGC LOCAL';
          case 'NODE_ENV':
            return 'production';
          default:
            return undefined;
        }
      }),
    } as unknown as ConfigService;

    const provider = new MercadoPagoProvider(configService);

    await provider.createPaymentIntent({
      paymentId: 'payment-123',
      amountCents: 12990,
      currency: 'BRL',
      payerEmail: 'empresa@ugc.local',
      payerFirstName: 'Maria',
      payerLastName: 'Silva',
      contractRequestId: 'contract-123',
      item: {
        id: 'contract-123',
        title: 'Video UGC',
        description: 'Captacao de video para campanha local',
        categoryId: 'services',
        quantity: 1,
        unitPrice: 129.9,
      },
      callbackUrls: {
        success: 'https://app.ugclocal.com.br/pagamento/sucesso?paymentId=payment-123',
        failure: 'https://app.ugclocal.com.br/pagamento/falhou?paymentId=payment-123',
        pending: 'https://app.ugclocal.com.br/pagamento/aguardando?paymentId=payment-123',
      },
    });

    expect(preferenceCreateMock).toHaveBeenCalledWith({
      body: {
        items: [
          {
            id: 'contract-123',
            title: 'Video UGC',
            description: 'Captacao de video para campanha local',
            category_id: 'services',
            quantity: 1,
            unit_price: 129.9,
            currency_id: 'BRL',
          },
        ],
        payer: {
          email: 'empresa@ugc.local',
          first_name: 'Maria',
          last_name: 'Silva',
        },
        external_reference: 'payment-123',
        back_urls: {
          success: 'https://app.ugclocal.com.br/pagamento/sucesso?paymentId=payment-123',
          failure: 'https://app.ugclocal.com.br/pagamento/falhou?paymentId=payment-123',
          pending: 'https://app.ugclocal.com.br/pagamento/aguardando?paymentId=payment-123',
        },
        notification_url: 'https://api.ugclocal.com.br/webhooks/mercado-pago',
        statement_descriptor: 'UGC LOCAL',
      },
    });
  });

  it('bloqueia URLs inseguras em produção', async () => {
    const configService = {
      get: jest.fn((key: string) => {
        switch (key) {
          case 'MP_ACCESS_TOKEN':
            return 'TEST-123';
          case 'MP_PUBLIC_KEY':
            return 'TEST-PUBLIC-123';
          case 'MP_WEBHOOK_SECRET':
            return 'secret';
          case 'API_BASE_URL':
            return 'https://api.ugclocal.com.br';
          case 'FRONTEND_BASE_URL':
            return 'https://app.ugclocal.com.br';
          case 'NODE_ENV':
            return 'production';
          default:
            return undefined;
        }
      }),
    } as unknown as ConfigService;

    const provider = new MercadoPagoProvider(configService);

    await expect(
      provider.createPaymentIntent({
        paymentId: 'payment-123',
        amountCents: 12990,
        currency: 'BRL',
        payerEmail: 'empresa@ugc.local',
        contractRequestId: 'contract-123',
        item: {
          id: 'contract-123',
          title: 'Video UGC',
          description: 'Captacao de video para campanha local',
          categoryId: 'services',
          quantity: 1,
          unitPrice: 129.9,
        },
        callbackUrls: {
          success: 'http://localhost:5173/pagamento/sucesso',
          failure: 'https://app.ugclocal.com.br/pagamento/falhou',
          pending: 'https://app.ugclocal.com.br/pagamento/aguardando',
        },
      }),
    ).rejects.toThrow('back_urls.success deve usar HTTPS público em produção');
  });
});
