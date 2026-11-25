import { permissionIds } from "./catalogue";

/**
 * The pure rules for working out what someone may do. They take the roles as data, so the server,
 * the proxy and the screens share them and tests can run them without a database.
 */

export type RoleLike = {
  slug: string;
  name: string;
  /** Built-in roles: the original name that stored staffRoles use. */
  legacyName?: string;
  permissions: readonly string[];
};

/** What a person's staffRoles stores for a role: the original name for built-ins, else the slug. */
export const roleKey = (role: Pick<RoleLike, "slug" | "legacyName">) =>
  role.legacyName ?? role.slug;

/**
 * The Super Admin holds every permission and cannot be revoked. For now that is the "Super Admin"
 * entry in staffRoles; it moves to a single platform account in the Super Admin phase.
 */
export const SUPER_ADMIN_ROLE = "Super Admin";

export const isSuperAdmin = (staffRoles: readonly string[] | null | undefined) =>
  Boolean(staffRoles?.includes(SUPER_ADMIN_ROLE));

/**
 * A person's roles are stored by key (see roleKey): the original name for a built-in role and the
 * slug for a custom one. A current name matches too. Unknown values are ignored: they grant nothing.
 */
export function resolveRoles(values: readonly string[], roles: readonly RoleLike[]): RoleLike[] {
  const found = new Map<string, RoleLike>();
  for (const value of values) {
    const role = roles.find((r) => r.slug === value || r.legacyName === value || r.name === value);
    if (role) found.set(role.slug, role);
  }
  return [...found.values()];
}

/** Everything a person may do: the union of their roles, or everything for the Super Admin. */
export function effectivePermissions(
  staffRoles: readonly string[] | null | undefined,
  roles: readonly RoleLike[],
): ReadonlySet<string> {
  if (isSuperAdmin(staffRoles)) return new Set(permissionIds);
  const granted = new Set<string>();
  for (const role of resolveRoles(staffRoles ?? [], roles)) {
    for (const id of role.permissions) granted.add(id);
  }
  return granted;
}

export const can = (permissions: ReadonlySet<string> | readonly string[], id: string) =>
  Array.isArray(permissions)
    ? permissions.includes(id)
    : (permissions as ReadonlySet<string>).has(id);

/** Whether a person holds at least one of several permissions, as a menu entry needs. */
export const canAny = (
  permissions: ReadonlySet<string> | readonly string[],
  ids: readonly string[],
) => ids.some((id) => can(permissions, id));
