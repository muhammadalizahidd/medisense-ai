import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assignableStaffRoles, type StaffRole } from "@/lib/live/catalogue";
import type { UserDoc } from "./models";
import { planRoleSeed } from "./roles-seed";

/*
 * Role management (User control): create, read, update and deactivate office staff accounts, and
 * the guards around them. The database is an in-memory stand-in, so these run the real logic in
 * user-control.ts without MongoDB.
 */

type Doc = Record<string, unknown>;

const same = (a: unknown, b: unknown) =>
  a instanceof ObjectId && b instanceof ObjectId ? a.equals(b) : a === b;

/** Supports the query shapes user-control.ts uses: equality, $ne, and "array contains". */
function matches(doc: Doc, filter: Doc) {
  return Object.entries(filter).every(([key, want]) => {
    const have = doc[key];
    if (want && typeof want === "object" && !(want instanceof ObjectId) && "$ne" in want) {
      return !same(have, (want as { $ne: unknown }).$ne);
    }
    if (Array.isArray(have)) return have.some((v) => same(v, want));
    return same(have, want);
  });
}

class FakeCollection {
  docs: Doc[] = [];
  deleted: Doc[] = [];
  find(filter: Doc = {}) {
    return { toArray: async () => this.docs.filter((d) => matches(d, filter)) };
  }
  async findOne(filter: Doc) {
    return this.docs.find((d) => matches(d, filter)) ?? null;
  }
  async insertOne(doc: Doc) {
    this.docs.push(doc);
  }
  async updateOne(filter: Doc, update: { $set: Doc }) {
    const doc = this.docs.find((d) => matches(d, filter));
    if (doc) Object.assign(doc, update.$set);
  }
  async countDocuments(filter: Doc) {
    return this.docs.filter((d) => matches(d, filter)).length;
  }
  async deleteMany(filter: Doc) {
    this.deleted.push(filter);
  }
  aggregate() {
    return { toArray: async () => [] };
  }
}

const db = {
  users: new FakeCollection(),
  sessions: new FakeCollection(),
  roles: new FakeCollection(),
};
const auditLog: string[] = [];
const setTherapistActive = vi.fn();

vi.mock("./db", () => ({ collections: async () => db }));
vi.mock("./live", () => ({
  adminIds: async () => [],
  audit: async (_me: unknown, action: string) => {
    auditLog.push(action);
  },
  publish: async () => undefined,
}));
vi.mock("./therapists", () => ({
  setTherapistActive: (...args: unknown[]) => setTherapistActive(...args),
}));
vi.mock("./auth", () => {
  class AuthError extends Error {
    constructor(readonly status: 401 | 403) {
      super(status === 401 ? "Please sign in." : "You don't have access to this.");
    }
  }
  return {
    AuthError,
    SESSION_DAYS: 14,
    hashPassword: async (password: string) => `hash:${password}`,
  };
});

const {
  createUser,
  listUsers,
  newUserSchema,
  resetUserPassword,
  rolesSchema,
  setUserActive,
  updateRoles,
} = await import("./user-control");
const { AuthError } = await import("./auth");
const { UserFacingError } = await import("./http");

function user(over: Partial<UserDoc> & { name: string }): UserDoc {
  const id = new ObjectId();
  return {
    _id: id,
    email: `${over.name.toLowerCase().replace(/\W+/g, ".")}@medisense.test`,
    role: "admin",
    passwordHash: "hash:x",
    invite: null,
    therapistId: null,
    clientId: null,
    phone: null,
    staffRoles: [],
    mustChangePassword: false,
    lastSignInAt: new Date(),
    createdAt: new Date(),
    ...over,
  } as UserDoc;
}

let superAdmin: UserDoc;
let scheduler: UserDoc;

beforeEach(() => {
  db.roles.docs = planRoleSeed([]).inserts as unknown as Doc[];
  db.users.docs = [];
  db.users.deleted = [];
  db.sessions.deleted = [];
  auditLog.length = 0;
  setTherapistActive.mockReset();
  superAdmin = user({ name: "Neil Hensley", staffRoles: ["Super Admin"] });
  scheduler = user({ name: "Jo Marsh", staffRoles: ["Scheduler"] });
  db.users.docs.push(superAdmin as unknown as Doc, scheduler as unknown as Doc);
});

