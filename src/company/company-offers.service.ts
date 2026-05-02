import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { UserRole } from '../common/enums/user-role.enum';
import { ContractRequestStatus } from '../common/enums/contract-request-status.enum';
import { OpenOfferStatus } from '../common/enums/open-offer-status.enum';
import { UsersRepository } from '../users/users.repository';
import { OpenOffersRepository } from '../open-offers/open-offers.repository';
import { ContractRequestsRepository } from '../contract-requests/contract-requests.repository';
import { OpenOffer } from '../open-offers/entities/open-offer.entity';
import { ContractRequest } from '../contract-requests/entities/contract-request.entity';
import { Payment } from '../payments/entities/payment.entity';
import { User } from '../users/entities/user.entity';

// ─── Hub types ────────────────────────────────────────────────────────────────

export type HubDisplayStatus =
  | 'OPEN'
  | 'PENDING'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';

export type HubItemKind = 'open_offer' | 'direct_invite' | 'contract';

/** Estado semântico do item do hub pela perspectiva da empresa. */
export type CompanyPerspectiveStatus =
  | 'UPCOMING_WORK'
  | 'COMPANY_CONFIRMATION_REQUIRED'
  | 'AWAITING_CREATOR_CONFIRMATION'
  | 'AWAITING_AUTO_COMPLETION'
  | 'COMPLETION_DISPUTE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'PENDING_PAYMENT'
  | 'REVIEW_REQUIRED'
  | 'OPEN';

export type CompanyHubAction =
  | 'review_applications'
  | 'confirm_completion'
  | 'dispute_completion'
  | 'view_details';

export type CompletionConfirmation = {
  companyConfirmedAt: string | null;
  creatorConfirmedAt: string | null;
  contestDeadlineAt: string | null;
};

export type ContractPerspectiveInput = {
  status: ContractRequestStatus;
  startsAt: Date | null;
  durationMinutes: number | null;
  companyConfirmedCompletedAt: Date | null;
  creatorConfirmedCompletedAt: Date | null;
  contestDeadlineAt: Date | null;
  effectiveExpiresAt: Date | null;
};

/**
 * View model do hub da empresa — não é DTO de domínio genérico.
 * Campos como title, address e os fallbacks ("Campanha", "Local a combinar")
 * são decisões de UI aplicadas no backend para simplificar a renderização.
 * creatorId/Name/AvatarUrl são null para kind='open_offer' (sem creator único).
 * paymentId/paymentStatus/pixExpiresAt são populados apenas para itens em awaitingPayment.
 */
export type CompanyHubItem = {
  id: string;
  kind: HubItemKind;
  title: string;
  description: string | null;
  address: string;
  amount: number | null;
  startsAt: string | null;
  durationMinutes: number | null;
  legacyStatus: string;
  displayStatus: HubDisplayStatus;
  expiresAt: string | null;
  effectiveExpiresAt: string | null;
  /** Data de conclusão do contrato (quando status transitou para COMPLETED). Null para não-COMPLETED. */
  completedAt: string | null;
  /** Estado semântico calculado pelo backend; use este campo para decisões de UI. */
  companyPerspectiveStatus: CompanyPerspectiveStatus;
  /** True quando companyPerspectiveStatus === 'COMPANY_CONFIRMATION_REQUIRED'. */
  companyActionRequired: boolean;
  primaryAction: CompanyHubAction;
  availableActions: CompanyHubAction[];
  /** Campos de confirmação bilateral. Presente em AWAITING/DISPUTE/COMPLETED; null nos demais. */
  completionConfirmation: CompletionConfirmation | null;
  applicationsToReviewCount: number;
  /** true = avaliação pendente, false = já avaliada, null = não aplicável (não é COMPLETED). */
  myReviewPending: boolean | null;
  creatorId: string | null;
  creatorName: string | null;
  creatorAvatarUrl: string | null;
  offerId: string | null;
  contractRequestId: string | null;
  createdAt: string;
  updatedAt: string | null;
  /** Presente apenas para itens de awaitingPayment. Null se Payment ainda não foi criado. */
  paymentId: string | null;
  /** Status do Payment no domínio de pagamentos (ex: 'pending', 'failed'). Null se sem Payment. */
  paymentStatus: string | null;
  /** Expiração do PIX, se o método escolhido foi PIX. Null nos demais casos. */
  pixExpiresAt: string | null;
};

