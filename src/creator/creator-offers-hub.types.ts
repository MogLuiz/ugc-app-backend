import { ContractRequestStatus } from '../common/enums/contract-request-status.enum';

export const PENDING_INVITE_EXPIRY_MS = 48 * 60 * 60 * 1000;
export const EXPIRE_SOON_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export enum CreatorHubDisplayStatus {
  PENDING_INVITE = 'PENDING_INVITE',
  APPLICATION_PENDING = 'APPLICATION_PENDING',
  ACCEPTED = 'ACCEPTED',
  AWAITING_CONFIRMATION = 'AWAITING_CONFIRMATION',
  IN_DISPUTE = 'IN_DISPUTE',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  APPLICATION_NOT_SELECTED = 'APPLICATION_NOT_SELECTED',
  APPLICATION_WITHDRAWN = 'APPLICATION_WITHDRAWN',
}

export enum CreatorHubItemKind {
  DIRECT_INVITE = 'direct_invite',
  OPEN_OFFER_APPLICATION = 'open_offer_application',
  CONTRACT = 'contract',
}

// ─── Semantic perspective types ───────────────────────────────────────────────

/** Estado semântico do item do hub pela perspectiva do creator. */
export type CreatorPerspectiveStatus =
  | 'INVITE_PENDING'
  | 'AVAILABLE_OPPORTUNITY'
  | 'UPCOMING_WORK'
  | 'CREATOR_CONFIRMATION_REQUIRED'
  | 'AWAITING_COMPANY_CONFIRMATION'
  | 'AWAITING_AUTO_COMPLETION'
  | 'COMPLETION_DISPUTE'
  | 'REVIEW_COMPANY_REQUIRED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';

export type CreatorHubAction =
  | 'accept_invite'
  | 'reject_invite'
  | 'confirm_completion'
  | 'contest_completion'
  | 'review_company'
  | 'view_details'
  | 'open_chat';

export type CreatorCompletionConfirmation = {
  companyConfirmed: boolean;
  creatorConfirmed: boolean;
  contestDeadlineAt: string | null;
  autoCompletionAt: string | null;
};

export type CreatorPerspectiveInput = {
  status: ContractRequestStatus;
  startsAt: Date | null;
  durationMinutes: number | null;
  creatorConfirmedCompletedAt: Date | null;
  companyConfirmedCompletedAt: Date | null;
  contestDeadlineAt: Date | null;
  effectiveExpiresAt: Date | null;
  myReviewPending: boolean | null;
};

// ─── Pure helpers (exportados para testes) ────────────────────────────────────

