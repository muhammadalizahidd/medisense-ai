import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeCollection, type Doc } from "@/test/fake-collection";
import { AuthError } from "./auth-error";
import type { RoleDoc, UserDoc } from "./models";
import { planRoleSeed } from "./roles-seed";

/*
 * Enforcement: the permissions a person holds, as set in the roles collection, decide what the
 * modules that have moved to can() allow. Changing a role changes the outcome on the next request.
 */

const db = { roles: new FakeCollection() };
vi.mock("./db", () => ({
  collections: async () => ({ ...db, db: { collection: () => db.roles } }),
}));

const { can, canAny, grantPermissions, loadPermissions, mustCan, mustCanAny } =
  await import("./permissions");
const { canEditFunding, canVerify, isClinicalLead } = await import("./funding");
const { isManager, isOfficer, mustManager, mustOfficer } = await import("./finance");

const account = (staffRoles: string[], role: UserDoc["role"] = "admin") =>
  ({ role, staffRoles }) as unknown as UserDoc;

const role = (slug: string) => db.roles.docs.find((r) => r.slug === slug) as unknown as RoleDoc;
const withRoles = (...names: string[]) => loadPermissions(account(names));

beforeEach(() => {
  db.roles.docs = planRoleSeed([]).inserts as unknown as Doc[];
});

describe("the central check", () => {
  it("gives each built-in role what its defaults say", async () => {
    const finance = await withRoles("Finance");
    expect(can(finance, "finance.work")).toBe(true);
    expect(can(finance, "finance.approve")).toBe(false);
    expect(can(await withRoles("Finance Manager"), "finance.approve")).toBe(true);
    expect(can(await withRoles("Scheduler"), "finance.work")).toBe(false);
  });

  it("adds up several roles", async () => {
    const jo = await withRoles("Scheduler", "Finance");
    expect(can(jo, "schedule.manage")).toBe(true);
    expect(can(jo, "finance.work")).toBe(true);
    expect(can(jo, "referrals.triage")).toBe(false);
  });

  it("gives the Super Admin everything, with no role needed", async () => {
    db.roles.docs = [];
    const neil = await withRoles("Super Admin");
    expect(can(neil, "finance.approve")).toBe(true);
    expect(can(neil, "referrals.triage")).toBe(true);
    expect(can(neil, "reports.read.audit")).toBe(true);
  });

  it("creates the built-in roles on first use when the database has none", async () => {
    db.roles.docs = [];
    const finance = await withRoles("Finance");
    expect(can(finance, "finance.work")).toBe(true);
    expect(db.roles.docs.map((r) => r.slug)).toHaveLength(6);
  });

  it("creates only the roles that are missing, and never changes one that exists", async () => {
    const finance = role("finance");
    finance.permissions = ["referrals.process"];
    db.roles.docs = db.roles.docs.filter((r) => r.slug !== "scheduler");
    expect(can(await withRoles("Scheduler"), "schedule.manage")).toBe(true);
    expect(role("finance").permissions).toEqual(["referrals.process"]);
    expect(db.roles.docs).toHaveLength(6);
  });

  it("gives therapists and patients nothing here", async () => {
    expect(can(await loadPermissions(account(["Finance"], "therapist")), "finance.work")).toBe(
      false,
    );
    expect(can(await loadPermissions(account(["Finance"], "client")), "finance.work")).toBe(false);
  });

  it("denies, rather than guesses, for a person whose permissions were never loaded", () => {
    expect(can(account(["Finance Manager"]), "finance.work")).toBe(false);
  });

  it("applies a change to a role on the next request", async () => {
    expect(can(await withRoles("Finance"), "finance.work")).toBe(true);
    role("finance").permissions = role("finance").permissions.filter((id) => id !== "finance.work");
    expect(can(await withRoles("Finance"), "finance.work")).toBe(false);
  });

  it("follows a role that was renamed, through its original name", async () => {
    role("finance").name = "Billing Team";
    expect(can(await withRoles("Finance"), "finance.work")).toBe(true);
  });

  it("gives a custom role only what its toggles allow", async () => {
    db.roles.docs.push({
      slug: "triage-desk",
      name: "Triage Desk",
      builtIn: false,
      permissions: ["referrals.process"],
    });
    const person = await withRoles("triage-desk");
    expect(can(person, "referrals.process")).toBe(true);
    expect(can(person, "referrals.triage")).toBe(false);
  });

  it("ignores a role that no longer exists", async () => {
    expect(can(await withRoles("Deleted Role"), "finance.work")).toBe(false);
  });

  it("checks any of several permissions", async () => {
    const person = await withRoles("Scheduler");
    expect(canAny(person, ["finance.work", "schedule.manage"])).toBe(true);
    expect(canAny(person, ["finance.work", "finance.approve"])).toBe(false);
    expect(() => mustCanAny(person, ["finance.work"])).toThrow(AuthError);
    expect(() => mustCanAny(person, ["schedule.manage"])).not.toThrow();
  });

  it("refuses with a 403 when a permission is missing", async () => {
    const person = await withRoles("Scheduler");
    expect(() => mustCan(person, "finance.work")).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
    expect(() => mustCan(person, "schedule.manage")).not.toThrow();
  });

  it("can be set directly for code that already holds the set", () => {
    const person = grantPermissions(account(["Finance"]), ["finance.approve"]);
    expect(can(person, "finance.approve")).toBe(true);
    expect(can(person, "finance.work")).toBe(false);
  });
});

