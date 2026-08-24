// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createFakeAdmin } from "../helpers/fake-admin";
import {
  envErrorMessage,
  errorMessage,
  missingEnvVars,
  requireSoleProfileId,
  smokeSinceDate,
  SMOKE_WINDOW_DAYS,
} from "../../scripts/lib/smoke";

/**
 * Behavioral tests for scripts/lib/smoke.ts (Task 14): the shared plumbing
 * scripts/smoke-whoop.ts and scripts/smoke-strava.ts both build on. Uses
 * the shared `createFakeAdmin` in-memory Supabase fake (tests/helpers) —
 * same fake, same select/order/limit chain, as the rest of the Task
 * 7-11 suites.
 */

describe("missingEnvVars", () => {
  it("returns names absent from env", () => {
    expect(missingEnvVars(["A", "B", "C"], { A: "1", C: "3" })).toEqual(["B"]);
  });

  it("treats an empty-string value as missing", () => {
    expect(missingEnvVars(["A"], { A: "" })).toEqual(["A"]);
  });

  it("returns an empty array when everything is set", () => {
    expect(missingEnvVars(["A", "B"], { A: "1", B: "2" })).toEqual([]);
  });
});

describe("envErrorMessage", () => {
  it("names every missing var and points at the fix", () => {
    const message = envErrorMessage(["WHOOP_CLIENT_ID", "WHOOP_CLIENT_SECRET"]);
    expect(message).toContain("WHOOP_CLIENT_ID");
    expect(message).toContain("WHOOP_CLIENT_SECRET");
    expect(message).toMatch(/\.env\.example|README/);
  });
});

describe("smokeSinceDate", () => {
  it("is exactly SMOKE_WINDOW_DAYS before `now`", () => {
    const now = new Date("2026-07-11T00:00:00.000Z");
    const since = smokeSinceDate(now);
    const days = (now.getTime() - since.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(SMOKE_WINDOW_DAYS);
  });
});

describe("errorMessage", () => {
  it("returns an Error instance's message", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("extracts .message from a Postgrest-style plain-object error (not an Error instance)", () => {
    // supabase-js query failures reject/throw plain objects shaped like
    // this — {message, code, details, hint} — never an Error instance.
    // `err instanceof Error ? err.message : String(err)` (the pattern used
    // elsewhere in this codebase, e.g. whoop/sync.ts's `finish`) collapses
    // these to the useless string "[object Object]"; errorMessage must not.
    const pgError = { message: "relation \"profiles\" does not exist", code: "42P01", details: null, hint: null };
    expect(errorMessage(pgError)).toBe('relation "profiles" does not exist');
  });

  it("falls back to String() for anything else", () => {
    expect(errorMessage("plain string")).toBe("plain string");
    expect(errorMessage(42)).toBe("42");
    expect(errorMessage(null)).toBe("null");
  });
});

describe("requireSoleProfileId", () => {
  it("throws an actionable error when no profile exists", async () => {
    const { client } = createFakeAdmin(["profiles"] as const);
    await expect(requireSoleProfileId(client)).rejects.toThrow(/sign in once/i);
  });

  it("resolves the sole profile's id", async () => {
    const { client, tables } = createFakeAdmin(["profiles"] as const);
    tables.profiles.seed({ id: "user-1", created_at: "2026-01-01T00:00:00.000Z" });
    await expect(requireSoleProfileId(client)).resolves.toBe("user-1");
  });

  it("picks the earliest-created row if more than one somehow exists", async () => {
    const { client, tables } = createFakeAdmin(["profiles"] as const);
    tables.profiles.seed({ id: "user-2", created_at: "2026-02-01T00:00:00.000Z" });
    tables.profiles.seed({ id: "user-1", created_at: "2026-01-01T00:00:00.000Z" });
    await expect(requireSoleProfileId(client)).resolves.toBe("user-1");
  });
});
