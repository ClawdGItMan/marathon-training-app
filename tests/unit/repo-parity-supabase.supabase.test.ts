// @vitest-environment jsdom
//
// Overrides vitest.supabase.config.ts's default "node" environment for this
// file only. supabaseRepo goes through `getBrowserClient()`
// (src/lib/supabase/browser.ts), which uses @supabase/ssr's
// createBrowserClient — its auth session persistence writes through
// `document.cookie`, which only exists under jsdom (a real browser isn't
// available in this test, but jsdom's document.cookie implementation is
// enough for the client library's own storage adapter to work correctly).
// Plain "node" environment has no `document` at all, so
// signInWithPassword's session-persist step throws.
import { execSync } from "node:child_process";
import { beforeAll } from "vitest";
import { TEST_USER_EMAIL, TEST_USER_PASSWORD } from "../parity/constants";
import { runRepoParitySuite } from "../parity/repo-parity";
import { resetSupabaseSeed } from "../parity/reset-supabase-seed";
import { resetSupabaseStack } from "../parity/reset-supabase-stack";
import { getBrowserClient } from "@/lib/supabase/browser";
import { supabaseRepo } from "@/lib/data/supabase-repo";
import type { Repo } from "@/lib/data/repo";

/**
 * Runs the shared behavioral suite against supabaseRepo. Task 4 implements
 * writes (decideProposal/startSession/logPain/logRun/appendChat, backed by
 * the decide_proposal RPC + direct table mutations), so the write-dependent
 * describe block now runs for real here too — Task 3 passed
 * `{ supportsWrites: false }` since every write method threw
 * "not implemented until task 4" back then; that option is dropped now
 * (defaults to true).
 *
 * `supabase db reset` runs once per file in beforeAll (Task 1's stack, ports
 * shifted +1000 per supabase/config.toml) to get a known-clean stack. Each
 * individual test additionally runs `resetSupabaseSeed()` (see
 * tests/parity/reset-supabase-seed.ts) — a fast service-role
 * delete+reinsert of just the mutable tables — since the write block now
 * mutates rows across tests and needs per-test isolation without paying
 * `db reset`'s ~25s container-restart cost 25 times over.
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeAll(async () => {
  resetSupabaseStack();

  const status = JSON.parse(execSync("npx supabase status -o json", { encoding: "utf8" }));
  process.env.NEXT_PUBLIC_SUPABASE_URL = status.API_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = status.ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY;

  // `db reset` restarts the stack's containers as its last step; Docker
  // reports them "healthy" a beat before gotrue/postgrest are actually
  // ready to serve, so the first request or two right after a reset can
  // 502. Retry the sign-in with backoff rather than failing on that
  // transient window.
  const client = getBrowserClient();
  let lastError: { message: string } | null = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { error } = await client.auth.signInWithPassword({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    if (!error) {
      lastError = null;
      break;
    }
    lastError = error;
    await sleep(1000);
  }
  if (lastError) {
    throw new Error(`Failed to sign in as seeded test user: ${lastError.message}`);
  }
}, 120_000);

async function makeRepo(): Promise<Repo> {
  return supabaseRepo;
}

async function reset(): Promise<void> {
  await resetSupabaseSeed();
}

runRepoParitySuite(makeRepo, reset);
