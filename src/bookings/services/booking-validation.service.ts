import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { AvailabilityRepository } from '../../availability/availability.repository';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  convertTimeToMinutes,
  getSaoPauloCalendarDate,
  getSaoPauloDayOfWeek,
  getSaoPauloTime,
} from '../../common/utils/scheduling-time.util';
import { SchedulingConflictService } from '../../scheduling/scheduling-conflict.service';

@Injectable()
export class BookingValidationService {
  constructor(
    private readonly availabilityRepository: AvailabilityRepository,
    private readonly schedulingConflictService: SchedulingConflictService,
  ) {}

  async validateNewBooking(params: {
    companyUser: User;
    creatorUser: User;
    startDateTime: Date;
    endDateTime: Date;
    manager: EntityManager;
  }): Promise<void> {
    const {
      companyUser,
      creatorUser,
      startDateTime,
      endDateTime,
      manager,
    } = params;

    if (companyUser.role !== UserRole.COMPANY) {
      throw new ForbiddenException('Apenas empresas podem criar bookings');
    }

    if (creatorUser.role !== UserRole.CREATOR) {
      throw new BadRequestException('creatorUserId deve pertencer a um usuário com role CREATOR');
    }

    if (startDateTime.getTime() <= Date.now()) {
      throw new BadRequestException('startDateTime deve estar no futuro');
    }

    if (endDateTime.getTime() <= startDateTime.getTime()) {
      throw new BadRequestException('Intervalo de booking inválido');
    }

    const startDayOfWeek = getSaoPauloDayOfWeek(startDateTime);
    const startCalendarDate = getSaoPauloCalendarDate(startDateTime);
    const endCalendarDate = getSaoPauloCalendarDate(
      new Date(endDateTime.getTime() - 1000),
    );

    if (startCalendarDate !== endCalendarDate) {
      throw new BadRequestException('O booking precisa caber integralmente dentro de um único dia de disponibilidade');
    }

    const availabilityRule =
      await this.availabilityRepository.findByCreatorUserIdAndDayOfWeek(
        creatorUser.id,
        startDayOfWeek,
        manager,
      );

    if (!availabilityRule || !availabilityRule.isActive) {
      throw new BadRequestException('Creator sem disponibilidade ativa para o dia solicitado');
    }

    if (!availabilityRule.startTime || !availabilityRule.endTime) {
      throw new BadRequestException('Regra de disponibilidade inválida para o dia solicitado');
    }

    const bookingStartTime = getSaoPauloTime(startDateTime);
    const bookingEndBoundaryTime = getSaoPauloTime(endDateTime);

    const availabilityStartMinutes = convertTimeToMinutes(availabilityRule.startTime);
    const availabilityEndMinutes = convertTimeToMinutes(availabilityRule.endTime);
    const bookingStartMinutes = convertTimeToMinutes(bookingStartTime);
    const bookingEndMinutes = convertTimeToMinutes(bookingEndBoundaryTime);

    if (
      bookingStartMinutes < availabilityStartMinutes ||
      bookingEndMinutes > availabilityEndMinutes
    ) {
      throw new BadRequestException('Booking fora da janela de disponibilidade do creator');
    }

    await this.schedulingConflictService.ensureNoConflicts({
      creatorUserId: creatorUser.id,
      startsAt: startDateTime,
      endsAt: endDateTime,
      manager,
    });
  }

  ensureCreatorCanManageBooking(actorUserId: string, creatorUserId: string): void {
    if (actorUserId !== creatorUserId) {
      throw new ForbiddenException('Você não pode agir sobre booking de outro creator');
    }
  }

  ensureActorBelongsToBooking(
    actorUserId: string,
    bookingUsers: { creatorUserId: string; companyUserId: string },
  ): void {
    if (
      actorUserId !== bookingUsers.creatorUserId &&
      actorUserId !== bookingUsers.companyUserId
    ) {
      throw new ForbiddenException('O usuário autenticado não pode agir sobre este booking');
    }
  }
}
