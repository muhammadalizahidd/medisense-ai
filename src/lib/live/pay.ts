import { z } from "zod";

/**
 * Therapist pay and earnings. Pure arithmetic shared by the therapist's Earnings screen, the
 * Finance report and the CSV export, so every figure agrees wherever it is shown.
 *
 * Money is held in whole cents. Each visit's fee is worked out from unrounded inputs and rounded
 * once to the cent; totals add those cents, so a total always equals the rows shown under it.
 * Pay follows the work done, not the money collected: credits and refunds never change a fee.
 */

/* ------------------------------------------------------------------ options */

export const payMethods = ["per-appointment", "hourly", "revenue-share"] as const;
export type PayMethod = (typeof payMethods)[number];

export const payMethodLabel: Record<PayMethod, string> = {
  "per-appointment": "Per appointment",
  hourly: "Hourly",
  "revenue-share": "Revenue share",
};

export const cancellationPays = ["none", "half", "full"] as const;
export type CancellationPay = (typeof cancellationPays)[number];

export const cancellationPayLabel: Record<CancellationPay, string> = {
  none: "Nothing",
  half: "Half the fee",
  full: "Full fee",
};

const cancellationFactor: Record<CancellationPay, number> = { none: 0, half: 0.5, full: 1 };

export const earningStatuses = ["Earned", "Pending", "Not payable", "Pay rate not set"] as const;
export type EarningStatus = (typeof earningStatuses)[number];

/** Upper limits that catch a typing slip (an extra zero) before it reaches anyone's pay. */
export const payLimits = { feeCents: 100_000, hourlyCents: 50_000, sharePercent: 100 } as const;

/* ------------------------------------------------------------------ rate input */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const centsField = (max: number, label: string) =>
  z
    .number({ error: `Enter ${label}` })
    .int("Use whole cents")
    .min(1, `${cap(label)} must be more than $0`)
    .max(max, `${cap(label)} looks too high`);

export const payRateInputSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("per-appointment"),
    inPersonCents: centsField(payLimits.feeCents, "the in-person fee"),
    telehealthCents: centsField(payLimits.feeCents, "the telehealth fee"),
    cancellation: z.enum(cancellationPays),
    effectiveFrom: day,
    note: z.string().trim().max(300),
  }),
  z.object({
    method: z.literal("hourly"),
    hourlyCents: centsField(payLimits.hourlyCents, "the hourly rate"),
    cancellation: z.enum(cancellationPays),
    effectiveFrom: day,
    note: z.string().trim().max(300),
  }),
  z.object({
    method: z.literal("revenue-share"),
    sharePercent: z
      .number({ error: "Enter the share" })
      .gt(0, "The share must be more than 0%")
      .max(payLimits.sharePercent, "The share can't be more than 100%")
      .refine((n) => Math.round(n * 100) === n * 100, "Use at most two decimal places"),
    cancellation: z.enum(cancellationPays),
    effectiveFrom: day,
    note: z.string().trim().max(300),
  }),
]);
export type PayRateInput = z.infer<typeof payRateInputSchema>;

/** A saved pay rate as the calculator sees it. */
export interface PayRate {
  id: string;
  method: PayMethod;
  inPersonCents: number | null;
  telehealthCents: number | null;
  hourlyCents: number | null;
  sharePercent: number | null;
  cancellation: CancellationPay;
  /** Brisbane day, "YYYY-MM-DD". */
  effectiveFrom: string;
  /** Save order for this therapist (1, 2, 3…); breaks a tie between rates that start on one day. */
  seq: number;
  withdrawn: boolean;
}

/** The stored fields for a rate input: exactly the method's own amounts, the others null. */
export function rateFields(input: PayRateInput) {
  return {
    method: input.method,
    inPersonCents: input.method === "per-appointment" ? input.inPersonCents : null,
    telehealthCents: input.method === "per-appointment" ? input.telehealthCents : null,
    hourlyCents: input.method === "hourly" ? input.hourlyCents : null,
    sharePercent: input.method === "revenue-share" ? input.sharePercent : null,
    cancellation: input.cancellation,
  };
}

/** The rate in force on a day: the newest not-withdrawn rate that started on or before it. */
export function rateOn(rates: readonly PayRate[], on: string): PayRate | null {
  let best: PayRate | null = null;
  for (const r of rates) {
    if (r.withdrawn || r.effectiveFrom > on) continue;
    if (
      !best ||
      r.effectiveFrom > best.effectiveFrom ||
      (r.effectiveFrom === best.effectiveFrom && r.seq > best.seq)
    )
      best = r;
  }
  return best;
}

