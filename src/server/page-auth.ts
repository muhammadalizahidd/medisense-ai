import "server-only";
import { redirect } from "next/navigation";
import { appForPath, appOpen, appsForRole } from "@/lib/permissions/apps";
import { landingFor } from "@/lib/permissions/landing";
import { canOpenPage, pageAccessFor } from "@/lib/permissions/pages";
import { currentUser } from "./auth";
import { DatabaseUnavailable } from "./db";
import type { UserRole } from "./models";
import { heldPermissions } from "./permissions";

/**
 * For live pages: sends people who aren't signed in to the sign-in screen, and people with the
 * wrong role, or without the permissions the page needs, to their own home. Returns null when the
 * database can't be reached.
 */
export async function requirePageUser(next: string, ...roles: UserRole[]) {
  let user;
  try {
    user = await currentUser();
  } catch (error) {
    if (error instanceof DatabaseUnavailable) return null;
    throw error;
  }
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  // A temporary password from User control must be replaced before any page opens.
  if (user.mustChangePassword) redirect(`/login?next=${encodeURIComponent(next)}`);
  const apps = appsForRole(user.role, heldPermissions(user), user.staffRoles);
  const access = pageAccessFor({
    permissions: [...heldPermissions(user)],
    staffRoles: user.staffRoles ?? [],
  });
  const home = landingFor(user.role, user.staffRoles, apps, access);
  // A therapist or mobile app opens for anyone whose role switches it on, not only for the role it
  // was built for.
  const app = appForPath(next);
  const grantedByApp = app !== null && app !== "admin" && appOpen(next, apps, user.role);
  if (
    !appOpen(next, apps, user.role) ||
    (roles.length && !roles.includes(user.role) && !grantedByApp)
  ) {
    redirect(home);
  }
  // An admin also needs a permission that opens this page, so typing the address gets no further
  // than the menu does.
  if (user.role === "admin" && !canOpenPage(next, access)) redirect(home);
  return user;
}
