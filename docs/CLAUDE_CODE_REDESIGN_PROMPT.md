# Redesigning Medisense with Claude Code

How to get Claude Code to build the new Medisense design in your codebase, plus the prompts to paste, in order.

---

## Why Claude Code wasn't producing this design

Claude Code works from your code, not from a picture. When it opens a screen it sees the existing gradient hero, glow buttons, sparkle icons and old palette tokens, and it extends them, because matching what's there is usually the safe choice. It also tends to fix one screen at a time, so each screen drifts a little.

Three things fix that, and this pack gives you all three:

1. **A new foundation in code.** `globals.css` holds the tokens for 13 themes × 15 accents × 6 typefaces. It changes most of the look before any screen is touched.
2. **Written rules it reads every session.** `CLAUDE.design.md` gets imported from `CLAUDE.md`.
3. **A fixed order with checks.** Build the shared components first, then screens one at a time against a reference board, then a screenshot comparison and a design lint after each step.

## What's in the pack

| File | Where it goes | What it does |
|---|---|---|
| `src/app/globals.css` | replace yours (keep a backup) | All design tokens for Tailwind v4: colours per theme, accents, radius, shadows, type scale, density, motion. Compiles with Tailwind 4. |
| `src/app/theme-script.tsx` | new | Applies the saved appearance to `<html>` before first paint; migrates the old `data-palette`; follows the system setting. |
| `src/app/fonts.ts` | new | Loads the 6 typeface sets with `next/font` (only Instrument is preloaded). |
| `CLAUDE.design.md` | repo root | The design rules. Add `@CLAUDE.design.md` to your `CLAUDE.md`. |
| `scripts/check-design.mjs` | new | Fails on raw hex, gradients, Tailwind palette colours, `blue:` and sparkle icons. |
| `design-reference/*.dc.html` | repo root | The approved boards from the canvas. Claude Code reads the markup; you can open them in a browser for a look (fonts load from Google). |

**Reference boards:** `Main` (direction) · `Tokens` · `Themes` · `Accents` · `Appearance` · `Type` · `TherapistHome` · `Referral` · `Soap`. The `…Blue`, `…Navy`, `…Warm` and `…Midnight` files are the same screens in other themes.

## How to run it

1. Unzip the pack into your repo root. Commit on a new branch, for example `redesign/foundation`.
2. Add one line to `CLAUDE.md`: `@CLAUDE.design.md`
3. Add the check to `package.json`: `"check:design": "node scripts/check-design.mjs"`
4. Open Claude Code in the repo and paste **Prompt 0**. Then paste the phase prompts **one at a time**. Read the result and the screenshots before you move on. Running `/clear` between phases keeps each session focused; the rules file reloads automatically.
5. If a design skill or plugin is installed in your Claude Code (for example a "frontend-design" skill), every prompt below tells it to use it. If none is installed, the prompts still work, because `CLAUDE.design.md` carries the design judgement.
6. Have Playwright available (`npx playwright install chromium`) so Claude Code can screenshot its own work. This is what turns "looks fine to me" into an actual comparison.

---

## Prompt 0: kickoff (paste once)

```text
You are redesigning the Medisense UI. Do not change any functionality, routes, data, permissions or business rules. Only the presentation changes.

Before writing any code:
1. Read CLAUDE.design.md fully. It is the design authority for this work.
2. Read src/app/globals.css (new tokens), src/app/theme-script.tsx and src/app/fonts.ts.
3. Open and read these reference boards in design-reference/: Main.dc.html (direction and the 12 problems it solves), Tokens.dc.html, TherapistHome.dc.html, Referral.dc.html, Soap.dc.html, Appearance.dc.html. Their inline styles use the same token names as globals.css (var(--color-surface) = bg-surface). Treat them as the target look. Rebuild them with our components and Tailwind utilities, never by copying inline styles.
4. If a design skill (such as frontend-design) is available to you, load it now and apply it throughout, within the rules in CLAUDE.design.md.
5. Inventory the current UI: list every shared component in the codebase (sidebar, top bar, page header/hero, metric band, panel/card, table, tags, tabs, segmented, pills, tick, switch, select, buttons, sheet, toasts, empty/error/skeleton, avatar, live badge, charts, AI marks, phone frame, chat). For each, note its file path and every place it uses raw colours, gradients, glow, the blue: variant, data-palette or sparkle/wand icons.
6. List the old CSS token names in the previous globals.css (from git: git show HEAD~:src/app/globals.css) and map each to its new token. Where a component uses an old name, plan to replace it. If many files use an old name, add a temporary alias in globals.css under a clearly marked "legacy aliases – remove after migration" block.

Then give me: the component inventory, the old→new token map, and a short plan for Phase 1. Don't change files yet.
```

