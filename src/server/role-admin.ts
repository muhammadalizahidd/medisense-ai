import "server-only";
import { ObjectId } from "mongodb";
import { z } from "zod";
import {
  permissionById,
  permissionIds,
  defaultPermissionsFor,
  type BuiltInRoleSlug,
} from "@/lib/permissions/catalogue";
import { isSuperAdmin, roleKey, SUPER_ADMIN_ROLE } from "@/lib/permissions/can";
import type { RoleDto, RolesDto } from "@/lib/permissions/types";
import { collections } from "./db";
import { AuthError } from "./auth";
import { UserFacingError } from "./http";
import { adminIds, audit, publish } from "./live";
import type { RoleDoc, UserDoc } from "./models";
import { can, heldPermissions } from "./permissions";
import { loadRoles } from "./roles";
import { requireSuperAdmin } from "./user-control";

/*
 * Roles and permissions: the Super Admin creates roles, edits what each one allows, renames them
 * and resets built-in ones to their defaults. Toggles are recorded here; the app obeys each one
 * as its module moves to the central check (see enforcedPermissions in the catalogue).
 */

const nameSchema = z
  .string()
  .trim()
  .min(3, "Enter a name of at least 3 characters")
  .max(40, "Keep the name to 40 characters");
const descriptionSchema = z.string().trim().max(200, "Keep the description to 200 characters");

export const newRoleSchema = z.object({
  name: nameSchema,
  description: descriptionSchema.default(""),
  /** Start from this role's permissions instead of an empty role. */
  copyFrom: z.string().trim().max(60).optional(),
});

export const updateRoleSchema = z
  .object({
    name: nameSchema.optional(),
    description: descriptionSchema.optional(),
    permissions: z.array(z.string().trim().max(80)).max(200).optional(),
  })
  .refine(
    (v) => v.name !== undefined || v.description !== undefined || v.permissions !== undefined,
    {
      message: "Nothing to change.",
    },
  );

const norm = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();

export const slugify = (name: string) =>
  norm(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "") || "role";

/** Catalogue order, no repeats, and only permissions that exist. */
function cleanPermissions(ids: readonly string[]) {
  const unknown = ids.find((id) => !permissionById(id));
  if (unknown) throw new UserFacingError(`Unknown permission: ${unknown}.`);
  const wanted = new Set(ids);
  return permissionIds.filter((id) => wanted.has(id));
}

const labelOf = (id: string) => permissionById(id)?.label ?? id;

function diff(before: readonly string[], after: readonly string[]) {
  const had = new Set(before);
  const has = new Set(after);
  return {
    added: after.filter((id) => !had.has(id)),
    removed: before.filter((id) => !has.has(id)),
  };
}

async function find(slug: string): Promise<RoleDoc> {
  const { roles } = await collections();
  const role = await roles.findOne({ slug });
  if (!role) throw new UserFacingError("Role not found.", 404);
  return role;
}

/** Counts accounts by the key their staffRoles store, for built-in and custom roles alike. */
async function membersOf(roles: readonly RoleDoc[]) {
  const { users } = await collections();
  const admins = (await users
    .find({ role: "admin" }, { projection: { staffRoles: 1 } })
    .toArray()) as Pick<UserDoc, "staffRoles">[];
  const counts = new Map<string, number>();
  for (const role of roles) {
    const matched = resolveRolesFor(role);
    counts.set(
      role.slug,
      admins.filter((a) => (a.staffRoles ?? []).some((v) => matched(v))).length,
    );
  }
  return counts;
}

const resolveRolesFor = (role: RoleDoc) => (value: string) =>
  value === role.slug || value === role.legacyName;

/**
 * Who may look at and change roles. The Super Admin always may. Someone with "Manage roles" may
 * read them, and change only the app switches they hold themselves (see updateRole).
 */
function requireRoleManager(me: UserDoc) {
  if (isSuperAdmin(me.staffRoles)) return;
  if (!can(me, "roles.manage")) throw new AuthError(403);
}

export async function listRoles(me: UserDoc): Promise<RolesDto> {
  requireRoleManager(me);
  // Creates any built-in role that is missing, so the list is never empty.
  await loadRoles();
  const { roles, users } = await collections();
  const docs = await roles.find().toArray();
  const counts = await membersOf(docs);
  const editors = new Map<string, string>();
  for (const d of docs) {
    const id = d.updatedBy;
    if (!id || editors.has(id.toHexString())) continue;
    const u = await users.findOne({ _id: id });
    if (u) editors.set(id.toHexString(), u.name);
  }
  const dtos: RoleDto[] = [...docs]
    .sort((x, y) => Number(y.builtIn) - Number(x.builtIn) || x.name.localeCompare(y.name))
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      description: r.description,
      builtIn: r.builtIn,
      key: roleKey(r),
      permissions: r.permissions,
      memberCount: counts.get(r.slug) ?? 0,
      updatedAt: r.updatedAt.toISOString(),
      updatedBy: r.updatedBy ? (editors.get(r.updatedBy.toHexString()) ?? null) : null,
    }));
  return { roles: dtos };
}

