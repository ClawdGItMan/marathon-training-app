// @vitest-environment jsdom
//
// See repo-parity-supabase.supabase.test.ts's file-header comment for why
// jsdom is required here (createBrowserClient's cookie-backed session
// persistence needs `document`).
//
// This file exercises the decide_proposal RPC's own contract directly
// (raw supabase-js clients + .rpc calls), independent of supabaseRepo's
// wrapper — the parity suite (repo-parity-supabase.supabase.test.ts)
// already proves supabaseRepo.decideProposal matches local-repo.ts's
// behavior end-to-end; this file proves the specific guarantees the brief
// calls out for the RPC itself: accept mutates + expires the competitor,
// dismiss mutates nothing, a decided proposal can never be re-decided, and
// a proposal belonging to another user resolves to "not found".
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { TEST_USER_EMAIL, TEST_USER_PASSWORD } from "../parity/constants";
import { resetSupabaseSeed } from "../parity/reset-supabase-seed";
import { resetSupabaseStack } from "../parity/reset-supabase-stack";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let apiUrl: string;
let anonKey: string;
let client: SupabaseClient; // signed in as the seeded TEST_USER

beforeAll(async () => {
  resetSupabaseStack();

  const status = JSON.parse(execSync("npx supabase status -o json", { encoding: "utf8" }));
  apiUrl = status.API_URL;
  anonKey = status.ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = apiUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKey;
  process.env.SUPABASE_SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY;

  // persistSession: false — this file signs in a second, throwaway user
  // (the "wrong user" test below) via a second createClient in the SAME
  // jsdom environment. Plain createClient (unlike getBrowserClient's
  // createBrowserClient) persists sessions to a storage key that's shared
  // across client instances in the same browser context; without this,
  // the second client's sign-in overwrites the first's stored session
  // (observed as "Multiple GoTrueClient instances detected" + `client`
  // silently losing its own session mid-test). Each client below still
  // keeps its own session in memory for its own lifetime, which is all a
  // single test needs.
  client = createClient(apiUrl, anonKey, { auth: { persistSession: false } });

  // See repo-parity-supabase.supabase.test.ts: post-`db reset` containers
  // can 502 for a beat before gotrue/postgrest are actually ready.
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

beforeEach(async () => {
  await resetSupabaseSeed();
});

describe("decide_proposal RPC", () => {
  // wed-400s carries two open proposals: proposal-1 (day-scope, easy swap)
  // and proposal-3 (workout-scope, 600s variant) — see src/lib/data/seed.ts.
  test("accept mutates the target session (title/provenance) and expires the competing open proposal on the same session", async () => {
    const { error } = await client.rpc("decide_proposal", {
      p_id: "proposal-1",
      p_decision: "accepted",
    });
    expect(error).toBeNull();

    const { data: session, error: sessionError } = await client
      .from("planned_sessions")
      .select("*")
      .eq("id", "wed-400s")
      .single();
    expect(sessionError).toBeNull();
    expect(session!.title).toBe("Easy");
    expect(session!.provenance).toBe("accepted-proposal");

    const { data: competitor, error: competitorError } = await client
      .from("proposals")
      .select("status")
      .eq("id", "proposal-3")
      .single();
    expect(competitorError).toBeNull();
    expect(competitor!.status).toBe("expired");
  });

  test("dismiss mutates nothing: the target session is untouched and the competitor stays open", async () => {
    const { error } = await client.rpc("decide_proposal", {
      p_id: "proposal-1",
      p_decision: "dismissed",
    });
    expect(error).toBeNull();

    const { data: session, error: sessionError } = await client
      .from("planned_sessions")
      .select("*")
      .eq("id", "wed-400s")
      .single();
    expect(sessionError).toBeNull();
    expect(session!.title).toBe("Rolling 400s");
    expect(session!.provenance).toBe("original");

    const { data: proposal1, error: p1Error } = await client
      .from("proposals")
      .select("status")
      .eq("id", "proposal-1")
      .single();
    expect(p1Error).toBeNull();
    expect(proposal1!.status).toBe("dismissed");

    const { data: competitor, error: competitorError } = await client
      .from("proposals")
      .select("status")
      .eq("id", "proposal-3")
      .single();
    expect(competitorError).toBeNull();
    expect(competitor!.status).toBe("proposed");
  });

  test("a decided (or expired) proposal can never be re-decided", async () => {
    const { error: first } = await client.rpc("decide_proposal", {
      p_id: "proposal-1",
      p_decision: "accepted",
    });
    expect(first).toBeNull();

    const { error: second } = await client.rpc("decide_proposal", {
      p_id: "proposal-1",
      p_decision: "dismissed",
    });
    expect(second).not.toBeNull();
    expect(second!.message).toMatch(/already/i);

    // proposal-3 was expired as a side effect of accepting proposal-1 above
    // — expired is also a terminal, never-re-decidable state.
    const { error: third } = await client.rpc("decide_proposal", {
      p_id: "proposal-3",
      p_decision: "accepted",
    });
    expect(third).not.toBeNull();
    expect(third!.message).toMatch(/already/i);
  });

  test("a proposal belonging to another user resolves to 'not found', never leaking existence", async () => {
    const otherEmail = `other-${randomUUID()}@local.dev`;
    const otherClient = createClient(apiUrl, anonKey, { auth: { persistSession: false } });
    const { error: signUpError } = await otherClient.auth.signUp({
      email: otherEmail,
      password: "other-password-local",
    });
    expect(signUpError).toBeNull();

    const { error } = await otherClient.rpc("decide_proposal", {
      p_id: "proposal-1",
      p_decision: "accepted",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/not found/i);

    // The failed cross-user attempt must not have touched proposal-1.
    const { data: proposal1, error: p1Error } = await client
      .from("proposals")
      .select("status")
      .eq("id", "proposal-1")
      .single();
    expect(p1Error).toBeNull();
    expect(proposal1!.status).toBe("proposed");
  });
});