describe("billing follows the finance permissions", () => {
  it("lets Finance work billing but not approve, and the Finance Manager do both", async () => {
    const finance = await withRoles("Finance");
    expect(isOfficer(finance)).toBe(true);
    expect(isManager(finance)).toBe(false);
    expect(() => mustOfficer(finance)).not.toThrow();
    expect(() => mustManager(finance, "approve it")).toThrow(
      /Only a Finance Manager can approve it/,
    );
    const manager = await withRoles("Finance Manager");
    expect(isOfficer(manager) && isManager(manager)).toBe(true);
  });

  it("stops Finance working billing once the Super Admin removes the permission", async () => {
    role("finance").permissions = role("finance").permissions.filter((id) => id !== "finance.work");
    const finance = await withRoles("Finance");
    expect(isOfficer(finance)).toBe(false);
    expect(() => mustOfficer(finance)).toThrow(/Only Finance can do this/);
  });

  it("lets a custom role approve finance exceptions without being Finance", async () => {
    db.roles.docs.push({
      slug: "biller",
      name: "Biller",
      builtIn: false,
      permissions: ["finance.work", "finance.approve"],
    });
    const biller = await withRoles("biller");
    expect(isOfficer(biller)).toBe(true);
    expect(isManager(biller)).toBe(true);
  });

  it("never lets a therapist or patient through, even holding the same role names", async () => {
    expect(isOfficer(await loadPermissions(account(["Finance"], "therapist")))).toBe(false);
  });
});

describe("funding follows the funding permissions", () => {
  it("gives the Finance Manager verify and edit by default", async () => {
    const manager = await withRoles("Finance Manager");
    expect(canVerify(manager)).toBe(true);
    expect(canEditFunding(manager)).toBe(true);
  });

  it("lets Intake edit but not verify, and the Clinical Lead pass only the clinical gate", async () => {
    const intake = await withRoles("Intake Officer");
    expect(canEditFunding(intake)).toBe(true);
    expect(canVerify(intake)).toBe(false);
    const lead = await withRoles("Clinical Lead");
    expect(isClinicalLead(lead)).toBe(true);
    expect(canVerify(lead) || canEditFunding(lead)).toBe(false);
  });

  it("follows toggles: granting verify to Scheduler makes only that change", async () => {
    role("scheduler").permissions = [...role("scheduler").permissions, "funding.verify"];
    const scheduler = await withRoles("Scheduler");
    expect(canVerify(scheduler)).toBe(true);
    expect(canEditFunding(scheduler)).toBe(false);
  });
});
