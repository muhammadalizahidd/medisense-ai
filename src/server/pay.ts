import "server-only";
import { ObjectId } from "mongodb";
import { hourlyRates } from "@/lib/live/clinical";
import { lineMoney } from "@/lib/live/finance";
import { csvCell } from "@/lib/live/csv";
import {
  brisbaneDayKey,
  byNewest,
  centsPlain,
  financialYearStart,
  headline,
  marginPercent,
  payableStatuses,
  plusDays,
  rateFields,
  rateOn,
  rateSummary,
  visitFee,
  weekStart,
  weeklySeries,
  type EarningsFilter,
  type FinanceEarningRowDto,
  type MyEarningRowDto,
  type MyEarningsDto,
  type PayLine,
  type PayRate,
  type PayRateDto,
  type PayRateInput,
  type PayRatesBoardDto,
  type PayVisit,
  type TherapistEarningsReportDto,
  type TherapistEarningsRowDto,
  type VisitFee,
} from "@/lib/live/pay";
import { AuthError } from "./auth-error";
import { collections } from "./db";
import { needOfVisit } from "./dto";
import { todayKey } from "./finance";
import { UserFacingError } from "./http";
import { publish } from "./live";
import type { AppointmentDoc, BillableDoc, PayRateDoc, TherapistDoc, UserDoc } from "./models";
import { can, canAny } from "./permissions";
import { photoUrl } from "./photos";

/*
 * Therapist pay and earnings. Fees are worked out when asked, from the visit, its original billing
 * line and the pay rate in force on the visit's day, so the therapist's screen, the Finance report
 * and the CSV can never disagree and nothing needs re-syncing when a note is signed or a line is
 * corrected. Pay rates are append-only; a change is a new row with its own start date.
 */

const isAdmin = (u: UserDoc) => u.role === "admin";
export const canViewPay = (u: UserDoc) => isAdmin(u) && canAny(u, ["pay.view", "pay.manage"]);
export const canManagePay = (u: UserDoc) => isAdmin(u) && can(u, "pay.manage");
const canSeeEarningsReport = (u: UserDoc) => isAdmin(u) && can(u, "finance.work");

/* ------------------------------------------------------------------ mapping */

const toRate = (d: PayRateDoc): PayRate => ({
  id: d._id.toHexString(),
  method: d.method,
  inPersonCents: d.inPersonCents,
  telehealthCents: d.telehealthCents,
  hourlyCents: d.hourlyCents,
  sharePercent: d.sharePercent,
  cancellation: d.cancellation,
  effectiveFrom: d.effectiveFrom,
  seq: d.seq,
  withdrawn: Boolean(d.withdrawnAt),
});

function rateDto(d: PayRateDoc, current: PayRate | null, today: string): PayRateDto {
  const state: PayRateDto["state"] = d.withdrawnAt
    ? "Withdrawn"
    : current?.id === d._id.toHexString()
      ? "Current"
      : d.effectiveFrom > today
        ? "Upcoming"
        : "Past";
  return {
    id: d._id.toHexString(),
    method: d.method,
    summary: rateSummary(d),
    inPersonCents: d.inPersonCents,
    telehealthCents: d.telehealthCents,
    hourlyCents: d.hourlyCents,
    sharePercent: d.sharePercent,
    cancellation: d.cancellation,
    effectiveFrom: d.effectiveFrom,
    note: d.note,
    createdByName: d.createdByName,
    createdAt: d.createdAt.toISOString(),
    withdrawnAt: d.withdrawnAt?.toISOString() ?? null,
    state,
  };
}

const startOfDay = (key: string) => new Date(`${key}T00:00:00+10:00`);

/* ------------------------------------------------------------------ fee rows */

type Visit = Pick<
  AppointmentDoc,
  | "_id"
  | "ref"
  | "therapistId"
  | "clientId"
  | "discipline"
  | "needId"
  | "start"
  | "end"
  | "status"
  | "modality"
  | "checkOut"
  | "note"
  | "cancellation"
>;

export interface FeeRowFull {
  therapistId: string;
  visitId: string;
  ref: string;
  day: string;
  patient: string;
  service: string;
  modality: "In person" | "Telehealth";
  fee: VisitFee;
  /** Ex GST, from the visit's original billing line; 0 when there is no real line. */
  billedCents: number;
  /** The visit has a billing line (a waived cancellation line counts, at $0). */
  billed: boolean;
}

