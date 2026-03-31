/**
 * Normalizes an email address for consistent storage and lookup.
 *
 * Applies trim + lowercase so that "User@Mail.COM " and "user@mail.com"
 * are treated as the same identity.
 *
 * Decision: We rely on application-level normalization + UNIQUE(email) constraint
 * rather than a database-level case-insensitive index (e.g. citext or LOWER(email) index).
 * This is sufficient given Supabase Auth already enforces email uniqueness case-insensitively
 * at the identity layer. If this assumption changes (e.g. direct DB writes or multi-auth-provider
 * scenarios), the next step would be to migrate the column to citext or add a
 * functional unique index on LOWER(email) to enforce the invariant at the DB level.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
