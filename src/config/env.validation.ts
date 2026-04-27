import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  validateSync,
} from 'class-validator';

enum NodeEnv {
  development = 'development',
  test = 'test',
  production = 'production',
}

enum GeocodingStubMode {
  always_fail = 'always_fail',
  mock_success = 'mock_success',
  accept_all = 'accept_all',
}

export class EnvValidation {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.development;

  @IsNumber()
  @Min(1)
  PORT: number = 3000;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  DB_HOST: string = 'localhost';

  @IsNumber()
  @Min(1)
  DB_PORT: number = 5432;

  @IsString()
  DB_USERNAME: string = 'postgres';

  @IsString()
  DB_PASSWORD: string = 'postgres';

  @IsString()
  DB_DATABASE: string = 'ugc';

  @IsString()
  SUPABASE_URL!: string;

  @IsString()
  SUPABASE_ANON_KEY!: string;

  @IsString()
  SUPABASE_SERVICE_ROLE_KEY!: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  MAX_AVATAR_SIZE_MB: number = 5;

  @IsOptional()
  @IsString()
  ALLOWED_AVATAR_MIME_TYPES: string = 'image/jpeg,image/png,image/webp';

  @IsOptional()
  @IsString()
  AVATAR_BUCKET: string = 'avatars';

  @IsOptional()
  @IsNumber()
  @Min(1)
  MAX_PORTFOLIO_UPLOAD_SIZE_MB: number = 200;

  @IsOptional()
  @IsNumber()
  @Min(1)
  MAX_PORTFOLIO_IMAGE_SIZE_MB: number = 10;

  @IsOptional()
  @IsNumber()
  @Min(1)
  MAX_PORTFOLIO_VIDEO_SIZE_MB: number = 500;

  @IsOptional()
  @IsString()
  ALLOWED_PORTFOLIO_IMAGE_MIME_TYPES: string = 'image/jpeg,image/png,image/webp';

  @IsOptional()
  @IsString()
  ALLOWED_PORTFOLIO_VIDEO_MIME_TYPES: string = 'video/mp4,video/quicktime,video/webm';

  @IsOptional()
  @IsString()
  PORTFOLIO_IMAGE_BUCKET: string = 'portfolio-images';

  @IsOptional()
  @IsString()
  PORTFOLIO_VIDEO_BUCKET: string = 'portfolio-videos';

  @IsOptional()
  @IsString()
  GOOGLE_MAPS_API_KEY: string = '';

  @IsOptional()
  @IsEnum(GeocodingStubMode)
  GEOCODING_STUB_MODE: GeocodingStubMode =
    process.env.NODE_ENV === 'development'
      ? GeocodingStubMode.accept_all
      : GeocodingStubMode.always_fail;

  @IsOptional()
  @IsString()
  GEOCODING_STUB_RESPONSES: string = '{}';

  @IsOptional()
  @IsNumber()
  GEOCODING_DEFAULT_LAT: number = -19.9167;

  @IsOptional()
  @IsNumber()
  GEOCODING_DEFAULT_LNG: number = -43.9345;

  @IsOptional()
  @IsNumber()
  @Min(500)
  GEOCODING_TIMEOUT_MS: number = 3000;

  @IsOptional()
  @IsNumber()
  @Min(1)
  DEFAULT_CREATOR_SERVICE_RADIUS_KM: number = 30;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  TRANSPORT_PRICE_PER_KM: number = 2;

  @IsOptional()
  @IsNumber()
  @Min(0)
  MIN_TRANSPORT_PRICE: number = 20;

  @IsOptional()
  @IsString()
  SENTRY_DSN: string = '';

  @IsOptional()
  @IsBoolean()
  SENTRY_ENABLED: boolean = false;

  @IsOptional()
  @IsString()
  SENTRY_ENVIRONMENT: string = '';

  @IsOptional()
  @IsString()
  SENTRY_RELEASE: string = '';

  @IsOptional()
  @IsString()
  RAILWAY_GIT_COMMIT_SHA: string = '';

  // Mercado Pago
  @IsString()
  MP_ACCESS_TOKEN!: string;

