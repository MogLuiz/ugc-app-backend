import { IsDateString } from 'class-validator';

export class GetCreatorCalendarDto {
  @IsDateString()
  start: string;

  @IsDateString()
  end: string;
}
