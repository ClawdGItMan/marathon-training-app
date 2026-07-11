// @vitest-environment node
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptToken } from "@/lib/crypto/token-cipher";
import { createFakeAdmin } from "../helpers/fake-admin";
import activityFixture from "../fixtures/strava/activity.json";

/**
 * Behavioral tests for Task 11's Strava webhook
 * (src/app/api/webhooks/strava/route.ts) and the import orchestrator it
 * calls (src/lib/integrations/strava/sync.ts's importStravaActivity).
 *
 * Mirrors whoop-sync.test.ts's approach: `@/lib/supabase/admin` is mocked
 * to a real in-memory fake (tests/helpers/fake-admin.ts, extended for
 * Task 11's multi-table needs); `@/lib/integrations/oauth` and
 * `@/lib/integrations/strava/client` run FOR REAL against that fake admin
 * + a stubbed global `fetch` — so these tests prove actual token
 * decryption and the real Strava API request shape, not just that mocked
 * functions were called.
 */

const { getAdminClientMock } = vi.hoisted(() => ({ getAdminClientMock: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: getAdminClientMock }));

const { GET: webhookGet, POST: webhookPost } = await import("@/app/api/webhooks/strava/route");
const { rowToActivity } = await import("@/lib/data/row-mappers");

const TABLES = ["profiles", "integration_tokens", "planned_sessions", "activities", "sync_runs"] as const;

function testKey(): string {
  return randomBytes(32).toString("base64");
}

const USER_ID = "user-1";
const ATHLETE_ID = 10129358;
const SUBSCRIPTION_ID = 999111;

function seedConnectedUser(tables: ReturnType<typeof createFakeAdmin<(typeof TABLES)[number]>>["tables"]) {
  tables.profiles.seed({ id: USER_ID, home_timezone: "America/New_York" });
  const encrypted = encryptToken(JSON.stringify({ access: "access-tok", refresh: "refresh-tok" }));
  tables.integration_tokens.seed({
    user_id: USER_ID,
    provider: "strava",
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    tag: encrypted.tag,
    expires_at: "2026-08-01T00:00:00.000Z",
    athlete_ref: String(ATHLETE_ID),
  });
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, statusText: "mock-status", json: async () => body };
}

