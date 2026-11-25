import "server-only";
import { ObjectId, type Db } from "mongodb";
import {
  timesheetRules,
  type MyTimesheetDto,
  type TimesheetAdjustInput,
  type TimesheetBoardDto,
  type TimesheetCheckDto,
  type TimesheetDayDto,
  type TimesheetDecisionInput,
  type TimesheetDto,
  type TimesheetStatus,
  type TimesheetTotalsDto,
  type TimesheetVisitDto,
  type TimesheetWeekDto,
} from "@/lib/live/timesheets";
import { hoursLabel } from "@/lib/live/timesheets";
import { shortDate } from "@/lib/live/time";
import { AuthError } from "./auth";
import { collections } from "./db";
import { nextRef } from "./finance";
import { hrUserIds, requireHr } from "./hr";
import { UserFacingError } from "./http";
import { adminIds, audit, notify, publish } from "./live";
import type { AppointmentDoc, TherapistDoc, UserDoc } from "./models";
import { photoUrl } from "./photos";
import { today } from "./staff";

/*
 * People and HR, timesheets. Nothing is typed in from scratch: each day starts from the roster,
 * approved leave and the visits delivered, and the clinician only corrects what's different, with
 * a reason. Checks (visits not closed off, unsigned notes, overtime, changed days) are rules shown
 * to the approver; approval and returning a sheet are a person's decision.
 */

type StoredStatus = "Draft" | "Submitted" | "Approved" | "Returned";

export interface TimesheetDoc {
  _id: ObjectId;
  ref: string;
  therapistId: ObjectId;
  userId: ObjectId;
  staffName: string;
  /** Monday of the week, "YYYY-MM-DD". */
  week: string;
  status: StoredStatus;
  adjustments: { date: string; minutes: number; reason: string; at: Date }[];
  comment: string;
  submittedAt: Date | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionNote: string;
  remindedAt: Date | null;
  /** Frozen when approved, so payroll and history don't move if a visit changes later. */
  approvedTotals: TimesheetTotalsDto | null;
  history: { action: string; byName: string; at: Date; note: string }[];
  createdAt: Date;
}

const sheets = (db: Db) => db.collection<TimesheetDoc>("timesheets");

const DAY_MS = 86_400_000;
const keyDate = (key: string) => new Date(`${key}T00:00:00Z`);
const keyOf = (d: Date) => d.toISOString().slice(0, 10);
const plusDays = (key: string, n: number) => keyOf(new Date(keyDate(key).getTime() + n * DAY_MS));
const startOf = (key: string) => new Date(`${key}T00:00:00+10:00`);
const brisbaneKey = (d: Date) => keyOf(new Date(d.getTime() + 10 * 3_600_000));
const brisbaneMinutes = (d: Date) => {
  const b = new Date(d.getTime() + 10 * 3_600_000);
  return b.getUTCHours() * 60 + b.getUTCMinutes();
};
const minutesBetween = (a: Date, b: Date) =>
  Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000));
const dayName = (key: string) =>
  (shortDate(`${key}T00:00:00Z`).split(" ")[0] ?? key).replace(",", "");

/** Monday of the week a day falls in. */
export function weekOf(key: string) {
  const dow = (keyDate(key).getUTCDay() + 6) % 7;
  return plusDays(key, -dow);
}

function weekLabel(week: string) {
  const end = plusDays(week, 6);
  const fmt = (k: string, withMonth: boolean) =>
    new Intl.DateTimeFormat("en-AU", {
      timeZone: "UTC",
      day: "numeric",
      ...(withMonth ? { month: "short" } : {}),
    }).format(keyDate(k));
  return week.slice(5, 7) === end.slice(5, 7)
    ? `${fmt(week, false)}–${fmt(end, true)}`
    : `${fmt(week, true)} – ${fmt(end, true)}`;
}

function shownWeeks(on: string): TimesheetWeekDto[] {
  const current = weekOf(on);
  const out: TimesheetWeekDto[] = [];
  for (let i: number = timesheetRules.weeksShown; i >= 0; i -= 1) {
    const week = plusDays(current, -7 * i);
    out.push({ week, label: weekLabel(week), current: i === 0 });
  }
  return out;
}

