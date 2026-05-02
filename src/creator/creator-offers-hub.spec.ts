import { ContractRequestStatus } from '../common/enums/contract-request-status.enum';
import {
  buildCreatorAvailableActions,
  buildCreatorCompletionConfirmation,
  buildCreatorPerspectiveStatus,
  resolveCreatorPrimaryAction,
  type CreatorPerspectiveInput,
} from './creator-offers-hub.types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW = new Date('2030-06-15T12:00:00.000Z');
const FUTURE_DEADLINE = new Date(NOW.getTime() + 24 * 60 * 60_000); // +24h
const PAST_DEADLINE = new Date(NOW.getTime() - 60 * 60_000);        // -1h

function makeInput(overrides: Partial<CreatorPerspectiveInput> = {}): CreatorPerspectiveInput {
  return {
    status: ContractRequestStatus.ACCEPTED,
    startsAt: new Date('2030-06-20T10:00:00.000Z'),
    durationMinutes: 120,
    creatorConfirmedCompletedAt: null,
    companyConfirmedCompletedAt: null,
    contestDeadlineAt: null,
    effectiveExpiresAt: null,
    myReviewPending: null,
    ...overrides,
  };
}

// ─── buildCreatorPerspectiveStatus ───────────────────────────────────────────

describe('buildCreatorPerspectiveStatus', () => {
  // AWAITING_COMPLETION_CONFIRMATION subestados

  it('retorna CREATOR_CONFIRMATION_REQUIRED quando creator não confirmou e prazo ativo', () => {
    const result = buildCreatorPerspectiveStatus(
      makeInput({
        status: ContractRequestStatus.AWAITING_COMPLETION_CONFIRMATION,
        creatorConfirmedCompletedAt: null,
        companyConfirmedCompletedAt: null,
        contestDeadlineAt: FUTURE_DEADLINE,
      }),
      NOW,
    );
    expect(result).toBe('CREATOR_CONFIRMATION_REQUIRED');
  });

  it('retorna AWAITING_COMPANY_CONFIRMATION quando creator confirmou e empresa não', () => {
    const result = buildCreatorPerspectiveStatus(
      makeInput({
        status: ContractRequestStatus.AWAITING_COMPLETION_CONFIRMATION,
        creatorConfirmedCompletedAt: new Date(NOW.getTime() - 30 * 60_000),
        companyConfirmedCompletedAt: null,
        contestDeadlineAt: FUTURE_DEADLINE,
      }),
      NOW,
    );
    expect(result).toBe('AWAITING_COMPANY_CONFIRMATION');
  });

  it('retorna AWAITING_AUTO_COMPLETION quando empresa confirmou e creator não', () => {
    // empresa já confirmou mas creator ainda não → prazo ativo → CREATOR_CONFIRMATION_REQUIRED
    // para empresa confirmou primeiro: creatorConfirmedAt=null, company=set
    // Na regra: se creator null → CREATOR_CONFIRMATION_REQUIRED (independente de company)
    const result = buildCreatorPerspectiveStatus(
      makeInput({
        status: ContractRequestStatus.AWAITING_COMPLETION_CONFIRMATION,
        creatorConfirmedCompletedAt: null,
        companyConfirmedCompletedAt: new Date(NOW.getTime() - 30 * 60_000),
        contestDeadlineAt: FUTURE_DEADLINE,
      }),
      NOW,
    );
    expect(result).toBe('CREATOR_CONFIRMATION_REQUIRED');
  });

  it('retorna AWAITING_AUTO_COMPLETION quando ambos confirmaram', () => {
    const result = buildCreatorPerspectiveStatus(
      makeInput({
        status: ContractRequestStatus.AWAITING_COMPLETION_CONFIRMATION,
        creatorConfirmedCompletedAt: new Date(NOW.getTime() - 60 * 60_000),
        companyConfirmedCompletedAt: new Date(NOW.getTime() - 30 * 60_000),
        contestDeadlineAt: FUTURE_DEADLINE,
      }),
      NOW,
    );
    expect(result).toBe('AWAITING_AUTO_COMPLETION');
  });

  it('retorna AWAITING_AUTO_COMPLETION quando prazo expirou', () => {
    const result = buildCreatorPerspectiveStatus(
      makeInput({
        status: ContractRequestStatus.AWAITING_COMPLETION_CONFIRMATION,
        creatorConfirmedCompletedAt: null,
        companyConfirmedCompletedAt: null,
        contestDeadlineAt: PAST_DEADLINE,
      }),
      NOW,
    );
    expect(result).toBe('AWAITING_AUTO_COMPLETION');
  });

  it('retorna AWAITING_AUTO_COMPLETION quando contestDeadlineAt é null', () => {
    const result = buildCreatorPerspectiveStatus(
      makeInput({
        status: ContractRequestStatus.AWAITING_COMPLETION_CONFIRMATION,
        contestDeadlineAt: null,
      }),
      NOW,
    );
    expect(result).toBe('AWAITING_AUTO_COMPLETION');
  });

  // ACCEPTED subestados

  it('retorna UPCOMING_WORK para ACCEPTED com data futura', () => {
    expect(
      buildCreatorPerspectiveStatus(
        makeInput({ status: ContractRequestStatus.ACCEPTED }),
        NOW,
      ),
    ).toBe('UPCOMING_WORK');
  });

  it('retorna AWAITING_AUTO_COMPLETION para ACCEPTED cujo serviço já encerrou', () => {
    const startedThreeHoursAgo = new Date(NOW.getTime() - 3 * 60 * 60_000);
    expect(
      buildCreatorPerspectiveStatus(
        makeInput({
          status: ContractRequestStatus.ACCEPTED,
          startsAt: startedThreeHoursAgo,
          durationMinutes: 120, // ended 1h ago
        }),
        NOW,
      ),
    ).toBe('AWAITING_AUTO_COMPLETION');
  });

  // COMPLETED subestados

  it('retorna REVIEW_COMPANY_REQUIRED para COMPLETED com review pendente', () => {
    expect(
      buildCreatorPerspectiveStatus(
        makeInput({ status: ContractRequestStatus.COMPLETED, myReviewPending: true }),
        NOW,
      ),
    ).toBe('REVIEW_COMPANY_REQUIRED');
  });

  it('retorna COMPLETED para COMPLETED sem review pendente', () => {
    expect(
      buildCreatorPerspectiveStatus(
        makeInput({ status: ContractRequestStatus.COMPLETED, myReviewPending: false }),
        NOW,
      ),
    ).toBe('COMPLETED');
  });

  it('retorna COMPLETED para COMPLETED com myReviewPending null', () => {
    expect(
      buildCreatorPerspectiveStatus(
        makeInput({ status: ContractRequestStatus.COMPLETED, myReviewPending: null }),
        NOW,
      ),
    ).toBe('COMPLETED');
  });

  // Outros estados

  it('retorna COMPLETION_DISPUTE', () => {
    expect(
      buildCreatorPerspectiveStatus(
        makeInput({ status: ContractRequestStatus.COMPLETION_DISPUTE }),
        NOW,
      ),
    ).toBe('COMPLETION_DISPUTE');
  });

  it('retorna CANCELLED para CANCELLED', () => {
    expect(
      buildCreatorPerspectiveStatus(
        makeInput({ status: ContractRequestStatus.CANCELLED }),
        NOW,
      ),
    ).toBe('CANCELLED');
  });

  it('retorna CANCELLED para REJECTED', () => {
    expect(
      buildCreatorPerspectiveStatus(
        makeInput({ status: ContractRequestStatus.REJECTED }),
        NOW,
      ),
    ).toBe('CANCELLED');
  });

  it('retorna EXPIRED para EXPIRED', () => {
    expect(
      buildCreatorPerspectiveStatus(
        makeInput({ status: ContractRequestStatus.EXPIRED }),
        NOW,
      ),
    ).toBe('EXPIRED');
  });

  it('retorna INVITE_PENDING para PENDING_ACCEPTANCE com prazo futuro', () => {
    const futureExpiry = new Date(NOW.getTime() + 12 * 60 * 60_000);
    expect(
      buildCreatorPerspectiveStatus(
        makeInput({
          status: ContractRequestStatus.PENDING_ACCEPTANCE,
          effectiveExpiresAt: futureExpiry,
        }),
        NOW,
      ),
    ).toBe('INVITE_PENDING');
  });

  it('retorna EXPIRED para PENDING_ACCEPTANCE com prazo vencido', () => {
    const pastExpiry = new Date(NOW.getTime() - 60_000);
    expect(
      buildCreatorPerspectiveStatus(
        makeInput({
          status: ContractRequestStatus.PENDING_ACCEPTANCE,
          effectiveExpiresAt: pastExpiry,
        }),
        NOW,
      ),
    ).toBe('EXPIRED');
  });
});

