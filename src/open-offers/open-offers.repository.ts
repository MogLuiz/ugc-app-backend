import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { OpenOffer } from './entities/open-offer.entity';
import { OpenOfferApplication } from './entities/open-offer-application.entity';
import { OpenOfferStatus } from '../common/enums/open-offer-status.enum';
import { ApplicationStatus } from '../common/enums/application-status.enum';

@Injectable()
export class OpenOffersRepository {
  constructor(
    @InjectRepository(OpenOffer)
    private readonly offerRepo: Repository<OpenOffer>,
    @InjectRepository(OpenOfferApplication)
    private readonly appRepo: Repository<OpenOfferApplication>,
  ) {}

  // ─── OpenOffer ────────────────────────────────────────────────────────────

  async save(offer: OpenOffer, manager?: EntityManager): Promise<OpenOffer> {
    const repo = manager ? manager.getRepository(OpenOffer) : this.offerRepo;
    return repo.save(offer);
  }

  async create(data: Partial<OpenOffer>): Promise<OpenOffer> {
    return this.offerRepo.save(this.offerRepo.create(data));
  }

  async findByIdForCompany(id: string, companyUserId: string): Promise<OpenOffer | null> {
    return this.offerRepo.findOne({
      where: { id, companyUserId },
      relations: ['jobType'],
    });
  }

  async findByIdForCompanyWithApplications(
    id: string,
    companyUserId: string,
  ): Promise<OpenOffer | null> {
    return this.offerRepo
      .createQueryBuilder('offer')
      .leftJoinAndSelect('offer.jobType', 'jobType')
      .leftJoinAndSelect('offer.applications', 'applications')
      .leftJoinAndSelect('applications.creatorUser', 'creatorUser')
      .leftJoinAndSelect('creatorUser.profile', 'creatorProfile')
      .where('offer.id = :id', { id })
      .andWhere('offer.companyUserId = :companyUserId', { companyUserId })
      .getOne();
  }

  /** Pessimistic write lock — use apenas dentro de transaction. */
  async findByIdForUpdate(id: string, manager: EntityManager): Promise<OpenOffer | null> {
    return manager.getRepository(OpenOffer).findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
  }

  async findById(id: string): Promise<OpenOffer | null> {
    return this.offerRepo.findOne({
      where: { id },
      relations: ['jobType'],
    });
  }

