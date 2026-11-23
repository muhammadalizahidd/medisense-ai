# Roles & permissions: redesign plan

Status: plan only, nothing built. Surface: the Roles & permissions tab in User control (`/care/users?tab=roles`). Mode: operate. The job is to scan roles quickly and change permissions with confidence, so precision and clarity matter more than expression.

## 1. Decisions (confirmed)

| Topic | Decision |
|---|---|
| Role cards | Name and Built-in/Custom tag, a two-line description, and "N people · M permissions". Nothing more. |
| Groups in the dialog | An equal grid of group cards: 3 columns on a wide screen, 2 on a tablet, 1 on a phone. |
| Closing with unsaved changes | Ask first: Keep editing, Discard, or Save. |
| Roles tab | A grid of role cards. **New role** is a primary button in the User control page header (shown on this tab), not a tile in the grid. |
| Dialog layout | Cards pack straight up under each other in each column (no row-aligned gaps); the last card in a column stretches so columns end level above Reports. |
| Opening a role | A large, closable dialog with every permission grouped in rows and columns. |

## 2. What is wrong today (from the screenshot)

- The roles sit in a narrow left rail and the permissions run down one long column on the right: 67 toggles in a single stream, so you scroll a lot to see one group and lose track of where you are.
- Only one role is visible at a time, so comparing roles means clicking back and forth.
- "New role" is a full-width button above the list rather than part of the roles.

## 3. The new design

### Roles tab

```
 All staff · Office staff · Therapists · Roles & permissions
 ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
 │ + New role │ │ Clinical   │ │ Finance    │ │ Finance    │
 │  (dashed)  │ │ Lead  [B]  │ │      [B]   │ │ Manager [B]│
 │            │ │ Clinical…  │ │ Funding…   │ │ Finance, … │
 │            │ │ 2 people · │ │ 1 person · │ │ 1 person · │
 │            │ │ 39 perms   │ │ 10 perms   │ │ 14 perms   │
 └────────────┘ └────────────┘ └────────────┘ └────────────┘
   Intake · Operations Manager · Scheduler · custom roles …
   The Super Admin is not a role. It holds every permission …
```

- Grid: `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4`, 16px gaps, content width unchanged.
- **Role card** is one real `<button>`: `bg-surface`, 1px `border-border`, `rounded-card`, no shadow at rest, `hover:shadow-lift`, visible focus ring. Name in the sans face at section size (never the display face below 24px), description clamped to two lines, a quiet footer row for the counts, the Built-in/Custom tag top-right (outline for built-in, available tone for custom). Built-in first, then custom, each alphabetical.
- **New role tile**: same size, dashed `border-border-strong`, a plus icon and "New role", plus a one-line hint ("Start blank or copy a role"). It opens the existing New role sheet; creating a role opens its dialog straight away.
- While loading: a skeleton grid of six cards. Empty and error states reuse the existing note components.