type Visit = Pick<
  AppointmentDoc,
  | "_id"
  | "ref"
  | "therapistId"
  | "clientId"
  | "start"
  | "end"
  | "status"
  | "note"
  | "checkOut"
  | "travelPlan"
  | "modality"
  | "scenario"
>;

type Context = {
  on: string;
  now: Date;
  weeks: TimesheetWeekDto[];
  team: TherapistDoc[];
  visits: Map<string, Visit[]>;
  patients: Map<string, string>;
  docs: Map<string, TimesheetDoc>;
};

const docKey = (therapistId: ObjectId, week: string) => `${therapistId.toHexString()}:${week}`;

async function context(onlyTherapist?: ObjectId): Promise<Context> {
  const { therapists, appointments, clients, db } = await collections();
  const on = today();
  const now = new Date();
  const weeks = shownWeeks(on);
  const first = weeks[0]?.week ?? weekOf(on);
  const last = plusDays(weeks[weeks.length - 1]?.week ?? weekOf(on), 7);
  const team = await therapists
    .find({
      active: { $ne: false },
      "staff.status": { $ne: "Archived" },
      ...(onlyTherapist ? { _id: onlyTherapist } : {}),
    })
    .sort({ name: 1 })
    .toArray();
  const rows = await appointments
    .find(
      {
        therapistId: { $in: team.map((t) => t._id) },
        start: { $gte: startOf(first), $lt: startOf(last) },
        status: { $in: ["completed", "aborted", "no-show", "booked", "tentative"] },
      },
      {
        projection: {
          ref: 1,
          therapistId: 1,
          clientId: 1,
          start: 1,
          end: 1,
          status: 1,
          note: 1,
          checkOut: 1,
          travelPlan: 1,
          modality: 1,
          scenario: 1,
        },
      },
    )
    .sort({ start: 1 })
    .toArray();
  const visits = new Map<string, Visit[]>();
  for (const v of rows) {
    // Visits still ahead are not time worked yet; scenario visits are re-dated to come.
    const open = v.status === "booked" || v.status === "tentative";
    if (open && (v.end.getTime() > now.getTime() || v.scenario)) continue;
    const k = v.therapistId.toHexString();
    visits.set(k, [...(visits.get(k) ?? []), v]);
  }
  const ids = [...new Set(rows.map((v) => v.clientId.toHexString()))].map((id) => new ObjectId(id));
  const people = await clients.find({ _id: { $in: ids } }, { projection: { name: 1 } }).toArray();
  const docs = await sheets(db)
    .find({
      week: { $gte: first, $lte: weeks[weeks.length - 1]?.week ?? first },
      ...(onlyTherapist ? { therapistId: onlyTherapist } : {}),
    })
    .toArray();
  return {
    on,
    now,
    weeks,
    team,
    visits,
    patients: new Map(people.map((p) => [p._id.toHexString(), p.name])),
    docs: new Map(docs.map((d) => [docKey(d.therapistId, d.week), d])),
  };
}

function visitDto(v: Visit, patients: Map<string, string>): TimesheetVisitDto {
  const booked = minutesBetween(v.start, v.end);
  const travel = v.travelPlan?.recordedMinutes ?? 0;
  const signed =
    v.note?.status === "Final" || v.note?.status === "Amended" || Boolean(v.note?.signedAt);
  const base = {
    id: v._id.toHexString(),
    ref: v.ref ?? null,
    start: v.start.toISOString(),
    end: v.end.toISOString(),
    patient: patients.get(v.clientId.toHexString()) ?? "Patient",
    modality: v.modality ?? "In person",
  } as const;
  if (v.status === "completed") {
    return {
      ...base,
      status: "Completed",
      clinicalMinutes: v.checkOut?.minutes ?? booked,
      travelMinutes: travel,
      noteSigned: signed,
    };
  }
  if (v.status === "aborted") {
    return {
      ...base,
      status: "Incomplete",
      clinicalMinutes: v.checkOut?.minutes ?? 0,
      travelMinutes: travel,
      noteSigned: signed,
    };
  }
  if (v.status === "no-show") {
    return {
      ...base,
      status: "Did not attend",
      clinicalMinutes: 0,
      travelMinutes: travel,
      noteSigned: null,
    };
  }
  return {
    ...base,
    status: "Not closed off",
    clinicalMinutes: 0,
    travelMinutes: 0,
    noteSigned: null,
  };
}

