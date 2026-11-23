import "server-only";
import { effectivePermissions } from "@/lib/permissions/can";
import { AuthError } from "./auth-error";
import { serverLog } from "./log";
import type { UserDoc } from "./models";
import { loadRoles } from "./roles";

/*
 * The central permission check. Each request resolves the signed-in person's permissions once,
 * when they are loaded (see currentUser), and `can()` reads them from there. Because the check
 * stays synchronous, the existing role checks in the modules can move over one at a time.
 */

type Actor = Pick<UserDoc, "role" | "staffRoles">;

const resolved = new WeakMap<object, ReadonlySet<string>>();

/** Reads this person's roles and remembers what they allow for the rest of the request. */
export async function loadPermissions<T extends Actor>(user: T): Promise<T> {
  resolved.set(
    user,
    user.role === "admin" ? effectivePermissions(user.staffRoles, await loadRoles()) : new Set(),
  );
  return user;
}

/** Sets a person's permissions directly. For tests and for code that already holds the set. */
export function grantPermissions<T extends Actor>(user: T, permissions: Iterable<string>): T {
  resolved.set(user, new Set(permissions));
  return user;
}

/** Every permission this person holds, as resolved for the request. */
export function heldPermissions(user: Actor): ReadonlySet<string> {
  return resolved.get(user) ?? new Set();
}

export function can(user: Actor, permission: string): boolean {
  const set = resolved.get(user);
  if (!set) {
    // A person whose permissions were never loaded gets nothing, rather than guessing.
    serverLog(`Permission ${permission} checked before permissions were loaded; denied.`);
    return false;
  }
  return set.has(permission);
}

/** Whether the person holds at least one of the permissions. */
export const canAny = (user: Actor, permissions: readonly string[]) =>
  permissions.some((p) => can(user, p));

/** Refuses with a 403 unless the person holds at least one of the permissions. */
export function mustCanAny(user: Actor, permissions: readonly string[]): void {
  if (!canAny(user, permissions)) throw new AuthError(403);
}

/** Refuses with a 403 unless the person holds the permission. */
export function mustCan(user: Actor, permission: string): void {
  if (!can(user, permission)) throw new AuthError(403);
}