/** Newest first: by start date, then by when it was saved. */
export const byNewest = (a: PayRate, b: PayRate) =>
  b.effectiveFrom.localeCompare(a.effectiveFrom) || b.seq - a.seq;

/** "$90.00 in person · $75.00 telehealth", "$55.00 an hour", "60% of billed". */
export function rateSummary(
  r: Pick<PayRate, "method" | "inPersonCents" | "telehealthCents" | "hourlyCents" | "sharePercent">,
) {
  if (r.method === "per-appointment")
    return `${centsLabel(r.inPersonCents)} in person · ${centsLabel(r.telehealthCents)} telehealth`;
  if (r.method === "hourly") return `${centsLabel(r.hourlyCents)} an hour`;
  return `${r.sharePercent ?? 0}% of billed`;
}

/* ------------------------------------------------------------------ fees */

/** One delivered or missed visit, as the pay calculator needs it. */
export interface PayVisit {
  id: string;
  /** Brisbane day of the visit, "YYYY-MM-DD". */
  day: string;
  status: string;
  modality: "In person" | "Telehealth";
  scheduledMinutes: number;
  checkOutMinutes: number | null;
  noteStatus: string | null;
  cancellation: { by: "client" | "medisense"; chargeable: boolean } | null;
  /** Hourly pay counts once the week's timesheet is approved. */
  timesheetApproved: boolean;
}

/**
 * The visit's original billing line. Finance corrections change it in place (so fees that depend
 * on minutes or billing follow them); a credit or refund makes a new copy and leaves it alone.
 */
export interface PayLine {
  billableMinutes: number;
  /** Ex GST. */
  billedCents: number;
  /** True when no line exists yet and the amount is an estimate from the default rate. */
  estimated: boolean;
  credited: boolean;
}

export interface VisitFee {
  status: EarningStatus;
  cents: number | null;
  /** The fee depends on a billed amount that isn't final yet. */
  estimate: boolean;
  /** Short reason shown next to a Pending, Not payable or no-rate status. */
  reason: string;
  notes: string[];
  minutes: number;
  rateId: string | null;
}

/** Round half away from zero, guarding against values like 4499.999999 from float arithmetic. */
export const roundCents = (x: number) => Math.sign(x) * Math.round(Math.abs(x) + 1e-9);

const SIGNED = new Set(["Final", "Amended"]);

export function visitFee(visit: PayVisit, line: PayLine | null, rate: PayRate | null): VisitFee {
  const paidMinutes = line?.billableMinutes ?? visit.checkOutMinutes ?? visit.scheduledMinutes;
  const notes = line?.credited ? ["Invoice credited: your fee is unchanged"] : [];
  const base = { notes, rateId: rate?.id ?? null, estimate: false };
  const notPayable = (reason: string): VisitFee => ({
    ...base,
    status: "Not payable",
    cents: 0,
    reason,
    minutes: 0,
  });
  const noRate = (minutes: number): VisitFee => ({
    ...base,
    status: "Pay rate not set",
    cents: null,
    reason: "Pay rate not set",
    minutes,
  });

  if (visit.status === "completed") {
    if (!rate) return noRate(paidMinutes);
    const telehealth = visit.modality === "Telehealth";
    let cents: number;
    let estimate = false;
    if (rate.method === "per-appointment") {
      cents = (telehealth ? rate.telehealthCents : rate.inPersonCents) ?? 0;
    } else if (rate.method === "hourly") {
      cents = roundCents(((rate.hourlyCents ?? 0) * paidMinutes) / 60);
    } else {
      cents = roundCents(((line?.billedCents ?? 0) * (rate.sharePercent ?? 0)) / 100);
      estimate = !line || line.estimated;
    }
    const signed = SIGNED.has(visit.noteStatus ?? "");
    if (!signed)
      return {
        ...base,
        status: "Pending",
        cents,
        estimate,
        reason: "Sign the note to confirm this fee",
        minutes: paidMinutes,
      };
    if (rate.method === "hourly" && !visit.timesheetApproved)
      return {
        ...base,
        status: "Pending",
        cents,
        estimate,
        reason: "Waiting for your timesheet to be approved",
        minutes: paidMinutes,
      };
    // A share of an amount that hasn't been billed yet can't be confirmed.
    if (estimate)
      return {
        ...base,
        status: "Pending",
        cents,
        estimate,
        reason: "Waiting for billing to confirm the amount",
        minutes: paidMinutes,
      };
    return { ...base, status: "Earned", cents, estimate, reason: "", minutes: paidMinutes };
  }

  const missed =
    visit.status === "no-show" ||
    (visit.status === "late-cancelled" &&
      visit.cancellation?.by === "client" &&
      visit.cancellation.chargeable);
  if (missed) {
    const what = visit.status === "no-show" ? "Did not attend" : "Late cancellation";
    if (!rate) return noRate(0);
    const factor = cancellationFactor[rate.cancellation];
    if (factor === 0) return notPayable(`${what}: no fee under your pay rate`);
    let unrounded: number;
    if (rate.method === "per-appointment") {
      const fee =
        (visit.modality === "Telehealth" ? rate.telehealthCents : rate.inPersonCents) ?? 0;
      unrounded = fee * factor;
    } else if (rate.method === "hourly") {
      unrounded = (((rate.hourlyCents ?? 0) * visit.scheduledMinutes) / 60) * factor;
    } else {
      if (!line || line.billedCents <= 0) return notPayable(`${what}: not charged, so no share`);
      unrounded = ((line.billedCents * (rate.sharePercent ?? 0)) / 100) * factor;
    }
    return {
      ...base,
      status: "Earned",
      cents: roundCents(unrounded),
      reason: `${what}: ${cancellationPayLabel[rate.cancellation].toLowerCase()}`,
      minutes: 0,
    };
  }

  if (visit.status === "late-cancelled" || visit.status === "cancelled")
    return notPayable(
      visit.cancellation?.by === "medisense" ? "Cancelled by Medisense" : "Cancelled with notice",
    );
  if (visit.status === "aborted") return notPayable("Visit not completed");
  return notPayable("Visit moved to another time");
}

