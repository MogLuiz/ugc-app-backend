import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobType } from './entities/job-type.entity';

@Injectable()
export class JobTypesRepository {
  constructor(
    @InjectRepository(JobType)
    private readonly repo: Repository<JobType>,
  ) {}

  async findActive(): Promise<JobType[]> {
    return this.repo.find({
      where: { isActive: true },
      order: { durationMinutes: 'ASC', name: 'ASC' },
    });
  }

  async findActiveById(id: string): Promise<JobType | null> {
    return this.repo.findOne({
      where: { id, isActive: true },
    });
  }
}
