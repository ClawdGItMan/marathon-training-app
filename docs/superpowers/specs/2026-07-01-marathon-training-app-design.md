# Honolulu Marathon Training App — Design Spec

**Date:** 2026-07-01
**Status:** Draft for review
**Owner:** Max (solo user; the app is single-user, built for his Honolulu Marathon build — race day Dec 13, ~24 weeks out)

---

## 1. Product overview

A readiness-driven marathon training app. Every day it reads the user's body (Whoop recovery, sleep, training load) and training history (Strava runs, logged pain/RPE), and **proposes** adjustments to a periodized 16-week run + strength plan. The product's spine is consent-based coaching:

> **The AI suggests; the user decides. Nothing in the plan ever changes without explicit Accept.**

Core capabilities:
1. Daily and weekly plan **proposals** (suggestion-only, in-context Accept / Modify / Override).
2. A **conversational AI coach** (chat + voice) that is an expert on running, training theory, and the user's own data.
3. **Recovery & vitals** views fed by Whoop.
4. **Pain & injury tracking** that bends the plan (e.g., Achilles management).
5. Periodized **run + strength** planning with AI-iterated workout variety.
6. **Progress** analytics: mileage, race predictions vs. goal (sub-4:00), fitness trend.
7. Static **AI-generated exercise illustrations** for strength movements.

## 2. Design source of truth

- `Daily Screen Directions.dc.html` + `README.md` (repo root) are **canonical** for all visual design: exact colors, tokens, spacing, copy, and per-screen layouts. Screens are referenced by their stable ids: `#2a` Daily/Today, `#3a` Progress, `#3b` Recovery, `#3c` Plan, `#3d` Log, `#3e` Strength, `#5a` Workout Detail.
- `prototype.html` (repo root) is the **approved navigation model**: the same screens stitched together with the final 5-tab bar, the new Coach screen, the Body-tab injury manager, and the synchronized chart-reveal animation. It was reviewed and approved by the user.
- **Reuse rule:** implement screens exactly as designed. New UI (Coach screen, injury manager, imagery slots) must be assembled from the existing token/card system (fonts Archivo + Geist, card surface `#171c23`, 10px/8px radii, accent `#3866e0`, Coach-surface accents `#6E8BEA`/`#E8A87C`, session-type colors, `deltaColor(pct)` scale). No new design language.

## 3. Information architecture

**Five tabs:** `TODAY (#2a) · PLAN (#3c) · COACH (new) · BODY (#3b) · PROGRESS (#3a)`

Deltas from the original mock's tab bar (approved):
- **Progress replaces LOG** in the bar (rising trend-line icon).
- **Coach uses a stopwatch icon**, accent-tinted, center position.
- **Log is an action, not a destination.** The `#3d` Log screen is retained as a flow, not a tab:
  - Run logging (auto-import summary, RPE, post-run pain check) fires automatically when a Strava activity syncs, and is reachable from Today ("＋ Log") and Plan/session flows.
  - Injury/pain **management** (ongoing areas, severity history) lives in **Body**.
- Non-tab screens: **Workout Detail `#5a`** opens by tapping any session (Today, Plan). **Strength `#3e`** is the STRENGTH mode of Plan's RUN/STRENGTH toggle.
- **Settings** (minimal, no new design language): opened from the profile avatar in Today's top-left (already in the `#2a` design). Contains Whoop/Strava connection status + OAuth connect/re-auth (this is also where first-run connection happens), race/goal details, and home timezone. A simple card list in the existing token system.

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
- **In-app:** assets stored in Supabase Storage, keyed by exercise slug; thumbnail in `#3e` rows, full image on exercise detail. Unknown/novel movements fall back to a generic illustration (no runtime generation in v1; API-based on-demand generation is an explicit future option).

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
- **Playwright E2E:** tab navigation across all screens; full proposal lifecycle (see morning proposal → Accept → plan mutated; Override → plan untouched); post-run log flow on simulated Strava webhook; injury log → appears in Body + influences next daily proposal (mocked AI).
- Whoop/Strava/Anthropic mocked at the integration boundary; one live smoke script per integration for manual runs.

## 13. Success criteria

1. Every screen is pixel-faithful to `Daily Screen Directions.dc.html` per its README.
2. The daily loop works end-to-end on real data: Whoop syncs → morning proposal with rationale → user decides → plan reflects the decision.
3. Strava runs auto-import and trigger the log flow without manual entry.
4. Coach chat answers with the user's actual data in context and can create proposals.
5. Pain logged in Body visibly influences the next proposal's rationale.
6. Nothing ever changes the plan without an explicit user Accept.
