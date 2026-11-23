import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeCollection, type Doc } from "@/test/fake-collection";
import type { OpsApprovalDoc, RoleDoc, UserDoc } from "./models";
import { planRoleSeed } from "./roles-seed";

/*
 * Operations follow the permissions: the flags a person gets, the team queues they work, and which
 * approvals they may decide all come from what their roles allow.
 */

const db = { roles: new FakeCollection() };
vi.mock("./db", () => ({ collections: async () => db }));
vi.mock("./log", () => ({ serverLog: () => undefined }));

const { loadPermissions } = await import("./permissions");
const { canDecide, opsCan, teamsFor } = await import("./operations");

const account = (staffRoles: string[], over: Partial<UserDoc> = {}) =>
  ({ name: "Pat Lee", role: "admin", staffRoles, ...over }) as unknown as UserDoc;
const as = (...names: string[]) => loadPermissions(account(names));
const role = (slug: string) => db.roles.docs.find((r) => r.slug === slug) as unknown as RoleDoc;

const approval = (workflow: string, over: Partial<OpsApprovalDoc> = {}) =>
  ({
    workflow,
    status: "Pending",
    initiator: "Someone Else",
    ...over,
  }) as unknown as OpsApprovalDoc;

beforeEach(() => {
  db.roles.docs = planRoleSeed([]).inserts as unknown as Doc[];
});

describe("what each role gets in operations", () => {
  it.each([
    ["Intake Officer", { intake: true }, ["Intake"]],
    ["Scheduler", { scheduler: true }, ["Scheduling"]],
    ["Finance", { finance: true }, ["Finance"]],
    ["Finance Manager", { finance: true }, ["Finance"]],
    ["Operations Manager", { manager: true }, ["Operations"]],
    ["Clinical Lead", { clinical: true, recordings: true }, ["Clinical"]],
  ])("%s", async (name, flags, teams) => {
    const person = await as(name);
    const can = opsCan(person);
    for (const key of [
      "manager",
      "clinical",
      "intake",
      "scheduler",
      "finance",
      "recordings",
    ] as const) {
      expect(can[key], `${name} ${key}`).toBe(Boolean((flags as Record<string, boolean>)[key]));
    }
    expect(can.teams).toEqual(teams);
    expect(teamsFor(person)).toEqual(teams);
  });

  it("gives the Super Admin every flag and every team", async () => {
    const can = opsCan(await as("Super Admin"));
    expect([can.manager, can.clinical, can.intake, can.scheduler, can.finance]).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(can.teams).toEqual(["Intake", "Scheduling", "Clinical", "Finance", "Operations"]);
  });

  it("puts therapists in the clinical team with no admin powers", async () => {
    const therapist = await loadPermissions(account(["Finance"], { role: "therapist" }));
    expect(teamsFor(therapist)).toEqual(["Clinical"]);
    const can = opsCan(therapist);
    expect([can.manager, can.clinical, can.intake, can.scheduler, can.finance]).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("follows a custom role's toggles", async () => {
    db.roles.docs.push({
      slug: "billing-desk",
      name: "Billing Desk",
      builtIn: false,
      permissions: ["operations.team.finance"],
    });
    const person = await as("billing-desk");
    expect(opsCan(person).finance).toBe(true);
    expect(opsCan(person).manager).toBe(false);
    expect(teamsFor(person)).toEqual(["Finance"]);
  });

  it("applies a change to a role on the next request", async () => {
    expect(opsCan(await as("Operations Manager")).manager).toBe(true);
    role("operations-manager").permissions = role("operations-manager").permissions.filter(
      (id) => id !== "operations.manage",
    );
    expect(opsCan(await as("Operations Manager")).manager).toBe(false);
  });
});

describe("deciding approvals", () => {
  const workflows = {
    clinical: [
      "Clinical-risk referral",
      "Therapist assignment exception",
      "Telehealth recording review",
      "Sensitive document distribution",
    ],
    funding: ["Funding exception"],
    billing: ["Billing adjustment"],
    manager: ["Unusual travel / booking exception", "Workflow rule activation"],
  };
  const who: Record<keyof typeof workflows, string[]> = {
    clinical: ["Clinical Lead"],
    funding: ["Finance", "Finance Manager"],
    billing: ["Finance Manager"],
    manager: ["Operations Manager"],
  };

  for (const [group, list] of Object.entries(workflows) as [keyof typeof workflows, string[]][]) {
    it.each(list)(`%s is decided by ${who[group].join(" and ")} only`, async (workflow) => {
      for (const name of [
        "Intake Officer",
        "Scheduler",
        "Finance",
        "Finance Manager",
        "Operations Manager",
        "Clinical Lead",
      ]) {
        expect(canDecide(await as(name), approval(workflow)), `${name} on ${workflow}`).toBe(
          who[group].includes(name),
        );
      }
      expect(canDecide(await as("Super Admin"), approval(workflow))).toBe(true);
    });
  }

  it("only decides approvals that are open", async () => {
    const lead = await as("Clinical Lead");
    expect(
      canDecide(lead, approval("Clinical-risk referral", { status: "Changes requested" })),
    ).toBe(true);
    for (const status of ["Approved", "Rejected"] as const) {
      expect(canDecide(lead, approval("Clinical-risk referral", { status }))).toBe(false);
    }
  });

  it("never lets someone decide their own request, except the Super Admin", async () => {
    const own = approval("Funding exception", { initiator: "Pat Lee" });
    expect(canDecide(await as("Finance"), own)).toBe(false);
    expect(canDecide(await as("Super Admin"), own)).toBe(true);
  });

  it("is closed to therapists and patients", async () => {
    const therapist = await loadPermissions(account(["Clinical Lead"], { role: "therapist" }));
    expect(canDecide(therapist, approval("Clinical-risk referral"))).toBe(false);
  });

  it("follows toggles: removing a permission removes the decision, a custom role can hold it", async () => {
    role("finance-manager").permissions = role("finance-manager").permissions.filter(
      (id) => id !== "approvals.decide.billing-adjustment",
    );
    expect(canDecide(await as("Finance Manager"), approval("Billing adjustment"))).toBe(false);
    db.roles.docs.push({
      slug: "adjuster",
      name: "Adjuster",
      builtIn: false,
      permissions: ["approvals.decide.billing-adjustment"],
    });
    expect(canDecide(await as("adjuster"), approval("Billing adjustment"))).toBe(true);
    expect(canDecide(await as("adjuster"), approval("Funding exception"))).toBe(false);
  });
});
