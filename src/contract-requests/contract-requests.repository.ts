import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ContractRequest } from './entities/contract-request.entity';
import { ContractRequestStatus } from '../common/enums/contract-request-status.enum';

@Injectable()
export class ContractRequestsRepository {
  constructor(
    @InjectRepository(ContractRequest)
    private readonly repo: Repository<ContractRequest>,
  ) {}

  private repository(manager?: EntityManager): Repository<ContractRequest> {
    return manager ? manager.getRepository(ContractRequest) : this.repo;
  }

  async createAndSave(
    data: Partial<ContractRequest>,
    manager: EntityManager,
  ): Promise<ContractRequest> {
    const repository = this.repository(manager);
    return repository.save(repository.create(data));
  }

  async findById(id: string): Promise<ContractRequest | null> {
    return this.repo.findOne({
      where: { id },
      relations: ['jobType'],
    });
  }

  async findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<ContractRequest | null> {
    return this.repository(manager).findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
  }

  async findOverlappingAcceptedRequests(
    creatorUserId: string,
    startsAt: Date,
    endsAt: Date,
    manager?: EntityManager,
    ignoreContractRequestId?: string,
  ): Promise<ContractRequest[]> {
    const query = this.repository(manager)
      .createQueryBuilder('contractRequest')
      .where('contractRequest.creator_user_id = :creatorUserId', { creatorUserId })
      .andWhere('contractRequest.status = :status', {
        status: ContractRequestStatus.ACCEPTED,
      })
      .andWhere('contractRequest.starts_at < :endsAt', { endsAt })
      .andWhere(
        `(contractRequest.starts_at + (contractRequest.duration_minutes || ' minutes')::interval) > :startsAt`,
        { startsAt },
      )
      .orderBy('contractRequest.starts_at', 'ASC');

    if (manager) {
      query.setLock('pessimistic_write');
    }

    if (ignoreContractRequestId) {
      query.andWhere('contractRequest.id != :ignoreContractRequestId', {
        ignoreContractRequestId,
      });
    }

    return query.getMany();
  }

  async listByCompany(params: {
    companyUserId: string;
    statuses?: ContractRequestStatus[];
  }): Promise<ContractRequest[]> {
    const query = this.repo
      .createQueryBuilder('contractRequest')
      .leftJoinAndSelect('contractRequest.jobType', 'jobType')
      .leftJoinAndSelect('contractRequest.creatorUser', 'creatorUser')
      .leftJoinAndSelect('creatorUser.profile', 'creatorProfile')
      .where('contractRequest.company_user_id = :companyUserId', {
        companyUserId: params.companyUserId,
      })
      .orderBy('contractRequest.created_at', 'DESC');

    if (params.statuses?.length) {
      query.andWhere('contractRequest.status IN (:...statuses)', {
        statuses: params.statuses,
      });
    }

    return query.getMany();
  }

  async getCreatorDashboardAggregates(creatorUserId: string): Promise<{
    confirmedCampaigns: number;
    pendingInvites: number;
    /** MVP temporário: soma de total_price onde ACCEPTED (ver CreatorService). */
    earningsSumAccepted: number;
  }> {
    const confirmedCampaigns = await this.repo.count({
      where: {
        creatorUserId,
        status: ContractRequestStatus.ACCEPTED,
      },
    });

    const pendingInvites = await this.repo.count({
      where: {
        creatorUserId,
        status: ContractRequestStatus.PENDING_ACCEPTANCE,
      },
    });

    const sumRow = await this.repo
      .createQueryBuilder('cr')
      .select('COALESCE(SUM(cr.total_price), 0)', 'sum')
      .where('cr.creator_user_id = :creatorUserId', { creatorUserId })
      .andWhere('cr.status = :status', { status: ContractRequestStatus.ACCEPTED })
      .getRawOne<{ sum: string }>();

    const earningsSumAccepted = parseFloat(sumRow?.sum ?? '0');
    return {
      confirmedCampaigns,
      pendingInvites,
      earningsSumAccepted: Number.isFinite(earningsSumAccepted) ? earningsSumAccepted : 0,
    };
  }