const input = (over: Record<string, unknown> = {}) =>
  newUserSchema.parse({
    name: "Casey Nguyen",
    email: "Casey.Nguyen@Medisense.test",
    staffRoles: ["Intake Officer"],
    ...over,
  });

const stored = (id: string) =>
  db.users.docs.find((d) => (d._id as ObjectId).toHexString() === id) as unknown as UserDoc;

describe("create", () => {
  it.each(assignableStaffRoles)(
    "the Super Admin can create a %s account",
    async (role: StaffRole) => {
      const created = await createUser(superAdmin, input({ staffRoles: [role] }));
      const doc = stored(created.id);
      expect(doc.role).toBe("admin");
      expect(doc.staffRoles).toEqual([role]);
      expect(doc.createdBy).toEqual(superAdmin._id);
    },
  );

  it("cannot hand out Super Admin: there is only one", async () => {
    await expect(createUser(superAdmin, input({ staffRoles: ["Super Admin"] }))).rejects.toThrow(
      /Transfer/,
    );
    await expect(
      createUser(superAdmin, input({ staffRoles: ["Finance", "Super Admin"] })),
    ).rejects.toThrow(/Transfer/);
    expect(db.users.docs).toHaveLength(2);
  });

  it("gives a custom role by its slug and a built-in role by its original name", async () => {
    db.roles.docs.push({
      slug: "triage-desk",
      name: "Triage Desk",
      builtIn: false,
      permissions: [],
    });
    const created = await createUser(
      superAdmin,
      input({ staffRoles: ["Triage Desk", "Scheduler"] }),
    );
    expect(stored(created.id).staffRoles).toEqual(["triage-desk", "Scheduler"]);
  });

  it("refuses a role that does not exist", async () => {
    await expect(createUser(superAdmin, input({ staffRoles: ["Janitor"] }))).rejects.toThrow(
      /Unknown role/,
    );
  });

  it("gives several responsibilities to one person and drops repeats", async () => {
    const created = await createUser(
      superAdmin,
      input({ staffRoles: ["Finance", "Scheduler", "Finance"] }),
    );
    expect(stored(created.id).staffRoles).toEqual(["Finance", "Scheduler"]);
  });

  it("issues a one-time temporary password that must be changed, and stores only its hash", async () => {
    const created = await createUser(superAdmin, input());
    const doc = stored(created.id);
    expect(created.temporaryPassword).toHaveLength(14);
    expect(doc.mustChangePassword).toBe(true);
    expect(doc.passwordHash).toBe(`hash:${created.temporaryPassword}`);
    expect(JSON.stringify(doc)).not.toContain(`"${created.temporaryPassword}"`);
  });

  it("lower-cases the email and records the action in the audit trail", async () => {
    const created = await createUser(superAdmin, input());
    expect(created.email).toBe("casey.nguyen@medisense.test");
    expect(auditLog).toEqual(["Created a user account for Casey Nguyen (Intake Officer)"]);
  });

  it("refuses a second account on the same email (409)", async () => {
    await createUser(superAdmin, input());
    await expect(
      createUser(superAdmin, input({ email: "CASEY.NGUYEN@medisense.test" })),
    ).rejects.toMatchObject({
      status: 409,
    });
    expect(db.users.docs).toHaveLength(3);
  });

  it("rejects bad input", () => {
    expect(() => input({ staffRoles: [] })).toThrow();
    expect(() => input({ email: "not-an-email" })).toThrow();
    expect(() => input({ name: "Al" })).toThrow();
  });

  it("only ever creates office staff, never a therapist or patient login", async () => {
    const created = await createUser(superAdmin, input());
    expect(stored(created.id).role).toBe("admin");
    expect(stored(created.id).therapistId).toBeNull();
    expect(stored(created.id).clientId).toBeNull();
  });

  it("is closed to every other kind of user", async () => {
    const therapist = user({ name: "Emma Clarke", role: "therapist" });
    const client = user({ name: "Patient One", role: "client" });
    for (const who of [scheduler, therapist, client]) {
      await expect(createUser(who, input())).rejects.toBeInstanceOf(AuthError);
    }
    expect(db.users.docs).toHaveLength(2);
  });
});

