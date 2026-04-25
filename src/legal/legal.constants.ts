import { LegalTermType } from '../common/enums/legal-term-type.enum';
import { UserRole } from '../common/enums/user-role.enum';

export const CURRENT_LEGAL_TERM_VERSIONS: Record<LegalTermType, string> = {
  [LegalTermType.COMPANY_SIGNUP]: '2026-04-25',
  [LegalTermType.CREATOR_SIGNUP]: '2026-04-25',
  [LegalTermType.COMPANY_HIRING]: '2026-04-25',
};

export const SIGNUP_TERM_TYPE_BY_ROLE: Record<UserRole, LegalTermType> = {
  [UserRole.COMPANY]: LegalTermType.COMPANY_SIGNUP,
  [UserRole.CREATOR]: LegalTermType.CREATOR_SIGNUP,
};
