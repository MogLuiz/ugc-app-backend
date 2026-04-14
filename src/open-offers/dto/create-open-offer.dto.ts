import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOpenOfferDto {
  @IsUUID()
  jobTypeId: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsDateString()
  startsAt: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  durationMinutes: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  jobAddress: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Type(() => Number)
  offeredAmount: number;

  @IsDateString()
  expiresAt: string;
}
