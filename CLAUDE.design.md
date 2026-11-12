# Medisense design rules

> Paste this section into the repo's `CLAUDE.md` (or keep it as `CLAUDE.design.md` and add the line `@CLAUDE.design.md` to `CLAUDE.md`). These rules apply to every UI change. If a request conflicts with them, follow the rules and say so.

**North star:** a calm, precise clinical instrument with editorial confidence. Quiet neutral surfaces. Colour only where it means something. One honest visual language for what AI drafted, what a rule computed and what a person signed.

**Reference:** `design-reference/*.dc.html` are the approved designs (open them in a browser, or read the markup). Their inline `var(--color-…)`, `var(--radius-…)` and `var(--font-…)` names are the same tokens as `src/app/globals.css`. Match them; don't copy their inline styles. Rebuild them with our components and Tailwind utilities.

## 1. Tokens only

- Every colour, radius, shadow, font and type size comes from `src/app/globals.css`. Use utilities: `bg-surface`, `bg-sunken`, `text-ink-900/700/500`, `border-border`, `rounded-card`, `rounded-control`, `rounded-tag`, `shadow-overlay`, `text-body`, `text-h1`, `font-display`, `font-mono`.
- **Never** write a hex, `rgb()`, `oklch()` or Tailwind palette colour (`blue-600`, `gray-200`) in a component. Never use `bg-gradient-*`, `from-*`/`to-*`, glow shadows or `blur` decoration.
- Theme, accent, typeface, density and text size switch only through attributes on `<html>` (`data-theme`, `data-scheme`, `data-accent`, `data-type`, `data-density`, `data-text`). Components never branch on theme. For a dark-only tweak use the `dark:` variant.
- Remove the old `blue:` variant and `data-palette` everywhere; `theme-script.tsx` migrates saved palettes.

## 2. Surfaces and depth

- Page background `bg-page`. Panels/cards: `bg-surface border border-border rounded-card`, **no shadow at rest**. Hover lift on interactive cards only: `hover:shadow-lift`.
- Shadows only on overlays: menus, popovers, sheets, toasts → `shadow-overlay`.
- Separation is a 1px hairline (`border-border`). Inputs and outline tags use `border-border-strong`.
- Table headers and wells: `bg-sunken`. Selected row: `bg-accent-tint`.

## 3. Typography

- Three families from tokens: `font-display` (titles, big figures, greetings), `font-sans` (everything else), `font-mono` (MSR-…, INV-…, support item numbers, ⌘K hints).
- **Display face only at 24px and above, and never bold.** Use the `type-display` utility (sets weight and tracking per typeface). Panel titles, tabs, labels and buttons are always sans.
- Scale: `text-display` 54 · `text-h1` 36 (32 in compact headers) · `text-h2` 24 · `text-section` 16/600 · `text-body` 14 · `text-small` 13 · `text-caption` 12 · `label-caps` 11/600/0.08em uppercase.
- Tabular figures are on globally. Amounts are right-aligned.
- Australian English, plain words. "patient" (never "client"), "Did not attend" (never "no-show"). Dates `Tue, 10 Nov`, times `10:30 am`, AUD.

## 4. Colour means something

- The **accent** is for the primary action (`bg-accent-fill text-on-accent hover:bg-accent-fill-hover active:bg-accent-fill-pressed`), links (`text-accent`), selection (`bg-accent-tint`), the active tab underline, the active sidebar bar, progress and the focus ring. Nothing else.
- **Semantic colours never take the accent:** `healthy` (Healthy, Paid, Accepted, Confirmed), `watch` (Watch, Needs information, Pending Signature, Partially Paid), `over` (At Risk, precautions, errors, Disputed), `available` (info, In progress), `live`. Each has text / `-bg` / `-dot`.
- Status is never colour alone; every tag has a text label. Caseload scale is exactly **Healthy < 60 · Watch 60–79 · At Risk ≥ 80** (never "Monitor" in the UI).

## 5. Status hierarchy

- One **primary status tag** per row or record: tinted (`bg-{tone}-bg text-{tone}`, dot + label, `rounded-tag`, 12px/600).
- Everything else is **secondary meta**: Telehealth, Patient confirmed, Invoiced, series position. Show it as an outline tag (`border border-border-strong text-ink-700`) or an icon + text in `text-ink-500`. Never tinted.
- Checks columns (Risk review, Possible duplicate, "n to confirm") are small icon tags.

## 6. The three layers (AI · Rules · People)

| Layer | Look | Component |
|---|---|---|
| **AI drafts and suggests** | `surface-draft` (dashed `draft-rule` edge on `draft` surface) + the hollow-diamond AI mark + label "AI draft" or "AI … · suggestions only". Source chips when there are sources. | `<AiDraft>`, `<AiMark>`, `<SourceChip>` |
| **Rules compute and route** | Solid outline (`border-border-strong`), rounded-square plus icon, label "Rule" or "Automation". Never the AI mark. | `<RuleMark>` |
| **People decide and sign** | Signature block: name (display face, 24px+) or name in semibold, role, date/time, lock icon. | `<Signature>` |

