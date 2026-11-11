import { homeFor } from "./live/routes";
import { navigation, type Role as NavRole } from "./navigation";
import type { Role } from "./live/types";

/**
 * Who may open which page. Checked before every page loads (src/proxy.ts), so a patient never
 * sees staff screens and a therapist never sees admin ones.
 */

/** Pages anyone can open, signed in or not: they handle their own sign-in or need none. */
const PUBLIC = ["/login", "/refer", "/join/", "/mobile/patient"];

/** Pages only for admins, beyond what the menu says. */
const ADMIN_ONLY = ["/care"];

/** Pages only for therapists. */
const THERAPIST_ONLY = ["/therapist", "/telehealth/room"];

const under = (path: string, prefix: string) =>
  prefix.endsWith("/") ? path.startsWith(prefix) : path === prefix || path.startsWith(`${prefix}/`);

/**
 * The menu's roles for a page: its own menu entry, or for a detail page (/patients/emily-carter)
 * the roles of its section's entries. Null when the page isn't in the menu at all.
 */
function menuRoles(path: string): NavRole[] | null {
  const items = navigation.flatMap((g) => g.items);
  const own = items
    .filter((i) => under(path, i.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (own) return own.roles;
  const section = `/${path.split("/")[1]}`;
  const related = items.filter((i) => under(i.href, section));
  return related.length ? [...new Set(related.flatMap((i) => i.roles))] : null;
}

export type Access = { allow: true } | { allow: false; redirect: string };

export function accessFor(path: string, role: Role | null): Access {
  if (PUBLIC.some((p) => under(path, p))) return { allow: true };
  if (!role) return { allow: false, redirect: `/login?next=${encodeURIComponent(path)}` };
  const home = homeFor(role);
  // Patients and families use the patient app only.
  if (role === "client") return { allow: false, redirect: home };
  if (role === "therapist") {
    if (ADMIN_ONLY.some((p) => under(path, p))) return { allow: false, redirect: home };
    const roles = menuRoles(path);
    if (roles && !roles.includes("Clinician")) return { allow: false, redirect: home };
    return { allow: true };
  }
  // Admins see every staff screen except a therapist's own workspace.
  if (THERAPIST_ONLY.some((p) => under(path, p))) return { allow: false, redirect: home };
  return { allow: true };
}
