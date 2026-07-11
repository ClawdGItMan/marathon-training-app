// @vitest-environment node
//
// Final-review fix I1, against the real local stack (migration 0004):
//  1. profiles INSERT is service-role-only — an authenticated but non-seeded
//     user (a stranger who OTP/password-registered directly against the
//     Auth API, bypassing the middleware allowlist) cannot self-insert a
//     profiles row (42501), while the seeded owner keeps select/update on
//     their own row.
//  2. Ledger T11(6): the bidirectional Whoop/Strava dedupe merge against
//     real Postgres — the merge's DELETE-first ordering exists because
//     activities.whoop_id is globally UNIQUE, which the in-memory fakes
//     don't enforce; only a real-Postgres run proves the merge can stamp a
//     whoop_id onto the surviving Strava row without tripping the
//     constraint, in BOTH trigger directions.
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, test } from "vitest";
import { dedupeStrava, dedupeWhoop, whoopSideRowSchema } from "@/lib/activities/dedupe";
import { TEST_USER_EMAIL, TEST_USER_ID, TEST_USER_PASSWORD } from "../parity/constants";
import { resetSupabaseStack } from "../parity/reset-supabase-stack";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let apiUrl: string;
let anonKey: string;
let admin: SupabaseClient;
let owner: SupabaseClient; // signed in as the seeded TEST_USER

beforeAll(async () => {
  resetSupabaseStack();

  const status = JSON.parse(execSync("npx supabase status -o json", { encoding: "utf8" }));
  apiUrl = status.API_URL;
  anonKey = status.ANON_KEY;
  admin = createClient(apiUrl, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // persistSession: false + retry loop: same rationale as
  // decide-proposal.supabase.test.ts (second client in the same process;
  // post-`db reset` containers can 502 briefly).
  owner = createClient(apiUrl, anonKey, { auth: { persistSession: false } });
  let lastError: { message: string } | null = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { error } = await owner.auth.signInWithPassword({
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

describe("0004 profiles insert lockdown", () => {
  test("an authenticated non-seeded user cannot INSERT into profiles (42501)", async () => {
    const stranger = createClient(apiUrl, anonKey, { auth: { persistSession: false } });
    const { data: signUp, error: signUpError } = await stranger.auth.signUp({
      email: `stranger-${randomUUID()}@local.dev`,
      password: "stranger-password-local",
    });
    expect(signUpError).toBeNull();
    const strangerId = signUp.user!.id;

    // Even inserting their OWN id — the exact row `profiles_own` FOR ALL
    // used to permit — must now be denied at the grant layer.
    const { data, error } = await stranger.from("profiles").insert({
      id: strangerId,
      email: "stranger@local.dev",
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");
  });

  test("the seeded owner also cannot INSERT profiles rows (INSERT is service-role-only, not owner-scoped)", async () => {
    const { error } = await owner.from("profiles").insert({
      id: randomUUID(),
      email: "second-profile@local.dev",
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");
  });

  test("the seeded owner keeps select + update on their own profiles row", async () => {
    const { data, error } = await owner.from("profiles").select("id, home_timezone").single();
    expect(error).toBeNull();
    expect(data!.id).toBe(TEST_USER_ID);

    const { error: updateError } = await owner
      .from("profiles")
      .update({ home_timezone: "America/New_York" })
      .eq("id", TEST_USER_ID);
    expect(updateError).toBeNull();
  });
});

describe("bidirectional dedupe merge against real Postgres UNIQUE (T11 ledger item 6)", () => {
  // Overlapping ~40min windows on a quiet demo date, run-equivalent sports.
  const WINDOW = {
    start: "2026-06-20T11:00:00Z",
    end: "2026-06-20T11:40:00Z",
    laterStart: "2026-06-20T11:05:00Z",
    laterEnd: "2026-06-20T11:45:00Z",
  };

  async function insertActivity(row: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { data, error } = await admin.from("activities").insert(row).select().single();
    expect(error).toBeNull();
    return data as Record<string, unknown>;
  }

  test("forward (Strava import absorbs pre-existing Whoop row): delete-first merge survives the whoop_id UNIQUE constraint", async () => {
    const whoopId = `whoop-${randomUUID()}`;
    const whoopRow = await insertActivity({
      user_id: TEST_USER_ID,
      whoop_id: whoopId,
      sport: "running",
      started_at: WINDOW.start,
      ended_at: WINDOW.end,
      strain: 12.3,
      avg_hr: 150,
      max_hr: 178,
    });
    const stravaRow = await insertActivity({
      user_id: TEST_USER_ID,
      strava_id: Math.floor(Math.random() * 1_000_000_000),
      sport: "Run",
      started_at: WINDOW.laterStart,
      ended_at: WINDOW.laterEnd,
      distance_m: 8000,
      moving_sec: 2400,
    });

    await dedupeWhoop(admin, TEST_USER_ID, {
      id: String(stravaRow.id),
      sport: "Run",
      started_at: WINDOW.laterStart,
      ended_at: WINDOW.laterEnd,
    });

    const { data: gone } = await admin.from("activities").select("id").eq("id", whoopRow.id);
    expect(gone).toEqual([]);

    const { data: merged, error } = await admin
      .from("activities")
      .select("whoop_id, strain, avg_hr, max_hr, strava_id")
      .eq("id", stravaRow.id)
      .single();
    expect(error).toBeNull();
    expect(merged!.whoop_id).toBe(whoopId);
    expect(Number(merged!.strain)).toBeCloseTo(12.3);
    expect(merged!.avg_hr).toBe(150);
    expect(merged!.strava_id).not.toBeNull();
  });

  test("reverse (new Whoop insert merges into pre-existing Strava row): same delete-first merge, same constraint", async () => {
    const stravaRow = await insertActivity({
      user_id: TEST_USER_ID,
      strava_id: Math.floor(Math.random() * 1_000_000_000),
      sport: "Run",
      started_at: WINDOW.start,
      ended_at: WINDOW.end,
      distance_m: 8000,
      moving_sec: 2400,
    });
    const whoopId = `whoop-${randomUUID()}`;
    const whoopRow = await insertActivity({
      user_id: TEST_USER_ID,
      whoop_id: whoopId,
      sport: "running",
      started_at: WINDOW.laterStart,
      ended_at: WINDOW.laterEnd,
      strain: 9.9,
      avg_hr: 142,
      max_hr: 170,
    });

    await dedupeStrava(admin, TEST_USER_ID, whoopSideRowSchema.parse(whoopRow));

    const { data: gone } = await admin.from("activities").select("id").eq("id", whoopRow.id);
    expect(gone).toEqual([]);

    const { data: merged, error } = await admin
      .from("activities")
      .select("whoop_id, strain, avg_hr")
      .eq("id", stravaRow.id)
      .single();
    expect(error).toBeNull();
    expect(merged!.whoop_id).toBe(whoopId);
    expect(Number(merged!.strain)).toBeCloseTo(9.9);
    expect(merged!.avg_hr).toBe(142);
  });
});
