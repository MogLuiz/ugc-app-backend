import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { UserRole } from '../common/enums/user-role.enum';
import { OpenOfferStatus } from '../common/enums/open-offer-status.enum';
import { ApplicationStatus } from '../common/enums/application-status.enum';
import { UsersRepository } from '../users/users.repository';
import { JobTypesService } from '../job-types/job-types.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { GeocodingService } from '../geocoding/geocoding.service';
import { SchedulingConflictService } from '../scheduling/scheduling-conflict.service';
import { ContractRequestsService } from '../contract-requests/contract-requests.service';
import { DistanceService } from '../contract-requests/services/distance.service';
import { PricingService } from '../contract-requests/services/pricing.service';
import { OpenOffersRepository } from './open-offers.repository';
import { OpenOfferApplication } from './entities/open-offer-application.entity';
import { CreateOpenOfferDto } from './dto/create-open-offer.dto';
import { ListCompanyOffersDto } from './dto/list-company-offers.dto';
import { ListAvailableOffersDto } from './dto/list-available-offers.dto';
import { User } from '../users/entities/user.entity';
import { JobMode } from '../common/enums/job-mode.enum';

@Injectable()
export class OpenOffersService {
  private readonly logger = new Logger(OpenOffersService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly openOffersRepository: OpenOffersRepository,
    private readonly usersRepository: UsersRepository,
    private readonly jobTypesService: JobTypesService,
    private readonly platformSettingsService: PlatformSettingsService,
    private readonly geocodingService: GeocodingService,
    private readonly distanceService: DistanceService,
    private readonly pricingService: PricingService,
    private readonly schedulingConflictService: SchedulingConflictService,
    private readonly contractRequestsService: ContractRequestsService,
    private readonly configService: ConfigService,
  ) {}

  async create(authUser: AuthUser, dto: CreateOpenOfferDto) {
    const company = await this.requireUser(authUser.authUserId, UserRole.COMPANY);

    const jobType = await this.jobTypesService.getActiveByIdOrThrow(dto.jobTypeId);
    if (jobType.mode !== JobMode.PRESENTIAL) {
      throw new BadRequestException('Apenas jobs presenciais são suportados no MVP');
    }

    if (dto.durationMinutes !== jobType.durationMinutes) {
      throw new BadRequestException(
        'durationMinutes deve ser igual à duração oficial do tipo de job',
      );
    }

    const startsAt = new Date(dto.startsAt);
    const expiresAt = new Date(dto.expiresAt);
    const now = new Date();

    if (expiresAt <= now) {
      throw new BadRequestException('expiresAt deve ser uma data futura');
    }
    if (expiresAt >= startsAt) {
      throw new BadRequestException('expiresAt deve ser anterior a startsAt');
    }

    if (dto.offeredAmount < jobType.minimumOfferedAmount) {
      throw new BadRequestException(
        `O valor mínimo para este tipo de job é R$ ${jobType.minimumOfferedAmount.toFixed(2)}`,
      );
    }

    const geocoded = await this.geocodingService.geocodeAddress(dto.jobAddress);
    if (!geocoded) {
      throw new BadRequestException({
        code: 'INVALID_JOB_LOCATION',
        message: 'Não foi possível validar o endereço informado. Revise o endereço.',
      });
    }

    const offer = await this.openOffersRepository.create({
      companyUserId: company.id,
      jobTypeId: dto.jobTypeId,
      description: dto.description.trim(),
      startsAt,
      durationMinutes: dto.durationMinutes,
      jobAddress: dto.jobAddress.trim(),
      jobFormattedAddress: geocoded.normalizedAddress ?? null,
      jobLatitude: geocoded.lat,
      jobLongitude: geocoded.lng,
      offeredAmount: dto.offeredAmount,
      expiresAt,
      status: OpenOfferStatus.OPEN,
      platformFeeRateSnapshot: jobType.platformFeeRate,
      minimumOfferedAmountSnapshot: jobType.minimumOfferedAmount,
    });

    return this.buildOfferPayload(offer, jobType);
  }

