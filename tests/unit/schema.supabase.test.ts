import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { TEST_USER_EMAIL, TEST_USER_PASSWORD } from "../parity/constants";

/**
 * Exercises the Task-1 migration + generated seed against a running local
 * Supabase stack. Requires `npm run db:start && npm run db:reset` first;
 * run via `npm run test:supabase` (excluded from the default `vitest run`).
 */

const TABLES = [
  "profiles",
  "goals",
  "blocks",
  "planned_sessions",
  "proposals",
  "pain_areas",
  "pain_logs",
  "recovery_snapshots",
  "activities",
  "run_logs",
  "chat_messages",
  "integration_tokens",
  "sync_runs",
] as const;

let apiUrl: string;
let anonKey: string;
let serviceRoleKey: string;

beforeAll(() => {
  const raw = execSync("npx supabase status -o json", { encoding: "utf8" });
  const status = JSON.parse(raw);
  apiUrl = status.API_URL;
  anonKey = status.ANON_KEY;
  serviceRoleKey = status.SERVICE_ROLE_KEY;
  if (!apiUrl || !anonKey || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase local status fields — is `npm run db:start` running?"
    );
  }
});

describe("schema + RLS (local Supabase stack)", () => {
  it("anonymous client never reads rows from any of the 12+ tables", async () => {
    const anon = createClient(apiUrl, anonKey);
    for (const table of TABLES) {
      const { data, error } = await anon.from(table).select("*");
      // Either table-level grant denied (42501 permission error) or RLS silently
      // returns zero rows — either way, no data ever leaks to anon.
      if (error) {
        // Permission denied or other error: data must be null
        expect(data).toBeNull();
        expect(error.code).toBeTruthy(); // error should have a code
      } else {
        // Grant allowed, RLS denied: empty result
        expect(data).toEqual([]);
      }
    }
  });

  it("service-role client sees the seeded goal named Honolulu Marathon", async () => {
    const admin = createClient(apiUrl, serviceRoleKey);
    const { data, error } = await admin
      .from("goals")
      .select("name")
      .eq("id", "goal-1")
      .single();
    expect(error).toBeNull();
    expect(data?.name).toBe("Honolulu Marathon");
  });

  it("authenticated TEST_USER reads exactly 7 planned_sessions", async () => {
    const client = createClient(apiUrl, anonKey);
    const { error: signInError } = await client.auth.signInWithPassword({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    expect(signInError).toBeNull();

    const { data, error } = await client.from("planned_sessions").select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(7);
  });

  it("integration_tokens denies authenticated users (service-role only)", async () => {
    const client = createClient(apiUrl, anonKey);
    await client.auth.signInWithPassword({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    const { data, error } = await client.from("integration_tokens").select("*");
    // integration_tokens has no grants to authenticated: either table-level denied
    // (42501) or RLS policy denies (zero rows). Either way, no token leaks.
    if (error) {
      expect(data).toBeNull();
      expect(error.code).toBeTruthy();
    } else {
      // Should not reach here with the narrowed grants, but handle gracefully
      expect(data).toEqual([]);
    }
  });
});
