import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { User } from '../users/entities/user.entity';
import { UsersRepository } from '../users/users.repository';
import { UserRole } from '../common/enums/user-role.enum';
import { JobTypesService } from '../job-types/job-types.service';
import { CreatorJobTypesRepository } from '../creator-job-types/creator-job-types.repository';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { GeocodingService } from '../geocoding/geocoding.service';
import { ContractRequestsRepository } from './contract-requests.repository';
import { DistanceService } from './services/distance.service';
import { PricingService } from './services/pricing.service';
import { SchedulingConflictService } from '../scheduling/scheduling-conflict.service';
import { parseDateOrThrow } from '../common/utils/scheduling-time.util';
import { JobMode } from '../common/enums/job-mode.enum';
import { PaymentStatus } from '../common/enums/payment-status.enum';
import { ContractRequestStatus } from '../common/enums/contract-request-status.enum';
import { PreviewContractRequestDto } from './dto/preview-contract-request.dto';
import { CreateContractRequestDto } from './dto/create-contract-request.dto';
import { ListCompanyContractRequestsDto } from './dto/list-company-contract-requests.dto';
import { RejectContractRequestDto } from './dto/reject-contract-request.dto';
import { ContractRequest } from './entities/contract-request.entity';

type PreparedContractRequest = {
  companyUser: User;
  creatorUser: User;
  startsAt: Date;
  endsAt: Date;
  locationAddress: string;
  locationLat: number;
  locationLng: number;
  distanceKm: number;
  durationMinutes: number;
  description: string;
  creatorBasePrice: number;
  pricing: ReturnType<PricingService['buildPricing']>;
};

@Injectable()
export class ContractRequestsService {
  private readonly logger = new Logger(ContractRequestsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly usersRepository: UsersRepository,
    private readonly jobTypesService: JobTypesService,
    private readonly creatorJobTypesRepository: CreatorJobTypesRepository,
    private readonly platformSettingsService: PlatformSettingsService,
    private readonly geocodingService: GeocodingService,
    private readonly contractRequestsRepository: ContractRequestsRepository,
    private readonly distanceService: DistanceService,
    private readonly pricingService: PricingService,
    private readonly schedulingConflictService: SchedulingConflictService,
  ) {}

  async preview(user: AuthUser, dto: PreviewContractRequestDto) {
    const prepared = await this.prepareContractRequest(user, dto);

    return {
      mode: JobMode.PRESENTIAL,
      startsAt: prepared.startsAt.toISOString(),
      durationMinutes: prepared.durationMinutes,
      locationAddress: prepared.locationAddress,
      locationLat: prepared.locationLat,
      locationLng: prepared.locationLng,
      creatorId: prepared.creatorUser.id,
      creatorNameSnapshot: prepared.creatorUser.profile?.name ?? 'Creator',
      creatorAvatarUrlSnapshot: prepared.creatorUser.profile?.photoUrl ?? null,
      ...prepared.pricing,
    };
  }

  async create(user: AuthUser, dto: CreateContractRequestDto) {
    return this.dataSource.transaction(async (manager) => {
      const prepared = await this.prepareContractRequest(user, dto, manager);
      const initialStatus = prepared.creatorUser.creatorProfile?.autoAcceptBookings
        ? ContractRequestStatus.ACCEPTED
        : ContractRequestStatus.PENDING_ACCEPTANCE;

      const created = await this.contractRequestsRepository.createAndSave(
        {
          companyUserId: prepared.companyUser.id,
          creatorUserId: prepared.creatorUser.id,
          jobTypeId: dto.jobTypeId,
          mode: JobMode.PRESENTIAL,
          description: prepared.description,
          status: initialStatus,
          paymentStatus: PaymentStatus.PAID,
          currency: prepared.pricing.currency,
          termsAcceptedAt: new Date(),
          startsAt: prepared.startsAt,
          durationMinutes: prepared.durationMinutes,
          locationAddress: prepared.locationAddress,
          locationLat: prepared.locationLat,
          locationLng: prepared.locationLng,
          distanceKm: prepared.distanceKm,
          transportFee: prepared.pricing.transportFee,
          creatorBasePrice: prepared.pricing.creatorBasePrice,
          platformFee: prepared.pricing.platformFee,
          totalPrice: prepared.pricing.totalPrice,
          transportPricePerKmUsed: prepared.pricing.transportPricePerKmUsed,
          transportMinimumFeeUsed: prepared.pricing.transportMinimumFeeUsed,
          creatorNameSnapshot: prepared.creatorUser.profile?.name ?? 'Creator',
          creatorAvatarUrlSnapshot: prepared.creatorUser.profile?.photoUrl ?? null,
          rejectionReason: null,
        },
        manager,
      );

      return this.buildPayload(created);
    });
  }

