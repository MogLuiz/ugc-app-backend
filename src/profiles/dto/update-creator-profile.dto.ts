import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateCreatorProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  cpf?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  instagramUsername?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  tiktokUsername?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  referralSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  portfolioUrl?: string;

  @IsOptional()
  @IsBoolean()
  autoAcceptBookings?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  serviceRadiusKm?: number;
}
