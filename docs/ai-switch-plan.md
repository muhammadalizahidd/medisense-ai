# Organisation AI switch: implementation plan

## 1. What the user asked for

- One organisation-wide **AI features on/off** switch.
- Only the **Super Admin** can change it, from their AI section.
- Turning it off takes effect **immediately** for everyone signed in, with no reload.
- While off, **every AI feature stops**, and **no label anywhere says "AI"**.

## 2. What the code does today

- **Every model call goes through `src/lib/ai/engine.ts`** (`generateJson`, `generateWithTools`). Nothing outside `src/lib/ai/` imports a provider SDK. That gives one server choke point. About 20 callers: `src/app/api/{ai/write,assistant,story,case-notes/summarise,care/referrals/extract}`, and `src/server/{agent,assess,booking-agent,clinical,coord,docs,enhance,enhance-more,finance-money,funding,operations-review,progress,records,referrals,report-actions,sessions,tplan,workspace}.ts`.
- **Org settings already exist** in Mongo (`settings` collection, `_id: "org"`, `src/server/settings.ts`), currently only holding `assignmentMode` (default "AI Assisted").
- **Live push exists**: `publish(userIds, type, payload)` in `src/server/live.ts` feeds `/api/events` (SSE), and `useLiveEvents` / `useResource` in `src/lib/live/client.ts` consume it. `LiveEventType` is `notification | message | care | read | typing`.
- **Super Admin** = the `"Super Admin"` staff role (`isSuperAdmin` in `src/lib/permissions/can.ts`). They hold every permission.
- **AI surfaces fall into three groups:**
  1. **Live care app** (`/care/*`, `/therapist/*`, patient portal): AI oversight (`/care/ai-oversight`), Operations agent (`/care/ai-agent`), AI assistants (`/therapist/ai`), referral extraction, enhance (check-ins, home coach, insights), note/plan/report drafting, AI-assisted assignment mode.
  2. **Shared shell**: Ask Medisense (top bar + `⌘K`, `assistant-panel.tsx`), `NoteAssistEverywhere` (mounted in the root layout), the AI status in the presenter panel.
  3. **Demo story screens** (Zustand store): AI session note, prepared drafts, supervision brief, intake, forms, reports, analytics "AI insights", plus `AiMark` / `AiDraft` / `DraftLabel` provenance.
- **The word "AI" is everywhere**: about 250 UI strings in `src/features|components|app` (design-preview excluded) and about 56 files in `src/data`, `src/lib/live` and `src/server`. Nav alone has ~15 entries and group names ("AI workspace", "Operations and AI", "AI and reports").
- **The shell is prerendered** (sidebar and top bar render before `connection()`), so the server can't bake the switch into the shell's first paint.

## 3. Design

### 3.1 The setting (server, source of truth)

- Add `aiEnabled: boolean` (default `true`) to the `settings` "org" doc. `orgSettings()` returns it.
- `setAiEnabled(admin, on)` in `src/server/settings.ts`:
  - rejects anyone who is not Super Admin (403),
  - writes `aiEnabled`, `updatedBy`, `updatedAt`,
  - audits **"AI features turned off"** / "turned on" (the audit entry is the one place the word stays, because it records what happened),
  - `publish()`es a new **`settings`** event to **every active user** (new `allUserIds()` helper next to `adminIds()`), payload `{ aiEnabled }`.
- Cache the read for a few seconds in-process (`src/server/cache.ts` is already cleared by `publish`), so guards don't add a DB round trip to every request.

### 3.2 Server enforcement (AI actually stops)

- `engine.ts`: `ready()` calls `assertAiEnabled()` first and throws a new **`AiDisabled`** error (subclass of `AiError`). Every caller is covered at once, including in-flight retries.
- `/api/ai/status` returns `{ state: "disabled" }` when off, so the presenter panel and the Ask panel know.
- Every AI route and server action maps `AiDisabled` to **HTTP 423 "Turned off by your organisation"** in `src/server/http.ts`, so clients show a neutral message instead of a generic error.
- **No prepared fallback while off.** Today a failed call falls back to prepared drafts from `src/data/story.ts`; that fallback must check the switch too, otherwise "AI" content still appears. `AiDisabled` is never treated as "failed, use fallback".
- Rules and automations keep running (they are not AI). `assignmentMode` "AI Assisted" falls back to the manual/rule mode while off and the UI shows the rule mode; the stored choice is restored when AI comes back on.

