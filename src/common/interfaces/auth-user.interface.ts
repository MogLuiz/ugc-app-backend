/**
 * Usuário autenticado via Supabase Auth.
 * authUserId = id do usuário no Supabase Auth (sub do JWT).
 * userId = id do usuário na base de domínio (quando existir).
 */
export interface AuthUser {
  authUserId: string;
  email?: string;
  role?: string;
}
