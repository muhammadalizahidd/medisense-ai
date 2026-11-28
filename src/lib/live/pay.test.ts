import { describe, expect, it } from "vitest";
import {
  centsPlain,
  financialYearStart,
  headline,
  marginPercent,
  payRateInputSchema,
  rateOn,
  sumEarned,
  visitFee,
  weekStart,
  weeklySeries,
  type FeeRow,
  type PayLine,
  type PayRate,
  type PayVisit,
} from "./pay";

const rate = (over: Partial<PayRate> = {}): PayRate => ({
  id: "r1",
  method: "per-appointment",
  inPersonCents: 9000,
  telehealthCents: 7500,
  hourlyCents: null,
  sharePercent: null,
  cancellation: "half",
  effectiveFrom: "2026-07-01",
  seq: 1,
  withdrawn: false,
  ...over,
});
const hourly = (cents = 5500, over: Partial<PayRate> = {}) =>
  rate({
    method: "hourly",
    inPersonCents: null,
    telehealthCents: null,
    hourlyCents: cents,
    ...over,
  });
const share = (pct = 60, over: Partial<PayRate> = {}) =>
  rate({
    method: "revenue-share",
    inPersonCents: null,
    telehealthCents: null,
    sharePercent: pct,
    ...over,
  });

const visit = (over: Partial<PayVisit> = {}): PayVisit => ({
  id: "v",
  day: "2026-11-10",
  status: "completed",
  modality: "In person",
  scheduledMinutes: 60,
  checkOutMinutes: 60,
  noteStatus: "Final",
  cancellation: null,
  timesheetApproved: true,
  ...over,
});
const dna = (over: Partial<PayVisit> = {}) =>
  visit({
    status: "no-show",
    checkOutMinutes: null,
    noteStatus: null,
    cancellation: { by: "client", chargeable: true },
    ...over,
  });
const line = (billedCents: number, over: Partial<PayLine> = {}): PayLine => ({
  billableMinutes: 60,
  billedCents,
  estimated: false,
  credited: false,
  ...over,
});

/** Rows for a set of visits, each priced with the rate in force on its own day. */
const rows = (visits: PayVisit[], rates: PayRate[], lines: (PayLine | null)[] = []): FeeRow[] =>
  visits.map((v, i) => ({ day: v.day, fee: visitFee(v, lines[i] ?? null, rateOn(rates, v.day)) }));

describe("per appointment", () => {
  it("pays the in-person or telehealth fee and ignores minutes", () => {
    expect(visitFee(visit(), line(19399), rate()).cents).toBe(9000);
    expect(visitFee(visit({ modality: "Telehealth" }), null, rate()).cents).toBe(7500);
    const corrected = visitFee(visit(), line(9700, { billableMinutes: 30 }), rate());
    expect(corrected.cents).toBe(9000);
  });

  it("passes the worked example: $90, half for Did not attend, 3 signed + 1 DNA = $315", () => {
    const visits = [
      visit({ day: "2026-11-03" }),
      visit({ day: "2026-11-05" }),
      visit({ day: "2026-11-12" }),
      dna({ day: "2026-11-17" }),
    ];
    const first = rate();
    const month = sumEarned(rows(visits, [first]));
    expect(month).toEqual({ cents: 31500, missingRate: false });

    // Changing the rate to $100 from today leaves past visits on the $90 rate.
    const raised = rate({ id: "r2", inPersonCents: 10000, effectiveFrom: "2026-11-27", seq: 2 });
    expect(sumEarned(rows(visits, [first, raised])).cents).toBe(31500);
    expect(headline(rows(visits, [first, raised]), "2026-11-27").month.cents).toBe(31500);
  });
});

describe("hourly", () => {
  it("is rate × paid minutes, rounded once to the cent", () => {
    // $55 × 47 min = $43.0833…
    expect(visitFee(visit({ checkOutMinutes: 47 }), null, hourly()).cents).toBe(4308);
  });

  it("follows a Finance correction to the minutes", () => {
    const v = visit({ checkOutMinutes: 60 });
    expect(visitFee(v, line(9700, { billableMinutes: 45 }), hourly()).cents).toBe(4125);
  });

  it("stays Pending until the week's timesheet is approved", () => {
    const fee = visitFee(visit({ timesheetApproved: false }), null, hourly());
    expect(fee.status).toBe("Pending");
    expect(fee.reason).toMatch(/timesheet/);
    expect(fee.cents).toBe(5500);
  });

  it("pays a cancellation on the scheduled minutes", () => {
    expect(
      visitFee(dna({ scheduledMinutes: 90 }), null, hourly(5500, { cancellation: "half" })).cents,
    ).toBe(4125);
  });
});