async function assertNameFree(name: string, exceptSlug?: string) {
  const wanted = norm(name);
  if (wanted === norm(SUPER_ADMIN_ROLE)) {
    throw new UserFacingError("Super Admin is the platform owner and isn't a role you can make.");
  }
  const taken = (await loadRoles()).some(
    (r) =>
      r.slug !== exceptSlug && (norm(r.name) === wanted || norm(r.legacyName ?? "") === wanted),
  );
  if (taken) throw new UserFacingError("A role already uses that name.", 409);
}

export async function createRole(me: UserDoc, input: z.infer<typeof newRoleSchema>) {
  requireSuperAdmin(me);
  await assertNameFree(input.name);
  const { roles } = await collections();
  // A new role starts with the admin app on, so what it is given works straight away.
  let permissions: string[] = ["app.admin"];
  if (input.copyFrom) permissions = [...permissions, ...(await find(input.copyFrom)).permissions];
  const existing = new Set((await roles.find().toArray()).map((r) => r.slug));
  const base = slugify(input.name);
  let slug = base;
  for (let n = 2; existing.has(slug); n += 1) slug = `${base}-${n}`;
  const now = new Date();
  await roles.insertOne({
    _id: new ObjectId(),
    slug,
    name: input.name,
    description: input.description,
    builtIn: false,
    permissions: cleanPermissions(permissions),
    knownPermissions: [...permissionIds],
    createdAt: now,
    updatedAt: now,
    updatedBy: me._id,
  });
  await audit(
    me,
    `Created the role ${input.name}${input.copyFrom ? ` (copied from ${input.copyFrom})` : ""}`,
    null,
  );
  await publish(await adminIds(), "care", {});
  return { slug };
}

export async function updateRole(
  me: UserDoc,
  slug: string,
  input: z.infer<typeof updateRoleSchema>,
) {
  requireRoleManager(me);
  const superAdmin = isSuperAdmin(me.staffRoles);
  const role = await find(slug);
  const renamed = input.name !== undefined && input.name !== role.name;
  const redescribed = input.description !== undefined && input.description !== role.description;
  // A role manager changes only app switches, and only the ones they hold themselves.
  if (!superAdmin && (renamed || redescribed)) throw new AuthError(403);
  const set: Partial<RoleDoc> = { updatedAt: new Date(), updatedBy: me._id };
  const notes: string[] = [];
  if (input.name !== undefined && input.name !== role.name) {
    await assertNameFree(input.name, role.slug);
    set.name = input.name;
    notes.push(`renamed it from ${role.name} to ${input.name}`);
  }
  if (input.description !== undefined && input.description !== role.description) {
    set.description = input.description;
    notes.push("changed the description");
  }
  if (input.permissions !== undefined) {
    const next = cleanPermissions(input.permissions);
    const { added, removed } = diff(role.permissions, next);
    if (!superAdmin) {
      const held = heldPermissions(me);
      for (const id of [...added, ...removed]) {
        if (!id.startsWith("app.") || !held.has(id)) throw new AuthError(403);
      }
    }
    if (added.length || removed.length) {
      set.permissions = next;
      if (added.length) notes.push(`allowed ${added.map(labelOf).join(", ")}`);
      if (removed.length) notes.push(`removed ${removed.map(labelOf).join(", ")}`);
    }
  }
  if (notes.length === 0) return { changed: false };
  const { roles } = await collections();
  await roles.updateOne({ slug }, { $set: set });
  await audit(me, `Changed the role ${role.name}: ${notes.join("; ")}`, null);
  await publish(await adminIds(), "care", {});
  return { changed: true };
}

export async function deleteRole(me: UserDoc, slug: string) {
  requireSuperAdmin(me);
  const role = await find(slug);
  if (role.builtIn) {
    throw new UserFacingError(
      "Built-in roles can't be deleted. You can reset one to its defaults.",
      409,
    );
  }
  const members = (await membersOf([role])).get(role.slug) ?? 0;
  if (members > 0) {
    throw new UserFacingError(
      `${members} ${members === 1 ? "person holds" : "people hold"} this role. Take it off them first.`,
      409,
    );
  }
  const { roles } = await collections();
  await roles.deleteOne({ slug });
  await audit(me, `Deleted the role ${role.name}`, null);
  await publish(await adminIds(), "care", {});
}

export async function resetRole(me: UserDoc, slug: string) {
  requireSuperAdmin(me);
  const role = await find(slug);
  if (!role.builtIn)
    throw new UserFacingError("Only built-in roles have defaults to go back to.", 409);
  const next = defaultPermissionsFor(role.slug as BuiltInRoleSlug);
  const { added, removed } = diff(role.permissions, next);
  const { roles } = await collections();
  await roles.updateOne(
    { slug },
    {
      $set: {
        permissions: next,
        knownPermissions: [...permissionIds],
        updatedAt: new Date(),
        updatedBy: me._id,
      },
    },
  );
  await audit(
    me,
    `Reset the role ${role.name} to its defaults (${added.length} restored, ${removed.length} removed)`,
    null,
  );
  await publish(await adminIds(), "care", {});
}
