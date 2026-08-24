"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { DemoProvider } from "@/components/shell/demo-context";
import { refreshIfStale } from "@/lib/sync/run";
import { registerServiceWorker } from "@/lib/sw/register";

/**
 * Client half of the tabs layout (the on-open staleness refresh + service
 * worker registration formerly lived directly in src/app/(tabs)/layout.tsx;
 * that file is now a Server Component so it can read the session server-side
 * for demo detection). Behavior here is unchanged — see the original
 * comments below.
 */
export function TabsShell({ isDemo, children }: { isDemo: boolean; children: React.ReactNode }) {
  /**
   * On-open staleness refresh (Task 9). Fires `refreshIfStale` once per app
   * mount, supabase mode only — in local mode (`NEXT_PUBLIC_REPO_MODE` unset
   * or "local", the Phase-1 default) the effect returns before even calling
   * the server action, so local mode/e2e is a hard zero-behavior-change:
   * `refreshIfStale` is never invoked, no extra network round trip, no
   * rendered pixel differs.
   *
   * Fire-and-forget (`void`, not awaited) — this is a background refresh, not
   * a data dependency for first paint; `refreshIfStale` itself swallows all
   * errors and resolves void either way (see src/lib/sync/run.ts), so there's
   * nothing here to catch.
   */
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_REPO_MODE !== "supabase") return;
    void refreshIfStale();
  }, []);

  // I6: app-shell service worker, BOTH repo modes (the SW caches the shell,
  // not data). Deliberately a separate effect from the mode-gated refresh
  // above; the registration helper itself is production-gated and
  // never throws (see src/lib/sw/register.ts).
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <DemoProvider isDemo={isDemo}>
      <AppShell>{children}</AppShell>
    </DemoProvider>
  );
}
