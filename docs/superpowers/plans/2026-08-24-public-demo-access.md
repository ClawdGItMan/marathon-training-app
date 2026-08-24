# Public Demo Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-click VIEW DEMO on the sign-in screen signs a portfolio visitor into a real, disposable demo Supabase account (fully interactive, RLS-scoped), with a `npm run demo:reset` command that provisions/restores the demo dataset.

**Architecture:** The demo visitor becomes a genuine signed-in Supabase user via a server-side password grant with env-held credentials — no RLS changes, no new service-role paths reachable from the client. The allowlist accepts one additional email. A server-component tabs layout detects the demo session and a client context feeds a mono `DEMO` badge into `PageHeader`. Reset reuses the existing shared row-builder pattern (`scripts/lib/seed-rows.ts`) extended to all seed tables, with a profile-row cascade delete doing the wipe.

**Tech Stack:** Next.js 16 App Router (Server Actions, server/client component split), @supabase/ssr + supabase-js v2, Zod, Vitest, Playwright, tsx scripts.

**Spec:** `docs/superpowers/specs/2026-08-24-public-demo-access-design.md`

## Global Constraints

- TypeScript strict; `npx tsc --noEmit` must stay clean after every task.
- `"use server"` / `"use client"` directives always explicit on new files that need them.
- Functional components, named exports, early returns. Components under 150 lines.
- All async functions handle errors; user-facing failures use the app's calm inline mono-text idiom (see `SignInScreen`'s existing `error` span).
- Never hardcode secrets. New env vars: `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD` — server-only (NOT `NEXT_PUBLIC_*`), validated with Zod at the boundary in scripts.
- No RLS/migration changes of any kind in this plan.
- Local repo mode (`NEXT_PUBLIC_REPO_MODE` unset/`local`) must be pixel-and-behavior identical: every new surface is gated off when demo env is unset. The Phase-1 Playwright baseline (46 passed / 1 skipped, run as `PLAYWRIGHT_TEST=1 npx playwright test`) must not change.
- Unit suite baseline: 399 passing (`npx vitest run`) — grows, never shrinks.
- Stack-backed suites (`npm run test:supabase`) require the local Supabase stack (`npx supabase start`) and are serial/slow by design.
- Conventional commits, message explains WHY. Current branch: `feature/public-demo`.
- Lime (`bg-sig`) is strictly for CTAs/signal — the DEMO badge is NOT lime.

---

### Task 1: Allowlist accepts the demo email + `isDemoEmail` helper

**Files:**
- Modify: `src/lib/auth/allowlist.ts`
- Test: `tests/unit/auth.test.tsx` (extend existing `isAllowedEmail` describe; add `isDemoEmail` describe)

**Interfaces:**
- Produces: `isAllowedEmail(email: string): boolean` (existing signature, now also true for `DEMO_USER_EMAIL`); `isDemoEmail(email: string): boolean` (new export, same file). Both server-only by the same convention documented in the file's header comment.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/auth.test.tsx`, inside the existing `describe("isAllowedEmail", ...)` block (which already stubs `ALLOWED_EMAIL` in its `beforeEach`):

```tsx
  test("accepts the demo email when DEMO_USER_EMAIL is set", () => {
    vi.stubEnv("DEMO_USER_EMAIL", "demo@marathon.invalid");
    expect(isAllowedEmail("  Demo@Marathon.INVALID ")).toBe(true);
  });

  test("rejects the demo email when DEMO_USER_EMAIL is unset", () => {
    vi.stubEnv("DEMO_USER_EMAIL", "");
    expect(isAllowedEmail("demo@marathon.invalid")).toBe(false);
  });
```

And a new top-level describe (import `isDemoEmail` alongside `isAllowedEmail` from `@/lib/auth/allowlist`):

```tsx
describe("isDemoEmail", () => {
  test("matches DEMO_USER_EMAIL case-insensitively, trimmed", () => {
    vi.stubEnv("DEMO_USER_EMAIL", "demo@marathon.invalid");
    expect(isDemoEmail("  Demo@Marathon.INVALID ")).toBe(true);
  });

  test("never matches the owner email", () => {
    vi.stubEnv("DEMO_USER_EMAIL", "demo@marathon.invalid");
    expect(isDemoEmail("max.allaire@gmail.com")).toBe(false);
  });

  test("matches nothing when DEMO_USER_EMAIL is unset", () => {
    vi.stubEnv("DEMO_USER_EMAIL", "");
    expect(isDemoEmail("demo@marathon.invalid")).toBe(false);
    expect(isDemoEmail("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run tests/unit/auth.test.tsx`
Expected: FAIL — `isDemoEmail` is not exported; demo-email acceptance test fails.

- [ ] **Step 3: Implement**

Replace the body of `src/lib/auth/allowlist.ts` (keep the existing header comment, extend it):

```ts
/**
 * Single-email allowlist gate, plus the demo account. `ALLOWED_EMAIL` and
 * `DEMO_USER_EMAIL` are plain (non-`NEXT_PUBLIC_`) server env vars, so these
 * functions must only ever run server-side (middleware, Server Actions) —
 * never imported directly into a client component. The sign-in screen's
 * client-side pre-check goes through the `checkAllowedEmail` Server Action
 * defined in `src/app/sign-in/page.tsx`, which calls this on the server and
 * returns only a boolean, so neither address is ever bundled into client JS.
 *
 * `DEMO_USER_EMAIL` unset ⇒ `isDemoEmail` matches nothing and the allowlist
 * behaves exactly as before (owner-only) — the demo feature is opt-in per
 * environment (see docs/superpowers/specs/2026-08-24-public-demo-access-design.md).
 */

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

export function isDemoEmail(email: string): boolean {
  const demo = process.env.DEMO_USER_EMAIL;
  if (!demo || !email) return false;
  return normalize(email) === normalize(demo);
}

export function isAllowedEmail(email: string): boolean {
  const allowed = process.env.ALLOWED_EMAIL;
  if (allowed && normalize(email) === normalize(allowed)) return true;
  return isDemoEmail(email);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/auth.test.tsx`