const statusOf = (doc: TimesheetDoc | undefined): TimesheetStatus =>
  !doc || doc.status === "Draft" ? "Not submitted" : doc.status;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const listDays = (keys: string[]) => keys.map(dayName).join(", ");

/** One clinician's week, worked out from the roster, leave and visits, then their corrections. */
function buildSheet(ctx: Context, t: TherapistDoc, week: string): TimesheetDto {
  const doc = ctx.docs.get(docKey(t._id, week));
  const all = ctx.visits.get(t._id.toHexString()) ?? [];
  const days: TimesheetDayDto[] = [];
  for (let i = 0; i < 7; i += 1) {
    const date = plusDays(week, i);
    const w = t.weekly.find((x) => x.weekday === i + 1);
    const roster = w ? { start: w.start, end: w.end } : null;
    const rosteredMinutes = roster ? roster.end - roster.start : 0;
    const off = (t.timeOff ?? []).find((o) => o.from <= date && date <= o.to);
    const leave = off && roster ? off.reason : null;
    const leaveMinutes = leave ? rosteredMinutes : 0;
    const visits = all
      .filter((v) => brisbaneKey(v.start) === date)
      .map((v) => visitDto(v, ctx.patients));
    const clinicalMinutes = visits.reduce((n, v) => n + v.clinicalMinutes, 0);
    const travelMinutes = visits.reduce((n, v) => n + v.travelMinutes, 0);
    const onVisits = clinicalMinutes + travelMinutes;
    const future = date > ctx.on;
    const suggestedMinutes = future
      ? 0
      : leave
        ? onVisits
        : roster
          ? Math.max(rosteredMinutes, onVisits)
          : onVisits;
    const adj = doc?.adjustments.find((a) => a.date === date);
    const outsideRoster = visits.some((v) => {
      if (v.status === "Not closed off") return false;
      if (!roster) return true;
      const s = brisbaneMinutes(new Date(v.start));
      const e = brisbaneMinutes(new Date(v.end));
      return s < roster.start || e > roster.end;
    });
    days.push({
      date,
      roster,
      rosteredMinutes,
      leave,
      leaveMinutes,
      visits,
      clinicalMinutes,
      travelMinutes,
      suggestedMinutes,
      workedMinutes: adj ? adj.minutes : suggestedMinutes,
      adjustment: adj ? { minutes: adj.minutes, reason: adj.reason } : null,
      outsideRoster,
    });
  }

  const sum = (f: (d: TimesheetDayDto) => number) => days.reduce((n, d) => n + f(d), 0);
  const rostered = sum((d) => d.rosteredMinutes);
  const worked = sum((d) => d.workedMinutes);
  const leaveTotal = sum((d) => d.leaveMinutes);
  const clinical = sum((d) => d.clinicalMinutes);
  const travel = sum((d) => d.travelMinutes);
  const totals: TimesheetTotalsDto = {
    rostered,
    worked,
    leave: leaveTotal,
    overtime: Math.max(0, worked + leaveTotal - rostered),
    clinical,
    travel,
    other: Math.max(0, worked - clinical - travel),
    visits: days.reduce(
      (n, d) => n + d.visits.filter((v) => v.status !== "Not closed off").length,
      0,
    ),
  };

  const checks: TimesheetCheckDto[] = [];
  const visitsAll = days.flatMap((d) => d.visits);
  const unclosed = visitsAll.filter((v) => v.status === "Not closed off");
  if (unclosed.length) {
    checks.push({
      kind: "unclosed",
      tone: "over",
      text: `${plural(unclosed.length, "visit")} not closed off: mark completed or did not attend`,
    });
  }
  const unsigned = visitsAll.filter((v) => v.noteSigned === false);
  if (unsigned.length) {
    checks.push({
      kind: "unsigned",
      tone: "watch",
      text: `${plural(unsigned.length, "visit note")} not signed yet`,
    });
  }
  const onLeave = days.filter(
    (d) => d.leave && d.visits.some((v) => v.status !== "Not closed off"),
  );
  if (onLeave.length) {
    checks.push({
      kind: "leave-visit",
      tone: "over",
      text: `Visits recorded on a leave day (${listDays(onLeave.map((d) => d.date))})`,
    });
  }
  if (totals.overtime > 0) {
    checks.push({
      kind: "overtime",
      tone: "watch",
      text: `${hoursLabel(totals.overtime)} over rostered hours`,
    });
  }
  const outside = days.filter((d) => d.outsideRoster && !d.leave);
  if (outside.length) {
    checks.push({
      kind: "outside",
      tone: "watch",
      text: `Visits outside rostered hours on ${listDays(outside.map((d) => d.date))}`,
    });
  }
  const changed = days.filter((d) => d.adjustment);
  if (changed.length) {
    checks.push({
      kind: "adjusted",
      tone: "watch",
      text: `Hours changed on ${plural(changed.length, "day")}: ${changed
        .map((d) => `${dayName(d.date)} ${d.adjustment?.reason ?? ""}`.trim())
        .join("; ")}`,
    });
  }

  const status = statusOf(doc);
  const lastRostered = [...t.weekly].sort((a, b) => b.weekday - a.weekday)[0]?.weekday ?? 5;
  const opensOn = plusDays(week, Math.min(lastRostered, 5) - 1);
  const due = plusDays(week, 6 + timesheetRules.dueDaysAfterWeek);
  return {
    id: doc?._id.toHexString() ?? null,
    ref: doc?.ref ?? null,
    staffId: t._id.toHexString(),
    staffName: t.name,
    photoUrl: photoUrl("therapist", t._id, t.photoAt),
    discipline: t.discipline,
    region: t.region,
    employment: t.staff?.profile.employmentType ?? "Employee",
    week,
    weekEnd: plusDays(week, 6),
    due,
    open: ctx.on >= opensOn,
    opensOn,
    status,
    overdue: (status === "Not submitted" || status === "Returned") && ctx.on > due,
    comment: doc?.comment ?? "",
    submittedAt: doc?.submittedAt?.toISOString() ?? null,
    decidedBy: doc?.decidedBy ?? null,
    decidedAt: doc?.decidedAt?.toISOString() ?? null,
    decisionNote: doc?.decisionNote ?? "",
    remindedAt: doc?.remindedAt?.toISOString() ?? null,
    days,
    totals: status === "Approved" && doc?.approvedTotals ? doc.approvedTotals : totals,
    checks,
    history: (doc?.history ?? []).map((h) => ({ ...h, at: h.at.toISOString() })).reverse(),
  };
}

