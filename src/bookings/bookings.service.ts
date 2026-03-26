import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BookingsRepository } from './bookings.repository';
import { BookingValidationService } from './services/booking-validation.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  parseDateOrThrow,
  SCHEDULING_TIMEZONE,
} from '../common/utils/scheduling-time.util';
import { JobTypesService } from '../job-types/job-types.service';
import { User } from '../users/entities/user.entity';
import { BookingStatus } from '../common/enums/booking-status.enum';
import { Booking } from './entities/booking.entity';
import { GetCreatorCalendarDto } from './dto/get-creator-calendar.dto';
import { UsersRepository } from '../users/users.repository';
import { UserRole } from '../common/enums/user-role.enum';
import { ContractRequest } from '../contract-requests/entities/contract-request.entity';
import { ContractRequestStatus } from '../common/enums/contract-request-status.enum';

const BLOCKING_BOOKING_STATUSES = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
];

@Injectable()
export class BookingsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly bookingsRepository: BookingsRepository,
    private readonly jobTypesService: JobTypesService,
    private readonly usersRepository: UsersRepository,
    private readonly bookingValidationService: BookingValidationService,
  ) { }

  async createBooking(user: AuthUser, dto: CreateBookingDto) {
    const startDateTime = parseDateOrThrow(dto.startDateTime, 'startDateTime');

    return this.dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);

      const companyUser = await userRepository.findOne({
        where: { authUserId: user.authUserId },
      });

      if (!companyUser) {
        throw new NotFoundException(
          'Usuário não encontrado. Complete o cadastro em POST /users/bootstrap',
        );
      }

      const creatorUser = await userRepository
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :creatorUserId', { creatorUserId: dto.creatorUserId })
        .getOne();

      if (!creatorUser) {
        throw new NotFoundException('Creator não encontrado');
      }

      const jobType = await this.jobTypesService.getActiveByIdOrThrow(dto.jobTypeId);
      const endDateTime = new Date(
        startDateTime.getTime() + jobType.durationMinutes * 60 * 1000,
      );

      await this.bookingValidationService.validateNewBooking({
        companyUser,
        creatorUser,
        startDateTime,
        endDateTime,
        manager,
      });

      const booking = await this.bookingsRepository.createAndSave(
        {
          companyUserId: companyUser.id,
          creatorUserId: creatorUser.id,
          jobTypeId: jobType.id,
          title: dto.title,
          description: dto.description ?? null,
          mode: jobType.mode,
          status: BookingStatus.PENDING,
          startDateTime,
          endDateTime,
          origin: dto.origin,
          notes: dto.notes ?? null,
          jobTypeNameSnapshot: jobType.name,
          durationMinutesSnapshot: jobType.durationMinutes,
        },
        manager,
      );

      return this.buildBookingPayload(booking);
    });
  }

  async getCreatorCalendar(user: AuthUser, query: GetCreatorCalendarDto) {
    const creator = await this.usersRepository.findByAuthUserIdWithProfiles(
      user.authUserId,
    );

    if (!creator) {
      throw new NotFoundException(
        'Usuário não encontrado. Complete o cadastro em POST /users/bootstrap',
      );
    }

    if (creator.role !== UserRole.CREATOR) {
      throw new ForbiddenException('Apenas creators podem consultar a própria agenda');
    }

    const startDateTime = parseDateOrThrow(query.start, 'start');
    const endDateTime = parseDateOrThrow(query.end, 'end');

    if (startDateTime.getTime() >= endDateTime.getTime()) {
      throw new BadRequestException('O intervalo informado é inválido');
    }

    const bookings = await this.bookingsRepository.findCalendarBookings(
      creator.id,
      startDateTime,
      endDateTime,
    );
    const acceptedContractRequests = await this.findAcceptedContractRequestsForCalendar(
      creator.id,
      startDateTime,
      endDateTime,
    );
    const calendarItems = [
      ...bookings.map((booking) => this.buildCalendarItemPayload(booking)),
      ...acceptedContractRequests.map((contractRequest) =>
        this.buildAcceptedContractRequestCalendarItemPayload(contractRequest),
      ),
    ].sort(
      (left, right) =>
        new Date(left.startDateTime).getTime() -
        new Date(right.startDateTime).getTime(),
    );

    return {
      creatorUserId: creator.id,
      timezone: SCHEDULING_TIMEZONE,
      range: {
        start: startDateTime.toISOString(),
        end: endDateTime.toISOString(),
      },
      blockedStatuses: BLOCKING_BOOKING_STATUSES,
      bookings: calendarItems,
    };
  }

  async acceptBooking(user: AuthUser, bookingId: string) {
    return this.updateBookingStatus(user, bookingId, 'accept');
  }

  async rejectBooking(user: AuthUser, bookingId: string) {
    return this.updateBookingStatus(user, bookingId, 'reject');
  }

  async cancelBooking(user: AuthUser, bookingId: string) {
    return this.updateBookingStatus(user, bookingId, 'cancel');
  }

  private async updateBookingStatus(
    user: AuthUser,
    bookingId: string,
    action: 'accept' | 'reject' | 'cancel',
  ) {
    return this.dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);
      const actor = await userRepository.findOne({
        where: { authUserId: user.authUserId },
      });

      if (!actor) {
        throw new NotFoundException(
          'Usuário não encontrado. Complete o cadastro em POST /users/bootstrap',
        );
      }

      const booking = await this.bookingsRepository.findByIdForUpdate(
        bookingId,
        manager,
      );

      if (!booking) {
        throw new NotFoundException('Booking não encontrado');
      }

      if (action === 'accept') {
        this.bookingValidationService.ensureCreatorCanManageBooking(
          actor.id,
          booking.creatorUserId,
        );
        this.ensureBookingStatus(booking.status, [BookingStatus.PENDING], action);
        booking.status = BookingStatus.CONFIRMED;
      }

      if (action === 'reject') {
        this.bookingValidationService.ensureCreatorCanManageBooking(
          actor.id,
          booking.creatorUserId,
        );
        this.ensureBookingStatus(booking.status, [BookingStatus.PENDING], action);
        booking.status = BookingStatus.REJECTED;
      }

      if (action === 'cancel') {
        this.bookingValidationService.ensureActorBelongsToBooking(actor.id, {
          creatorUserId: booking.creatorUserId,
          companyUserId: booking.companyUserId,
        });
        this.ensureBookingStatus(
          booking.status,
          [BookingStatus.PENDING, BookingStatus.CONFIRMED],
          action,
        );
        booking.status = BookingStatus.CANCELLED;
      }

      const updated = await this.bookingsRepository.save(booking, manager);
      return this.buildBookingPayload(updated);
    });
  }

  private ensureBookingStatus(
    currentStatus: BookingStatus,
    allowedStatuses: BookingStatus[],
    action: 'accept' | 'reject' | 'cancel',
  ): void {
    if (!allowedStatuses.includes(currentStatus)) {
      throw new BadRequestException(
        `Não é possível ${action} um booking com status ${currentStatus}`,
      );
    }
  }

  private buildBookingPayload(booking: Booking) {
    return {
      id: booking.id,
      companyUserId: booking.companyUserId,
      creatorUserId: booking.creatorUserId,
      jobTypeId: booking.jobTypeId,
      title: booking.title,
      description: booking.description,
      mode: booking.mode,
      status: booking.status,
      startDateTime: booking.startDateTime.toISOString(),
      endDateTime: booking.endDateTime.toISOString(),
      origin: booking.origin,
      notes: booking.notes,
      jobTypeNameSnapshot: booking.jobTypeNameSnapshot,
      durationMinutesSnapshot: booking.durationMinutesSnapshot,
      createdAt: booking.createdAt?.toISOString(),
      updatedAt: booking.updatedAt?.toISOString(),
    };
  }

  private buildCalendarItemPayload(booking: Booking) {
    const companyName =
      booking.companyUser?.companyProfile?.companyName ??
      booking.companyUser?.profile?.name ??
      null;
    const profile = booking.companyUser?.profile;

    return {
      id: booking.id,
      title: booking.title,
      description: booking.description,
      status: booking.status,
      mode: booking.mode,
      startDateTime: booking.startDateTime.toISOString(),
      endDateTime: booking.endDateTime.toISOString(),
      jobTypeName: booking.jobTypeNameSnapshot,
      durationMinutes: booking.durationMinutesSnapshot,
      origin: booking.origin,
      notes: booking.notes,
      jobType: {
        id: booking.jobTypeId,
        name: booking.jobTypeNameSnapshot,
      },
      companyUserId: booking.companyUserId,
      creatorUserId: booking.creatorUserId,
      companyName,
      companyPhotoUrl: profile?.photoUrl ?? null,
      companyRating: profile?.rating ?? null,
      distanceKm: null,
      contractRequestId: null,
      location: null,
      isBlocking: BLOCKING_BOOKING_STATUSES.includes(booking.status),
    };
  }

  private buildAcceptedContractRequestCalendarItemPayload(
    contractRequest: ContractRequest,
  ) {
    const endDateTime = new Date(
      contractRequest.startsAt.getTime() + contractRequest.durationMinutes * 60 * 1000,
    );
    const companyName =
      contractRequest.companyUser?.companyProfile?.companyName ??
      contractRequest.companyUser?.profile?.name;

    const location =
      contractRequest.jobFormattedAddress ?? contractRequest.jobAddress ?? null;
    const crProfile = contractRequest.companyUser?.profile;

    return {
      id: `contract-request-${contractRequest.id}`,
      title: companyName ? `Oferta aceita - ${companyName}` : 'Oferta aceita',
      description: contractRequest.description,
      status: BookingStatus.CONFIRMED,
      mode: contractRequest.mode,
      startDateTime: contractRequest.startsAt.toISOString(),
      endDateTime: endDateTime.toISOString(),
      jobTypeName: contractRequest.jobType?.name ?? 'Job',
      durationMinutes: contractRequest.durationMinutes,
      origin: 'CONTRACT_REQUEST',
      notes: null,
      jobType: {
        id: contractRequest.jobTypeId,
        name: contractRequest.jobType?.name ?? 'Job',
      },
      companyUserId: contractRequest.companyUserId,
      creatorUserId: contractRequest.creatorUserId,
      companyName: companyName ?? null,
      companyPhotoUrl: crProfile?.photoUrl ?? null,
      companyRating: crProfile?.rating ?? null,
      distanceKm: contractRequest.distanceKm ?? null,
      contractRequestId: contractRequest.id,
      location,
      isBlocking: true,
    };
  }

  private async findAcceptedContractRequestsForCalendar(
    creatorUserId: string,
    startDateTime: Date,
    endDateTime: Date,
  ): Promise<ContractRequest[]> {
    return this.dataSource
      .getRepository(ContractRequest)
      .createQueryBuilder('contractRequest')
      .leftJoinAndSelect('contractRequest.jobType', 'jobType')
      .leftJoinAndSelect('contractRequest.companyUser', 'companyUser')
      .leftJoinAndSelect('companyUser.profile', 'companyUserProfile')
      .leftJoinAndSelect('companyUser.companyProfile', 'companyUserCompanyProfile')
      .where('contractRequest.creator_user_id = :creatorUserId', { creatorUserId })
      .andWhere('contractRequest.status = :status', {
        status: ContractRequestStatus.ACCEPTED,
      })
      .andWhere('contractRequest.starts_at < :endDateTime', { endDateTime })
      .andWhere(
        "(contractRequest.starts_at + (contractRequest.duration_minutes || ' minutes')::interval) > :startDateTime",
        { startDateTime },
      )
      .orderBy('contractRequest.starts_at', 'ASC')
      .getMany();
  }
}