describe("revenue share", () => {
  it("is the share of what was billed for the original line", () => {
    // 60% of $193.99 = $116.394
    expect(visitFee(visit(), line(19399), share()).cents).toBe(11639);
  });

  it("follows corrected billing and is an estimate before a line exists", () => {
    expect(visitFee(visit(), line(9700), share(50)).cents).toBe(4850);
    const pending = visitFee(
      visit({ noteStatus: "Draft" }),
      line(19399, { estimated: true }),
      share(),
    );
    expect(pending.status).toBe("Pending");
    expect(pending.estimate).toBe(true);
  });

  it("stays Pending on a signed visit until billing confirms the amount", () => {
    const fee = visitFee(visit(), line(19399, { estimated: true }), share());
    expect(fee).toMatchObject({
      status: "Pending",
      estimate: true,
      cents: 11639,
      reason: "Waiting for billing to confirm the amount",
    });
  });

  it("pays nothing on a cancellation that billing waived", () => {
    const fee = visitFee(dna(), null, share(60, { cancellation: "full" }));
    expect(fee.status).toBe("Not payable");
    expect(fee.cents).toBe(0);
  });

  it("pays the share of the cancellation line, times the cancellation setting", () => {
    expect(visitFee(dna(), line(9700), share(60, { cancellation: "half" })).cents).toBe(2910);
  });
});

describe("cancellations and Did not attend", () => {
  it("pays nothing, half or the full fee", () => {
    expect(visitFee(dna(), null, rate({ cancellation: "none" }))).toMatchObject({
      status: "Not payable",
      cents: 0,
    });
    expect(visitFee(dna(), null, rate({ cancellation: "half" })).cents).toBe(4500);
    expect(visitFee(dna(), null, rate({ cancellation: "full" })).cents).toBe(9000);
    const late = visit({
      status: "late-cancelled",
      noteStatus: null,
      cancellation: { by: "client", chargeable: true },
    });
    expect(visitFee(late, null, rate({ cancellation: "full" }))).toMatchObject({
      status: "Earned",
      cents: 9000,
    });
  });

  it("never pays a cancellation with notice or by Medisense", () => {
    const notice = visit({
      status: "cancelled",
      cancellation: { by: "client", chargeable: false },
    });
    expect(visitFee(notice, null, rate({ cancellation: "full" })).status).toBe("Not payable");
    const ours = visit({
      status: "late-cancelled",
      cancellation: { by: "medisense", chargeable: false },
    });
    expect(visitFee(ours, null, rate({ cancellation: "full" })).reason).toBe(
      "Cancelled by Medisense",
    );
  });
});

describe("rate changes", () => {
  it("uses the old rate before the change and the new one after, combined in the month", () => {
    const old = rate({ inPersonCents: 8500 });
    const next = rate({ id: "r2", inPersonCents: 9500, effectiveFrom: "2026-11-15", seq: 2 });
    const r = rows([visit({ day: "2026-11-14" }), visit({ day: "2026-11-15" })], [old, next]);
    expect(r.map((x) => x.fee.cents)).toEqual([8500, 9500]);
    expect(sumEarned(r).cents).toBe(18000);
  });

  it("ignores withdrawn rates and breaks a same-day tie by the later save", () => {
    const a = rate({ id: "a", inPersonCents: 8000, effectiveFrom: "2026-11-01", seq: 1 });
    const b = rate({ id: "b", inPersonCents: 8800, effectiveFrom: "2026-11-01", seq: 2 });
    expect(rateOn([a, b], "2026-11-02")?.id).toBe("b");
    expect(rateOn([a, { ...b, withdrawn: true }], "2026-11-02")?.id).toBe("a");
    expect(rateOn([a], "2026-10-31")).toBeNull();
  });
});

