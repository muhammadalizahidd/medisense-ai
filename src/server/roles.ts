import "server-only";
import {
  can,
  effectivePermissions,
  resolveRoles,
  roleKey,
  SUPER_ADMIN_ROLE,
  type RoleLike,
} from "@/lib/permissions/can";
import { limitToApps } from "@/lib/permissions/apps";
import { builtInRoles } from "@/lib/permissions/catalogue";
import { collections } from "./db";
import { UserFacingError } from "./http";
import type { UserDoc } from "./models";
import { ensureBuiltInRoles } from "./roles-seed";

/**
 * Roles are read on every request so a change by the Super Admin applies at once. If a built-in
 * role is missing (a database set up before roles existed, or a server that was already running
 * when they were added), they are created here, so nobody is left with no permissions. Seeding
 * is idempotent and never changes a role that already exists.
 */
export async function loadRoles(): Promise<RoleLike[]> {
  const { roles, db } = await collections();
  let docs = await roles.find().toArray();
  if (builtInRoles.some((b) => !docs.some((d) => d.slug === b.slug))) {
    await ensureBuiltInRoles(db);
    docs = await roles.find().toArray();
  }
  return docs.map((r) => ({
    slug: r.slug,
    name: r.name,
    legacyName: r.legacyName,
    permissions: r.permissions,
  }));
}

/**
 * What this person may do. Office staff get the union of their roles' permissions (everything for
 * the Super Admin). Therapists and patients have fixed access, so they carry none here.
 */
export async function permissionsOf(user: Pick<UserDoc, "role" | "staffRoles">): Promise<string[]> {
  if (user.role !== "admin") return [];
  return [
    ...limitToApps(
      new Set(effectivePermissions(user.staffRoles, await loadRoles())),
      user.staffRoles,
    ),
  ];
}

export async function userCan(
  user: Pick<UserDoc, "role" | "staffRoles">,
  permission: string,
): Promise<boolean> {
  return can(await permissionsOf(user), permission);
}

/**
 * Turns the role names or keys sent from a screen into what accounts store (the key) and what to
 * show (the name). Anything unknown, and Super Admin, is refused: Super Admin only moves through
 * a transfer.
 */
export async function assignableRoles(
  values: readonly string[],
): Promise<{ key: string; name: string }[]> {
  const roles = await loadRoles();
  const found = new Map<string, { key: string; name: string }>();
  for (const value of values) {
    if (value.trim().toLowerCase() === SUPER_ADMIN_ROLE.toLowerCase()) {
      throw new UserFacingError("Super Admin can't be given out. Use Transfer Super Admin.");
    }
    const role = resolveRoles([value], roles)[0];
    if (!role) throw new UserFacingError(`Unknown role: ${value}.`);
    found.set(roleKey(role), { key: roleKey(role), name: role.name });
  }
  return [...found.values()];
}
