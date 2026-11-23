import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultPermissionsFor, permissionIds } from "@/lib/permissions/catalogue";
import { FakeCollection, type Doc } from "@/test/fake-collection";
import type { RoleDoc, UserDoc } from "./models";
import { planRoleSeed } from "./roles-seed";

const db = {
  users: new FakeCollection(),
  roles: new FakeCollection(),
  sessions: new FakeCollection(),
};
const auditLog: string[] = [];

vi.mock("./db", () => ({
  collections: async () => ({ ...db, db: { collection: () => db.roles } }),
}));
vi.mock("./live", () => ({
  adminIds: async () => [],
  audit: async (_me: unknown, action: string) => {
    auditLog.push(action);
  },
  publish: async () => undefined,
}));
vi.mock("./therapists", () => ({ setTherapistActive: vi.fn() }));
vi.mock("./auth", () => {
  class AuthError extends Error {
    constructor(readonly status: 401 | 403) {
      super("You don't have access to this.");
    }
  }
  return { AuthError, SESSION_DAYS: 14, hashPassword: async (p: string) => `hash:${p}` };
});

const {
  createRole,
  deleteRole,
  listRoles,
  newRoleSchema,
  resetRole,
  slugify,
  updateRole,
  updateRoleSchema,
} = await import("./role-admin");
const { assignableRoles } = await import("./roles");
const { AuthError } = await import("./auth");

const account = (name: string, staffRoles: string[], over: Partial<UserDoc> = {}) =>
  ({
    _id: new ObjectId(),
    email: `${name.toLowerCase().replace(/\s+/g, ".")}@medisense.test`,
    name,
    role: "admin",
    staffRoles,
    createdAt: new Date(),
    ...over,
  }) as UserDoc;

let neil: UserDoc;
let jo: UserDoc;

const role = (slug: string) => db.roles.docs.find((r) => r.slug === slug) as unknown as RoleDoc;
const create = (name: string, extra: Record<string, unknown> = {}) =>
  createRole(neil, newRoleSchema.parse({ name, ...extra }));

beforeEach(() => {
  neil = account("Neil Hensley", ["Super Admin", "Clinical Lead"]);
  jo = account("Jo Marsh", ["Scheduler", "Finance"]);
  db.users.docs = [neil, jo] as unknown as Doc[];
  db.roles.docs = planRoleSeed([]).inserts as unknown as Doc[];
  auditLog.length = 0;
});

describe("listing roles", () => {
  it("lists built-in roles first with how many people hold each", async () => {
    db.roles.docs.push({
      slug: "triage-desk",
      name: "Triage Desk",
      description: "",
      builtIn: false,
      permissions: [],
      updatedAt: new Date(),
      updatedBy: null,
    });
    jo.staffRoles = ["Scheduler", "triage-desk"];
    const { roles } = await listRoles(neil);
    expect(roles.map((r) => r.name)).toEqual([
      "Clinical Lead",
      "Finance",
      "Finance Manager",
      "Intake Officer",
      "Operations Manager",
      "Scheduler",
      "Triage Desk",
    ]);
    expect(roles.find((r) => r.name === "Scheduler")?.memberCount).toBe(1);
    expect(roles.find((r) => r.name === "Clinical Lead")?.memberCount).toBe(1);
    expect(roles.find((r) => r.name === "Triage Desk")?.memberCount).toBe(1);
    expect(roles.find((r) => r.name === "Finance Manager")?.memberCount).toBe(0);
  });

  it("is closed to anyone but the Super Admin", async () => {
    await expect(listRoles(jo)).rejects.toBeInstanceOf(AuthError);
  });

  it("creates the built-in roles first when the database has none, so the list is never empty", async () => {
    db.roles.docs = [];
    const { roles } = await listRoles(neil);
    expect(roles.map((r) => r.name)).toEqual([
      "Clinical Lead",
      "Finance",
      "Finance Manager",
      "Intake Officer",
      "Operations Manager",
      "Scheduler",
    ]);
    expect(roles.every((r) => r.permissions.length > 0)).toBe(true);
    expect(roles.find((r) => r.name === "Clinical Lead")?.memberCount).toBe(1);
  });
});