function installStravaFetchMock() {
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = new URL(input.toString());
    if (url.pathname === `/api/v3/activities/${activityFixture.id}`) {
      return jsonResponse(200, activityFixture);
    }
    throw new Error(`Unhandled URL in strava-webhook test fetch mock: ${url.href}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest("https://app.example.com/api/webhooks/strava", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    object_type: "activity",
    object_id: activityFixture.id,
    aspect_type: "create",
    owner_id: ATHLETE_ID,
    subscription_id: SUBSCRIPTION_ID,
    event_time: 1783742400,
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", testKey());
  vi.stubEnv("STRAVA_WEBHOOK_VERIFY_TOKEN", "verify-me");
  vi.stubEnv("STRAVA_SUBSCRIPTION_ID", String(SUBSCRIPTION_ID));
  vi.stubEnv("STRAVA_CLIENT_ID", "client-abc");
  vi.stubEnv("STRAVA_CLIENT_SECRET", "secret-xyz");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ---- GET (subscription validation) -------------------------------------------

describe("GET /api/webhooks/strava", () => {
  it("echoes hub.challenge when hub.verify_token matches STRAVA_WEBHOOK_VERIFY_TOKEN", async () => {
    const request = new NextRequest(
      "https://app.example.com/api/webhooks/strava?hub.mode=subscribe&hub.challenge=abc123&hub.verify_token=verify-me"
    );

    const response = await webhookGet(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ "hub.challenge": "abc123" });
  });

  it("403s when hub.verify_token does not match", async () => {
    const request = new NextRequest(
      "https://app.example.com/api/webhooks/strava?hub.mode=subscribe&hub.challenge=abc123&hub.verify_token=wrong"
    );

    const response = await webhookGet(request);

    expect(response.status).toBe(403);
  });
});

// ---- POST (event delivery) ---------------------------------------------------

describe("POST /api/webhooks/strava", () => {
  it("always ACKs 200, even on a malformed body", async () => {
    const request = new NextRequest("https://app.example.com/api/webhooks/strava", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });

    const response = await webhookPost(request);
    expect(response.status).toBe(200);
  });

  it("wrong subscription_id: 200-acks, makes NO Strava fetch, and logs the mismatch to sync_runs", async () => {
    const { client: admin, tables } = createFakeAdmin(TABLES);
    getAdminClientMock.mockReturnValue(admin);
    seedConnectedUser(tables);
    const fetchMock = installStravaFetchMock();

    const response = await webhookPost(postRequest(createEvent({ subscription_id: 424242 })));

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(tables.activities.rows()).toHaveLength(0);
    expect(tables.sync_runs.rows()).toHaveLength(1);
    expect(tables.sync_runs.rows()[0]).toMatchObject({ user_id: USER_ID, source: "strava", ok: false });
  });

  it("non-activity object_type: 200-acks, no fetch, no sync_runs row", async () => {
    const { client: admin, tables } = createFakeAdmin(TABLES);
    getAdminClientMock.mockReturnValue(admin);
    seedConnectedUser(tables);
    const fetchMock = installStravaFetchMock();

    const response = await webhookPost(postRequest(createEvent({ object_type: "athlete", aspect_type: "update" })));

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(tables.sync_runs.rows()).toHaveLength(0);
  });

  it("aspect_type 'delete': 200-acks, no fetch, no import", async () => {
    const { client: admin, tables } = createFakeAdmin(TABLES);
    getAdminClientMock.mockReturnValue(admin);
    seedConnectedUser(tables);
    const fetchMock = installStravaFetchMock();

    const response = await webhookPost(postRequest(createEvent({ aspect_type: "delete" })));

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(tables.activities.rows()).toHaveLength(0);
  });

  it("create event: fetches the full activity, writes an activity row, and matches+completes the same-day planned session", async () => {
    const { client: admin, tables } = createFakeAdmin(TABLES);
    getAdminClientMock.mockReturnValue(admin);
    seedConnectedUser(tables);
    installStravaFetchMock();

    // activityFixture: 2026-07-09T11:03:51Z start (07:03 America/New_York,
    // same calendar day), distance 16093m ≈ 10.0mi.
    tables.planned_sessions.seed({
      id: "sun-long",
      user_id: USER_ID,
      date: "2026-07-09",
      title: "Long run",
      type: "long",
      detail: null,
      structure: [],
      status: "planned",
      provenance: "original",
      payload: { distanceMi: 10 },
    });

    const response = await webhookPost(postRequest(createEvent()));

    expect(response.status).toBe(200);
    expect(tables.activities.rows()).toHaveLength(1);
    const activity = tables.activities.rows()[0];
    expect(activity.strava_id).toBe(activityFixture.id);
    expect(activity.matched_session_id).toBe("sun-long");

    const session = tables.planned_sessions.rows().find((r) => r.id === "sun-long")!;
    expect(session.status).toBe("completed");

    expect(tables.sync_runs.rows()).toHaveLength(1);
    expect(tables.sync_runs.rows()[0]).toMatchObject({ user_id: USER_ID, source: "strava", ok: true, items: 1 });

    // Round-trip guard: the row this path writes must parse through the
    // app's real read mapper (Task 8's whoop-sync.test.ts precedent).
    const domain = rowToActivity(activity);
    expect(domain.title).toBe("Morning Run");
    expect(domain.distanceMi).toBeCloseTo(10.0, 1);
    expect(domain.synced).toBe(true);
  });

  it("duplicate delivery of the same event results in a single activity row (idempotent on strava_id)", async () => {
    const { client: admin, tables } = createFakeAdmin(TABLES);
    getAdminClientMock.mockReturnValue(admin);
    seedConnectedUser(tables);
    installStravaFetchMock();

    await webhookPost(postRequest(createEvent()));
    await webhookPost(postRequest(createEvent()));

    expect(tables.activities.rows()).toHaveLength(1);
    expect(tables.sync_runs.rows()).toHaveLength(2); // one logged sync_runs row per delivery
  });

  it("unresolvable athlete (no connected user): 200-acks without touching sync_runs", async () => {
    const { client: admin, tables } = createFakeAdmin(TABLES);
    getAdminClientMock.mockReturnValue(admin);
    // no seedConnectedUser call — athlete ref resolves to nothing
    const fetchMock = installStravaFetchMock();

    const response = await webhookPost(postRequest(createEvent()));

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(tables.sync_runs.rows()).toHaveLength(0);
  });

  it("a processing failure (Strava fetch error) still ACKs 200 and logs a failed sync_runs row", async () => {
    const { client: admin, tables } = createFakeAdmin(TABLES);
    getAdminClientMock.mockReturnValue(admin);
    seedConnectedUser(tables);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(500, { error: "server_error" }))
    );

    const response = await webhookPost(postRequest(createEvent()));

    expect(response.status).toBe(200);
    expect(tables.activities.rows()).toHaveLength(0);
    expect(tables.sync_runs.rows()).toHaveLength(1);
    expect(tables.sync_runs.rows()[0]).toMatchObject({ ok: false });
  });
});
