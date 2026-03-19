import { BookingStatus } from '../../common/enums/booking-status.enum';
import { AvailabilityDayOfWeek } from '../../common/enums/availability-day-of-week.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { BookingValidationService } from './booking-validation.service';

describe('BookingValidationService', () => {
  const availabilityRepository = {
    findByCreatorUserIdAndDayOfWeek: jest.fn(),
  };

  const bookingsRepository = {
    findOverlappingBlockingBookings: jest.fn(),
  };

  const service = new BookingValidationService(
    availabilityRepository as never,
    bookingsRepository as never,
  );

  const companyUser = {
    id: 'company-1',
    role: UserRole.COMPANY,
  };

  const creatorUser = {
    id: 'creator-1',
    role: UserRole.CREATOR,
  };

  const baseDate = new Date('2099-03-17T13:00:00.000Z');
  const baseEndDate = new Date('2099-03-17T14:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();

    availabilityRepository.findByCreatorUserIdAndDayOfWeek.mockResolvedValue({
      id: 'rule-1',
      creatorUserId: creatorUser.id,
      dayOfWeek: AvailabilityDayOfWeek.TUESDAY,
      startTime: '09:00',
      endTime: '18:00',
      isActive: true,
    });

    bookingsRepository.findOverlappingBlockingBookings.mockResolvedValue([]);
  });

  it('valida um booking válido dentro da disponibilidade', async () => {
    await expect(
      service.validateNewBooking({
        companyUser: companyUser as never,
        creatorUser: creatorUser as never,
        startDateTime: baseDate,
        endDateTime: baseEndDate,
        manager: {} as never,
      }),
    ).resolves.toBeUndefined();
  });

  it('rejeita booking em dia sem availability ativa', async () => {
    availabilityRepository.findByCreatorUserIdAndDayOfWeek.mockResolvedValue({
      id: 'rule-1',
      creatorUserId: creatorUser.id,
      dayOfWeek: AvailabilityDayOfWeek.TUESDAY,
      startTime: '09:00',
      endTime: '18:00',
      isActive: false,
    });

    await expect(
      service.validateNewBooking({
        companyUser: companyUser as never,
        creatorUser: creatorUser as never,
        startDateTime: baseDate,
        endDateTime: baseEndDate,
        manager: {} as never,
      }),
    ).rejects.toThrow('Creator sem disponibilidade ativa para o dia solicitado');
  });

  it('rejeita booking fora da disponibilidade', async () => {
    availabilityRepository.findByCreatorUserIdAndDayOfWeek.mockResolvedValue({
      id: 'rule-1',
      creatorUserId: creatorUser.id,
      dayOfWeek: AvailabilityDayOfWeek.TUESDAY,
      startTime: '10:00',
      endTime: '11:00',
      isActive: true,
    });

    await expect(
      service.validateNewBooking({
        companyUser: companyUser as never,
        creatorUser: creatorUser as never,
        startDateTime: new Date('2099-03-17T12:30:00.000Z'),
        endDateTime: new Date('2099-03-17T13:30:00.000Z'),
        manager: {} as never,
      }),
    ).rejects.toThrow('Booking fora da janela de disponibilidade do creator');
  });

  it('rejeita booking com conflito de agenda', async () => {
    bookingsRepository.findOverlappingBlockingBookings.mockResolvedValue([
      {
        id: 'booking-1',
        status: BookingStatus.PENDING,
      },
    ]);

    await expect(
      service.validateNewBooking({
        companyUser: companyUser as never,
        creatorUser: creatorUser as never,
        startDateTime: baseDate,
        endDateTime: baseEndDate,
        manager: {} as never,
      }),
    ).rejects.toThrow('O creator já possui outro booking nesse intervalo');
  });

  it('permite booking encostado no fim de outro', async () => {
    bookingsRepository.findOverlappingBlockingBookings.mockResolvedValue([]);

    await expect(
      service.validateNewBooking({
        companyUser: companyUser as never,
        creatorUser: creatorUser as never,
        startDateTime: new Date('2099-03-17T14:00:00.000Z'),
        endDateTime: new Date('2099-03-17T15:00:00.000Z'),
        manager: {} as never,
      }),
    ).resolves.toBeUndefined();
  });

  it('permite novo slot quando o booking anterior foi cancelado', async () => {
    bookingsRepository.findOverlappingBlockingBookings.mockImplementation(
      async (_creatorUserId: string, startDateTime: Date, endDateTime: Date) => {
        const existingBookings = [
          {
            id: 'booking-cancelled',
            status: BookingStatus.CANCELLED,
            startDateTime: new Date('2099-03-17T13:30:00.000Z'),
            endDateTime: new Date('2099-03-17T14:30:00.000Z'),
          },
        ];

        return existingBookings.filter((booking) => {
          const isBlocking =
            booking.status === BookingStatus.PENDING ||
            booking.status === BookingStatus.CONFIRMED;

          return (
            isBlocking &&
            booking.startDateTime < endDateTime &&
            booking.endDateTime > startDateTime
          );
        });
      },
    );

    await expect(
      service.validateNewBooking({
        companyUser: companyUser as never,
        creatorUser: creatorUser as never,
        startDateTime: baseDate,
        endDateTime: baseEndDate,
        manager: {} as never,
      }),
    ).resolves.toBeUndefined();
  });

  it('impede company de criar booking para user que não seja creator', async () => {
    await expect(
      service.validateNewBooking({
        companyUser: companyUser as never,
        creatorUser: {
          id: 'user-2',
          role: UserRole.COMPANY,
        } as never,
        startDateTime: baseDate,
        endDateTime: baseEndDate,
        manager: {} as never,
      }),
    ).rejects.toThrow('creatorUserId deve pertencer a um usuário com role CREATOR');
  });

  it('bloqueia criação quando o solicitante não é company', async () => {
    await expect(
      service.validateNewBooking({
        companyUser: {
          id: 'creator-1',
          role: UserRole.CREATOR,
        } as never,
        creatorUser: creatorUser as never,
        startDateTime: baseDate,
        endDateTime: baseEndDate,
        manager: {} as never,
      }),
    ).rejects.toThrow('Apenas empresas podem criar bookings');
  });
});