  async listByCompany(params: {
    companyUserId: string;
    status?: OpenOfferStatus;
    page: number;
    limit: number;
  }): Promise<{ items: OpenOffer[]; total: number }> {
    const qb = this.offerRepo
      .createQueryBuilder('offer')
      .leftJoinAndSelect('offer.jobType', 'jobType')
      .where('offer.companyUserId = :companyUserId', { companyUserId: params.companyUserId })
      .orderBy('offer.createdAt', 'DESC')
      .take(params.limit)
      .skip((params.page - 1) * params.limit);

    if (params.status) {
      qb.andWhere('offer.status = :status', { status: params.status });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  /**
   * Retorna todas as open offers da empresa sem paginação.
   * Decisão intencional para v1 do hub — ver nota de escala no plano.
   */
  async listAllByCompany(params: {
    companyUserId: string;
    statuses?: OpenOfferStatus[];
  }): Promise<OpenOffer[]> {
    const qb = this.offerRepo
      .createQueryBuilder('offer')
      .leftJoinAndSelect('offer.jobType', 'jobType')
      .where('offer.companyUserId = :companyUserId', { companyUserId: params.companyUserId })
      .orderBy('offer.createdAt', 'DESC');

    if (params.statuses?.length) {
      qb.andWhere('offer.status IN (:...statuses)', { statuses: params.statuses });
    }

    return qb.getMany();
  }

  /**
   * Lista ofertas OPEN não expiradas dentro do raio do creator.
   * Usa Haversine inline — PostGIS fora de escopo do MVP.
   */
  async listAvailable(params: {
    creatorLat: number;
    creatorLng: number;
    radiusKm: number;
    page: number;
    limit: number;
  }): Promise<{ items: OpenOffer[]; total: number }> {
    const { creatorLat, creatorLng, radiusKm, page, limit } = params;

    const [items, total] = await this.offerRepo
      .createQueryBuilder('offer')
      .leftJoinAndSelect('offer.jobType', 'jobType')
      .where('offer.status = :status', { status: OpenOfferStatus.OPEN })
      .andWhere('offer.expiresAt > now()')
      .andWhere(
        `(
          6371 * acos(LEAST(1.0,
            cos(radians(:lat)) * cos(radians(offer.jobLatitude)) *
            cos(radians(offer.jobLongitude) - radians(:lng)) +
            sin(radians(:lat)) * sin(radians(offer.jobLatitude))
          ))
        ) <= :radius`,
        { lat: creatorLat, lng: creatorLng, radius: radiusKm },
      )
      .orderBy('offer.createdAt', 'DESC')
      .take(limit)
      .skip((page - 1) * limit)
      .getManyAndCount();

    return { items, total };
  }

  // ─── OpenOfferApplication ─────────────────────────────────────────────────

  async saveApplication(
    app: OpenOfferApplication,
    manager?: EntityManager,
  ): Promise<OpenOfferApplication> {
    const repo = manager ? manager.getRepository(OpenOfferApplication) : this.appRepo;
    return repo.save(app);
  }

  async createApplication(data: Partial<OpenOfferApplication>): Promise<OpenOfferApplication> {
    return this.appRepo.save(this.appRepo.create(data));
  }

  async findApplicationByCreatorAndOffer(
    creatorUserId: string,
    openOfferId: string,
  ): Promise<OpenOfferApplication | null> {
    return this.appRepo.findOne({ where: { creatorUserId, openOfferId } });
  }

  async findPendingApplicationByCreatorAndOffer(
    creatorUserId: string,
    openOfferId: string,
  ): Promise<OpenOfferApplication | null> {
    return this.appRepo.findOne({
      where: { creatorUserId, openOfferId, status: ApplicationStatus.PENDING },
    });
  }

  /** Pessimistic write lock — use apenas dentro de transaction. */
  async findApplicationByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<OpenOfferApplication | null> {
    return manager.getRepository(OpenOfferApplication).findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
  }

  async updatePendingApplicationsToRejected(
    openOfferId: string,
    excludeApplicationId: string,
    manager: EntityManager,
  ): Promise<void> {
    await manager
      .getRepository(OpenOfferApplication)
      .createQueryBuilder()
      .update()
      .set({ status: ApplicationStatus.REJECTED, respondedAt: new Date() })
      .where('openOfferId = :openOfferId', { openOfferId })
      .andWhere('status = :status', { status: ApplicationStatus.PENDING })
      .andWhere('id != :excludeId', { excludeId: excludeApplicationId })
      .execute();
  }

  async countPendingApplicationsByOfferIds(
    offerIds: string[],
  ): Promise<Record<string, number>> {
    if (offerIds.length === 0) return {};
    const rows = await this.appRepo
      .createQueryBuilder('app')
      .select('app.openOfferId', 'offerId')
      .addSelect('COUNT(*)', 'count')
      .where('app.openOfferId IN (:...offerIds)', { offerIds })
      .andWhere('app.status = :status', { status: ApplicationStatus.PENDING })
      .groupBy('app.openOfferId')
      .getRawMany<{ offerId: string; count: string }>();
    return Object.fromEntries(rows.map((r) => [r.offerId, parseInt(r.count, 10)]));
  }

  async listApplicationsByCreator(creatorUserId: string): Promise<OpenOfferApplication[]> {
    return this.appRepo
      .createQueryBuilder('app')
      .leftJoinAndSelect('app.openOffer', 'offer')
      .leftJoinAndSelect('offer.jobType', 'jobType')
      .where('app.creatorUserId = :creatorUserId', { creatorUserId })
      .orderBy('app.appliedAt', 'DESC')
      .getMany();
  }

  /** For the creator hub — loads company data and excludes SELECTED (represented by ContractRequest). */
  async listApplicationsByCreatorForHub(
    creatorUserId: string,
  ): Promise<OpenOfferApplication[]> {
    return this.appRepo
      .createQueryBuilder('app')
      .leftJoinAndSelect('app.openOffer', 'offer')
      .leftJoinAndSelect('offer.jobType', 'jobType')
      .leftJoinAndSelect('offer.companyUser', 'offerCompany')
      .leftJoinAndSelect('offerCompany.profile', 'offerCompanyProfile')
      .leftJoinAndSelect('offerCompany.companyProfile', 'offerCompanyCompanyProfile')
      .where('app.creatorUserId = :creatorUserId', { creatorUserId })
      .andWhere('app.status != :selected', { selected: ApplicationStatus.SELECTED })
      .orderBy('app.appliedAt', 'DESC')
      .getMany();
  }
}
