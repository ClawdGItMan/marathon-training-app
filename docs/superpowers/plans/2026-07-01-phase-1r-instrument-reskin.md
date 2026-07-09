# Phase 1R: Instrument Reskin & Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Continues the SDD run recorded in `.superpowers/sdd/progress.md` (Tasks 1–11 complete under design v1).

**Goal:** Re-skin the built foundation to the Instrument design system (`design-v2/`) and complete all remaining screens, ending Phase 1 as a pixel-faithful installable PWA of design v2.

**What survives v1 unchanged:** domain schemas, repository + decision semantics + tests, routing, Vitest/Playwright infra, client-screen loading pattern, chart animation architecture. **What changes:** tokens/fonts, tab bar, primitives' visual layer, chart palettes, the three built screens re-ported, five screens newly built.

**Design citations:** `design-v2/Daily Screen Directions.dc.html` — `#7a`@67 Plan · `#7b`@152 Progress · `#7c`@238 Recovery · `#7d`@317 Log · `#7e`@383 Strength · `#7f`@466 Coach · `#6a`@562 Workout Detail. Tokens/patterns: `design-v2/README.md` (binding, mirrored in spec §2).

## Global Constraints (supersede v1 plan's)

- Bg `#0B0C0E` flat; hairline `rgba(255,255,255,.09)`; NO cards; radius 2px; signal lime `#C9F53F` only for "now/act"; no colored tags/chips; no tab icons; no alarm-colored deltas (vitals grey, predictions lime).
- Fonts: Space Grotesk 500 display (`--font-display`), Geist Mono 500 micro-labels (`--font-mono`, uppercase, tracked, nowrap), Geist body/numerals (`--font-num`, tabular-nums).
- Signature patterns: section header row (mono label left / mono context right, hairline close); corner-tick box (hairline box + 14×14 lime bracket top-left); lime-underline active tabs; 50px lime CTA (dark text, Space Grotesk 600 13px .06em uppercase); ASK COACH lime chip on every page header → `/coach`.
- Tab bar: text-only TODAY · PLAN · PROGRESS · BODY · LOG (Geist Mono 9px/.14em; inactive `#5c6168`; active white + 2px lime underline; hairline top).
- Motion: one-shot mount only — line draw ~1.3s, bar rise .55s/35ms stagger, ring sweep 1.2s, meter stagger, 3.2s lime pulse on live dots; respect prefers-reduced-motion (established pattern).
- Keep: TS strict, Zod boundaries, components <150 lines, named exports, conventional commits, TDD per task, AreaLineChart's single-`<g>` synchronized reveal for any filled chart.
- Carried features without v2 mocks (spec §3): Today screen composition; Body pain manager. Compose ONLY from Instrument patterns.

## Tasks

### R2: Instrument tokens, fonts, tab bar, page header
Files: `globals.css`, `layout.tsx`, `TabBar.tsx`, new `components/shell/PageHeader.tsx` + `AskCoachChip.tsx`; remove `lib/delta-color.ts` + its test (design kills the scale); update `tests/e2e/nav.spec.ts` (5 tabs incl LOG, no COACH tab; coach reachable via ASK COACH chip from /today) + stub `/log` tab route (full screen in R10; keep old /log flow page reachable there).
Steps: retheme `@theme` (kill v1 color tokens, add instrument greys/sig/hair; radius 2px), swap fonts (Space_Grotesk, Geist, Geist_Mono via next/font), rewrite TabBar per README §Tab bar, PageHeader `{title, sub?, right?}` renders title (30px Space Grotesk −.02em) + right slot + AskCoachChip (spark SVG + label, glow, → /coach?from=<tab>), fix all now-broken references/tests, suite+build green. Commit `feat: instrument design tokens, text tab bar, page header`.
Note: v1-styled screens will look half-migrated until R5–R7 — acceptable mid-flight; tests keyed to text content stay green.