export function buildCreatorPerspectiveStatus(
  input: CreatorPerspectiveInput,
  now: Date = new Date(),
): CreatorPerspectiveStatus {
  const {
    status,
    startsAt,
    durationMinutes,
    creatorConfirmedCompletedAt,
    companyConfirmedCompletedAt,
    contestDeadlineAt,
    effectiveExpiresAt,
    myReviewPending,
  } = input;

  if (status === ContractRequestStatus.COMPLETED) {
    return myReviewPending === true ? 'REVIEW_COMPANY_REQUIRED' : 'COMPLETED';
  }

  if (
    status === ContractRequestStatus.CANCELLED ||
    status === ContractRequestStatus.REJECTED
  ) return 'CANCELLED';

  if (status === ContractRequestStatus.EXPIRED) return 'EXPIRED';

  if (status === ContractRequestStatus.PENDING_ACCEPTANCE) {
    if (effectiveExpiresAt !== null && effectiveExpiresAt <= now) return 'EXPIRED';
    return 'INVITE_PENDING';
  }

  if (status === ContractRequestStatus.COMPLETION_DISPUTE) return 'COMPLETION_DISPUTE';

  if (status === ContractRequestStatus.AWAITING_COMPLETION_CONFIRMATION) {
    const deadlineActive = contestDeadlineAt !== null && contestDeadlineAt > now;
    if (!deadlineActive) return 'AWAITING_AUTO_COMPLETION';
    if (creatorConfirmedCompletedAt === null) return 'CREATOR_CONFIRMATION_REQUIRED';
    if (companyConfirmedCompletedAt === null) return 'AWAITING_COMPANY_CONFIRMATION';
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

export function buildCreatorAvailableActions(
  perspectiveStatus: CreatorPerspectiveStatus,
): CreatorHubAction[] {
  if (perspectiveStatus === 'INVITE_PENDING') {
    return ['accept_invite', 'reject_invite', 'view_details'];
  }
  if (perspectiveStatus === 'CREATOR_CONFIRMATION_REQUIRED') {
    return ['confirm_completion', 'contest_completion', 'view_details'];
  }
  if (perspectiveStatus === 'REVIEW_COMPANY_REQUIRED') {
    return ['review_company', 'view_details'];
  }
  return ['view_details'];
}

export function resolveCreatorPrimaryAction(
  perspectiveStatus: CreatorPerspectiveStatus,
): CreatorHubAction {
  if (perspectiveStatus === 'INVITE_PENDING') return 'accept_invite';
  if (perspectiveStatus === 'CREATOR_CONFIRMATION_REQUIRED') return 'confirm_completion';
  if (perspectiveStatus === 'REVIEW_COMPANY_REQUIRED') return 'review_company';
  return 'view_details';
}

export function buildCreatorCompletionConfirmation(
  contract: Pick<
    import('../contract-requests/entities/contract-request.entity').ContractRequest,
    | 'status'
    | 'companyConfirmedCompletedAt'
    | 'creatorConfirmedCompletedAt'
    | 'contestDeadlineAt'
  >,
): CreatorCompletionConfirmation | null {
  if (
    contract.status !== ContractRequestStatus.AWAITING_COMPLETION_CONFIRMATION &&
    contract.status !== ContractRequestStatus.COMPLETION_DISPUTE &&
    contract.status !== ContractRequestStatus.COMPLETED
  ) {
    return null;
  }
  return {
    companyConfirmed: contract.companyConfirmedCompletedAt !== null,
    creatorConfirmed: contract.creatorConfirmedCompletedAt !== null,
    contestDeadlineAt: contract.contestDeadlineAt?.toISOString() ?? null,
    autoCompletionAt: contract.contestDeadlineAt?.toISOString() ?? null,
  };
}

// ─── Company snapshot ─────────────────────────────────────────────────────────

export interface CreatorHubCompany {
  id: string;
  name: string;
  logoUrl: string | null;
  rating: number | null;
  reviewCount: number;
}

// ─── CreatorHubItem ───────────────────────────────────────────────────────────

export interface CreatorHubItem {
  id: string;
  kind: CreatorHubItemKind;
  displayStatus: CreatorHubDisplayStatus;

  company: CreatorHubCompany;
  jobTypeName: string;
  title: string;

  totalAmount: number | null;
  currency: string;

  startsAt: string | null;
  finalizedAt: string | null;
  effectiveExpiresAt: string | null;
  expiresSoon: boolean;
  openOfferId: string | null;
  address: string;
  locationDisplay: string | null;

  /** Estado semântico calculado pelo backend; use este campo para decisões de UI. */
  creatorPerspectiveStatus: CreatorPerspectiveStatus;
  primaryAction: CreatorHubAction;
  availableActions: CreatorHubAction[];
  actionRequired: boolean;
  /** Campos de confirmação bilateral. Presente em AWAITING/DISPUTE/COMPLETED; null nos demais. */
  completionConfirmation: CreatorCompletionConfirmation | null;

  canAccept: boolean;
  canReject: boolean;
  canCancel: boolean;
  canConfirmCompletion: boolean;
  canDispute: boolean;

  myReviewPending: boolean | null;
}

export interface CreatorHubSummary {
  pendingInvitesCount: number;
  pendingApplicationsCount: number;
  inProgressCount: number;
  completedPendingReviewCount: number;
  actionRequiredCount: number;
}

export interface CreatorOffersHubResponse {
  summary: CreatorHubSummary;
  pending: {
    invites: CreatorHubItem[];
    applications: CreatorHubItem[];
  };
  inProgress: CreatorHubItem[];
  finalized: {
    completed: CreatorHubItem[];
    rejected: CreatorHubItem[];
    cancelled: CreatorHubItem[];
    expired: CreatorHubItem[];
  };
}