describe("no pay rate", () => {
  it("shows Pay rate not set, never $0", () => {
    const fee = visitFee(visit(), null, null);
    expect(fee).toMatchObject({ status: "Pay rate not set", cents: null });
    const h = headline([{ day: "2026-11-10", fee }], "2026-11-12");
    expect(h.month.missingRate).toBe(true);
    expect(h.month.cents).toBe(0);
  });
});

describe("credits and pending notes", () => {
  it("keeps the fee when the invoice was credited, with a note", () => {
    const fee = visitFee(visit(), line(19399, { credited: true }), share());
    expect(fee.cents).toBe(11639);
    expect(fee.notes[0]).toMatch(/credited/);
  });

  it("shows an unsigned note as Pending, not Earned", () => {
    for (const noteStatus of [null, "Draft", "Pending Signature"]) {
      const fee = visitFee(visit({ noteStatus }), null, rate());
      expect(fee.status).toBe("Pending");
      expect(fee.reason).toBe("Sign the note to confirm this fee");
    }
    expect(visitFee(visit({ noteStatus: "Amended" }), null, rate()).status).toBe("Earned");
  });
});

describe("totals and periods", () => {
  it("totals equal the sum of the rows shown", () => {
    const visits = [33, 47, 52, 41, 58].map((m, i) =>
      visit({ day: `2026-11-1${i}`, checkOutMinutes: m }),
    );
    const r = rows(visits, [hourly(5537)]);
    const shown = r.reduce((s, x) => s + Number(centsPlain(x.fee.cents ?? 0)) * 100, 0);
    expect(Math.round(shown)).toBe(sumEarned(r).cents);
  });

  it("uses Monday weeks and a 1 July financial year", () => {
    expect(weekStart("2026-11-29")).toBe("2026-11-23");
    expect(weekStart("2026-11-23")).toBe("2026-11-23");
    expect(financialYearStart("2026-06-30")).toBe("2025-07-01");
    expect(financialYearStart("2026-07-01")).toBe("2026-07-01");
  });

  it("splits headline figures by period and keeps Pending apart", () => {
    const r = rows(
      [
        visit({ day: "2026-06-30" }),
        visit({ day: "2026-07-01" }),
        visit({ day: "2026-11-02" }),
        visit({ day: "2026-11-24" }),
        visit({ day: "2026-11-25", noteStatus: "Draft" }),
      ],
      [rate({ effectiveFrom: "2026-01-01" })],
    );
    const h = headline(r, "2026-11-26");
    expect(h.week.cents).toBe(9000);
    expect(h.month.cents).toBe(18000);
    expect(h.year.cents).toBe(27000);
    expect(h.pending).toMatchObject({ cents: 9000, visits: 1 });
    const series = weeklySeries(r, "2026-11-26");
    expect(series).toHaveLength(12);
    expect(series.at(-1)).toEqual({ week: "2026-11-23", cents: 9000 });
  });

  it("formats cents and margins exactly", () => {
    expect(centsPlain(31500)).toBe("315.00");
    expect(centsPlain(-5)).toBe("-0.05");
    expect(marginPercent(19399, 11639)).toBe(40);
    expect(marginPercent(0, 0)).toBeNull();
  });
});

describe("rate input", () => {
  it("accepts each method with only its own amounts", () => {
    const common = { cancellation: "half", effectiveFrom: "2026-12-01", note: "" } as const;
    expect(
      payRateInputSchema.safeParse({ method: "hourly", hourlyCents: 5500, ...common }).success,
    ).toBe(true);
    expect(
      payRateInputSchema.safeParse({ method: "revenue-share", sharePercent: 60.5, ...common })
        .success,
    ).toBe(true);
    expect(
      payRateInputSchema.safeParse({ method: "revenue-share", sharePercent: 120, ...common })
        .success,
    ).toBe(false);
    expect(
      payRateInputSchema.safeParse({ method: "hourly", hourlyCents: 55.5, ...common }).success,
    ).toBe(false);
    expect(
      payRateInputSchema.safeParse({ method: "per-appointment", inPersonCents: 9000, ...common })
        .success,
    ).toBe(false);
  });
});