/** The original (first, non-rebill, non-rejected) service or cancellation line of each visit. */
function originalLines(lines: BillableDoc[]) {
  const out = new Map<string, BillableDoc>();
  const sorted = [...lines].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const b of sorted) {
    if (!b.appointmentId || b.parentId || b.source === "Travel") continue;
    if (b.sourceKey.includes(":rebill:") || b.duplicateOf) continue;
    const key = `${b.appointmentId.toHexString()}:${b.sourceKey.endsWith(":cancellation") ? "cancellation" : "service"}`;
    if (!out.has(key)) out.set(key, b);
  }
  return out;
}

const billedCentsOf = (b: BillableDoc) =>
  b.status === "Rejected" ? 0 : Math.round(lineMoney(b.quantity, b.rate, b.tax).subtotal * 100);

/**
 * Every payable visit of the therapists between two Brisbane days, with its fee. The one function
 * behind the therapist's screen, the Finance report and the export.
 */
export async function feeRows(
  therapistIds: readonly ObjectId[],
  from: string,
  to: string,
): Promise<FeeRowFull[]> {
  if (!therapistIds.length) return [];
  const db = await collections();
  const visits: Visit[] = await db.appointments
    .find(
      {
        therapistId: { $in: [...therapistIds] },
        status: { $in: [...payableStatuses] },
        start: { $gte: startOfDay(from), $lt: startOfDay(plusDays(to, 1)) },
      },
      {
        projection: {
          ref: 1,
          therapistId: 1,
          clientId: 1,
          discipline: 1,
          needId: 1,
          start: 1,
          end: 1,
          status: 1,
          modality: 1,
          checkOut: 1,
          note: 1,
          cancellation: 1,
        },
      },
    )
    .toArray();
  if (!visits.length) return [];
  const visitIds = visits.map((v) => v._id);
  const [rateDocs, lines, clients, sheets] = await Promise.all([
    db.payRates.find({ therapistId: { $in: [...therapistIds] } }).toArray(),
    db.billables.find({ appointmentId: { $in: visitIds } }).toArray(),
    db.clients
      .find(
        {
          _id: {
            $in: [...new Set(visits.map((v) => v.clientId.toHexString()))].map(
              (id) => new ObjectId(id),
            ),
          },
        },
        { projection: { name: 1, needs: 1 } },
      )
      .toArray(),
    db.db
      .collection<{ therapistId: ObjectId; week: string; status: string }>("timesheets")
      .find(
        { therapistId: { $in: [...therapistIds] }, status: "Approved" },
        { projection: { therapistId: 1, week: 1, status: 1 } },
      )
      .toArray(),
  ]);

  const invoiceIds = [
    ...new Set(lines.flatMap((l) => (l.invoiceId ? [l.invoiceId.toHexString()] : []))),
  ];
  const credits = invoiceIds.length
    ? await db.adjustments
        .find(
          {
            invoiceId: { $in: invoiceIds.map((id) => new ObjectId(id)) },
            type: { $in: ["Credit note", "Refund"] },
            status: "Applied",
          },
          { projection: { invoiceId: 1 } },
        )
        .toArray()
    : [];
  const creditedInvoices = new Set(credits.map((c) => c.invoiceId?.toHexString() ?? ""));
  const rebilled = new Set(
    lines
      .filter((l) => l.sourceKey.includes(":rebill:"))
      .map((l) => l.sourceKey.split(":rebill:")[0]),
  );

  const ratesBy = new Map<string, PayRate[]>();
  for (const d of rateDocs) {
    const k = d.therapistId.toHexString();
    ratesBy.set(k, [...(ratesBy.get(k) ?? []), toRate(d)]);
  }
  const approved = new Set(sheets.map((s) => `${s.therapistId.toHexString()}:${s.week}`));
  const clientById = new Map(clients.map((c) => [c._id.toHexString(), c]));
  const original = originalLines(lines);

  return visits.map((v): FeeRowFull => {
    const tid = v.therapistId.toHexString();
    const day = brisbaneDayKey(v.start);
    const scheduledMinutes = Math.max(
      0,
      Math.round((v.end.getTime() - v.start.getTime()) / 60_000),
    );
    const missed = v.status !== "completed";
    const b = original.get(`${v._id.toHexString()}:${missed ? "cancellation" : "service"}`);
    const client = clientById.get(v.clientId.toHexString());
    const need = client ? needOfVisit(client, v) : null;
    const modality = v.modality === "Telehealth" ? "Telehealth" : "In person";
    const credited = b
      ? rebilled.has(b.sourceKey) ||
        (b.invoiceId ? creditedInvoices.has(b.invoiceId.toHexString()) : false) ||
        b.history.some((h) => h.action.startsWith("Credited by"))
      : false;
    const minutesForEstimate = v.checkOut?.minutes ?? scheduledMinutes;
    const line: PayLine | null = b
      ? {
          billableMinutes: b.billableMinutes,
          billedCents: billedCentsOf(b),
          estimated: false,
          credited,
        }
      : missed
        ? null
        : {
            // Until the note is signed there is no billing line; the default hourly price stands in.
            billableMinutes: minutesForEstimate,
            billedCents: Math.round(
              ((hourlyRates[v.discipline as keyof typeof hourlyRates] ?? 0) *
                100 *
                minutesForEstimate) /
                60,
            ),
            estimated: true,
            credited: false,
          };
    const pv: PayVisit = {
      id: v._id.toHexString(),
      day,
      status: v.status,
      modality,
      scheduledMinutes,
      checkOutMinutes: v.checkOut?.minutes ?? null,
      noteStatus: v.note?.status ?? (v.note ? "Final" : null),
      cancellation: v.cancellation
        ? { by: v.cancellation.by, chargeable: v.cancellation.chargeable }
        : null,
      timesheetApproved: approved.has(`${tid}:${weekStart(day)}`),
    };
    const fee = visitFee(pv, line, rateOn(ratesBy.get(tid) ?? [], day));
    return {
      therapistId: tid,
      visitId: pv.id,
      ref: v.ref ?? "",
      day,
      patient: client?.name ?? "Patient",
      service: b?.support ?? need?.support ?? v.discipline,
      modality,
      fee,
      billedCents: b ? billedCentsOf(b) : 0,
      billed: Boolean(b),
    };
  });
}

