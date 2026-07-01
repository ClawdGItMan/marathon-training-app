# Marathon App — Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pixel-faithful, installable Next.js PWA of the full app — all 8 screens, 5-tab navigation, charts and animations — running on typed seed data, with the data layer behind a repository interface so Phase 2 can swap in Supabase without touching components.

**Architecture:** Next.js App Router, one route per tab plus `workout/[id]`, `log`, and `settings`. Screens are server components composing small client components; all data flows through `lib/data/repo.ts` (Phase 1 implementation: seed module + localStorage for writes). Design values come from `Daily Screen Directions.dc.html` + `README.md` (canonical) — components port that markup, converting inline styles to Tailwind arbitrary values with tokens.

**Tech Stack:** Next.js 15 (App Router), TypeScript strict, Tailwind CSS v4, Zod, Vitest + @testing-library/react (jsdom), Playwright (@playwright/test), next/font (Archivo + Geist).

## Roadmap context (3 phases)

1. **Phase 1 (this plan):** scaffold, tokens, domain model, seed repo, all screens, PWA, tests.
2. **Phase 2 (planned at phase start):** Supabase (schema + RLS + Auth), Settings OAuth, Whoop snapshot sync, Strava webhook import, log flows persist to DB, stale-data states. Spec §6–§7, §11.
3. **Phase 3 (planned at phase start):** proposal engine + cron, Accept/Modify/Override lifecycle end-to-end, Coach chat via Vercel AI SDK + Claude (tool-use), voice input, onboarding plan generation, exercise imagery library load. Spec §5, §8.

## Global Constraints

- Design source of truth: `Daily Screen Directions.dc.html` (screens `#2a`, `#3a`–`#3e`, `#5a`) + `README.md` tokens. Copy exact colors/spacing/copy. `prototype.html` = approved nav model.
- Phone frame: mobile-first, content max-width **414px** centered; app bg `radial-gradient(130% 70% at 50% -8%, #1c232c 0%, #11151b 56%)`. Do **not** render the mock's fake status bar or home indicator (real devices provide those).
- Fonts: **Archivo** (UI, 400–800) + **Geist** (numerals, 400–700, `tabular-nums` on stat grids).
- Card system: surface `#171c23`, border `1px solid rgba(255,255,255,.05)`, radius **10px** (cards) / **8px** (controls), shadow `0 1px 0 rgba(255,255,255,.03) inset, 0 10px 26px -16px rgba(0,0,0,.55)`.
- Accents: app `#3866e0`; Coach/workout-detail `#6E8BEA` + warm `#E8A87C`; session types easy `#7CB3D9`, speed `#34B3E6`, tempo `#FFCE3F`, long/success `#16e06a`, strength `#9a8cf0`, effort `#FF8A3D`, streak `#FF9A3D`.
- Tab bar: 5 items TODAY / PLAN / COACH / BODY / PROGRESS; no background chips; inactive `#aab0b8`, active white (Coach active = accent); Coach icon = **stopwatch**, Progress icon = **rising trend line**.
- TypeScript strict; Zod validation at every data boundary; all async functions handle errors; components under 150 lines (decompose screens into sub-components); named exports; `"use client"` explicit.
- Conventional commits (`feat:`, `test:`, `chore:`); commit at the end of every task (and mid-task where steps say so).
- Never port `support.js` or `data-screen`/`<x-dc>` scaffolding from the design file.

## File Structure

```
src/
  app/layout.tsx, globals.css, manifest.ts
  app/(tabs)/today|plan|coach|body|progress/page.tsx   # 5 tab routes
  app/workout/[id]/page.tsx, app/log/page.tsx, app/settings/page.tsx
  components/shell/TabBar.tsx, AppShell.tsx
  components/ui/Card.tsx, SectionHeader.tsx, TypeTag.tsx, StatGrid.tsx, SegmentMeter.tsx, ProgressTicks.tsx
  components/charts/RingGauge.tsx, Sparkline.tsx, AreaLineChart.tsx, DotTrendChart.tsx, PeriodizationBars.tsx, SleepStagesBar.tsx
  components/today/*, components/plan/*, components/body/*, components/progress/*, components/workout/*, components/coach/*, components/log/*
  lib/delta-color.ts, lib/format.ts
  lib/domain/types.ts, lib/domain/schemas.ts
  lib/data/repo.ts, lib/data/seed.ts, lib/data/local-repo.ts
tests/unit/*.test.ts(x)        # Vitest
tests/e2e/*.spec.ts            # Playwright
public/exercises/_generic.png  # fallback illustration (user's ChatGPT art lands here later)
```

---

### Task 1: Scaffold app, fonts, base layout

**Files:**
- Create: Next.js app at repo root (`package.json`, `src/app/layout.tsx`, `src/app/globals.css`, `tsconfig.json`, etc.)
- Create: `vitest.config.ts`, `tests/unit/smoke.test.ts`

**Interfaces:**
- Produces: running dev server; `RootLayout` applying fonts + app background; CSS variables `--font-ui`, `--font-num`.

- [ ] **Step 1: Scaffold**

```bash
npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --use-npm --no-import-alias --yes
npm i zod
npm i -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @playwright/test
```

(Repo already has files — scaffold into a temp dir and move if create-next-app refuses a non-empty dir: `npx create-next-app@latest .tmp-scaffold ... && rsync -a .tmp-scaffold/ . && rm -rf .tmp-scaffold`.)

- [ ] **Step 2: Verify `strict: true`** in `tsconfig.json` (create-next-app default; fix if not).

