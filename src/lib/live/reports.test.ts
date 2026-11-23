import { defaultScope } from "@/test/scope";
import { describe, expect, it } from "vitest";
import {
  ageBucket,
  blankSpec,
  reportById,
  runReport,
  runSpec,
  specErrors,
  suppress,
  toCsv,
} from "./report-catalogue";
import {
  blankFilters,
  compareRange,
  dayKey,
  emptyFacts,
  presetRange,
  rangeError,
  runMetric,
  scoped,
  weekOf,
  type AppointmentFact,
  type ClinicianFact,
  type InvoiceFact,
  type ReferralFact,
  type ReportFacts,
  type ServiceFact,
} from "./reports";

const today = "2026-11-14";
const ctx = { today, now: "2026-11-14T02:00:00.000Z", earliest: "2026-07-01" };
const f = {
  ...blankFilters(today),
  preset: "Custom" as const,
  from: "2026-11-01",
  to: "2026-11-30",
};
const names = new Map<string, string>();

const referral = (p: Partial<ReferralFact> = {}): ReferralFact => ({
  id: "r1",
  ref: "REF-1",
  participantId: null,
  label: "A B.",
  submittedAt: "2026-11-05T00:00:00.000Z",
  acceptedAt: null,
  status: "Submitted",
  source: "Participant",
  settings: ["NDIS"],
  management: "Plan Managed",
  region: "Brisbane North",
  owner: "Jo",
  supports: ["Occupational Therapy"],
  disciplines: ["Occupational Therapy"],
  missing: [],
  lastContact: null,
  stageSince: "2026-11-05T00:00:00.000Z",
  blocked: false,
  direct: true,
  ...p,
});
const service = (p: Partial<ServiceFact> = {}): ServiceFact => ({
  id: "s1",
  referralId: null,
  participantId: "p1",
  label: "P",
  support: "Occupational Therapy",
  discipline: "Occupational Therapy",
  kind: "treatment",
  status: "assigned",
  therapistId: "t1",
  location: "Home",
  settings: ["NDIS"],
  requestedAt: "2026-10-01T00:00:00.000Z",
  startedAt: null,
  closedAt: null,
  restricted: false,
  ...p,
});
const appt = (p: Partial<AppointmentFact> = {}): AppointmentFact => ({
  id: "a1",
  ref: "APT-1",
  participantId: "p1",
  label: "P",
  therapistId: "t1",
  discipline: "Occupational Therapy",
  support: "Occupational Therapy",
  start: "2026-11-05T00:00:00.000Z",
  status: "completed",
  mode: "Home",
  settings: ["NDIS"],
  scheduledMinutes: 60,
  deliveredMinutes: 60,
  verified: true,
  confirmed: true,
  cancelledAt: null,
  cancelReason: null,
  cancelledBy: null,
  late: false,
  movedFrom: null,
  travelBooked: 20,
  travelRecorded: 25,
  travelCharge: "Charged",
  noteStatus: "Final",
  noteDue: "2026-11-07T00:00:00.000Z",
  noteSignedAt: null,
  restricted: false,
  ...p,
});
const clinician = (p: Partial<ClinicianFact> = {}): ClinicianFact => ({
  id: "t1",
  name: "Emma",
  discipline: "Occupational Therapy",
  region: "Brisbane North",
  credential: "Current",
  weeklyMinutes: 2400,
  leave: [],
  nonClinicalShare: 0.15,
  active: true,
  ...p,
});
const invoice = (p: Partial<InvoiceFact> = {}): InvoiceFact => ({
  id: "i1",
  number: "INV-1",
  participantId: "p1",
  label: "P",
  path: "Plan Managed",
  payer: "PM",
  status: "Issued",
  createdAt: "2026-11-02T00:00:00.000Z",
  issuedAt: "2026-11-03T00:00:00.000Z",
  dueDate: "2026-11-17",
  gross: 200,
  credits: 0,
  paid: 0,
  balance: 200,
  routes: [],
  ...p,
});
const facts = (p: Partial<ReportFacts>): ReportFacts => ({ ...emptyFacts(), ...p });
const m = (id: string, x: ReportFacts, filters = f) => runMetric(id, x, filters, ctx);

