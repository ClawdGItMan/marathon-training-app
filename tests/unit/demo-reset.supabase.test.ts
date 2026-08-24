// @vitest-environment node
import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, test } from "vitest";
import { TEST_USER_ID } from "../parity/constants";
import { resetSupabaseStack } from "../parity/reset-supabase-stack";
import { ensureDemoUser, resetDemoData } from "../../scripts/lib/demo-reset";

const DEMO_EMAIL = "demo@stack.test";
const DEMO_PASSWORD = "demo-password-stack-test";

// SupabaseClient (bare, matching profiles-lockdown.supabase.test.ts), not
// ReturnType<typeof createClient> — the latter's generic-default resolution
// collapses .insert()/.update() row types to `never` under this repo's
// tsconfig (verified via isolated repro), which the bare class type does not.
let admin: SupabaseClient;
let demoUserId: string;

beforeAll(async () => {
  resetSupabaseStack();
  const status = JSON.parse(execSync("npx supabase status -o json", { encoding: "utf8" }));
  process.env.NEXT_PUBLIC_SUPABASE_URL = status.API_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = status.ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY;
  admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY);
  demoUserId = await ensureDemoUser(admin, DEMO_EMAIL, DEMO_PASSWORD);
  await resetDemoData(admin, demoUserId, DEMO_EMAIL);
}, 120_000);

describe("demo reset (stack)", () => {
  test("ensureDemoUser is idempotent — same uuid on a second call", async () => {
    const again = await ensureDemoUser(admin, DEMO_EMAIL, DEMO_PASSWORD);
    expect(again).toBe(demoUserId);
  });

  test("seeds the full demo dataset under the demo uuid", async () => {
    const counts: Record<string, number> = {};
    for (const table of [
      "goals", "blocks", "planned_sessions", "proposals", "pain_areas",
      "recovery_snapshots", "activities", "chat_messages",
    ]) {
      const { count, error } = await admin
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("user_id", demoUserId);
      expect(error).toBeNull();
      counts[table] = count ?? 0;
    }
    expect(counts.goals).toBe(1);
    expect(counts.blocks).toBe(1);
    expect(counts.planned_sessions).toBe(7);
    expect(counts.proposals).toBe(3);
    expect(counts.pain_areas).toBe(2);
    expect(counts.recovery_snapshots).toBe(7);
    expect(counts.chat_messages).toBe(4);
    expect(counts.activities).toBeGreaterThan(0);
  });

  test("wipes demo drift and restores the seed, leaving the owner untouched", async () => {
    // Simulate visitor drift: a run log + a mutated session status.
    // run_logs has no `payload` column (0001_schema.sql) — its only NOT NULL
    // columns beyond user_id are `rpe` (check 1-10); any demo-owned row is
    // the point, not this specific shape.
    const { error: insErr } = await admin
      .from("run_logs")
      .insert({ user_id: demoUserId, rpe: 5 });
    expect(insErr).toBeNull();
    const { error: updErr } = await admin
      .from("planned_sessions")
      .update({ status: "completed" })
      .eq("user_id", demoUserId)
      .eq("id", "thu-tempo");
    expect(updErr).toBeNull();

    const { count: ownerBefore } = await admin
      .from("planned_sessions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", TEST_USER_ID);

    await resetDemoData(admin, demoUserId, DEMO_EMAIL);

    const { count: driftCount } = await admin
      .from("run_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", demoUserId);
    expect(driftCount).toBe(0);

    const { data: restored } = await admin
      .from("planned_sessions")
      .select("status")
      .eq("user_id", demoUserId)
      .eq("id", "thu-tempo")
      .single();
    expect(restored?.status).toBe("planned");

    const { count: ownerAfter } = await admin
      .from("planned_sessions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", TEST_USER_ID);
    expect(ownerAfter).toBe(ownerBefore);
  });

  test("RLS: a signed-in demo session cannot read the owner's rows", async () => {
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { error: signInError } = await anon.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    expect(signInError).toBeNull();

    const { data: ownerRows, error } = await anon
      .from("planned_sessions")
      .select("id")
      .eq("user_id", TEST_USER_ID);
    expect(error).toBeNull();          // RLS filters, it doesn't error
    expect(ownerRows).toEqual([]);     // zero owner rows visible

    const { data: demoRows } = await anon.from("planned_sessions").select("id");
    expect(demoRows?.length).toBe(7);  // sees exactly its own seeded week
  });
});
