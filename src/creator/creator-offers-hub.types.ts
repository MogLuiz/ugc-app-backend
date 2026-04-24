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

export enum CreatorHubPrimaryAction {
  ACCEPT_OR_REJECT = 'ACCEPT_OR_REJECT',
  CONFIRM_OR_DISPUTE = 'CONFIRM_OR_DISPUTE',
  LEAVE_REVIEW = 'LEAVE_REVIEW',
  VIEW = 'VIEW',
}

export interface CreatorHubCompany {
  id: string;
  name: string;
  logoUrl: string | null;
  rating: number | null;
  reviewCount: number;
}

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

  primaryAction: CreatorHubPrimaryAction;
  actionRequired: boolean;

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
