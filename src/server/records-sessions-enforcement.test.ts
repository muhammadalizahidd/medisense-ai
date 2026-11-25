import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeCollection, type Doc } from "@/test/fake-collection";
import type { AppointmentDoc, ClientDoc, RoleDoc, UserDoc } from "./models";
import type { ClinicalRecordDoc } from "./records";
import { planRoleSeed } from "./roles-seed";

/*
 * Records and sessions follow the permissions. A person holding several views gets the union: for
 * records the views are nested, so that is the widest; for sessions a Clinical Lead who also holds
 * the finance view gets both.
 */

const db = { roles: new FakeCollection() };
vi.mock("./db", () => ({ collections: async () => db }));
vi.mock("./log", () => ({ serverLog: () => undefined }));

const { loadPermissions } = await import("./permissions");
const { accessFor, isLead } = await import("./records");
const { viewOf } = await import("./sessions");

const account = (staffRoles: string[], over: Partial<UserDoc> = {}) =>
  ({
    _id: new ObjectId(),
    name: "Pat Lee",
    role: "admin",
    staffRoles,
    ...over,
  }) as unknown as UserDoc;
const as = (...names: string[]) => loadPermissions(account(names));

const client = { needs: [] } as unknown as ClientDoc;
const noGrants = { grants: [] } as unknown as ClinicalRecordDoc;
const level = async (...names: string[]) =>
  (await accessFor(await as(...names), client, noGrants)).level;

beforeEach(() => {
  db.roles.docs = planRoleSeed([]).inserts as unknown as Doc[];
});

describe("record access", () => {
  it.each([
    ["Clinical Lead", "clinical-lead"],
    ["Intake Officer", "intake"],
    ["Operations Manager", "intake"],
    ["Scheduler", "scheduler"],
    ["Finance", "finance"],
    ["Finance Manager", "finance"],
  ])("%s gets the %s view", async (name, expected) => {
    expect(await level(name)).toBe(expected);
  });

  it("gives the Super Admin the full clinical view", async () => {
    expect(await level("Super Admin")).toBe("clinical-lead");
  });

  it("gives someone holding several views the widest, which is the union", async () => {
    expect(await level("Intake Officer", "Scheduler", "Finance")).toBe("intake");
    expect(await level("Scheduler", "Finance")).toBe("scheduler");
    expect(await level("Finance", "Clinical Lead")).toBe("clinical-lead");
  });

  it("asks a Clinical Lead for a purpose until they have recorded one", async () => {
    const lead = await as("Clinical Lead");
    expect((await accessFor(lead, client, noGrants)).needsPurpose).toBe(true);
    const granted = {
      grants: [{ userId: lead._id, until: new Date(Date.now() + 60_000), purpose: "Review" }],
    } as unknown as ClinicalRecordDoc;
    expect((await accessFor(lead, client, granted)).needsPurpose).toBe(false);
  });

  it("gives a role with no record view nothing", async () => {
    db.roles.docs.push({ slug: "none-here", name: "Nothing", builtIn: false, permissions: [] });
    expect(await level("Nothing")).toBe("none");
  });

  it("follows toggles and custom roles", async () => {
    db.roles.docs.push({
      slug: "records-clerk",
      name: "Records Clerk",
      builtIn: false,
      permissions: ["app.admin", "records.view.scheduling"],
    });
    expect(await level("Records Clerk")).toBe("scheduler");
    const finance = db.roles.docs.find((r) => r.slug === "finance") as unknown as RoleDoc;
    finance.permissions = finance.permissions.filter((id) => id !== "records.view.finance");
    expect(await level("Finance")).toBe("none");
  });

  it("keeps therapists and patients out of the admin views", async () => {
    const therapist = await loadPermissions(account(["Clinical Lead"], { role: "therapist" }));
    expect(await accessFor(therapist, client, noGrants)).toMatchObject({ level: "none" });
    const patient = await loadPermissions(account(["Clinical Lead"], { role: "client" }));
    expect(await accessFor(patient, client, noGrants)).toMatchObject({ level: "none" });
  });

  it("tells who opens the full clinical record apart from who grants access", async () => {
    db.roles.docs.push({
      slug: "access-officer",
      name: "Access Officer",
      builtIn: false,
      permissions: ["app.admin", "records.grant-access"],
    });
    expect(isLead(await as("Clinical Lead"))).toBe(true);
    expect(isLead(await as("Access Officer"))).toBe(false);
    expect(isLead(await as("Finance"))).toBe(false);
  });
});

describe("session views", () => {
  const appointment = (discipline: string, therapistId = new ObjectId()) =>
    ({ discipline, therapistId }) as unknown as AppointmentDoc;

  it("gives a Clinical Lead the lead view, but status only on restricted disciplines", async () => {
    const lead = await as("Clinical Lead");
    expect(viewOf(lead, appointment("Occupational Therapy"))).toBe("lead");
    expect(viewOf(lead, appointment("Psychology"))).toBe("status");
  });

  it("gives Finance the finance view and everyone else status", async () => {
    expect(viewOf(await as("Finance"), appointment("Occupational Therapy"))).toBe("finance");
    expect(viewOf(await as("Finance Manager"), appointment("Psychology"))).toBe("finance");
    expect(viewOf(await as("Scheduler"), appointment("Occupational Therapy"))).toBe("status");
    expect(viewOf(await as("Intake Officer"), appointment("Occupational Therapy"))).toBe("status");
  });

  it("gives someone with both views both: lead, and finance on restricted sessions", async () => {
    const both = await as("Clinical Lead", "Finance");
    expect(viewOf(both, appointment("Occupational Therapy"))).toBe("lead");
    expect(viewOf(both, appointment("Psychology"))).toBe("finance");
  });

  it("gives the Super Admin both", async () => {
    const neil = await as("Super Admin");
    expect(viewOf(neil, appointment("Occupational Therapy"))).toBe("lead");
    expect(viewOf(neil, appointment("Psychology"))).toBe("finance");
  });

  it("lets a therapist edit their own sessions only, and shows patients nothing", async () => {
    const therapistId = new ObjectId();
    const therapist = await loadPermissions(account([], { role: "therapist", therapistId }));
    expect(viewOf(therapist, appointment("Occupational Therapy", therapistId))).toBe("edit");
    expect(viewOf(therapist, appointment("Occupational Therapy"))).toBe("none");
    const patient = await loadPermissions(account([], { role: "client" }));
    expect(viewOf(patient, appointment("Occupational Therapy"))).toBe("none");
  });

  it("follows toggles: a custom role with only the lead permission", async () => {
    db.roles.docs.push({
      slug: "reviewer",
      name: "Reviewer",
      builtIn: false,
      permissions: ["app.admin", "sessions.oversight"],
    });
    expect(viewOf(await as("Reviewer"), appointment("Occupational Therapy"))).toBe("lead");
    expect(viewOf(await as("Reviewer"), appointment("Psychology"))).toBe("status");
  });
});
