# Honolulu Marathon Training App — Design Spec

**Date:** 2026-07-01
**Status:** Draft for review
**Owner:** Max (solo user; the app is single-user, built for his Honolulu Marathon build — race day Dec 13, ~24 weeks out)

---

## 1. Product overview

A readiness-driven marathon training app. Every day it reads the user's body (Whoop recovery, sleep, training load) and training history (Strava runs, logged pain/RPE), and **proposes** adjustments to a periodized run + strength plan spanning today through race day (8-week base + 16-week build→peak→taper; see §5). The product's spine is consent-based coaching:

> **The AI suggests; the user decides. Nothing in the plan ever changes without an explicit user decision (Accept, or Modify-and-save).**

Core capabilities:
1. Daily and weekly plan **proposals** (suggestion-only, in-context Accept / Modify / Override).
2. A **conversational AI coach** (chat + voice) that is an expert on running, training theory, and the user's own data.
3. **Recovery & vitals** views fed by Whoop.
4. **Pain & injury tracking** that bends the plan (e.g., Achilles management).
5. Periodized **run + strength** planning with AI-iterated workout variety.
6. **Progress** analytics: mileage, race predictions vs. goal (sub-4:00), fitness trend.
7. Static **AI-generated exercise illustrations** for strength movements.

## 2. Design source of truth (REVISED 2026-07-01 — "Instrument" design v2)

- **Canonical:** `design-v2/Daily Screen Directions.dc.html` + `design-v2/README.md` — the "Instrument" design system, delivered by the user mid-build and superseding the original bundle. Final screens: **`#7a` Plan, `#7b` Progress, `#7c` Recovery (Body tab), `#7d` Log, `#7e` Strength, `#7f` Coach, `#6a` Workout Detail** (anchors at HTML lines 67/152/238/317/383/466/562). All other turns in that file, the repo-root original design bundle, and `prototype.html` are **superseded history** — do not port from them except where this spec explicitly carries a feature forward.
- **Instrument visual language (binding):** flat `#0B0C0E` background everywhere; **no cards** — hairline rules `rgba(255,255,255,.09)` separate ruled sections; two bordered-box exceptions (plain hairline box, and the **corner-tick box** with a 14×14px lime bracket overlapping top-left, used for coach notes/proposals); **one signal color, lime `#C9F53F`** meaning "now / act" (today, active tab underline, current week, live endpoints, primary CTAs, coach labels) — never decorative; text greys `#fff → #e8eaec → #c3c8ce → #9aa0a7 → #8a919c → #6f757d → #5c6168 → #3f444b`; chart greys `#242930/#2d333b/#363d46`, lines `#565b62`, empty segments `#22262c`; radius **2px** on everything; fonts **Space Grotesk 500** (display), **Geist Mono 500** (uppercase micro-labels, .10–.20em tracking, nowrap), **Geist** (body + tabular numerals). **No colored tags/chips, no icons in the tab bar, no alarm colors on deltas** (vitals deltas grey; prediction deltas lime). Motion: one-shot on mount (line draw-in ~1.3s, bar rise .55s staggered, ring sweep 1.2s, meter stagger, 3.2s lime pulse on live dots).
- **Reuse rule (unchanged in spirit):** implement the seven final screens exactly as designed. The two carried features that have no Instrument mock — the **Today screen** and the **Body-tab pain/injury manager** — are composed strictly from Instrument's existing patterns (section header rows, ruled rows, corner-tick box, segment meters, thin ring) with no new design language.

## 3. Information architecture

**Five tabs (Instrument, text-only, lime underline active):** `TODAY (composed) · PLAN (#7a) · PROGRESS (#7b) · BODY (#7c + pain manager) · LOG (#7d)`

