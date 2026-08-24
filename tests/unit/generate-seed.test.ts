import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEED_USER,
  generateSeedSql,
  resolveSeedUser,
} from "../../scripts/generate-supabase-seed";
import { buildReanchorUpdateSql, reanchorPlan } from "../../scripts/reanchor-plan";
import { seed } from "../../src/lib/data/seed";
import { TEST_USER_EMAIL, TEST_USER_ID } from "../parity/constants";

/**
 * C1 (final fix wave): the seed generator + reanchor UPDATE SQL are the
 * real-user bootstrap path for the deployed app — a first OTP sign-in
 * creates ONLY an auth.users row (never a profiles row; profiles INSERT is
 * service-role-only as of migration 0004), so the owner's profile + demo
 * data must be seeded against their real auth uuid by running this
 * generator with SEED_USER_ID/SEED_USER_EMAIL set. Env unset must stay
 * byte-identical to the pre-parameterization output (local stack + every
 * existing test depends on that).
 */

const CLOUD_USER_ID = "7f3d2a10-9b1c-4e5f-8a6d-123456789abc";
const CLOUD_USER_EMAIL = "owner@example.com";

describe("resolveSeedUser", () => {
  it("env unset -> the local test-stack default (auth.users insert included)", () => {
    expect(resolveSeedUser({})).toEqual(DEFAULT_SEED_USER);
    expect(DEFAULT_SEED_USER).toEqual({
      userId: TEST_USER_ID,
      userEmail: TEST_USER_EMAIL,
      createAuthUser: true,
    });
  });

  it("SEED_USER_ID + SEED_USER_EMAIL set -> cloud mode: override ids, NO auth.users insert", () => {
    expect(
      resolveSeedUser({ SEED_USER_ID: CLOUD_USER_ID, SEED_USER_EMAIL: CLOUD_USER_EMAIL })
    ).toEqual({ userId: CLOUD_USER_ID, userEmail: CLOUD_USER_EMAIL, createAuthUser: false });
  });

  it("SEED_USER_ID without SEED_USER_EMAIL -> actionable error (never silently seeds test@local.dev into a cloud profile)", () => {
    expect(() => resolveSeedUser({ SEED_USER_ID: CLOUD_USER_ID })).toThrow(/SEED_USER_EMAIL/);
  });

  it("non-uuid SEED_USER_ID -> rejected at the boundary", () => {
    expect(() =>
      resolveSeedUser({ SEED_USER_ID: "not-a-uuid", SEED_USER_EMAIL: CLOUD_USER_EMAIL })
    ).toThrow(/uuid/i);
  });

  it("non-email SEED_USER_EMAIL -> rejected at the boundary", () => {
    expect(() =>
      resolveSeedUser({ SEED_USER_ID: CLOUD_USER_ID, SEED_USER_EMAIL: "not-an-email" })
    ).toThrow();
  });
});

describe("generateSeedSql user parameterization", () => {
  it("default call === explicit DEFAULT_SEED_USER call (the parameter changed nothing for existing callers)", () => {
    expect(generateSeedSql(seed)).toBe(generateSeedSql(seed, DEFAULT_SEED_USER));
  });

  it("default output still creates the seeded auth user + identity for the local stack", () => {
    const sql = generateSeedSql(seed);
    expect(sql).toContain("insert into auth.users");
    expect(sql).toContain("insert into auth.identities");
    expect(sql).toContain(TEST_USER_ID);
    expect(sql).toContain(TEST_USER_EMAIL);
  });

  it("cloud override: skips auth.users/auth.identities entirely (the real auth user already exists)", () => {
    const sql = generateSeedSql(seed, {
      userId: CLOUD_USER_ID,
      userEmail: CLOUD_USER_EMAIL,
      createAuthUser: false,
    });
    expect(sql).not.toContain("auth.users");
    expect(sql).not.toContain("auth.identities");
  });

  it("cloud override: every row is keyed to the override uuid/email; the TEST constants appear nowhere", () => {
    const sql = generateSeedSql(seed, {
      userId: CLOUD_USER_ID,
      userEmail: CLOUD_USER_EMAIL,
      createAuthUser: false,
    });
    expect(sql).not.toContain(TEST_USER_ID);
    expect(sql).not.toContain(TEST_USER_EMAIL);
    expect(sql).toContain(`'${CLOUD_USER_ID}', '${CLOUD_USER_EMAIL}', 'America/New_York'`);
    // Same number of data INSERT statements as the default output, minus the
    // two auth.* inserts — no data section silently dropped.
    const inserts = (s: string) => s.match(/insert into /g)?.length ?? 0;
    expect(inserts(sql)).toBe(inserts(generateSeedSql(seed)) - 2);
  });
});

describe("buildReanchorUpdateSql user parameterization", () => {
  const reanchored = reanchorPlan(seed, new Date("2026-10-07T12:00:00Z"), "America/New_York");

  it("defaults to the local test user (existing behavior)", () => {
    const sql = buildReanchorUpdateSql(reanchored);
    expect(sql).toContain(`user_id = '${TEST_USER_ID}'`);
  });

  it("cloud override: every UPDATE is scoped to the override uuid; TEST_USER_ID appears nowhere", () => {
    const sql = buildReanchorUpdateSql(reanchored, CLOUD_USER_ID);
    expect(sql).not.toContain(TEST_USER_ID);
    const scoped = sql.match(/user_id = '([0-9a-f-]{36})'/g) ?? [];
    expect(scoped.length).toBeGreaterThan(0);
    for (const clause of scoped) {
      expect(clause).toBe(`user_id = '${CLOUD_USER_ID}'`);
    }
  });
});
