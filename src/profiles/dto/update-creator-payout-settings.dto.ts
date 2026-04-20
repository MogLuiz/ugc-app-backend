import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const PIX_KEY_TYPES = ['cpf', 'cnpj', 'email', 'phone', 'random'] as const;

export type PixKeyType = (typeof PIX_KEY_TYPES)[number];

export class UpdateCreatorPayoutSettingsDto {
  @IsString()
  @IsIn(PIX_KEY_TYPES)
  pixKeyType: PixKeyType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  pixKey: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  holderName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  holderDocument?: string | null;
}
