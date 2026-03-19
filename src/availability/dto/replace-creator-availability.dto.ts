import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AvailabilityDayOfWeek } from '../../common/enums/availability-day-of-week.enum';

export class AvailabilityDayInputDto {
  @IsEnum(AvailabilityDayOfWeek)
  dayOfWeek: AvailabilityDayOfWeek;

  @IsBoolean()
  isActive: boolean;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime?: string;
}

export class ReplaceCreatorAvailabilityDto {
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => AvailabilityDayInputDto)
  days: AvailabilityDayInputDto[];
}