## Prompt 1: foundation (tokens, fonts, theme script)

```text
Phase 1 – foundation. Make the app run on the new tokens without redesigning screens yet.

- Wire src/app/fonts.ts and src/app/theme-script.tsx into src/app/layout.tsx: <html> gets className={fontVariables} and suppressHydrationWarning; <ThemeScript /> is the first thing in <head>. If the signed-in user has a saved appearance, render the data-* attributes on <html> on the server too.
- Remove the old theme mechanism (data-palette, the blue: custom variant, the old palette menu storage) but keep the old menu working by pointing it at saveAppearance() until Phase 7 replaces it.
- Replace old token names with the new ones across the codebase using the map from Prompt 0. Add legacy aliases only where needed, and list them.
- Run the build, typecheck and npm run check:design. Fix what you broke. Report the remaining check:design violations grouped by component (we fix those in Phase 2).
- Screenshot /, /care/referrals and /therapist at 1440×900 in data-theme="premium-light" and data-theme="clinical-blue", and show me.
```

## Prompt 2: shared components (the important one)

```text
Phase 2 – shared components. Redesign every shared component to match CLAUDE.design.md and the reference boards. This fixes about 80% of every screen.

Work through them in this order, one commit each:
Button (primary/secondary/ghost/danger, md/sm/icon, loading) → Tag system (StatusTag tinted primary vs outline meta; CaseloadTag Healthy/Watch/At Risk; LiveBadge Live/Reconnecting/Offline) → Panel/Card, CardTitle, Caption → MetricBand (flat, no tinted gradients; display figure 32–54px) → Table (sticky sunken header, label-caps, 40/36px rows, hover, selected = accent tint, numeric right-aligned, column priority + stacked cards under 768px, empty/loading rows) → Tabs (underline, sticky under top bar, counts, alert counts, arrow keys, URL) → Segmented, ChoicePills, Select listbox, SearchField, Field (label, optional, hint, error, count), TextArea auto-grow, Tick card, Switch → Stepper (vertical, phone segmented bar, stage strip – see Referral.dc.html) → Sheet (right drawer; radius-sheet; sticky footer; focus trap; Escape) and BottomSheet → Toast + banners (live message banner) → EmptyNote, ErrorNote, Skeleton → Avatar, Stars, Ring, CapacityMeter → AI language: AiMark (hollow diamond, replaces every sparkle/wand), AiDraft (surface-draft + label + "suggestions only" variant + shimmer generating state), SourceChip, RuleMark, Signature → Charts (Recharts wrappers styled from --color-series-*, --color-chart-grid, --color-chart-axis; tooltips raised + shadow-overlay).

For each component: every state (default, hover, focus-visible, active, selected, disabled, loading, error, empty), keyboard support, and dark scheme via tokens only.
After the batch: npm run check:design must pass for src/components. Then add a temporary route /design-check (dev only) that renders every component in every state, and screenshot it in premium-light, clinical-blue, navy-rail, premium-dark and high-contrast. Show me the screenshots and list anything that doesn't match the boards.
```

## Prompt 3: application shell

