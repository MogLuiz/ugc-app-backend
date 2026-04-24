import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { UserRole } from '../common/enums/user-role.enum';
import { ContractRequestStatus } from '../common/enums/contract-request-status.enum';
import { ApplicationStatus } from '../common/enums/application-status.enum';
import { OpenOfferStatus } from '../common/enums/open-offer-status.enum';
import { ContractRequestsRepository } from '../contract-requests/contract-requests.repository';
import { OpenOffersRepository } from '../open-offers/open-offers.repository';
import { UsersRepository } from '../users/users.repository';
import { ContractRequest } from '../contract-requests/entities/contract-request.entity';
import { OpenOfferApplication } from '../open-offers/entities/open-offer-application.entity';
import {
  CreatorHubCompany,
  CreatorHubDisplayStatus,
  CreatorHubItem,
  CreatorHubItemKind,
  CreatorHubPrimaryAction,
  CreatorHubSummary,
  CreatorOffersHubResponse,
  EXPIRE_SOON_THRESHOLD_MS,
  PENDING_INVITE_EXPIRY_MS,
} from './creator-offers-hub.types';

@Injectable()
export class CreatorOffersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly contractRequestsRepository: ContractRequestsRepository,
    private readonly openOffersRepository: OpenOffersRepository,
  ) {}

  async getOffersHub(authUser: AuthUser): Promise<CreatorOffersHubResponse> {
    const creator = await this.requireCreator(authUser);
    const now = new Date();

    const [contracts, applications] = await Promise.all([
      this.contractRequestsRepository.listAllByCreator({
        creatorUserId: creator.id,
        currentUserId: creator.id,
      }),
      this.openOffersRepository.listApplicationsByCreatorForHub(creator.id),
    ]);

    return this.buildHubResponse(contracts, applications, now);
  }

  private buildHubResponse(
    contracts: ContractRequest[],
    applications: OpenOfferApplication[],
    now: Date,
  ): CreatorOffersHubResponse {
    const result: CreatorOffersHubResponse = {
      summary: null as unknown as CreatorHubSummary,
      pending: { invites: [], applications: [] },
      inProgress: [],
      finalized: { completed: [], rejected: [], cancelled: [], expired: [] },
    };

    for (const contract of contracts) {
      const effectiveExpiresAt = this.resolveEffectiveExpiresAt(contract);
      const displayStatus = this.resolveContractDisplayStatus(contract, effectiveExpiresAt, now);

      if (displayStatus === null) continue;

      const item = this.buildContractHubItem(contract, displayStatus, effectiveExpiresAt, now);

      switch (displayStatus) {
        case CreatorHubDisplayStatus.PENDING_INVITE:
          result.pending.invites.push(item);
          break;
        case CreatorHubDisplayStatus.ACCEPTED:
        case CreatorHubDisplayStatus.AWAITING_CONFIRMATION:
        case CreatorHubDisplayStatus.IN_DISPUTE:
          result.inProgress.push(item);
          break;
        case CreatorHubDisplayStatus.COMPLETED:
          result.finalized.completed.push(item);
          break;
        case CreatorHubDisplayStatus.REJECTED:
          result.finalized.rejected.push(item);
          break;
        case CreatorHubDisplayStatus.CANCELLED:
          result.finalized.cancelled.push(item);
          break;
        case CreatorHubDisplayStatus.EXPIRED:
          result.finalized.expired.push(item);
          break;
      }
    }

    for (const app of applications) {
      const displayStatus = this.resolveApplicationDisplayStatus(app, now);
      const item = this.buildApplicationHubItem(app, displayStatus, now);

      switch (displayStatus) {
        case CreatorHubDisplayStatus.APPLICATION_PENDING:
          result.pending.applications.push(item);
          break;
        case CreatorHubDisplayStatus.APPLICATION_NOT_SELECTED:
        case CreatorHubDisplayStatus.APPLICATION_WITHDRAWN:
        case CreatorHubDisplayStatus.EXPIRED:
          result.finalized.expired.push(item);
          break;
      }
    }

    result.pending.invites.sort(this.sortByEffectiveExpiresAtAsc);
    result.pending.applications.sort(this.sortByEffectiveExpiresAtAsc);
    // inProgress: already ordered by updated_at DESC from the repository query
    result.finalized.completed.sort(this.sortByFinalizedAtDesc);
    result.finalized.rejected.sort(this.sortByFinalizedAtDesc);
    result.finalized.cancelled.sort(this.sortByFinalizedAtDesc);
    result.finalized.expired.sort(this.sortByFinalizedAtDesc);

    result.summary = this.buildSummary(result);

    return result;
  }

  private resolveContractDisplayStatus(
    contract: ContractRequest,
    effectiveExpiresAt: Date | null,
    now: Date,
  ): CreatorHubDisplayStatus | null {
    switch (contract.status) {
      case ContractRequestStatus.PENDING_ACCEPTANCE:
        if (effectiveExpiresAt && now >= effectiveExpiresAt) {
          return CreatorHubDisplayStatus.EXPIRED;
        }
        return CreatorHubDisplayStatus.PENDING_INVITE;

      case ContractRequestStatus.ACCEPTED:
        return CreatorHubDisplayStatus.ACCEPTED;

      case ContractRequestStatus.AWAITING_COMPLETION_CONFIRMATION:
        return CreatorHubDisplayStatus.AWAITING_CONFIRMATION;

      case ContractRequestStatus.COMPLETION_DISPUTE:
        return CreatorHubDisplayStatus.IN_DISPUTE;

      case ContractRequestStatus.COMPLETED:
        return CreatorHubDisplayStatus.COMPLETED;

      case ContractRequestStatus.REJECTED:
        return CreatorHubDisplayStatus.REJECTED;

      case ContractRequestStatus.CANCELLED:
        return CreatorHubDisplayStatus.CANCELLED;

      case ContractRequestStatus.EXPIRED:
        return CreatorHubDisplayStatus.EXPIRED;

      default:
        // PENDING_PAYMENT: contract not yet paid — not visible to creator
        return null;
    }
  }

  private resolveApplicationDisplayStatus(
    app: OpenOfferApplication,
    now: Date,
  ): CreatorHubDisplayStatus {
    switch (app.status) {
      case ApplicationStatus.PENDING: {
        const offer = app.openOffer;
        const offerExpired = offer?.expiresAt && now >= offer.expiresAt;
        const offerClosed =
          offer?.status === OpenOfferStatus.FILLED ||
          offer?.status === OpenOfferStatus.CANCELLED ||
          offer?.status === OpenOfferStatus.EXPIRED;
        if (offerExpired || offerClosed) {
          return CreatorHubDisplayStatus.EXPIRED;
        }
        return CreatorHubDisplayStatus.APPLICATION_PENDING;
      }
      case ApplicationStatus.REJECTED:
        return CreatorHubDisplayStatus.APPLICATION_NOT_SELECTED;
      case ApplicationStatus.WITHDRAWN:
        return CreatorHubDisplayStatus.APPLICATION_WITHDRAWN;
      default:
        // SELECTED: represented by the resulting ContractRequest — not shown as application
        return CreatorHubDisplayStatus.EXPIRED;
    }
  }

  private resolveEffectiveExpiresAt(contract: ContractRequest): Date | null {
    if (contract.expiresAt) return contract.expiresAt;
    if (contract.status === ContractRequestStatus.PENDING_ACCEPTANCE) {
      return new Date(contract.createdAt.getTime() + PENDING_INVITE_EXPIRY_MS);
    }
    return null;
  }

  private resolveFinalizedAt(
    contract: ContractRequest,
    displayStatus: CreatorHubDisplayStatus,
    effectiveExpiresAt: Date | null,
  ): string | null {
    switch (displayStatus) {
      case CreatorHubDisplayStatus.COMPLETED:
        return contract.completedAt?.toISOString() ?? null;
      case CreatorHubDisplayStatus.REJECTED:
        return contract.updatedAt?.toISOString() ?? null;
      case CreatorHubDisplayStatus.CANCELLED:
        return contract.updatedAt?.toISOString() ?? null;
      case CreatorHubDisplayStatus.EXPIRED:
        if (contract.status === ContractRequestStatus.EXPIRED) {
          return contract.updatedAt?.toISOString() ?? null;
        }
        // PENDING_ACCEPTANCE that expired by time
        return effectiveExpiresAt?.toISOString() ?? null;
      default:
        return null;
    }
  }

  private buildCompanySnapshot(companyUser: ContractRequest['companyUser']): CreatorHubCompany {
    const rawRating = companyUser?.profile?.averageRating;
    return {
      id: companyUser?.id ?? '',
      name:
        companyUser?.companyProfile?.companyName ??
        companyUser?.profile?.name ??
        'Empresa',
      logoUrl: companyUser?.profile?.photoUrl ?? null,
      rating: rawRating != null && rawRating > 0 ? rawRating : null,
      reviewCount: companyUser?.profile?.reviewCount ?? 0,
    };
  }

  private buildContractHubItem(
    contract: ContractRequest,
    displayStatus: CreatorHubDisplayStatus,
    effectiveExpiresAt: Date | null,
    now: Date,
  ): CreatorHubItem {
    const flags = this.buildActionFlags(contract, displayStatus, now);
    const myReviewPending = this.resolveMyReviewPending(contract, displayStatus);
    const primaryAction = this.derivePrimaryAction(flags, myReviewPending);
    const finalizedAt = this.resolveFinalizedAt(contract, displayStatus, effectiveExpiresAt);

    return {
      id: contract.id,
      kind: CreatorHubItemKind.CONTRACT,
      displayStatus,

      company: this.buildCompanySnapshot(contract.companyUser),
      jobTypeName: contract.jobType?.name ?? '',
      title: contract.jobType?.name ?? 'Campanha',

      totalAmount: contract.totalPrice ?? null,
      currency: contract.currency ?? 'BRL',

      startsAt: contract.startsAt?.toISOString() ?? null,
      finalizedAt,
      effectiveExpiresAt: effectiveExpiresAt?.toISOString() ?? null,
      expiresSoon: this.resolveExpiresSoon(effectiveExpiresAt, displayStatus, now),
      openOfferId: contract.openOfferId ?? null,
      address: contract.jobFormattedAddress ?? contract.jobAddress ?? 'Local a combinar',
      locationDisplay: this.extractLocationDisplay(contract.jobFormattedAddress, contract.jobAddress),

      primaryAction,
      actionRequired: primaryAction !== CreatorHubPrimaryAction.VIEW,

      ...flags,
      myReviewPending,
    };
  }

  private buildApplicationHubItem(
    app: OpenOfferApplication,
    displayStatus: CreatorHubDisplayStatus,
    _now: Date,
  ): CreatorHubItem {
    const offer = app.openOffer;
    const companyUser = offer?.companyUser;
    const rawRating = companyUser?.profile?.averageRating;

    const finalizedAt =
      displayStatus !== CreatorHubDisplayStatus.APPLICATION_PENDING
        ? (app.respondedAt?.toISOString() ?? null)
        : null;

    return {
      id: app.id,
      kind: CreatorHubItemKind.OPEN_OFFER_APPLICATION,
      displayStatus,

      company: {
        id: companyUser?.id ?? '',
        name:
          companyUser?.companyProfile?.companyName ??
          companyUser?.profile?.name ??
          'Empresa',
        logoUrl: companyUser?.profile?.photoUrl ?? null,
        rating: rawRating != null && rawRating > 0 ? rawRating : null,
        reviewCount: companyUser?.profile?.reviewCount ?? 0,
      },

      jobTypeName: offer?.jobType?.name ?? '',
      title: offer?.jobType?.name ?? 'Oportunidade',

      totalAmount: offer?.offeredAmount ?? null,
      currency: 'BRL',

      startsAt: offer?.startsAt?.toISOString() ?? null,
      finalizedAt,
      effectiveExpiresAt: offer?.expiresAt?.toISOString() ?? null,
      expiresSoon: false,
      openOfferId: app.openOfferId ?? null,
      address: offer?.jobFormattedAddress ?? offer?.jobAddress ?? 'Local a combinar',
      locationDisplay: null,

      primaryAction: CreatorHubPrimaryAction.VIEW,
      actionRequired: false,

      canAccept: false,
      canReject: false,
      canCancel: false,
      canConfirmCompletion: false,
      canDispute: false,

      myReviewPending: null,
    };
  }

  private buildActionFlags(
    contract: ContractRequest,
    displayStatus: CreatorHubDisplayStatus,
    now: Date,
  ): Pick<
    CreatorHubItem,
    'canAccept' | 'canReject' | 'canCancel' | 'canConfirmCompletion' | 'canDispute'
  > {
    const withinContestWindow =
      displayStatus === CreatorHubDisplayStatus.AWAITING_CONFIRMATION &&
      contract.creatorConfirmedCompletedAt === null &&
      contract.contestDeadlineAt !== null &&
      contract.contestDeadlineAt > now;

    return {
      canAccept: displayStatus === CreatorHubDisplayStatus.PENDING_INVITE,
      canReject: displayStatus === CreatorHubDisplayStatus.PENDING_INVITE,
      canCancel: displayStatus === CreatorHubDisplayStatus.ACCEPTED,
      canConfirmCompletion: withinContestWindow,
      canDispute: withinContestWindow,
    };
  }

  private resolveMyReviewPending(
    contract: ContractRequest,
    displayStatus: CreatorHubDisplayStatus,
  ): boolean | null {
    if (displayStatus !== CreatorHubDisplayStatus.COMPLETED) return null;
    return contract.reviews === undefined || contract.reviews.length === 0;
  }

  private derivePrimaryAction(
    flags: ReturnType<typeof this.buildActionFlags>,
    myReviewPending: boolean | null,
  ): CreatorHubPrimaryAction {
    if (flags.canAccept) return CreatorHubPrimaryAction.ACCEPT_OR_REJECT;
    if (flags.canConfirmCompletion) return CreatorHubPrimaryAction.CONFIRM_OR_DISPUTE;
    if (myReviewPending === true) return CreatorHubPrimaryAction.LEAVE_REVIEW;
    return CreatorHubPrimaryAction.VIEW;
  }

  private resolveExpiresSoon(
    effectiveExpiresAt: Date | null,
    displayStatus: CreatorHubDisplayStatus,
    now: Date,
  ): boolean {
    if (displayStatus !== CreatorHubDisplayStatus.PENDING_INVITE) return false;
    if (!effectiveExpiresAt) return false;
    return effectiveExpiresAt.getTime() - now.getTime() <= EXPIRE_SOON_THRESHOLD_MS;
  }

  private buildSummary(
    result: Omit<CreatorOffersHubResponse, 'summary'>,
  ): CreatorHubSummary {
    const allItems = [
      ...result.pending.invites,
      ...result.pending.applications,
      ...result.inProgress,
      ...result.finalized.completed,
      ...result.finalized.rejected,
      ...result.finalized.cancelled,
      ...result.finalized.expired,
    ];

    return {
      pendingInvitesCount: result.pending.invites.length,
      pendingApplicationsCount: result.pending.applications.length,
      inProgressCount: result.inProgress.length,
      completedPendingReviewCount: result.finalized.completed.filter(
        (i) => i.myReviewPending === true,
      ).length,
      actionRequiredCount: allItems.filter((i) => i.actionRequired).length,
    };
  }

  private readonly sortByEffectiveExpiresAtAsc = (
    a: CreatorHubItem,
    b: CreatorHubItem,
  ): number => {
    const aT = a.effectiveExpiresAt ? new Date(a.effectiveExpiresAt).getTime() : Infinity;
    const bT = b.effectiveExpiresAt ? new Date(b.effectiveExpiresAt).getTime() : Infinity;
    return aT - bT;
  };

  private readonly sortByFinalizedAtDesc = (
    a: CreatorHubItem,
    b: CreatorHubItem,
  ): number => {
    const aT = a.finalizedAt ? new Date(a.finalizedAt).getTime() : 0;
    const bT = b.finalizedAt ? new Date(b.finalizedAt).getTime() : 0;
    return bT - aT;
  };

  private extractLocationDisplay(
    formattedAddress: string | null,
    fallbackAddress: string,
  ): string | null {
    const source = (formattedAddress || fallbackAddress || '').trim();
    if (!source) return null;

    const parts = source.split(',').map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return null;

    let state: string | null = null;
    let city: string | null = null;

    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const upper = parts[i].toUpperCase();
      if (/^[A-Z]{2}$/.test(upper)) {
        state = upper;
        city = i > 0 ? (parts[i - 1] ?? null) : null;
        break;
      }
    }

    if (!city) city = parts.length >= 2 ? (parts[parts.length - 2] ?? null) : (parts[0] ?? null);
    if (!state) {
      const m = (parts[parts.length - 1] ?? '').match(/\b([A-Z]{2})\b/);
      state = m ? m[1] : null;
    }

    if (city && state) return `${city}, ${state}`;
    return city ?? state ?? source;
  }

  private async requireCreator(authUser: AuthUser) {
    const found = await this.usersRepository.findByAuthUserIdWithProfiles(authUser.authUserId);
    if (!found) throw new UnauthorizedException();
    if (found.role !== UserRole.CREATOR) {
      throw new ForbiddenException('Apenas creators podem acessar este recurso');
    }
    return found;
  }
}