function pickWeek(ctx: Context, asked: string | null | undefined) {
  const fallback = ctx.weeks[ctx.weeks.length - 2]?.week ?? weekOf(ctx.on);
  if (!asked) return fallback;
  return ctx.weeks.some((w) => w.week === asked) ? asked : fallback;
}

/* ------------------------------------------------------------------ HR */

export async function timesheetBoard(
  me: UserDoc,
  asked?: string | null,
): Promise<TimesheetBoardDto> {
  requireHr(me);
  const ctx = await context();
  const week = pickWeek(ctx, asked);
  const byWeek = new Map(
    ctx.weeks.map((w) => [w.week, ctx.team.map((t) => buildSheet(ctx, t, w.week))]),
  );
  const rows = byWeek.get(week) ?? [];
  const queue = ctx.weeks
    .flatMap((w) => byWeek.get(w.week) ?? [])
    .filter((s) => s.status === "Submitted")
    .sort(
      (a, b) =>
        a.week.localeCompare(b.week) || (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""),
    );
  const sum = (f: (s: TimesheetDto) => number, list = rows) => list.reduce((n, s) => n + f(s), 0);
  const worked = sum((s) => s.totals.worked);
  const clinical = sum((s) => s.totals.clinical);

  const { db } = await collections();
  const decided = await sheets(db)
    .find({ decidedAt: { $ne: null }, status: { $in: ["Approved", "Returned"] } })
    .sort({ decidedAt: -1 })
    .limit(40)
    .toArray();
  const team = new Map(ctx.team.map((t) => [t._id.toHexString(), t]));

  return {
    today: ctx.on,
    week,
    weeks: ctx.weeks,
    summary: {
      toApprove: queue.length,
      notSubmitted: rows.filter((s) => s.status === "Not submitted").length,
      overdue: rows.filter((s) => s.overdue).length,
      returned: rows.filter((s) => s.status === "Returned").length,
      approved: rows.filter((s) => s.status === "Approved").length,
      workedHours: Math.round(worked / 60),
      overtimeHours: Math.round(sum((s) => s.totals.overtime) / 6) / 10,
      visits: sum((s) => s.totals.visits),
      clinicalHours: Math.round(clinical / 6) / 10,
    },
    rows,
    queue,
    trend: ctx.weeks.map((w) => {
      const list = byWeek.get(w.week) ?? [];
      const h = (f: (s: TimesheetDto) => number) => Math.round(sum(f, list) / 6) / 10;
      return {
        week: w.week,
        label: w.label,
        ordinary: h((s) => s.totals.worked - s.totals.overtime),
        overtime: h((s) => s.totals.overtime),
        leave: h((s) => s.totals.leave),
      };
    }),
    history: decided.map((d) => {
      const t = team.get(d.therapistId.toHexString());
      return {
        id: d._id.toHexString(),
        ref: d.ref,
        staffName: d.staffName,
        photoUrl: t ? photoUrl("therapist", t._id, t.photoAt) : null,
        week: d.week,
        status: statusOf(d),
        byName: d.decidedBy ?? "",
        at: (d.decidedAt ?? d.createdAt).toISOString(),
        note: d.decisionNote,
        workedMinutes: d.approvedTotals?.worked ?? 0,
      };
    }),
  };
}