```text
Phase 3 – shell. Redesign Sidebar, TopBar, mobile TabBar and both PageHeader variants to match TherapistHome.dc.html and Referral.dc.html.

- Sidebar: 256px; collapsible 64px rail with tooltips (1024–1279 by default); drawer under 1024. Logo block; "Live care" pinned first with live dot; groups collapsible; sample-data groups carry a quiet "Sample" label; active item per CLAUDE.design.md §7; count badges as pills. Keep the role-based menus exactly as they are (Leadership, Admin, Supervisor, Clinician). Turn the floating "Insight" pill into a footer item in the sidebar.
- TopBar 60px sticky: breadcrumb, centred Ask Medisense field with ⌘K (opens the existing assistant panel; mark global record search as TODO if not built), + New, bell (unread dot), audit, appearance menu, account (avatar, name, role title).
- PageHeader landing (Overview, therapist home only) and compact (all other pages) per CLAUDE.design.md. Replace every gradient hero. Messages keeps its compact one-line header.
- Restyle the Ask Medisense slide-over, Audit drawer and the hidden presenter panel (minimal tool styling).
Screenshot the shell for each role at 1440, 1100 and 390 wide, in premium-light and navy-rail.
```

## Prompt 4: screens, one per prompt (repeat for each)

Use this template for every screen. Start with the three that have reference boards, then go down the list.

```text
Redesign <ROUTE> (<SCREEN NAME>).
Reference: design-reference/<BOARD>.dc.html  (if "none": apply CLAUDE.design.md and the patterns from the closest board: queues → Referral's tables, records → Referral's header + tabs + right rail, editors/sheets → Soap.dc.html, dashboards → TherapistHome's landing header + panels).

Rules:
- Keep every piece of content, every action, every status and the exact wording rules listed for this screen in the brief. Change presentation only.
- Use only shared components and token utilities. If something is missing, add it to the shared component, not a one-off.
- Compact header unless this is a landing page. Primary action: one per area. AI/Rule/People marks exactly as in §6.
- Design the loading skeleton (Suspense fallback), empty state, error state, and for live pages the Reconnecting state.
- Responsive: 1440 desktop, 1024 laptop (rail), 768 tablet (one column, 44px targets), 390 phone (stacked table cards, bottom sheets).

When done: run typecheck, tests and npm run check:design; screenshot at 1440 and 390 in premium-light and clinical-blue (and premium-dark for any clinician screen); put each next to the reference board screenshot; list every difference you see and fix the ones that aren't intentional. Then stop and show me.
```

**Order and reference boards:**

| # | Route | Reference |
|---|---|---|
| 4.1 | `/therapist` (My new patients) | `TherapistHome.dc.html` |
| 4.2 | `/care/referrals/[id]` (all five Next-step states) | `Referral.dc.html` |
| 4.3 | Session note sheet (SOAP) + signed / amended states | `Soap.dc.html` |
| 4.4 | `/care/referrals` queue | Referral (table, tags, checks) |
| 4.5 | `/care` Patient onboarding | Referral (queue) + TherapistHome (live banner) |
| 4.6 | `/care/[clientId]` admin record + **match picker** | Referral (header, tabs, rail) |
| 4.7 | `/care/therapists`, `/care/therapists/[id]`, Add therapist sheet | Referral, Soap (sheet) |
| 4.8 | `/care/billing`, `/care/billing/[id]` (+ print layout) | Referral (table), Type (invoice rows) |
| 4.9 | `/telehealth/recordings` | Referral; danger zone per §9 |
| 4.10 | `/profile` + **Appearance** section | `Appearance.dc.html` (see Prompt 7) |
| 4.11 | `/therapist/patients/[id]` | Referral + TherapistHome |
| 4.12 | `/therapist/assessments/[id]` | Soap (fields, AI) + Referral (sticky rail) |
| 4.13 | `/therapist/plans/[id]` | Soap + Referral |
| 4.14 | Visit sheet, Discharge sheet, Cancel/change sheet, Reason sheet, Visit list rows | Soap (sheet anatomy) |
| 4.15 | `/telehealth/room/[visitId]` (always-dark stage) | §11 tokens `call-*` |
| 4.16 | `/messages` | TherapistHome (toast) |
| 4.17 | `/login`, `/refer`, `/refer/app`, `/refer/track/[token]`, `/join/[token]` | Referral (stepper), Soap (fields) |
| 4.18 | `/mobile/patient` (all tabs, overlays, phone frame) | patient card in `Type.dc.html`; §11 |
| 4.19 | `/` Overview, then the remaining sample modules (§3.3 of the brief), one per prompt | TherapistHome (landing), Tokens (charts) |