// ─── Pure helpers (exportados para testes) ────────────────────────────────────

export function buildCompanyPerspectiveStatus(
  input: ContractPerspectiveInput,
  now: Date = new Date(),
): CompanyPerspectiveStatus {
  const {
    status,
    startsAt,
    durationMinutes,
    companyConfirmedCompletedAt,
    creatorConfirmedCompletedAt,
    contestDeadlineAt,
    effectiveExpiresAt,
  } = input;

  if (status === ContractRequestStatus.COMPLETED) return 'COMPLETED';
  if (
    status === ContractRequestStatus.CANCELLED ||
    status === ContractRequestStatus.REJECTED
  ) return 'CANCELLED';
  if (status === ContractRequestStatus.EXPIRED) return 'EXPIRED';

  if (status === ContractRequestStatus.PENDING_PAYMENT) {
    if (effectiveExpiresAt !== null && effectiveExpiresAt <= now) return 'EXPIRED';
    return 'PENDING_PAYMENT';
  }

  if (status === ContractRequestStatus.PENDING_ACCEPTANCE) return 'UPCOMING_WORK';
  if (status === ContractRequestStatus.COMPLETION_DISPUTE) return 'COMPLETION_DISPUTE';

  if (status === ContractRequestStatus.AWAITING_COMPLETION_CONFIRMATION) {
    const deadlineActive = contestDeadlineAt !== null && contestDeadlineAt > now;
    if (!deadlineActive) return 'AWAITING_AUTO_COMPLETION';
    if (companyConfirmedCompletedAt === null) return 'COMPANY_CONFIRMATION_REQUIRED';
    if (creatorConfirmedCompletedAt === null) return 'AWAITING_CREATOR_CONFIRMATION';
    return 'AWAITING_AUTO_COMPLETION';
  }

  if (status === ContractRequestStatus.ACCEPTED) {
    if (startsAt !== null && durationMinutes !== null) {
      const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
      if (endsAt <= now) return 'AWAITING_AUTO_COMPLETION';
    }
    return 'UPCOMING_WORK';
  }

  return 'UPCOMING_WORK';
}

export function buildAvailableActions(
  perspectiveStatus: CompanyPerspectiveStatus,
): CompanyHubAction[] {
  if (perspectiveStatus === 'COMPANY_CONFIRMATION_REQUIRED') {
    return ['confirm_completion', 'dispute_completion', 'view_details'];
  }
  if (perspectiveStatus === 'REVIEW_REQUIRED') {
    return ['review_applications', 'view_details'];
  }
  return ['view_details'];
}

export function resolvePrimaryAction(
  perspectiveStatus: CompanyPerspectiveStatus,
): CompanyHubAction {
  if (perspectiveStatus === 'COMPANY_CONFIRMATION_REQUIRED') return 'confirm_completion';
  if (perspectiveStatus === 'REVIEW_REQUIRED') return 'review_applications';
  return 'view_details';
}

export function buildCompletionConfirmation(
  contract: Pick<
    ContractRequest,
    | 'status'
    | 'companyConfirmedCompletedAt'
    | 'creatorConfirmedCompletedAt'
    | 'contestDeadlineAt'
  >,
): CompletionConfirmation | null {
  if (
    contract.status !== ContractRequestStatus.AWAITING_COMPLETION_CONFIRMATION &&
    contract.status !== ContractRequestStatus.COMPLETION_DISPUTE &&
    contract.status !== ContractRequestStatus.COMPLETED
  ) {
    return null;
  }
  return {
    companyConfirmedAt: contract.companyConfirmedCompletedAt?.toISOString() ?? null,
    creatorConfirmedAt: contract.creatorConfirmedCompletedAt?.toISOString() ?? null,
    contestDeadlineAt: contract.contestDeadlineAt?.toISOString() ?? null,
  };
}

