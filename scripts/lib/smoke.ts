import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared plumbing for scripts/smoke-{whoop,strava}.ts (Task 14 — live
 * provider connectivity checks, run manually at ⚑ deploy checkpoints, never
 * in CI). Extracted here (rather than duplicated per-script) following this
 * repo's scripts/lib/ convention (see seed-rows.ts) — the two smoke scripts
 * are otherwise near-identical glue around provider-specific fetchers.
 */

const profileRowSchema = z.object({ id: z.string() });

/**
 * Resolves the sole `profiles` row's id. This app is single-tenant — gated
 * to exactly one account by `ALLOWED_EMAIL` (src/lib/auth/allowlist.ts) —
 * so there is never a "which user" argument to a smoke script; there is
 * exactly one profile once someone has signed in at least once. Throws an
 * actionable error (rather than returning null) when no profile exists yet,
 * since every caller's next step needs a userId to proceed and "nobody has
 * signed in" has one unambiguous fix.
 */
export async function requireSoleProfileId(admin: SupabaseClient): Promise<string> {
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw error;

  const rows = z.array(profileRowSchema).parse(data ?? []);
  const profile = rows[0];
  if (!profile) {
    throw new Error(
      "No profile found in the database. Sign in once via the deployed app " +
        "(creates the profiles row) before running this smoke check."
    );
  }

  return profile.id;
}

/**
 * A bag of string env values — deliberately narrower than
 * `NodeJS.ProcessEnv` (which Next.js's own type augmentation, see
 * `node_modules/next/types/global.d.ts`, makes require a `NODE_ENV` key):
 * this and every function below that takes an `env` parameter only ever
 * does `env[name]` lookups, so callers (tests especially) should be able
 * to pass any partial string-keyed object without an unrelated required
 * field getting in the way.
 */
export type EnvLike = Record<string, string | undefined>;

/** Returns the subset of `names` missing from `env` — pure, no I/O. */
export function missingEnvVars(names: readonly string[], env: EnvLike = process.env): string[] {
  return names.filter((name) => !env[name]);
}

/** Formats `missingEnvVars`'s output into a single actionable message. */
export function envErrorMessage(missing: readonly string[]): string {
  return (
    `Missing required env var(s): ${missing.join(", ")}. ` +
    "Set them (see .env.example / README's Phase 2 section) before running this script."
  );
}

/**
 * A smoke check proves live connectivity/wire-shape compatibility, not a
 * full historical backfill — unlike the cron sync (which pulls everything
 * since the last successful run), both smoke scripts scope their fetch to a
 * short recent window so a run is fast and cheap regardless of how much
 * history the connected account actually has.
 */
export const SMOKE_WINDOW_DAYS = 30;

/** `now` minus `SMOKE_WINDOW_DAYS` — pure, `now` defaults to `new Date()` but is a parameter for testability. */
export function smokeSinceDate(now: Date = new Date()): Date {
  return new Date(now.getTime() - SMOKE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Extracts a human-readable message from a caught value: an `Error`'s
 * `.message`, a Postgrest-style error object's `.message` (supabase-js
 * query failures throw/reject with plain `{message, code, details, hint}`
 * objects, NOT `Error` instances — the `err instanceof Error ? err.message
 * : String(err)` pattern used elsewhere in this codebase, e.g.
 * whoop/sync.ts's `finish`, silently degrades those to the useless string
 * "[object Object]"), or `String(err)` as a last resort. Both smoke
 * scripts route every caught error through this so a live API/DB failure
 * is always reported with its actual message, per task-14-brief.md's
 * "API error → the error message" requirement.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    return (err as { message: string }).message;
  }
  return String(err);
}

/** The shape both smoke scripts' `run*Smoke` functions resolve to — never a throw; `main()` maps it to exit 0/1. */
export type SmokeResult = { ok: boolean; message: string };

/**
 * True when the module at `moduleUrl` (pass `import.meta.url`) is the
 * process's CLI entry point — i.e. `npx tsx scripts/<that-file>.ts` — as
 * opposed to being imported by a test. The caller passes its own
 * `import.meta.url` because evaluating it here would always name THIS
 * file, never the script asking the question.
 */
export function isMainModule(moduleUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fileURLToPath(moduleUrl) === resolve(entry);
  } catch {
    return false;
  }
}
