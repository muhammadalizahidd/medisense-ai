import { describe, expect, it } from "vitest";
import { domains } from "@/lib/live/reports";
import { staffRoles } from "@/lib/live/catalogue";
import {
  builtInRoles,
  defaultPermissionsFor,
  permissionById,
  permissionGroups,
  permissionIds,
  permissions,
  reportDomains,
} from "./catalogue";

describe("permission catalogue", () => {
  it("has unique ids in a stable dotted format", () => {
    expect(new Set(permissionIds).size).toBe(permissionIds.length);
    for (const id of permissionIds) expect(id).toMatch(/^[a-z-]+(\.[a-z-]+)+$/);
  });

  it("holds every permission from the phase 0 inventory", () => {
    // 49 listed permissions plus read and detail for each of the 9 report domains, HR and
    // Messages, and pay rates (view and set), added with those modules.
    expect(permissions).toHaveLength(49 + 18 + 7 + 1 + 2 + 2);
  });

  it("puts every permission in a known group with a label and description", () => {
    for (const p of permissions) {
      expect(permissionGroups).toContain(p.group);
      expect(p.label.length).toBeGreaterThan(3);
      expect(p.description.length).toBeGreaterThan(10);
    }
  });

  it("only names built-in roles in defaults", () => {
    const slugs = builtInRoles.map((r) => r.slug) as string[];
    for (const p of permissions) for (const slug of p.defaults) expect(slugs).toContain(slug);
  });

  it("matches the legacy role names, so stored staffRoles still resolve", () => {
    expect(builtInRoles.map((r) => r.name).sort()).toEqual(
      staffRoles.filter((r) => r !== "Super Admin").sort(),
    );
  });

  it("covers exactly the report domains the reports module knows", () => {
    expect([...reportDomains]).toEqual([...domains]);
  });

  it("gives every built-in role at least one permission", () => {
    for (const role of builtInRoles)
      expect(defaultPermissionsFor(role.slug).length).toBeGreaterThan(0);
  });

  it("finds a permission by id", () => {
    expect(permissionById("funding.verify")?.group).toBe("Funding");
    expect(permissionById("nope")).toBeUndefined();
  });
});