/** Statuses that can carry a fee or a reason; booked and tentative visits haven't happened. */
export const payableStatuses = [
  "completed",
  "no-show",
  "late-cancelled",
  "cancelled",
  "aborted",
] as const;

/* ------------------------------------------------------------------ periods (Brisbane days) */

const DAY_MS = 86_400_000;
const keyDate = (key: string) => new Date(`${key}T00:00:00Z`);
const keyOf = (d: Date) => d.toISOString().slice(0, 10);
export const plusDays = (key: string, n: number) =>
  keyOf(new Date(keyDate(key).getTime() + n * DAY_MS));

/** Brisbane calendar day of an instant (no daylight saving in Queensland). */
export const brisbaneDayKey = (at: Date) => keyOf(new Date(at.getTime() + 10 * 3_600_000));

/** Monday of the week a day falls in, matching timesheets. */
export function weekStart(key: string) {
  const dow = (keyDate(key).getUTCDay() + 6) % 7;
  return plusDays(key, -dow);
}
export const monthStart = (key: string) => `${key.slice(0, 7)}-01`;
/** The financial year runs 1 July to 30 June. */
export function financialYearStart(key: string) {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  return `${m >= 7 ? y : y - 1}-07-01`;
}

/* ------------------------------------------------------------------ totals */

export interface FeeRow {
  day: string;
  fee: VisitFee;
}

export interface EarningsFigure {
  /** Earned cents in the period. */
  cents: number;
  /** Some visit in the period has no pay rate, so the figure isn't complete. */
  missingRate: boolean;
}

export interface EarningsHeadline {
  week: EarningsFigure;
  month: EarningsFigure;
  year: EarningsFigure;
  /** Pending visits of the financial year: delivered, fee not confirmed yet. */
  pending: EarningsFigure & { visits: number };
}

/** Earned cents added in integer cents; Pending and Not payable never count as earned. */
export function sumEarned(rows: readonly FeeRow[]): EarningsFigure {
  let cents = 0;
  let missingRate = false;
  for (const r of rows) {
    if (r.fee.status === "Earned") cents += r.fee.cents ?? 0;
    if (r.fee.status === "Pay rate not set") missingRate = true;
  }
  return { cents, missingRate };
}

export function headline(rows: readonly FeeRow[], today: string): EarningsHeadline {
  const within = (from: string) => rows.filter((r) => r.day >= from && r.day <= today);
  const fy = within(financialYearStart(today));
  const pendingRows = fy.filter((r) => r.fee.status === "Pending");
  return {
    week: sumEarned(within(weekStart(today))),
    month: sumEarned(within(monthStart(today))),
    year: sumEarned(fy),
    pending: {
      cents: pendingRows.reduce((s, r) => s + (r.fee.cents ?? 0), 0),
      missingRate: fy.some((r) => r.fee.status === "Pay rate not set"),
      visits: pendingRows.length,
    },
  };
}

