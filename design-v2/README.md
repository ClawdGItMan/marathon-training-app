# Handoff: Honolulu Marathon Training App — "Instrument" design system

## Overview
A running/marathon-training app in a calm, precise, dark aesthetic we call **Instrument**: near-black graphite, hairline rules instead of cards, one lime signal color, mono micro-labels, tabular numerals, and a text-only tab bar. The final screens are **Workout Detail, Plan, Progress, Recovery, Log, Strength, and Coach** (an in-app coaching chat).

## About the Design Files
`Daily Screen Directions.dc.html` is a **design reference created in HTML** — a prototype showing intended look and behavior, **not production code to copy directly**. It renders via the bundled `support.js` runtime; **do not port `support.js`** or the `data-screen`/`<x-dc>` scaffolding into your app.

Recreate these designs in the target codebase's environment (React, SwiftUI, native, etc.) using its component patterns. Treat the HTML as the source of truth for **exact colors, spacing, and copy**.

### How to read the file
- The file is a scrollable design doc with several iteration "turns". **Only the newest two turns are the final design:**
  - **Turn 7** (`#7a`–`#7f`): Plan, Progress, Recovery, Log, Strength, Coach — FINAL.
  - **Turn 6, option `#6a`** ("Instrument"): the Workout Detail screen — FINAL. Ignore `#6b`/`#6c` (rejected alternates) and all older turns (5, 3, 2 — superseded iterations kept for history).