// ─── buildCreatorAvailableActions ─────────────────────────────────────────────

describe('buildCreatorAvailableActions', () => {
  it('INVITE_PENDING inclui accept_invite e reject_invite', () => {
    const actions = buildCreatorAvailableActions('INVITE_PENDING');
    expect(actions).toContain('accept_invite');
    expect(actions).toContain('reject_invite');
    expect(actions).toContain('view_details');
  });

  it('CREATOR_CONFIRMATION_REQUIRED inclui confirm_completion e contest_completion', () => {
    const actions = buildCreatorAvailableActions('CREATOR_CONFIRMATION_REQUIRED');
    expect(actions).toContain('confirm_completion');
    expect(actions).toContain('contest_completion');
    expect(actions).toContain('view_details');
  });

  it('REVIEW_COMPANY_REQUIRED inclui review_company', () => {
    const actions = buildCreatorAvailableActions('REVIEW_COMPANY_REQUIRED');
    expect(actions).toContain('review_company');
    expect(actions).toContain('view_details');
  });

  it('AWAITING_COMPANY_CONFIRMATION retorna apenas view_details', () => {
    expect(buildCreatorAvailableActions('AWAITING_COMPANY_CONFIRMATION')).toEqual(['view_details']);
  });

  it('UPCOMING_WORK retorna apenas view_details', () => {
    expect(buildCreatorAvailableActions('UPCOMING_WORK')).toEqual(['view_details']);
  });

  it('COMPLETED retorna apenas view_details', () => {
    expect(buildCreatorAvailableActions('COMPLETED')).toEqual(['view_details']);
  });

  it('CREATOR_CONFIRMATION_REQUIRED não inclui accept_invite', () => {
    const actions = buildCreatorAvailableActions('CREATOR_CONFIRMATION_REQUIRED');
    expect(actions).not.toContain('accept_invite');
  });
});