/** The fields a therapist may see. Built field by field, so no billing detail can slip through. */
const myRow = (r: FeeRowFull): MyEarningRowDto => ({
  id: r.visitId,
  date: r.day,
  patient: r.patient,
  service: r.service,
  modality: r.modality,
  minutes: r.fee.minutes,
  feeCents: r.fee.cents,
  estimate: r.fee.estimate,
  status: r.fee.status,
  reason: r.fee.reason,
  notes: r.fee.notes,
});

const newestFirst = (a: FeeRowFull, b: FeeRowFull) =>
  b.day.localeCompare(a.day) || b.ref.localeCompare(a.ref);

function applyFilter(rows: FeeRowFull[], f: EarningsFilter) {
  return rows.filter(
    (r) =>
      (!f.from || r.day >= f.from) &&
      (!f.to || r.day <= f.to) &&
      (!f.service || r.service === f.service),
  );
}

/* ------------------------------------------------------------------ therapist: My earnings */

export async function myEarnings(user: UserDoc, f: EarningsFilter): Promise<MyEarningsDto> {
  if (user.role !== "therapist" || !user.therapistId) throw new AuthError(403);
  const today = todayKey();
  const fy = financialYearStart(today);
  const seriesFrom = plusDays(weekStart(today), -7 * 11);
  const windowFrom = [fy, seriesFrom, f.from ?? fy].sort()[0] ?? fy;
  const all = await feeRows([user.therapistId], windowFrom, today);
  const { payRates } = await collections();
  const rates = (await payRates.find({ therapistId: user.therapistId }).toArray()).map(toRate);
  const visible = applyFilter(all, { ...f, from: f.from ?? fy, to: f.to ?? today }).sort(
    newestFirst,
  );
  return {
    today,
    method: rateOn(rates, today)?.method ?? null,
    headline: headline(all, today),
    series: weeklySeries(all, today),
    rows: visible.map(myRow),
    services: [...new Set(all.map((r) => r.service))].sort(),
  };
}

/* ------------------------------------------------------------------ Finance: earnings report */

async function reportScope(user: UserDoc, f: EarningsFilter) {
  if (!canSeeEarningsReport(user)) throw new AuthError(403);
  const today = todayKey();
  const from = f.from ?? `${today.slice(0, 7)}-01`;
  const to = f.to ?? today;
  if (from > to) throw new UserFacingError("The start date is after the end date.", 400);
  const { therapists } = await collections();
  const staff = await therapists
    .find({}, { projection: { name: 1, discipline: 1, active: 1 } })
    .sort({ name: 1 })
    .toArray();
  const chosen = f.therapist ? staff.filter((t) => t._id.toHexString() === f.therapist) : staff;
  const rows = applyFilter(
    await feeRows(
      chosen.map((t) => t._id),
      from,
      to,
    ),
    { ...f, from, to },
  );
  return { today, from, to, staff, chosen, rows };
}