async function ensureDoc(db: Db, t: TherapistDoc, week: string, ctx: Context) {
  const existing =
    ctx.docs.get(docKey(t._id, week)) ?? (await sheets(db).findOne({ therapistId: t._id, week }));
  if (existing) return existing;
  const doc: TimesheetDoc = {
    _id: new ObjectId(),
    ref: await nextRef(db, "timesheet", "TS", 4),
    therapistId: t._id,
    userId: t.userId,
    staffName: t.name,
    week,
    status: "Draft",
    adjustments: [],
    comment: "",
    submittedAt: null,
    decidedBy: null,
    decidedAt: null,
    decisionNote: "",
    remindedAt: null,
    approvedTotals: null,
    history: [],
    createdAt: new Date(),
  };
  await sheets(db).insertOne(doc);
  ctx.docs.set(docKey(t._id, week), doc);
  return doc;
}

export async function decideTimesheets(me: UserDoc, input: TimesheetDecisionInput) {
  requireHr(me);
  const ids = input.ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  if (!ids.length) throw new UserFacingError("Timesheet not found.", 404);
  const { db } = await collections();
  const found = await sheets(db)
    .find({ _id: { $in: ids } })
    .toArray();
  const waiting = found.filter((d) => d.status === "Submitted");
  if (!waiting.length) {
    throw new UserFacingError("These timesheets have already been decided.");
  }
  const ctx = await context();
  const approve = input.decision === "Approve";
  const at = new Date();
  let worked = 0;
  for (const d of waiting) {
    const t = ctx.team.find((x) => x._id.equals(d.therapistId));
    const totals = t ? buildSheet(ctx, t, d.week).totals : null;
    worked += totals?.worked ?? 0;
    await sheets(db).updateOne(
      { _id: d._id, status: "Submitted" },
      {
        $set: {
          status: approve ? "Approved" : "Returned",
          decidedBy: me.name,
          decidedAt: at,
          decisionNote: input.note,
          approvedTotals: approve ? totals : null,
        },
        $push: {
          history: {
            action: approve ? "Approved" : "Returned",
            byName: me.name,
            at,
            note: input.note,
          },
        },
      },
    );
    const label = weekLabel(d.week);
    await notify([d.userId], {
      title: approve
        ? `Your timesheet for ${label} is approved`
        : `Your timesheet for ${label} needs a change`,
      body: approve
        ? `${totals ? hoursLabel(totals.worked) : "Your hours"} approved by ${me.name}.${input.note ? ` ${input.note}` : ""}`
        : `${me.name}: ${input.note} Fix it and submit again.`,
      href: `/profile?tab=timesheet&week=${d.week}`,
    });
  }
  await audit(
    me,
    approve
      ? `Approved ${plural(waiting.length, "timesheet")} (${waiting.map((d) => d.ref).join(", ")}), ${hoursLabel(worked)}`
      : `Returned timesheet ${waiting.map((d) => d.ref).join(", ")} to ${waiting.map((d) => d.staffName).join(", ")}: ${input.note}`,
    null,
  );
  await publish([...(await adminIds()), ...waiting.map((d) => d.userId)], "care", {});
  return { decided: waiting.length, status: approve ? "Approved" : "Returned" };
}

