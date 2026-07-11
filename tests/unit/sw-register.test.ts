// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "@/lib/sw/register";

/**
 * Final-review fix I6: the app-shell service worker's REGISTRATION helper.
 * Only the gating/wiring is unit-testable (jsdom has no real SW runtime);
 * the worker itself (public/sw.js) is verified at the ⚑ phone checkpoint —
 * see README's Phase 2 section.
 */

type FakeWindow = {
  navigator: { serviceWorker?: { register: ReturnType<typeof vi.fn> } };
  document: { readyState: string };
  addEventListener: ReturnType<typeof vi.fn>;
};

function makeWindow(overrides: {
  hasServiceWorker?: boolean;
  readyState?: string;
}): FakeWindow {
  const register = vi.fn(() => Promise.resolve());
  return {
    navigator: overrides.hasServiceWorker === false ? {} : { serviceWorker: { register } },
    document: { readyState: overrides.readyState ?? "complete" },
    addEventListener: vi.fn(),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("registerServiceWorker", () => {
  it("does nothing outside production builds (dev chunks are stable-path but mutable — cache-first would serve stale code; e2e runs `next dev`)", () => {
    vi.stubEnv("NODE_ENV", "development");
    const win = makeWindow({});

    registerServiceWorker(win as unknown as Window & typeof globalThis);

    expect(win.navigator.serviceWorker!.register).not.toHaveBeenCalled();
    expect(win.addEventListener).not.toHaveBeenCalled();
  });

  it("skips silently when navigator.serviceWorker is absent (older WebViews)", () => {
    vi.stubEnv("NODE_ENV", "production");
    const win = makeWindow({ hasServiceWorker: false });

    expect(() =>
      registerServiceWorker(win as unknown as Window & typeof globalThis)
    ).not.toThrow();
    expect(win.addEventListener).not.toHaveBeenCalled();
  });

  it("registers /sw.js immediately when the window has already loaded", () => {
    vi.stubEnv("NODE_ENV", "production");
    const win = makeWindow({ readyState: "complete" });

    registerServiceWorker(win as unknown as Window & typeof globalThis);

    expect(win.navigator.serviceWorker!.register).toHaveBeenCalledWith("/sw.js");
  });

  it("waits for the load event when the window is still loading, then registers once", () => {
    vi.stubEnv("NODE_ENV", "production");
    const win = makeWindow({ readyState: "loading" });

    registerServiceWorker(win as unknown as Window & typeof globalThis);

    expect(win.navigator.serviceWorker!.register).not.toHaveBeenCalled();
    expect(win.addEventListener).toHaveBeenCalledWith("load", expect.any(Function), {
      once: true,
    });

    const onLoad = win.addEventListener.mock.calls[0][1] as () => void;
    onLoad();
    expect(win.navigator.serviceWorker!.register).toHaveBeenCalledWith("/sw.js");
  });

  it("a rejected registration never surfaces as an unhandled rejection", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const win = makeWindow({ readyState: "complete" });
    win.navigator.serviceWorker!.register.mockReturnValue(
      Promise.reject(new Error("sw blocked"))
    );

    registerServiceWorker(win as unknown as Window & typeof globalThis);
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Reaching here without vitest flagging an unhandled rejection is the assertion.
    expect(win.navigator.serviceWorker!.register).toHaveBeenCalled();
  });
});
