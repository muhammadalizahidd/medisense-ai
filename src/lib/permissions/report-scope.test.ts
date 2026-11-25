import { describe, expect, it } from "vitest";
import {
  domains,
  scopeFromPermissions,
  therapistDomains,
  therapistViewScope,
} from "@/lib/live/reports";
import { defaultScope } from "@/test/scope";
import { legacyAdminScope } from "@/test/legacy-report-scope";
import {
  builtInRoles,
  defaultPermissionsFor,
  permissionIds,
  reportDetailId,
  reportReadId,
} from "./catalogue";
import { effectivePermissions } from "./can";

/*
 * Report scopes come from permissions. For every built-in role the result must equal what the
 * role-name rules gave, and a custom set of permissions must give exactly what it names.
 */

const defaults = (slug: (typeof builtInRoles)[number]["slug"]) =>
  new Set(defaultPermissionsFor(slug));

describe("report scope from permissions", () => {
  it.each(builtInRoles)("$name's defaults equal the role-name scope", ({ slug, name }) => {
    const fromPermissions = scopeFromPermissions(defaults(slug), "admin", [name]);
    const legacy = legacyAdminScope([name]);
    expect(fromPermissions).toEqual(legacy);
  });

  it("gives the Super Admin everything, including clinical detail", () => {
    const scope = scopeFromPermissions(effectivePermissions(["Super Admin"], []), "admin", [
      "Super Admin",
    ]);
    expect(scope.domains).toEqual([...domains]);
    expect(scope.detail).toEqual([...domains]);
    expect(scope.clinicalDetail).toBe(true);
    expect(scope.share).toEqual(["Private", "Team", "Organisation"]);
    expect(scope.schedule).toBe(true);
    expect(scope.teams).toEqual(["Intake", "Scheduling", "Clinical", "Finance", "Operations"]);
  });

  it("adds up several roles", () => {
    const held = new Set([...defaults("intake-officer"), ...defaults("finance")]);
    const scope = scopeFromPermissions(held, "admin", ["Intake Officer", "Finance"]);
    expect(scope.domains).toEqual(["Referrals", "Participants", "Finance"]);
    expect(scope.detail).toEqual(["Referrals", "Participants", "Finance"]);
    expect(scope.teams).toEqual(["Intake", "Finance"]);
  });

  it("ignores row-level detail for a domain the person cannot read", () => {
    const scope = scopeFromPermissions([reportDetailId("Audit")], "admin", []);
    expect(scope.domains).toEqual([]);
    expect(scope.detail).toEqual([]);
  });

  it("gives a custom set of permissions exactly what it names", () => {
    const scope = scopeFromPermissions(
      [
        reportReadId("Audit"),
        reportReadId("Staff"),
        reportDetailId("Staff"),
        "reports.share.organisation",
      ],
      "admin",
      ["Auditor"],
    );
    expect(scope.domains).toEqual(["Staff", "Audit"]);
    expect(scope.detail).toEqual(["Staff"]);
    expect(scope.share).toEqual(["Private", "Organisation"]);
    expect(scope.clinicalDetail).toBe(false);
    expect(scope.schedule).toBe(false);
    expect(scope.teams).toEqual([]);
  });

  it("keeps domains in the order reports list them", () => {
    const held = [...domains].reverse().map((d) => reportReadId(d));
    expect(scopeFromPermissions(held, "admin", []).domains).toEqual([...domains]);
  });

  it("lets a person with no permissions read nothing but still keep private reports", () => {
    const scope = scopeFromPermissions([], "admin", []);
    expect(scope.domains).toEqual([]);
    expect(scope.share).toEqual(["Private"]);
  });

  it("keeps the fixed scopes for therapists and patients, whatever they carry", () => {
    const all = new Set(permissionIds);
    const therapist = scopeFromPermissions(all, "therapist", ["Finance"]);
    expect(therapist.label).toBe("Therapist (own caseload)");
    // Patients are included: the server cuts them to the therapist's own caseload.
    expect(therapist.domains).toEqual([
      "Staff",
      "Scheduling",
      "Clinical Operations",
      "Telehealth",
      "Participants",
    ]);
    expect(therapist.domains).not.toContain("Finance");
    expect(therapist.share).toEqual(["Private"]);
    const patient = scopeFromPermissions(all, "client", []);
    expect(patient.label).toBe("Participant");
    expect(patient.domains).toEqual([]);
    expect(patient.share).toEqual([]);
  });

  it("covers the permissions for every report domain", () => {
    for (const d of domains) {
      expect(permissionIds).toContain(reportReadId(d));
      expect(permissionIds).toContain(reportDetailId(d));
    }
  });
});

describe("an admin looking at one therapist's reports", () => {
  it("sees only the therapist's areas, and only those the admin may read", () => {
    const admin = defaultScope(["Operations Manager"]);
    const view = therapistViewScope(admin);
    expect(view.domains).toEqual(expect.arrayContaining(["Scheduling"]));
    for (const d of view.domains) expect(therapistDomains).toContain(d);
    for (const d of view.domains) expect(admin.domains).toContain(d);
    expect(view.domains).not.toContain("Finance");
  });

  it("keeps record detail to what the admin's own scope allows", () => {
    const view = therapistViewScope(defaultScope(["Operations Manager"]));
    expect(view.clinicalDetail).toBe(false);
    expect(view.share).toEqual(["Private"]);
    expect(view.schedule).toBe(false);
  });

  it("gives the Super Admin every therapist area, with clinical detail", () => {
    const view = therapistViewScope(defaultScope(["Super Admin"]));
    expect([...view.domains].sort()).toEqual([...therapistDomains].sort());
    expect(view.clinicalDetail).toBe(true);
  });
});
