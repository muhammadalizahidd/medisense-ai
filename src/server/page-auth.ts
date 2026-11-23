import "server-only";
import { redirect } from "next/navigation";
import { homeFor } from "@/lib/live/routes";
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
  if (roles.length && !roles.includes(user.role)) redirect(homeFor(user.role, user.staffRoles));
  // An admin also needs a permission that opens this page, so typing the address gets no further
  // than the menu does.
  const access = pageAccessFor({
    permissions: [...heldPermissions(user)],
    staffRoles: user.staffRoles ?? [],
  });
  if (user.role === "admin" && !canOpenPage(next, access)) {
    redirect(homeFor(user.role, user.staffRoles));
  }
  return user;
}
