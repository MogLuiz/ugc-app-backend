import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { PartnerProfile } from '../entities/partner-profile.entity';

@Injectable()
export class PartnerProfilesRepository {
  constructor(
    @InjectRepository(PartnerProfile)
    private readonly repo: Repository<PartnerProfile>,
  ) {}

  private repository(manager?: EntityManager): Repository<PartnerProfile> {
    return manager ? manager.getRepository(PartnerProfile) : this.repo;
  }

  async findByUserId(userId: string): Promise<PartnerProfile | null> {
    return this.repo.findOne({ where: { userId } });
  }

  async createAndSave(
    data: Partial<PartnerProfile>,
    manager?: EntityManager,
  ): Promise<PartnerProfile> {
    const repository = this.repository(manager);
    return repository.save(repository.create(data));
  }
}
