import { BadRequestException } from '@nestjs/common';
import { AvailabilityDayOfWeek } from '../enums/availability-day-of-week.enum';

export const SCHEDULING_TIMEZONE = 'America/Sao_Paulo';

type SaoPauloDatePart =
  | 'year'
  | 'month'
  | 'day'
  | 'hour'
  | 'minute'
  | 'second'
  | 'weekday';

type SaoPauloDateParts = Record<SaoPauloDatePart, string>;

const saoPauloDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SCHEDULING_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  weekday: 'long',
});

const weekdayMap: Record<string, AvailabilityDayOfWeek> = {
  Sunday: AvailabilityDayOfWeek.SUNDAY,
  Monday: AvailabilityDayOfWeek.MONDAY,
  Tuesday: AvailabilityDayOfWeek.TUESDAY,
  Wednesday: AvailabilityDayOfWeek.WEDNESDAY,
  Thursday: AvailabilityDayOfWeek.THURSDAY,
  Friday: AvailabilityDayOfWeek.FRIDAY,
  Saturday: AvailabilityDayOfWeek.SATURDAY,
};

export function parseDateOrThrow(value: string, fieldName: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${fieldName} inválido`);
  }
  return parsed;
}

export function getSaoPauloDateParts(date: Date): SaoPauloDateParts {
  const parts = saoPauloDateFormatter.formatToParts(date);

  const values = parts.reduce<Partial<SaoPauloDateParts>>((acc, part) => {
    if (part.type === 'literal') {
      return acc;
    }

    if (
      part.type === 'year' ||
      part.type === 'month' ||
      part.type === 'day' ||
      part.type === 'hour' ||
      part.type === 'minute' ||
      part.type === 'second' ||
      part.type === 'weekday'
    ) {
      acc[part.type] = part.value;
    }

    return acc;
  }, {});

  return {
    year: values.year ?? '0000',
    month: values.month ?? '00',
    day: values.day ?? '00',
    hour: values.hour ?? '00',
    minute: values.minute ?? '00',
    second: values.second ?? '00',
    weekday: values.weekday ?? 'Sunday',
  };
}

export function getSaoPauloDayOfWeek(date: Date): AvailabilityDayOfWeek {
  const weekday = getSaoPauloDateParts(date).weekday;
  const mapped = weekdayMap[weekday];

  if (!mapped) {
    throw new BadRequestException('Não foi possível determinar o dia da semana no timezone da aplicação');
  }

  return mapped;
}

export function getSaoPauloTime(date: Date): string {
  const parts = getSaoPauloDateParts(date);
  return `${parts.hour}:${parts.minute}`;
}

export function getSaoPauloCalendarDate(date: Date): string {
  const parts = getSaoPauloDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function convertTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map((value) => Number(value));

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new BadRequestException('Horário inválido');
  }

  return hours * 60 + minutes;
}

export function ensureStartIsBeforeEnd(startTime: string, endTime: string): void {
  if (convertTimeToMinutes(startTime) >= convertTimeToMinutes(endTime)) {
    throw new BadRequestException('startTime deve ser menor que endTime');
  }
}
