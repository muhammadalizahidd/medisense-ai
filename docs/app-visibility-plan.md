# App visibility per role: implementation plan

Status: plan only, nothing built. Surface: Roles & permissions in User control, role dialog.

## 1. What the user asked for

In each role's dialog, a Super Admin or any admin with role-management rights can switch three apps on or off: mobile, admin and therapist.

When an app is off for a role:
1. It does not appear in that person's sidebar, menu or app switcher.
2. It cannot be opened by any route or link, including typed addresses, deep links and API calls behind it.

## 2. What the code does today

- Three experiences are routed by role, not by permission: `admin` (staff `/care/*` and `/`), `therapist` (`/therapist`, `/telehealth/room`), and `client` (`/mobile/patient`). Routing is in `src/lib/live/routes.ts` (`homeFor`) and `src/lib/access.ts` (`accessFor`).
- `src/proxy.ts` decides access before each page. It only knows the role, from `/api/auth/me`, cached for 20 seconds per session. It has no permissions.
- Admin page permissions live in `src/lib/permissions/pages.ts` and are enforced by `requirePageUser` (`src/server/page-auth.ts`) and the sidebar (`src/lib/navigation.ts`).
- `/mobile` has four sub-apps: `family`, `patient`, `staff`, `therapist`. The user's "mobile app" needs to be pinned to one or more of these (see questions).

## 3. Design

**Permissions.** Add an "Apps" group to the catalogue with one switch per app (for example `app.admin`, `app.therapist`, `app.mobile`). Built-in defaults reproduce today's access exactly, so nobody loses a screen on deploy. Reuse the existing roles editor, change summary, audit trail and Super Admin rules. No new editor.

**Super Admin.** Always has every app. Like the other Super Admin rules, it can't be switched off, and the editor shows the switches locked on.

**One source of truth.** A pure function, `appsFor(user)`, returns `{ admin, therapist, mobile }` from the held permissions. It lives in `src/lib/permissions/apps.ts` with no UI imports, so the sidebar, proxy and server guards all share it.

**Enforcement, three layers (all required):**
1. *Proxy* (`src/proxy.ts`): extend `/api/auth/me` to return `apps`, and extend the cached session lookup to hold them. A request to a disabled app redirects to the profile.
2. *Server pages and layouts*: `requirePageUser` and the app layouts check the same `appsFor` result, so a page can't render if the proxy was bypassed.
3. *API routes*: each route behind a disabled app returns 403 through `mustCan`, using a new `app.*` check, so direct API calls fail too.

**Navigation.** The sidebar, mobile tab bar and workspace menu filter items by `appsFor`, the same way they filter pages by permission today. The "where to land" logic (`homeFor`) picks the first enabled app, then falls back to the profile (the rule from the last change).

**Edge cases to handle:**
- Everything off: the person lands on their profile, which stays open to every signed-in person. The editor warns that a role with no apps can only edit their own profile.
- A signed-in session whose role changes: the 20-second proxy cache means the change takes effect within 20 seconds. The page guard catches anything during that window.
- Therapist-role accounts (`role: therapist`) are not staff roles. Their apps must come from somewhere; see question 2.
- A link from one app to another (e.g. admin to therapist view) must be hidden when the target is off, not just failing.

## 4. Steps

| # | Work | Files |
|---|---|---|
| 1 | Catalogue: "Apps" group, three permission ids, built-in defaults that match today | `src/lib/permissions/catalogue.ts` and golden tests |
| 2 | `appsFor(user)` and its unit tests | `src/lib/permissions/apps.ts` (new) |
| 3 | `/api/auth/me` returns `apps`; proxy caches and enforces | `src/app/api/auth/me/route.ts`, `src/proxy.ts`, `src/lib/access.ts` |
| 4 | Page and layout guards use `appsFor` | `src/server/page-auth.ts`, mobile and therapist layouts |
| 5 | API guards for each app | `src/server/permissions.ts` and the affected routes, plus a route-permission test |
| 6 | Navigation filters: sidebar, tab bar, workspace menu, landing page | `src/lib/navigation.ts`, `src/components/shell/*` |
| 7 | Roles editor: Apps section in the role dialog, Super Admin locks | `src/features/live/role-dialog.tsx`, `permission-group-card.tsx` |
| 8 | Verify: each app on and off for a built-in role and a custom role; deep links; typed addresses; API calls | Tests plus browser check |

Estimated size: about 8 files changed for the core, plus route guards.

## 5. Decisions (confirmed)

1. **Switches.** One horizontal row in each role dialog with three toggles. Final sub-app grouping is set before the default permissions drop-down is finalised. Open point in section 6.
2. **Therapist-role accounts** see only the therapist app. Their mobile and admin apps are hidden whatever the switches say.
3. **Admins (staff roles)** get the switches configured by the Super Admin. The Super Admin always keeps every app and can change what every admin sees. A normal admin with role-management rights can only change apps for roles below their own; see section 6.
4. **Defaults are off.** A new role starts with all three apps off. Built-in roles also default to off, so the Super Admin switches apps on for them after deploy.

## 6. Decisions (round 2)

- **Who can change switches:** Option A. Anyone with role-management rights can change app switches, but only on roles below their own. The Super Admin can change any role.
- **Existing admins on deploy:** the migration switches the admin app on for the built-in roles that already have admin screens. Custom roles start off.
- **Mobile switches:** four, one per sub-app (family, patient, staff, therapist), laid out with the admin and therapist switches in two rows. A role can hold the therapist app without the mobile therapist view, for example a new manager.

## 7. Build order

Build follows the steps in section 4.
