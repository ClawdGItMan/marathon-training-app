/**
 * App-shell service-worker registration (final-review fix I6; spec §13.4
 * cold-open). Mode-agnostic — the SW caches the shell, not data, so it
 * registers in BOTH repo modes — but gated to PRODUCTION builds: `next dev`
 * serves `/_next/static` chunks at stable paths whose contents mutate on
 * every recompile, so public/sw.js's cache-first strategy would serve stale
 * code during development, and the e2e suites run against `next dev` (the
 * gate is also what guarantees the Playwright baseline can never be
 * affected). `process.env.NODE_ENV` is inlined by Next at build time.
 *
 * `win` is a parameter (defaulting to the real window) purely for unit
 * tests — jsdom has no ServiceWorker runtime; the worker itself is verified
 * at the ⚑ phone checkpoint (see README).
 */
export function registerServiceWorker(win: Window & typeof globalThis = window): void {
  if (process.env.NODE_ENV !== "production") return;
  const nav = win.navigator;
  if (!nav || !("serviceWorker" in nav)) return;

  const register = () => {
    // A failed registration (private mode, unsupported scheme) must never
    // surface — the app works fully without the SW; it only loses cold-open.
    void nav.serviceWorker.register("/sw.js").catch(() => undefined);
  };

  if (win.document.readyState === "complete") {
    register();
  } else {
    win.addEventListener("load", register, { once: true });
  }
}
