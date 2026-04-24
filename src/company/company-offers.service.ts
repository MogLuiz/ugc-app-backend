import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { UserRole } from '../common/enums/user-role.enum';
import { ContractRequestStatus } from '../common/enums/contract-request-status.enum';
import { OpenOfferStatus } from '../common/enums/open-offer-status.enum';
import { UsersRepository } from '../users/users.repository';
import { OpenOffersRepository } from '../open-offers/open-offers.repository';
import { ContractRequestsRepository } from '../contract-requests/contract-requests.repository';
import { OpenOffer } from '../open-offers/entities/open-offer.entity';
import { ContractRequest } from '../contract-requests/entities/contract-request.entity';
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

export type HubPrimaryAction = 'review_applications' | 'view_details';

/**
 * View model do hub da empresa — não é DTO de domínio genérico.
 * Campos como title, address e os fallbacks ("Campanha", "Local a combinar")
 * são decisões de UI aplicadas no backend para simplificar a renderização.
 * creatorId/Name/AvatarUrl são null para kind='open_offer' (sem creator único).
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
  /** Prazo de 72h para confirmar ou contestar (disponível para itens em AWAITING_COMPLETION_CONFIRMATION). */
  contestDeadlineAt: string | null;
  /** Data de conclusão do contrato (quando status transitou para COMPLETED). Null para não-COMPLETED. */
  completedAt: string | null;
  /**
   * True quando a empresa ainda não confirmou e o prazo está ativo.
   * Sinaliza que há uma ação pendente por parte da empresa.
   */
  actionRequiredByCompany: boolean;
  primaryAction: HubPrimaryAction;
  applicationsToReviewCount: number;
  /**
   * Indica se a empresa ainda não avaliou este contrato.
   * true = avaliação pendente, false = já avaliada, null = não aplicável (não é COMPLETED).
   */
  myReviewPending: boolean | null;
  creatorId: string | null;
  creatorName: string | null;
  creatorAvatarUrl: string | null;
  offerId: string | null;
  contractRequestId: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type CompanyOffersHubResponse = {
  pending: {
    openOffers: CompanyHubItem[];
    directInvites: CompanyHubItem[];
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

    const pendingCounts =
      openOfferIds.length > 0
        ? await this.openOffersRepository.countPendingApplicationsByOfferIds(openOfferIds)
        : {};

    return this.buildHubResponse(allOffers, allContracts, pendingCounts, now);
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
  ): CompanyOffersHubResponse {
    const pending: CompanyOffersHubResponse['pending'] = {
      openOffers: [],
      directInvites: [],
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
      const displayStatus = this.buildHubDisplayStatus(contract, effectiveExpiresAt, now);

      switch (displayStatus) {
        case 'PENDING':
          if (!contract.openOfferId) {
            pending.directInvites.push(
              this.mapContractToHubItem(contract, displayStatus, effectiveExpiresAt, now),
            );
          }
          break;
        case 'ACCEPTED':
        case 'IN_PROGRESS':
          inProgress.push(this.mapContractToHubItem(contract, displayStatus, effectiveExpiresAt, now));
          break;
        case 'COMPLETED':
          finalized.completed.push(
            this.mapContractToHubItem(contract, displayStatus, effectiveExpiresAt, now),
          );
          break;
        case 'CANCELLED':
          finalized.cancelled.push(
            this.mapContractToHubItem(contract, displayStatus, effectiveExpiresAt, now),
          );
          break;
        case 'EXPIRED':
          finalized.expiredWithoutHire.push(
            this.mapContractToHubItem(contract, displayStatus, effectiveExpiresAt, now),
          );
          break;
      }
    }

    pending.openOffers.sort(this.sortByApplicationsThenExpiry);
    pending.directInvites.sort(this.sortByEffectiveExpiry);
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

    return {
      id: offer.id,
      kind: 'open_offer',
      title: offer.jobType?.name ?? 'Oferta aberta',
      description: offer.description,
      address: offer.jobFormattedAddress ?? offer.jobAddress ?? 'Local a combinar',
      amount: offer.offeredAmount,
      startsAt: offer.startsAt.toISOString(),
      durationMinutes: offer.durationMinutes,
      legacyStatus: offer.status,
      displayStatus,
      expiresAt: offer.expiresAt?.toISOString() ?? null,
      effectiveExpiresAt: offer.expiresAt?.toISOString() ?? null,
      contestDeadlineAt: null,
      completedAt: null,
      actionRequiredByCompany: false,
      primaryAction: section === 'pending' && applicationsToReviewCount > 0
        ? 'review_applications'
        : 'view_details',
      applicationsToReviewCount,
      myReviewPending: null,
      creatorId: null,
      creatorName: null,
      creatorAvatarUrl: null,
      offerId: offer.id,
      contractRequestId: null,
      createdAt: offer.createdAt.toISOString(),
      updatedAt: offer.updatedAt?.toISOString() ?? null,
    };
  }

  private mapContractToHubItem(
    contract: ContractRequest,
    displayStatus: HubDisplayStatus,
    effectiveExpiresAt: Date | null,
    now: Date,
  ): CompanyHubItem {
    const isAwaiting =
      contract.status === ContractRequestStatus.AWAITING_COMPLETION_CONFIRMATION;

    const actionRequiredByCompany =
      isAwaiting &&
      contract.companyConfirmedCompletedAt === null &&
      contract.contestDeadlineAt !== null &&
      contract.contestDeadlineAt > now;

    return {
      id: contract.id,
      kind: contract.openOfferId ? 'contract' : 'direct_invite',
      title: contract.jobType?.name?.trim() || 'Campanha',
      description: contract.description,
      address: contract.jobFormattedAddress ?? contract.jobAddress ?? 'Local a combinar',
      amount: contract.totalPrice ?? null,
      startsAt: contract.startsAt?.toISOString() ?? null,
      durationMinutes: contract.durationMinutes ?? null,
      legacyStatus: contract.status,
      displayStatus,
      expiresAt: contract.expiresAt?.toISOString() ?? null,
      effectiveExpiresAt: effectiveExpiresAt?.toISOString() ?? null,
      contestDeadlineAt: contract.contestDeadlineAt?.toISOString() ?? null,
      completedAt: contract.completedAt?.toISOString() ?? null,
      actionRequiredByCompany,
      primaryAction: 'view_details',
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