## Prompt 5: design critique pass (after every 3–4 screens)

```text
Act as a demanding product designer reviewing the screens changed since <commit>. For each screen, screenshot 1440 and 390 in premium-light, clinical-blue and premium-dark, then check:
1. Hierarchy: one clear primary action per area; the eye lands on the right thing first.
2. Consistency: same header, panel, table, tag, tabs and sheet anatomy as the other screens; same spacing (4px grid, 24px panel gaps, 40px gutters).
3. Calm: no gradients, glow or resting shadows; colour only for meaning; no more than one tinted tag per row.
4. Type: display face only ≥ 24px; labels in label-caps; numbers tabular and right-aligned.
5. Three layers: every AI output is on the draft surface with the AI mark; rules use the Rule mark; signatures show name, time and lock.
6. States: skeleton, empty, error, disabled-with-reason all present.
7. Accessibility: focus ring visible, 44px targets on touch, labels on icon buttons, contrast in every theme.
List problems by severity, fix them, and show before/after screenshots.
```

## Prompt 6: data and sample modules sanity

```text
Check the sample modules still show the same synthetic figures after the redesign (293 active patients, 72 appointments, 17 notes due, 83% capacity, 351 places, Sarah 27/25, Emma 18/24, 428 goals). Check every visible string uses "patient" (not "client") and "Did not attend" (not "no-show"), and that caseload labels are Healthy / Watch / At Risk. Report and fix.
```

## Prompt 7: Appearance settings

```text
Build the Appearance section in /profile and the top-bar quick menu, matching design-reference/Appearance.dc.html (open it and read its logic: it is a working prototype).
- Theme cards with real mini-previews in Light and Dark groups, each card shows "Current / Retired" and the paired accent; choosing one of the user's current palettes also selects its paired accent.
- Match system switch with a chosen light + dark pair.
- 15 accent swatches + Custom (hue, saturation, hex) that generates the 6 accent values and checks contrast against the active theme's page, surface and sunken (port the genAccent() and warnings from the board's script); warn when within 18° of the red/amber/green status hues.
- Typeface (6 options), Density (Comfortable/Compact), Text size (Default/Large/Larger), Reset to defaults.
- Live preview pane (sidebar item, metric card, table row with tags, focused input, primary button, chart, AI draft card).
- Save with saveAppearance() from theme-script.tsx, then persist to the user's profile so it follows them across devices. The patient app and public pages follow the user's choice, or the system setting when signed out. The video room stays dark.
```

## Prompt 8: final sweep

```text
Final sweep: remove /design-check and all legacy token aliases; npm run check:design passes for the whole of src; every route renders its skeleton, empty and error states; theme switch has no flash on reload in all 13 themes; keyboard-only pass through sidebar, tabs, sheets and listboxes; reduced-motion pass. Produce a short handoff note: components added or changed, anything intentionally left, and any TODOs (e.g. global record search).
```

---

## Tips that make a big difference

- **One screen per prompt.** "Redesign the whole app" gives thin, inconsistent results; one screen with a reference and a screenshot loop gives these boards.
- **Always ask for screenshots and a comparison** against the reference board. Without seeing its output, Claude Code can't judge the design.
- **When something looks off, describe it precisely:** "the header is 180px; it should be ~104px with the title at 32px," not "make it nicer."
- **Stop drift early.** If a screen invents a new style, say "move that into the shared component or remove it," before continuing.
- **Keep the canvas as the source of truth.** If you change the design, change it on the canvas first, then re-export the board into `design-reference/`.