- Remove every sparkle / wand icon. AI provider or model names never appear in the UI.
- AI generating = calm shimmer on the draft surface (`role="status"`), never a typing effect. Under reduced motion, a progress line.
- AI never drafts the clinical Assessment field; it may flag what's missing.

## 7. Layout

- Shell: sidebar 256px (64px rail at 1024–1279, drawer + bottom tab bar under 1024) · top bar 60px, sticky · content gutter 40px desktop / 24 tablet / 16 phone.
- Sidebar: "Live care" pinned first with a live dot; groups for sample modules carry a quiet "Sample" label; active item = `bg-sidebar-active text-sidebar-active-ink` + 3px accent inset bar; count badges are pills (`bg-accent-tint text-accent`; waiting/alert counts `bg-over-bg text-over`).
- Top bar: breadcrumb · centred Ask Medisense field with ⌘K · + New · bell · audit · appearance · account (avatar, name, role).
- **Page headers, two variants only:**
  - `PageHeader variant="landing"`: Overview and therapist home only. A flat `bg-surface` panel, eyebrow, `text-display` greeting, one summary line, status on the right. No gradient, no photo inside working screens.
  - `PageHeader variant="compact"` (everything else, about 104px): back link, `text-h1-compact` title, status tag, Live badge, one meta line (age · suburb · funding · `font-mono` reference), actions on the right (one secondary, ghost for the rest, danger as red ghost text, overflow ⋯).
- Tabs: one `<Tabs>` component, underline style, sticky directly under the top bar, counts as pills, alert counts in `over`, arrow-key navigation, selected tab in the URL.
- Records: main column + sticky right rail (Next step, Before signing). Queues: filters on top, table, inline status. 12-column grid, 24px gaps.
- Tables: rows `row` (40px; 36 compact), sticky header in `bg-sunken`, `label-caps` headers. Each column has a priority: under 1024 hide P3, under 768 stack rows into cards (P1 fields + primary status).

## 8. Choosing a control

- **Segmented** = filter or switch a view (≤ 6 options).
- **Choice pills** = one answer in a form (≤ 7), `role="radiogroup"`.
- **Select (custom listbox)** = long lists; never a native `<select>`.
- **Tick card** = declarations and consents.
- **Switch** = on/off settings that apply immediately.
- Buttons: `primary` (one per area), `secondary` (outline), `ghost`, `danger`, in `md` (40px) and `sm` (32px); icon buttons need `aria-label`. Press: `active:scale-[0.98]`.

## 9. Feedback and states

- Every page has a skeleton that matches its layout (the Suspense fallback), an empty state (dashed card, one sentence, one action), an error state (message + Retry) and, for live pages, a Reconnecting state on the Live badge.
- After a decision show a toast (`role="status"`, bottom-right, `shadow-overlay`). Saving shows inline "Saved · 2:48 pm". Field errors sit under the field (`text-over`) plus a summary at the top of the sheet that links to each field.
- Blocked actions explain why next to the button (like the accept-blocker list). Disabled primary = `bg-sunken text-ink-500` with the reason underneath.
- Destructive actions (Discharge, Decline, Void, Delete recording, Deactivate) always need a deliberate confirmation.
- Live updates never shift the layout: reserve space for badges and new rows, and slide new items in.

## 10. Motion and accessibility

- Durations: hover/press 140ms, menus/tabs/toasts 220ms, sheets and theme changes 260ms, ease `--ease-out`. Everything respects `prefers-reduced-motion`.
- WCAG 2.2 AA in every theme × accent (already true of the tokens; don't add colours that break it). Visible 2px focus ring everywhere. 44px touch targets on tablet and phone. Real `<button>`, `<a>`, `<label>`; `aria-live` for chat, Live status and toasts; focus trapped in sheets and returned on close; Escape closes.

## 11. Special surfaces

- **Video room** stage is always dark (`bg-call-stage`, `bg-call-tile`, `text-call-ink`), whatever the theme. End call is `call-danger`. The recording badge is visible to everyone.
- **Patient app** is designed at 390×844 first; on desktop it sits inside the PhoneFrame. Safe areas, bottom sheets, no visible scrollbars. Same tokens and themes as staff.
- **Precautions** are a high-contrast callout (`bg-over-bg border border-over`, warning icon, bold "Precaution").

## 12. Never change

Routes, functionality, workflows and business rules: Clinical Lead-only triage, risk needs a plan + precaution, no assignment if credentials, scope or risk fail, signed records change only by amendment, patients never see clinical notes, risks or recordings, recording off by default, Finance-only invoices with no clinical narrative, the 48-hour rule, discharge needs outcomes and a signature. Sample modules keep their figures (293 patients, 351 places, 83%, Sarah 27/25, Emma 18/24).