/** Earned cents per week for the last `weeks` weeks, oldest first, ending with this week. */
export function weeklySeries(rows: readonly FeeRow[], today: string, weeks = 12) {
  const current = weekStart(today);
  const out: { week: string; cents: number }[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) out.push({ week: plusDays(current, -7 * i), cents: 0 });
  const index = new Map(out.map((w, i) => [w.week, i]));
  for (const r of rows) {
    if (r.fee.status !== "Earned" || r.day > today) continue;
    const i = index.get(weekStart(r.day));
    const w = i === undefined ? undefined : out[i];
    if (w) w.cents += r.fee.cents ?? 0;
  }
  return out;
}

/* ------------------------------------------------------------------ display */

export const centsLabel = (c: number | null | undefined) =>
  c === null || c === undefined
    ? "—"
    : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(c / 100);

/** "315.00" for CSV: dollars with two decimals, no currency sign or grouping. */
export const centsPlain = (c: number) => {
  const sign = c < 0 ? "-" : "";
  const a = Math.abs(c);
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
};

/** Margin as a percentage of billed, one decimal place; null when nothing was billed. */
export const marginPercent = (billedCents: number, payCents: number) =>
  billedCents > 0 ? Math.round(((billedCents - payCents) / billedCents) * 1000) / 10 : null;

/* ------------------------------------------------------------------ DTOs */

/** One visit on the therapist's own Earnings list. Nothing about billing, payers or claims. */
export interface MyEarningRowDto {
  id: string;
  date: string;
  patient: string;
  service: string;
  modality: "In person" | "Telehealth";
  minutes: number;
  feeCents: number | null;
  estimate: boolean;
  status: EarningStatus;
  reason: string;
  notes: string[];
}

export interface MyEarningsDto {
  today: string;
  method: PayMethod | null;
  headline: EarningsHeadline;
  series: { week: string; cents: number }[];
  rows: MyEarningRowDto[];
  services: string[];
}

/** The Finance view of a visit: the therapist's row plus what was billed. */
export interface FinanceEarningRowDto extends MyEarningRowDto {
  /** False when the visit has no billing line yet. */
  billed: boolean;
  billedCents: number;
}

export interface TherapistEarningsRowDto {
  therapistId: string;
  therapist: string;
  discipline: string;
  method: PayMethod | null;
  visits: number;
  billedCents: number;
  payCents: number;
  pendingCents: number;
  /** Margin compares billed with the pay for those same billed visits, never with unbilled work. */
  marginCents: number;
  marginPercent: number | null;
  /** Visits whose pay is final but that have no billing line yet. */
  unbilledVisits: number;
  missingRate: boolean;
}

export interface TherapistEarningsReportDto {
  from: string;
  to: string;
  rows: TherapistEarningsRowDto[];
  totals: Omit<TherapistEarningsRowDto, "therapistId" | "therapist" | "discipline" | "method">;
  services: string[];
  therapists: { id: string; name: string }[];
}

export interface PayRateDto {
  id: string;
  method: PayMethod;
  summary: string;
  inPersonCents: number | null;
  telehealthCents: number | null;
  hourlyCents: number | null;
  sharePercent: number | null;
  cancellation: CancellationPay;
  effectiveFrom: string;
  note: string;
  createdByName: string;
  createdAt: string;
  withdrawnAt: string | null;
  state: "Current" | "Upcoming" | "Past" | "Withdrawn";
}

export interface PayRatesRowDto {
  therapistId: string;
  name: string;
  discipline: string;
  photo: string | null;
  current: PayRateDto | null;
  upcoming: PayRateDto | null;
  history: PayRateDto[];
  /** Highest save number seen; sent back with a change so two people never overwrite each other. */
  latestSeq: number;
  /** Visits in the last 90 days with no rate in force. */
  unpaidVisits: number;
}

export interface PayRatesBoardDto {
  today: string;
  canManage: boolean;
  rows: PayRatesRowDto[];
}

export const earningsFilterSchema = z.object({
  from: day.optional(),
  to: day.optional(),
  service: z.string().max(80).optional(),
  therapist: z
    .string()
    .regex(/^[a-f0-9]{24}$/)
    .optional(),
});
export type EarningsFilter = z.infer<typeof earningsFilterSchema>;