  async listMyCompany(
    user: AuthUser,
    query: ListCompanyContractRequestsDto,
  ) {
    const companyUser = await this.requireAuthenticatedUser(user.authUserId);
    this.ensureRole(companyUser, UserRole.COMPANY, 'Apenas empresas podem listar contratações');

    const items = await this.contractRequestsRepository.listByCompany({
      companyUserId: companyUser.id,
      status: query.status,
    });

    return items.map((item) => this.buildPayload(item));
  }

  async listMyCreatorPending(user: AuthUser) {
    const creatorUser = await this.requireAuthenticatedUser(user.authUserId);
    this.ensureRole(
      creatorUser,
      UserRole.CREATOR,
      'Apenas creators podem listar contratações pendentes',
    );

    const items = await this.contractRequestsRepository.listPendingByCreator(creatorUser.id);
    return items.map((item) => this.buildPayload(item));
  }

  async accept(user: AuthUser, contractRequestId: string) {
    return this.dataSource.transaction(async (manager) => {
      const actor = await this.findActorForUpdate(user.authUserId, manager);
      const contractRequest = await this.getContractRequestForUpdate(contractRequestId, manager);

      this.ensureCreatorOwnsContractRequest(actor, contractRequest);
      this.ensurePendingAcceptance(contractRequest, 'aceitar');

      const endsAt = this.calculateEndDate(contractRequest.startsAt, contractRequest.durationMinutes);
      const hasConflict = await this.schedulingConflictService.hasConflicts({
        creatorUserId: contractRequest.creatorUserId,
        startsAt: contractRequest.startsAt,
        endsAt,
        manager,
        ignoreContractRequestId: contractRequest.id,
      });

      if (hasConflict) {
        this.logger.warn(
          `Conflict detected when accepting contract request ${contractRequest.id}`,
        );
        throw new BadRequestException(
          'O creator já possui um compromisso conflitante para o horário informado',
        );
      }

      contractRequest.status = ContractRequestStatus.ACCEPTED;
      contractRequest.rejectionReason = null;

      const updated = await this.contractRequestsRepository.save(contractRequest, manager);
      return this.buildPayload(updated);
    });
  }

