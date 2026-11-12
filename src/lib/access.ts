import { homeFor } from "./live/routes";
import type { Role } from "./live/types";

/**
 * Who may open which page. Checked before every page loads (src/proxy.ts), so a patient never
 * sees staff screens and a therapist never sees admin ones.
 *
 * This file must stay free of UI imports: the proxy runs it on every request, and importing a
 * module the browser also loads (such as the sidebar menu) makes development hot-reload loop.
 */

/** Pages anyone can open, signed in or not: they handle their own sign-in or need none. */
const PUBLIC = ["/login", "/refer", "/join/", "/appointment/", "/contact/", "/mobile/patient"];

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

/** Pages only for therapists. */
const THERAPIST_ONLY = ["/therapist", "/telehealth/room"];

const under = (path: string, prefix: string) =>
  prefix.endsWith("/") ? path.startsWith(prefix) : path === prefix || path.startsWith(`${prefix}/`);

export type Access = { allow: true } | { allow: false; redirect: string };

export function accessFor(path: string, role: Role | null): Access {
  if (PUBLIC.some((p) => under(path, p))) return { allow: true };
  if (!role) return { allow: false, redirect: `/login?next=${encodeURIComponent(path)}` };
  const home = homeFor(role);
  // Patients and families use the patient app only.
  if (role === "client") return { allow: false, redirect: home };
  if (role === "therapist") {
    // The organisation overview at "/" is for leadership and admins.
    if (path === "/" || NOT_FOR_THERAPISTS.some((p) => under(path, p))) {
      return { allow: false, redirect: home };
    }
    return { allow: true };
  }
  // Admins see every staff screen except a therapist's own workspace.
  if (THERAPIST_ONLY.some((p) => under(path, p))) return { allow: false, redirect: home };
  return { allow: true };
}