### 3.3 Client state (switches instantly)

- **`AiFeaturesProvider`** (client, in the root layout above the shell) exposes `useAiEnabled()`.
  - First value: the last known state from `localStorage` (try/catch, default on), so the prerendered shell doesn't flash AI items.
  - Then confirms with `GET /api/ai/features` (new, tiny, public to signed-in users; demo/no-DB mode returns `true` or the demo store value).
  - Listens with `useLiveEvents` for `type === "settings"` and flips immediately. Also re-fetches on SSE reconnect.
- **`ThemeScript`** also sets `data-ai="off"` on `<html>` from `localStorage` before paint. One CSS rule in `globals.css`, `html[data-ai="off"] [data-ai-only] { display: none }`, hides AI-only shell bits before React hydrates.
- When the switch flips off while someone is mid-task: open AI panels close, in-flight requests are aborted, any unsaved AI draft on screen is discarded with a toast **"AI features were turned off by your organisation"** (that toast is the one deliberate exception to the no-"AI" rule; or "Assistive features were turned off" if you want zero exceptions, see §5). Human-written text is never discarded.

### 3.4 Removing features and the word "AI"

Two kinds of surface, handled differently:

| Kind                                  | Examples                                                                                                                                                                                                                                                                | When off                                                                                            |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **AI-only** (nothing left without AI) | Ask Medisense, Operations agent, AI assistants, AI oversight, NoteAssist, "Generate draft" / "Regenerate" buttons, `AiMark`/`AiDraft` panels, analytics "AI insights" cards, enhance home coach                                                                         | **Hidden**. Routes redirect to the parent screen (a page guard plus `notFound()` for deep links).   |
| **Mixed** (works without AI)          | "AI notes" → **Notes**, "AI reports" → **Reports**, "AI referrals" → **Referrals**, "AI forms" → **Forms**, "AI briefs" → **Supervision briefs**, "AI session note" → **Session note**, nav groups "AI workspace" → **Workspace**, "Operations and AI" → **Operations** | **Stays, relabelled**, with the AI parts inside hidden (the human editor, approval and audit stay). |

Mechanics, so this is not 250 hand-edited `if`s:

- **Nav** (`src/lib/navigation.ts`): items gain `ai?: "only" | { plain: string }`; groups the same. `sidebar.tsx`, `tab-bar.tsx`, breadcrumbs (`meta.section/page`) and page guides pick the plain label or drop the item. One helper, `navFor(role, aiEnabled)`.
- **Components**: `<AiOnly>` wrapper (renders nothing when off) and `useAiLabel(on, off)` / `aiText("AI reports", "Reports")` helper for inline strings. `AiMark`, `AiDraft`, `DraftLabel`, `SourceChip` and `provenance.tsx` return `null` when off, so most screens get it for free.
- **Data strings** in `src/data`, `src/lib/live`, `src/server` (DTO labels, page-guides, knowledge tool text): pair each AI-worded label with a plain one, picked at render time. Server DTOs send ids, not display text, where they don't already.
- **Metadata titles** (`AI oversight · Medisense`, root description "AI-assisted…"): AI-only pages are unreachable; the root description becomes neutral always (it is not visible UI, and it can't follow a runtime switch).
- **Patient side**: the portal's AI consent prefs and home coach are hidden; stored consent is kept untouched.

### 3.5 The Super Admin's AI section

There is no dedicated AI settings page today. Proposed:

- A new **AI** tab in `/care/users` (User control, where the Super Admin already works) or a small section at the top of `/care/ai-oversight` (see §5).
- Content: a `Switch` **"AI features"**, on/off, with one line on what changes, the current state, and "Last changed by … · time" from the settings doc.
- Turning **off** needs a deliberate confirmation (design rules §9): lists what stops (drafting, Ask, agents, insights), states that approved records and human text are kept, and that it applies to everyone signed in now.
- Visible but read-only to other admins ("Only the Super Admin can change this"). This section itself is the only page that still says "AI" while off, because it's where you turn it back on; it is only visible to admins.
- New permission id `ai.manage` in `src/lib/permissions/catalogue.ts`, held only by Super Admin and marked always-enforced, so the roles editor can't grant it.

### 3.6 Demo story and presenter panel

- The demo screens read the same `useAiEnabled()`, so the switch works in the pitch too.
- Without a database (pure demo mode) the flag lives in the demo store, toggled from the same AI section and from the presenter panel, persisted with the store, cleared by Reset demo.
- The story's AI steps (prepared drafts, supervision brief) are hidden while off; the people layer (manual note, approval, audit) still works, which demonstrates "systems supporting therapists" without AI.

## 4. Steps

1. **Setting and guard (server)**: `aiEnabled` in settings, `setAiEnabled`, `allUserIds`, `settings` event type, `AiDisabled` in `engine.ts`, 423 mapping in `http.ts`, no fallback while off, `/api/ai/features`, `/api/ai/status` disabled state. Tests: engine throws when off; non-Super Admin gets 403; event is published to all users.
2. **Client switch**: `AiFeaturesProvider`, `useAiEnabled`, `ThemeScript` `data-ai` attribute, CSS rule, live event handling, abort and discard on flip.
3. **Super Admin section**: AI tab, confirmation sheet, `ai.manage` permission, audit, toast.
4. **Shell and nav**: nav `ai` metadata, sidebar/tab bar/breadcrumbs/page guides, Ask Medisense, NoteAssistEverywhere, presenter AI status, route guards for AI-only pages.
5. **Provenance components**: `AiMark`, `AiDraft`, `DraftLabel`, `SourceChip`, `provenance.tsx` go quiet when off; `<AiOnly>` and `aiText()` helpers.
6. **Live care screens** (`src/features/live`, 35 files): hide generate/regenerate buttons and AI panels, relabel mixed features, assignment mode fallback, patient portal.
7. **Demo screens** (`src/features/*`, `src/data`): same treatment, demo-store flag, story steps.
8. **No-"AI" guard test**: a Vitest test that renders each nav role with AI off and asserts no label matches `/\bAI\b/`, plus a Playwright-free check over `navigation.ts` / `page-guides.ts` data. A follow-up manual sweep with the browser across every route with AI off.
9. `pnpm check && pnpm build`, update `CLAUDE.md` (rule: new AI features must respect `useAiEnabled` / `assertAiEnabled` and pair any "AI" label with a plain one) and `docs/MANUAL_TEST_GUIDE.md`.

## 5. Decisions needed

1. **Where the switch lives**: new "AI" tab in User control (recommended, it's the Super Admin's home) or the top of AI oversight.
2. **Mixed features**: keep and relabel (recommended) or hide everything that was ever called "AI …"?
3. **Zero exceptions to the word?** The Super Admin's own switch and the audit entry must name it; should the "turned off" toast for other staff say "AI" or something neutral like "Drafting and assistant features were turned off"? Recommended: neutral wording.
4. **Assignment mode**: fall back to the rule-based mode while off (recommended), or block switching AI off while "AI Assisted" is selected?
5. **Demo story**: should the presenter panel also have the switch for the pitch (recommended), or only the Super Admin section?

## 6. As built

Decisions 1 to 5 followed the recommendations. Differences from the design above:

- No `ai.manage` permission. The server checks for the Super Admin directly, so the roles editor
  has nothing to grant; the rule is listed under the always-enforced rules.
- Menu labels are reworded by one function (`src/lib/ai/wording.ts`) instead of per-item metadata,
  and a page scrub (`src/lib/ai/scrub.ts`) covers text from stored records.
- AI-only routes are redirected in the browser (`src/components/ai/ai-route-guard.tsx`). Their
  server APIs refuse with HTTP 423.
- Manual paths were added where drafting was the only way in: session notes, case-note summaries,
  telehealth notes, the demo referral sheet and the supervision agenda.
- The switch sits at the top of **AI oversight** (`/care/ai-oversight`), not in User control, and
  asks for confirmation in a small dialog box both ways. While off, only the Super Admin keeps that
  page.