  @IsString()
  MP_PUBLIC_KEY!: string;

  @IsString()
  MP_WEBHOOK_SECRET!: string;

  // URLs base para callbacks e webhooks
  @IsString()
  API_BASE_URL!: string;

  @IsString()
  APP_URL!: string;

  @IsOptional()
  FRONTEND_BASE_URL: string = 'http://localhost:5173';

  @IsString()
  FRONTEND_URL!: string;

  // Admin interno
  @IsOptional()
  @IsString()
  INTERNAL_ADMIN_API_KEY: string = '';

  // Billing
  /** Horas até o convite direto expirar após criação. Padrão: 24h. */
  @IsOptional()
  @IsNumber()
  @Min(1)
  INVITE_EXPIRY_HOURS: number = 24;
}

type ConfigReader = {
  get<T = unknown>(propertyPath: string): T | undefined;
};

const BYTES_PER_MB = 1024 * 1024;
const DEFAULT_PORTFOLIO_UPLOAD_SIZE_MB = 200;

function resolveNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

export function getPortfolioUploadMaxSizeMb(config?: ConfigReader): number {
  return resolveNumber(
    config?.get<number>('MAX_PORTFOLIO_UPLOAD_SIZE_MB') ??
      process.env.MAX_PORTFOLIO_UPLOAD_SIZE_MB,
    DEFAULT_PORTFOLIO_UPLOAD_SIZE_MB,
  );
}

export function getPortfolioUploadMaxSizeBytes(config?: ConfigReader): number {
  return getPortfolioUploadMaxSizeMb(config) * BYTES_PER_MB;
}

export function formatBytesToMb(bytes: number): string {
  const mb = bytes / BYTES_PER_MB;
  return Number.isInteger(mb) ? `${mb} MB` : `${mb.toFixed(1)} MB`;
}

export function getPortfolioUploadMaxSizeLabel(config?: ConfigReader): string {
  return formatBytesToMb(getPortfolioUploadMaxSizeBytes(config));
}

export function getPortfolioUploadLimitExceededMessage(config?: ConfigReader): string {
  return `O arquivo excede o limite máximo de ${getPortfolioUploadMaxSizeLabel(config)}`;
}

export function validateEnv(config: Record<string, unknown>): EnvValidation {
  const normalizedConfig = normalizeEnvConfig(config);
  const missingRequired = REQUIRED_ENV_VARS.filter((key) =>
    isMissingEnvValue(normalizedConfig[key]),
  );

  if (missingRequired.length > 0) {
    const [firstMissing] = missingRequired;
    throw new Error(
      `[CONFIG ERROR] Missing required environment variable: ${firstMissing}`,
    );
  }

  const validated = plainToInstance(EnvValidation, normalizedConfig, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const [firstError] = errors;
    const field = firstError.property;
    const [message] = Object.values(firstError.constraints || {});
    throw new Error(
      `[CONFIG ERROR] Invalid environment variable ${field}: ${message ?? 'invalid value'}`,
    );
  }

  for (const field of URI_ENV_VARS) {
    const value = normalizedConfig[field];
    if (typeof value === 'string' && value.trim() !== '' && !isValidUri(value)) {
      throw new Error(
        `[CONFIG ERROR] Invalid environment variable ${field}: must be a valid URI`,
      );
    }
  }

  return validated;
}

const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'MP_ACCESS_TOKEN',
  'MP_PUBLIC_KEY',
  'MP_WEBHOOK_SECRET',
  'API_BASE_URL',
  'APP_URL',
  'FRONTEND_URL',
] as const;

const URI_ENV_VARS = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'API_BASE_URL',
  'APP_URL',
  'FRONTEND_URL',
  'FRONTEND_BASE_URL',
] as const;

function normalizeEnvConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...config,
    SENTRY_ENABLED: normalizeBoolean(config.SENTRY_ENABLED, false),
  };
}

function normalizeBoolean(value: unknown, defaultValue: boolean): unknown {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === '') {
    return defaultValue;
  }

  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  return value;
}

function isMissingEnvValue(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === '';
}

function isValidUri(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol.length > 1;
  } catch {
    return false;
  }
}
