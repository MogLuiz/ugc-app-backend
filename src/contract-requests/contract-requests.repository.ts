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
      relations: ['jobType'],
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
    status?: ContractRequestStatus;
  }): Promise<ContractRequest[]> {
    const query = this.repo
      .createQueryBuilder('contractRequest')
      .where('contractRequest.company_user_id = :companyUserId', {
        companyUserId: params.companyUserId,
      })
      .orderBy('contractRequest.created_at', 'DESC');

    if (params.status) {
      query.andWhere('contractRequest.status = :status', {
        status: params.status,
      });
    }

    return query.getMany();
  }

  async listPendingByCreator(creatorUserId: string): Promise<ContractRequest[]> {
    return this.repo
      .createQueryBuilder('contractRequest')
      .where('contractRequest.creator_user_id = :creatorUserId', { creatorUserId })
      .andWhere('contractRequest.status = :status', {
        status: ContractRequestStatus.PENDING_ACCEPTANCE,
      })
      .orderBy('contractRequest.created_at', 'DESC')
      .getMany();
  }

  async save(
    contractRequest: ContractRequest,
    manager?: EntityManager,
  ): Promise<ContractRequest> {
    return this.repository(manager).save(contractRequest);
  }
}
