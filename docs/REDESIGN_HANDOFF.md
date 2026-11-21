# Redesign handoff (branch `redesign/foundation`)

The Medisense redesign from the Claude Design pack, built in phases 1–8. Presentation only: no routes, data, permissions or business rules changed.

## What changed

| Phase | Commit | Summary |
|---|---|---|
| Pack | `5e5e5e3` | Design rules (`CLAUDE.design.md`), reference boards (`design-reference/`), design lint, fonts and theme script as delivered |
| 1 Foundation | `44d15e5` | New `globals.css` (13 themes × 15 accents × 6 typefaces, density, text size); fonts and theme script wired in; old palette mechanism removed; token renames |
| Dev fix | `44aa102` | Browser reload loop fixed (Turbopack persistent dev cache off) |
| 2 Components | `d1fd70e` | Buttons, tags, AI / Rule / Signature language, panels, metric band, tables, tabs, sheet, toasts, avatars, charts |
| 3 Shell | `aa52674` | Sidebar (Live care first, Sample groups fold), 60px top bar with ⌘K, compact and landing page headers |
| 4 Screens | `ab59a9a` | Sans panel titles, responsive tables, precaution callouts, print layout, old hooks removed |
| 6 Wording | none | Checked: "patient", "Did not attend", Healthy / Watch / At Risk, sample figures unchanged |
| 7 Appearance | `38ce10a` | Appearance in My profile and the top-bar menu; custom accent with contrast checks; saved to the profile |
| 8 Sweep | this commit | Legacy colour aliases migrated and removed; `/design-check` removed |

## Components added or changed

- **New:** `components/ui/toast.tsx` (`toast()` and `<Toaster />`), `components/ui/print-button.tsx`, `features/appearance/*`, `lib/appearance.ts`, `app/api/me/appearance`.
- **AI language** (`components/ai/provenance.tsx`): `AiIcon` (hollow diamond; `PenNib` is an alias), `AiDraft` (with `suggestionsOnly` and `generating`), `AiChip`, `RuleIcon` / `RuleMark`, `Signature`.
- **Button:** variants primary / secondary / ghost / danger; sizes md / sm / icon / icon-sm; `loading`.
- **Tag** tones: healthy, watch (monitor is an alias), over, available, neutral, meta / outline, live.
- **Table:** stacks into cards under 768px. Real `<table>`s use `.table-stack`.
- **PageHeader / ScreenTitle:** compact by default; `display` gives the landing panel.
- **User record:** `appearance` field; `SessionUser.appearance`.

## Kept as tokens (not legacy)

`--shadow-focus`, `--shadow-focus-dark`, `--shadow-flag`, `--shadow-rule-over`, `--shadow-rule-accent`, `--shadow-hairline` and `--shadow-underline-accent` are token-based rings and edge rules that shared components use.

## Intentionally left

- The weekly schedule calendar and the permission matrix still scroll sideways on phones; they only make sense as grids.
- The cancelled-visit hatch in the schedule is a pattern (marked `design-ok`) so the status doesn't rely on colour.
- `lib/appearance.ts` holds literal colours for previews of other themes; it's excluded from the design lint for that reason.
- Retired `/design-preview` mock-ups only redirect; they're excluded from the lint.
- Sidebar breakpoints: rail from 768px to 1279px and the tab bar below 768px (the brief suggests a drawer under 1024px).

## TODO

- Global record search in the Ask Medisense field (⌘K focuses the field; the assistant answers but there's no record search yet).
- Patients and families can't choose a theme in the patient app yet; it follows the device's saved choice.
- Each live screen should start calling `toast()` after decisions (accept, sign, issue) as it's revisited.
- Signed-in screens weren't checked visually in this pass (no test password in the sandbox). Please walk the live care flow in Premium Light, Clinical Blue and Premium Dark.
- The project-wide `pnpm lint` (99 errors) and `format:check` failures predate this branch. The files this branch touched pass both.

## Checks

- `pnpm typecheck`, `pnpm test` (44 tests) and `pnpm check:design` pass.
- All 13 themes apply before first paint. A saved old palette migrates (for example `navy` becomes Navy rail).
- Appearance: theme, accent and a custom accent (with the status-hue warning) persist across reloads.
