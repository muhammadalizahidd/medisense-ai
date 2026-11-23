import { describe, expect, it } from "vitest";
import { permissionIds } from "./catalogue";
import {
  can,
  canAny,
  effectivePermissions,
  isSuperAdmin,
  resolveRoles,
  roleKey,
  type RoleLike,
} from "./can";

const roles: RoleLike[] = [
  { slug: "scheduler", name: "Scheduler", permissions: ["schedule.manage", "schedule.assign"] },
  { slug: "finance", name: "Finance", permissions: ["finance.work"] },
  {
    slug: "triage-desk",
    name: "Triage Desk",
    permissions: ["referrals.process", "schedule.manage"],
  },
];

describe("effective permissions", () => {
  it("is the union of a person's roles", () => {
    const set = effectivePermissions(["Scheduler", "Finance"], roles);
    expect([...set].sort()).toEqual(["finance.work", "schedule.assign", "schedule.manage"]);
  });

  it("does not repeat a permission two roles share", () => {
    const set = effectivePermissions(["Scheduler", "Triage Desk"], roles);
    expect([...set].filter((id) => id === "schedule.manage")).toHaveLength(1);
  });

  it("matches a role by slug or by name", () => {
    expect(resolveRoles(["scheduler"], roles)).toHaveLength(1);
    expect(resolveRoles(["Scheduler"], roles)).toHaveLength(1);
    expect(resolveRoles(["scheduler", "Scheduler"], roles)).toHaveLength(1);
  });

  it("ignores roles that do not exist, so they grant nothing", () => {
    expect(effectivePermissions(["Janitor"], roles).size).toBe(0);
    expect(effectivePermissions([], roles).size).toBe(0);
    expect(effectivePermissions(null, roles).size).toBe(0);
  });

  it("gives the Super Admin every permission, even with no roles defined", () => {
    const set = effectivePermissions(["Super Admin"], []);
    expect(set.size).toBe(permissionIds.length);
    expect(isSuperAdmin(["Super Admin", "Clinical Lead"])).toBe(true);
    expect(isSuperAdmin(["Scheduler"])).toBe(false);
  });

  it("checks one or several permissions", () => {
    const set = effectivePermissions(["Finance"], roles);
    expect(can(set, "finance.work")).toBe(true);
    expect(can(set, "finance.approve")).toBe(false);
    expect(can(["finance.work"], "finance.work")).toBe(true);
    expect(canAny(set, ["finance.approve", "finance.work"])).toBe(true);
    expect(canAny(set, [])).toBe(false);
  });

  it("still finds a built-in role by its original name after it is renamed", () => {
    const renamed: RoleLike[] = [
      {
        slug: "intake-officer",
        name: "Intake Coordinator",
        legacyName: "Intake Officer",
        permissions: ["referrals.process"],
      },
    ];
    expect([...effectivePermissions(["Intake Officer"], renamed)]).toEqual(["referrals.process"]);
    expect([...effectivePermissions(["Intake Coordinator"], renamed)]).toEqual([
      "referrals.process",
    ]);
  });

  it("stores a built-in role by its original name and a custom role by its slug", () => {
    expect(roleKey({ slug: "intake-officer", legacyName: "Intake Officer" })).toBe("Intake Officer");
    expect(roleKey({ slug: "triage-desk" })).toBe("triage-desk");
  });
});
