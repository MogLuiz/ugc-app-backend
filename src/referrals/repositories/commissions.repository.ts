import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Commission } from '../entities/commission.entity';
import { CommissionStatus } from '../enums/commission-status.enum';

export interface CreateCommissionData {
  referralId: string;
  contractRequestId: string;
  partnerUserId: string;
  grossAmountCents: number;
  commissionRatePercent: number;
  commissionAmountCents: number;
  currency: string;
}

export interface CommissionListItem {
  id: string;
  referredUserName: string;
  grossAmountCents: number;
  commissionAmountCents: number;
  commissionRatePercent: number;
  currency: string;
  status: CommissionStatus;
  createdAt: Date;
}

@Injectable()
export class CommissionsRepository {
  constructor(
    @InjectRepository(Commission)
    private readonly repo: Repository<Commission>,
  ) {}

  private repository(manager?: EntityManager): Repository<Commission> {
    return manager ? manager.getRepository(Commission) : this.repo;
  }

  async insertIdempotent(data: CreateCommissionData, manager?: EntityManager): Promise<void> {
    await this.repository(manager)
      .createQueryBuilder()
      .insert()
      .into(Commission)
      .values({
        ...data,
        status: CommissionStatus.PENDING,
      })
      .orIgnore()
      .execute();
  }

  async listByPartner(params: {
    partnerUserId: string;
    status?: CommissionStatus;
    page: number;
    limit: number;
  }): Promise<{ items: CommissionListItem[]; total: number }> {
    const qb = this.repo
      .createQueryBuilder('c')
      .innerJoin('c.referral', 'r')
      .innerJoin('r.referredUser', 'u')
      .leftJoin('u.profile', 'p')
      .select([
        'c.id',
        'c.gross_amount_cents',
        'c.commission_amount_cents',
        'c.commission_rate_percent',
        'c.currency',
        'c.status',
        'c.created_at',
        'p.name',
      ])
      .where('c.partner_user_id = :partnerUserId', { partnerUserId: params.partnerUserId });

    if (params.status) {
      qb.andWhere('c.status = :status', { status: params.status });
    }

    const total = await qb.getCount();

    const rows = await qb
      .orderBy('c.created_at', 'DESC')
      .offset((params.page - 1) * params.limit)
      .limit(params.limit)
      .getRawMany<{
        c_id: string;
        c_gross_amount_cents: number;
        c_commission_amount_cents: number;
        c_commission_rate_percent: string;
        c_currency: string;
        c_status: CommissionStatus;
        c_created_at: Date;
        p_name: string | null;
      }>();

    return {
      items: rows.map((row) => ({
        id: row.c_id,
        referredUserName: row.p_name ?? 'Usuário',
        grossAmountCents: row.c_gross_amount_cents,
        commissionAmountCents: row.c_commission_amount_cents,
        commissionRatePercent: parseFloat(row.c_commission_rate_percent),
        currency: row.c_currency,
        status: row.c_status,
        createdAt: row.c_created_at,
      })),
      total,
    };
  }

  async getDashboardAggregates(partnerUserId: string): Promise<{
    totalCommissionAmountCents: number;
    pendingCommissionAmountCents: number;
    currency: string;
  }> {
    const row = await this.repo
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c.commission_amount_cents), 0)', 'total')
      .addSelect(
        `COALESCE(SUM(c.commission_amount_cents) FILTER (WHERE c.status = '${CommissionStatus.PENDING}'), 0)`,
        'pending',
      )
      .addSelect('COALESCE(MAX(c.currency), :defaultCurrency)', 'currency')
      .where('c.partner_user_id = :partnerUserId', { partnerUserId })
      .setParameter('defaultCurrency', 'BRL')
      .getRawOne<{ total: string; pending: string; currency: string }>();

    return {
      totalCommissionAmountCents: parseInt(row?.total ?? '0', 10),
      pendingCommissionAmountCents: parseInt(row?.pending ?? '0', 10),
      currency: row?.currency ?? 'BRL',
    };
  }
}