Expected: PASS (all existing + 5 new).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` — expected clean.

```bash
git add src/lib/auth/allowlist.ts tests/unit/auth.test.tsx
git commit -m "feat: allowlist accepts the demo account email

DEMO_USER_EMAIL unset keeps owner-only behavior byte-identical, so
non-demo deploys and CI are unaffected."
```

---

### Task 2: `signInAsDemo` Server Action + VIEW DEMO button

**Files:**
- Modify: `src/app/sign-in/page.tsx`
- Modify: `src/components/auth/SignInScreen.tsx`
- Test: `tests/unit/auth.test.tsx` (extend the `SignInScreen` describe)

**Interfaces:**
- Consumes: `isDemoEmail` is NOT needed here; only env presence.
- Produces: `SignInScreen` props grow to `{ checkAllowedEmail, demoEnabled?: boolean, signInAsDemo?: () => Promise<{ error: string } | void> }`. `demoEnabled` defaults to `false` and `signInAsDemo` to `undefined`, so all existing call sites/tests compile and behave unchanged. On success `signInAsDemo` never resolves normally — it `redirect()`s (Next throws internally and navigates).

- [ ] **Step 1: Write the failing tests**

Add to the existing `describe("SignInScreen", ...)` in `tests/unit/auth.test.tsx`:

```tsx
  test("no VIEW DEMO button when demo is not enabled", () => {
    render(<SignInScreen checkAllowedEmail={vi.fn().mockResolvedValue(true)} />);
    expect(screen.queryByRole("button", { name: "VIEW DEMO" })).not.toBeInTheDocument();
  });

  test("VIEW DEMO button calls signInAsDemo when enabled", async () => {
    const signInAsDemo = vi.fn().mockResolvedValue(undefined);
    render(
      <SignInScreen
        checkAllowedEmail={vi.fn().mockResolvedValue(true)}
        demoEnabled
        signInAsDemo={signInAsDemo}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "VIEW DEMO" }));
    await waitFor(() => expect(signInAsDemo).toHaveBeenCalledTimes(1));
  });

  test("VIEW DEMO shows the action's error inline on failure", async () => {
    const signInAsDemo = vi.fn().mockResolvedValue({ error: "DEMO SIGN-IN FAILED — TRY AGAIN" });
    render(
      <SignInScreen
        checkAllowedEmail={vi.fn().mockResolvedValue(true)}
        demoEnabled
        signInAsDemo={signInAsDemo}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "VIEW DEMO" }));
    expect(await screen.findByText("DEMO SIGN-IN FAILED — TRY AGAIN")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/auth.test.tsx`
Expected: FAIL — no VIEW DEMO button exists yet (2nd and 3rd tests; 1st passes vacuously, that's fine — it pins the absence contract).

- [ ] **Step 3: Implement the Server Action and page wiring**

Replace `src/app/sign-in/page.tsx` with:

```tsx
import { redirect } from "next/navigation";
import { isAllowedEmail } from "@/lib/auth/allowlist";
import { getServerClient } from "@/lib/supabase/server";
import { SignInScreen } from "@/components/auth/SignInScreen";

/**
 * Server Action wrapping `isAllowedEmail`. `ALLOWED_EMAIL` is a server-only
 * env var (not `NEXT_PUBLIC_*`), so the client-side pre-check in
 * `SignInScreen` calls through this action rather than importing the
 * allowlist module directly — the allowed address itself never ships to
 * the client bundle, only the boolean result.
 */
async function checkAllowedEmail(email: string): Promise<boolean> {
  "use server";
  return isAllowedEmail(email);
}

/**
 * One-click demo sign-in (public portfolio path — see
 * docs/superpowers/specs/2026-08-24-public-demo-access-design.md).
 * Credentials are fixed server-side env values; no client input reaches
 * this grant, so the action can only ever sign into the demo account.
 * Success redirects (never returns); failure returns the calm inline
 * error shape SignInScreen already renders.
 */
async function signInAsDemo(): Promise<{ error: string } | void> {
  "use server";
  const email = process.env.DEMO_USER_EMAIL;
  const password = process.env.DEMO_USER_PASSWORD;
  if (!email || !password) {
    return { error: "DEMO SIGN-IN FAILED — TRY AGAIN" };
  }
  try {
    const supabase = await getServerClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: "DEMO SIGN-IN FAILED — TRY AGAIN" };
  } catch {
    return { error: "DEMO SIGN-IN FAILED — TRY AGAIN" };
  }
  redirect("/today");
}

