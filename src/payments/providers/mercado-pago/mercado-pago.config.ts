export interface MercadoPagoConfig {
  accessToken: string;
  webhookSecret: string;
  publicKey: string;
  /** URL base da API do backend, usada para montar o notification_url. */
  apiBaseUrl: string;
  /** URL base do frontend, usada para montar os back_urls. */
  frontendBaseUrl: string;
}
