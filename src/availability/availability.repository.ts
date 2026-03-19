import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AvailabilityRule } from './entities/availability-rule.entity';
import { AvailabilityDayOfWeek } from '../common/enums/availability-day-of-week.enum';

@Injectable()
export class AvailabilityRepository {
  constructor(
    @InjectRepository(AvailabilityRule)
    private readonly repo: Repository<AvailabilityRule>,
  ) {}

  private repository(manager?: EntityManager): Repository<AvailabilityRule> {
    return manager ? manager.getRepository(AvailabilityRule) : this.repo;
  }

  async findByCreatorUserId(creatorUserId: string): Promise<AvailabilityRule[]> {
    return this.repo.find({
      where: { creatorUserId },
      order: { dayOfWeek: 'ASC' },
    });
  }

  async findByCreatorUserIdAndDayOfWeek(
    creatorUserId: string,
    dayOfWeek: AvailabilityDayOfWeek,
    manager?: EntityManager,
  ): Promise<AvailabilityRule | null> {
    return this.repository(manager).findOne({
      where: { creatorUserId, dayOfWeek },
    });
  }

  async replaceWeeklyAvailability(
    creatorUserId: string,
    rules: Array<Partial<AvailabilityRule>>,
    manager: EntityManager,
  ): Promise<void> {
    const repository = this.repository(manager);
    await repository.delete({ creatorUserId });
    await repository.save(
      rules.map((rule) =>
        repository.create({
          creatorUserId,
          ...rule,
        }),
      ),
    );
  }
}