export default function SignInPage() {
  const demoEnabled = Boolean(process.env.DEMO_USER_EMAIL && process.env.DEMO_USER_PASSWORD);
  return (
    <SignInScreen
      checkAllowedEmail={checkAllowedEmail}
      demoEnabled={demoEnabled}
      signInAsDemo={demoEnabled ? signInAsDemo : undefined}
    />
  );
}
```

Note the `redirect()` call sits OUTSIDE the try/catch — Next.js implements it by throwing an internal control-flow error, and catching it would swallow the navigation.

- [ ] **Step 4: Implement the button in `SignInScreen`**

In `src/components/auth/SignInScreen.tsx`:

1. Extend the props:

```tsx
export function SignInScreen({
  checkAllowedEmail,
  demoEnabled = false,
  signInAsDemo,
}: {
  checkAllowedEmail: (email: string) => Promise<boolean>;
  demoEnabled?: boolean;
  signInAsDemo?: () => Promise<{ error: string } | void>;
}) {
```

2. Add the handler next to `handleSendCode`/`handleVerify`. Note the digest check: `next/navigation`'s `redirect()` surfaces as a thrown control-flow error whose `digest` starts with `NEXT_REDIRECT` — that is SUCCESS (navigation), and must never render as a failure message:

```tsx
  async function handleDemo() {
    if (!signInAsDemo) return;
    setError(null);
    setPending(true);
    try {
      const result = await signInAsDemo();
      if (result?.error) setError(result.error);
    } catch (err) {
      // next/navigation redirect() throws a control-flow error with a
      // NEXT_REDIRECT digest — that's success (navigation), not failure.
      if (err instanceof Error && "digest" in err && String((err as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")) {
        return;
      }
      setError("DEMO SIGN-IN FAILED — TRY AGAIN");
    } finally {
      setPending(false);
    }
  }
```

3. Render the button in the email step only (after the SEND CODE button, inside the `step === "email"` branch). Ghost/hairline style — deliberately NOT lime (lime is CTA-only per the file's own header comment):

```tsx
          {demoEnabled ? (
            <button
              onClick={handleDemo}
              disabled={pending}
              className="mt-[10px] h-[50px] w-full rounded-[2px] border border-[#2a2d31] font-display text-[13px] font-semibold uppercase tracking-[.06em] text-ink-2 disabled:opacity-50"
            >
              VIEW DEMO
            </button>
          ) : null}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/auth.test.tsx`
Expected: PASS (all, including the 4 pre-existing SignInScreen tests untouched).

- [ ] **Step 6: Full unit suite + type-check + build**

Run: `npx vitest run` — expected: 399 + new all pass.
Run: `npx tsc --noEmit` — expected clean.
Run: `npm run build` — expected clean (confirms the Server Action compiles in the real RSC boundary).

- [ ] **Step 7: Commit**

```bash
git add src/app/sign-in/page.tsx src/components/auth/SignInScreen.tsx tests/unit/auth.test.tsx
git commit -m "feat: one-click VIEW DEMO sign-in on the sign-in screen

Server-side password grant with env-held credentials — no client input
reaches the grant, so the action can only sign into the demo account.
Button renders only when DEMO_USER_EMAIL/PASSWORD are configured, keeping
unconfigured environments (CI, local mode) pixel-identical."
```

---

### Task 3: Server-detected DEMO badge in the app header

**Files:**
- Modify: `src/app/(tabs)/layout.tsx` (becomes a Server Component)
- Create: `src/components/shell/TabsShell.tsx` (takes over the current client logic)
- Create: `src/components/shell/demo-context.tsx`
- Create: `src/components/shell/DemoBadge.tsx`
- Modify: `src/components/shell/PageHeader.tsx`
- Test: `tests/unit/demo-badge.test.tsx` (create)

**Interfaces:**
- Consumes: `isDemoEmail(email: string): boolean` from Task 1; `getServerClient()` from `src/lib/supabase/server.ts`.
- Produces: `TabsShell({ isDemo, children })` client component; `DemoProvider({ isDemo, children })` + `useIsDemo(): boolean` from `demo-context.tsx`; `DemoBadge()` renders `null` unless in a `DemoProvider` with `isDemo=true`. `PageHeader` renders `<DemoBadge />` in its right-hand row — screens need no changes.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/demo-badge.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { DemoProvider } from "@/components/shell/demo-context";
import { DemoBadge } from "@/components/shell/DemoBadge";
import { PageHeader } from "@/components/shell/PageHeader";

afterEach(cleanup);

describe("DemoBadge", () => {
  test("renders the mono DEMO label inside a demo session", () => {
    render(
      <DemoProvider isDemo>
        <DemoBadge />
      </DemoProvider>,
    );
    expect(screen.getByText("DEMO")).toBeInTheDocument();
  });

  test("renders nothing outside a demo session", () => {
    render(
      <DemoProvider isDemo={false}>
        <DemoBadge />
      </DemoProvider>,
    );
    expect(screen.queryByText("DEMO")).not.toBeInTheDocument();
  });

  test("renders nothing with no provider at all (local mode)", () => {
    render(<DemoBadge />);
    expect(screen.queryByText("DEMO")).not.toBeInTheDocument();
  });
});

describe("PageHeader demo slot", () => {
  test("shows DEMO next to the ASK COACH chip in a demo session", () => {
    render(
      <DemoProvider isDemo>
        <PageHeader title="Today" from="today" />
      </DemoProvider>,
    );
    expect(screen.getByText("DEMO")).toBeInTheDocument();
    expect(screen.getByLabelText("ASK COACH")).toBeInTheDocument();
  });

  test("is unchanged outside demo", () => {
    render(<PageHeader title="Today" from="today" />);
    expect(screen.queryByText("DEMO")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/demo-badge.test.tsx`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Implement context + badge**

Create `src/components/shell/demo-context.tsx`:

```tsx
"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Client-side carrier for the server-detected "this session is the demo
 * account" flag (src/app/(tabs)/layout.tsx). Default false ⇒ every surface
 * outside the provider (local mode, sign-in, tests) renders exactly as
 * before — DemoBadge consumers need no gating of their own.
 */
const DemoContext = createContext(false);

export function DemoProvider({ isDemo, children }: { isDemo: boolean; children: ReactNode }) {
  return <DemoContext.Provider value={isDemo}>{children}</DemoContext.Provider>;
}

export function useIsDemo(): boolean {
  return useContext(DemoContext);
}
```

Create `src/components/shell/DemoBadge.tsx` (mono micro-label idiom — hairline border, ink text, no lime):

```tsx
"use client";

import { useIsDemo } from "@/components/shell/demo-context";

export function DemoBadge() {
  const isDemo = useIsDemo();
  if (!isDemo) return null;
  return (
    <span className="rounded-[2px] border border-[#2a2d31] px-[8px] py-[5px] font-mono text-[9px] tracking-[.14em] text-ink-7">
      DEMO
    </span>
  );
}
```

- [ ] **Step 4: Implement the layout split**

Create `src/components/shell/TabsShell.tsx` — move the ENTIRE current body of `src/app/(tabs)/layout.tsx` here (both effects and the AppShell wrap, comments included), renamed and wrapped in the provider:

```tsx
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
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_REPO_MODE !== "supabase") return;
    void refreshIfStale();
  }, []);

  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <DemoProvider isDemo={isDemo}>
      <AppShell>{children}</AppShell>
    </DemoProvider>
  );
}
```

(Carry over the original file's two long explanatory comments onto the two effects verbatim — they document non-obvious gating decisions.)

Replace `src/app/(tabs)/layout.tsx` with:

```tsx
import { isDemoEmail } from "@/lib/auth/allowlist";
import { getServerClient } from "@/lib/supabase/server";
import { TabsShell } from "@/components/shell/TabsShell";

/**
 * Server Component so the demo badge can be detected from the session
 * server-side (the demo email env var must never reach the client bundle —
 * only this boolean does). Local mode short-circuits before touching
 * Supabase at all: no env, no client, zero behavior change for the Phase-1
 * e2e baseline.
 */
export default async function TabsLayout({ children }: { children: React.ReactNode }) {
  let isDemo = false;
  if (process.env.NEXT_PUBLIC_REPO_MODE === "supabase") {
    try {
      const supabase = await getServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      isDemo = isDemoEmail(user?.email ?? "");
    } catch {
      // Session lookup failing must never take down the shell — a non-demo
      // render is the safe fallback.
      isDemo = false;
    }
  }
  return <TabsShell isDemo={isDemo}>{children}</TabsShell>;
}
```

- [ ] **Step 5: Wire the badge into `PageHeader`**

In `src/components/shell/PageHeader.tsx`, add the import and render it first in the right-hand flex row:

```tsx
import { DemoBadge } from "@/components/shell/DemoBadge";
```

```tsx
      <div className="flex items-center gap-[14px]">
        <DemoBadge />
        {right}
        <AskCoachChip from={from} />
      </div>
```

(`PageHeader` has no directive; embedding the client `DemoBadge` is valid from both server and client importers.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/unit/demo-badge.test.tsx`
Expected: PASS (5/5).

- [ ] **Step 7: Full verification — the layout split must not disturb anything**

Run: `npx vitest run` — expected: all pass (screens' tests render PageHeader; badge defaults to hidden).
Run: `npx tsc --noEmit` — expected clean.
Run: `npm run build` — expected clean.
Run: `PLAYWRIGHT_TEST=1 npx playwright test` — expected: exact Phase-1 baseline (46 passed / 1 skipped). This is the critical gate for converting the tabs layout to a Server Component.

- [ ] **Step 8: Commit**

```bash
git add src/app/(tabs)/layout.tsx src/components/shell/TabsShell.tsx src/components/shell/demo-context.tsx src/components/shell/DemoBadge.tsx src/components/shell/PageHeader.tsx tests/unit/demo-badge.test.tsx
git commit -m "feat: server-detected DEMO badge in the app header

Tabs layout becomes a Server Component (session read stays server-side so
DEMO_USER_EMAIL never reaches the client); its client effects move intact
to TabsShell. Badge defaults hidden — local mode and owner sessions are
pixel-identical."
```

---

### Task 4: Shared row builders for the four generator-only tables

**Files:**
- Modify: `scripts/lib/seed-rows.ts` (add `toGoalRow`, `toBlockRow`, `toRecoverySnapshotRow`, `toActivityRow`)
- Modify: `scripts/generate-supabase-seed.ts` (goal/block/recovery/activities sections consume the builders)
- Modify: `supabase/seed.sql` (regenerated — activities `ended_at` becomes a literal timestamp instead of a `make_interval` expression, same instant)
- Test: `tests/unit/generate-seed.test.ts` (update the locked expectations for the `ended_at` change only)

**Interfaces:**
- Consumes: `Seed` from `src/lib/domain/schemas`, seed field shapes visible in `scripts/generate-supabase-seed.ts` today (`seed.goal.{name,date,goalSec,predictedSec,daysOut,streak}`, `seed.block.{longRunLabel,phase,week,totalWeeks,number,weekMilesDone,weekMilesTarget}`, `seed.periodization`, `seed.recovery[].{date,recoveryPct,hrv,rhr,load,sleep,respRate,recoveryDelta,hrvDeltaPct,rhrDelta,loadLabel}`, `seed.activities[].{id,title,synced,date,timeSec,distanceMi,paceSecPerMi}`).
- Produces (exact signatures Task 5 imports):

```ts
export function toGoalRow(goal: Seed["goal"], userId: string): GoalRow;            // { id: "goal-1", user_id, name, date, target_seconds, payload: { predictedSec, daysOut, streak } }
export function toBlockRow(block: Seed["block"], periodization: Seed["periodization"], userId: string): BlockRow;
  // { id: "block-1", user_id, label: block.longRunLabel, phase, week, total_weeks, periodization, payload: { number, weekMilesDone, weekMilesTarget } }
export function toRecoverySnapshotRow(snapshot: Seed["recovery"][number], userId: string): RecoverySnapshotRow;
  // { user_id, day: snapshot.date, recovery_pct, hrv_ms, rhr, day_strain, sleep: { ...snapshot.sleep, respRate }, source: "whoop", payload: { recoveryDelta, hrvDeltaPct, rhrDelta, loadLabel } }
export function toActivityRow(activity: Seed["activities"][number], userId: string): ActivityRow;
  // { user_id, sport: "run", started_at: `${date}T00:00:00Z`, ended_at: ISO of started_at + timeSec seconds, distance_m: distanceMi * 1609.344, moving_sec: timeSec, avg_pace_sec_per_mi: paceSecPerMi, payload: { id, title, synced } }
```

Each with a matching exported `interface GoalRow { ... }` etc., following the existing `PlannedSessionRow` pattern in the same file. `toActivityRow` computes `ended_at` as `new Date(Date.parse(started_at) + activity.timeSec * 1000).toISOString()`.

- [ ] **Step 1: Read the two files fully first**

Read `scripts/lib/seed-rows.ts` and `scripts/generate-supabase-seed.ts` end to end. The four new builders must produce EXACTLY the values the generator's inline SQL sections encode today (listed in Interfaces above) — the generator is the source of truth; copy its mappings, don't invent.

- [ ] **Step 2: Write the failing test additions**

`tests/unit/generate-seed.test.ts` currently locks the generator's output. Read it first. Add builder-level tests to it (or alongside its existing structure):

```ts
import { toActivityRow, toBlockRow, toGoalRow, toRecoverySnapshotRow } from "../../scripts/lib/seed-rows";
import { seed } from "@/lib/data/seed";

describe("generator-only row builders", () => {
  const uid = "00000000-0000-0000-0000-000000000001";

  test("toGoalRow mirrors the generator's goals mapping", () => {
    const row = toGoalRow(seed.goal, uid);
    expect(row).toEqual({
      id: "goal-1",
      user_id: uid,
      name: seed.goal.name,
      date: seed.goal.date,
      target_seconds: seed.goal.goalSec,
      payload: {
        predictedSec: seed.goal.predictedSec,
        daysOut: seed.goal.daysOut,
        streak: seed.goal.streak,
      },
    });
  });

  test("toBlockRow mirrors the generator's blocks mapping", () => {
    const row = toBlockRow(seed.block, seed.periodization, uid);
    expect(row.label).toBe(seed.block.longRunLabel);
    expect(row.periodization).toEqual(seed.periodization);
    expect(row.payload).toEqual({
      number: seed.block.number,
      weekMilesDone: seed.block.weekMilesDone,
      weekMilesTarget: seed.block.weekMilesTarget,
    });
  });

  test("toRecoverySnapshotRow folds respRate into sleep and deltas into payload", () => {
    const snapshot = seed.recovery[seed.recovery.length - 1];
    const row = toRecoverySnapshotRow(snapshot, uid);
    expect(row.day).toBe(snapshot.date);
    expect(row.source).toBe("whoop");
    expect(row.sleep).toEqual({ ...snapshot.sleep, respRate: snapshot.respRate });
    expect(row.payload).toEqual({
      recoveryDelta: snapshot.recoveryDelta,
      hrvDeltaPct: snapshot.hrvDeltaPct,
      rhrDelta: snapshot.rhrDelta,
      loadLabel: snapshot.loadLabel,
    });
  });

  test("toActivityRow computes ended_at = started_at + timeSec", () => {
    const activity = seed.activities[0];
    const row = toActivityRow(activity, uid);
    expect(row.started_at).toBe(`${activity.date}T00:00:00Z`);
    expect(Date.parse(row.ended_at) - Date.parse(row.started_at)).toBe(activity.timeSec * 1000);
    expect(row.distance_m).toBeCloseTo(activity.distanceMi * 1609.344);
    expect(row.payload).toEqual({ id: activity.id, title: activity.title, synced: activity.synced });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/generate-seed.test.ts`
Expected: FAIL — builders not exported.

- [ ] **Step 4: Implement the builders, then refactor the generator to consume them**

Add the four interfaces + builders to `scripts/lib/seed-rows.ts` (update its header comment: these four tables now DO have a second call site — `scripts/lib/demo-reset.ts`, Task 5). Then in `scripts/generate-supabase-seed.ts`, rewrite the goals/blocks/recovery_snapshots/activities sections to `const row = toXRow(...)` + SQL-literal formatting of `row` fields — exactly the pattern its planned_sessions/proposals sections already use. For activities, `ended_at` becomes `sqlStr(row.ended_at)` with a `::timestamptz` cast — i.e. `` `${sqlStr(row.ended_at)}::timestamptz` `` — replacing the `make_interval` expression (same instant, now literal).

- [ ] **Step 5: Regenerate the seed + update locked expectations**

Run: `npm run db:seed:gen` — regenerates `supabase/seed.sql`. Diff it: the ONLY change must be the activities `ended_at` values (expression → literal). If anything else changed, the refactor drifted — fix before proceeding.
Run: `npx vitest run tests/unit/generate-seed.test.ts` — update whatever locked expectation covers the activities SQL to the new literal form, then expected: PASS.

- [ ] **Step 6: Full unit suite + stack spot-check**

Run: `npx vitest run` — expected all pass.
Run: `npx tsc --noEmit` — expected clean.
If the local Supabase stack is available (`npx supabase start`, requires Docker): `npm run db:reset` — expected: seed loads cleanly with the literal timestamps. If Docker isn't running, note it and defer to Task 6's full stack run.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/seed-rows.ts scripts/generate-supabase-seed.ts supabase/seed.sql tests/unit/generate-seed.test.ts
git commit -m "refactor: shared row builders for goals/blocks/recovery/activities

These four tables were generator-only, so they had no shared builders;
the demo reset (next commit) is a second call site, which is exactly the
drift condition seed-rows.ts exists to prevent. Activities ended_at
becomes a literal timestamp (same instant as the old make_interval
expression) so a JS call site can produce identical rows."
```

---

### Task 5: Demo reset library + `npm run demo:reset` CLI

**Files:**
- Create: `scripts/lib/demo-reset.ts`
- Create: `scripts/reset-demo.ts`
- Modify: `package.json` (add script `"demo:reset": "tsx scripts/reset-demo.ts"`)
- Modify: `.env.example` (demo block)
- Test: `tests/unit/demo-reset.supabase.test.ts` (create — stack-backed)

**Interfaces:**
- Consumes: all eight builders from `scripts/lib/seed-rows.ts`; `seed` from `src/lib/data/seed`; `SupabaseClient` from `@supabase/supabase-js`.
- Produces:

```ts
// scripts/lib/demo-reset.ts
export async function ensureDemoUser(admin: SupabaseClient, email: string, password: string): Promise<string>; // auth uuid
export async function resetDemoData(admin: SupabaseClient, userId: string, email: string): Promise<void>;
```

- [ ] **Step 1: Write the failing stack-backed test**

Create `tests/unit/demo-reset.supabase.test.ts`. Mirror the harness conventions of `tests/unit/profiles-lockdown.supabase.test.ts` / `repo-parity-supabase.supabase.test.ts` — read one of them first and copy its `beforeAll` exactly: `resetSupabaseStack()` then `npx supabase status -o json` into `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` env. Then:

```ts
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, test } from "vitest";
import { TEST_USER_ID } from "../parity/constants";
import { resetSupabaseStack } from "../parity/reset-supabase-stack";
import { ensureDemoUser, resetDemoData } from "../../scripts/lib/demo-reset";

const DEMO_EMAIL = "demo@stack.test";
const DEMO_PASSWORD = "demo-password-stack-test";

let admin: ReturnType<typeof createClient>;
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
    const { error: insErr } = await admin
      .from("run_logs")
      .insert({ user_id: demoUserId, payload: { note: "drift" } });
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
```

(If `run_logs.payload` insert errors on a missing required column, read `supabase/migrations/0001_schema.sql`'s `run_logs` DDL and adjust the drift-insert to its actual required columns — the point is any demo-owned row, not that specific shape.)

- [ ] **Step 2: Run it to verify it fails**

Requires Docker + local stack: `npx supabase start`, then
Run: `npx vitest run --config vitest.supabase.config.ts tests/unit/demo-reset.supabase.test.ts`
Expected: FAIL — `scripts/lib/demo-reset` doesn't exist.

- [ ] **Step 3: Implement `scripts/lib/demo-reset.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { seed } from "../../src/lib/data/seed";
import {
  toActivityRow,
  toBlockRow,
  toChatMessageRow,
  toGoalRow,
  toPainAreaRow,
  toPlannedSessionRow,
  toProposalRow,
  toRecoverySnapshotRow,
} from "./seed-rows";

/**
 * Demo-account provisioning + reset (spec:
 * docs/superpowers/specs/2026-08-24-public-demo-access-design.md).
 *
 * Service-role only — callers hold an admin client. Node-side only
 * (scripts + stack tests), same placement rationale as seed-rows.ts.
 */

/**
 * Find-or-create the demo auth user and sync its password to the env value
 * (so rotating DEMO_USER_PASSWORD is just: change env, re-run demo:reset).
 * Returns the auth uuid.
 */
export async function ensureDemoUser(
  admin: SupabaseClient,
  email: string,
  password: string,
): Promise<string> {
  const target = email.trim().toLowerCase();
  // Single-tenant + demo: user count is tiny, one page is plenty.
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw new Error(`ensureDemoUser: listUsers failed: ${listError.message}`);

  const existing = listed.users.find((u) => (u.email ?? "").toLowerCase() === target);
  if (existing) {
    const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, { password });
    if (updateError) {
      throw new Error(`ensureDemoUser: password sync failed: ${updateError.message}`);
    }
    return existing.id;
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: target,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw new Error(`ensureDemoUser: createUser failed: ${createError?.message ?? "no user"}`);
  }
  return created.user.id;
}

/**
 * Wipe-and-reseed the demo account's data. Every business table FKs to
 * profiles(id) ON DELETE CASCADE (0001_schema.sql), so deleting the one
 * profiles row clears ALL demo rows — including any table a hostile
 * visitor wrote to directly via PostgREST — in one statement, no FK-order
 * bookkeeping to go stale when a table is added.
 */
export async function resetDemoData(
  admin: SupabaseClient,
  userId: string,
  email: string,
): Promise<void> {
  const { error: wipeError } = await admin.from("profiles").delete().eq("id", userId);
  if (wipeError) throw new Error(`resetDemoData: profile wipe failed: ${wipeError.message}`);

  const inserts: Array<[string, unknown[]]> = [
    ["profiles", [{ id: userId, email, home_timezone: "America/New_York" }]],
    ["goals", [toGoalRow(seed.goal, userId)]],
    ["blocks", [toBlockRow(seed.block, seed.periodization, userId)]],
    ["planned_sessions", seed.week.map((s) => toPlannedSessionRow(s, userId))],
    ["proposals", seed.proposals.map((p) => toProposalRow(p, userId))],
    ["pain_areas", seed.pains.map((p) => toPainAreaRow(p, userId))],
    ["recovery_snapshots", seed.recovery.map((r) => toRecoverySnapshotRow(r, userId))],
    ["activities", seed.activities.map((a) => toActivityRow(a, userId))],
    ["chat_messages", seed.coachThread.map((m, i) => toChatMessageRow(m, i, userId))],
  ];

  for (const [table, rows] of inserts) {
    const { error } = await admin.from(table).insert(rows);
    if (error) throw new Error(`resetDemoData: ${table} insert failed: ${error.message}`);
  }
}
```

- [ ] **Step 4: Run the stack test to verify it passes**

Run: `npx vitest run --config vitest.supabase.config.ts tests/unit/demo-reset.supabase.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Implement the CLI**

Create `scripts/reset-demo.ts` (mirror the header/env style of `scripts/reset-demo`'s siblings — see `scripts/smoke-whoop.ts` for the zod-env pattern):

```ts
/**
 * Provision-or-reset the demo account against whichever Supabase project the
 * env points at (run: `npm run demo:reset`; cloud usage loads .env.local via
 * tsx --env-file, see the npm script). One command serves both jobs:
 * first run bootstraps the demo auth user + dataset, later runs restore the
 * dataset after visitor drift. Never run in tests/CI — stack tests use
 * scripts/lib/demo-reset.ts directly.
 */
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ensureDemoUser, resetDemoData } from "./lib/demo-reset";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a URL"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  DEMO_USER_EMAIL: z.string().email("DEMO_USER_EMAIL must be an email"),
  DEMO_USER_PASSWORD: z.string().min(16, "DEMO_USER_PASSWORD must be at least 16 chars"),
});

async function main(): Promise<void> {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("demo:reset — missing/invalid env:");
    for (const issue of parsed.error.issues) console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    process.exit(1);
  }
  const env = parsed.data;

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const userId = await ensureDemoUser(admin, env.DEMO_USER_EMAIL, env.DEMO_USER_PASSWORD);
  await resetDemoData(admin, userId, env.DEMO_USER_EMAIL.trim().toLowerCase());
  console.log(`demo:reset — demo account ${env.DEMO_USER_EMAIL} (${userId}) reset to clean seed data.`);
}

main().catch((err) => {
  console.error(`demo:reset failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
```

Add to `package.json` scripts (after `"strava:register-webhook"`):

```json
    "demo:reset": "tsx --env-file-if-exists=.env.local scripts/reset-demo.ts",
```

(`--env-file-if-exists` is a Node 22.9+ flag that recent `tsx` forwards; it makes the command work both locally against `.env.local` and where the vars are already exported. **Verify it in Step 7** — if this repo's `tsx` rejects the flag, fall back to plain `"demo:reset": "tsx scripts/reset-demo.ts"` and note in the README block (Task 6) that the env vars must be exported or prefixed when running it.)

- [ ] **Step 6: Add the env template block**

Append to `.env.example` after the `ALLOWED_EMAIL` block:

```
# Public demo account (optional — unset disables the VIEW DEMO button and
# keeps the app owner-only). Password: long random, e.g.
# node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
# Provision/reset with: npm run demo:reset
DEMO_USER_EMAIL=
DEMO_USER_PASSWORD=
```

- [ ] **Step 7: Verify the CLI arg-validation path (no stack needed)**

Run: `NEXT_PUBLIC_SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= DEMO_USER_EMAIL= DEMO_USER_PASSWORD= npx tsx scripts/reset-demo.ts`
Expected: exit 1 with the four labeled env errors, no stack traces.
Then verify the npm script wrapper itself starts (flag-forwarding check from Step 5): `NEXT_PUBLIC_SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= DEMO_USER_EMAIL= DEMO_USER_PASSWORD= npm run demo:reset` from a directory without the env set — expected: the SAME four labeled env errors (not a tsx "unknown flag" error). If tsx rejects the flag, apply the fallback from Step 5.
Run: `npx tsc --noEmit` — expected clean.
Run: `npx vitest run` — expected all pass (nothing in the unit config imports the new script).

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/demo-reset.ts scripts/reset-demo.ts package.json .env.example tests/unit/demo-reset.supabase.test.ts
git commit -m "feat: demo:reset provisions and restores the demo account

One command for both bootstrap and drift-repair: find-or-create the demo
auth user (password synced from env), cascade-wipe via the profiles row,
reinsert the full seed through the shared row builders. Stack test proves
idempotency, full restore, owner isolation, and RLS scoping."
```

---

### Task 6: e2e guard, docs, security-review flag, full verification

**Files:**
- Modify: `tests/e2e/supabase-mode.spec.ts` (demo-button absence guard)
- Modify: `README.md` (demo section under Phase 2)
- Modify: `docs/security-review-priorities.md` (two new rows)
- Test: full suites

**Interfaces:** none new — this task locks contracts down.

- [ ] **Step 1: Add the e2e guard**

In `tests/e2e/supabase-mode.spec.ts`, inside the existing `describe` (inherits the `SUPABASE_E2E` skip), add:

```ts
  test("sign-in screen hides VIEW DEMO when demo env is not configured", async ({ page }) => {
    // This harness never sets DEMO_USER_EMAIL/PASSWORD — the button must be
    // absent, which is also the guarantee that keeps the Phase-1 local-mode
    // baseline and any non-demo deploy pixel-identical.
    await page.goto("/sign-in");
    await expect(page.getByRole("button", { name: "SEND CODE" })).toBeVisible();
    await expect(page.getByRole("button", { name: "VIEW DEMO" })).toHaveCount(0);
  });
```

- [ ] **Step 2: README demo section**

In `README.md`, after the **Cloud bootstrap** block, add:

```markdown
**Public demo (optional, portfolio deploys)** — set `DEMO_USER_EMAIL` +
`DEMO_USER_PASSWORD` (see `.env.example`) and run `npm run demo:reset` once
against the deployed project's env: it creates the demo auth user (or syncs
its password) and loads the full demo dataset under that account. The
sign-in screen then shows a **VIEW DEMO** button that signs visitors into
that account server-side — fully interactive, RLS-scoped to the demo rows
only. Re-run `npm run demo:reset` anytime to wipe visitor drift back to the
clean seed. Unset the two env vars to remove the button entirely (owner-only
behavior, byte-identical to pre-demo builds). Design:
`docs/superpowers/specs/2026-08-24-public-demo-access-design.md`.
```

- [ ] **Step 3: Security-review rows**

In `docs/security-review-priorities.md`, add two rows to the table after the `checkAllowedEmail` row:

```markdown
| `signInAsDemo` Server Action (`src/app/sign-in/page.tsx`) + `src/lib/auth/allowlist.ts` demo extension | Public one-click sign-in into the shared demo account (spec: docs/superpowers/specs/2026-08-24-public-demo-access-design.md): confirm the password grant uses ONLY server env values (no client input can reach it), that `DEMO_USER_EMAIL`/`DEMO_USER_PASSWORD` never leak into a `NEXT_PUBLIC_*` var or client bundle, and that a demo session is a plain RLS-scoped user with zero special-cased code paths. Consider Supabase Auth rate limits on the password endpoint (anyone can hammer the button). Accepted by design: visitors share one interactive account and can write junk into its rows between `demo:reset` runs. |
| `scripts/reset-demo.ts` + `scripts/lib/demo-reset.ts` | Service-role script (never in CI): confirm the cascade wipe is keyed strictly to the demo uuid resolved from `DEMO_USER_EMAIL` (a typo'd env pointing at the owner's email would wipe-and-reseed the OWNER — consider whether it should refuse when `DEMO_USER_EMAIL === ALLOWED_EMAIL`), and that `ensureDemoUser`'s password sync can't be pointed at an arbitrary existing user. |
```

- [ ] **Step 4: Guard the footgun the review row just named**

That owner-wipe footgun is real and one `if` away — close it now rather than leaving it to a future reviewer. In `scripts/reset-demo.ts`, after env parsing:

```ts
  if (
    process.env.ALLOWED_EMAIL &&
    env.DEMO_USER_EMAIL.trim().toLowerCase() === process.env.ALLOWED_EMAIL.trim().toLowerCase()
  ) {
    console.error(
      "demo:reset refused: DEMO_USER_EMAIL equals ALLOWED_EMAIL — this would wipe and reseed the OWNER's data.",
    );
    process.exit(1);
  }
```

And verify: `ALLOWED_EMAIL=x@y.z DEMO_USER_EMAIL=x@y.z DEMO_USER_PASSWORD=0123456789abcdef NEXT_PUBLIC_SUPABASE_URL=https://example.com SUPABASE_SERVICE_ROLE_KEY=k npx tsx scripts/reset-demo.ts`
Expected: exit 1 with the refusal message, no network call.

- [ ] **Step 5: Full verification sweep**

- `npx vitest run` — expected: every test passes (baseline 399 + all new).
- `npx tsc --noEmit` — expected clean.
- `npm run build` — expected clean.
- `PLAYWRIGHT_TEST=1 npx playwright test` — expected: exact Phase-1 baseline (46 passed / 1 skipped).
- With Docker running: `npm run test:supabase` — expected: previous 38 + the 4 new demo-reset tests, all green (serial, takes minutes).
- Supabase-mode smoke (needs the local stack seeded): `npm run db:reset && SUPABASE_E2E=1 PLAYWRIGHT_TEST=1 npx playwright test --project=supabase-mode` — expected: existing smoke + the new absence guard pass.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/supabase-mode.spec.ts README.md docs/superpowers/plans/2026-08-24-public-demo-access.md docs/security-review-priorities.md scripts/reset-demo.ts
git commit -m "feat: demo e2e guard, docs, and security-review flags

The e2e absence check pins the hide-when-unconfigured contract that
protects every non-demo environment. demo:reset now refuses to run when
DEMO_USER_EMAIL equals ALLOWED_EMAIL — the one-typo owner-wipe footgun
the review row flags."
```

---

## Post-plan (NOT tasks in this plan — session work after implementation)

Deployment wiring is deliberately outside this plan (it needs live credentials and Max's Vercel account): generate demo creds, run `npm run demo:reset` against the cloud project, Vercel project + env + deploy, set `NEXT_PUBLIC_APP_URL`, live-verify VIEW DEMO on the deployed URL, then decide PR routing (PR #2 first, then a PR for `feature/public-demo`).