export type CompanyOffersHubResponse = {
  pending: {
    openOffers: CompanyHubItem[];
    directInvites: CompanyHubItem[];
    /** Contratos criados mas ainda não pagos pela empresa. */
    awaitingPayment: CompanyHubItem[];
  };
  inProgress: CompanyHubItem[];
  finalized: {
    completed: CompanyHubItem[];
    cancelled: CompanyHubItem[];
    expiredWithoutHire: CompanyHubItem[];
  };
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DIRECT_INVITE_WINDOW_MS = 48 * 60 * 60 * 1000;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class CompanyOffersService {
  private readonly logger = new Logger(CompanyOffersService.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly openOffersRepository: OpenOffersRepository,
    private readonly contractRequestsRepository: ContractRequestsRepository,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
  ) {}

  async getOffersHub(authUser: AuthUser): Promise<CompanyOffersHubResponse> {
    const company = await this.requireCompanyUser(authUser.authUserId);
    const now = new Date();

    const [allOffers, allContracts] = await Promise.all([
      this.openOffersRepository.listAllByCompany({ companyUserId: company.id }),
      this.contractRequestsRepository.listByCompany({
        companyUserId: company.id,
        currentUserId: company.id,
      }),
    ]);

    const openOfferIds = allOffers
      .filter((o) => o.status === OpenOfferStatus.OPEN)
      .map((o) => o.id);

    const pendingPaymentContractIds = allContracts
      .filter((c) => c.status === ContractRequestStatus.PENDING_PAYMENT)
      .map((c) => c.id);

    const [pendingCounts, payments] = await Promise.all([
      openOfferIds.length > 0
        ? this.openOffersRepository.countPendingApplicationsByOfferIds(openOfferIds)
        : Promise.resolve({} as Record<string, number>),
      pendingPaymentContractIds.length > 0
        ? this.paymentRepo.findBy({ contractRequestId: In(pendingPaymentContractIds) })
        : Promise.resolve([] as Payment[]),
    ]);

    const paymentByContractId = new Map(payments.map((p) => [p.contractRequestId, p]));

    return this.buildHubResponse(allOffers, allContracts, pendingCounts, now, paymentByContractId);
  }

  // ─── Private: auth ──────────────────────────────────────────────────────────

  private async requireCompanyUser(authUserId: string): Promise<User> {
    const user = await this.usersRepository.findByAuthUserIdWithProfiles(authUserId);
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (user.role !== UserRole.COMPANY) {
      throw new ForbiddenException('Apenas empresas podem executar esta ação');
    }
    return user;
  }

  // ─── Private: hub builder ───────────────────────────────────────────────────

  private buildHubResponse(
    offers: OpenOffer[],
    contracts: ContractRequest[],
    pendingCounts: Record<string, number>,
    now: Date,
    paymentByContractId: Map<string, Payment>,
  ): CompanyOffersHubResponse {
    const pending: CompanyOffersHubResponse['pending'] = {
      openOffers: [],
      directInvites: [],
      awaitingPayment: [],
    };
    const inProgress: CompanyHubItem[] = [];
    const finalized: CompanyOffersHubResponse['finalized'] = {
      completed: [],
      cancelled: [],
      expiredWithoutHire: [],
    };

    for (const offer of offers) {
      const count = pendingCounts[offer.id] ?? 0;
      const isExpiredByTime = offer.expiresAt != null && offer.expiresAt <= now;

      if (offer.status === OpenOfferStatus.OPEN && !isExpiredByTime) {
        pending.openOffers.push(this.mapOfferToHubItem(offer, count, 'pending'));
      } else if (offer.status === OpenOfferStatus.CANCELLED) {
        finalized.cancelled.push(this.mapOfferToHubItem(offer, count, 'cancelled'));
      } else if (
        offer.status === OpenOfferStatus.EXPIRED ||
        (offer.status === OpenOfferStatus.OPEN && isExpiredByTime)
      ) {
        finalized.expiredWithoutHire.push(this.mapOfferToHubItem(offer, count, 'expired'));
      }
      // FILLED → not shown; represented by its contract request
    }

    for (const contract of contracts) {
      const effectiveExpiresAt = this.resolveEffectiveExpiresAt(contract);

      // PENDING_PAYMENT: contratos criados mas ainda não pagos.
      // Tratados aqui, antes do switch, para separar de PENDING_ACCEPTANCE (directInvites).
      if (contract.status === ContractRequestStatus.PENDING_PAYMENT) {
        if (effectiveExpiresAt && effectiveExpiresAt <= now) {
          finalized.expiredWithoutHire.push(
            this.mapContractToHubItem(contract, 'EXPIRED', effectiveExpiresAt, now, null),
          );
        } else {
          const payment = paymentByContractId.get(contract.id) ?? null;
          pending.awaitingPayment.push(
            this.mapContractToHubItem(contract, 'PENDING', effectiveExpiresAt, now, payment),
          );
        }
        continue;
      }

      const displayStatus = this.buildHubDisplayStatus(contract, effectiveExpiresAt, now);

      switch (displayStatus) {
        case 'PENDING':
          if (!contract.openOfferId) {
            pending.directInvites.push(
              this.mapContractToHubItem(contract, displayStatus, effectiveExpiresAt, now, null),
            );
          }
          break;
        case 'ACCEPTED':
        case 'IN_PROGRESS':
          inProgress.push(this.mapContractToHubItem(contract, displayStatus, effectiveExpiresAt, now, null));
          break;
        case 'COMPLETED':
          finalized.completed.push(
            this.mapContractToHubItem(contract, displayStatus, effectiveExpiresAt, now, null),
          );
          break;
        case 'CANCELLED':
          finalized.cancelled.push(
            this.mapContractToHubItem(contract, displayStatus, effectiveExpiresAt, now, null),
          );
          break;
        case 'EXPIRED':
          finalized.expiredWithoutHire.push(
            this.mapContractToHubItem(contract, displayStatus, effectiveExpiresAt, now, null),
          );
          break;
      }
    }

    pending.openOffers.sort(this.sortByApplicationsThenExpiry);
    pending.directInvites.sort(this.sortByEffectiveExpiry);
    pending.awaitingPayment.sort(this.sortByUpdatedAtDesc);
    inProgress.sort(this.sortByStartsAtAsc);
    finalized.completed.sort(this.sortByUpdatedAtDesc);
    finalized.cancelled.sort(this.sortByUpdatedAtDesc);
    finalized.expiredWithoutHire.sort(this.sortByUpdatedAtDesc);

    return { pending, inProgress, finalized };
  }

  // ─── Private: status helpers ────────────────────────────────────────────────

  private resolveEffectiveExpiresAt(contract: ContractRequest): Date | null {
    if (contract.expiresAt) return contract.expiresAt;
    if (contract.status === ContractRequestStatus.PENDING_PAYMENT) {
      return new Date(contract.createdAt.getTime() + DIRECT_INVITE_WINDOW_MS);
    }
    return null;
  }

  /**
   * PENDING_PAYMENT expirado por tempo é classificado como EXPIRED aqui mesmo,
   * sem depender de cron (que só existe para PENDING_ACCEPTANCE).
   * O legacyStatus permanece PENDING_PAYMENT no banco até que o cron seja adicionado.
   */
  private buildHubDisplayStatus(
    contract: ContractRequest,
    effectiveExpiresAt: Date | null,
    now: Date,
  ): HubDisplayStatus {
    const { status, startsAt, durationMinutes } = contract;

    if (status === ContractRequestStatus.PENDING_PAYMENT) {
      if (effectiveExpiresAt && effectiveExpiresAt <= now) return 'EXPIRED';
      return 'PENDING';
    }

    if (status === ContractRequestStatus.PENDING_ACCEPTANCE) return 'PENDING';

    if (
      status === ContractRequestStatus.CANCELLED ||
      status === ContractRequestStatus.REJECTED
    ) {
      return 'CANCELLED';
    }

    if (status === ContractRequestStatus.EXPIRED) return 'EXPIRED';
    if (status === ContractRequestStatus.COMPLETED) return 'COMPLETED';

    if (status === ContractRequestStatus.ACCEPTED) {
      const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);
      if (now >= endsAt) return 'COMPLETED';
      if (now >= startsAt) return 'IN_PROGRESS';
      return 'ACCEPTED';
    }

    if (
      status === ContractRequestStatus.AWAITING_COMPLETION_CONFIRMATION ||
      status === ContractRequestStatus.COMPLETION_DISPUTE
    ) {
      return 'IN_PROGRESS';
    }

    return 'PENDING';
  }

  // ─── Private: mappers ───────────────────────────────────────────────────────

  private mapOfferToHubItem(
    offer: OpenOffer,
    applicationsToReviewCount: number,
    section: 'pending' | 'cancelled' | 'expired',
  ): CompanyHubItem {
    const displayStatus: HubDisplayStatus =
      section === 'cancelled' ? 'CANCELLED' : section === 'expired' ? 'EXPIRED' : 'OPEN';

    const perspectiveStatus: CompanyPerspectiveStatus =
      section === 'cancelled' ? 'CANCELLED' :
      section === 'expired' ? 'EXPIRED' :
      applicationsToReviewCount > 0 ? 'REVIEW_REQUIRED' : 'OPEN';

    return {
      id: offer.id,
      kind: 'open_offer',
      title: offer.jobType?.name ?? 'Oferta aberta',
      description: offer.description,
      address: offer.jobFormattedAddress ?? offer.jobAddress ?? 'Local a combinar',
      amount: offer.serviceGrossAmountCents,
      startsAt: offer.startsAt.toISOString(),
      durationMinutes: offer.durationMinutes,
      legacyStatus: offer.status,
      displayStatus,
      expiresAt: offer.expiresAt?.toISOString() ?? null,
      effectiveExpiresAt: offer.expiresAt?.toISOString() ?? null,
      completedAt: null,
      companyPerspectiveStatus: perspectiveStatus,
      companyActionRequired: false,
      primaryAction: resolvePrimaryAction(perspectiveStatus),
      availableActions: buildAvailableActions(perspectiveStatus),
      completionConfirmation: null,
      applicationsToReviewCount,
      myReviewPending: null,
      creatorId: null,
      creatorName: null,
      creatorAvatarUrl: null,
      offerId: offer.id,
      contractRequestId: null,
      createdAt: offer.createdAt.toISOString(),
      updatedAt: offer.updatedAt?.toISOString() ?? null,
      paymentId: null,
      paymentStatus: null,
      pixExpiresAt: null,
    };
  }

  private mapContractToHubItem(
    contract: ContractRequest,
    displayStatus: HubDisplayStatus,
    effectiveExpiresAt: Date | null,
    now: Date,
    payment: Payment | null,
  ): CompanyHubItem {
    const perspectiveStatus = buildCompanyPerspectiveStatus(
      {
        status: contract.status,
        startsAt: contract.startsAt ?? null,
        durationMinutes: contract.durationMinutes ?? null,
        companyConfirmedCompletedAt: contract.companyConfirmedCompletedAt ?? null,
        creatorConfirmedCompletedAt: contract.creatorConfirmedCompletedAt ?? null,
        contestDeadlineAt: contract.contestDeadlineAt ?? null,
        effectiveExpiresAt,
      },
      now,
    );

    return {
      id: contract.id,
      kind: contract.openOfferId ? 'contract' : 'direct_invite',
      title: contract.jobType?.name?.trim() || 'Campanha',
      description: contract.description,
      address: contract.jobFormattedAddress ?? contract.jobAddress ?? 'Local a combinar',
      amount: contract.companyTotalAmountCents ?? null,
      startsAt: contract.startsAt?.toISOString() ?? null,
      durationMinutes: contract.durationMinutes ?? null,
      legacyStatus: contract.status,
      displayStatus,
      expiresAt: contract.expiresAt?.toISOString() ?? null,
      effectiveExpiresAt: effectiveExpiresAt?.toISOString() ?? null,
      completedAt: contract.completedAt?.toISOString() ?? null,
      companyPerspectiveStatus: perspectiveStatus,
      companyActionRequired: perspectiveStatus === 'COMPANY_CONFIRMATION_REQUIRED',
      primaryAction: resolvePrimaryAction(perspectiveStatus),
      availableActions: buildAvailableActions(perspectiveStatus),
      completionConfirmation: buildCompletionConfirmation(contract),
      applicationsToReviewCount: 0,
      myReviewPending:
        displayStatus === 'COMPLETED'
          ? (contract.reviews == null || contract.reviews.length === 0)
          : null,
      creatorId: contract.creatorUser?.id ?? null,
      creatorName: contract.creatorUser?.profile?.name ?? contract.creatorNameSnapshot ?? null,
      creatorAvatarUrl: contract.creatorUser?.profile?.photoUrl ?? contract.creatorAvatarUrlSnapshot ?? null,
      offerId: contract.openOfferId ?? null,
      contractRequestId: contract.id,
      createdAt: contract.createdAt.toISOString(),
      updatedAt: contract.updatedAt?.toISOString() ?? null,
      paymentId: payment?.id ?? null,
      paymentStatus: payment?.status ?? null,
      pixExpiresAt: payment?.pixExpiresAt?.toISOString() ?? null,
    };
  }

  // ─── Private: sort comparators ──────────────────────────────────────────────

  private readonly sortByApplicationsThenExpiry = (
    a: CompanyHubItem,
    b: CompanyHubItem,
  ): number => {
    if (b.applicationsToReviewCount !== a.applicationsToReviewCount) {
      return b.applicationsToReviewCount - a.applicationsToReviewCount;
    }
    const aExp = a.expiresAt ? new Date(a.expiresAt).getTime() : Infinity;
    const bExp = b.expiresAt ? new Date(b.expiresAt).getTime() : Infinity;
    if (aExp !== bExp) return aExp - bExp;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  };

  private readonly sortByEffectiveExpiry = (
    a: CompanyHubItem,
    b: CompanyHubItem,
  ): number => {
    const aExp = a.effectiveExpiresAt ? new Date(a.effectiveExpiresAt).getTime() : Infinity;
    const bExp = b.effectiveExpiresAt ? new Date(b.effectiveExpiresAt).getTime() : Infinity;
    if (aExp !== bExp) return aExp - bExp;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  };

  private readonly sortByStartsAtAsc = (a: CompanyHubItem, b: CompanyHubItem): number => {
    const aStart = a.startsAt ? new Date(a.startsAt).getTime() : 0;
    const bStart = b.startsAt ? new Date(b.startsAt).getTime() : 0;
    if (aStart !== bStart) return aStart - bStart;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  };

  private readonly sortByUpdatedAtDesc = (a: CompanyHubItem, b: CompanyHubItem): number => {
    const aTime = new Date(a.updatedAt ?? a.createdAt).getTime();
    const bTime = new Date(b.updatedAt ?? b.createdAt).getTime();
    return bTime - aTime;
  };
}
