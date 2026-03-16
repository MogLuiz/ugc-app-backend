import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min, validateSync } from 'class-validator';

enum NodeEnv {
  development = 'development',
  test = 'test',
  production = 'production',
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