### The role dialog

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Finance Manager  [Built-in]   1 person holds this role     Edit  Reset  ✕  │
│ Finance, plus approvals for charge rules, overrides and adjustments.       │
├────────────────────────────────────────────────────────────────────────────┤
│ [ Filter permissions…        ]  (All | Allowed | Not allowed)   14 of 67   │
├──────────────────────┬──────────────────────┬──────────────────────────────┤
│ Referrals & intake   │ Scheduling &         │ Clinical records & oversight │
│ 0 of 3  Allow  Clear │ therapists 0 of 9    │ 0 of 16                      │
│ ○ Triage decision    │ ○ Manage schedule    │ ○ Open the full record …     │
│ ○ Process referrals  │ ○ Assign therapists  │ ○ Intake summary …           │
│ ○ Requests & invites │ …                    │ …                            │
├──────────────────────┼──────────────────────┼──────────────────────────────┤
│ Funding   2 of 3     │ Finance & billing    │ Operations & approvals       │
│ …                    │ 2 of 2               │ 0 of 12                      │
├──────────────────────┴──────────────────────┴──────────────────────────────┤
│ Reports  8 of 22   ┌ Domain ──────── Read  Detail ┐  Clinical detail ○    │
│                    │ Referrals        ○     ○     │  Share with team  ●    │
│                    │ Participants     ○     ○     │  Share org-wide   ○    │
│                    │ …9 domains                   │  Schedule reports ●    │
├────────────────────────────────────────────────────────────────────────────┤
│ 3 unsaved changes to Finance Manager          [ Discard ] [Review and save]│
└────────────────────────────────────────────────────────────────────────────┘
```

- **Size:** centred, `w-[min(1180px,calc(100vw-2rem))]`, `max-h-[90dvh]`, `rounded-sheet`, `bg-raised`, `shadow-overlay`, scrim behind. The body scrolls; the header, toolbar and footer stay fixed. On a phone it becomes a full-height sheet rising from the bottom.
- **Header:** role name in the display face at 24px or more (not bold), the Built-in/Custom tag, who holds it and who last changed it. **Edit details** and **Reset to default** (built-in) or **Delete** (custom, disabled with a reason while people hold it) sit as quiet secondary buttons. A close button with `aria-label`.
- **Toolbar:** a filter field that matches a permission's label or description, a segmented control (All / Allowed / Not allowed), and a live "N of 67 allowed". The filter hides empty groups and shows an empty state with "Clear filter" when nothing matches.
- **Group card:** a bordered card (`rounded-card`, no shadow) with its title, "x of y", and ghost **Allow all** / **Clear** actions for the group. Each row is a switch, the permission's name, a one-to-two line description, and small tags only where they mean something (Visibility; Changed from default). A row that differs from what is saved gets `bg-accent-tint`.
- **Grid behaviour:** a 3-column grid on wide screens, 2 on tablet, 1 on phone, with `grid-auto-flow: dense` so cards line up. The two large groups span more: Clinical records and oversight (16) takes two columns; Reports (22) takes the full row.
- **Reports card** is the one special layout: a small matrix of the nine domains with **Read** and **Detail** switches in two columns, and the four report switches (clinical detail, share with team, share organisation-wide, schedule) beside it. That turns 22 stacked toggles into about 9 rows.
- **Footer:** appears when there are unsaved changes: the count, **Discard**, **Review and save**. Review and save is the existing review step. After saving, the dialog stays open and the footer clears.
- **Closing with unsaved changes** (X, Escape or the scrim) opens a small prompt on top: Keep editing, Discard, Save.
- **Always enforced** moves into a collapsible card at the end of the groups, as today.

### Behaviour and accessibility

- A real dialog: `role="dialog"`, `aria-modal`, labelled by the role name; focus moves in, is trapped, and returns to the card that opened it; the page behind stops scrolling.
- Keyboard: Tab runs header, toolbar, groups, footer. Escape closes (with the unsaved prompt). Switches keep their labels.
- Touch targets are 44px on tablet and phone. Motion is a 220ms fade and 8px rise, removed under `prefers-reduced-motion`.
- The open role is kept in the address (`?tab=roles&role=finance-manager`) so a refresh or a shared link reopens it; closing removes it.
- Colour and type come only from tokens (`globals.css`). No gradients, glow, purple, or sparkle icons, and no shadow on resting cards.

## 4. Implementation plan

| Phase | Work | Files |
|---|---|---|
| 1. Primitives | A centred **Dialog** built on the Sheet's portal and focus trap, with `size`, a header/toolbar/body/footer layout, scroll lock, and a `layer` so the details, review, delete and unsaved prompts can open above it. Give Sheet the same `layer`. | `components/ui/dialog.tsx`, `components/ui/sheet.tsx` |
| 2. Grid | `RolesGrid`, `RoleCard`, `NewRoleTile`, and the loading skeleton. The tab renders the grid and the Super Admin note. | `features/live/roles-grid.tsx`, `features/live/user-control.tsx` |
| 3. Dialog content | `RoleDialog` with header, toolbar (filter and segmented control) and the group grid; `PermissionGroupCard` with Allow all and Clear. Move the draft and the review step in. | `features/live/role-dialog.tsx`, `features/live/permission-group-card.tsx` |
| 4. Layout detail | The Reports matrix card, column spans, and responsive behaviour down to a phone sheet. | `features/live/reports-permissions-card.tsx` |
| 5. Safety and state | The unsaved-changes prompt, the `?role=` address state, focus return. | `features/live/role-dialog.tsx` |
| 6. Tidy and verify | Move the details, new role, delete and review sheets to their own file; delete the old two-pane layout; check every state at 1440, 1024, 768 and 390. | `features/live/role-sheets.tsx`, `features/live/roles-permissions.tsx` |

No API or data changes: the role list already carries the description, counts and permissions.

## 5. Pure logic to test

Kept out of the components so it can be tested without a browser:

- `groupPermissions(filter, mode, draft)`: groups, their counts, hidden empty groups.
- `groupSpan(group)` and the column rules.
- `reportsMatrix(permissions)`: the nine domain rows plus the four extras, so a new domain can't be missed.
- `changeSummary(saved, draft)`: added and removed, reused by the footer, the review step and the unsaved prompt.

## 6. Verification

- Look at it in a real browser at 1440, 1024, 768 and 390, with sample data from a production build (sign-in isn't possible without a database), covering: a built-in role at default, one with pending changes, a custom empty role, a role with members (Delete disabled), a long description, and the filter with no match.
- Keyboard pass: open from a card, Tab through, toggle with Space, close with Escape, confirm focus returns.
- Check contrast and the focus ring in every theme and accent.

## 7. Out of scope

- Per-person overrides, drag to reorder, role history, and comparing two roles side by side.
- Any change to what a permission does.
