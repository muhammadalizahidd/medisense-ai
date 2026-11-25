import { describe, expect, it } from "vitest";
import { ALL_APPS } from "./apps";
import { builtInRoles, defaultPermissionsFor, permissionIds } from "./catalogue";
import { landingFor } from "./landing";
import { canOpenPage, type PageAccess } from "./pages";

const accessFor = (slug: (typeof builtInRoles)[number]["slug"]): PageAccess => ({
  permissions: defaultPermissionsFor(slug),
  superAdmin: false,
  apps: ALL_APPS,
});

describe("where people land", () => {
  it.each(builtInRoles)(
    "$name lands on a page they can open, so it can't loop",
    ({ slug, name }) => {
      const access = accessFor(slug);
      const home = landingFor("admin", [name], ALL_APPS, access);
      expect(canOpenPage(home, access), `${name} lands on ${home}`).toBe(true);
    },
  );

  it("keeps the usual home when it opens", () => {
    expect(landingFor("admin", ["Intake Officer"], ALL_APPS, accessFor("intake-officer"))).toBe(
      "/care",
    );
    const superAdmin: PageAccess = { permissions: permissionIds, superAdmin: true, apps: ALL_APPS };
    expect(landingFor("admin", ["Super Admin"], ALL_APPS, superAdmin)).toBe("/");
  });

  it("sends Finance to their own work, not to Messages", () => {
    const home = landingFor("admin", ["Finance Manager"], ALL_APPS, accessFor("finance-manager"));
    expect(["/care/funding", "/care/billing"]).toContain(home);
  });

  it("leaves therapists on their own home", () => {
    expect(landingFor("therapist", [], ALL_APPS, accessFor("finance"))).toBe("/therapist/today");
  });
});
