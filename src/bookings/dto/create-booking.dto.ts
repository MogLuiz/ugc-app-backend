import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateBookingDto {
  @IsUUID()
  creatorUserId: string;

  @IsUUID()
  jobTypeId: string;

  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  startDateTime: string;

  @IsString()
  @MaxLength(100)
  origin: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
