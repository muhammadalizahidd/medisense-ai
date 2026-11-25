import { scopeFromPermissions } from "@/lib/live/reports";
import { effectivePermissions } from "@/lib/permissions/can";
import { builtInRoles, defaultPermissionsFor } from "@/lib/permissions/catalogue";

const seeded = builtInRoles.map((r) => ({
  slug: r.slug,
  name: r.name,
  legacyName: r.name,
  permissions: defaultPermissionsFor(r.slug),
}));

/** The report scope an account gets from the built-in roles' default permissions. */
export const defaultScope = (staffRoles: string[], role = "admin") =>
  scopeFromPermissions(effectivePermissions(staffRoles, seeded), role, staffRoles);