// ─── resolveCreatorPrimaryAction ──────────────────────────────────────────────

describe('resolveCreatorPrimaryAction', () => {
  it('INVITE_PENDING → accept_invite', () => {
    expect(resolveCreatorPrimaryAction('INVITE_PENDING')).toBe('accept_invite');
  });

  it('CREATOR_CONFIRMATION_REQUIRED → confirm_completion', () => {
    expect(resolveCreatorPrimaryAction('CREATOR_CONFIRMATION_REQUIRED')).toBe('confirm_completion');
  });

  it('REVIEW_COMPANY_REQUIRED → review_company', () => {
    expect(resolveCreatorPrimaryAction('REVIEW_COMPANY_REQUIRED')).toBe('review_company');
  });

  it('AWAITING_COMPANY_CONFIRMATION → view_details', () => {
    expect(resolveCreatorPrimaryAction('AWAITING_COMPANY_CONFIRMATION')).toBe('view_details');
  });

  it('UPCOMING_WORK → view_details', () => {
    expect(resolveCreatorPrimaryAction('UPCOMING_WORK')).toBe('view_details');
  });

  it('COMPLETED → view_details', () => {
    expect(resolveCreatorPrimaryAction('COMPLETED')).toBe('view_details');
  });
});

// ─── buildCreatorCompletionConfirmation ───────────────────────────────────────

