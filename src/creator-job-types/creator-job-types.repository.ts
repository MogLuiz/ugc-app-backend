import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatorJobType } from './entities/creator-job-type.entity';

@Injectable()
export class CreatorJobTypesRepository {
  constructor(
    @InjectRepository(CreatorJobType)
    private readonly repo: Repository<CreatorJobType>,
  ) {}

  async findByCreator(creatorProfileUserId: string): Promise<CreatorJobType[]> {
    return this.repo.find({
      where: { creatorProfileUserId, isActive: true },
      relations: ['jobType'],
    });
  }

  async findActiveByCreatorAndJobType(
    creatorProfileUserId: string,
    jobTypeId: string,
  ): Promise<CreatorJobType | null> {
    return this.repo.findOne({
      where: {
        creatorProfileUserId,
        jobTypeId,
        isActive: true,
      },
      relations: ['jobType'],
    });
  }

  async replaceForCreator(
    creatorProfileUserId: string,
    jobTypeIds: string[],
  ): Promise<void> {
    await this.repo.manager.transaction(async (manager) => {
      await manager.delete(CreatorJobType, { creatorProfileUserId });

      if (jobTypeIds.length === 0) return;

      const entities = jobTypeIds.map((jobTypeId) =>
        manager.create(CreatorJobType, { creatorProfileUserId, jobTypeId }),
      );
      await manager.save(entities);
    });
  }
}