export async function remindTimesheets(me: UserDoc, staffIds: string[], week: string) {
  requireHr(me);
  const ctx = await context();
  if (!ctx.weeks.some((w) => w.week === week)) throw new UserFacingError("Choose a week shown.");
  const { db } = await collections();
  const at = new Date();
  const reminded: string[] = [];
  for (const id of staffIds) {
    const t = ctx.team.find((x) => x._id.toHexString() === id);
    if (!t) continue;
    const sheet = buildSheet(ctx, t, week);
    if (sheet.status === "Submitted" || sheet.status === "Approved") continue;
    const doc = await ensureDoc(db, t, week, ctx);
    await sheets(db).updateOne(
      { _id: doc._id },
      {
        $set: { remindedAt: at },
        $push: { history: { action: "Reminder sent", byName: me.name, at, note: "" } },
      },
    );
    await notify([t.userId], {
      title: `Please submit your timesheet for ${weekLabel(week)}`,
      body: `It was due ${shortDate(`${sheet.due}T00:00:00Z`)}. Your visits and leave are already filled in; check the days and submit.`,
      href: `/profile?tab=timesheet&week=${week}`,
    });
    reminded.push(t.name);
  }
  if (!reminded.length) throw new UserFacingError("Everyone selected has already submitted.");
  await audit(
    me,
    `Sent timesheet reminders for ${weekLabel(week)} to ${reminded.join(", ")}`,
    null,
  );
  await publish(await adminIds(), "care", {});
  return { reminded: reminded.length };
}

/* ------------------------------------------------------------------ clinician */

async function myTherapist(user: UserDoc) {
  if (user.role !== "therapist" || !user.therapistId) throw new AuthError(403);
  const { therapists } = await collections();
  const t = await therapists.findOne({ _id: user.therapistId });
  if (!t) throw new UserFacingError("No therapist profile is linked to this account.", 404);
  return t;
}

export async function myTimesheet(user: UserDoc, asked?: string | null): Promise<MyTimesheetDto> {
  const t = await myTherapist(user);
  const ctx = await context(t._id);
  const self = ctx.team[0] ?? t;
  const weeks = ctx.weeks.map((w) => {
    const s = buildSheet(ctx, self, w.week);
    return { ...w, status: s.status, overdue: s.overdue };
  });
  // Open on the oldest week that still needs them, else the current one.
  const needs = weeks.find(
    (w) => !w.current && (w.status === "Not submitted" || w.status === "Returned"),
  );
  const week =
    asked && ctx.weeks.some((w) => w.week === asked)
      ? asked
      : (needs?.week ?? weeks[weeks.length - 1]?.week ?? weekOf(ctx.on));
  return { today: ctx.on, week, weeks, sheet: buildSheet(ctx, self, week) };
}

async function editable(user: UserDoc, week: string) {
  const t = await myTherapist(user);
  const ctx = await context(t._id);
  if (!ctx.weeks.some((w) => w.week === week)) {
    throw new UserFacingError("That week can't be changed any more.");
  }
  const self = ctx.team[0] ?? t;
  const sheet = buildSheet(ctx, self, week);
  return { t: self, ctx, sheet };
}

