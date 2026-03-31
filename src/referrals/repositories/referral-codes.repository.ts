import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ReferralCode } from '../entities/referral-code.entity';

@Injectable()
export class ReferralCodesRepository {
  constructor(
    @InjectRepository(ReferralCode)
    private readonly repo: Repository<ReferralCode>,
  ) {}

  private repository(manager?: EntityManager): Repository<ReferralCode> {
    return manager ? manager.getRepository(ReferralCode) : this.repo;
  }

  async findActiveByPartnerUserId(partnerUserId: string): Promise<ReferralCode | null> {
    return this.repo.findOne({
      where: { partnerUserId, isActive: true },
    });
  }

  async findByCode(code: string): Promise<ReferralCode | null> {
    return this.repo.findOne({ where: { code } });
  }

  async createAndSave(
    data: Partial<ReferralCode>,
    manager?: EntityManager,
  ): Promise<ReferralCode> {
    const repository = this.repository(manager);
    return repository.save(repository.create(data));
  }

  /** Desativa todos os códigos do parceiro (mesmo que haja mais de um registro). */
  async deactivateAllForPartnerUserId(
    partnerUserId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.repository(manager);
    await repository.update({ partnerUserId }, { isActive: false });
  }
}
