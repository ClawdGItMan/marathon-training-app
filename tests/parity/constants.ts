/**
 * Shared identifiers for the seeded Supabase test fixture. The seed
 * generator (scripts/generate-supabase-seed.ts) and every test/task that
 * needs to authenticate as, or assert against, the seeded user import from
 * here rather than re-declaring these values.
 */

/** Deterministic auth.users id for the seeded test account. */
export const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";

/** Seeded password-auth user, created directly in supabase/seed.sql. */
export const TEST_USER_EMAIL = "test@local.dev";
export const TEST_USER_PASSWORD = "test-password-local";