export async function adjustDay(user: UserDoc, input: TimesheetAdjustInput) {
  const { t, ctx, sheet } = await editable(user, input.week);
  if (sheet.status === "Submitted") {
    throw new UserFacingError("This timesheet is with HR. Recall it first to change a day.");
  }
  if (sheet.status === "Approved") throw new UserFacingError("An approved timesheet can't change.");
  if (input.date < input.week || input.date > plusDays(input.week, 6)) {
    throw new UserFacingError("That day isn't in this week.");
  }
  if (input.date > ctx.on)
    throw new UserFacingError("Hours can be recorded once the day has passed.");
  const { db } = await collections();
  const doc = await ensureDoc(db, t, input.week, ctx);
  const rest = doc.adjustments.filter((a) => a.date !== input.date);
  const at = new Date();
  const day = sheet.days.find((d) => d.date === input.date);
  const back = input.minutes === null || input.minutes === day?.suggestedMinutes;
  await sheets(db).updateOne(
    { _id: doc._id },
    {
      $set: {
        adjustments: back
          ? rest
          : [...rest, { date: input.date, minutes: input.minutes ?? 0, reason: input.reason, at }],
      },
      $push: {
        history: {
          action: back
            ? `Put ${dayName(input.date)} back to ${hoursLabel(day?.suggestedMinutes ?? 0)}`
            : `Changed ${dayName(input.date)} to ${hoursLabel(input.minutes ?? 0)}`,
          byName: user.name,
          at,
          note: back ? "" : input.reason,
        },
      },
    },
  );
  await publish([user._id], "care", {});
  return { ok: true };
}

export async function submitTimesheet(user: UserDoc, week: string, comment: string) {
  const { t, ctx, sheet } = await editable(user, week);
  if (sheet.status === "Submitted") throw new UserFacingError("This timesheet is already with HR.");
  if (sheet.status === "Approved") throw new UserFacingError("This timesheet is already approved.");
  if (!sheet.open) {
    throw new UserFacingError(
      `This week can be submitted from ${shortDate(`${sheet.opensOn}T00:00:00Z`)}.`,
    );
  }
  const { db } = await collections();
  const doc = await ensureDoc(db, t, week, ctx);
  const at = new Date();
  await sheets(db).updateOne(
    { _id: doc._id },
    {
      $set: { status: "Submitted", submittedAt: at, comment },
      $push: {
        history: {
          action: sheet.status === "Returned" ? "Submitted again" : "Submitted",
          byName: user.name,
          at,
          note: comment,
        },
      },
    },
  );
  const flags = sheet.checks.length;
  await notify(await hrUserIds(), {
    title: `${t.name} submitted a timesheet`,
    body: `${weekLabel(week)}: ${hoursLabel(sheet.totals.worked)} worked${sheet.totals.overtime ? `, ${hoursLabel(sheet.totals.overtime)} over roster` : ""}. ${flags ? `${plural(flags, "check")} to look at.` : "No checks raised."}`,
    href: `/care/hr/timesheets?week=${week}`,
  });
  await audit(
    user,
    `Submitted timesheet ${doc.ref} for ${weekLabel(week)}, ${hoursLabel(sheet.totals.worked)}`,
    null,
  );
  await publish([...(await adminIds()), user._id], "care", {});
  return { ref: doc.ref };
}

export async function recallTimesheet(user: UserDoc, week: string) {
  const { t, sheet } = await editable(user, week);
  if (sheet.status !== "Submitted") {
    throw new UserFacingError("Only a timesheet waiting for approval can be recalled.");
  }
  const { db } = await collections();
  const at = new Date();
  await sheets(db).updateOne(
    { therapistId: t._id, week, status: "Submitted" },
    {
      $set: { status: "Draft", submittedAt: null },
      $push: { history: { action: "Recalled", byName: user.name, at, note: "" } },
    },
  );
  await audit(user, `Recalled timesheet ${sheet.ref ?? ""} for ${weekLabel(week)}`, null);
  await publish([...(await adminIds()), user._id], "care", {});
  return { ok: true };
}
