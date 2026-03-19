import { ForbiddenException } from '@nestjs/common';
import { BookingStatus } from '../common/enums/booking-status.enum';
import { BookingOrigin } from '../common/enums/booking-origin.enum';
import { JobMode } from '../common/enums/job-mode.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { BookingsService } from './bookings.service';

describe('BookingsService', () => {
  const bookingsRepository = {
    createAndSave: jest.fn(),
    findCalendarBookings: jest.fn(),
    findByIdForUpdate: jest.fn(),
    save: jest.fn(),
  };

  const jobTypesService = {
    getActiveByIdOrThrow: jest.fn(),
  };

  const usersRepository = {
    findByAuthUserIdWithProfiles: jest.fn(),
  };

  const bookingValidationService = {
    validateNewBooking: jest.fn(),
    ensureCreatorCanManageBooking: jest.fn(),
    ensureActorBelongsToBooking: jest.fn(),
  };

  const userRepo = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const manager = {
    getRepository: jest.fn(),
  };

  const dataSource = {
    transaction: jest.fn(),
  };

  const service = new BookingsService(
    dataSource as never,
    bookingsRepository as never,
    jobTypesService as never,
    usersRepository as never,
    bookingValidationService as never,
  );

  const companyUser = {
    id: 'company-1',
    authUserId: 'auth-company',
    role: UserRole.COMPANY,
  };

  const creatorUser = {
    id: 'creator-1',
    authUserId: 'auth-creator',
    role: UserRole.CREATOR,
  };

  const createBookingBuilder = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    manager.getRepository.mockReturnValue(userRepo);
    dataSource.transaction.mockImplementation(async (callback) => callback(manager));

    userRepo.findOne.mockResolvedValue(companyUser);
    userRepo.createQueryBuilder.mockReturnValue(createBookingBuilder);
    createBookingBuilder.getOne.mockResolvedValue(creatorUser);

    jobTypesService.getActiveByIdOrThrow.mockResolvedValue({
      id: 'job-type-1',
      name: 'Briefing Remoto',
      mode: JobMode.REMOTE,
      durationMinutes: 60,
    });

    bookingsRepository.createAndSave.mockImplementation(async (payload) => ({
      id: 'booking-1',
      ...payload,
      createdAt: new Date('2099-03-10T10:00:00.000Z'),
      updatedAt: new Date('2099-03-10T10:00:00.000Z'),
    }));

    bookingsRepository.findByIdForUpdate.mockResolvedValue({
      id: 'booking-1',
      companyUserId: companyUser.id,
      creatorUserId: creatorUser.id,
      status: BookingStatus.PENDING,
      title: 'Briefing',
      description: 'Discussão inicial',
      mode: JobMode.REMOTE,
      startDateTime: new Date('2099-03-17T13:00:00.000Z'),
      endDateTime: new Date('2099-03-17T14:00:00.000Z'),
      origin: BookingOrigin.COMPANY_REQUEST,
      notes: null,
      jobTypeId: 'job-type-1',
      jobTypeNameSnapshot: 'Briefing Remoto',
      durationMinutesSnapshot: 60,
      createdAt: new Date('2099-03-10T10:00:00.000Z'),
      updatedAt: new Date('2099-03-10T10:00:00.000Z'),
    });

    bookingsRepository.save.mockImplementation(async (booking) => ({
      ...booking,
      updatedAt: new Date('2099-03-17T10:30:00.000Z'),
    }));

    usersRepository.findByAuthUserIdWithProfiles.mockResolvedValue(creatorUser);
    bookingsRepository.findCalendarBookings.mockResolvedValue([
      {
        id: 'booking-1',
        title: 'Briefing',
        description: 'Discussão inicial',
        status: BookingStatus.PENDING,
        mode: JobMode.REMOTE,
        startDateTime: new Date('2099-03-17T13:00:00.000Z'),
        endDateTime: new Date('2099-03-17T14:00:00.000Z'),
        origin: BookingOrigin.COMPANY_REQUEST,
        notes: null,
        jobTypeId: 'job-type-1',
        jobTypeNameSnapshot: 'Briefing Remoto',
        durationMinutesSnapshot: 60,
        companyUserId: companyUser.id,
        creatorUserId: creatorUser.id,
      },
    ]);
  });

  it('cria um booking válido em transação', async () => {
    const result = await service.createBooking(
      { authUserId: companyUser.authUserId },
      {
        creatorUserId: creatorUser.id,
        jobTypeId: 'job-type-1',
        title: 'Briefing',
        description: 'Discussão inicial',
        startDateTime: '2099-03-17T13:00:00.000Z',
        origin: BookingOrigin.COMPANY_REQUEST,
        notes: 'Levar referência',
      },
    );

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(bookingValidationService.validateNewBooking).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(BookingStatus.PENDING);
    expect(result.durationMinutesSnapshot).toBe(60);
    expect(result.jobTypeNameSnapshot).toBe('Briefing Remoto');
  });

  it('aceita booking pendente', async () => {
    userRepo.findOne.mockResolvedValue(creatorUser);

    const result = await service.acceptBooking(
      { authUserId: creatorUser.authUserId },
      'booking-1',
    );

    expect(bookingValidationService.ensureCreatorCanManageBooking).toHaveBeenCalledWith(
      creatorUser.id,
      creatorUser.id,
    );
    expect(result.status).toBe(BookingStatus.CONFIRMED);
  });

  it('rejeita booking pendente', async () => {
    userRepo.findOne.mockResolvedValue(creatorUser);

    const result = await service.rejectBooking(
      { authUserId: creatorUser.authUserId },
      'booking-1',
    );

    expect(result.status).toBe(BookingStatus.REJECTED);
  });

  it('cancela booking confirmado por company vinculada', async () => {
    bookingsRepository.findByIdForUpdate.mockResolvedValue({
      id: 'booking-1',
      companyUserId: companyUser.id,
      creatorUserId: creatorUser.id,
      status: BookingStatus.CONFIRMED,
      title: 'Briefing',
      description: null,
      mode: JobMode.REMOTE,
      startDateTime: new Date('2099-03-17T13:00:00.000Z'),
      endDateTime: new Date('2099-03-17T14:00:00.000Z'),
      origin: BookingOrigin.COMPANY_REQUEST,
      notes: null,
      jobTypeId: 'job-type-1',
      jobTypeNameSnapshot: 'Briefing Remoto',
      durationMinutesSnapshot: 60,
      createdAt: new Date('2099-03-10T10:00:00.000Z'),
      updatedAt: new Date('2099-03-10T10:00:00.000Z'),
    });

    const result = await service.cancelBooking(
      { authUserId: companyUser.authUserId },
      'booking-1',
    );

    expect(bookingValidationService.ensureActorBelongsToBooking).toHaveBeenCalledWith(
      companyUser.id,
      {
        creatorUserId: creatorUser.id,
        companyUserId: companyUser.id,
      },
    );
    expect(result.status).toBe(BookingStatus.CANCELLED);
  });

  it('impede creator de aceitar booking de outro creator', async () => {
    userRepo.findOne.mockResolvedValue({
      id: 'creator-2',
      authUserId: 'auth-creator-2',
      role: UserRole.CREATOR,
    });

    bookingValidationService.ensureCreatorCanManageBooking.mockImplementation(() => {
      throw new ForbiddenException('Você não pode agir sobre booking de outro creator');
    });

    await expect(
      service.acceptBooking({ authUserId: 'auth-creator-2' }, 'booking-1'),
    ).rejects.toThrow('Você não pode agir sobre booking de outro creator');
  });

  it('falha quando o ator autenticado não existe', async () => {
    userRepo.findOne.mockResolvedValue(null);

    await expect(
      service.cancelBooking({ authUserId: 'auth-desconhecido' }, 'booking-1'),
    ).rejects.toThrow(
      'Usuário não encontrado. Complete o cadastro em POST /users/bootstrap',
    );
  });

  it('retorna o contrato enriquecido do calendario mantendo compatibilidade', async () => {
    const result = await service.getCreatorCalendar(
      { authUserId: creatorUser.authUserId },
      {
        start: '2099-03-17T00:00:00.000Z',
        end: '2099-03-24T00:00:00.000Z',
      },
    );

    expect(result.bookings[0]).toMatchObject({
      id: 'booking-1',
      title: 'Briefing',
      status: BookingStatus.PENDING,
      mode: JobMode.REMOTE,
      startDateTime: '2099-03-17T13:00:00.000Z',
      endDateTime: '2099-03-17T14:00:00.000Z',
      jobTypeName: 'Briefing Remoto',
      durationMinutes: 60,
      jobType: {
        id: 'job-type-1',
        name: 'Briefing Remoto',
      },
      origin: BookingOrigin.COMPANY_REQUEST,
      isBlocking: true,
    });
  });
});