### R3: Primitives restyle
Files: `SectionHeader.tsx` (mono label/context + hairline close; keep props, add `context?` replacing `action` semantics — keep `action` alias working), new `CornerTickBox.tsx` `{label?, context?, children}`, `TypeTag.tsx` → mono grey session label (no chip bg, keep prop API), `SegmentMeter.tsx` restyle (thin 2px segments, `#22262c` empty, fill color prop default lime, mount stagger), `ProgressTicks.tsx` (lime done, `#22262c` rest), `StatGrid.tsx` (mono 8-9px labels, Geist numerals 17-22px, hairline column rules), delete `Card.tsx` usages progressively (R5-R7) — here just add `Section.tsx` wrapper (padded ruled block). Update primitive tests to new assertions. Commit `feat: restyle primitives to instrument ruled-section system`.

### R4: Charts restyle
Files: the 5 chart components + tests. AreaLineChart: default fillOpacity 0 (pure line), lime default, hairline gridlines, optional pulsing endpoint dot (3.2s lime pulse), keep synced wipe when filled. Sparkline: grey `#565b62` + lime endpoint dot option. RingGauge: thin stroke (~5 in 104-viewBox terms), track `#242930`, arc `#e8eaec` default. DotTrendChart: dotted connecting line, grey dots, last dot lime + pulse. PeriodizationBars: greys `#242930/#2d333b/#363d46`, current week lime, rise animation staggered. SleepStagesBar: grey stages `#363d46/#2d333b/#242930`-family per design, mono legend. Commit `feat: restyle charts to instrument palette and motion`.

### R5: Seed shift + Today re-port (composed)
Seed: today = **WED JUL 1, wed-400s** (`todaySessionId`); proposals[0] retargets wed-400s (before = Rolling 400s speed session, after = easy 4mi swap, HOLD, same drivers); predictions deltaSec → v2 values (read from `#7b` HTML: 5K −0:24, 10K −0:41, HALF −1:05, FULL −2:12 → 24/41/65/132); focus ticks 7 done / 16 total; week rows match `#7a` (MON 29 easy done … SUN 05); update domain/repo/unit/e2e tests accordingly (repo semantics unchanged).
Today screen (composition per spec §3): PageHeader "Today" + date context; READINESS ruled section (96px thin ring 62/READY + "MODERATE · ↓9" + guidance); corner-tick box "TODAY'S RECOMMENDATION" (HOLD context, headline, subhead, rationale, drivers line in mono, mono actions **ACCEPT** (lime underline) / **MODIFY** / **OVERRIDE**; ModifySheet survives restyled — hairline box, mono labels, lime save); TODAY'S SESSION ruled row (pulsing lime dot + TODAY, session name/detail, → /workout/[id]); THIS WEEK line (32 / 41 MI + long run); PREDICTED line (3:56:10 vs 4:00 lime delta → /progress). Settings entry: mono "SETTINGS" text link in header right slot (design has no avatar). Update today unit+e2e (same behavioral assertions, new text where changed). Commit `feat: re-port Today to instrument composition with v2 seed context`.

### R6: Progress re-port (#7b lines 152–237)
Header streak "12-DAY STREAK" pulsing dot; range underline-tabs; YOUR FOCUS 16 ticks/7 lime + "DEC 13 / 24 WKS LEFT"; THIS WEEK · RUN stats + lime line chart, 3 hairline gridlines, MAY–JUN–JUL, pulsing endpoint; PREDICTIONS ruled rows w/ lime mono deltas; **Fitness card deleted** (not in v2). Keep range-slicing behavior + tests (point counts unchanged). Commit `feat: re-port Progress to instrument (#7b)`.

### R7: Body re-port (#7c lines 238–316) + pain manager restyle
Recovery per #7c exactly (hero ring 96px `#e8eaec` arc + 62/READY inside; VITALS w/ grey deltas + grey sparkline lime endpoint; SLEEP w/ "EFFICIENCY 88%" context + grey stages; RECOVERY · 7 DAYS dotted chart "64% AVG" computed). PAIN & INJURIES carried section (spec §3): section header + ruled per-area rows (name mono, n/10 numerals, thin segment meter white fill, trend mono — improving lime/steady grey), body-map figure restyled (greys, lime hotspots, aria semantics preserved), "+ LOG SORENESS OR INJURY" hairline button → /log?focus=pain. Keep efficiency-88 regression guard + hotspot tests. Commit `feat: re-port Body to instrument with carried pain manager`.

