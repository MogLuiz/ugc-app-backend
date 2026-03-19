import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AvailabilityRepository } from './availability.repository';
import { UsersRepository } from '../users/users.repository';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { UserRole } from '../common/enums/user-role.enum';
import {
  ensureStartIsBeforeEnd,
} from '../common/utils/scheduling-time.util';
import {
  AvailabilityDayInputDto,
  ReplaceCreatorAvailabilityDto,
} from './dto/replace-creator-availability.dto';
import { AvailabilityDayOfWeek } from '../common/enums/availability-day-of-week.enum';
import { User } from '../users/entities/user.entity';

const WEEK_DAYS_IN_ORDER: AvailabilityDayOfWeek[] = [
  AvailabilityDayOfWeek.MONDAY,
  AvailabilityDayOfWeek.TUESDAY,
  AvailabilityDayOfWeek.WEDNESDAY,
  AvailabilityDayOfWeek.THURSDAY,
  AvailabilityDayOfWeek.FRIDAY,
  AvailabilityDayOfWeek.SATURDAY,
  AvailabilityDayOfWeek.SUNDAY,
];

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly availabilityRepository: AvailabilityRepository,
    private readonly usersRepository: UsersRepository,
    private readonly dataSource: DataSource,
  ) {}

  async getCreatorAvailability(user: AuthUser) {
    const creator = await this.getCreatorUserOrThrow(user.authUserId);
    const rules = await this.availabilityRepository.findByCreatorUserId(creator.id);

    const ruleMap = new Map(rules.map((rule) => [rule.dayOfWeek, rule]));

    return {
      creatorUserId: creator.id,
      timezone: 'America/Sao_Paulo',
      days: WEEK_DAYS_IN_ORDER.map((dayOfWeek) => {
        const rule = ruleMap.get(dayOfWeek);

        return {
          dayOfWeek,
          isActive: rule?.isActive ?? false,
          startTime: rule?.startTime ?? null,
          endTime: rule?.endTime ?? null,
        };
      }),
    };
  }

  async replaceCreatorAvailability(user: AuthUser, dto: ReplaceCreatorAvailabilityDto) {
    const creator = await this.getCreatorUserOrThrow(user.authUserId);
    const normalizedDays = this.normalizeAvailabilityDays(dto.days);

    await this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(User)
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :userId', { userId: creator.id })
        .getOne();

      await this.availabilityRepository.replaceWeeklyAvailability(
        creator.id,
        normalizedDays,
        manager,
      );
    });

    return this.getCreatorAvailability(user);
  }

  private async getCreatorUserOrThrow(authUserId: string) {
    const user = await this.usersRepository.findByAuthUserIdWithProfiles(authUserId);

    if (!user) {
      throw new NotFoundException('Usuário não encontrado. Complete o cadastro em POST /users/bootstrap');
    }

    if (user.role !== UserRole.CREATOR) {
      throw new BadRequestException('Apenas creators podem gerenciar disponibilidade');
    }

    return user;
  }

  private normalizeAvailabilityDays(days: AvailabilityDayInputDto[]) {
    const uniqueDays = new Set(days.map((day) => day.dayOfWeek));

    if (uniqueDays.size !== WEEK_DAYS_IN_ORDER.length) {
      throw new BadRequestException('O payload deve conter exatamente um item para cada dia da semana');
    }

    for (const expectedDay of WEEK_DAYS_IN_ORDER) {
      if (!uniqueDays.has(expectedDay)) {
        throw new BadRequestException('O payload deve conter todos os dias da semana');
      }
    }

    return WEEK_DAYS_IN_ORDER.map((dayOfWeek) => {
      const day = days.find((item) => item.dayOfWeek === dayOfWeek);

      if (!day) {
        throw new BadRequestException('Dia da semana ausente no payload');
      }

      if (!day.isActive) {
        if (day.startTime !== null || day.endTime !== null) {
          throw new BadRequestException(
            'Quando isActive = false, startTime e endTime devem ser null',
          );
        }

        return {
          dayOfWeek,
          isActive: false,
          startTime: null,
          endTime: null,
        };
      }

      if (!day.startTime || !day.endTime) {
        throw new BadRequestException(
          'Quando isActive = true, startTime e endTime são obrigatórios',
        );
      }

      ensureStartIsBeforeEnd(day.startTime, day.endTime);

      return {
        dayOfWeek,
        isActive: true,
        startTime: day.startTime,
        endTime: day.endTime,
      };
    });
  }
}