describe("creating roles", () => {
  it("makes a custom role with no permissions, a stable slug and an audit entry", async () => {
    const { slug } = await create("Triage Desk", { description: "First look at referrals." });
    expect(slug).toBe("triage-desk");
    expect(role(slug)).toMatchObject({
      name: "Triage Desk",
      builtIn: false,
      permissions: [],
      description: "First look at referrals.",
    });
    expect(role(slug).legacyName).toBeUndefined();
    expect(auditLog).toEqual(["Created the role Triage Desk"]);
  });

  it("can start from another role's permissions", async () => {
    const { slug } = await create("Billing Helper", { copyFrom: "finance" });
    expect(role(slug).permissions).toEqual(role("finance").permissions);
    expect(auditLog[0]).toBe("Created the role Billing Helper (copied from finance)");
  });

  it("refuses a missing role to copy from", async () => {
    await expect(create("Ghost", { copyFrom: "nope" })).rejects.toMatchObject({ status: 404 });
  });

  it("refuses a name another role already uses, ignoring case, spacing and original names", async () => {
    await expect(create("scheduler")).rejects.toMatchObject({ status: 409 });
    await expect(create("  Finance   Manager ")).rejects.toMatchObject({ status: 409 });
    await create("Triage Desk");
    await expect(create("TRIAGE desk")).rejects.toMatchObject({ status: 409 });
  });

  it("will not make a role called Super Admin", async () => {
    await expect(create("Super Admin")).rejects.toThrow(/platform owner/);
  });

  it("keeps slugs unique when names differ only by punctuation", async () => {
    const a = await create("Front Desk");
    const b = await create("Front-Desk!");
    expect(a.slug).toBe("front-desk");
    expect(b.slug).toBe("front-desk-2");
  });

  it("checks the name and description", () => {
    expect(() => newRoleSchema.parse({ name: "Ab" })).toThrow();
    expect(() => newRoleSchema.parse({ name: "x".repeat(41) })).toThrow();
    expect(() => newRoleSchema.parse({ name: "Fine", description: "x".repeat(201) })).toThrow();
  });

  it("is closed to anyone but the Super Admin", async () => {
    await expect(
      createRole(jo, newRoleSchema.parse({ name: "Triage Desk" })),
    ).rejects.toBeInstanceOf(AuthError);
  });
});

