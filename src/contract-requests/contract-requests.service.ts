import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
import { PricingService, TransportPricing } from './services/pricing.service';
import { FinancialSnapshotService, ContractSnapshot } from './services/financial-snapshot.service';
import { SchedulingConflictService } from '../scheduling/scheduling-conflict.service';
import { parseDateOrThrow } from '../common/utils/scheduling-time.util';
import { JobMode } from '../common/enums/job-mode.enum';
import { PaymentStatus } from '../common/enums/payment-status.enum';
import { ContractRequestStatus } from '../common/enums/contract-request-status.enum';
import { PreviewContractRequestDto } from './dto/preview-contract-request.dto';
import { CreateContractRequestDto } from './dto/create-contract-request.dto';
import {
  CompanyCampaignFilterStatus,
  ListCompanyContractRequestsDto,
} from './dto/list-company-contract-requests.dto';
import { RejectContractRequestDto } from './dto/reject-contract-request.dto';
import { DisputeCompletionDto } from './dto/dispute-completion.dto';
import { ContractRequest } from './entities/contract-request.entity';
import { ConversationsService } from '../conversations/conversations.service';
import {
  CONTRACT_REQUEST_COMPLETED_EVENT,
  ContractRequestCompletedEvent,
} from './events/contract-request-completed.event';
import {
  CONTRACT_REQUEST_ACCEPTED_EVENT,
  ContractRequestAcceptedEvent,
} from './events/contract-request-accepted.event';
import { CompanyBalanceService } from '../billing/company-balance.service';
import { BalanceTransactionType } from '../billing/enums/balance-transaction-type.enum';
import { Payment } from '../payments/entities/payment.entity';
import { SettlementStatus } from '../payments/enums/settlement-status.enum';
import { LegalService } from '../legal/legal.service';
import { LegalTermType } from '../common/enums/legal-term-type.enum';
import { LegalAcceptance } from '../legal/entities/legal-acceptance.entity';

type PreparedContractRequest = {
  companyUser: User;
  creatorUser: User;
  startsAt: Date;
  endsAt: Date;
  jobAddress: string;
  jobFormattedAddress: string | null;
  jobLatitude: number;
  jobLongitude: number;
  distanceKm: number;
  effectiveServiceRadiusKm: number;
  durationMinutes: number;
  description: string;
  financialSnapshot: ContractSnapshot;
  transport: TransportPricing;
};

export type CreateFromOpenOfferParams = {
  companyUserId: string;
  creatorUser: User;
  jobTypeId: string;
  openOfferId: string;
  startsAt: Date;
  durationMinutes: number;
  jobAddress: string;
  jobFormattedAddress: string | null;
  jobLatitude: number;
  jobLongitude: number;
  distanceKm: number;
  effectiveServiceRadiusKm: number;
  financialSnapshot: ContractSnapshot;
  transport: TransportPricing;
  hiringAcceptance: LegalAcceptance;
};

type GeocodingCacheEntry = {
  lat: number;
  lng: number;
  normalizedAddress: string | null;
  createdAt: number;
};

type CompanyCampaignStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

type LegalAcceptanceContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class ContractRequestsService {
  private readonly logger = new Logger(ContractRequestsService.name);
  private readonly geocodingPreviewCache = new Map<string, GeocodingCacheEntry>();
  private readonly geocodingPreviewCacheTtlMs = 2 * 60 * 1000;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly usersRepository: UsersRepository,
    private readonly jobTypesService: JobTypesService,
    private readonly creatorJobTypesRepository: CreatorJobTypesRepository,
    private readonly platformSettingsService: PlatformSettingsService,
    private readonly geocodingService: GeocodingService,
    private readonly contractRequestsRepository: ContractRequestsRepository,
    private readonly distanceService: DistanceService,
    private readonly pricingService: PricingService,
    private readonly financialSnapshotService: FinancialSnapshotService,
    private readonly schedulingConflictService: SchedulingConflictService,
    private readonly conversationsService: ConversationsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly companyBalanceService: CompanyBalanceService,
    private readonly legalService: LegalService,
  ) {}

  async preview(user: AuthUser, dto: PreviewContractRequestDto) {
    const prepared = await this.prepareContractRequest(user, dto);
    const snap = prepared.financialSnapshot;
    const currency = 'BRL';
    const transportFeeReais = snap.transportFeeAmountCents / 100;

    return {
      mode: JobMode.PRESENTIAL,
      currency,
      startsAt: prepared.startsAt.toISOString(),
      durationMinutes: prepared.durationMinutes,
      jobAddress: prepared.jobAddress,
      jobFormattedAddress: prepared.jobFormattedAddress,
      jobLatitude: prepared.jobLatitude,
      jobLongitude: prepared.jobLongitude,
      creatorId: prepared.creatorUser.id,
      creatorNameSnapshot: prepared.creatorUser.profile?.name ?? 'Creator',
      creatorAvatarUrlSnapshot: prepared.creatorUser.profile?.photoUrl ?? null,
      creatorDistance: this.distanceService.buildSummary(
        prepared.distanceKm,
        prepared.effectiveServiceRadiusKm,
      ),
      transport: {
        price: transportFeeReais,
        formatted: this.formatCurrency(transportFeeReais, currency),
        isMinimumApplied: prepared.transport.transportIsMinimumApplied,
      },
      serviceGrossAmountCents: snap.serviceGrossAmountCents,
      platformFeeBpsSnapshot: snap.platformFeeBpsSnapshot,
      platformFeeAmountCents: snap.platformFeeAmountCents,
      creatorNetServiceAmountCents: snap.creatorNetServiceAmountCents,
      transportFeeAmountCents: snap.transportFeeAmountCents,
      creatorPayoutAmountCents: snap.creatorPayoutAmountCents,
      companyTotalAmountCents: snap.companyTotalAmountCents,
      transportPricePerKmUsed: prepared.transport.transportPricePerKmUsed,
      transportMinimumFeeUsed: prepared.transport.transportMinimumFeeUsed,
      transportIsMinimumApplied: prepared.transport.transportIsMinimumApplied,
    };
  }

  async create(
    user: AuthUser,
    dto: CreateContractRequestDto,
    legalAcceptanceContext: LegalAcceptanceContext = {},
  ) {
    return this.dataSource.transaction(async (manager) => {
      const prepared = await this.prepareContractRequest(user, dto, manager);
      const hiringAcceptance = await this.legalService.resolveCurrentAcceptance(
        prepared.companyUser.id,
        LegalTermType.COMPANY_HIRING,
        dto.legalAcceptance,
        legalAcceptanceContext,
      );

      // Novo fluxo: empresa paga antes de enviar ao creator → sempre PENDING_PAYMENT.
      // A notificação ao creator só acontece após confirmação do pagamento (webhook).
      const inviteExpiryHours = this.configService.get<number>('INVITE_EXPIRY_HOURS') ?? 24;
      const expiresAt = new Date(Date.now() + inviteExpiryHours * 60 * 60 * 1000);

      const created = await this.contractRequestsRepository.createAndSave(
        {
          companyUserId: prepared.companyUser.id,
          creatorUserId: prepared.creatorUser.id,
          jobTypeId: dto.jobTypeId,
          mode: JobMode.PRESENTIAL,
          description: prepared.description,
          status: ContractRequestStatus.PENDING_PAYMENT,
          paymentStatus: PaymentStatus.PENDING,
          currency: 'BRL',
          termsAcceptedAt: hiringAcceptance.acceptedAt,
          hiringTermsVersion: hiringAcceptance.termVersion,
          hiringTermsAcceptedAt: hiringAcceptance.acceptedAt,
          hiringTermsAcceptanceId: hiringAcceptance.id,
          startsAt: prepared.startsAt,
          durationMinutes: prepared.durationMinutes,
          jobAddress: prepared.jobAddress,
          jobFormattedAddress: prepared.jobFormattedAddress,
          jobLatitude: prepared.jobLatitude,
          jobLongitude: prepared.jobLongitude,
          distanceKm: prepared.distanceKm,
          effectiveServiceRadiusKmUsed: prepared.effectiveServiceRadiusKm,
          ...prepared.financialSnapshot,
          transportPricePerKmUsed: prepared.transport.transportPricePerKmUsed,
          transportMinimumFeeUsed: prepared.transport.transportMinimumFeeUsed,
          creatorNameSnapshot: prepared.creatorUser.profile?.name ?? 'Creator',
          creatorAvatarUrlSnapshot: prepared.creatorUser.profile?.photoUrl ?? null,
          openOfferId: null,
          rejectionReason: null,
          expiresAt,
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
      statuses: this.mapCompanyFilterToLegacyStatuses(query.status),
    });

    return items.map((item) => this.buildCompanyCampaignPayload(item));
  }

  async listMyCreator(user: AuthUser, status: ContractRequestStatus) {
    const creatorUser = await this.requireAuthenticatedUser(user.authUserId);
    this.ensureRole(
      creatorUser,
      UserRole.CREATOR,
      'Apenas creators podem listar contratações',
    );

    const items = await this.contractRequestsRepository.listByCreatorStatus(
      creatorUser.id,
      status,
    );
    return items.map((item) => this.buildCreatorOfferPayload(item));
  }

  async listMyCreatorPending(user: AuthUser) {
    const creatorUser = await this.requireAuthenticatedUser(user.authUserId);
    this.ensureRole(
      creatorUser,
      UserRole.CREATOR,
      'Apenas creators podem listar contratações pendentes',
    );

    const items = await this.contractRequestsRepository.listPendingByCreator(creatorUser.id);
    const payloads = items.map((item) => this.buildCreatorOfferPayload(item));
    // Ofertas expiradas não aparecem na lista (evita inbox "morta").
    // Histórico de expiradas pode virar seção futura.
    return payloads.filter((p) => p.status !== 'EXPIRED');
  }

  /**
   * Retorna o detalhe de uma contratação para um dos participantes (creator ou empresa).
   * Retorna 403 se o usuário não for participante.
   */
  async findOneForParticipant(user: AuthUser, contractRequestId: string) {
    const actor = await this.requireAuthenticatedUser(user.authUserId);
    const contractRequest =
      await this.contractRequestsRepository.findByIdWithParticipantRelations(contractRequestId);

    if (!contractRequest) {
      throw new NotFoundException('Contratação não encontrada');
    }

    if (actor.id !== contractRequest.creatorUserId && actor.id !== contractRequest.companyUserId) {
      throw new ForbiddenException('Você não tem acesso a esta contratação');
    }

    if (actor.role === UserRole.CREATOR) {
      return this.buildCreatorOfferPayload(contractRequest);
    }
    if (actor.role === UserRole.COMPANY) {
      return this.buildCompanyCampaignPayload(contractRequest);
    }

    throw new ForbiddenException('Você não tem acesso a esta contratação');
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

      // Marcar settlement como APPLIED no Payment associado
      const payment = await manager.findOne(Payment, {
        where: { contractRequestId: contractRequest.id },
      });
      if (payment && payment.settlementStatus === SettlementStatus.HELD) {
        payment.settlementStatus = SettlementStatus.APPLIED;
        await manager.save(Payment, payment);
      }

      await this.conversationsService.ensureConversationForContractRequest(
        updated.id,
        actor.id,
        manager,
      );

      this.eventEmitter.emit(CONTRACT_REQUEST_ACCEPTED_EVENT, {
        contractRequestId: updated.id,
        companyUserId: updated.companyUserId,
        creatorId: updated.creatorUserId,
        creatorName:
          actor.profile?.name?.trim() ||
          updated.creatorNameSnapshot?.trim() ||
          'Creator',
        offerTitle: updated.description?.trim() || 'sua campanha',
        openOfferId: updated.openOfferId,
        occurredAt: new Date(),
      } satisfies ContractRequestAcceptedEvent);

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

      // Converter pagamento em crédito (idempotente via UPDATE condicional)
      const payment = await manager.findOne(Payment, {
        where: { contractRequestId: contractRequest.id },
      });
      if (payment) {
        await this.companyBalanceService.creditFromPayment(
          payment.id,
          BalanceTransactionType.CREDIT_FROM_REJECTION,
          manager,
        );
      }

      return this.buildPayload(updated);
    });
  }

  async cancel(user: AuthUser, contractRequestId: string) {
    return this.dataSource.transaction(async (manager) => {
      const actor = await this.findActorForUpdate(user.authUserId, manager);
      const contractRequest = await this.getContractRequestForUpdate(contractRequestId, manager);

      this.ensureCreatorOwnsContractRequest(actor, contractRequest);

      if (contractRequest.status !== ContractRequestStatus.ACCEPTED) {
        throw new BadRequestException(
          `Não é possível desmarcar uma contratação com status ${contractRequest.status}`,
        );
      }

      contractRequest.status = ContractRequestStatus.CANCELLED;

      const updated = await this.contractRequestsRepository.save(contractRequest, manager);
      return this.buildPayload(updated);
    });
  }

  async complete(user: AuthUser, contractRequestId: string) {
    const { payload, event } = await this.dataSource.transaction(async (manager) => {
      const actor = await this.findActorForUpdate(user.authUserId, manager);
      const contractRequest = await this.getContractRequestForUpdate(contractRequestId, manager);

      this.ensureCompanyOwnsContractRequest(actor, contractRequest);

      if (contractRequest.status === ContractRequestStatus.COMPLETED) {
        throw new ConflictException(
          'Esta contratação já foi concluída',
        );
      }

      if (contractRequest.status !== ContractRequestStatus.ACCEPTED) {
        throw new ConflictException(
          `Não é possível concluir uma contratação com status ${contractRequest.status}`,
        );
      }

      const endsAt = this.calculateEndDate(
        contractRequest.startsAt,
        contractRequest.durationMinutes,
      );
      if (endsAt > new Date()) {
        throw new BadRequestException(
          'Não é possível concluir uma contratação cujo horário de término ainda não passou',
        );
      }

      const completedAt = new Date();
      contractRequest.status = ContractRequestStatus.COMPLETED;
      contractRequest.completedAt = completedAt;

      const updated = await this.contractRequestsRepository.save(contractRequest, manager);

      return {
        payload: this.buildPayload(updated),
        event: {
          contractRequestId: updated.id,
          creatorUserId: updated.creatorUserId,
          companyUserId: updated.companyUserId,
          serviceGrossAmountCents: updated.serviceGrossAmountCents,
          companyTotalAmountCents: updated.companyTotalAmountCents,
          currency: updated.currency,
          completedAt,
        } satisfies ContractRequestCompletedEvent,
      };
    });

    this.eventEmitter.emit(CONTRACT_REQUEST_COMPLETED_EVENT, event);

    return payload;
  }

  /**
   * Confirmação bilateral de conclusão do serviço.
   * Creator e empresa confirmam de forma independente; quando ambos confirmam, o contrato
   * move para COMPLETED e o evento de conclusão é emitido.
   * Idempotente: segunda chamada do mesmo lado é no-op.
   * Não libera efeitos financeiros diretamente — apenas COMPLETED os libera via evento.
   */
  async confirmCompletion(user: AuthUser, contractRequestId: string) {
    const { payload, event } = await this.dataSource.transaction(async (manager) => {
      const actor = await this.findActorForUpdate(user.authUserId, manager);
      const contractRequest = await this.getContractRequestForUpdate(contractRequestId, manager);

      if (actor.id !== contractRequest.creatorUserId && actor.id !== contractRequest.companyUserId) {
        throw new ForbiddenException(
          'Você não pode confirmar conclusão de uma contratação da qual não faz parte',
        );
      }

      if (contractRequest.status !== ContractRequestStatus.AWAITING_COMPLETION_CONFIRMATION) {
        throw new ConflictException(
          `Não é possível confirmar conclusão de uma contratação com status ${contractRequest.status}`,
        );
      }

      const isCreator = actor.id === contractRequest.creatorUserId;
      const alreadyConfirmed = isCreator
        ? contractRequest.creatorConfirmedCompletedAt !== null
        : contractRequest.companyConfirmedCompletedAt !== null;

      if (alreadyConfirmed) {
        return { payload: this.buildPayload(contractRequest), event: null };
      }

      const now = new Date();

      if (isCreator) {
        contractRequest.creatorConfirmedCompletedAt = now;
      } else {
        contractRequest.companyConfirmedCompletedAt = now;
      }

      let completedEvent: ContractRequestCompletedEvent | null = null;

      if (
        contractRequest.creatorConfirmedCompletedAt !== null &&
        contractRequest.companyConfirmedCompletedAt !== null
      ) {
        contractRequest.status = ContractRequestStatus.COMPLETED;
        contractRequest.completedAt = now;
        completedEvent = {
          contractRequestId: contractRequest.id,
          creatorUserId: contractRequest.creatorUserId,
          companyUserId: contractRequest.companyUserId,
          serviceGrossAmountCents: contractRequest.serviceGrossAmountCents,
          companyTotalAmountCents: contractRequest.companyTotalAmountCents,
          currency: contractRequest.currency,
          completedAt: now,
        };
      }

      const updated = await this.contractRequestsRepository.save(contractRequest, manager);
      return { payload: this.buildPayload(updated), event: completedEvent };
    });

    if (event) {
      this.eventEmitter.emit(CONTRACT_REQUEST_COMPLETED_EVENT, event);
    }

    return payload;
  }

  /**
   * Abre disputa de conclusão do serviço.
   * Registra quem abriu, quando e o motivo. Move para COMPLETION_DISPUTE,
   * bloqueando avaliações até resolução por admin.
   */
  async disputeCompletion(
    user: AuthUser,
    contractRequestId: string,
    dto: DisputeCompletionDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const actor = await this.findActorForUpdate(user.authUserId, manager);
      const contractRequest = await this.getContractRequestForUpdate(contractRequestId, manager);

      if (actor.id !== contractRequest.creatorUserId && actor.id !== contractRequest.companyUserId) {
        throw new ForbiddenException(
          'Você não pode disputar conclusão de uma contratação da qual não faz parte',
        );
      }

      if (contractRequest.status !== ContractRequestStatus.AWAITING_COMPLETION_CONFIRMATION) {
        throw new ConflictException(
          `Não é possível abrir disputa em uma contratação com status ${contractRequest.status}`,
        );
      }

      const now = new Date();
      contractRequest.status = ContractRequestStatus.COMPLETION_DISPUTE;
      contractRequest.completionDisputeReason = dto.reason;
      contractRequest.completionDisputedAt = now;
      contractRequest.completionDisputedByUserId = actor.id;

      const updated = await this.contractRequestsRepository.save(contractRequest, manager);
      return this.buildPayload(updated);
    });
  }

  /**
   * Persiste um ContractRequest sempre em ACCEPTED e cria a conversa associada.
   * Deve ser chamado dentro de uma transaction existente.
   * Toda a validação (geocoding, schedule, pricing) é responsabilidade do chamador.
   */
  async createFromOpenOfferSelection(
    params: CreateFromOpenOfferParams,
    manager: EntityManager,
  ): Promise<ContractRequest> {
    const { creatorUser, financialSnapshot, transport, openOfferId, ...rest } = params;

    const created = await this.contractRequestsRepository.createAndSave(
      {
        ...rest,
        creatorUserId: creatorUser.id,
        mode: JobMode.PRESENTIAL,
        status: ContractRequestStatus.ACCEPTED,
        paymentStatus: PaymentStatus.PENDING,
        currency: 'BRL',
        termsAcceptedAt: params.hiringAcceptance.acceptedAt,
        hiringTermsVersion: params.hiringAcceptance.termVersion,
        hiringTermsAcceptedAt: params.hiringAcceptance.acceptedAt,
        hiringTermsAcceptanceId: params.hiringAcceptance.id,
        effectiveServiceRadiusKmUsed: params.effectiveServiceRadiusKm,
        ...financialSnapshot,
        transportPricePerKmUsed: transport.transportPricePerKmUsed,
        transportMinimumFeeUsed: transport.transportMinimumFeeUsed,
        creatorNameSnapshot: creatorUser.profile?.name ?? 'Creator',
        creatorAvatarUrlSnapshot: creatorUser.profile?.photoUrl ?? null,
        openOfferId,
        rejectionReason: null,
      },
      manager,
    );

    await this.conversationsService.ensureConversationForContractRequest(
      created.id,
      params.companyUserId,
      manager,
    );

    return created;
  }

  private async prepareContractRequest(
    user: AuthUser,
    dto: PreviewContractRequestDto | CreateContractRequestDto,
    manager?: EntityManager,
  ): Promise<PreparedContractRequest> {
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
    const geocoded = await this.resolveJobAddressGeocoding(companyUser.id, dto);
    if (!geocoded) {
      this.logger.warn(`Geocoding failed for job address: ${dto.jobAddress}`);
      throw new BadRequestException({
        code: 'INVALID_JOB_LOCATION',
        message: 'Nao foi possivel validar o local do trabalho. Revise o endereco.',
      });
    }

    let creatorProfile = creatorUser.creatorProfile;
    if (!creatorProfile) {
      throw new BadRequestException(
        'Este creator ainda não possui perfil configurado para contratação presencial',
      );
    }

    const creatorProfileData = creatorUser.profile;
    if (
      !creatorProfileData?.hasValidCoordinates ||
      creatorProfileData.latitude == null ||
      creatorProfileData.longitude == null
    ) {
      throw new BadRequestException({
        code: 'INVALID_CREATOR_LOCATION',
        message:
          'Este creator precisa atualizar o endereco para habilitar contratacoes presenciais.',
      });
    }

    const serviceRadiusKm =
      creatorProfile.serviceRadiusKm ??
      (this.configService.get<number>('DEFAULT_CREATOR_SERVICE_RADIUS_KM') ?? 30);

    if (serviceRadiusKm <= 0) {
      throw new BadRequestException(
        'Este creator ainda não possui raio de atendimento válido para contratação presencial',
      );
    }

    const distanceKm = this.distanceService.calculateDistanceKm(
      {
        lat: creatorProfileData.latitude,
        lng: creatorProfileData.longitude,
      },
      {
        lat: geocoded.lat,
        lng: geocoded.lng,
      },
    );

    if (distanceKm > serviceRadiusKm) {
      this.logger.warn(
        `Location out of service radius for creator ${creatorUser.id}. distanceKm=${distanceKm}, serviceRadiusKm=${serviceRadiusKm}`,
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

    const settings = await this.platformSettingsService.getCurrent();
    const transportPricePerKm =
      settings?.transportPricePerKm ??
      (this.configService.get<number>('TRANSPORT_PRICE_PER_KM') ?? 2);
    const transportMinimumFee =
      settings?.transportMinimumFee ??
      (this.configService.get<number>('MIN_TRANSPORT_PRICE') ?? 20);
    const platformFeeBps =
      settings?.platformFeeBps ?? 2500;

    const serviceGrossAmountCents =
      creatorJobType.basePriceCents != null
        ? creatorJobType.basePriceCents
        : Math.round(jobType.price * 100);

    const transport = this.pricingService.buildTransport({
      distanceKm,
      transportPricePerKm,
      transportMinimumFee,
    });

    const financialSnapshot = this.financialSnapshotService.buildContractSnapshot(
      serviceGrossAmountCents,
      platformFeeBps,
      transport.transportFeeAmountCents,
    );

    return {
      companyUser,
      creatorUser,
      startsAt,
      endsAt,
      jobAddress: dto.jobAddress.trim(),
      jobFormattedAddress: geocoded.normalizedAddress ?? dto.jobAddress.trim(),
      jobLatitude: geocoded.lat,
      jobLongitude: geocoded.lng,
      distanceKm,
      effectiveServiceRadiusKm: serviceRadiusKm,
      durationMinutes: jobType.durationMinutes,
      description: dto.description.trim(),
      financialSnapshot,
      transport,
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

  private ensureCompanyOwnsContractRequest(actor: User, contractRequest: ContractRequest): void {
    this.ensureRole(actor, UserRole.COMPANY, 'Apenas empresas podem concluir contratações');

    if (actor.id !== contractRequest.companyUserId) {
      throw new ForbiddenException('Você não pode concluir contratação de outra empresa');
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
      hiringTermsVersion: contractRequest.hiringTermsVersion ?? null,
      hiringTermsAcceptedAt: contractRequest.hiringTermsAcceptedAt?.toISOString() ?? null,
      hiringTermsAcceptanceId: contractRequest.hiringTermsAcceptanceId ?? null,
      startsAt: contractRequest.startsAt.toISOString(),
      durationMinutes: contractRequest.durationMinutes,
      jobAddress: contractRequest.jobAddress,
      jobFormattedAddress: contractRequest.jobFormattedAddress,
      jobLatitude: contractRequest.jobLatitude,
      jobLongitude: contractRequest.jobLongitude,
      creatorDistance: this.distanceService.buildSummary(
        contractRequest.distanceKm,
        contractRequest.effectiveServiceRadiusKmUsed,
      ),
      transport: {
        price: contractRequest.transportFeeAmountCents / 100,
        formatted: this.formatCurrency(contractRequest.transportFeeAmountCents / 100, contractRequest.currency),
        isMinimumApplied:
          contractRequest.transportFeeAmountCents === Math.round((contractRequest.transportMinimumFeeUsed ?? 0) * 100),
      },
      serviceGrossAmountCents: contractRequest.serviceGrossAmountCents,
      platformFeeBpsSnapshot: contractRequest.platformFeeBpsSnapshot,
      platformFeeAmountCents: contractRequest.platformFeeAmountCents,
      creatorNetServiceAmountCents: contractRequest.creatorNetServiceAmountCents,
      transportFeeAmountCents: contractRequest.transportFeeAmountCents,
      creatorPayoutAmountCents: contractRequest.creatorPayoutAmountCents,
      companyTotalAmountCents: contractRequest.companyTotalAmountCents,
      transportPricePerKmUsed: contractRequest.transportPricePerKmUsed,
      transportMinimumFeeUsed: contractRequest.transportMinimumFeeUsed,
      creatorNameSnapshot: contractRequest.creatorNameSnapshot,
      creatorAvatarUrlSnapshot: contractRequest.creatorAvatarUrlSnapshot,
      rejectionReason: contractRequest.rejectionReason,
      openOfferId: contractRequest.openOfferId,
      completedAt: contractRequest.completedAt?.toISOString() ?? null,
      creatorConfirmedCompletedAt: contractRequest.creatorConfirmedCompletedAt?.toISOString() ?? null,
      companyConfirmedCompletedAt: contractRequest.companyConfirmedCompletedAt?.toISOString() ?? null,
      contestDeadlineAt: contractRequest.contestDeadlineAt?.toISOString() ?? null,
      completionDisputeReason: contractRequest.completionDisputeReason ?? null,
      completionDisputedAt: contractRequest.completionDisputedAt?.toISOString() ?? null,
      completionDisputedByUserId: contractRequest.completionDisputedByUserId ?? null,
      completionPhaseEnteredAt: contractRequest.completionPhaseEnteredAt?.toISOString() ?? null,
      createdAt: contractRequest.createdAt?.toISOString(),
      updatedAt: contractRequest.updatedAt?.toISOString(),
    };
  }

  private buildCompanyCampaignPayload(contractRequest: ContractRequest) {
    const base = this.buildPayload(contractRequest);
    const status = this.mapCompanyStatus(contractRequest);
    const startsAt = contractRequest.startsAt;
    const acceptedAt = this.resolveAcceptedAt(contractRequest, status);
    const { city, state } = this.extractCityState(contractRequest.jobFormattedAddress, contractRequest.jobAddress);
    const creatorRatingRaw = contractRequest.creatorUser?.profile?.averageRating;
    const creatorRating =
      creatorRatingRaw != null && creatorRatingRaw > 0 ? creatorRatingRaw : null;
    const jobTitle = contractRequest.jobType?.name?.trim() || 'Campanha';

    return {
      ...base,
      status,
      legacyStatus: contractRequest.status,
      creator: {
        name: contractRequest.creatorNameSnapshot,
        avatarUrl: contractRequest.creatorAvatarUrlSnapshot,
        rating: creatorRating,
      },
      job: {
        title: jobTitle,
        description: contractRequest.description,
        durationMinutes: contractRequest.durationMinutes,
      },
      schedule: {
        date: startsAt.toISOString(),
        startTime: startsAt.toISOString(),
      },
      location: {
        city,
        state,
      },
      pricing: {
        totalAmount: contractRequest.companyTotalAmountCents,
        baseAmount: contractRequest.serviceGrossAmountCents,
        transportAmount: contractRequest.transportFeeAmountCents,
      },
      metadata: {
        createdAt: contractRequest.createdAt?.toISOString() ?? null,
        acceptedAt,
      },
      actions: this.buildCampaignActions(status),
      jobTypeName: jobTitle,
      totalAmount: contractRequest.companyTotalAmountCents,
    };
  }

  private buildCreatorOfferPayload(contractRequest: ContractRequest) {
    const base = this.buildPayload(contractRequest);
    // Usar expiresAt do banco se disponível, senão derivar por compatibilidade
    const expiresAt =
      contractRequest.expiresAt ??
      new Date((contractRequest.createdAt ?? new Date()).getTime() + 48 * 60 * 60 * 1000);
    const now = new Date();
    const isExpired =
      contractRequest.status === ContractRequestStatus.PENDING_ACCEPTANCE &&
      now >= expiresAt;
    const expiresSoon =
      contractRequest.status === ContractRequestStatus.PENDING_ACCEPTANCE &&
      !isExpired &&
      now >= new Date(expiresAt.getTime() - 24 * 60 * 60 * 1000);

    const companyUser = contractRequest.companyUser;
    const companyName =
      companyUser?.companyProfile?.companyName ??
      companyUser?.profile?.name ??
      'Empresa';
    const companyLogoUrl = companyUser?.profile?.photoUrl ?? null;
    const rawRating = companyUser?.profile?.averageRating;
    const companyRating =
      rawRating != null && rawRating > 0 ? rawRating : null;

    const statusMap: Record<ContractRequestStatus, string> = {
      [ContractRequestStatus.PENDING_PAYMENT]: 'PENDING_PAYMENT',
      [ContractRequestStatus.PENDING_ACCEPTANCE]: isExpired ? 'EXPIRED' : 'PENDING',
      [ContractRequestStatus.ACCEPTED]: 'ACCEPTED',
      [ContractRequestStatus.REJECTED]: 'REJECTED',
      [ContractRequestStatus.CANCELLED]: 'CANCELLED',
      [ContractRequestStatus.COMPLETED]: 'COMPLETED',
      [ContractRequestStatus.EXPIRED]: 'EXPIRED',
      [ContractRequestStatus.AWAITING_COMPLETION_CONFIRMATION]: 'AWAITING_COMPLETION_CONFIRMATION',
      [ContractRequestStatus.COMPLETION_DISPUTE]: 'COMPLETION_DISPUTE',
    };

    const rawReviewCount = companyUser?.profile?.reviewCount;
    const companyReviewCount = rawReviewCount != null ? rawReviewCount : null;

    // Creator não deve ver taxa da plataforma nem valor bruto do serviço.
    const { platformFeeAmountCents: _fee, platformFeeBpsSnapshot: _bps, serviceGrossAmountCents: _gross, ...creatorBase } = base;

    return {
      ...creatorBase,
      status: statusMap[contractRequest.status],
      companyName,
      companyLogoUrl,
      companyRating,
      companyReviewCount,
      jobTypeName: contractRequest.jobType?.name ?? null,
      expiresSoon,
      expiresAt: expiresAt.toISOString(),
      totalAmount: contractRequest.creatorPayoutAmountCents,
    };
  }

  private mapCompanyFilterToLegacyStatuses(
    status?: CompanyCampaignFilterStatus,
  ): ContractRequestStatus[] | undefined {
    if (!status) {
      return undefined;
    }

    switch (status) {
      case 'PENDING':
      case ContractRequestStatus.PENDING_PAYMENT:
      case ContractRequestStatus.PENDING_ACCEPTANCE:
        return [ContractRequestStatus.PENDING_PAYMENT, ContractRequestStatus.PENDING_ACCEPTANCE];
      case 'ACCEPTED':
      case ContractRequestStatus.ACCEPTED:
        return [ContractRequestStatus.ACCEPTED];
      case 'IN_PROGRESS':
        return [ContractRequestStatus.ACCEPTED];
      case 'COMPLETED':
      case ContractRequestStatus.COMPLETED:
        return [ContractRequestStatus.COMPLETED];
      case 'CANCELLED':
      case ContractRequestStatus.CANCELLED:
      case ContractRequestStatus.REJECTED:
      case ContractRequestStatus.EXPIRED:
        return [
          ContractRequestStatus.CANCELLED,
          ContractRequestStatus.REJECTED,
          ContractRequestStatus.EXPIRED,
        ];
      default:
        return undefined;
    }
  }

  private mapCompanyStatus(contractRequest: ContractRequest): CompanyCampaignStatus {
    const endsAt = this.calculateEndDate(contractRequest.startsAt, contractRequest.durationMinutes);
    const now = new Date();

    if (
      contractRequest.status === ContractRequestStatus.CANCELLED ||
      contractRequest.status === ContractRequestStatus.REJECTED ||
      contractRequest.status === ContractRequestStatus.EXPIRED
    ) {
      return 'CANCELLED';
    }

    if (contractRequest.status === ContractRequestStatus.COMPLETED) {
      return 'COMPLETED';
    }

    if (
      contractRequest.status === ContractRequestStatus.PENDING_ACCEPTANCE ||
      contractRequest.status === ContractRequestStatus.PENDING_PAYMENT
    ) {
      return 'PENDING';
    }

    if (contractRequest.status === ContractRequestStatus.ACCEPTED) {
      if (now >= endsAt) {
        return 'COMPLETED';
      }

      if (now >= contractRequest.startsAt) {
        return 'IN_PROGRESS';
      }

      return 'ACCEPTED';
    }

    if (
      contractRequest.status === ContractRequestStatus.AWAITING_COMPLETION_CONFIRMATION ||
      contractRequest.status === ContractRequestStatus.COMPLETION_DISPUTE
    ) {
      return 'IN_PROGRESS';
    }

    return 'PENDING';
  }

  private buildCampaignActions(status: CompanyCampaignStatus) {
    return {
      canCancel: status === 'PENDING',
      canChat: status === 'ACCEPTED',
      canViewDetails:
        status === 'ACCEPTED' || status === 'IN_PROGRESS' || status === 'COMPLETED',
    };
  }

  private resolveAcceptedAt(
    contractRequest: ContractRequest,
    status: CompanyCampaignStatus,
  ): string | null {
    if (status === 'PENDING' || status === 'CANCELLED') {
      return null;
    }

    return contractRequest.updatedAt?.toISOString() ?? null;
  }

  private extractCityState(
    formattedAddress: string | null,
    fallbackAddress: string,
  ): { city: string | null; state: string | null } {
    const source = (formattedAddress || fallbackAddress || '').trim();
    if (!source) {
      return { city: null, state: null };
    }

    const parts = source
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    if (!parts.length) {
      return { city: null, state: null };
    }

    let state: string | null = null;
    let city: string | null = null;

    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const token = parts[i];
      const upperToken = token.toUpperCase();
      if (/^[A-Z]{2}$/.test(upperToken)) {
        state = upperToken;
        city = i > 0 ? parts[i - 1] : null;
        break;
      }
    }

    if (!city) {
      city = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    }

    if (!state) {
      const lastToken = parts[parts.length - 1];
      const stateMatch = lastToken.match(/\b([A-Z]{2})\b/);
      state = stateMatch ? stateMatch[1] : null;
    }

    return { city: city || null, state };
  }

  private calculateEndDate(startsAt: Date, durationMinutes: number): Date {
    return new Date(startsAt.getTime() + durationMinutes * 60 * 1000);
  }

  private userRepository(manager?: EntityManager): Repository<User> {
    return manager ? manager.getRepository(User) : this.dataSource.getRepository(User);
  }

  private async resolveJobAddressGeocoding(
    companyUserId: string,
    dto: PreviewContractRequestDto | CreateContractRequestDto,
  ) {
    const cacheKey = this.buildGeocodeCacheKey(companyUserId, dto);
    const now = Date.now();
    const cached = this.geocodingPreviewCache.get(cacheKey);

    if (cached && now - cached.createdAt <= this.geocodingPreviewCacheTtlMs) {
      return {
        lat: cached.lat,
        lng: cached.lng,
        normalizedAddress: cached.normalizedAddress,
      };
    }

    const geocoded = await this.geocodeWithTimeout(dto.jobAddress);
    if (!geocoded) {
      return null;
    }

    this.geocodingPreviewCache.set(cacheKey, {
      lat: geocoded.lat,
      lng: geocoded.lng,
      normalizedAddress: geocoded.normalizedAddress ?? null,
      createdAt: now,
    });

    return geocoded;
  }

  private async geocodeWithTimeout(address: string) {
    const timeoutMs = this.configService.get<number>('GEOCODING_TIMEOUT_MS') ?? 3000;
    return Promise.race([
      this.geocodingService.geocodeAddress(address),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  }

  private buildGeocodeCacheKey(
    companyUserId: string,
    dto: PreviewContractRequestDto | CreateContractRequestDto,
  ): string {
    return [
      companyUserId,
      dto.creatorId,
      dto.jobTypeId,
      dto.startsAt,
      dto.durationMinutes,
      dto.jobAddress.trim().toLowerCase(),
    ].join('|');
  }

  private formatCurrency(value: number, currency = 'BRL'): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
}
