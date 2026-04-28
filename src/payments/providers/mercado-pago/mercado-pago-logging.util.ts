type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type MercadoPagoPaymentLike = {
  id?: string | number | null;
  external_reference?: string | null;
  status?: string | null;
  status_detail?: string | null;
  payment_method_id?: string | null;
  payment_type_id?: string | null;
  issuer_id?: string | number | null;
  installments?: number | null;
  transaction_amount?: number | null;
  live_mode?: boolean | null;
  date_approved?: string | Date | null;
  date_of_expiration?: string | Date | null;
  transaction_details?: unknown;
};

type MercadoPagoApiErrorLike = {
  message?: string;
  error?: string;
  status?: number;
  cause?: unknown;
  response?: {
    status?: number;
    data?: {
      message?: string;
      error?: string;
      cause?: unknown;
    };
  };
};

export type SafeMercadoPagoLogData = Record<string, JsonValue | undefined>;

function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function sanitizeCause(cause: unknown): JsonValue {
  if (!Array.isArray(cause)) return [];

  return cause.map((item) => {
    if (typeof item !== 'object' || item === null) {
      return String(item);
    }

    const entry = item as Record<string, unknown>;
    return {
      code: typeof entry.code === 'string' || typeof entry.code === 'number'
        ? String(entry.code)
        : null,
      description: typeof entry.description === 'string' ? entry.description : null,
      message: typeof entry.message === 'string' ? entry.message : null,
    };
  });
}

export function sanitizeMercadoPagoPayment(
  payment: MercadoPagoPaymentLike,
  extra: SafeMercadoPagoLogData = {},
): SafeMercadoPagoLogData {
  const transactionDetails =
    typeof payment.transaction_details === 'object' && payment.transaction_details !== null
      ? payment.transaction_details as Record<string, unknown>
      : null;

  return {
    ...extra,
    externalPaymentId: payment.id != null ? String(payment.id) : null,
    externalReference: payment.external_reference ?? null,
    status: payment.status ?? null,
    statusDetail: payment.status_detail ?? null,
    paymentMethodId: payment.payment_method_id ?? null,
    paymentTypeId: payment.payment_type_id ?? null,
    issuerId: payment.issuer_id != null ? String(payment.issuer_id) : null,
    installments: payment.installments ?? null,
    transactionAmount: payment.transaction_amount ?? null,
    liveMode: payment.live_mode ?? null,
    dateApproved: toIsoString(payment.date_approved),
    pixExpiresAt: toIsoString(payment.date_of_expiration),
    authorizationCode:
      typeof transactionDetails?.authorization_code === 'string'
        ? transactionDetails.authorization_code
        : null,
  };
}

export function sanitizeMercadoPagoApiError(
  error: unknown,
  extra: SafeMercadoPagoLogData = {},
): SafeMercadoPagoLogData {
  if (!(error instanceof Error) && (typeof error !== 'object' || error === null)) {
    return {
      ...extra,
      message: String(error),
      cause: [],
      status: null,
      errorCode: null,
    };
  }

  const candidate = error as Error & MercadoPagoApiErrorLike;
  const responseData = candidate.response?.data;

  return {
    ...extra,
    message: responseData?.message ?? candidate.message ?? null,
    errorCode: responseData?.error ?? candidate.error ?? null,
    status: candidate.status ?? candidate.response?.status ?? null,
    cause: sanitizeCause(responseData?.cause ?? candidate.cause),
  };
}

export function formatStructuredLog(
  event: string,
  data: SafeMercadoPagoLogData,
): string {
  return `${event} ${JSON.stringify(data)}`;
}
