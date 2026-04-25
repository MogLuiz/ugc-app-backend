import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LegalAcceptanceInputDto } from './legal-acceptance-input.dto';

export class CreateContractRequestDto {
  @IsUUID()
  creatorId: string;

  @IsUUID()
  jobTypeId: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsDateString()
  startsAt: string;

  @IsInt()
  @Min(1)
  durationMinutes: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  jobAddress: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LegalAcceptanceInputDto)
  legalAcceptance?: LegalAcceptanceInputDto;
}