describe("read", () => {
  it("lists staff logins without password data, office staff before therapists, never patients", async () => {
    db.users.docs.push(
      user({
        name: "Emma Clarke",
        role: "therapist",
        therapistId: new ObjectId(),
      }) as unknown as Doc,
      user({ name: "Patient One", role: "client" }) as unknown as Doc,
    );
    const { users, superAdmins } = await listUsers(superAdmin);
    expect(users.map((u) => u.name)).toEqual(["Jo Marsh", "Neil Hensley", "Emma Clarke"]);
    expect(users.map((u) => u.kind)).toEqual(["Office staff", "Office staff", "Therapist"]);
    expect(superAdmins).toBe(1);
    expect(JSON.stringify(users)).not.toContain("passwordHash");
    expect(users.find((u) => u.name === "Neil Hensley")?.isSelf).toBe(true);
  });

  it("reports each account's sign-in state", async () => {
    db.users.docs.push(
      user({ name: "Pending Pat", mustChangePassword: true, lastSignInAt: null }) as unknown as Doc,
      user({ name: "Never Nell", lastSignInAt: null }) as unknown as Doc,
      user({ name: "Gone Gus", disabled: true }) as unknown as Doc,
    );
    const status = Object.fromEntries(
      (await listUsers(superAdmin)).users.map((u) => [u.name, u.status]),
    );
    expect(status).toMatchObject({
      "Pending Pat": "Must set password",
      "Never Nell": "Never signed in",
      "Gone Gus": "Deactivated",
      "Jo Marsh": "Active",
    });
  });

  it("is closed to a non-Super Admin", async () => {
    await expect(listUsers(scheduler)).rejects.toBeInstanceOf(AuthError);
  });
});

describe("update responsibilities", () => {
  it("changes what someone is responsible for, deduplicated, and audits it", async () => {
    await updateRoles(
      superAdmin,
      scheduler._id,
      rolesSchema.parse({ staffRoles: ["Finance", "Finance Manager", "Finance"] }),
    );
    expect(scheduler.staffRoles).toEqual(["Finance", "Finance Manager"]);
    expect(auditLog[0]).toBe("Changed Jo Marsh's responsibilities to Finance, Finance Manager");
  });

  it("cannot promote anyone to Super Admin", async () => {
    await expect(
      updateRoles(superAdmin, scheduler._id, { staffRoles: ["Super Admin", "Scheduler"] }),
    ).rejects.toThrow(/Transfer/);
    expect(scheduler.staffRoles).toEqual(["Scheduler"]);
  });

  it("rejects an empty list and unknown responsibilities", async () => {
    expect(() => rolesSchema.parse({ staffRoles: [] })).toThrow();
    await expect(
      updateRoles(superAdmin, scheduler._id, { staffRoles: ["Root"] }),
    ).rejects.toThrow(/Unknown role/);
    expect(scheduler.staffRoles).toEqual(["Scheduler"]);
  });

  it("applies to office staff only, not therapists", async () => {
    const therapist = user({ name: "Emma Clarke", role: "therapist" });
    db.users.docs.push(therapist as unknown as Doc);
    await expect(
      updateRoles(superAdmin, therapist._id, { staffRoles: ["Scheduler"] }),
    ).rejects.toBeInstanceOf(UserFacingError);
  });

  it("answers 404 for an account that does not exist", async () => {
    await expect(
      updateRoles(superAdmin, new ObjectId(), { staffRoles: ["Scheduler"] }),
    ).rejects.toMatchObject({
      status: 404,
    });
  });

  it("lets the Super Admin change their own other responsibilities and always keeps Super Admin", async () => {
    await updateRoles(superAdmin, superAdmin._id, { staffRoles: ["Finance"] });
    expect(superAdmin.staffRoles).toEqual(["Super Admin", "Finance"]);
    expect(auditLog.at(-1)).toBe("Changed Neil Hensley's responsibilities to Finance");
  });

  it("keeps Super Admin when the list sent leaves other responsibilities out", async () => {
    superAdmin.staffRoles = ["Super Admin", "Clinical Lead"];
    await updateRoles(superAdmin, superAdmin._id, { staffRoles: ["Clinical Lead"] });
    expect(superAdmin.staffRoles).toEqual(["Super Admin", "Clinical Lead"]);
  });

  it("is closed to a non-Super Admin, including changing their own roles", async () => {
    await expect(
      updateRoles(scheduler, scheduler._id, { staffRoles: ["Finance Manager"] }),
    ).rejects.toBeInstanceOf(AuthError);
    expect(scheduler.staffRoles).toEqual(["Scheduler"]);
  });
});

