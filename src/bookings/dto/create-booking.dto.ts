import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { BookingOrigin } from '../../common/enums/booking-origin.enum';

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

  @IsEnum(BookingOrigin)
  origin: BookingOrigin;

  @IsOptional()
  @IsString()
  notes?: string;
}
