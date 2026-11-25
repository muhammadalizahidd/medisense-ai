import "server-only";
import { ObjectId, type Db } from "mongodb";
import {
  builtInRoles,
  defaultPermissionsFor,
  permissionIds,
  type BuiltInRoleSlug,
} from "@/lib/permissions/catalogue";
import type { RoleDoc } from "./models";

/** What to add to a built-in role that already exists, when the catalogue has grown. */
export type RoleSeedPlan = {
  inserts: RoleDoc[];
  grants: { slug: string; add: string[]; known: string[] }[];
  /** Built-in roles seeded before they recorded their original name. */
  legacyNames: { slug: string; legacyName: string }[];
};

/**
 * Works out what the built-in roles need. A role is created with its default permissions once.
 * After that, only permissions that are new to the catalogue are added, and only where the default
 * says so, so a Super Admin's edits (including removals) are never put back.
 */
export function planRoleSeed(existing: readonly RoleDoc[], now = new Date()): RoleSeedPlan {
  const plan: RoleSeedPlan = { inserts: [], grants: [], legacyNames: [] };
  for (const built of builtInRoles) {
    const slug: BuiltInRoleSlug = built.slug;
    const role = existing.find((r) => r.slug === slug);
    if (!role) {
      plan.inserts.push({
        _id: new ObjectId(),
        slug,
        name: built.name,
        legacyName: built.name,
        description: built.description,
        builtIn: true,
        permissions: defaultPermissionsFor(slug),
        knownPermissions: [...permissionIds],
        createdAt: now,
        updatedAt: now,
        updatedBy: null,
      });
      continue;
    }
    if (!role.legacyName) plan.legacyNames.push({ slug, legacyName: built.name });
    const known = new Set(role.knownPermissions ?? []);
    const fresh = permissionIds.filter((id) => !known.has(id));
    if (fresh.length === 0) continue;
    const defaults = new Set(defaultPermissionsFor(slug));
    plan.grants.push({
      slug,
      add: fresh.filter((id) => defaults.has(id) && !role.permissions.includes(id)),
      known: fresh,
    });
  }
  return plan;
}

/** Idempotent, and safe if two instances start at once: the upsert is atomic per role. */
export async function ensureBuiltInRoles(db: Db) {
  const roles = db.collection<RoleDoc>("roles");
  const plan = planRoleSeed(await roles.find().toArray());
  for (const doc of plan.inserts) {
    await roles.updateOne({ slug: doc.slug }, { $setOnInsert: doc }, { upsert: true });
  }
  for (const { slug, legacyName } of plan.legacyNames) {
    await roles.updateOne({ slug, legacyName: { $exists: false } }, { $set: { legacyName } });
  }
  for (const grant of plan.grants) {
    await roles.updateOne(
      { slug: grant.slug },
      {
        $addToSet: {
          permissions: { $each: grant.add },
          knownPermissions: { $each: grant.known },
        },
        $set: { updatedAt: new Date() },
      },
    );
  }
}
