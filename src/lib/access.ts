import { appOpen, PUBLIC, type AppAccess } from "./permissions/apps";
import type { Role } from "./live/types";

/**
 * Who may open which page. Checked before every page loads (src/proxy.ts), so a patient never
 * sees staff screens and a therapist never sees admin ones.
 *
 * This file must stay free of UI imports: the proxy runs it on every request, and importing a
 * module the browser also loads (such as the sidebar menu) makes development hot-reload loop.
 */

/**
 * Staff pages a therapist may not open: admin, leadership and supervision screens. Kept in step
 * with the roles in the sidebar menu (src/lib/navigation.ts).
 */
const NOT_FOR_THERAPISTS = [
  "/care",
  "/since-yesterday",
  "/before-after",
  "/team-capacity",
  "/analytics",
  "/patients-requiring-attention",
  "/admin-queue",
  "/intake",
  "/forms",
  "/admin-operations",
  "/automations",
  "/caseloads",
  "/supervision",
  "/admin-insights",
  "/settings",
  "/roadmap",
  "/billing",
  "/hospital",
  "/erp",
];

const under = (path: string, prefix: string) =>
  prefix.endsWith("/") ? path.startsWith(prefix) : path === prefix || path.startsWith(`${prefix}/`);

export type Access = { allow: true } | { allow: false; redirect: string };

/** Who is asking: their role, the apps they have, and the page their apps land them on. */
export type Session = { role: Role; apps: AppAccess; home: string };

export function accessFor(path: string, session: Session | null): Access {
  // An app that is off for this person is closed to them, whatever the page is.
  if (session && !appOpen(path, session.apps, session.role))
    return { allow: false, redirect: session.home };
  if (PUBLIC.some((p) => under(path, p))) return { allow: true };
  if (!session) return { allow: false, redirect: `/login?next=${encodeURIComponent(path)}` };
  const { role, home } = session;
  // Patients and families use the patient app only.
  if (role === "client") return { allow: false, redirect: home };
  if (role === "therapist") {
    // The organisation overview at "/" is for leadership and admins.
    if (path === "/" || NOT_FOR_THERAPISTS.some((p) => under(path, p))) {
      return { allow: false, redirect: home };
    }
    return { allow: true };
  }
  // Admins see every staff screen. A therapist's workspace opens only for an admin whose role
  // switches the therapist app on, which the app check above has already decided.
  return { allow: true };
}
