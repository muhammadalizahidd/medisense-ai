import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserDoc } from "./models";

/*
 * Pay rates and earnings against a small in-memory database: who may set rates, that every change
 * is audited with its old and new value, that two saves can't overwrite each other, that a
 * therapist never receives billing detail, and that every screen gives the same figures.
 */

type Doc = Record<string, unknown>;
const tables: Record<string, Doc[]> = {};

const same = (a: unknown, b: unknown) =>
  a instanceof ObjectId || b instanceof ObjectId
    ? String(a) === String(b)
    : a instanceof Date && b instanceof Date
      ? a.getTime() === b.getTime()
      : a === b;

function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, cond]) => {
    const value = doc[key];
    if (
      cond &&
      typeof cond === "object" &&
      !(cond instanceof ObjectId) &&
      !(cond instanceof Date)
    ) {
      return Object.entries(cond as Doc).every(([op, arg]) => {
        if (op === "$in") return (arg as unknown[]).some((x) => same(value, x));
        if (op === "$ne") return !same(value ?? null, arg);
        if (op === "$gte") return (value as number) >= (arg as number);
        if (op === "$gt") return (value as number) > (arg as number);
        if (op === "$lt") return (value as number) < (arg as number);
        throw new Error(`Operator ${op} not faked`);
      });
    }
    if (cond === null) return value === null || value === undefined;
    return same(value, cond);
  });
}

function table(name: string) {
  const rows = () => (tables[name] ??= []);
  const cursor = (list: Doc[]) => ({
    sort: () => cursor(list),
    toArray: async () => list,
  });
  return {
    find: (filter: Doc = {}) => cursor(rows().filter((d) => matches(d, filter))),
    findOne: async (filter: Doc) => rows().find((d) => matches(d, filter)) ?? null,
    insertOne: async (doc: Doc) => {
      if (
        name === "payRates" &&
        rows().some((d) => same(d.therapistId, doc.therapistId) && d.seq === doc.seq)
      )
        throw Object.assign(new Error("duplicate key"), { code: 11000 });
      rows().push(doc);
      return { insertedId: doc._id };
    },
    updateOne: async (filter: Doc, update: { $set: Doc }) => {
      const d = rows().find((x) => matches(x, filter));
      if (!d) return { modifiedCount: 0 };
      Object.assign(d, update.$set);
      return { modifiedCount: 1 };
    },
  };
}

vi.mock("./db", () => ({
  collections: async () => ({
    db: { collection: (n: string) => table(n) },
    users: table("users"),
    therapists: table("therapists"),
    clients: table("clients"),
    appointments: table("appointments"),
    billables: table("billables"),
    adjustments: table("adjustments"),
    payRates: table("payRates"),
    audit: table("audit"),
  }),
}));
vi.mock("./finance", () => ({ todayKey: () => "2026-11-27" }));
vi.mock("./live", () => ({ publish: async () => undefined }));
vi.mock("./log", () => ({ serverLog: () => undefined }));

const pay = await import("./pay");
const { grantPermissions } = await import("./permissions");
const { AuthError } = await import("./auth-error");

const therapistId = new ObjectId();
const therapistUserId = new ObjectId();
const clientId = new ObjectId();

const admin = (name: string, perms: string[]) =>
  grantPermissions(
    { _id: new ObjectId(), name, role: "admin", staffRoles: [name] } as unknown as UserDoc,
    perms,
  );
const manager = admin("Finance Manager", ["pay.view", "pay.manage", "finance.work"]);
const financeOfficer = admin("Finance", ["pay.view", "finance.work"]);
const opsManager = admin("Operations Manager", ["pay.view", "hr.manage"]);
const therapistUser = {
  _id: therapistUserId,
  name: "Sarah Mitchell",
  role: "therapist",
  therapistId,
} as unknown as UserDoc;

const at = (day: string, hour = 9) =>
  new Date(`${day}T${String(hour).padStart(2, "0")}:00:00+10:00`);
