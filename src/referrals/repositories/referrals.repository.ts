import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Referral } from '../entities/referral.entity';
import { ReferralStatus } from '../enums/referral-status.enum';

export interface ReferralListItem {
  id: string;
  referredUser: { name: string; photoUrl: string | null };
  status: ReferralStatus;
  qualifiedAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class ReferralsRepository {
  constructor(
    @InjectRepository(Referral)
    private readonly repo: Repository<Referral>,
  ) {}

  async findByReferredUserId(referredUserId: string): Promise<Referral | null> {
    return this.repo.findOne({ where: { referredUserId } });
  }

  async findPendingByReferredUserIdForUpdate(
    referredUserId: string,
    manager: EntityManager,
  ): Promise<Referral | null> {
    return manager.getRepository(Referral).findOne({
      where: { referredUserId, status: ReferralStatus.PENDING },
      lock: { mode: 'pessimistic_write' },
    });
  }

  async qualify(
    referralId: string,
    qualifyingContractRequestId: string,
    manager: EntityManager,
  ): Promise<void> {
    await manager.getRepository(Referral).update(referralId, {
      status: ReferralStatus.QUALIFIED,
      qualifiedAt: new Date(),
      qualifyingContractRequestId,
    });
  }

  async createReferral(data: {
    partnerUserId: string;
    referredUserId: string;
    referralCodeId: string;
    status: ReferralStatus;
  }): Promise<Referral> {
    return this.repo.save(this.repo.create(data));
  }

  async listByPartner(params: {
    partnerUserId: string;
    status?: ReferralStatus;
    page: number;
    limit: number;
  }): Promise<{ items: ReferralListItem[]; total: number }> {
    const qb = this.repo
      .createQueryBuilder('r')
      .leftJoin('r.referredUser', 'u')
      .leftJoin('u.profile', 'p')
      .select([
        'r.id',
        'r.status',
        'r.qualified_at',
        'r.created_at',
        'p.name',
        'p.photo_url',
      ])
      .where('r.partner_user_id = :partnerUserId', { partnerUserId: params.partnerUserId });

    if (params.status) {
      qb.andWhere('r.status = :status', { status: params.status });
    }

    const total = await qb.getCount();

    const rows = await qb
      .orderBy('r.created_at', 'DESC')
      .offset((params.page - 1) * params.limit)
      .limit(params.limit)
      .getRawMany<{
        r_id: string;
        r_status: ReferralStatus;
        r_qualified_at: Date | null;
        r_created_at: Date;
        p_name: string | null;
        p_photo_url: string | null;
      }>();

    return {
      items: rows.map((row) => ({
        id: row.r_id,
        referredUser: {
          name: row.p_name ?? 'Usuário',
          photoUrl: row.p_photo_url ?? null,
        },
        status: row.r_status,
        qualifiedAt: row.r_qualified_at,
        createdAt: row.r_created_at,
      })),
      total,
    };
  }

  async getAggregatesByPartner(partnerUserId: string): Promise<{
    totalReferrals: number;
    pendingReferrals: number;
    qualifiedReferrals: number;
  }> {
    const row = await this.repo
      .createQueryBuilder('r')
      .select('COUNT(*)', 'total')
      .addSelect(
        `COUNT(*) FILTER (WHERE r.status = '${ReferralStatus.PENDING}')`,
        'pending',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE r.status = '${ReferralStatus.QUALIFIED}')`,
        'qualified',
      )
      .where('r.partner_user_id = :partnerUserId', { partnerUserId })
      .getRawOne<{ total: string; pending: string; qualified: string }>();

    return {
      totalReferrals: parseInt(row?.total ?? '0', 10),
      pendingReferrals: parseInt(row?.pending ?? '0', 10),
      qualifiedReferrals: parseInt(row?.qualified ?? '0', 10),
    };
  }
}
