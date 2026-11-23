import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
import { builtInRoles, defaultPermissionsFor, permissionIds } from "@/lib/permissions/catalogue";
import type { RoleDoc } from "./models";
import { planRoleSeed } from "./roles-seed";

const stored = (plan: ReturnType<typeof planRoleSeed>): RoleDoc[] => plan.inserts;

describe("seeding the built-in roles", () => {
  it("creates all six with their default permissions on a fresh database", () => {
    const plan = planRoleSeed([]);
    expect(plan.inserts.map((r) => r.slug)).toEqual(builtInRoles.map((r) => r.slug));
    for (const role of plan.inserts) {
      expect(role.builtIn).toBe(true);
      expect(role.permissions).toEqual(defaultPermissionsFor(role.slug as never));
      expect(role.knownPermissions).toEqual([...permissionIds]);
    }
    expect(plan.grants).toEqual([]);
  });

  it("does nothing the second time", () => {
    const plan = planRoleSeed(stored(planRoleSeed([])));
    expect(plan.inserts).toEqual([]);
    expect(plan.grants).toEqual([]);
  });

  it("never puts back a permission the Super Admin removed", () => {
    const roles = stored(planRoleSeed([]));
    const finance = roles.find((r) => r.slug === "finance")!;
    finance.permissions = finance.permissions.filter((id) => id !== "finance.work");
    const plan = planRoleSeed(roles);
    expect(plan.inserts).toEqual([]);
    expect(plan.grants).toEqual([]);
  });

  it("keeps a renamed built-in role and a role the Super Admin emptied", () => {
    const roles = stored(planRoleSeed([]));
    roles[0]!.name = "Intake Coordinator";
    roles[1]!.permissions = [];
    const plan = planRoleSeed(roles);
    expect(plan.inserts).toEqual([]);
  });

  it("adds a permission that is new to the catalogue, only to roles whose default holds it", () => {
    const roles = stored(planRoleSeed([]));
    // Pretend funding.edit and referrals.triage did not exist when these roles were seeded.
    for (const role of roles) {
      role.knownPermissions = role.knownPermissions.filter(
        (id) => id !== "funding.edit" && id !== "referrals.triage",
      );
      role.permissions = role.permissions.filter(
        (id) => id !== "funding.edit" && id !== "referrals.triage",
      );
    }
    const plan = planRoleSeed(roles);
    const addedTo = (id: string) =>
      plan.grants
        .filter((g) => g.add.includes(id))
        .map((g) => g.slug)
        .sort();
    expect(addedTo("funding.edit")).toEqual(["finance", "finance-manager", "intake-officer"]);
    expect(addedTo("referrals.triage")).toEqual(["clinical-lead"]);
    // Every role records the new ids as known, so they are never added again.
    expect(plan.grants.every((g) => g.known.includes("funding.edit"))).toBe(true);
  });

  it("does not add a new permission to a role that already holds it", () => {
    const roles = stored(planRoleSeed([]));
    const scheduler = roles.find((r) => r.slug === "scheduler")!;
    scheduler.knownPermissions = scheduler.knownPermissions.filter(
      (id) => id !== "schedule.manage",
    );
    const plan = planRoleSeed(roles);
    expect(plan.grants).toEqual([{ slug: "scheduler", add: [], known: ["schedule.manage"] }]);
  });

  it("gives every inserted role its own id", () => {
    const ids = planRoleSeed([]).inserts.map((r) => r._id.toHexString());
    expect(new Set(ids).size).toBe(6);
    expect(ids.every((id) => ObjectId.isValid(id))).toBe(true);
  });

  it("records each built-in role's original name, which accounts store", () => {
    for (const role of planRoleSeed([]).inserts) {
      expect(role.legacyName).toBe(builtInRoles.find((b) => b.slug === role.slug)!.name);
    }
  });

  it("backfills the original name on roles seeded before it existed, and only once", () => {
    const roles = stored(planRoleSeed([]));
    for (const role of roles) delete role.legacyName;
    const plan = planRoleSeed(roles);
    expect(plan.legacyNames.map((l) => l.slug)).toEqual(builtInRoles.map((b) => b.slug));
    expect(plan.legacyNames.find((l) => l.slug === "finance-manager")?.legacyName).toBe("Finance Manager");
    for (const role of roles) role.legacyName = builtInRoles.find((b) => b.slug === role.slug)!.name;
    expect(planRoleSeed(roles).legacyNames).toEqual([]);
  });
});