- [ ] **Step 3: Fonts + root layout.** Replace `src/app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from "next";
import { Archivo, Geist } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-ui" });
const geist = Geist({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-num" });

export const metadata: Metadata = { title: "Marathon Coach", description: "Honolulu Marathon training" };
export const viewport: Viewport = { themeColor: "#11151b", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${geist.variable}`}>
      <body className="min-h-dvh bg-app font-ui text-white antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Vitest config.** `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", include: ["tests/unit/**/*.test.{ts,tsx}"], setupFiles: ["tests/unit/setup.ts"] },
});
```

`tests/unit/setup.ts`: `import "@testing-library/jest-dom/vitest";`
`tests/unit/smoke.test.ts`:

```ts
import { expect, test } from "vitest";
test("vitest runs", () => expect(1 + 1).toBe(2));
```

Add scripts to `package.json`: `"test": "vitest run"`, `"test:e2e": "playwright test"`.

- [ ] **Step 5: Run** `npm run test` → smoke passes; `npm run dev` → page serves at :3000 without errors.

- [ ] **Step 6: Commit** `chore: scaffold Next.js app with fonts and test tooling`

---

### Task 2: Design tokens + `deltaColor` + formatters (TDD)

**Files:**
- Modify: `src/app/globals.css`
- Create: `src/lib/delta-color.ts`, `src/lib/format.ts`
- Test: `tests/unit/delta-color.test.ts`, `tests/unit/format.test.ts`

**Interfaces:**
- Produces: Tailwind theme tokens (`bg-app`, `bg-card`, `border-hairline`, `text-…` scale, color names below); `deltaColor(pct: number): string`; `formatPace(secPerMi: number): string`; `formatHM(min: number): string` ("6:12"); `formatClock(sec: number): string` ("3:56:10").

- [ ] **Step 1: Tokens.** In `globals.css` (Tailwind v4 `@theme`):

```css
@theme {
  --color-accent: #3866e0; --color-brand: #6E8BEA; --color-warm: #E8A87C;
  --color-easy: #7CB3D9; --color-speed: #34B3E6; --color-tempo: #FFCE3F;
  --color-long: #16e06a; --color-strength: #9a8cf0; --color-effort: #FF8A3D; --color-streak: #FF9A3D;
  --color-card: #171c23; --color-ink-high: #e4e7eb; --color-ink-mid: #cdd1d6;
  --color-ink-sec: #8a919c; --color-ink-faint: #7b828c; --color-ink-dim: #697079; --color-ink-tab: #aab0b8;
  --radius-card: 10px; --radius-ctl: 8px;
  --font-ui: var(--font-ui); --font-num: var(--font-num);
}
.bg-app { background: radial-gradient(130% 70% at 50% -8%, #1c232c 0%, #11151b 56%); }
.card { background: #171c23; border: 1px solid rgba(255,255,255,.05); border-radius: 10px;
        box-shadow: 0 1px 0 rgba(255,255,255,.03) inset, 0 10px 26px -16px rgba(0,0,0,.55); }
```

- [ ] **Step 2: Failing tests.** `tests/unit/delta-color.test.ts` (boundaries per README §Color; interpretation locked here):

```ts
import { describe, expect, test } from "vitest";
import { deltaColor } from "@/lib/delta-color";

describe("deltaColor", () => {
  test("non-negative → neutral", () => { expect(deltaColor(0)).toBe("#8a919c"); expect(deltaColor(3)).toBe("#8a919c"); });
  test("mild −1..−3 amber", () => expect(deltaColor(-2)).toBe("#FFCE3F"));
  test("mild −4..−6 warm", () => expect(deltaColor(-5)).toBe("#FF9A3D"));
  test("moderate −7..−13 red-orange", () => { expect(deltaColor(-7)).toBe("#F0603F"); expect(deltaColor(-12)).toBe("#F0603F"); });
  test("severe ≤−14 red", () => expect(deltaColor(-14)).toBe("#E5484D"));
});
```

`tests/unit/format.test.ts`:

```ts
import { expect, test } from "vitest";
import { formatPace, formatHM, formatClock } from "@/lib/format";

test("formatPace", () => expect(formatPace(541)).toBe("9:01"));
test("formatHM", () => expect(formatHM(372)).toBe("6:12"));
test("formatClock", () => expect(formatClock(14170)).toBe("3:56:10"));
```

- [ ] **Step 3: Run** `npm run test` → both files FAIL (module not found).

- [ ] **Step 4: Implement.** `src/lib/delta-color.ts`:

```ts
export function deltaColor(pct: number): string {
  if (pct >= 0) return "#8a919c";
  if (pct >= -3) return "#FFCE3F";
  if (pct >= -6) return "#FF9A3D";
  if (pct >= -13) return "#F0603F";
  return "#E5484D";
}
```

`src/lib/format.ts`:

```ts
export function formatPace(secPerMi: number): string {
  const m = Math.floor(secPerMi / 60), s = Math.round(secPerMi % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
export function formatHM(totalMin: number): string {
  const h = Math.floor(totalMin / 60), m = Math.round(totalMin % 60);
  return `${h}:${m.toString().padStart(2, "0")}`;
}
export function formatClock(totalSec: number): string {
  const h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60), s = Math.round(totalSec % 60);
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
```

- [ ] **Step 5: Run** `npm run test` → PASS.
- [ ] **Step 6: Commit** `feat: design tokens, deltaColor scale, and numeric formatters`

---

### Task 3: Domain model + seed data (TDD)

**Files:**
- Create: `src/lib/domain/types.ts`, `src/lib/domain/schemas.ts`, `src/lib/data/seed.ts`
- Test: `tests/unit/domain.test.ts`

**Interfaces:**
- Produces (used by every later task): types `StructureSegment { kind: "warmup"|"rep"|"recovery"|"cooldown"; label: string; zone: string; pace?: string; duration: string; repeat?: number }`, `SessionType = "easy"|"speed"|"tempo"|"long"|"rest"|"strength"|"recovery"`, `PlannedSession { id, date, type, title, detail, distanceMi?, paceTarget?, zone?, status: "planned"|"in-progress"|"completed"|"skipped", provenance: "original"|"accepted-proposal"|"modified-proposal", structure?: StructureSegment[] }`, `Proposal { id, scope: "day"|"week"|"workout", targetSessionId, headline, subhead, rationale, badge: "HOLD"|"GO"|"ADJUST", before: PlannedSession, after: PlannedSession, drivers: { label: string; value: string; deltaPct?: number; tone?: string }[], status: "proposed"|"accepted"|"modified"|"dismissed"|"expired", reviewedAt }`, `RecoverySnapshot { date, recoveryPct, recoveryDelta, hrv, hrvDeltaPct, rhr, rhrDelta, respRate, sleep: { durationMin, needMin, efficiencyPct, deepMin, remMin, lightMin }, load, loadLabel }`, `PainArea { id, name, side?, severity, label, trend: "improving"|"steady"|"worsening", trendDays }`, `Prediction { distance: "5K"|"10K"|"HALF"|"FULL", timeSec, paceSecPerMi, deltaSec }`, `StrengthExercise { id, slug, name, sets, reps, tag?, cue, muscles }`, `TrainingBlock { number, phase, week, totalWeeks, weekMilesDone, weekMilesTarget, longRunLabel }`, `RaceGoal { name, date, goalSec, predictedSec, daysOut, streak }`, `ChatMessage { id, role: "coach"|"user", text, proposalRefs?: string[] }`.
- Produces: Zod schemas mirroring each type (`sessionSchema`, `proposalSchema`, …) and `seed` object: `{ goal, block, recovery: RecoverySnapshot[], todaySessionId, week: PlannedSession[], proposals: Proposal[], pains: PainArea[], predictions: Prediction[], strength: { phase, note, session: StrengthExercise[] }, workoutDetail: PlannedSession, coachThread: ChatMessage[], mileage12wk: number[], fitness90d: number[] }`.

- [ ] **Step 1: Failing test** `tests/unit/domain.test.ts`:

```ts
import { expect, test } from "vitest";
import { seed } from "@/lib/data/seed";
import { proposalSchema, sessionSchema, recoverySchema } from "@/lib/domain/schemas";

test("seed sessions parse", () => { for (const s of seed.week) expect(sessionSchema.parse(s).id).toBeTruthy(); });
test("seed proposal parses and is a HOLD tempo→easy swap", () => {
  const p = proposalSchema.parse(seed.proposals[0]);
  expect(p.badge).toBe("HOLD");
  expect(p.before.type).toBe("tempo");
  expect(p.after.type).toBe("easy");
});
test("today recovery matches design mock", () => {
  const r = recoverySchema.parse(seed.recovery.at(-1));
  expect(r.recoveryPct).toBe(62); expect(r.hrv).toBe(48); expect(r.hrvDeltaPct).toBe(-12);
});
test("workout detail is Rolling 400s with 3 structure kinds", () => {
  const kinds = new Set(seed.workoutDetail.structure!.map((s) => s.kind));
  expect(seed.workoutDetail.title).toBe("Rolling 400s");
  expect(kinds).toEqual(new Set(["warmup", "rep", "recovery", "cooldown"]));
});
```

- [ ] **Step 2: Run** → FAIL (modules missing).

- [ ] **Step 3: Implement** `types.ts` + `schemas.ts` exactly per the Interfaces block (each schema a `z.object` mirroring the type; export inferred types from schemas to avoid drift: `export type Proposal = z.infer<typeof proposalSchema>`). Then `seed.ts` with the design's exact values:
  - goal: Honolulu Marathon, `2026-12-13`, goalSec 14400, predictedSec 14170, daysOut 167 (compute from a fixed seed "today" of 2026-06-29), streak 12.
  - recovery (latest): 62 / −9, HRV 48 / −12%, RHR 52 / +3, resp 14.2, sleep 372 of 464 min / 88% / deep 67 rem 85 light 188, load 1.28 "elevated". Plus 6 prior days for the 7-day dot chart (values ~55–70).
  - week (Mon Jun 29 – Sun Jul 5): Mon tempo 6mi (target of the swap), Tue rest, Wed "Rolling 400s" speed 4.5mi, Thu easy 5mi, Fri strength lower, Sat long 14mi, Sun recovery 3mi. Match visible rows of `#3c` (design file lines 364–446) where they differ.
  - proposals[0]: day-scope HOLD; headline "Ease off today."; subhead "Swap the tempo for an easy 4 miles."; rationale = the mock's paragraph; drivers HRV 48 ↓12% / SLEEP 6:12 −1:32 / ACHILLES 2/10 mild; before = Mon tempo, after = easy 4mi 9:30/mi Z2; reviewedAt "6:41 AM".
  - proposals[1]: week-scope ADJUST "Move long run to Sunday" (rain Sat rationale) — used by Coach briefing.
  - proposals[2]: workout-scope for Rolling 400s → "Try 5 × 600m instead" with chips 5×600m / ~44 min / same Z5 time.
  - pains: Achilles·Left 2/10 mild improving 7d; Right Calf 1/10 tight steady 3d.
  - predictions: 21:30/−18, 44:50/−35, 1:51:20/−70, 3:56:10/−160 with paces 415/433/510/540 sec-per-mi.
  - strength: phase "MAX STRENGTH · DELOAD", note "Volume −20% to match easy running", exercises: eccentric-calf-raise 3×12 tag ACHILLES; back-squat 3×5; romanian-deadlift 3×8; single-leg-press 3×10; side-plank 3×45s. Muscles arrays for the illustration alt text.
  - workoutDetail: Rolling 400s (Wed), structure: warmup Easy·Z2 10:00; rep "400m hard" 5K pace·Z5 1:32 repeat 8; recovery "200m float" easy 1:05; cooldown Easy·Z1 10:00.
  - coachThread: briefing message (role coach, proposalRefs to proposals[0], [1]) + the fueling Q&A pair from the approved Coach screen.
  - mileage12wk / fitness90d: arrays matching the design's polyline shapes (12 and 13 points, rising).

- [ ] **Step 4: Run** `npm run test` → PASS. Fix strict-mode type errors until `npx tsc --noEmit` is clean.
- [ ] **Step 5: Commit** `feat: domain schemas and design-accurate seed data`

---

### Task 4: Repository layer (TDD)

**Files:**
- Create: `src/lib/data/repo.ts`, `src/lib/data/local-repo.ts`
- Test: `tests/unit/repo.test.ts`

**Interfaces:**
- Produces: `Repo` interface — `getGoal()`, `getBlock()`, `getLatestRecovery()`, `getRecovery7d()`, `getWeekSessions()`, `getSession(id)`, `getOpenProposals()`, `decideProposal(id, decision: "accepted"|"modified"|"dismissed", edited?: PlannedSession)`, `getPains()`, `logPain(areaId, severity, note?)`, `getPredictions()`, `getStrengthSession()`, `getCoachThread()`, `appendChat(msg)`, `logRun(entry: { sessionId?, rpe: number, painAreaId?, painSeverity?: number })` — all returning Promises of domain types.
- Produces: `localRepo: Repo` — reads from `seed`, persists writes (proposal decisions, pain logs, RPE, chat) to `localStorage` key `marathon.phase1.state`, merging over seed on read. Guard all `localStorage` access behind `typeof window !== "undefined"` and try/catch (jsdom + SSR safety).
- Key behavior later tasks rely on: `decideProposal("…","accepted")` returns the updated week where the target session is replaced by `proposal.after` with `provenance: "accepted-proposal"`; `"modified"` uses the `edited` session with `provenance: "modified-proposal"`; `"dismissed"` leaves sessions untouched.

- [ ] **Step 1: Failing tests** `tests/unit/repo.test.ts`:

```ts
import { beforeEach, expect, test } from "vitest";
import { localRepo } from "@/lib/data/local-repo";

beforeEach(() => localStorage.clear());

test("accept swaps the session with accepted-proposal provenance", async () => {
  const [p] = await localRepo.getOpenProposals();
  await localRepo.decideProposal(p.id, "accepted");
  const s = await localRepo.getSession(p.targetSessionId);
  expect(s.type).toBe("easy");
  expect(s.provenance).toBe("accepted-proposal");
  expect((await localRepo.getOpenProposals()).find((x) => x.id === p.id)).toBeUndefined();
});

test("dismiss leaves the plan untouched", async () => {
  const [p] = await localRepo.getOpenProposals();
  await localRepo.decideProposal(p.id, "dismissed");
  const s = await localRepo.getSession(p.targetSessionId);
  expect(s.type).toBe("tempo");
  expect(s.provenance).toBe("original");
});

test("modify applies the edited session", async () => {
  const [p] = await localRepo.getOpenProposals();
  await localRepo.decideProposal(p.id, "modified", { ...p.after, title: "EASY · 3 MI", distanceMi: 3 });
  const s = await localRepo.getSession(p.targetSessionId);
  expect(s.distanceMi).toBe(3);
  expect(s.provenance).toBe("modified-proposal");
});

test("pain log updates area severity", async () => {
  await localRepo.logPain("achilles-l", 3);
  expect((await localRepo.getPains()).find((a) => a.id === "achilles-l")!.severity).toBe(3);
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3:** Implement `repo.ts` (interface only) + `local-repo.ts` (seed + JSON-merged overlay; writes validated with Zod before persisting). **Step 4: Run** → PASS; `npx tsc --noEmit` clean. **Step 5: Commit** `feat: repository interface with localStorage-backed phase-1 implementation`

---

### Task 5: App shell — tab bar, routes, Playwright nav smoke

**Files:**
- Create: `src/components/shell/TabBar.tsx`, `src/components/shell/AppShell.tsx`, `src/app/(tabs)/layout.tsx`, five `src/app/(tabs)/{today,plan,coach,body,progress}/page.tsx` (headline stubs: screen name in the design's 22px/700 title style), `src/app/page.tsx` (redirect `/` → `/today`)
- Create: `playwright.config.ts`, `tests/e2e/nav.spec.ts`

**Interfaces:**
- Produces: `AppShell` (server component wrapping tab pages: 414px centered column, bottom `TabBar`); `TabBar` (client, `usePathname` for active state) — the five inline SVG icons ported from `prototype.html`'s tab bar (sun/dial TODAY, calendar PLAN, **stopwatch** COACH, figure BODY, **trend-line** PROGRESS). Coach active tint `text-accent`, others active white, inactive `#aab0b8`, labels 9px/700 `.04em`.

- [ ] **Step 1: Playwright config** (`webServer: { command: "npm run dev", port: 3000, reuseExistingServer: true }`, `use: { viewport: { width: 414, height: 846 } }`).
- [ ] **Step 2: Failing e2e** `tests/e2e/nav.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

const tabs = [
  ["TODAY", "/today"], ["PLAN", "/plan"], ["COACH", "/coach"], ["BODY", "/body"], ["PROGRESS", "/progress"],
] as const;

test("root redirects to /today", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/today$/);
});

for (const [label, path] of tabs)
  test(`tab ${label} navigates to ${path}`, async ({ page }) => {
    await page.goto("/today");
    await page.getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  });
```

- [ ] **Step 3: Run** `npm run test:e2e` → FAIL. **Step 4:** Implement shell + stub pages (TabBar items are `next/link` anchors with `aria-label` = tab name). **Step 5: Run** → PASS. **Step 6: Commit** `feat: 5-tab app shell with stopwatch Coach and trend Progress icons`

---

### Task 6: Shared UI primitives

**Files:**
- Create: `src/components/ui/Card.tsx`, `SectionHeader.tsx`, `TypeTag.tsx`, `StatGrid.tsx`, `SegmentMeter.tsx`, `ProgressTicks.tsx`
- Test: `tests/unit/ui-primitives.test.tsx`

**Interfaces:**
- Produces: `Card({ className?, children })` → `.card` div. `SectionHeader({ label, accent, action?, actionHref? })` → the 3px×14px color mark + 13px/700 white label + right faint action link. `TypeTag({ type: SessionType })` → 9px/700 uppercase chip, bg `rgba(<type color>,.16)`, text = type color (map from Task 2 tokens; rest = neutral). `StatGrid({ items: { label, value, unit?, delta?: { text, color } }[] })` → 3-col bordered grid, Geist numerals, `tabular-nums`. `SegmentMeter({ value, max = 10, color = "#FF9A3D" })` → 10 bars, filled to value. `ProgressTicks({ done, total, current?: boolean })` → the Your-Focus / Training-Block tick row (filled accent, current `#FFCE3F` when `current`, rest `rgba(255,255,255,.1)`).

- [ ] **Step 1: Failing render tests** (one per component; example):

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { TypeTag } from "@/components/ui/TypeTag";
import { SegmentMeter } from "@/components/ui/SegmentMeter";

test("TypeTag renders uppercase type", () => {
  render(<TypeTag type="tempo" />);
  expect(screen.getByText("TEMPO")).toBeInTheDocument();
});
test("SegmentMeter fills to value", () => {
  const { container } = render(<SegmentMeter value={2} />);
  expect(container.querySelectorAll("[data-filled=true]").length).toBe(2);
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3:** Implement all six, styles verbatim from README/design (paddings, letter-spacings). **Step 4: Run** → PASS. **Step 5: Commit** `feat: shared UI primitives matching design token system`

---

### Task 7: Charts I — RingGauge + Sparkline

**Files:**
- Create: `src/components/charts/RingGauge.tsx`, `src/components/charts/Sparkline.tsx`
- Test: `tests/unit/charts-ring.test.tsx`

**Interfaces:**
- Produces: `RingGauge({ value, max = 100, color, size = 104, stroke = 8, children })` — SVG circle r=44 scaled to `size`, track `rgba(255,255,255,.08)`, arc `color` round-capped rotated −90°, animated on mount from 0 to `value/max` of circumference (CSS transition on `stroke-dashoffset`, 1.3s cubic-bezier(.2,.7,.2,1)); `children` rendered centered (the number text). `Sparkline({ points: number[], color, height = 40 })` — normalized polyline, stroke 2, draw-in via dash animation.
- Both are client components (`"use client"`).

- [ ] **Step 1: Failing test** — `RingGauge` renders an arc with `stroke="#FFCE3F"` and its dashoffset target ≈ circumference × (1 − 62/100) (assert via `data-target-offset` attribute the component sets); `Sparkline` emits a `<polyline>` with one point pair per datum.
- [ ] **Step 2: Run** → FAIL. **Step 3:** Implement (compute `c = 2πr`; set `strokeDasharray = c`; animate offset `c → c·(1−ratio)` on mount via `useEffect` class toggle). **Step 4: Run** → PASS. **Step 5: Commit** `feat: ring gauge and sparkline chart components`

---

### Task 8: Charts II — AreaLineChart (synced wipe), DotTrendChart, PeriodizationBars, SleepStagesBar

**Files:**
- Create: `src/components/charts/AreaLineChart.tsx`, `DotTrendChart.tsx`, `PeriodizationBars.tsx`, `SleepStagesBar.tsx`
- Modify: `src/app/globals.css` (add `@keyframes area-wipe { to { clip-path: inset(0 0 0 0) } }`)
- Test: `tests/unit/charts-area.test.tsx`

**Interfaces:**
- Produces: `AreaLineChart({ points, color, height, fillOpacity = .12, gridlines?: { y: number, label: string }[], xLabels?: string[], endDot = true, animate = true })` — **the approved animation fix:** polygon fill + polyline + end dot are wrapped in ONE `<g style="clip-path: inset(0 100% 0 0); animation: area-wipe 1.3s .3s ease forwards">` so fill and line reveal together at the same rate (re-fires on mount). `DotTrendChart({ points, goodThreshold })` — grey connecting line, per-day dots green `#16e06a` ≥ threshold else `#FFCE3F`, day letters below. `PeriodizationBars({ weeks: { phase: "base"|"build"|"peak"|"taper", mi: number }[], currentWeek })` — bars tinted by phase (easy/tempo/long/strength palette per design `#3c`), phase labels beneath. `SleepStagesBar({ deepMin, remMin, lightMin, needMin })` — stacked bar (three blues `#2b5f8f`/`#34B3E6`/`#7CB3D9` per design) + legend.

- [ ] **Step 1: Failing test** — AreaLineChart: the `<g>` wrapping polygon+polyline+circle has inline `clipPath` starting at `inset(0 100% 0 0)` and an animation name `area-wipe`; polygon and polyline share identical x-coordinates for each datum (sync by construction).
- [ ] **Step 2: Run** → FAIL. **Step 3:** Implement all four. **Step 4: Run** → PASS. **Step 5: Commit** `feat: area/dot/periodization/sleep charts with synchronized reveal`

---

### Task 9: Today screen

**Files:**
- Create: `src/components/today/RaceCountdown.tsx`, `RingsTrio.tsx`, `RecommendationCard.tsx`, `SessionCard.tsx`, `BodyGlance.tsx`, `BlockGlance.tsx`, `ProgressGlimpse.tsx`
- Modify: `src/app/(tabs)/today/page.tsx`
- Test: `tests/unit/today.test.tsx`, extend `tests/e2e/nav.spec.ts`

**Interfaces:**
- Consumes: `localRepo`, all Task 6–8 components.
- Produces: `RecommendationCard({ proposal, onDecide })` (client) — eyebrow "TODAY'S RECOMMENDATION", HOLD badge `#E8A33A` on dark text, 27px headline, subhead, rationale, 3-col drivers grid (delta colors via `deltaColor`), buttons **Accept** (accent fill, flex 1.7) / **Modify** (ghost) / **Override** (text) sized per design, footer "Reviewed 6:41 AM — nothing changes until you decide." Accept/Override call `onDecide`; **Modify opens `ModifySheet`** — a minimal client sheet pre-filled with `proposal.after` (editable title, distance, pace fields) whose Save calls `onDecide("modified", edited)`. `SessionCard({ planned, proposed? })` — two-row card, planned row struck-through grey when a proposal/decision replaces it, proposed row green-tinted with PROPOSED tag (exact design treatment; after Accept it becomes the single active row).
- Screen source: design file `#2a` (lines 623–841). Port section by section; each sub-component < 150 lines.

- [ ] **Step 1: Failing render test** — page (with seeded repo) shows "Ease off today.", "HONOLULU MARATHON", "TODAY'S SESSION", strike-through on "TEMPO · 6 MI", and three ring values 62 / 78% / 1.28.
- [ ] **Step 2: Run** → FAIL. **Step 3:** Implement components; wire rings→`/body`, glimpse→`/progress`, block→`/plan`, session→`/workout/wed-400s`, "＋ Log"→`/log`; avatar (top-left, 30px gradient circle per design)→`/settings`. Decisions persist via `localRepo.decideProposal` and update UI (client boundary at RecommendationCard+SessionCard, `router.refresh()` after decide).
- [ ] **Step 4:** e2e: Accept flow — click Accept, expect PROPOSED tag gone and session row shows "EASY · 4 MI" not struck; reload page, state persists (localStorage). **Step 5: Run** unit + e2e → PASS. **Step 6: Commit** `feat: Today screen with decidable recommendation and session cards`

---

### Task 10: Progress screen

**Files:**
- Create: `src/components/progress/FocusCard.tsx`, `WeekRunCard.tsx`, `PredictionsCard.tsx`, `FitnessCard.tsx`
- Modify: `src/app/(tabs)/progress/page.tsx`
- Test: `tests/unit/progress.test.tsx`

**Interfaces:**
- Consumes: `AreaLineChart`, `ProgressTicks`, `StatGrid`, seed predictions.
- Screen source: `#3a` (design file lines 171–273) — Your Focus / This Week·Run (3-stat grid + area chart, 20mi/10mi gridlines, MAY–JUN–JUL axis) / Predictions rows (5K/10K/HALF + highlighted FULL row `rgba(56,102,224,.08)` bg, accent chip, "vs 4:00 goal", green ▼ deltas) / Fitness (+38% · 90 days). Header: "Progress" 22px + streak pill (flame, `#FF9A3D`) + 1W/1M/3M/1Y segmented toggle (client state `selectedRange`, default 3M; re-scopes This-Week chart data by slicing `mileage12wk` — 1W→last 2 pts, 1M→last 4, 3M→all 12, 1Y→all).

- [ ] **Step 1: Failing render test** — shows "Honolulu Marathon", "3:56:10", "vs 4:00 goal", "PREDICTIONS", "FITNESS"; toggle click "1M" re-renders chart with 4 points (assert via polyline point count).
- [ ] **Step 2: Run** → FAIL. **Step 3:** Implement. **Step 4: Run** → PASS; visually diff against `#3a` at 414px. **Step 5: Commit** `feat: Progress screen with range toggle and predictions`

---

### Task 11: Body screen (Recovery + Pain & Injuries manager)

**Files:**
- Create: `src/components/body/RecoveryHero.tsx`, `VitalsCard.tsx`, `SleepCard.tsx`, `Recovery7dCard.tsx`, `BodyMap.tsx`, `PainAreaRow.tsx`, `PainManagerCard.tsx`
- Modify: `src/app/(tabs)/body/page.tsx`
- Test: `tests/unit/body.test.tsx`

**Interfaces:**
- Consumes: `RingGauge`, `Sparkline`, `SleepStagesBar`, `DotTrendChart`, `SegmentMeter`, `deltaColor`, `localRepo.getPains`/`logPain`.
- Screen source: `#3b` (lines 279–360) for the top; Pain & Injuries section per approved prototype (`prototype.html`, `PAIN & INJURIES` block): section header (`#FF9A3D` mark, "HISTORY ›"), card with helper line "Tap an area to log soreness or an injury.", `BodyMap` (the prototype's SVG figure: grey body, 6 tappable hotspot circles — shoulders L/R, hip, knees L/R, ankles L/R — active area glowing `#FF9A3D`), one `PainAreaRow` per area (name, `n/10` label chip color `#E8A33A`, `SegmentMeter`, trend line green when improving), and full-width ghost-warm button "+ Log soreness or injury" → `/log?focus=pain`.
- Produces: `BodyMap({ areas, activeId, onSelect })` (client) — hotspots are `<button aria-label={area.name}>`.

- [ ] **Step 1: Failing render test** — shows recovery "62", "VITALS", "SLEEP", "PAIN & INJURIES", "ACHILLES · LEFT", "+ Log soreness or injury"; clicking hotspot "Achilles · Left" sets `aria-pressed`.
- [ ] **Step 2: Run** → FAIL. **Step 3:** Implement. **Step 4: Run** → PASS. **Step 5: Commit** `feat: Body screen with recovery analytics and pain manager`

---

### Task 12: Plan screen (RUN mode)

**Files:**
- Create: `src/components/plan/PlanHeader.tsx`, `ModeToggle.tsx`, `BlockCard.tsx`, `WeekList.tsx`, `DayRow.tsx`
- Modify: `src/app/(tabs)/plan/page.tsx`
- Test: `tests/unit/plan.test.tsx`

**Interfaces:**
- Consumes: `PeriodizationBars`, `TypeTag`, seed week, `localRepo.getWeekSessions`.
- Screen source: `#3c` (lines 364–446). Header "Plan" + subtitle "BLOCK 2 · BUILD · WEEK 7 / 16" + ASK AI button (sparkle-free: use the stopwatch glyph + "ASK AI" accent text; navigates `/coach`). `ModeToggle` RUN/STRENGTH (client state `planMode`, STRENGTH renders Task 13's content). 16-WEEK BLOCK card ("peak 52 mi/wk"). `WeekList`: MON–SUN `DayRow`s (day+date, title, detail "distance · zone · pace", `TypeTag`), today's row highlighted (`TODAY` chip bg `rgba(124,179,217,.16)` per design), each row links `/workout/[id]`.

- [ ] **Step 1: Failing render test** — "BLOCK 2 · BUILD", 7 day rows, a "TEMPO" tag, today's row has TODAY chip; ASK AI links to /coach; a day row links to its workout id.
- [ ] **Step 2: Run** → FAIL. **Step 3:** Implement. **Step 4: Run** → PASS. **Step 5: Commit** `feat: Plan screen with periodization block and week list`

---

### Task 13: Strength mode + exercise detail + imagery slots

**Files:**
- Create: `src/components/plan/strength/PhaseCard.tsx`, `ExerciseRow.tsx`, `StrengthSession.tsx`, `ExerciseDetailSheet.tsx`
- Create: `public/exercises/_generic.svg` (simple grey flat-vector figure on transparent — the fallback; user's ChatGPT illustrations will land as `public/exercises/<slug>.png`)
- Test: `tests/unit/strength.test.tsx`

**Interfaces:**
- Consumes: seed strength session; renders inside Plan's STRENGTH mode.
- Screen source: `#3e` (lines 519–597) + approved imagery placement: each `ExerciseRow` gets a 42px rounded thumbnail (`next/image`, src `/exercises/${slug}.png`, `onError` fallback to `_generic.svg`, alt = `${name} — ${muscles.join(", ")}`); tapping a row opens `ExerciseDetailSheet` — full-width illustration on `radial-gradient(80% 75% at 50% 32%, #1b222c, #0e1218)`, name 15px/700, sets×reps, muscles line, cue text (existing card tokens only).
- Produces: `exerciseImageSrc(slug: string): string` helper in `ExerciseRow` module.

- [ ] **Step 1: Failing render test** — STRENGTH mode shows "MAX STRENGTH · DELOAD", "Eccentric calf raises", "· ACHILLES" tag, "3×12"; thumbnails have alt text with muscles; clicking a row shows the sheet with the cue.
- [ ] **Step 2: Run** → FAIL. **Step 3:** Implement. **Step 4: Run** → PASS. **Step 5: Commit** `feat: strength session with illustration slots and exercise detail`

---

### Task 14: Workout Detail screen

**Files:**
- Create: `src/components/workout/WorkoutHero.tsx`, `BreakdownCard.tsx`, `AiSuggestionCard.tsx`, `StartButton.tsx`
- Create: `src/app/workout/[id]/page.tsx`
- Test: `tests/unit/workout.test.tsx`, `tests/e2e/workout.spec.ts`

**Interfaces:**
- Consumes: `localRepo.getSession`, workout-scope proposal, `TypeTag`.
- Screen source: `#5a` (lines 65–144). Uses the `#5a` palette: `--brand #6E8BEA`, `--warm #E8A87C`. Header back button (32px, 8px radius) + "PLAN · WEDNESDAY" / "JUL 1 · WEEK 7 / 16". Hero: INTERVALS tag (warm on `rgba(232,168,124,.14)`), 26px/700 title, "4.5 mi · ~45 min · 3 blocks". `BreakdownCard`: vertical structure from `session.structure` — blue dots for warmup/cooldown, warm "8×" repeat block with connector line and dashed divider between rep/float rows, right-aligned Geist durations (rep time warm). `AiSuggestionCard`: header sparkle+white, border `rgba(110,139,234,.28)`, title "Try 5 × 600m instead", rationale, three chips (last chip warm), **Accept suggestion** (brand fill, dark text) / **Keep original** (ghost) — Accept calls `decideProposal(id,"accepted")` and the breakdown re-renders with the 5×600 structure (the proposal's `after.structure`); Keep dismisses and card collapses. `StartButton`: full-width 50px green `#16e06a`, dark text — marks session `in-progress` via repo and shows an "IN PROGRESS" state (spec §10: no live recording).
- Produces: e2e path used later: `/workout/wed-400s`.

- [ ] **Step 1: Failing tests** — unit: renders "Rolling 400s", "8×", "400m hard", "Try 5 × 600m instead"; e2e: Accept suggestion → breakdown shows "600m" rows and suggestion card gone; persists on reload.
- [ ] **Step 2: Run** → FAIL. **Step 3:** Implement. **Step 4: Run** → PASS. **Step 5: Commit** `feat: workout detail with structure breakdown and AI-swap card`

---

### Task 15: Log flow

**Files:**
- Create: `src/components/log/ImportedRunCard.tsx`, `RpeScale.tsx`, `PainCheck.tsx`, `src/app/log/page.tsx`
- Test: `tests/unit/log.test.tsx`

**Interfaces:**
- Consumes: `localRepo.logRun`, `logPain`; `SegmentMeter`.
- Screen source: `#3d` (lines 450–516). Title "Log today" + date. `ImportedRunCard`: Strava-style summary ("Easy run · 4 mi", SYNCED dot, 3-col stats) from the seed's completed activity (add one to seed if missing: 4.0mi / 38:24 / 9:36). `RpeScale` (client): "HOW HARD? · RPE", value "n / 10", 10 tiles — tiles ≤ value fill `#7CB3D9`, current solid. `PainCheck` (client): area toggles (Achilles · L / R / Other), `SegmentMeter` severity picker (tap segment n → severity n, `#E8A33A`), calm note line from design. **Save log** (accent, 8px) → `logRun` + `logPain`, then `router.push("/today")`. `?focus=pain` query scrolls to PainCheck.
- Note: this screen is reached from Today's "＋ Log", Body's "+ Log soreness or injury", and (Phase 2) auto-fires on Strava sync.

- [ ] **Step 1: Failing unit test** — RPE tile 4 click → "4 / 10" shown, 4 filled tiles; PainCheck select Achilles·L + severity 2 → meter shows 2; Save persists (localRepo pains reflect severity 2 after reload of module state).
- [ ] **Step 2: Run** → FAIL. **Step 3:** Implement. **Step 4: Run** → PASS. **Step 5: Commit** `feat: post-run log flow with RPE and pain check`

---

### Task 16: Coach screen (UI shell)

**Files:**
- Create: `src/components/coach/BriefingCard.tsx`, `ChatBubble.tsx`, `QuickPrompts.tsx`, `CoachInput.tsx`, `CoachThread.tsx`
- Modify: `src/app/(tabs)/coach/page.tsx`
- Test: `tests/unit/coach.test.tsx`

**Interfaces:**
- Consumes: `localRepo.getCoachThread`/`appendChat`/`getOpenProposals`.
- Design source: approved Coach screen in `prototype.html` (`screen-coach` block). Header "COACH" 11px/700 `.13em` + history icon top-right (non-functional this phase, `aria-label="History"`). `BriefingCard`: stopwatch-in-circle + "MORNING BRIEFING · TUE" (brand), briefing text, one row per **open** proposal — "Today → swap tempo for easy 4 mi" / "This week → move long run to Sun" with "Review ›" linking to `/today` and `/plan` respectively (rows derived from `getOpenProposals()`, so decided proposals drop off). `ChatBubble({ role, children })`: coach = left with stopwatch avatar, card bg; user = right, `rgba(56,102,224,.18)` bg. `QuickPrompts`: three chips that prefill the input. `CoachInput` (client): text field, **mic button** (Web Speech API `webkitSpeechRecognition` when available — result text goes into the field; hidden if unsupported), send button (brand circle). Phase-1 send behavior (exactly this, replaced in Phase 3): append user message, then append coach message `"Noted — I'll be able to act on this once my brain comes online in Phase 3. Your message is saved."` via `appendChat`.
- Coach tone note for Phase 3 (copy left in a code comment in `CoachThread`): neutral expert, encouraging but accountable, no name.

- [ ] **Step 1: Failing test** — renders "MORNING BRIEFING", both review rows, fueling Q&A from seed; typing "test" + send appends 2 bubbles; after `decideProposal` of the day proposal, briefing shows only one review row.
- [ ] **Step 2: Run** → FAIL. **Step 3:** Implement. **Step 4: Run** → PASS. **Step 5: Commit** `feat: Coach screen shell with briefing, chat, prompts, and voice input`

---

### Task 17: Settings, PWA, full e2e sweep

**Files:**
- Create: `src/app/settings/page.tsx`, `src/app/manifest.ts`, `public/icons/icon-192.png`, `public/icons/icon-512.png` (generate: dark `#11151b` rounded square + white stopwatch glyph — script it with sharp or hand-export once)
- Test: `tests/e2e/screens.spec.ts`
- Modify: `README.md` (append a "Development" section: run/test commands, phase roadmap pointer)

**Interfaces:**
- Consumes: everything.
- Settings: card list in existing tokens — CONNECTIONS group (Whoop, Strava rows: name, status chip "Not connected", disabled Connect button labeled "Phase 2"), RACE group (Honolulu Marathon · Dec 13 · Goal 4:00, read-only), HOME TIMEZONE row (read-only "Device"). Reached from Today avatar.
- `manifest.ts`: name "Marathon Coach", `display: "standalone"`, `background_color`/`theme_color: "#11151b"`, icons 192/512.

- [ ] **Step 1: Failing e2e** `tests/e2e/screens.spec.ts` — for each of `/today /plan /coach /body /progress /workout/wed-400s /log /settings`: page loads, key heading visible (one exact-text assertion per screen: "Ease off today." / "BLOCK 2 · BUILD" / "MORNING BRIEFING · TUE" / "PAIN & INJURIES" / "PREDICTIONS" / "Rolling 400s" / "Log today" / "CONNECTIONS"), no console errors (fail test on `page.on("pageerror")`). Plus: `GET /manifest.webmanifest` returns 200 with `"display":"standalone"`.
- [ ] **Step 2: Run** → FAIL (settings/manifest missing). **Step 3:** Implement settings page + manifest + icons. **Step 4: Run full suite** `npm run test && npm run test:e2e && npx tsc --noEmit && npm run build` → all green. **Step 5:** Update `README.md` Development section. **Step 6: Commit** `feat: settings, PWA manifest, and full-app e2e coverage`

---

## Self-Review (performed)

1. **Spec coverage (Phase-1 slice):** §2 reuse rule → tokens + per-screen source-line ports (Tasks 2, 9–16); §3 IA → Task 5 shell, Log-as-flow (Task 15 entry points), Settings surface (Task 17); §4 all eight screens + deltas → Tasks 9–16 (imagery slots 13, injury manager 11, synced chart 8); §5 proposal lifecycle semantics → Task 4 repo (Accept/Modify/Dismiss provenance) exercised in UI Tasks 9 & 14 — engine itself is Phase 3 by design; §6 data shapes → Task 3 mirrors spec tables (client-side for now); §9 stack/PWA/charts → Tasks 1, 7, 8, 17; §10 Start-workout scope → Task 14; §12 test approach → per-task TDD + e2e sweep. §7 integrations, §8 imagery generation, §11 stale-data states: Phase 2/3 (roadmap section).
2. **Placeholder scan:** no TBDs; Phase-1 stub behaviors (Coach reply line, disabled Connect buttons) are exactly specified, not deferred.
3. **Type consistency:** `decideProposal(id, decision, edited?)` used identically in Tasks 4, 9, 14, 16; `PlannedSession.provenance` enum matches spec §6; seed field names in Task 3 match component consumption in Tasks 9–16 (`recoveryPct`, `hrvDeltaPct`, `structure[].repeat`, `pains[].trendDays`).
