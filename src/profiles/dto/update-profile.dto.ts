import { IsOptional, IsString, MaxLength, IsDateString, IsInt, Min, Max } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressStreet?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  addressNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  addressCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  addressState?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  addressZipCode?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  onboardingStep?: number;
}