  async reject(
    user: AuthUser,
    contractRequestId: string,
    dto: RejectContractRequestDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const actor = await this.findActorForUpdate(user.authUserId, manager);
      const contractRequest = await this.getContractRequestForUpdate(contractRequestId, manager);

      this.ensureCreatorOwnsContractRequest(actor, contractRequest);
      this.ensurePendingAcceptance(contractRequest, 'rejeitar');

      contractRequest.status = ContractRequestStatus.REJECTED;
      contractRequest.rejectionReason = dto.rejectionReason?.trim() || null;

      const updated = await this.contractRequestsRepository.save(contractRequest, manager);
      return this.buildPayload(updated);
    });
  }

  private async prepareContractRequest(
    user: AuthUser,
    dto: PreviewContractRequestDto | CreateContractRequestDto,
    manager?: EntityManager,
  ): Promise<PreparedContractRequest> {
    if (!dto.termsAccepted) {
      throw new BadRequestException('É necessário aceitar os termos para continuar');
    }

    const companyUser = await this.requireAuthenticatedUser(user.authUserId);
    this.ensureRole(companyUser, UserRole.COMPANY, 'Apenas empresas podem contratar creators');

    const userRepository = this.userRepository(manager);
    const creatorUser = await userRepository.findOne({
      where: { id: dto.creatorId },
      relations: ['profile', 'creatorProfile'],
    });

    if (!creatorUser || creatorUser.role !== UserRole.CREATOR) {
      throw new NotFoundException('Creator não encontrado');
    }

    const jobType = await this.jobTypesService.getActiveByIdOrThrow(dto.jobTypeId);
    if (jobType.mode !== JobMode.PRESENTIAL) {
      throw new BadRequestException(
        'A contratação deste MVP suporta apenas jobs presenciais',
      );
    }

    if (dto.durationMinutes !== jobType.durationMinutes) {
      throw new BadRequestException(
        'durationMinutes diverge da duração oficial do tipo de job',
      );
    }

    const creatorJobType = await this.creatorJobTypesRepository.findActiveByCreatorAndJobType(
      creatorUser.id,
      jobType.id,
    );
    if (!creatorJobType) {
      throw new BadRequestException(
        'O creator não possui este tipo de job disponível',
      );
    }
    const creatorBasePriceReais =
      creatorJobType.basePriceCents != null
        ? creatorJobType.basePriceCents / 100
        : jobType.price;

    const geocoded = await this.geocodingService.geocodeAddress(dto.locationAddress);
    if (!geocoded) {
      this.logger.warn(`Geocoding failed for job address: ${dto.locationAddress}`);
      throw new BadRequestException(
        'Não foi possível geocodificar o endereço informado para a contratação',
      );
    }

    const creatorProfile = creatorUser.creatorProfile;
    if (
      !creatorProfile ||
      creatorProfile.latitude == null ||
      creatorProfile.longitude == null ||
      creatorProfile.serviceRadiusKm == null
    ) {
      throw new BadRequestException(
        'Este creator ainda não possui coordenadas ou raio de atendimento configurados para contratação presencial',
      );
    }

    if (creatorProfile.serviceRadiusKm <= 0) {
      throw new BadRequestException(
        'Este creator ainda não possui raio de atendimento válido para contratação presencial',
      );
    }

    const distanceKm = this.distanceService.calculateDistanceKm(
      {
        lat: creatorProfile.latitude,
        lng: creatorProfile.longitude,
      },
      {
        lat: geocoded.lat,
        lng: geocoded.lng,
      },
    );

    if (distanceKm > creatorProfile.serviceRadiusKm) {
      this.logger.warn(
        `Location out of service radius for creator ${creatorUser.id}. distanceKm=${distanceKm}, serviceRadiusKm=${creatorProfile.serviceRadiusKm}`,
      );
      throw new BadRequestException(
        'O local informado está fora do raio de atendimento do creator',
      );
    }

    const startsAt = parseDateOrThrow(dto.startsAt, 'startsAt');
    const endsAt = this.calculateEndDate(startsAt, jobType.durationMinutes);
    const hasConflict = await this.schedulingConflictService.hasConflicts({
      creatorUserId: creatorUser.id,
      startsAt,
      endsAt,
      manager,
    });

    if (hasConflict) {
      this.logger.warn(
        `Scheduling conflict while preparing contract request for creator ${creatorUser.id}`,
      );
      throw new BadRequestException(
        'O creator já possui um compromisso conflitante para o horário informado',
      );
    }

    const settings = await this.platformSettingsService.getCurrentOrThrow();
    const pricing = this.pricingService.buildPricing({
      creatorBasePrice: creatorBasePriceReais,
      distanceKm,
      transportPricePerKm: settings.transportPricePerKm,
      transportMinimumFee: settings.transportMinimumFee,
    });

    return {
      companyUser,
      creatorUser,
      startsAt,
      endsAt,
      locationAddress: geocoded.normalizedAddress ?? dto.locationAddress.trim(),
      locationLat: geocoded.lat,
      locationLng: geocoded.lng,
      distanceKm,
      durationMinutes: jobType.durationMinutes,
      description: dto.description.trim(),
      creatorBasePrice: creatorBasePriceReais,
      pricing,
    };
  }

  private async requireAuthenticatedUser(authUserId: string): Promise<User> {
    const user = await this.usersRepository.findByAuthUserIdWithProfiles(authUserId);

    if (!user) {
      throw new NotFoundException(
        'Usuário não encontrado. Complete o cadastro em POST /users/bootstrap',
      );
    }

    return user;
  }

  private async findActorForUpdate(
    authUserId: string,
    manager: EntityManager,
  ): Promise<User> {
    const actor = await manager.getRepository(User).findOne({
      where: { authUserId },
      relations: ['profile', 'creatorProfile'],
    });

    if (!actor) {
      throw new NotFoundException(
        'Usuário não encontrado. Complete o cadastro em POST /users/bootstrap',
      );
    }

    return actor;
  }

  private async getContractRequestForUpdate(
    contractRequestId: string,
    manager: EntityManager,
  ): Promise<ContractRequest> {
    const contractRequest = await this.contractRequestsRepository.findByIdForUpdate(
      contractRequestId,
      manager,
    );

    if (!contractRequest) {
      throw new NotFoundException('Contratação não encontrada');
    }

    return contractRequest;
  }

  private ensureRole(user: User, role: UserRole, message: string): void {
    if (user.role !== role) {
      throw new ForbiddenException(message);
    }
  }

  private ensureCreatorOwnsContractRequest(actor: User, contractRequest: ContractRequest): void {
    this.ensureRole(actor, UserRole.CREATOR, 'Apenas creators podem agir sobre contratações');

    if (actor.id !== contractRequest.creatorUserId) {
      throw new ForbiddenException('Você não pode agir sobre contratação de outro creator');
    }
  }

  private ensurePendingAcceptance(
    contractRequest: ContractRequest,
    action: 'aceitar' | 'rejeitar',
  ): void {
    if (contractRequest.status !== ContractRequestStatus.PENDING_ACCEPTANCE) {
      throw new BadRequestException(
        `Não é possível ${action} uma contratação com status ${contractRequest.status}`,
      );
    }
  }

  private buildPayload(contractRequest: ContractRequest) {
    return {
      id: contractRequest.id,
      companyId: contractRequest.companyUserId,
      creatorId: contractRequest.creatorUserId,
      jobTypeId: contractRequest.jobTypeId,
      mode: contractRequest.mode,
      description: contractRequest.description,
      status: contractRequest.status,
      paymentStatus: contractRequest.paymentStatus,
      currency: contractRequest.currency,
      termsAcceptedAt: contractRequest.termsAcceptedAt.toISOString(),
      startsAt: contractRequest.startsAt.toISOString(),
      durationMinutes: contractRequest.durationMinutes,
      locationAddress: contractRequest.locationAddress,
      locationLat: contractRequest.locationLat,
      locationLng: contractRequest.locationLng,
      distanceKm: contractRequest.distanceKm,
      transportFee: contractRequest.transportFee,
      creatorBasePrice: contractRequest.creatorBasePrice,
      platformFee: contractRequest.platformFee,
      totalPrice: contractRequest.totalPrice,
      transportPricePerKmUsed: contractRequest.transportPricePerKmUsed,
      transportMinimumFeeUsed: contractRequest.transportMinimumFeeUsed,
      creatorNameSnapshot: contractRequest.creatorNameSnapshot,
      creatorAvatarUrlSnapshot: contractRequest.creatorAvatarUrlSnapshot,
      rejectionReason: contractRequest.rejectionReason,
      createdAt: contractRequest.createdAt?.toISOString(),
      updatedAt: contractRequest.updatedAt?.toISOString(),
    };
  }

  private calculateEndDate(startsAt: Date, durationMinutes: number): Date {
    return new Date(startsAt.getTime() + durationMinutes * 60 * 1000);
  }

  private userRepository(manager?: EntityManager): Repository<User> {
    return manager ? manager.getRepository(User) : this.dataSource.getRepository(User);
  }
}