### R8: Plan (#7a lines 67–151) + Strength (#7e lines 383–465)
Plan: PageHeader + "BLOCK 2 · BUILD · WK 07/16" sub; RUN/STRENGTH underline tabs; 16-WEEK BLOCK bars (current lime, "PEAK 52 MI/WK" context); THIS WEEK 7 ruled day rows (today WED 01 lime w/ pulse dot, session-type mono labels, → /workout/[id]). Strength (STRENGTH tab): MAX STRENGTH · DELOAD lime label + phase line (MAX lime); WEDNESDAY · LOWER checklist (thin-ring checkboxes, mono sets, "(185 lb)" subs per #7e); corner-tick COACH box ("Keep the calf raises slow…"); tapping a row → exercise detail sheet (Instrument-styled, illustration slot w/ generic fallback per spec §8). New unit tests + e2e (plan.spec.ts: day row → workout detail; strength toggle). Commit `feat: Plan and Strength screens (#7a/#7e)`.

### R9: Workout Detail (#6a lines 562–end of its block)
Back chevron + PLAN / context date; hero (pulsing INTERVALS dot, Rolling 400s 34px, stat row, hairline); BREAKDOWN ruled rows (lime 8× label, dashed divider rep→float); corner-tick COACH SUGGESTS box (Try 5×600m + rationale + ACCEPT lime-underline / KEEP ORIGINAL) wired to workout proposal (accept swaps breakdown — existing repo semantics + e2e preserved); START WORKOUT lime CTA (marks in-progress). Uses AppShell (tab bar visible, PLAN active). Commit `feat: Workout Detail (#6a) with proposal swap`.

### R10: Log tab (#7d lines 317–382)
Full Log screen as the LOG tab: AUTO-IMPORTED · STRAVA section (no SYNCED badge); RPE 10-segment meter (lime fill, EASY→ALL-OUT axis, staggered); ANY PAIN? bordered mono chips (ACHILLES·L selected style lime border/text on rgba(201,245,63,.08) / ACHILLES·R / OTHER / NONE); SEVERITY 10 thin segments white; reassurance line; SAVE LOG lime CTA → logRun+logPain → /today. `?focus=pain` scrolls to pain section. Port/adapt v1 log unit tests. Commit `feat: Log tab (#7d) with RPE and pain chips`.

### R11: Coach (#7f lines 466–561) + context wiring
Transcript (no bubbles): ruled blocks, lime mono "COACH · 11:01" labels, right-aligned grey user blocks "YOU"; corner-tick PROPOSED SWAP box (ACCEPT/KEEP wired to workout proposal via repo); quick-prompt bordered chips; input row (ghost "ASK ANYTHING…" + lime send); header "HAS TODAY'S CONTEXT" pulsing dot; Phase-1 send behavior unchanged (fixed offline reply, persisted). ASK COACH chips pass `?from=` context → seeds a mono context line in the transcript ("CONTEXT: PLAN · WK 07/16" style). Reconcile seed coach copy with #7f transcript copy (canonical). Back behavior: header BACK returns to origin tab. Update coach tests. Commit `feat: Coach screen (#7f) with page-context seeding`.

### R12: Settings, PWA, sweep, cleanup
Settings: Instrument ruled list (CONNECTIONS Whoop/Strava "NOT CONNECTED" + disabled mono CONNECT "PHASE 2"; RACE line; TIMEZONE line). PWA: manifest theme/background `#0B0C0E`, regenerate icons (dark square + lime spark glyph). Full e2e sweep updated (all 8 routes + heading assertions + no console errors + manifest 200). Cleanup: delete `Card.tsx` if unreferenced, dead v1 tokens, unused exports; `npm run build` + full suites green; README Development section updated (design-v2 canonical). Commit `feat: settings, PWA, e2e sweep on instrument system`.

## Self-review
- Spec §2/§3/§4 v2 revisions each map to a task (R2 IA/tokens; R5-R11 screens; R7 carried manager; R8 imagery-slot deferral; R12 settings/PWA).
- v1 behavioral contracts preserved: proposal lifecycle (R5/R9/R11), efficiency-88 guard (R7), range slicing (R6), log semantics (R10), reduced-motion (R2/R4).
- No placeholders; exact design citations per task; deltaColor removal is explicit (R2) with test deletion named.