describe("editing roles", () => {
  it("changes permissions in catalogue order without repeats and audits what changed", async () => {
    await updateRole(neil, "scheduler", {
      permissions: ["funding.edit", "schedule.manage", "funding.edit"],
    });
    expect(role("scheduler").permissions).toEqual(["schedule.manage", "funding.edit"]);
    expect(auditLog[0]).toMatch(/^Changed the role Scheduler: allowed Edit funding;/);
    expect(auditLog[0]).toMatch(/removed .*Assign therapists/);
  });

  it("refuses a permission that does not exist and changes nothing", async () => {
    const before = [...role("finance").permissions];
    await expect(
      updateRole(neil, "finance", { permissions: ["finance.work", "nope.nothing"] }),
    ).rejects.toThrow(/Unknown permission: nope.nothing/);
    expect(role("finance").permissions).toEqual(before);
    expect(auditLog).toEqual([]);
  });

  it("does nothing, and writes no audit entry, when nothing changed", async () => {
    const same = [...role("finance").permissions];
    const result = await updateRole(neil, "finance", { permissions: same, name: "Finance" });
    expect(result).toEqual({ changed: false });
    expect(auditLog).toEqual([]);
  });

  it("renames a built-in role without changing what people's accounts store", async () => {
    await updateRole(neil, "intake-officer", { name: "Intake Coordinator" });
    expect(role("intake-officer").name).toBe("Intake Coordinator");
    expect(role("intake-officer").legacyName).toBe("Intake Officer");
    expect(auditLog[0]).toBe(
      "Changed the role Intake Coordinator: renamed it from Intake Officer to Intake Coordinator",
    );
    const [resolved] = await assignableRoles(["Intake Coordinator"]);
    expect(resolved).toEqual({ key: "Intake Officer", name: "Intake Coordinator" });
  });

  it("will not rename a role to a name another one holds", async () => {
    await expect(updateRole(neil, "scheduler", { name: "Finance" })).rejects.toMatchObject({
      status: 409,
    });
    await expect(updateRole(neil, "scheduler", { name: "Super Admin" })).rejects.toThrow();
    expect(role("scheduler").name).toBe("Scheduler");
  });

  it("lets a role keep its own name while changing the case", async () => {
    await updateRole(neil, "scheduler", { name: "SCHEDULER" });
    expect(role("scheduler").name).toBe("SCHEDULER");
  });

  it("changes the description", async () => {
    await updateRole(neil, "scheduler", { description: "Books the calendar." });
    expect(role("scheduler").description).toBe("Books the calendar.");
    expect(auditLog[0]).toMatch(/changed the description/);
  });

  it("answers 404 for a role that does not exist", async () => {
    await expect(updateRole(neil, "ghost", { name: "Whatever" })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("needs something to change", () => {
    expect(() => updateRoleSchema.parse({})).toThrow();
  });

  it("is closed to anyone but the Super Admin", async () => {
    await expect(updateRole(jo, "scheduler", { description: "x" })).rejects.toBeInstanceOf(
      AuthError,
    );
  });
});

describe("deleting and resetting", () => {
  it("deletes a custom role nobody holds", async () => {
    const { slug } = await create("Triage Desk");
    await deleteRole(neil, slug);
    expect(db.roles.docs.some((r) => r.slug === slug)).toBe(false);
    expect(auditLog.at(-1)).toBe("Deleted the role Triage Desk");
  });

  it("refuses to delete a custom role someone holds, saying how many", async () => {
    const { slug } = await create("Triage Desk");
    jo.staffRoles = [slug];
    await expect(deleteRole(neil, slug)).rejects.toThrow(/1 person holds this role/);
    account("Sam", [slug]);
    db.users.docs.push(account("Sam Rivera", [slug]) as unknown as Doc);
    await expect(deleteRole(neil, slug)).rejects.toThrow(/2 people hold this role/);
    expect(db.roles.docs.some((r) => r.slug === slug)).toBe(true);
  });

  it("never deletes a built-in role", async () => {
    await expect(deleteRole(neil, "finance")).rejects.toMatchObject({ status: 409 });
    expect(role("finance")).toBeDefined();
  });

  it("resets a built-in role to its defaults and says how much changed", async () => {
    await updateRole(neil, "finance", { permissions: ["referrals.process"] });
    auditLog.length = 0;
    await resetRole(neil, "finance");
    expect(role("finance").permissions).toEqual(defaultPermissionsFor("finance"));
    expect(auditLog[0]).toMatch(
      /^Reset the role Finance to its defaults \(\d+ restored, 1 removed\)$/,
    );
  });

  it("will not reset a custom role", async () => {
    const { slug } = await create("Triage Desk");
    await expect(resetRole(neil, slug)).rejects.toMatchObject({ status: 409 });
  });

  it("keeps knownPermissions current after a reset, so new permissions are not re-added", async () => {
    await resetRole(neil, "finance");
    expect(role("finance").knownPermissions).toEqual([...permissionIds]);
  });
});

describe("giving roles to people", () => {
  it("accepts built-in roles by name and custom roles by name or slug", async () => {
    const { slug } = await create("Triage Desk");
    expect(await assignableRoles(["Scheduler", "Triage Desk", slug])).toEqual([
      { key: "Scheduler", name: "Scheduler" },
      { key: slug, name: "Triage Desk" },
    ]);
  });

  it("refuses Super Admin and anything unknown", async () => {
    await expect(assignableRoles(["Super Admin"])).rejects.toThrow(/Transfer/);
    await expect(assignableRoles(["super admin"])).rejects.toThrow(/Transfer/);
    await expect(assignableRoles(["Janitor"])).rejects.toThrow(/Unknown role/);
  });
});

describe("slugify", () => {
  it.each([
    ["Triage Desk", "triage-desk"],
    ["  Front-Desk!  ", "front-desk"],
    ["Ops & Care", "ops-care"],
    ["???", "role"],
  ])("turns %s into %s", (name, expected) => {
    expect(slugify(name)).toBe(expected);
  });
});