let refs = 0;
function visit(day: string, status: string, extra: Doc = {}) {
  const v = {
    _id: new ObjectId(),
    ref: `APT-${String((refs += 1)).padStart(6, "0")}`,
    therapistId,
    clientId,
    discipline: "Occupational Therapy",
    needId: "n1",
    start: at(day),
    end: at(day, 10),
    status,
    modality: "In person",
    checkOut: status === "completed" ? { minutes: 60 } : null,
    note: status === "completed" ? { status: "Final" } : null,
    cancellation:
      status === "no-show" ? { by: "client", chargeable: true, reason: "Did not attend" } : null,
    ...extra,
  };
  tables.appointments?.push(v);
  return v;
}
function billable(v: Doc, kind: "service" | "cancellation", rate: number, minutes = 60) {
  tables.billables?.push({
    _id: new ObjectId(),
    sourceKey: `appointment:${String(v._id)}:${kind}`,
    source: kind === "service" ? "Session" : "Cancellation",
    appointmentId: v._id,
    parentId: null,
    duplicateOf: null,
    support: "Therapy supports",
    billableMinutes: minutes,
    quantity: minutes / 60,
    rate,
    tax: "GST-free",
    status: "Ready",
    invoiceId: null,
    history: [],
    createdAt: new Date(),
  });
}
const perAppointment = {
  method: "per-appointment" as const,
  inPersonCents: 9000,
  telehealthCents: 7500,
  cancellation: "half" as const,
  effectiveFrom: "2026-07-01",
  note: "",
};

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  Object.assign(tables, {
    users: [],
    therapists: [
      {
        _id: therapistId,
        name: "Sarah Mitchell",
        discipline: "Occupational Therapy",
        userId: therapistUserId,
      },
    ],
    clients: [
      {
        _id: clientId,
        name: "Emily Carter",
        needs: [{ id: "n1", support: "Therapy supports", discipline: "Occupational Therapy" }],
      },
    ],
    appointments: [],
    billables: [],
    adjustments: [],
    payRates: [],
    audit: [],
    timesheets: [],
  });
});

