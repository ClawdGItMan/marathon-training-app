// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Behavioral tests for src/lib/integrations/status.ts — the presence-only
 * status check the Settings CONNECTIONS row (supabase mode) uses to render
 * CONNECTED/NOT CONNECTED. Queries only the `provider` column via the admin
 * client (integration_tokens is deny-all under RLS — see
 * src/lib/supabase/admin.ts) and never decrypts or returns token contents.
 */

const { getAdminClientMock, getServerClientMock } = vi.hoisted(() => ({
  getAdminClientMock: vi.fn(),
  getServerClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: getAdminClientMock }));
vi.mock("@/lib/supabase/server", () => ({ getServerClient: getServerClientMock }));

const { getIntegrationStatus } = await import("@/lib/integrations/status");

function mockUser(user: { id: string } | null) {
  getServerClientMock.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  });
}

function mockRows(rows: { provider: string }[]) {
  const select = vi.fn(() => ({
    eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
  }));
  getAdminClientMock.mockReturnValue({ from: vi.fn(() => ({ select })) });
  return { select };
}

afterEach(() => {
  vi.clearAllMocks();
});

it("returns both flags false with no session, without querying the admin client", async () => {
  mockUser(null);

  const status = await getIntegrationStatus();

  expect(status).toEqual({ whoop: false, strava: false });
  expect(getAdminClientMock).not.toHaveBeenCalled();
});

it("returns true only for providers with a stored token row, scoped to the session user", async () => {
  mockUser({ id: "user-1" });
  const { select } = mockRows([{ provider: "whoop" }]);

  const status = await getIntegrationStatus();

  expect(status).toEqual({ whoop: true, strava: false });
  expect(select).toHaveBeenCalledWith("provider");
});

it("returns both true when both providers have rows", async () => {
  mockUser({ id: "user-1" });
  mockRows([{ provider: "whoop" }, { provider: "strava" }]);

  expect(await getIntegrationStatus()).toEqual({ whoop: true, strava: true });
});

it("never includes token contents (ciphertext/iv/tag) in the response shape", async () => {
  mockUser({ id: "user-1" });
  mockRows([{ provider: "whoop" }]);

  const status = await getIntegrationStatus();

  expect(Object.keys(status).sort()).toEqual(["strava", "whoop"]);
});
