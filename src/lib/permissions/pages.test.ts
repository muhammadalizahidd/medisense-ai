import { describe, expect, it } from "vitest";
import { navigationFor } from "@/lib/navigation";
import { legacyCanOpen, legacyPageAccess } from "@/test/legacy-pages";
import { ALL_APPS, NO_APPS } from "./apps";
import { builtInRoles, defaultPermissionsFor, permissionIds } from "./catalogue";
import {
  canOpenPage,
  pageAccessFor,
  pagePermissions,
  pageRequirement,
  type PageAccess,
} from "./pages";

/*
 * Page access from permissions. For every built-in role it must open exactly the pages the old
 * role-based menu opened; custom permission sets open what they name.
 */

const accessFor = (slug: (typeof builtInRoles)[number]["slug"]): PageAccess => ({
  permissions: defaultPermissionsFor(slug),
  superAdmin: false,
  apps: ALL_APPS,
});
const superAdmin: PageAccess = { permissions: permissionIds, superAdmin: true, apps: ALL_APPS };

const pages = Object.keys(legacyPageAccess);
const detailPaths = pages.filter((p) => p !== "/").map((p) => `${p}/6a1f0c9e8b7d4e2a3c5b1f90`);

describe("page access equals the old menu", () => {
  it.each(builtInRoles)("$name opens the same pages", ({ slug, name }) => {
    for (const path of [...pages, ...detailPaths]) {
      const base = path.replace(/\/6a1f0c9e8b7d4e2a3c5b1f90$/, "");
      expect(canOpenPage(path, accessFor(slug)), `${name} ${path}`).toBe(
        legacyCanOpen(base, [name]),
      );
    }
  });

  it.each(builtInRoles)("$name's sidebar lists the same pages", ({ slug, name }) => {
    const everything = navigationFor("Admin", null, { liveOnly: true }).flatMap((g) =>
      g.items.map((i) => i.href),
    );
    const shown = navigationFor("Admin", accessFor(slug), { liveOnly: true }).flatMap((g) =>
      g.items.map((i) => i.href),
    );
    expect(shown).toEqual(everything.filter((href) => legacyCanOpen(href, [name])));
  });

  it("opens every page for the Super Admin, including the dashboard and User control", () => {
    for (const path of [...pages, ...detailPaths]) expect(canOpenPage(path, superAdmin)).toBe(true);
  });
});

describe("how a page is found", () => {
  it("opens any page that is not listed, for every admin", () => {
    expect(canOpenPage("/profile", { permissions: [], superAdmin: false, apps: ALL_APPS })).toBe(
      true,
    );
    expect(canOpenPage("/messages", { permissions: [], superAdmin: false, apps: ALL_APPS })).toBe(
      true,
    );
  });

  it("shows every page when there are no access details yet", () => {
    expect(canOpenPage("/care/users", null)).toBe(true);
    expect(canOpenPage("/care/billing", undefined)).toBe(true);
  });

  it("follows the closest listed page above a longer path", () => {
    expect(pageRequirement("/care/billing/abc")).toBe(pagePermissions["/care/billing"]);
    expect(pageRequirement("/care/funding/agreements/abc")).toBe(pagePermissions["/care/funding"]);
    expect(pageRequirement("/care/progress/reports/abc")).toBe(pagePermissions["/care/progress"]);
    expect(pageRequirement("/care/abc")).toBe(pagePermissions["/care"]);
  });

  it("does not let the dashboard's entry match every other page", () => {
    expect(pageRequirement("/")).toEqual([]);
    expect(pageRequirement("/profile")).toBeUndefined();
  });

  it("only matches whole path segments", () => {
    expect(pageRequirement("/care/billing-archive")).toBe(pagePermissions["/care"]);
    expect(pageRequirement("/telehealth/recordings/abc")).toBe(
      pagePermissions["/telehealth/recordings"],
    );
  });

  it("ignores a query string or fragment", () => {
    expect(pageRequirement("/care/billing?tab=claims")).toBe(pagePermissions["/care/billing"]);
  });

  it("keeps the dashboard and User control for the Super Admin alone", () => {
    const everything = { permissions: permissionIds, superAdmin: false, apps: ALL_APPS };
    expect(canOpenPage("/", everything)).toBe(false);
    expect(canOpenPage("/care/users", everything)).toBe(true);
    const withoutRoles = {
      ...everything,
      permissions: permissionIds.filter((id) => id !== "roles.manage"),
    };
    expect(canOpenPage("/care/users", withoutRoles)).toBe(false);
  });
});

describe("custom permissions", () => {
  it("opens the pages a custom set names", () => {
    const biller: PageAccess = { permissions: ["finance.work"], superAdmin: false, apps: ALL_APPS };
    expect(canOpenPage("/care/billing", biller)).toBe(true);
    expect(canOpenPage("/care/funding", biller)).toBe(false);
    expect(canOpenPage("/care/records", biller)).toBe(false);
  });

  it("lets an admin with no permissions open only the pages anyone may", () => {
    const none: PageAccess = { permissions: [], superAdmin: false, apps: ALL_APPS };
    for (const path of pages) expect(canOpenPage(path, none)).toBe(false);
    expect(canOpenPage("/profile", none)).toBe(true);
  });

  it("builds access from a signed-in person's session", () => {
    expect(pageAccessFor({ permissions: ["finance.work"], staffRoles: ["Finance"] })).toEqual({
      permissions: ["finance.work"],
      superAdmin: false,
      apps: NO_APPS,
    });
    expect(
      pageAccessFor({ permissions: [], staffRoles: ["Super Admin", "Clinical Lead"] }).superAdmin,
    ).toBe(true);
  });
});