  /**
   * Campanhas aceitas com gravação a partir de `fromInclusive` (inclusive), ordenadas por data.
   */
  async listAcceptedUpcomingForCreator(
    creatorUserId: string,
    fromInclusive: Date,
  ): Promise<ContractRequest[]> {
    return this.repo
      .createQueryBuilder('contractRequest')
      .leftJoinAndSelect('contractRequest.jobType', 'jobType')
      .leftJoinAndSelect('contractRequest.companyUser', 'companyUser')
      .leftJoinAndSelect('companyUser.profile', 'companyUserProfile')
      .leftJoinAndSelect('companyUser.companyProfile', 'companyUserCompanyProfile')
      .where('contractRequest.creator_user_id = :creatorUserId', { creatorUserId })
      .andWhere('contractRequest.status = :status', {
        status: ContractRequestStatus.ACCEPTED,
      })
      .andWhere('contractRequest.starts_at >= :fromInclusive', { fromInclusive })
      .orderBy('contractRequest.startsAt', 'ASC')
      .getMany();
  }

  /**
   * Dataset simples para o feed de atividade: contratos do creator ordenados por updated_at.
   */
  async listRecentForCreatorActivity(
    creatorUserId: string,
    limit: number,
  ): Promise<ContractRequest[]> {
    return this.repo
      .createQueryBuilder('contractRequest')
      .leftJoinAndSelect('contractRequest.jobType', 'jobType')
      .leftJoinAndSelect('contractRequest.companyUser', 'companyUser')
      .leftJoinAndSelect('companyUser.profile', 'companyUserProfile')
      .leftJoinAndSelect('companyUser.companyProfile', 'companyUserCompanyProfile')
      .where('contractRequest.creator_user_id = :creatorUserId', { creatorUserId })
      .orderBy('contractRequest.updatedAt', 'DESC')
      .limit(limit)
      .getMany();
  }

  async listPendingByCreator(
    creatorUserId: string,
    /** Futuro: 'distance' | 'totalPrice' – produto deve definir padrão de conversão */
    _sortBy?: 'createdAt' | 'distance' | 'totalPrice',
  ): Promise<ContractRequest[]> {
    const qb = this.repo
      .createQueryBuilder('contractRequest')
      .leftJoinAndSelect('contractRequest.jobType', 'jobType')
      .leftJoinAndSelect('contractRequest.companyUser', 'companyUser')
      .leftJoinAndSelect('companyUser.profile', 'companyUserProfile')
      .leftJoinAndSelect('companyUser.companyProfile', 'companyUserCompanyProfile')
      .where('contractRequest.creator_user_id = :creatorUserId', { creatorUserId })
      .andWhere('contractRequest.status = :status', {
        status: ContractRequestStatus.PENDING_ACCEPTANCE,
      })
      .orderBy('contractRequest.createdAt', 'DESC');

    return qb.getMany();
  }

  async listByCreatorStatus(
    creatorUserId: string,
    status: ContractRequestStatus,
  ): Promise<ContractRequest[]> {
    return this.repo
      .createQueryBuilder('contractRequest')
      .leftJoinAndSelect('contractRequest.jobType', 'jobType')
      .leftJoinAndSelect('contractRequest.companyUser', 'companyUser')
      .leftJoinAndSelect('companyUser.profile', 'companyUserProfile')
      .leftJoinAndSelect('companyUser.companyProfile', 'companyUserCompanyProfile')
      .where('contractRequest.creator_user_id = :creatorUserId', { creatorUserId })
      .andWhere('contractRequest.status = :status', { status })
      .orderBy('contractRequest.startsAt', 'DESC')
      .getMany();
  }

  async save(
    contractRequest: ContractRequest,
    manager?: EntityManager,
  ): Promise<ContractRequest> {
    return this.repository(manager).save(contractRequest);
  }
}