describe("deactivate and reactivate", () => {
  it("deactivating blocks sign-in, ends their sessions and keeps the record", async () => {
    await setUserActive(superAdmin, scheduler._id, false);
    expect(scheduler.disabled).toBe(true);
    expect(db.sessions.deleted).toEqual([{ userId: scheduler._id }]);
    expect(db.users.docs).toContain(scheduler);
    expect(auditLog[0]).toBe("Deactivated the account for Jo Marsh");
  });

  it("reactivating restores access without touching sessions", async () => {
    scheduler.disabled = true;
    await setUserActive(superAdmin, scheduler._id, true);
    expect(scheduler.disabled).toBe(false);
    expect(db.sessions.deleted).toEqual([]);
    expect(auditLog[0]).toBe("Reactivated the account for Jo Marsh");
  });

  it("will not deactivate the Super Admin, even themselves", async () => {
    await expect(setUserActive(superAdmin, superAdmin._id, false)).rejects.toThrow(
      /can't be deactivated.*Transfer/,
    );
    expect(superAdmin.disabled).toBeUndefined();
  });

  it("leaves patient access to the patient record", async () => {
    const client = user({ name: "Patient One", role: "client" });
    db.users.docs.push(client as unknown as Doc);
    await expect(setUserActive(superAdmin, client._id, false)).rejects.toThrow(/patient record/);
  });

  it("hands a therapist to the therapist workflow so matching and bookings follow", async () => {
    const tid = new ObjectId();
    const therapist = user({ name: "Emma Clarke", role: "therapist", therapistId: tid });
    db.users.docs.push(therapist as unknown as Doc);
    await setUserActive(superAdmin, therapist._id, false);
    expect(setTherapistActive).toHaveBeenCalledWith(superAdmin, tid, false);
    expect(therapist.disabled).toBeUndefined();
  });

  it("is closed to a non-Super Admin", async () => {
    await expect(setUserActive(scheduler, superAdmin._id, false)).rejects.toBeInstanceOf(AuthError);
  });
});

describe("reset password", () => {
  it("sets a new temporary password, forces a change and signs the person out", async () => {
    const { temporaryPassword } = await resetUserPassword(superAdmin, scheduler._id);
    expect(temporaryPassword).toHaveLength(14);
    expect(scheduler.passwordHash).toBe(`hash:${temporaryPassword}`);
    expect(scheduler.mustChangePassword).toBe(true);
    expect(db.sessions.deleted).toEqual([{ userId: scheduler._id }]);
  });

  it("will not reset your own password here, or a patient's", async () => {
    await expect(resetUserPassword(superAdmin, superAdmin._id)).rejects.toThrow(/My profile/);
    const client = user({ name: "Patient One", role: "client" });
    db.users.docs.push(client as unknown as Doc);
    await expect(resetUserPassword(superAdmin, client._id)).rejects.toThrow(/MRN/);
  });

  it("is closed to a non-Super Admin", async () => {
    await expect(resetUserPassword(scheduler, superAdmin._id)).rejects.toBeInstanceOf(AuthError);
  });
});
