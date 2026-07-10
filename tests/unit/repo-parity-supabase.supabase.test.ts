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
import { getBrowserClient } from "@/lib/supabase/browser";
import { supabaseRepo } from "@/lib/data/supabase-repo";
import type { Repo } from "@/lib/data/repo";

/**
 * Runs the shared behavioral suite against supabaseRepo. Task 3 implements
 * READS only — every write method on supabaseRepo throws "not implemented
 * until task 4" — so this passes `{ supportsWrites: false }` to
 * runRepoParitySuite, which skips (does not delete) the write-dependent
 * describe block. Task 4 flips that back on once decideProposal et al. are
 * wired here.
 *
 * `supabase db reset` runs once per file in beforeAll (Task 1's stack, ports
 * shifted +1000 per supabase/config.toml). Reads-only this task means there
 * is nothing to clean up between tests, so `reset` below is a no-op.
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeAll(async () => {
  execSync("npx supabase db reset", { stdio: "inherit" });

  const status = JSON.parse(execSync("npx supabase status -o json", { encoding: "utf8" }));
  process.env.NEXT_PUBLIC_SUPABASE_URL = status.API_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = status.ANON_KEY;

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
  // no-op: reads-only this task, db reset already ran once per file above.
}

runRepoParitySuite(makeRepo, reset, { supportsWrites: false });
