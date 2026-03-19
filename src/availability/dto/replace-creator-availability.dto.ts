import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  Validate,
  ValidateIf,
  Matches,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AvailabilityDayOfWeek } from '../../common/enums/availability-day-of-week.enum';

@ValidatorConstraint({ name: 'availabilityDaySemantics', async: false })
class AvailabilityDaySemanticsConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const day = args.object as AvailabilityDayInputDto;

    if (day.isActive) {
      return Boolean(day.startTime && day.endTime);
    }

    return day.startTime === null && day.endTime === null;
  }

  defaultMessage(args: ValidationArguments): string {
    const day = args.object as AvailabilityDayInputDto;

    if (day.isActive) {
      return 'Quando isActive = true, startTime e endTime são obrigatórios';
    }

    return 'Quando isActive = false, startTime e endTime devem ser null';
  }
}

export class AvailabilityDayInputDto {
  @IsEnum(AvailabilityDayOfWeek)
  dayOfWeek: AvailabilityDayOfWeek;

  @IsBoolean()
  @Validate(AvailabilityDaySemanticsConstraint)
  isActive: boolean;

  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime?: string | null;

  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime?: string | null;
}

export class ReplaceCreatorAvailabilityDto {
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => AvailabilityDayInputDto)
  days: AvailabilityDayInputDto[];
}