IA facts of design v2 (supersede the earlier tab decisions):
- **Coach is not a tab.** Every page header carries the lime **ASK COACH** chip (spark glyph + Geist Mono label, glow shadow) → pushes the Coach screen `#7f`, seeded with that page's context. This realizes the approved "Ambient Coach" model more fully than the old center tab; the old stopwatch-icon decision dies with the icon-less tab bar.
- **Log is a tab again** (`#7d`): Strava auto-import summary, RPE segment meter, pain chips (ACHILLES·L / ACHILLES·R / OTHER / NONE) + severity segments, SAVE LOG lime CTA. Post-run logging still auto-fires on Strava sync (Phase 2).
- **Today has no v2 mock** — it is composed from Instrument patterns: readiness section (thin ring + 62/READY + guidance, borrowing `#7c`'s hero), today's-session ruled row (lime TODAY dot, links to Workout Detail), the daily proposal in a **corner-tick box** with mono ACCEPT / MODIFY / OVERRIDE actions + drivers line, compact THIS WEEK and PREDICTED lines.
- **Pain/injury manager stays on Body** (carried user feature, no v2 mock): an Instrument-styled PAIN & INJURIES ruled section under RECOVERY · 7 DAYS — per-area ruled rows (severity segments, trend mono), body-map figure restyled to greys + lime hotspots, "+ LOG SORENESS OR INJURY" → `/log?focus=pain`.
- Non-tab screens: **Workout Detail `#6a`** (from Plan day rows / Today's session), **Strength `#7e`** (Plan's STRENGTH underline tab), **Coach `#7f`** (from ASK COACH chips), **Settings** (minimal Instrument ruled list; reachable from Today header; holds OAuth connections, race/goal, home timezone).

## 4. Screens — reuse + deltas

| Screen | Source | Deltas |
|---|---|---|
| Today | `#2a` | None visually. Wiring: rings → Body; recommendation card Accept/Modify/Override → proposal engine; session card strike-through/proposed states driven by proposal state; "＋ Log" quick action. |
| Plan | `#3c` | None visually. "Ask AI" generates a proposal; day rows → `#5a`; STRENGTH toggle → `#3e`. |
| Workout Detail | `#5a` | None visually. "Suggested by AI" card = workout-level proposal (Accept swaps breakdown; Keep original dismisses). "Start workout" marks the session in-progress (see §10 scope note). |
| Strength | `#3e` | Exercise rows gain a 42px illustration thumbnail; tapping a row opens an exercise detail (existing card style) with the full illustration, sets×reps, cue text. |
| Body | `#3b` | Appends the approved **Pain & Injuries** section: tappable body map, per-area severity (0–10 segment meter, `#FF9A3D`/`#E8A33A` treatment), trend line ("improving · 7 days"), "+ Log soreness or injury" button, history link. |
| Progress | `#3a` | None. Promoted to its own tab exactly as designed (Your Focus / This Week·Run / Predictions / Fitness). |
| Log | `#3d` | Reused as the post-run log flow (triggered, not a tab). Its pain-check writes into the same pain store the Body manager reads. |
| **Coach** | **new** | The only new screen. Chat thread; **morning briefing** message that summarizes open proposals and links out to their in-context cards (decisions happen in-context, not in chat); quick-prompt chips; text input with **voice input** (mic); conversation history. |

**Coach persona (locked):** no name, neutral expert voice — encouraging but accountable ("solid week — but you skipped two easy runs; let's not let that slide"). Tone consistent across briefing, chat, and proposal rationales.

**Charts:** line/area charts replicate the design's draw-in, with the approved fix: fill + line + endpoint reveal together via one synchronized left-to-right clip wipe (~1.3s ease), re-firing on screen entry.

## 5. AI coaching system

**Plan provenance (where the plan comes from):** The initial periodized plan is generated by the AI coach during first-run onboarding. A short Coach conversation collects the race (Honolulu, Dec 13), goal (sub-4:00), run days per week, injury history, and current fitness (seeded from Strava history once connected). The coach then generates the full block structure from start date through race day — matching the design's framing: with ~24 weeks to race, an 8-week base block (Block 1) followed by a 16-week build→peak→taper block (Block 2, the "BLOCK 2 · WEEK 7 / 16" shown in the mocks) — with every planned session carrying its structure array. The generated plan is itself presented as a **proposal**: the user reviews and accepts it before it becomes the active plan (same consent spine as everything else). Block transitions and any wholesale re-plan are likewise proposals.

Two ongoing proposal cadences + one conversational surface, all suggestion-only:

- **Daily proposal** (generated each morning): reads yesterday/today's readiness, HRV, sleep, load, pain state; may propose swapping/adjusting today's session (e.g., tempo → easy 4mi). Surfaces as Today's Recommendation card (`#2a`) with **Accept / Modify / Override** and the reviewed-at timestamp line ("nothing changes until you decide").
- **Weekly proposal** (generated at week boundary): block-level adjustments (move long run, adjust volume, deload) surfaced in Plan and in the Coach briefing.
- **Workout-level suggestions**: alternative session structures (`#5a`'s "Try 5×600m instead"), including **new workout types iterated from progress** over the block.
- **Chat coach**: full tool access to the user's plan, activities, vitals, pain history, and PRs; answers training questions (fueling, pacing, injury caution); can create proposals from conversation ("want me to write it as 3mi tempo?" → proposal object). Proposals created in chat still resolve in-context.

**Proposal lifecycle:** `proposed → accepted | modified | dismissed(override/keep-original) | expired`.
- **Accept** applies the proposed change to the plan exactly as suggested (session provenance `accepted-proposal`).
- **Modify** opens the proposed session in an editor pre-filled with the suggestion; saving applies the user-edited version to the plan (provenance `modified-proposal`). Modify is a plan-mutating action, not a dismissal.
- **Override / Keep original / Dismiss** leaves the plan untouched.
- Proposals targeting an already-completed or past session auto-**expire**.

Only Accept and Modify mutate the plan, and both are explicit user actions. Every decision is logged with its driving-metrics snapshot, and all proposals carry a plain-language rationale citing the data that drove them.

**Model/runtime:** Vercel AI SDK with the Claude API (latest Sonnet-class model) using tool-use for data reads and proposal writes. Voice input via on-device dictation (Web Speech API) feeding the same text pipeline — no server-side audio processing in v1.

## 6. Data model (Supabase Postgres, RLS on every table)

Single authenticated user (Supabase Auth), but all tables still carry `user_id` + RLS.

- `training_blocks` — block number, phase (base/build/peak/taper), week count, target peak mileage.
- `planned_sessions` — date, type (easy/speed/tempo/long/rest/strength), title, distance/duration, zone/pace targets, and a **structure array** of segments `{kind: warmup|rep|recovery|cooldown, label, zone, pace, duration, repeat}` (powers `#5a`'s breakdown), status (planned/in-progress/completed/skipped), provenance (`original` | `accepted-proposal` | `modified-proposal`).
- `activities` — Strava import: distance, time, pace, HR, date, raw payload ref; linked to a planned_session when matched.
- `recovery_snapshots` — daily Whoop: recovery %, HRV, RHR, resp rate, sleep (duration, need, efficiency, stages), strain/load.
- `pain_areas` / `pain_logs` — managed body areas (e.g., Achilles·L) and dated severity entries (0–10, note); feeds Body manager, Today card, and the proposal engine.
- `proposals` — scope (day/week/workout), target ref, diff payload (before/after session), rationale text, driving-metrics snapshot, status, decided_at.
- `chat_messages` — role, content, created_at, linked proposal ids.
- `strength_exercises` + `exercise_media` — movement library: slug, name, muscles, cues, sets×reps defaults, illustration asset ref.
- `race_predictions` — computed 5K/10K/half/full with 30-day deltas (Riegel-style estimation from recent quality efforts; exact algorithm chosen at plan time).
- `logs` — RPE entries and post-run check-ins.

## 7. Integrations

- **Whoop API (OAuth):** daily recovery/sleep/strain pull (webhook if available, else morning poll). Missing-data days degrade gracefully: rings show last-known with a stale indicator; daily proposal falls back to load + pain only and says so in its rationale.
- **Strava API (OAuth + webhook):** activity auto-import (Garmin reaches us through Strava — no direct Garmin integration). Import triggers the post-run log flow (RPE + pain check).
- **Anthropic API:** coach + proposal generation.
- No other integrations in v1.

## 8. Workout imagery pipeline

- **Style (locked, sample approved):** static flat-vector athlete illustration, dark ground (`#11151b`), slate-grey body, **working muscles tinted `#6E8BEA`**, minimal geometric shading, no text/logos, square.
- **Production:** generated manually by the user in ChatGPT (his subscription — zero API cost), using a locked style prompt where only the exercise + highlighted muscle change, and **feeding the approved reference image back in** for figure/framing consistency. ~40–60 core movements generated once.
- **In-app (revised for Instrument):** the `#7e` strength list is deliberately imagery-free (ruled checklist rows — no thumbnails). Illustrations surface on the **exercise detail** view opened by tapping a strength row (Instrument-styled: ruled section with the illustration on the flat `#0B0C0E` ground, name, sets×reps, cue). Assets stored in Supabase Storage keyed by exercise slug; generic fallback for unknown movements; no runtime generation in v1. The user's dark-ground illustration style translates to the new system unchanged (its background is already near-black); regenerate accent-tint from `#6E8BEA` to lime only if the user chooses — existing assets remain acceptable.

## 9. Platform & stack

- **Next.js 14+ App Router PWA**, mobile-first at the design's 414px frame, installable on iPhone. TypeScript strict, TailwindCSS + shadcn/ui with the design tokens mapped 1:1, Server Actions over API routes, Zod at every boundary, Supabase (Auth/DB/Storage), Vercel deployment. Charts as hand-built SVG components matching the design (no chart library needed at this fidelity).
- Fonts: Archivo + Geist (self-hosted/Google). Icons: inline SVG per design (stopwatch Coach mark, trend-line Progress mark).
- Scheduled jobs (Vercel cron): morning snapshot pull + daily proposal at **06:00 in the app's configured home timezone** (a stored setting; the cron is pinned to the corresponding fixed UTC hour and recomputed if the setting changes — note Hawaii has no DST). Weekly proposal runs Sunday evening home-time for the week ahead.

## 10. Scope decisions & non-goals (v1)

- **No live workout recording.** The design's "Start workout" marks the session in-progress; completion comes from the Strava import matching the session. (Recording is redundant with Garmin/Whoop and is explicitly out of scope; revisit post-race if ever.)
- **No auto-applied plan changes** — ever. This is a product principle, not just scope.
- No social features, no multi-user/coach-marketplace anything, no native iOS build, no animated exercise media, no in-app image generation, no notifications beyond PWA push for the morning briefing (nice-to-have, may slip).
- Predictions are informative, not prescriptive — the proposal engine keys off readiness/pain/load, not off chasing the predicted time.

## 11. Error handling & edge cases

- Integration failure or stale tokens → visible stale-data state on rings/cards, never silent zeros; re-auth prompt in settings.
- Proposal against an already-completed session → auto-expire.
- Multiple pending proposals → each decided independently; briefing lists all.
- Timezone: all "day" boundaries in the user's local timezone (Pacific/Honolulu on race week travel is a known wrinkle — day boundary follows device timezone).
- All async/server actions: typed errors surfaced as calm inline states in the existing design language (no toasts spam).

## 12. Testing

- **Vitest:** proposal-engine decision rules (readiness/pain thresholds), `deltaColor(pct)` scale, prediction math, session/activity matching, Zod schemas.
- **Playwright E2E:** tab navigation across all screens; full proposal lifecycle (see morning proposal → Accept → plan mutated; Modify → edit → save → plan reflects the edited version with `modified-proposal` provenance; Override → plan untouched); post-run log flow on simulated Strava webhook; injury log → appears in Body + influences next daily proposal (mocked AI).
- Whoop/Strava/Anthropic mocked at the integration boundary; one live smoke script per integration for manual runs.

## 13. Success criteria

1. Every screen is pixel-faithful to `Daily Screen Directions.dc.html` per its README.
2. The daily loop works end-to-end on real data: Whoop syncs → morning proposal with rationale → user decides → plan reflects the decision.
3. Strava runs auto-import and trigger the log flow without manual entry.
4. Coach chat answers with the user's actual data in context and can create proposals.
5. Pain logged in Body visibly influences the next proposal's rationale.
6. Nothing ever changes the plan without an explicit user decision — Accept applies the suggestion, Modify-save applies the user's edit; everything else leaves the plan untouched.
