import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min, validateSync } from 'class-validator';

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

  @IsOptional()
  @IsString()
  DATABASE_URL: string = '';

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

  @IsOptional()
  @IsString()
  SUPABASE_URL: string = '';

  @IsOptional()
  @IsString()
  SUPABASE_ANON_KEY: string = '';

  @IsOptional()
  @IsString()
  SUPABASE_SERVICE_ROLE_KEY: string = '';

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
  @IsString()
  SENTRY_ENABLED: string = '';

  @IsOptional()
  @IsString()
  SENTRY_ENVIRONMENT: string = '';

  @IsOptional()
  @IsString()
  SENTRY_RELEASE: string = '';

  @IsOptional()
  @IsString()
  RAILWAY_GIT_COMMIT_SHA: string = '';
}

export function validateEnv(config: Record<string, unknown>): EnvValidation {
  const validated = plainToInstance(EnvValidation, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors.map((e) => Object.values(e.constraints || {}).join(', ')).join('; ');
    throw new Error(`Config validation failed: ${messages}`);
  }

  return validated;
}