describe("setting pay rates", () => {
  it("lets only a holder of pay.manage set a rate", async () => {
    await expect(pay.setPayRate(opsManager, therapistId, perAppointment, 0)).rejects.toBeInstanceOf(
      AuthError,
    );
    await expect(
      pay.setPayRate(financeOfficer, therapistId, perAppointment, 0),
    ).rejects.toBeInstanceOf(AuthError);
    await expect(pay.payRatesBoard(opsManager)).resolves.toMatchObject({ canManage: false });
    await expect(pay.setPayRate(manager, therapistId, perAppointment, 0)).resolves.toMatchObject({
      seq: 1,
    });
  });

  it("audits who, the old value and the new value", async () => {
    await pay.setPayRate(manager, therapistId, perAppointment, 0);
    await pay.setPayRate(
      manager,
      therapistId,
      { ...perAppointment, inPersonCents: 10000, effectiveFrom: "2026-11-27" },
      1,
    );
    const last = tables.audit?.at(-1);
    expect(last).toMatchObject({ actorName: "Finance Manager", therapistId });
    expect(last?.detail).toEqual({
      before: expect.objectContaining({ rate: "$90.00 in person · $75.00 telehealth" }),
      after: expect.objectContaining({ rate: "$100.00 in person · $75.00 telehealth" }),
    });
  });

  it("refuses a stale save and a backdated change, but allows a backdated first rate", async () => {
    await pay.setPayRate(manager, therapistId, perAppointment, 0);
    await expect(pay.setPayRate(manager, therapistId, perAppointment, 0)).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      pay.setPayRate(manager, therapistId, { ...perAppointment, effectiveFrom: "2026-11-01" }, 1),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("withdraws only a rate that hasn't started", async () => {
    await pay.setPayRate(manager, therapistId, perAppointment, 0);
    const future = await pay.setPayRate(
      manager,
      therapistId,
      { ...perAppointment, effectiveFrom: "2026-12-01" },
      1,
    );
    const first = tables.payRates?.[0]?._id as ObjectId;
    await expect(pay.withdrawPayRate(manager, first)).rejects.toMatchObject({ status: 409 });
    await expect(pay.withdrawPayRate(manager, new ObjectId(future.id))).resolves.toEqual({
      ok: true,
    });
  });
});

describe("earnings", () => {
  async function workedExample() {
    await pay.setPayRate(manager, therapistId, perAppointment, 0);
    for (const day of ["2026-11-03", "2026-11-10", "2026-11-17"]) {
      billable(visit(day, "completed"), "service", 193.99);
    }
    const missed = visit("2026-11-24", "no-show");
    billable(missed, "cancellation", 193.99);
    visit("2026-11-25", "completed", { note: { status: "Draft" } });
    visit("2026-11-26", "cancelled", { cancellation: { by: "client", chargeable: false } });
  }

  it("shows $315 this month, keeps it after a rate change today, and keeps Pending apart", async () => {
    await workedExample();
    const before = await pay.myEarnings(therapistUser, {});
    expect(before.headline.month).toEqual({ cents: 31500, missingRate: false });
    expect(before.headline.pending).toMatchObject({ cents: 9000, visits: 1 });
    expect(before.rows.find((r) => r.date === "2026-11-25")).toMatchObject({
      status: "Pending",
      reason: "Sign the note to confirm this fee",
    });

    await pay.setPayRate(
      manager,
      therapistId,
      { ...perAppointment, inPersonCents: 10000, effectiveFrom: "2026-11-27" },
      1,
    );
    const after = await pay.myEarnings(therapistUser, {});
    expect(after.headline.month.cents).toBe(31500);
  });

  it("never gives a therapist billed amounts, payers, invoices, claims or charged rates", async () => {
    await workedExample();
    const dto = await pay.myEarnings(therapistUser, {});
    const keys: string[] = [];
    const walk = (x: unknown) => {
      if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === "object")
        for (const [k, v] of Object.entries(x)) {
          keys.push(k);
          walk(v);
        }
    };
    walk(dto);
    // "missingRate" is the therapist's own "no pay rate set" flag, not a charged rate.
    const allowed = new Set(["missingRate"]);
    const risky = keys.filter(
      (k) =>
        !allowed.has(k) && /billed|payer|invoice|claim|rate|itemCode|path|funding|price/i.test(k),
    );
    expect(risky).toEqual([]);
    expect(JSON.stringify(dto)).not.toMatch(/193\.99|19399|BIL-|INV-/);
  });

  it("refuses the therapist report to therapists and to roles without finance.work", async () => {
    await expect(pay.therapistEarningsReport(therapistUser, {})).rejects.toBeInstanceOf(AuthError);
    await expect(pay.therapistEarningsReport(opsManager, {})).rejects.toBeInstanceOf(AuthError);
    await expect(pay.earningsCsv(opsManager, {})).rejects.toBeInstanceOf(AuthError);
    await expect(pay.myEarnings(manager, {})).rejects.toBeInstanceOf(AuthError);
  });

  it("gives the same pay on the therapist's screen, the Finance report and the CSV", async () => {
    await workedExample();
    const month = { from: "2026-11-01", to: "2026-11-27" };
    const mine = await pay.myEarnings(therapistUser, month);
    const report = await pay.therapistEarningsReport(financeOfficer, month);
    const visits = await pay.therapistEarningVisits(financeOfficer, therapistId, month);
    const csv = await pay.earningsCsv(financeOfficer, month);

    const row = report.rows.find((r) => r.therapistId === therapistId.toHexString());
    expect(row).toMatchObject({ payCents: 31500, pendingCents: 9000, visits: 5 });
    // 3 × $193.99 sessions + $193.99 Did not attend line, all final.
    expect(row?.billedCents).toBe(77596);
    expect(row?.marginCents).toBe(77596 - 31500);
    expect(mine.headline.month.cents).toBe(row?.payCents);
    expect(visits.map((v) => v.feeCents)).toEqual(mine.rows.map((r) => r.feeCents));
    expect(csv.text).toContain("Total earned,,,,,,,315.00,775.96,");
    expect(csv.text).not.toContain("Emily Carter");
  });

  it("keeps unbilled work out of the margin and counts it apart", async () => {
    await workedExample();
    visit("2026-11-20", "completed");
    const report = await pay.therapistEarningsReport(financeOfficer, {
      from: "2026-11-01",
      to: "2026-11-27",
    });
    const row = report.rows[0];
    expect(row).toMatchObject({ payCents: 40500, billedCents: 77596, unbilledVisits: 1 });
    expect(row?.marginCents).toBe(77596 - 31500);
    const csv = await pay.earningsCsv(financeOfficer, { from: "2026-11-01", to: "2026-11-27" });
    expect(csv.text).toContain(",Earned,90.00,Not billed,");
  });

  it("shows Pay rate not set instead of $0", async () => {
    visit("2026-11-10", "completed");
    const dto = await pay.myEarnings(therapistUser, {});
    expect(dto.headline.month).toEqual({ cents: 0, missingRate: true });
    expect(dto.rows[0]).toMatchObject({ status: "Pay rate not set", feeCents: null });
    const board = await pay.payRatesBoard(opsManager);
    expect(board.rows[0]).toMatchObject({ current: null, unpaidVisits: 1 });
  });
});
