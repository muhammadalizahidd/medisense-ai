import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
import { FakeDb, type Doc } from "@/test/fake-collection";
import type { UserDoc } from "./models";
import {
  PLATFORM_ID,
  SEEDED_OWNER_EMAIL,
  ensureSingleSuperAdmin,
  planSuperAdmin,
} from "./super-admin-seed";

const at = (day: number) => new Date(Date.UTC(2026, 0, day));
const account = (email: string, day: number, over: Partial<UserDoc> = {}) =>
  ({
    _id: new ObjectId(),
    email,
    role: "admin",
    name: email.split("@")[0],
    staffRoles: [],
    createdAt: at(day),
    ...over,
  }) as UserDoc;

const neil = () =>
  account(SEEDED_OWNER_EMAIL, 5, {
    name: "Neil Hensley",
    staffRoles: ["Super Admin", "Clinical Lead"],
  });

describe("choosing the single Super Admin", () => {
  it("keeps the recorded owner and drops any other holder", () => {
    const a = neil();
    const b = account("b@x.test", 1, { staffRoles: ["Super Admin"] });
    const plan = planSuperAdmin({ holders: [a, b], recordedOwner: b._id, admins: [a, b] });
    expect(plan.owner).toEqual(b._id);
    expect(plan.demote).toEqual([a._id]);
    expect(plan.grant).toBe(false);
  });

  it("prefers the seeded owner when nobody is recorded", () => {
    const early = account("early@x.test", 1, { staffRoles: ["Super Admin"] });
    const n = neil();
    const plan = planSuperAdmin({ holders: [early, n], recordedOwner: null, admins: [early, n] });
    expect(plan.owner).toEqual(n._id);
    expect(plan.demote).toEqual([early._id]);
    expect(plan.reason).toBe("seeded owner");
  });

  it("otherwise takes the earliest-created holder, preferring an active one", () => {
    const old = account("old@x.test", 1, { staffRoles: ["Super Admin"], disabled: true });
    const first = account("first@x.test", 2, { staffRoles: ["Super Admin"] });
    const later = account("later@x.test", 3, { staffRoles: ["Super Admin"] });
    const plan = planSuperAdmin({
      holders: [later, old, first],
      recordedOwner: null,
      admins: [old, first, later],
    });
    expect(plan.owner).toEqual(first._id);
    expect(plan.demote).toHaveLength(2);
  });

  it("restores the seeded owner when nobody holds the role", () => {
    const n = account(SEEDED_OWNER_EMAIL, 5, { staffRoles: ["Clinical Lead"] });
    const plan = planSuperAdmin({ holders: [], recordedOwner: null, admins: [n] });
    expect(plan.owner).toEqual(n._id);
    expect(plan.grant).toBe(true);
  });

  it("re-grants the role to a recorded owner who lost it", () => {
    const a = account("a@x.test", 1, { staffRoles: ["Scheduler"] });
    const plan = planSuperAdmin({ holders: [], recordedOwner: a._id, admins: [a] });
    expect(plan.owner).toEqual(a._id);
    expect(plan.grant).toBe(true);
  });

  it("ignores a recorded owner whose account no longer exists", () => {
    const n = neil();
    const plan = planSuperAdmin({ holders: [n], recordedOwner: new ObjectId(), admins: [n] });
    expect(plan.owner).toEqual(n._id);
  });

  it("names nobody when there is no account to hold it", () => {
    expect(planSuperAdmin({ holders: [], recordedOwner: null, admins: [] }).owner).toBeNull();
  });
});

describe("applying it to the database", () => {
  function setup() {
    const db = new FakeDb();
    const users = db.collection("users");
    const n = neil();
    const second = account("second@x.test", 1, {
      name: "Second",
      staffRoles: ["Super Admin", "Finance"],
    });
    const third = account("third@x.test", 2, { name: "Third", staffRoles: ["Super Admin"] });
    const jo = account("jo@x.test", 3, { name: "Jo", staffRoles: ["Scheduler"] });
    users.docs.push(...([n, second, third, jo] as unknown as Doc[]), {
      _id: new ObjectId(),
      role: "therapist",
      email: "t@x.test",
    });
    return { db, users, n, second, third, jo };
  }

  it("leaves one Super Admin, keeps everyone's other roles, records the owner and audits it", async () => {
    const { db, users, n, second, third, jo } = setup();
    await ensureSingleSuperAdmin(db as never);
    expect(n.staffRoles).toEqual(["Super Admin", "Clinical Lead"]);
    expect(second.staffRoles).toEqual(["Finance"]);
    expect(third.staffRoles).toEqual([]);
    expect(jo.staffRoles).toEqual(["Scheduler"]);
    const holders = users.docs.filter((d) =>
      (d.staffRoles as string[] | undefined)?.includes("Super Admin"),
    );
    expect(holders).toHaveLength(1);
    const record = (await db.collection("platform").findOne({ _id: PLATFORM_ID })) as Doc;
    expect((record.superAdminId as ObjectId).equals(n._id)).toBe(true);
    expect(db.collection("audit").docs).toHaveLength(2);
  });

  it("changes nothing on the next start", async () => {
    const { db } = setup();
    await ensureSingleSuperAdmin(db as never);
    const before =
      db.collection("users").writes +
      db.collection("platform").writes +
      db.collection("audit").writes;
    await ensureSingleSuperAdmin(db as never);
    const after =
      db.collection("users").writes +
      db.collection("platform").writes +
      db.collection("audit").writes;
    expect(after).toBe(before);
  });

  it("does nothing when there is no admin at all", async () => {
    const db = new FakeDb();
    const plan = await ensureSingleSuperAdmin(db as never);
    expect(plan.owner).toBeNull();
    expect(db.collection("platform").docs).toHaveLength(0);
  });
});