  async listMyCompany(authUser: AuthUser, query: ListCompanyOffersDto) {
    const company = await this.requireUser(authUser.authUserId, UserRole.COMPANY);
    const page = parsePositiveInt(query.page, 1);
    const limit = Math.min(parsePositiveInt(query.limit, 10), 50);

    const { items, total } = await this.openOffersRepository.listByCompany({
      companyUserId: company.id,
      status: query.status,
      page,
      limit,
    });

    return {
      items: items.map((o) => this.buildOfferPayload(o, o.jobType)),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async getMyCompanyDetail(authUser: AuthUser, offerId: string) {
    const company = await this.requireUser(authUser.authUserId, UserRole.COMPANY);

    const offer = await this.openOffersRepository.findByIdForCompanyWithApplications(
      offerId,
      company.id,
    );
    if (!offer) throw new NotFoundException('Oferta não encontrada');

    return {
      ...this.buildOfferPayload(offer, offer.jobType),
      applications: (offer.applications ?? []).map((app) => ({
        id: app.id,
        status: app.status,
        appliedAt: app.appliedAt,
        respondedAt: app.respondedAt,
        creator: {
          id: app.creatorUser?.id,
          name: app.creatorUser?.profile?.name ?? null,
          avatarUrl: app.creatorUser?.profile?.photoUrl ?? null,
          rating: app.creatorUser?.profile?.rating ?? null,
        },
      })),
    };
  }

  async cancelOffer(authUser: AuthUser, offerId: string) {
    const company = await this.requireUser(authUser.authUserId, UserRole.COMPANY);

    const offer = await this.openOffersRepository.findByIdForCompany(offerId, company.id);
    if (!offer) throw new NotFoundException('Oferta não encontrada');

    if (offer.status !== OpenOfferStatus.OPEN) {
      throw new BadRequestException(
        `Não é possível cancelar uma oferta com status ${offer.status}`,
      );
    }
    if (offer.expiresAt <= new Date()) {
      throw new BadRequestException('Esta oferta já expirou e não pode ser cancelada');
    }

    return this.dataSource.transaction(async (manager) => {
      offer.status = OpenOfferStatus.CANCELLED;
      await this.openOffersRepository.save(offer, manager);

      // Rejeitar candidaturas pendentes
      await manager
        .getRepository(OpenOfferApplication)
        .createQueryBuilder()
        .update()
        .set({ status: ApplicationStatus.REJECTED, respondedAt: new Date() })
        .where('open_offer_id = :offerId', { offerId: offer.id })
        .andWhere('status = :status', { status: ApplicationStatus.PENDING })
        .execute();

      return this.buildOfferPayload(offer, offer.jobType);
    });
  }

  async listAvailable(authUser: AuthUser, query: ListAvailableOffersDto) {
    const creator = await this.requireUser(authUser.authUserId, UserRole.CREATOR);
    this.ensureCreatorHasCoordinates(creator);

    const radiusKm =
      creator.creatorProfile?.serviceRadiusKm ??
      (this.configService.get<number>('DEFAULT_CREATOR_SERVICE_RADIUS_KM') ?? 30);

    const page = parsePositiveInt(query.page, 1);
    const limit = Math.min(parsePositiveInt(query.limit, 10), 50);

    const { items, total } = await this.openOffersRepository.listAvailable({
      creatorLat: creator.profile!.latitude!,
      creatorLng: creator.profile!.longitude!,
      radiusKm,
      page,
      limit,
    });

    return {
      items: items.map((o) => ({
        ...this.buildOfferPayload(o, o.jobType),
        distanceKm: this.distanceService.calculateDistanceKm(
          { lat: creator.profile!.latitude!, lng: creator.profile!.longitude! },
          { lat: o.jobLatitude, lng: o.jobLongitude },
        ),
      })),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async getAvailableDetail(authUser: AuthUser, offerId: string) {
    const creator = await this.requireUser(authUser.authUserId, UserRole.CREATOR);
    this.ensureCreatorHasCoordinates(creator);

    const offer = await this.openOffersRepository.findById(offerId);
    if (!offer || offer.status !== OpenOfferStatus.OPEN || offer.expiresAt <= new Date()) {
      throw new NotFoundException('Oferta não encontrada ou não disponível');
    }

    const ownApplication = await this.openOffersRepository.findApplicationByCreatorAndOffer(
      creator.id,
      offerId,
    );

    const distanceKm = this.distanceService.calculateDistanceKm(
      { lat: creator.profile!.latitude!, lng: creator.profile!.longitude! },
      { lat: offer.jobLatitude, lng: offer.jobLongitude },
    );

    return {
      ...this.buildOfferPayload(offer, offer.jobType),
      distanceKm,
      myApplication: ownApplication
        ? { id: ownApplication.id, status: ownApplication.status }
        : null,
    };
  }

  async apply(authUser: AuthUser, offerId: string) {
    const creator = await this.requireUser(authUser.authUserId, UserRole.CREATOR);
    this.ensureCreatorHasCoordinates(creator);

    const offer = await this.openOffersRepository.findById(offerId);
    if (!offer) throw new NotFoundException('Oferta não encontrada');

    if (offer.status !== OpenOfferStatus.OPEN) {
      throw new BadRequestException('Esta oferta não está mais disponível');
    }
    if (offer.expiresAt <= new Date()) {
      throw new BadRequestException('Esta oferta já expirou');
    }

    // Elegibilidade geográfica
    const radiusKm =
      creator.creatorProfile?.serviceRadiusKm ??
      (this.configService.get<number>('DEFAULT_CREATOR_SERVICE_RADIUS_KM') ?? 30);

    const distanceKm = this.distanceService.calculateDistanceKm(
      { lat: creator.profile!.latitude!, lng: creator.profile!.longitude! },
      { lat: offer.jobLatitude, lng: offer.jobLongitude },
    );
    if (distanceKm > radiusKm) {
      throw new BadRequestException('Esta oferta está fora do seu raio de atendimento');
    }

    // Verificar candidatura histórica (antes do insert para mensagem amigável)
    const existing = await this.openOffersRepository.findApplicationByCreatorAndOffer(
      creator.id,
      offerId,
    );
    if (existing) {
      if (existing.status === ApplicationStatus.WITHDRAWN) {
        throw new ConflictException(
          'Você já se candidatou a esta oferta. Não é possível reaplicar após retirar a candidatura.',
        );
      }
      throw new ConflictException('Você já possui uma candidatura para esta oferta');
    }

    // Verificar agenda
    const endsAt = new Date(offer.startsAt.getTime() + offer.durationMinutes * 60_000);
    await this.schedulingConflictService.ensureNoConflicts({
      creatorUserId: creator.id,
      startsAt: offer.startsAt,
      endsAt,
    });

    const app = await this.openOffersRepository.createApplication({
      openOfferId: offerId,
      creatorUserId: creator.id,
      status: ApplicationStatus.PENDING,
      appliedAt: new Date(),
    });

    return { id: app.id, status: app.status, appliedAt: app.appliedAt };
  }

  async withdraw(authUser: AuthUser, offerId: string) {
    const creator = await this.requireUser(authUser.authUserId, UserRole.CREATOR);

    const app = await this.openOffersRepository.findPendingApplicationByCreatorAndOffer(
      creator.id,
      offerId,
    );
    if (!app) {
      throw new NotFoundException('Candidatura pendente não encontrada para esta oferta');
    }

    app.status = ApplicationStatus.WITHDRAWN;
    app.respondedAt = new Date();
    await this.openOffersRepository.saveApplication(app);

    return { id: app.id, status: app.status };
  }

  async listMyApplications(authUser: AuthUser) {
    const creator = await this.requireUser(authUser.authUserId, UserRole.CREATOR);
    const apps = await this.openOffersRepository.listApplicationsByCreator(creator.id);

    return apps.map((app) => ({
      id: app.id,
      status: app.status,
      appliedAt: app.appliedAt,
      respondedAt: app.respondedAt,
      offer: app.openOffer
        ? {
            id: app.openOffer.id,
            status: app.openOffer.status,
            startsAt: app.openOffer.startsAt,
            offeredAmount: app.openOffer.offeredAmount,
            jobType: app.openOffer.jobType?.name ?? null,
          }
        : null,
    }));
  }

  async selectCreator(authUser: AuthUser, offerId: string, applicationId: string) {
    const company = await this.requireUser(authUser.authUserId, UserRole.COMPANY);

    return this.dataSource.transaction(async (manager) => {
      // 1. Lock pessimista na oferta
      const offer = await this.openOffersRepository.findByIdForUpdate(offerId, manager);
      if (!offer || offer.companyUserId !== company.id) {
        throw new NotFoundException('Oferta não encontrada');
      }

      // 2. Validar estado da oferta
      if (offer.status !== OpenOfferStatus.OPEN) {
        throw new ConflictException(
          `Não é possível selecionar um creator em uma oferta com status ${offer.status}`,
        );
      }
      if (offer.expiresAt <= new Date()) {
        throw new BadRequestException('Esta oferta já expirou');
      }

      // 3. Lock pessimista na candidatura
      const application = await this.openOffersRepository.findApplicationByIdForUpdate(
        applicationId,
        manager,
      );
      if (!application || application.openOfferId !== offerId) {
        throw new NotFoundException('Candidatura não encontrada para esta oferta');
      }
      if (application.status !== ApplicationStatus.PENDING) {
        throw new ConflictException(
          `Esta candidatura não está mais disponível (status: ${application.status})`,
        );
      }

      // 4. Carregar creator com relations necessárias para o snapshot
      const creatorUser = await manager.getRepository(User).findOne({
        where: { id: application.creatorUserId },
        relations: ['profile', 'creatorProfile'],
      });
      if (!creatorUser) throw new NotFoundException('Creator não encontrado');

      if (!creatorUser.profile?.hasValidCoordinates) {
        throw new BadRequestException('Creator não possui localização válida');
      }

      // 5. Validar agenda com lock transacional
      const endsAt = new Date(offer.startsAt.getTime() + offer.durationMinutes * 60_000);
      const hasConflict = await this.schedulingConflictService.hasConflicts({
        creatorUserId: creatorUser.id,
        startsAt: offer.startsAt,
        endsAt,
        manager,
      });
      if (hasConflict) {
        this.logger.warn(
          `Scheduling conflict on open offer selection. offerId=${offerId} creatorId=${creatorUser.id}`,
        );
        throw new ConflictException(
          'A agenda do creator não está mais disponível para este horário',
        );
      }

      // 6. Calcular distância e pricing
      const distanceKm = this.distanceService.calculateDistanceKm(
        { lat: creatorUser.profile.latitude!, lng: creatorUser.profile.longitude! },
        { lat: offer.jobLatitude, lng: offer.jobLongitude },
      );

      const effectiveServiceRadiusKm =
        creatorUser.creatorProfile?.serviceRadiusKm ??
        (this.configService.get<number>('DEFAULT_CREATOR_SERVICE_RADIUS_KM') ?? 30);

      const settings = await this.platformSettingsService.getCurrent();
      const transportPricePerKm =
        settings?.transportPricePerKm ??
        (this.configService.get<number>('TRANSPORT_PRICE_PER_KM') ?? 2);
      const transportMinimumFee =
        settings?.transportMinimumFee ??
        (this.configService.get<number>('MIN_TRANSPORT_PRICE') ?? 20);

      const pricing = this.pricingService.buildPricing({
        creatorBasePrice: offer.offeredAmount,
        distanceKm,
        transportPricePerKm,
        transportMinimumFee,
        platformFeeRate: offer.platformFeeRateSnapshot,
      });

      // 7. Criar ContractRequest (sempre ACCEPTED) — mesmo manager
      const contractRequest = await this.contractRequestsService.createFromOpenOfferSelection(
        {
          companyUserId: company.id,
          creatorUser,
          jobTypeId: offer.jobTypeId,
          offeredAmount: offer.offeredAmount,
          openOfferId: offer.id,
          startsAt: offer.startsAt,
          durationMinutes: offer.durationMinutes,
          jobAddress: offer.jobAddress,
          jobFormattedAddress: offer.jobFormattedAddress,
          jobLatitude: offer.jobLatitude,
          jobLongitude: offer.jobLongitude,
          distanceKm,
          effectiveServiceRadiusKm,
          platformFeeRateSnapshot: offer.platformFeeRateSnapshot,
          pricing,
        },
        manager,
      );

      // 8. Marcar candidatura como SELECTED — mesmo manager
      application.status = ApplicationStatus.SELECTED;
      application.respondedAt = new Date();
      await this.openOffersRepository.saveApplication(application, manager);

      // 9. Rejeitar demais candidaturas PENDING — mesmo manager
      await this.openOffersRepository.updatePendingApplicationsToRejected(
        offerId,
        applicationId,
        manager,
      );

      // 10. Fechar a oferta — mesmo manager
      offer.status = OpenOfferStatus.FILLED;
      await this.openOffersRepository.save(offer, manager);

      return {
        contractRequestId: contractRequest.id,
        offerId: offer.id,
        creatorId: creatorUser.id,
      };
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async requireUser(authUserId: string, role: UserRole): Promise<User> {
    const user = await this.usersRepository.findByAuthUserIdWithProfiles(authUserId);
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (user.role !== role) {
      throw new ForbiddenException(
        role === UserRole.COMPANY
          ? 'Apenas empresas podem executar esta ação'
          : 'Apenas creators podem executar esta ação',
      );
    }
    return user;
  }

  private ensureCreatorHasCoordinates(creator: User): void {
    if (!creator.profile?.hasValidCoordinates) {
      throw new ForbiddenException(
        'Complete seu endereço para acessar oportunidades',
      );
    }
  }

  private buildOfferPayload(offer: any, jobType: any) {
    return {
      id: offer.id,
      status: offer.status,
      description: offer.description,
      startsAt: offer.startsAt,
      durationMinutes: offer.durationMinutes,
      jobFormattedAddress: offer.jobFormattedAddress ?? offer.jobAddress,
      offeredAmount: offer.offeredAmount,
      expiresAt: offer.expiresAt,
      platformFeeRateSnapshot: offer.platformFeeRateSnapshot,
      jobType: jobType ? { id: jobType.id, name: jobType.name } : null,
      createdAt: offer.createdAt,
      updatedAt: offer.updatedAt,
    };
  }
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