/**
 * Billed and margin cover visits whose pay is final (Earned or Not payable) and that have a billing
 * line, so margin never compares pay for unbilled work against nothing.
 */
const isFinal = (r: FeeRowFull) => r.fee.status === "Earned" || r.fee.status === "Not payable";

function totalsOf(rows: FeeRowFull[]) {
  let billedCents = 0;
  let billedPayCents = 0;
  let payCents = 0;
  let pendingCents = 0;
  let visits = 0;
  let unbilledVisits = 0;
  let missingRate = false;
  for (const r of rows) {
    if (r.fee.status !== "Not payable") visits += 1;
    if (r.fee.status === "Earned") payCents += r.fee.cents ?? 0;
    if (r.fee.status === "Pending") pendingCents += r.fee.cents ?? 0;
    if (r.fee.status === "Pay rate not set") missingRate = true;
    if (!isFinal(r)) continue;
    if (r.billed) {
      billedCents += r.billedCents;
      if (r.fee.status === "Earned") billedPayCents += r.fee.cents ?? 0;
    } else if (r.fee.status === "Earned") unbilledVisits += 1;
  }
  return {
    visits,
    billedCents,
    payCents,
    pendingCents,
    marginCents: billedCents - billedPayCents,
    marginPercent: marginPercent(billedCents, billedPayCents),
    unbilledVisits,
    missingRate,
  };
}

export async function therapistEarningsReport(
  user: UserDoc,
  f: EarningsFilter,
): Promise<TherapistEarningsReportDto> {
  const { today, from, to, staff, chosen, rows } = await reportScope(user, f);
  const { payRates } = await collections();
  const rateDocs = await payRates
    .find({ therapistId: { $in: chosen.map((t) => t._id) } })
    .toArray();
  const byTherapist = new Map<string, FeeRowFull[]>();
  for (const r of rows)
    byTherapist.set(r.therapistId, [...(byTherapist.get(r.therapistId) ?? []), r]);
  const out: TherapistEarningsRowDto[] = chosen
    .filter((t) => byTherapist.has(t._id.toHexString()) || t.active !== false)
    .map((t) => {
      const id = t._id.toHexString();
      const rates = rateDocs.filter((d) => d.therapistId.equals(t._id)).map(toRate);
      return {
        therapistId: id,
        therapist: t.name,
        discipline: t.discipline,
        method: rateOn(rates, today)?.method ?? null,
        ...totalsOf(byTherapist.get(id) ?? []),
      };
    });
  return {
    from,
    to,
    rows: out,
    totals: totalsOf(rows),
    services: [...new Set(rows.map((r) => r.service))].sort(),
    therapists: staff.map((t) => ({ id: t._id.toHexString(), name: t.name })),
  };
}

/** One therapist's visits for the Finance drill-down: the therapist's rows plus what was billed. */
export async function therapistEarningVisits(
  user: UserDoc,
  therapistId: ObjectId,
  f: EarningsFilter,
): Promise<FinanceEarningRowDto[]> {
  const { rows } = await reportScope(user, { ...f, therapist: therapistId.toHexString() });
  return rows
    .sort(newestFirst)
    .map((r) => ({ ...myRow(r), billedCents: r.billedCents, billed: r.billed }));
}