describe("Module 09 KPI definitions", () => {
  it("AT-01: one referral for OT and FCA is 1 referral and 2 requested supports", () => {
    const x = facts({
      referrals: [
        referral({ supports: ["Occupational Therapy", "Functional Capacity Assessment"] }),
      ],
    });
    expect(m("new-referrals", x).value).toBe(1);
    expect(m("requested-supports", x).value).toBe(2);
  });
  it("AT-02 / AT-12: two active services for one person counts one active participant", () => {
    const x = facts({
      services: [service(), service({ id: "s2", support: "Functional Capacity Assessment" })],
    });
    expect(m("active-participants", x).value).toBe(1);
  });
  it("AT-03: zero eligible appointments gives N/A, never a divide by zero", () => {
    const x = facts({ appointments: [] });
    expect(m("cancellation-rate", x).value).toBeNull();
    expect(m("no-show-rate", x).value).toBeNull();
  });
  it("AT-04: 4 completed and 1 did not attend is a 20% did-not-attend rate", () => {
    const x = facts({
      appointments: [
        ...[1, 2, 3, 4].map((i) => appt({ id: `a${i}` })),
        appt({ id: "a5", status: "no-show", verified: false }),
      ],
    });
    expect(m("no-show-rate", x).value).toBe(20);
  });
  it("AT-15: a telehealth no-show is not a delivered session", () => {
    const x = facts({
      appointments: [appt({ status: "no-show", mode: "Telehealth", verified: false })],
    });
    expect(m("delivered", x).value).toBe(0);
  });
  it("AT-06: Brisbane business date decides the day and week", () => {
    expect(dayKey("2026-11-08T15:30:00.000Z")).toBe("2026-11-09");
    expect(weekOf("2026-11-09")).toBe("2026-11-09");
    expect(weekOf("2026-11-08")).toBe("2026-11-02");
  });
  it("AT-07: a custom range ending before it starts is blocked with a reason", () => {
    expect(rangeError("2026-11-10", "2026-11-01", ctx.earliest, today)).toMatch(
      /start date must be on or before/,
    );
    expect(rangeError("2026-11-01", "2026-11-10", ctx.earliest, today)).toBeNull();
  });
  it("AT-08: filters by discipline and date carry into the scoped set", () => {
    const x = facts({ appointments: [appt(), appt({ id: "a2", discipline: "Physiotherapy" })] });
    const s = scoped(x, { ...f, discipline: "Physiotherapy" }, names);
    expect(s.appointments.map((a) => a.id)).toEqual(["a2"]);
  });
  it("AT-09: restricted rows are not searchable", () => {
    const x = facts({ appointments: [appt({ restricted: true, label: "Restricted service" })] });
    expect(scoped(x, { ...f, search: "APT" }, names).appointments).toHaveLength(0);
  });
  it("AT-13: one assessment over three visits is one open assessment", () => {
    const x = facts({
      assessments: [
        {
          id: "A",
          participantId: "p",
          label: "",
          therapistId: "t",
          therapist: "",
          support: "Functional Capacity Assessment",
          discipline: "Occupational Therapy",
          kind: "Initial",
          status: "In Progress",
          requestedAt: "2026-10-20T00:00:00.000Z",
          dueAt: "2026-11-10",
          signedAt: null,
          visits: 3,
          assessmentOnly: true,
          restricted: false,
        },
      ],
    });
    expect(m("assessment-backlog", x).value).toBe(1);
  });
  it("AT-17: a signed note drops out of overdue notes", () => {
    const x = facts({ appointments: [appt({ noteStatus: "Draft" })] });
    expect(m("overdue-notes", x).value).toBe(1);
    expect(m("overdue-notes", facts({ appointments: [appt({ noteStatus: "Final" })] })).value).toBe(
      0,
    );
  });
  it("AT-18: delivered visits without minutes are flagged as incomplete", () => {
    const x = facts({ appointments: [appt(), appt({ id: "a2", deliveredMinutes: null })] });
    const r = m("delivered-hours", x);
    expect(r.value).toBe(1);
    expect(r.incomplete).toBe(1);
  });
  it("AT-21 / AT-22: utilisation uses delivered hours over eligible capacity, N/A at zero", () => {
    const week = { ...f, from: "2026-11-02", to: "2026-11-06" };
    const x = facts({
      clinicians: [clinician()],
      appointments: [appt({ start: "2026-11-03T00:00:00.000Z", deliveredMinutes: 340 })],
    });
    const r = m("utilisation", x, week);
    expect(r.denominator).toBe(34);
    expect(r.value).toBeCloseTo(16.7, 1);
    expect(
      m("utilisation", facts({ clinicians: [clinician({ active: false })] }), week).value,
    ).toBeNull();
  });
  it("AT-24: a draft invoice is not issued revenue", () => {
    expect(
      m("issued-revenue", facts({ invoices: [invoice({ status: "Draft", issuedAt: null })] }))
        .value,
    ).toBe(0);
  });
  it("AT-25: issued revenue and cash use their own dates", () => {
    const x = facts({
      invoices: [invoice({ issuedAt: "2026-10-28T00:00:00.000Z" })],
      payments: [
        {
          id: "p",
          ref: "PAY",
          payer: "PM",
          receivedOn: "2026-11-05",
          amount: 200,
          matched: 200,
          unmatched: 0,
          refunded: 0,
          status: "Reconciled",
        },
      ],
    });
    expect(m("issued-revenue", x).value).toBe(0);
    expect(m("payments-received", x).value).toBe(200);
  });
  it("AT-26: gross and net are distinguishable with a credit", () => {
    const r = m("issued-revenue", facts({ invoices: [invoice({ credits: 50 })] }));
    expect(r.numerator).toBe(200);
    expect(r.value).toBe(150);
  });
  it("AT-27: ageing bucket is counted from the snapshot date", () => {
    expect(ageBucket("2026-10-01", 100, "2026-11-14")).toBe("31–60 days");
    expect(ageBucket("2026-11-20", 100, "2026-11-14")).toBe("Not yet due");
  });
  it("Same period last year with no history is N/A, not zero", () => {
    const r = runMetric(
      "new-referrals",
      facts({ referrals: [referral()] }),
      { ...f, compare: "Same period last year" },
      ctx,
    );
    expect(r.previous).toBeNull();
    expect(r.compareNote).toMatch(/No records before/);
    expect(compareRange("Previous equivalent period", "2026-11-01", "2026-11-30")).toEqual({
      from: "2026-10-02",
      to: "2026-10-31",
    });
  });
  it("presets resolve to Brisbane calendar ranges", () => {
    expect(presetRange("This Quarter", today)).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(presetRange("Last Month", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });
});

describe("Module 09 roles, builder and exports", () => {
  it("AT-10 / AT-11: operations is aggregate-only for clinical work; finance can't see telehealth", () => {
    const ops = defaultScope(["Operations Manager"], "admin");
    expect(ops.domains).toContain("Clinical Operations");
    expect(ops.detail).not.toContain("Clinical Operations");
    const fin = defaultScope(["Finance"], "admin");
    expect(fin.domains).toEqual(["Finance"]);
    const r11 = reportById.get("R11");
    if (!r11) throw new Error("R11 missing");
    expect(runReport(r11, emptyFacts(), f, ctx, names, ops).allowed).toBe(false);
  });
  it("AT-33: incompatible measures and groupings block preview", () => {
    const s = defaultScope(["Super Admin"], "admin");
    const spec = { ...blankSpec("Scheduling"), measures: ["cancel"], dimensions: ["status"] };
    expect(specErrors(spec, s).join(" ")).toMatch(/can't be grouped by status/);
    expect(
      specErrors({ ...spec, measures: ["cancel", "count"], dimensions: ["mode"] }, s).join(" "),
    ).toMatch(/different units/);
    expect(specErrors({ ...spec, dimensions: ["mode"] }, s)).toEqual([]);
  });
  it("builder groups bookings and keeps unique counts", () => {
    const x = facts({
      appointments: [
        appt(),
        appt({ id: "a2", mode: "Telehealth" }),
        appt({ id: "a3", mode: "Telehealth" }),
      ],
    });
    const out = runSpec(
      { ...blankSpec("Scheduling"), measures: ["count"], dimensions: ["mode"] },
      x,
      f,
      names,
    );
    expect(out.rows.find((r) => r.mode === "Telehealth")?.count).toBe(2);
  });
  it("AT-43: small confidential groups are suppressed without clinical scope", () => {
    const rows = suppress(
      [
        { category: "Psychological Therapy", count: 2 },
        { category: "Physiotherapy", count: 2 },
      ],
      defaultScope(["Operations Manager"], "admin"),
    );
    expect(rows[0]?.count).toBeNull();
    expect(rows[1]?.count).toBe(2);
  });
  it("AT-28: exported CSV carries metadata and neutralises formula cells", () => {
    const csv = toCsv([{ key: "a", label: "A" }], [{ a: "=SUM(1)" }], [["Unit", "bookings"]]);
    expect(csv).toContain("# Unit");
    expect(csv).toContain('"=SUM(1)"');
  });
});