- The real UI is inside each phone frame: the element with `data-screen` is the app viewport (414px wide). Ignore the doc chrome (`.dv-turn`, `.dv-opt`, `.dv-olabel`, intro blurbs).
- Styling is inline, using CSS vars set on each screen root: `--f` (Space Grotesk, display), `--m` (Geist Mono, micro-labels), `--n` (Geist, body & numerals), `--sig` (#C9F53F lime), `--hair` (rgba(255,255,255,.09)).

## Fidelity
**High-fidelity.** Reproduce colors, type, spacing, and interactions pixel-accurately. Where a measurement isn't listed here, read it off the inline styles.

---

## Design Tokens

### Typography
- **Display:** `Space Grotesk` 500 — screen titles (30px, letter-spacing −.02em), item names (13.5px), block titles (15–20px), hero workout name (34px).
- **Micro-labels:** `Geist Mono` 500 — uppercase, 8–10px, letter-spacing .10–.20em. Used for section headers, context labels, tags, tab bar, buttons. All mono labels are `white-space: nowrap`.
- **Body & numerals:** `Geist` — body 11–12.5px/1.55–1.65; stat numerals 17–22px weight 500 with `font-variant-numeric: tabular-nums`; times/paces in Geist Mono 12–14px.
- Type does the hierarchy work — there are no colored tags or chips.

### Color
- Background: `#0B0C0E` (flat, everywhere)
- Hairline rule: `rgba(255,255,255,.09)` — the only separator; **no cards** except two bordered-box patterns below
- Text: white `#fff` (emphasis) → `#e8eaec` → `#c3c8ce` → `#9aa0a7` → `#8a919c` → `#6f757d` → `#5c6168` → `#3f444b` (disabled/ghost)
- Chart greys: `#242930` / `#2d333b` / `#363d46` (bars), `#565b62` (lines), `#22262c` (empty meter segments)
- **Signal (the ONLY color): lime `#C9F53F`.** It always means "now / act": today's row, active tab underline, current week bar, live chart endpoint, selected input, primary buttons, coach labels. Never decorative.
- Radius: 2px on everything (buttons, boxes, meter segments). Phone corner 40px.

### Signature patterns
- **Section header row:** mono label left (`10px/.18em/#9aa0a7`) + mono context right (`9px/#5c6168`), content below, section closed by a hairline.
- **Corner-tick box:** 1px hairline border, 2px radius, with a 14×14px lime corner bracket overlapping the top-left (2px lime borders). Used for coach notes / proposed swaps.
- **Active tab / segmented control:** mono label, active = white text + 2px lime underline (`padding-bottom` + `margin-bottom:-6px` to keep baselines aligned); inactive = `#5c6168`.
- **Primary CTA:** full-width, 50px, lime fill, `#0B0C0E` text, Space Grotesk 600 13px, letter-spacing .06em, uppercase (START WORKOUT, SAVE LOG).
- **ASK COACH button (headline feature):** lime chip — `padding:8px 13px`, 2px radius, spark SVG glyph + "ASK COACH" in Geist Mono 600 9.5px `#0B0C0E`, glow `box-shadow: 0 4px 18px -6px rgba(201,245,63,.45)`. Sits top-right of every page header.
- **Tab bar:** text-only, 5 items — TODAY · PLAN · PROGRESS · BODY · LOG — Geist Mono 9px/.14em, inactive `#5c6168`, active white + lime underline. Hairline top border. No icons, no backgrounds.

### Motion (subtle, one-shot on mount)
- Chart lines draw in: `stroke-dasharray/dashoffset` → 0, ~1.3s ease-out.
- Bar charts rise: `scaleY(.25)→1` + fade, .55s, ~35ms stagger per bar.
- Recovery ring sweeps to value, 1.2s.
- Meter segments fade in with a small stagger.
- "Live" lime dots (streak, today, chart endpoints) pulse opacity 1→.45, 3.2s ease-in-out infinite.
- Keep it barely noticeable; no motion on scroll or hover beyond standard press states.

---

## Screens
All screens: status bar (11:01, signal/battery), header (title left / ASK COACH chip right), content in ruled sections, text tab bar, home indicator.

### 1. Plan — `#7a` (tab: PLAN)
- Header: **Plan** + sub "BLOCK 2 · BUILD · WK 07/16"; ASK COACH chip.
- RUN / STRENGTH underline tabs.
- **16-WEEK BLOCK:** 16-bar periodization chart in greys, current week (7) lime; BASE/BUILD/PEAK/TAPER axis; right label "PEAK 52 MI/WK".
- **THIS WEEK** (right: "32 / 41 MI"): 7 ruled day rows — day/date mono col, session name + detail, session-type mono label right (EASY/SPEED/TEMPO/REST/LONG in grey). **Today (WED 01, Rolling 400s)** is the only colored row: lime day label, white name, pulsing lime dot + "TODAY".
- Tapping a day opens Workout Detail (`#6a`).

### 2. Progress — `#7b` (tab: PROGRESS)
- Header: **Progress**; right: pulsing lime dot + "12-DAY STREAK" + ASK COACH chip.
- Range tabs 1W · 1M · 3M · 1Y (3M active).
- **YOUR FOCUS:** "Honolulu Marathon", 16 tick marks (7 lime = weeks done), right "Dec 13 / 24 WKS LEFT".
- **THIS WEEK · RUN:** stats DISTANCE 32 mi / TIME 4:48 / AVG PACE 9:01, lime line chart on 3 hairline gridlines, MAY–JUN–JUL axis, pulsing endpoint dot.
- **PREDICTIONS** (right: "30-DAY TREND"): ruled rows — 5K 21:30 (6:55/mi, −0:24) · 10K 44:50 (7:13, −0:41) · Half 1:51:20 (8:30, −1:05) · Full 3:56:10 (vs 4:00 goal, −2:12). Deltas in lime mono.

### 3. Recovery — `#7c` (tab: BODY)
- Header: **Recovery**; right "WED · JUL 1" + ASK COACH chip.
- Hero: 96px thin ring (grey track, `#e8eaec` arc sweeping to 62%) with **62 / READY** inside; beside it "MODERATE · ↓9", "Below your 30-day baseline.", guidance line.
- **VITALS** (right "14 DAYS →"): HRV 48 ↓12% · RESTING HR 52 ↑3 · RESP RATE 14.2 br (deltas grey — no alarm colors), grey sparkline with lime endpoint.
- **SLEEP** (right "EFFICIENCY 88%"): 6:12 "OF 7:44 NEED", stacked stage bar in greys (DEEP 1:07 / REM 1:25 / LIGHT 3:08) + mono legend.
- **RECOVERY · 7 DAYS** (right "62% AVG"): dotted line chart, last dot lime; T–W axis.

### 4. Log — `#7d` (tab: LOG)
- Header: **Log**; right "WED · JUL 1" + ASK COACH chip.
- **AUTO-IMPORTED · STRAVA:** "Easy run", stats 4.0 mi / 38:24 / 9:36 /mi. (No SYNCED badge.)
- **HOW HARD? · RPE** (right "4 / 10"): 10-segment meter, first 4 lime (staggered fill), EASY→ALL-OUT axis.
- **ANY PAIN?:** bordered mono toggle chips — ACHILLES · L (selected: lime border + text on `rgba(201,245,63,.08)`) / ACHILLES · R / OTHER / NONE. **SEVERITY** (right "2 / 10"): 10 thin segments, 2 filled white. Reassurance line below.
- **SAVE LOG** lime CTA.

### 5. Strength — `#7e` (tab: PLAN, STRENGTH tab active)
- Same header as Plan; RUN/STRENGTH tabs with STRENGTH active.
- **MAX STRENGTH · DELOAD** (lime label): "Volume −20% to match easy running." + 5-segment phase line (ADAPT/HYPER/**MAX** lime/POWER/MAINT).
- **WEDNESDAY · LOWER** (right "~35 MIN"): checklist rows — thin ring checkbox, name + sub, mono sets right: Eccentric calf raises (slow 3s lower) 3×12 · Back squat (185 lb) 3×5 · Romanian deadlift 3×8 · Single-leg press 3×10 · Side plank 3×45s.
- Corner-tick **COACH** box: "Keep the calf raises slow — skip them if morning stiffness is above 3."

### 6. Workout Detail — `#6a` (opened from Plan; tab: PLAN)
- Top row: back chevron + "PLAN"; right "WED · JUL 1 · WK 07/16".
- Hero: pulsing lime dot + "INTERVALS", **Rolling 400s** (34px), stat row 4.5 mi / ~45 min / 3 blocks, hairline.
- **BREAKDOWN:** ruled rows — Warm up (Easy · Zone 2, 10:00) · lime "8×" + 400m hard (5K pace · Zone 5, 1:32) with dashed divider to 200m float (Recovery · easy, 1:05) · Cool down (Easy · Zone 1, 10:00).
- Corner-tick **COACH SUGGESTS** box: "Try 5 × 600m instead" + rationale + ACCEPT (lime underlined mono) / KEEP ORIGINAL.
- **START WORKOUT** lime CTA.

### 7. Coach — `#7f` (opened by ASK COACH; header shows BACK)
- Header: **Coach**; right pulsing dot + "HAS TODAY'S CONTEXT".
- Transcript, no bubbles: ruled blocks — coach messages left with lime "COACH · 11:01" label; user messages right-aligned grey with "YOU" label.
- Proposal inside a corner-tick box: "PROPOSED SWAP" (right "~44 MIN"), "5 × 600m at 10K pace", rationale, ACCEPT / KEEP ORIGINAL.
- Quick-prompt chips (bordered mono): WHY THIS WORKOUT? / I'M SORE / MOVE MY LONG RUN.
- Input row above tab bar: ghost "ASK ANYTHING…" + lime → send arrow.

---

## Interactions & Behavior
- Plan day rows → Workout Detail; RUN/STRENGTH tabs switch Plan content.
- ASK COACH (any page) → Coach screen, seeded with that page's context.
- ACCEPT on a proposed swap replaces the session's breakdown (8×400m → 5×600m); KEEP ORIGINAL dismisses.
- Progress range tabs re-scope the mileage chart.
- RPE segments and pain chips are single-select; SAVE LOG commits.
- Entrance animations per Motion section; charts animate once per mount.

## State Management
- `selectedRange`: '1W'|'1M'|'3M'|'1Y'
- `planMode`: 'run'|'strength'
- `selectedDay` → Workout Detail contents
- `suggestionAccepted`: swaps breakdown data
- Log: `rpe` (1–10), `painArea` (achillesL/achillesR/other/none), `painSeverity` (0–10)
- Coach: message list + page-context payload
- Sessions carry a structure array: `{kind: warmup|rep|recovery|cooldown, label, zone, pace, duration, repeat}`.

## Assets
- **No raster assets.** Icons are minimal inline SVG: back chevron, spark (coach), status-bar glyphs. Charts are hand-plotted SVG polylines — rebuild with your charting approach; exact points are in the HTML.
- Fonts: **Space Grotesk**, **Geist**, **Geist Mono** (Google Fonts / self-host).

## Files
- `Daily Screen Directions.dc.html` — design prototype. Final screens: turn 7 (`#7a`–`#7f`) + `#6a`. Older turns are superseded history.
- `support.js` — preview runtime only. **Do not port.**