/** CSV for payroll and accounting: one line per visit and a total. No patient names. */
export async function earningsCsv(user: UserDoc, f: EarningsFilter) {
  const { from, to, staff, rows } = await reportScope(user, f);
  const names = new Map(staff.map((t) => [t._id.toHexString(), t.name]));
  const head = [
    "Therapist",
    "Date",
    "Visit",
    "Service",
    "Mode",
    "Minutes",
    "Status",
    "Fee (AUD)",
    "Billed ex GST (AUD)",
    "Note",
  ];
  const sorted = [...rows].sort(
    (a, b) =>
      (names.get(a.therapistId) ?? "").localeCompare(names.get(b.therapistId) ?? "") ||
      a.day.localeCompare(b.day) ||
      a.ref.localeCompare(b.ref),
  );
  const body = sorted.map((r) =>
    [
      csvCell(names.get(r.therapistId) ?? ""),
      r.day,
      csvCell(r.ref),
      csvCell(r.service),
      r.modality,
      String(r.fee.minutes),
      r.fee.status,
      r.fee.cents === null ? "" : centsPlain(r.fee.cents),
      isFinal(r) && r.billed ? centsPlain(r.billedCents) : r.billed ? "" : "Not billed",
      csvCell([r.fee.reason, ...r.fee.notes].filter(Boolean).join("; ")),
    ].join(","),
  );
  const t = totalsOf(rows);
  const total = [
    "Total earned",
    "",
    "",
    "",
    "",
    "",
    "",
    centsPlain(t.payCents),
    centsPlain(t.billedCents),
    t.missingRate ? "Some visits have no pay rate" : "",
  ].join(",");
  await writeAudit(
    user,
    `Exported therapist earnings ${from} to ${to} (${rows.length} visits)`,
    null,
    null,
  );
  return {
    filename: `therapist-earnings-${from}-to-${to}.csv`,
    // The byte order mark makes Excel read the file as UTF-8.
    text: `﻿${[head.join(","), ...body, total].join("\r\n")}\r\n`,
  };
}

/* ------------------------------------------------------------------ office: pay rates */

async function writeAudit(
  actor: UserDoc,
  action: string,
  therapistId: ObjectId | null,
  detail: { before: unknown; after: unknown } | null,
) {
  const { audit } = await collections();
  await audit.insertOne({
    _id: new ObjectId(),
    actorId: actor._id,
    actorName: actor.name,
    action,
    clientId: null,
    therapistId,
    detail,
    at: new Date(),
  });
}

export async function payRatesBoard(user: UserDoc): Promise<PayRatesBoardDto> {
  if (!canViewPay(user)) throw new AuthError(403);
  const today = todayKey();
  const db = await collections();
  const staff = (await db.therapists
    .find({ active: { $ne: false } }, { projection: { name: 1, discipline: 1, photoAt: 1 } })
    .sort({ name: 1 })
    .toArray()) as Pick<TherapistDoc, "_id" | "name" | "discipline" | "photoAt">[];
  const ids = staff.map((t) => t._id);
  const since = plusDays(today, -90);
  const [docs, recent] = await Promise.all([
    db.payRates.find({ therapistId: { $in: ids } }).toArray(),
    db.appointments
      .find(
        {
          therapistId: { $in: ids },
          status: { $in: ["completed", "no-show", "late-cancelled"] },
          start: { $gte: startOfDay(since), $lt: startOfDay(plusDays(today, 1)) },
        },
        { projection: { therapistId: 1, start: 1 } },
      )
      .toArray(),
  ]);
  return {
    today,
    canManage: canManagePay(user),
    rows: staff.map((t) => {
      const own = docs.filter((d) => d.therapistId.equals(t._id));
      const rates = own.map(toRate);
      const current = rateOn(rates, today);
      const upcoming =
        rates
          .filter((r) => !r.withdrawn && r.effectiveFrom > today)
          .sort(byNewest)
          .at(-1) ?? null;
      const history = [...own].sort((a, b) => byNewest(toRate(a), toRate(b)));
      return {
        therapistId: t._id.toHexString(),
        name: t.name,
        discipline: t.discipline,
        photo: photoUrl("therapist", t._id, t.photoAt),
        current: current ? rateDto(must(own, current.id), current, today) : null,
        upcoming: upcoming ? rateDto(must(own, upcoming.id), current, today) : null,
        history: history.map((d) => rateDto(d, current, today)),
        latestSeq: own.reduce((m, d) => Math.max(m, d.seq), 0),
        unpaidVisits: recent.filter(
          (v) => v.therapistId.equals(t._id) && !rateOn(rates, brisbaneDayKey(v.start)),
        ).length,
      };
    }),
  };
}

function must(docs: PayRateDoc[], id: string) {
  const d = docs.find((x) => x._id.toHexString() === id);
  if (!d) throw new Error("Pay rate went missing while it was being read.");
  return d;
}

const snapshot = (
  d: Pick<
    PayRateDoc,
    | "method"
    | "inPersonCents"
    | "telehealthCents"
    | "hourlyCents"
    | "sharePercent"
    | "cancellation"
    | "effectiveFrom"
  >,
) => ({
  method: d.method,
  rate: rateSummary(d),
  cancellation: d.cancellation,
  effectiveFrom: d.effectiveFrom,
});

