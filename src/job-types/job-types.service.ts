import { Injectable, NotFoundException } from '@nestjs/common';
import { JobTypesRepository } from './job-types.repository';
import { JobType } from './entities/job-type.entity';

@Injectable()
export class JobTypesService {
  constructor(private readonly jobTypesRepository: JobTypesRepository) {}

  async listActive(): Promise<JobType[]> {
    return this.jobTypesRepository.findActive();
  }

  async getActiveByIdOrThrow(id: string): Promise<JobType> {
    const jobType = await this.jobTypesRepository.findActiveById(id);

    if (!jobType) {
      throw new NotFoundException('Tipo de job não encontrado');
    }

    return jobType;
  }
}
