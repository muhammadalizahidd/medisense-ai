# Editable role permissions: implementation plan

Status: plan, nothing built. Decisions below were confirmed by the product owner; items under "Still to confirm" were not.

## 1. Decisions (confirmed)

| Topic | Decision |
|---|---|
| Roles that are editable | The office-staff roles only: Intake Officer, Scheduler, Finance, Finance Manager, Operations Manager, Clinical Lead, plus new custom roles. Therapist and patient/family access stay fixed. |
| Granularity | Feature actions (for example "Verify funding"), not whole pages. Pages and menu entries follow from them. |
| Rules that are toggles | Every rule that names a role. Workflow invariants (signed records change only by amendment, patients never see clinical notes, the 48-hour rule, discharge needs outcomes and a signature, the audit trail) stay in code, are not toggles, and are shown as "Always enforced". |
| Super Admin | Exactly one account for the platform. Holds every permission implicitly, cannot be revoked or deactivated, is not an assignable role. Can be moved with an explicit, audited "Transfer Super Admin" action. May also hold normal roles (Neil keeps Clinical Lead). |
| Admins | The Super Admin creates admins (never a second Super Admin). Their access is the union of their roles, can match the Super Admin's, and is revocable. |
| Granting | Through roles only. No per-person overrides. |
| Role lifecycle | Built-in roles: rename and edit toggles, "Reset to default", not deletable. Custom roles: edit freely, deletable only when nobody holds them. |
| Routing | Custom roles carry permissions only. Automatic routing (work sent to Clinical Lead, Finance Manager, and so on) stays with the built-in roles. |
| Data visibility | Expressed as toggles too (see other teams' tasks, clinical-restricted tasks, report domains, report sharing scope). Defaults copy today's per-role scopes. |
| Timing | Takes effect immediately. |
| Screen | New "Roles & permissions" tab inside User control (`/care/users`). |
| Demo matrix | The sample matrix on `/settings` is left untouched. |
| Rollout | Phased by module, each behind a regression test that proves defaults match today's behaviour. |
| Default rules (from phase 0) | Actions open to every admin default to the roles whose menu shows them. The Super Admin has every permission with no exceptions. Record and session views are a union. The Finance Manager gets `funding.verify` and `funding.edit`. See `docs/role-permissions-inventory.md`. |

## 2. Current state (verified in code)

- **Three account kinds**: `admin`, `therapist`, `client` (`UserRole`). Office staff are `admin` accounts with a list of `staffRoles`, a fixed enum of 7 names in `src/lib/live/catalogue.ts`.
- **Four places access is decided today**
  1. Page gate, `src/lib/access.ts` (run by `src/proxy.ts`): by account kind only. Any admin can open any staff page by URL.
  2. Menu, `pageAccess` in `src/lib/navigation.ts`: maps about 27 pages to roles. It only tidies the menu; it does not block the page.
  3. API routes: 146 route files. 53 use `requireUser("admin")`, 22 therapist, 7 client, 12 any signed-in user. None check which admin responsibility.
  4. Server modules: about 20 files each define their own `has()` and role predicates. Role names appear in 47 files.
- **Role-name predicates (call sites)**: `isLead` 29, `isClinical` 5, `isClinicalLead` 4, `isFinance` 5, `canVerify` 3, `requireSuperAdmin` 5, plus `opsCan()` in `operations.ts`, `scopeFor()` in `src/lib/live/reports.ts` and `teamsOf()`.
- **Not all "Only ..." messages are role rules.** 131 denial messages exist; many are about relationships (treating therapist, assigned supervisor, recipient of a handover) or workflow state. Those stay in code.
- **Known groupings today** (to be turned into the default matrix in phase 0):
  - Clinical Lead and Super Admin: co-sign assessments, review referrals and recordings, clinical review tasks, credential and competency approval, plan and progress review, supervision work.
  - Finance and Super Admin: verify funding, work billing. Finance Manager and Super Admin: approvals (credits, write-offs, refunds, rate overrides).
  - Intake Officer, Finance and Super Admin: manage funding.
  - Operations flags (`manager`, `clinical`, `intake`, `scheduler`, `finance`) drive task visibility and workflow rules.
  - Records sections differ by role (`records.ts`).
- **No tests** cover any of this except the Super Admin account logic (`src/server/user-control.test.ts`). CI does not run `pnpm test`.

## 3. Design

**Permission catalogue** (`src/lib/permissions/catalogue.ts`): a typed list of `{ id, group, label, description, kind: "action" | "scope", defaults: roles[] }`. Ids look like `funding.verify`. A test fails if code checks an id that is not in the catalogue. Expected size is 50 to 70, an estimate until phase 0 finishes.

**Storage**
- New `roles` collection: `{ slug, name, description, builtIn, permissions: string[], updatedAt, updatedBy }`.
- `users.staffRoles` keeps role slugs, so the `StaffRole` enum becomes a string type with the built-ins as constants.
- Single Super Admin: one account marked as the platform owner (field on the user plus a platform settings document). "Super Admin" is removed from the assignable role list. A migration converts today's Super Admin role into that marker for Neil Hensley's account and keeps his Clinical Lead.
- Seeding and migration are idempotent. Defaults are inserted only when a role document is missing, so edits are never overwritten.

**Central check**
- `can(user, permission)` on the server replaces every hard-coded predicate. The Super Admin always passes.
- The session DTO carries the user's effective `permissions[]`. The menu and buttons use it, and the page gate adds a required-permission check so URLs are enforced as well as menus.
- Because changes must apply immediately and the app runs as several serverless instances, roles are read per request (one small query, memoised for that request). No cross-request cache until measured.

**Editor** (tab in User control, Super Admin only)
- Role list with member counts, the matrix grouped by area with toggles, an "Always enforced" panel for workflow invariants, create role (blank or copied from another), rename, delete unused custom role, reset built-in to default.
- A confirmation summarising before/after changes, and an audit entry for every change.
- A person's account drawer shows their effective permissions and which role grants each.
- "Transfer Super Admin" action with confirmation and audit.

**API** (all Super Admin only): `GET/POST /api/care/roles`, `PATCH/DELETE /api/care/roles/[id]`, `POST /api/care/roles/[id]/reset`, `POST /api/care/super-admin/transfer`. Create user and Manage responsibilities read roles from this list instead of the enum.

## 4. Phases

| Phase | Deliverable | Done when |
|---|---|---|
| 0. Inventory | The full catalogue and a default matrix (role by permission) generated from the code, written to `docs/` for you to review. Includes the data-visibility scopes and the "Always enforced" list. | You sign off the matrix. Nothing is built before this. |
| 1. Foundation | Catalogue, `roles` collection, seed and migration, `can()`, session permissions, golden tests that compare `can()` to today's predicates for every role and permission. | Golden tests pass; app behaves as before. |
| 2. Super Admin | Single-account model, migration, transfer action, guards (no deactivation, no demotion). | Tests pass; Neil keeps Clinical Lead. |
| 3. Editor | Roles & permissions tab, role CRUD, reset, audit, effective-permissions view. Toggles recorded but modules still use legacy checks. | You can review and edit defaults safely. |
| 4. Enforcement, per module | Switch one module at a time to `can()`: referrals and intake, funding, finance and billing, scheduling, clinical lead gates, operations and tasks, reports and scopes, menu and page gate. Delete each module's old `has()` as it moves. | Each module's regression test passes before the next starts. |
| 5. Hardening | Remove legacy role predicates, add `pnpm test` to CI, browser regression tests for the role flows, update docs. | CI green; no role-name checks remain outside the catalogue. |

## 5. Tests

- Golden test: for each built-in role and each permission, `can()` equals the legacy predicate (kept temporarily as the oracle). It proves defaults equal today's behaviour except for the intentional changes listed in the inventory (open actions following the menu, Super Admin with no exceptions, union of views, Finance Manager funding).
- Role CRUD and rules: create, edit, delete-unused, reset, rename, duplicate names, built-in not deletable, union of several roles, immediate effect.
- Super Admin: single account, no deactivation, transfer, audit.
- Route tests: each new endpoint returns 401 and 403 correctly.
- Guard test: every permission id used in code exists in the catalogue.

## 6. Risks

- **Large surface**: about 20 server modules plus the menu and page gate. Mitigated by the per-module phases and the golden tests.
- **Role names as routing targets**: built-in routing still depends on role names; custom roles are excluded by decision, so deleting or renaming a built-in role needs care (rename changes the label only; the slug is stable).
- **Data-visibility scopes**: `teamsOf()` and `scopeFor()` derive teams and report domains from role names. Turning them into toggles is the least mechanical part of the work.
- **Per-request role reads**: adds a query to each request; measure before adding any cache.
- **Existing data**: users hold enum role names today; the migration must map them to slugs without changing anyone's access.

## 7. Still to confirm

1. Sign-off on the default matrix after phase 0 (nothing is assumed before then).
2. The "Always enforced" list: which exact workflow invariants are shown there.
3. For data-visibility scopes, the list of scope toggles and their names.
4. Who may hold the Super Admin marker during a transfer (any active admin, or only an existing Clinical Lead).

## 8. Phase 4 progress

How enforcement works: when the signed-in person is loaded (`currentUser`), their permissions are resolved once from the roles collection and `can()` reads them for the rest of the request. A person whose permissions were never loaded is denied. Code that loads accounts straight from the database and acts as them (the demo seeding in `operations-hub.ts`) calls `loadPermissions` first.

Enforced so far (listed in `enforcedPermissions`, so the editor stops saying "Not enforced yet"; a test checks each one is really checked in code):

| Module | Permissions |
|---|---|
| Referrals and intake | `referrals.triage`, `referrals.process` |
| Funding | `funding.verify`, `funding.edit`, `funding.clinical-gate` |
| Finance and billing | `finance.work`, `finance.approve` |
| Scheduling and matching | `schedule.manage`, `schedule.assign`, `operations.matching`, `operations.retry-runs` |
| Therapists and staff | `therapists.view`, `therapists.add`, `therapists.deactivate`, `therapists.reset-password`, `therapists.export`, `staff.verify-credentials` |
| Clinical oversight | `assessments.view`, `assessments.cosign`, `assessments.review`, `plans.oversight`, `progress.oversight`, `documentation.oversight`, `recordings.manage`, `coordination.review` |
| Operations and approvals | `operations.manage`, `operations.clinical`, `operations.team.intake`, `operations.team.scheduling`, `operations.team.clinical`, `operations.team.finance`, `operations.team.operations`, `approvals.decide.funding`, `approvals.decide.billing-adjustment`, `approvals.decide.clinical`, `approvals.decide.manager` |
| Records and sessions | `records.view.clinical`, `records.view.intake`, `records.view.scheduling`, `records.view.finance`, `records.grant-access`, `records.review-risks`, `sessions.oversight`, `sessions.finance-verify` |
| Reports and scopes | `reports.read.<domain>` and `reports.detail.<domain>` for the 9 domains, `reports.clinical-detail`, `reports.share.team`, `reports.share.organisation`, `reports.schedule` |

Route guards: reads of the schedule board and of the patient onboarding board's lists stay open to every admin because other screens (the admin app, the board) use them. `therapists/[id]/staff` needs `therapists.view`; the credential actions inside it check `staff.verify-credentials`.

Notes on operations: the signed-in person's flags and team queues now come from their permissions. Routing to other people (who a task is assigned to, who is notified) still reads their role names, so a custom role can hold the permissions but is never an automatic routing target, as decided.

Notes on views: a person holding several record views gets the widest, because the views are nested (intake shows everything scheduling shows, which shows everything finance shows), so the union and "widest wins" are the same and no screen changed. Sessions are the real union: someone with both the lead and finance views gets both, and a restricted-discipline session shows them the finance view instead of dropping to status. With the Super Admin holding every permission, the Super Admin can now verify session delivery.

Notes on reports: a report scope is built from permissions (`scopeFromPermissions`), including scheduled runs, which load the schedule owner's permissions first. For every built-in role the result equals the old role-name scope, checked by a test. With the Super Admin holding every permission, the Super Admin now also reads row-level detail for Clinical Operations and has clinical detail. Who a scheduled report is sent to is still chosen by role names (routing), but each recipient is checked against their permissions before anything is sent.

Menu and page gate: `src/lib/permissions/pages.ts` maps each staff page to the permissions that open it (any one opens it; an empty list means only the Super Admin; an unlisted page is open to every admin; a longer path follows the closest page above it). The sidebar, tab bar, admin app and the User control menu preview use it, and `requirePageUser` now redirects an admin who lacks the permission to their own home, so typing an address gets no further than the menu. The dashboard (`/`) is gated the same way. As decided, the map gives each built-in role exactly the pages it had before, checked against the frozen old menu in `src/test/legacy-pages.ts`. Two consequences: a permission can be held without a page that shows it (for example Finance's report access has no Reports page, as today), and an admin with no permissions at all now sees only the pages anyone may open, where before an admin with no roles saw the whole menu.

## 9. Phase 5: hardening

- All 67 permissions are enforced, and a test fails if one is added without its check (`wiring.test.ts`).
- The patient onboarding board's client list is gated by the same permissions as the `/care` page. The overview endpoint stays open to every admin because the admin app and dashboard read it.
- Role-name checks that acted for the signed-in person are gone. The ones that remain are routing (who a task is assigned to or notified), seed data, catalogue data, labels, and the Super Admin marker. Lines naming a role in production code went from 269 to 215, and the ratchet stops new ones appearing.
- The old role-name scope and menu are frozen as test oracles in `src/test/` (`legacy-pages.ts`, `legacy-report-scope.ts`), not in production code.
- Revoking an export link and changing report alert thresholds now use `reports.share.organisation` (organisation-wide reporting authority) instead of the report scope's label; by default the same two roles hold it.
- The scheduling board's full view now follows the three record views (clinical, intake, scheduling) instead of a role list. An admin with no permissions at all sees the limited board.
- CI now runs `pnpm test`. `pnpm lint` ignores the scratch scripts in `.tmp-check/` and allows console output in `scripts/`, and the two long-standing lint errors in the workspace menu are cleared.

Still to do: browser regression tests for the role flows (needs a test database, so it is waiting on a decision), and removing the Super Admin marker from `staffRoles` once nothing reads it (it is still how the owner is recognised in the session and the sidebar).