async function notifyPayChanged(therapistId: ObjectId) {
  const db = await collections();
  const [admins, therapist] = await Promise.all([
    db.users.find({ role: "admin", disabled: { $ne: true } }, { projection: { _id: 1 } }).toArray(),
    db.therapists.findOne({ _id: therapistId }, { projection: { userId: 1 } }),
  ]);
  await publish(
    [...admins.map((a) => a._id), ...(therapist?.userId ? [therapist.userId] : [])],
    "care",
    { pay: true },
  );
}

export async function setPayRate(
  user: UserDoc,
  therapistId: ObjectId,
  input: PayRateInput,
  basedOnSeq: number,
) {
  if (!canManagePay(user)) throw new AuthError(403);
  const today = todayKey();
  const db = await collections();
  const therapist = await db.therapists.findOne(
    { _id: therapistId },
    { projection: { name: 1, active: 1 } },
  );
  if (!therapist || therapist.active === false)
    throw new UserFacingError("This therapist isn't active.", 404);
  const own = await db.payRates.find({ therapistId }).toArray();
  const latestSeq = own.reduce((m, d) => Math.max(m, d.seq), 0);
  if (basedOnSeq !== latestSeq)
    throw new UserFacingError("Someone changed this pay rate. Reload and check it.", 409);
  const live = own.filter((d) => !d.withdrawnAt);
  if (live.length && input.effectiveFrom < today)
    throw new UserFacingError(
      "A new rate starts today or later. Past visits keep the rate that applied on the day.",
      400,
    );
  if (input.effectiveFrom < "2020-01-01" || input.effectiveFrom > plusDays(today, 366))
    throw new UserFacingError("Choose a start date within the next year.", 400);

  const before = rateOn(live.map(toRate), input.effectiveFrom);
  const beforeDoc = before ? must(own, before.id) : null;
  const doc: PayRateDoc = {
    _id: new ObjectId(),
    therapistId,
    seq: latestSeq + 1,
    ...rateFields(input),
    effectiveFrom: input.effectiveFrom,
    note: input.note,
    createdBy: user._id,
    createdByName: user.name,
    createdAt: new Date(),
    withdrawnAt: null,
    withdrawnBy: null,
  };
  try {
    await db.payRates.insertOne(doc);
  } catch (error) {
    // The unique (therapistId, seq) index: someone else saved at the same moment.
    if ((error as { code?: number }).code === 11000)
      throw new UserFacingError("Someone changed this pay rate. Reload and check it.", 409);
    throw error;
  }
  await writeAudit(
    user,
    `Set the pay rate for ${therapist.name}: ${rateSummary(doc)}, cancellations ${doc.cancellation}, from ${doc.effectiveFrom}${beforeDoc ? ` (was ${rateSummary(beforeDoc)})` : " (first rate)"}`,
    therapistId,
    { before: beforeDoc ? snapshot(beforeDoc) : null, after: snapshot(doc) },
  );
  await notifyPayChanged(therapistId);
  return { id: doc._id.toHexString(), seq: doc.seq };
}

/** Takes back a rate that hasn't started yet. A rate that has applied to a visit stays. */
export async function withdrawPayRate(user: UserDoc, rateId: ObjectId) {
  if (!canManagePay(user)) throw new AuthError(403);
  const today = todayKey();
  const db = await collections();
  const doc = await db.payRates.findOne({ _id: rateId });
  if (!doc) throw new UserFacingError("Not found.", 404);
  const done = await db.payRates.updateOne(
    { _id: rateId, withdrawnAt: null, effectiveFrom: { $gt: today } },
    { $set: { withdrawnAt: new Date(), withdrawnBy: user.name } },
  );
  if (done.modifiedCount !== 1)
    throw new UserFacingError("Only a rate that hasn't started yet can be withdrawn.", 409);
  const therapist = await db.therapists.findOne(
    { _id: doc.therapistId },
    { projection: { name: 1 } },
  );
  await writeAudit(
    user,
    `Withdrew the pay rate for ${therapist?.name ?? "a therapist"} that was to start ${doc.effectiveFrom}: ${rateSummary(doc)}`,
    doc.therapistId,
    { before: snapshot(doc), after: null },
  );
  await notifyPayChanged(doc.therapistId);
  return { ok: true };
}
