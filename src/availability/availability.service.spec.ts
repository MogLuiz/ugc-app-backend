import { BadRequestException } from '@nestjs/common';
import { AvailabilityDayOfWeek } from '../common/enums/availability-day-of-week.enum';
import { AvailabilityService } from './availability.service';

describe('AvailabilityService', () => {
  const availabilityRepository = {
    findByCreatorUserId: jest.fn(),
    replaceWeeklyAvailability: jest.fn(),
  };

  const usersRepository = {
    findByAuthUserIdWithProfiles: jest.fn(),
  };

  const dataSource = {
    transaction: jest.fn(),
  };

  const service = new AvailabilityService(
    availabilityRepository as never,
    usersRepository as never,
    dataSource as never,
  );
  const normalizeAvailabilityDays = (
    service as unknown as {
      normalizeAvailabilityDays: (days: unknown[]) => unknown[];
    }
  ).normalizeAvailabilityDays.bind(service);

  const validWeek = [
    {
      dayOfWeek: AvailabilityDayOfWeek.MONDAY,
      isActive: true,
      startTime: '09:00',
      endTime: '18:00',
    },
    {
      dayOfWeek: AvailabilityDayOfWeek.TUESDAY,
      isActive: false,
      startTime: null,
      endTime: null,
    },
    {
      dayOfWeek: AvailabilityDayOfWeek.WEDNESDAY,
      isActive: false,
      startTime: null,
      endTime: null,
    },
    {
      dayOfWeek: AvailabilityDayOfWeek.THURSDAY,
      isActive: false,
      startTime: null,
      endTime: null,
    },
    {
      dayOfWeek: AvailabilityDayOfWeek.FRIDAY,
      isActive: false,
      startTime: null,
      endTime: null,
    },
    {
      dayOfWeek: AvailabilityDayOfWeek.SATURDAY,
      isActive: false,
      startTime: null,
      endTime: null,
    },
    {
      dayOfWeek: AvailabilityDayOfWeek.SUNDAY,
      isActive: false,
      startTime: null,
      endTime: null,
    },
  ];

  it('normaliza uma semana válida respeitando a semântica oficial', () => {
    const result = normalizeAvailabilityDays(validWeek);

    expect(result).toHaveLength(7);
    expect(result[0]).toEqual({
      dayOfWeek: AvailabilityDayOfWeek.MONDAY,
      isActive: true,
      startTime: '09:00',
      endTime: '18:00',
    });
    expect(result[1]).toEqual({
      dayOfWeek: AvailabilityDayOfWeek.TUESDAY,
      isActive: false,
      startTime: null,
      endTime: null,
    });
  });

  it('rejeita dia ativo sem horario inicial', () => {
    const invalidWeek = validWeek.map((day) =>
      day.dayOfWeek === AvailabilityDayOfWeek.MONDAY
        ? { ...day, startTime: null }
        : day,
    );

    expect(() => normalizeAvailabilityDays(invalidWeek)).toThrow(
      new BadRequestException(
        'Quando isActive = true, startTime e endTime são obrigatórios',
      ),
    );
  });

  it('rejeita dia inativo com horario preenchido', () => {
    const invalidWeek = validWeek.map((day) =>
      day.dayOfWeek === AvailabilityDayOfWeek.TUESDAY
        ? { ...day, startTime: '09:00' }
        : day,
    );

    expect(() => normalizeAvailabilityDays(invalidWeek)).toThrow(
      new BadRequestException(
        'Quando isActive = false, startTime e endTime devem ser null',
      ),
    );
  });

  it('rejeita quando startTime nao e menor que endTime', () => {
    const invalidWeek = validWeek.map((day) =>
      day.dayOfWeek === AvailabilityDayOfWeek.MONDAY
        ? { ...day, startTime: '18:00', endTime: '18:00' }
        : day,
    );

    expect(() => normalizeAvailabilityDays(invalidWeek)).toThrow(
      new BadRequestException('startTime deve ser menor que endTime'),
    );
  });
});
