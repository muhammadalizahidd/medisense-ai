import { describe, expect, it, vi } from "vitest";
import {
  builtInRoles,
  defaultPermissionsFor,
  reportDomains,
  reportDetailId,
  reportReadId,
} from "@/lib/permissions/catalogue";
import { legacyAdminScope } from "@/test/legacy-report-scope";
import { legacyCanOpen } from "@/test/legacy-pages";
import { effectivePermissions } from "@/lib/permissions/can";
import type { UserDoc } from "./models";
import { grantPermissions } from "./permissions";
import { planRoleSeed } from "./roles-seed";

/*
 * Golden tests: the defaults in the permission catalogue must equal what the role checks decide,
 * role by role. The functions are imported from the modules that use them, so a change to either
 * side fails here. Modules still on the older role-name checks are compared with those checks; a
 * module that has moved to can() is checked through the seeded defaults. The few intended
 * differences are listed explicitly.
 */

vi.mock("./db", () => ({ collections: async () => ({}) }));

const { opsCan, teamsOf } = await import("./operations");
const { canVerify, canEditFunding, isClinicalLead } = await import("./funding");
const { mustOfficer, mustManager } = await import("./finance");
const { isLead } = await import("./records");

const seeded = planRoleSeed([]).inserts.map((r) => ({
  slug: r.slug,
  name: r.name,
  legacyName: r.legacyName,
  permissions: r.permissions,
}));

/** An office-staff account holding just this role, with the permissions the seeded defaults give it. */
const user = (name: string) =>
  grantPermissions(
    { role: "admin", staffRoles: [name] } as unknown as UserDoc,
    effectivePermissions([name], seeded),
  );

const holds = (slug: (typeof builtInRoles)[number]["slug"], id: string) =>
  defaultPermissionsFor(slug).includes(id);

const passes = (check: (u: UserDoc) => unknown, u: UserDoc) => {
  try {
    check(u);
    return true;
  } catch {
    return false;
  }
};

describe.each(builtInRoles)("defaults for $name equal today's behaviour", ({ slug, name }) => {
  const u = user(name);

  it("operations flags and team queues", () => {
    const can = opsCan(u);
    expect(holds(slug, "operations.manage")).toBe(can.manager);
    expect(holds(slug, "approvals.decide.manager")).toBe(can.manager);
    expect(holds(slug, "operations.clinical")).toBe(can.clinical);
    expect(holds(slug, "approvals.decide.clinical")).toBe(can.clinical);
    expect(holds(slug, "approvals.decide.funding")).toBe(can.finance);
    expect(holds(slug, "operations.matching")).toBe(can.scheduler || can.manager);
    const teams = teamsOf(u);
    expect(holds(slug, "operations.team.intake")).toBe(teams.includes("Intake"));
    expect(holds(slug, "operations.team.scheduling")).toBe(teams.includes("Scheduling"));
    expect(holds(slug, "operations.team.finance")).toBe(teams.includes("Finance"));
    expect(holds(slug, "operations.team.clinical")).toBe(teams.includes("Clinical"));
    expect(holds(slug, "operations.team.operations")).toBe(teams.includes("Operations"));
  });

  it("report scopes", () => {
    const scope = legacyAdminScope([name]);
    for (const domain of reportDomains) {
      expect(holds(slug, reportReadId(domain))).toBe(scope.domains.includes(domain));
      expect(holds(slug, reportDetailId(domain))).toBe(scope.detail.includes(domain));
    }
    expect(holds(slug, "reports.clinical-detail")).toBe(scope.clinicalDetail);
    expect(holds(slug, "reports.share.team")).toBe(scope.share.includes("Team"));
    expect(holds(slug, "reports.share.organisation")).toBe(scope.share.includes("Organisation"));
    expect(holds(slug, "reports.schedule")).toBe(scope.schedule);
  });

  it("billing", () => {
    expect(holds(slug, "finance.work")).toBe(passes(mustOfficer, u));
    expect(holds(slug, "finance.approve")).toBe(passes((x) => mustManager(x, "approve"), u));
    expect(holds(slug, "approvals.decide.billing-adjustment")).toBe(slug === "finance-manager");
  });

  it("clinical lead checks", () => {
    const lead = isLead(u);
    expect(holds(slug, "funding.clinical-gate")).toBe(isClinicalLead(u));
    for (const id of [
      "referrals.triage",
      "staff.verify-credentials",
      "records.view.clinical",
      "records.grant-access",
      "records.review-risks",
      "assessments.view",
      "assessments.cosign",
      "assessments.review",
      "plans.oversight",
      "progress.oversight",
      "documentation.oversight",
      "sessions.oversight",
      "recordings.manage",
      "coordination.review",
    ]) {
      expect(holds(slug, id), id).toBe(lead);
    }
  });

  it("funding (intended difference: the Finance Manager gains verify and edit)", () => {
    const fm = slug === "finance-manager";
    expect(holds(slug, "funding.verify")).toBe(canVerify(u) || fm);
    expect(holds(slug, "funding.edit")).toBe(canEditFunding(u) || fm);
  });

  it("record and session views", () => {
    expect(holds(slug, "records.view.intake")).toBe(
      ["intake-officer", "operations-manager"].includes(slug),
    );
    expect(holds(slug, "records.view.scheduling")).toBe(slug === "scheduler");
    expect(holds(slug, "records.view.finance")).toBe(["finance", "finance-manager"].includes(slug));
    expect(holds(slug, "sessions.finance-verify")).toBe(
      ["finance", "finance-manager"].includes(slug),
    );
  });

  it("actions the server left open follow the menu (intended difference)", () => {
    const page = (href: string) => legacyCanOpen(href, [name]);
    expect(holds(slug, "referrals.process")).toBe(page("/care/referrals"));
    expect(holds(slug, "patient-requests.process")).toBe(page("/care/patient-requests"));
    expect(holds(slug, "schedule.manage")).toBe(page("/care/schedule"));
    expect(holds(slug, "operations.retry-runs")).toBe(page("/care/operations"));
    for (const id of [
      "therapists.view",
      "therapists.add",
      "therapists.deactivate",
      "therapists.reset-password",
      "therapists.export",
    ]) {
      expect(holds(slug, id), id).toBe(page("/care/therapists"));
    }
    expect(holds(slug, "schedule.assign")).toBe(holds(slug, "operations.matching"));
  });
});