describe('buildCreatorCompletionConfirmation', () => {
  const base = {
    companyConfirmedCompletedAt: null,
    creatorConfirmedCompletedAt: null,
    contestDeadlineAt: null,
  };

  it('retorna null para ACCEPTED', () => {
    expect(
      buildCreatorCompletionConfirmation({ ...base, status: ContractRequestStatus.ACCEPTED }),
    ).toBeNull();
  });

  it('retorna null para PENDING_ACCEPTANCE', () => {
    expect(
      buildCreatorCompletionConfirmation({
        ...base,
        status: ContractRequestStatus.PENDING_ACCEPTANCE,
      }),
    ).toBeNull();
  });

  it('retorna objeto para AWAITING_COMPLETION_CONFIRMATION', () => {
    const creatorTs = new Date('2030-06-15T10:00:00.000Z');
    const deadline = new Date('2030-06-18T10:00:00.000Z');
    const result = buildCreatorCompletionConfirmation({
      status: ContractRequestStatus.AWAITING_COMPLETION_CONFIRMATION,
      companyConfirmedCompletedAt: null,
      creatorConfirmedCompletedAt: creatorTs,
      contestDeadlineAt: deadline,
    });
    expect(result).not.toBeNull();
    expect(result?.creatorConfirmed).toBe(true);
    expect(result?.companyConfirmed).toBe(false);
    expect(result?.contestDeadlineAt).toBe(deadline.toISOString());
  });

  it('retorna objeto para COMPLETION_DISPUTE', () => {
    expect(
      buildCreatorCompletionConfirmation({
        ...base,
        status: ContractRequestStatus.COMPLETION_DISPUTE,
      }),
    ).not.toBeNull();
  });

  it('retorna objeto para COMPLETED', () => {
    const companyTs = new Date('2030-06-14T08:00:00.000Z');
    const creatorTs = new Date('2030-06-14T09:00:00.000Z');
    const result = buildCreatorCompletionConfirmation({
      status: ContractRequestStatus.COMPLETED,
      companyConfirmedCompletedAt: companyTs,
      creatorConfirmedCompletedAt: creatorTs,
      contestDeadlineAt: null,
    });
    expect(result?.companyConfirmed).toBe(true);
    expect(result?.creatorConfirmed).toBe(true);
    expect(result?.contestDeadlineAt).toBeNull();
  });
});

// ─── Invariante: não-duplicação entre seções ─────────────────────────────────

describe('não-duplicação entre seções da dashboard', () => {
  it('CREATOR_CONFIRMATION_REQUIRED → apenas Ações pendentes', () => {
    const status = buildCreatorPerspectiveStatus(
      makeInput({
        status: ContractRequestStatus.AWAITING_COMPLETION_CONFIRMATION,
        creatorConfirmedCompletedAt: null,
        contestDeadlineAt: FUTURE_DEADLINE,
      }),
      NOW,
    );
    expect(status).toBe('CREATOR_CONFIRMATION_REQUIRED');
    expect(resolveCreatorPrimaryAction(status)).toBe('confirm_completion');
    // não é UPCOMING_WORK
    expect(status).not.toBe('UPCOMING_WORK');
  });

  it('AWAITING_COMPANY_CONFIRMATION → não aparece em Ações pendentes', () => {
    const status = buildCreatorPerspectiveStatus(
      makeInput({
        status: ContractRequestStatus.AWAITING_COMPLETION_CONFIRMATION,
        creatorConfirmedCompletedAt: new Date(NOW.getTime() - 30 * 60_000),
        companyConfirmedCompletedAt: null,
        contestDeadlineAt: FUTURE_DEADLINE,
      }),
      NOW,
    );
    expect(status).toBe('AWAITING_COMPANY_CONFIRMATION');
    expect(resolveCreatorPrimaryAction(status)).toBe('view_details');
    expect(buildCreatorAvailableActions(status)).not.toContain('confirm_completion');
  });

  it('UPCOMING_WORK → apenas Próximos trabalhos', () => {
    const status = buildCreatorPerspectiveStatus(makeInput(), NOW);
    expect(status).toBe('UPCOMING_WORK');
    expect(resolveCreatorPrimaryAction(status)).toBe('view_details');
    expect(buildCreatorAvailableActions(status)).not.toContain('confirm_completion');
  });

  it('REVIEW_COMPANY_REQUIRED → apenas Ações pendentes', () => {
    const status = buildCreatorPerspectiveStatus(
      makeInput({ status: ContractRequestStatus.COMPLETED, myReviewPending: true }),
      NOW,
    );
    expect(status).toBe('REVIEW_COMPANY_REQUIRED');
    expect(resolveCreatorPrimaryAction(status)).toBe('review_company');
  });
});
