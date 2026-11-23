import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeCollection, type Doc } from "@/test/fake-collection";
import type { UserDoc } from "./models";

const db = {
  users: new FakeCollection(),
  platform: new FakeCollection(),
  sessions: new FakeCollection(),
};
const auditLog: string[] = [];
const published: unknown[] = [];

vi.mock("./db", () => ({ collections: async () => db }));
vi.mock("./live", () => ({
  adminIds: async () => [],
  audit: async (_me: unknown, action: string) => {
    auditLog.push(action);
  },
  publish: async (ids: unknown) => {
    published.push(ids);
  },
}));
vi.mock("./therapists", () => ({ setTherapistActive: vi.fn() }));
vi.mock("./auth", () => {
  class AuthError extends Error {
    constructor(readonly status: 401 | 403) {
      super("You don't have access to this.");
    }
  }
  return {
    AuthError,
    SESSION_DAYS: 14,
    hashPassword: async (p: string) => `hash:${p}`,
    allowAttempt: () => true,
    checkPassword: async (_u: unknown, password: string) => password === "correct-password",
  };
});

const { transferBlocker, transferSchema, transferSuperAdmin } = await import("./super-admin");
const { AuthError } = await import("./auth");
const { PLATFORM_ID } = await import("./super-admin-seed");

function account(name: string, over: Partial<UserDoc> = {}) {
  return {
    _id: new ObjectId(),
    email: `${name.toLowerCase().replace(/\s+/g, ".")}@medisense.test`,
    name,
    role: "admin",
    passwordHash: "hash:x",
    invite: null,
    therapistId: null,
    clientId: null,
    staffRoles: [],
    mustChangePassword: false,
    lastSignInAt: new Date(),
    createdAt: new Date(),
    ...over,
  } as UserDoc;
}

let neil: UserDoc;
let helen: UserDoc;
let jo: UserDoc;

const body = (target: UserDoc, over: Record<string, unknown> = {}) =>
  transferSchema.parse({
    targetId: target._id.toHexString(),
    password: "correct-password",
    confirmName: target.name,
    ...over,
  });

const owner = () => (db.platform.docs[0] as Doc).superAdminId as ObjectId;

beforeEach(() => {
  neil = account("Neil Hensley", { staffRoles: ["Super Admin", "Clinical Lead"] });
  helen = account("Helen Brooks", { staffRoles: ["Clinical Lead"] });
  jo = account("Jo Marsh", { staffRoles: ["Scheduler", "Finance"] });
  db.users.docs = [neil, helen, jo] as unknown as Doc[];
  db.platform.docs = [{ _id: PLATFORM_ID, superAdminId: neil._id, updatedAt: new Date() }];
  auditLog.length = 0;
  published.length = 0;
});

describe("transfer Super Admin", () => {
  it("moves the role to the chosen account and records it", async () => {
    const result = await transferSuperAdmin(neil, body(jo));
    expect(result).toEqual({ ok: true, newSuperAdmin: "Jo Marsh" });
    expect(jo.staffRoles).toEqual(["Scheduler", "Finance", "Super Admin"]);
    expect(owner().equals(jo._id)).toBe(true);
    expect(auditLog).toEqual(["Transferred the Super Admin role from Neil Hensley to Jo Marsh"]);
    expect(published).toHaveLength(1);
  });

  it("leaves the former Super Admin with their other responsibilities only", async () => {
    await transferSuperAdmin(neil, body(helen));
    expect(neil.staffRoles).toEqual(["Clinical Lead"]);
    expect(helen.staffRoles).toEqual(["Clinical Lead", "Super Admin"]);
  });

  it("leaves exactly one holder afterwards", async () => {
    await transferSuperAdmin(neil, body(jo));
    const holders = db.users.docs.filter((d) => (d.staffRoles as string[]).includes("Super Admin"));
    expect(holders).toHaveLength(1);
  });

  it("takes the new owner's name case-insensitively and ignoring extra spaces", async () => {
    await transferSuperAdmin(neil, body(jo, { confirmName: "  jo   MARSH " }));
    expect(owner().equals(jo._id)).toBe(true);
  });

  it("needs the caller's password and changes nothing without it", async () => {
    await expect(transferSuperAdmin(neil, body(jo, { password: "wrong" }))).rejects.toThrow(
      /password is incorrect/,
    );
    expect(owner().equals(neil._id)).toBe(true);
    expect(jo.staffRoles).toEqual(["Scheduler", "Finance"]);
    expect(auditLog).toEqual([]);
  });

  it("needs the new owner's name typed correctly", async () => {
    await expect(transferSuperAdmin(neil, body(jo, { confirmName: "Jo" }))).rejects.toThrow(
      /name doesn't match/,
    );
    expect(owner().equals(neil._id)).toBe(true);
  });

  it("is closed to anyone who isn't the Super Admin, including after they transferred", async () => {
    await expect(transferSuperAdmin(helen, body(jo))).rejects.toBeInstanceOf(AuthError);
    await transferSuperAdmin(neil, body(jo));
    await expect(transferSuperAdmin(neil, body(helen))).rejects.toBeInstanceOf(AuthError);
  });

  it("refuses when the platform record no longer names the caller", async () => {
    db.platform.docs[0]!.superAdminId = helen._id;
    await expect(transferSuperAdmin(neil, body(jo))).rejects.toMatchObject({ status: 409 });
    expect(jo.staffRoles).toEqual(["Scheduler", "Finance"]);
    expect(neil.staffRoles).toContain("Super Admin");
  });

  it("rejects a target id that isn't valid or doesn't exist", async () => {
    await expect(
      transferSuperAdmin(
        neil,
        transferSchema.parse({ targetId: "nope", password: "correct-password", confirmName: "x" }),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      transferSuperAdmin(
        neil,
        transferSchema.parse({
          targetId: new ObjectId().toHexString(),
          password: "correct-password",
          confirmName: "x",
        }),
      ),
    ).rejects.toThrow(/not found/);
  });

  it("requires every field", () => {
    expect(() => transferSchema.parse({ targetId: "", password: "x", confirmName: "x" })).toThrow();
    expect(() => transferSchema.parse({ targetId: "a", password: "", confirmName: "x" })).toThrow();
    expect(() =>
      transferSchema.parse({ targetId: "a", password: "x", confirmName: " " }),
    ).toThrow();
  });
});

describe("who can receive it", () => {
  it("accepts an active office-staff account", () => {
    expect(transferBlocker(neil, helen)).toBeNull();
  });

  it.each([
    ["themselves", () => neil, /already are/],
    ["a deactivated account", () => account("Gus", { disabled: true }), /deactivated/],
    [
      "someone who hasn't set a password",
      () => account("Pat", { mustChangePassword: true }),
      /sign in and set/,
    ],
    [
      "someone who has never signed in",
      () => account("Nina", { lastSignInAt: null }),
      /sign in and set/,
    ],
    ["a therapist", () => account("Emma", { role: "therapist" }), /office staff/],
    ["a patient", () => account("Pia", { role: "client" }), /office staff/],
  ])("refuses %s", (_label, make, message) => {
    expect(transferBlocker(neil, make())).toMatch(message);
  });

  it("refuses an account that does not exist", () => {
    expect(transferBlocker(neil, null)).toMatch(/not found/);
  });
});
