import "server-only";
import { ObjectId, type Db } from "mongodb";
import {
  balanceOf,
  leaveRules,
  type AwayDto,
  type LeaveBalanceDto,
  type LeaveBoardDto,
  type LeaveRequestDto,
  type LeaveRequestInput,
  type LeaveStatus,
  type LeaveType,
  type MyLeaveDto,
  type StaffBalanceDto,
} from "@/lib/live/leave";
import { addDays, isoWeekday, shortDate, slotLabel } from "@/lib/live/time";
import { AuthError } from "./auth";
import { collections } from "./db";
import { nextRef } from "./finance";
import { HR_ROLES, requireHr } from "./hr";
import { UserFacingError } from "./http";
import { adminIds, audit, notify, publish } from "./live";
import { caseloadVisits } from "./matching";
import type { TherapistDoc, UserDoc } from "./models";
import { photoUrl } from "./photos";
import { today } from "./staff";

/*
 * People and HR, leave requests. A clinician asks; Super Admin, a Clinical Lead or an Operations
 * Manager decides. Approval writes the days into the clinician's time off, so matching stops
 * offering them and booked visits on those days are flagged for reassignment, never moved.
 */

export interface LeaveRequestDoc {
  _id: ObjectId;
  ref: string;
  therapistId: ObjectId;
  userId: ObjectId;
  staffName: string;
  type: LeaveType;
  from: string;
  to: string;
  note: string;
  status: LeaveStatus;
  requestedAt: Date;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionNote: string;
}

const leaveCollection = (db: Db) => db.collection<LeaveRequestDoc>("leaveRequests");

const DAY_MS = 86_400_000;
const round1 = (n: number) => Math.round(n * 10) / 10;
const keyDate = (key: string) => new Date(`${key}T00:00:00Z`);
const keyOf = (d: Date) => d.toISOString().slice(0, 10);
const plusDays = (key: string, n: number) => keyOf(addDays(keyDate(key), n));
const startOf = (key: string) => new Date(`${key}T00:00:00+10:00`);
const overlaps = (a: { from: string; to: string }, b: { from: string; to: string }) =>
  a.from <= b.to && b.from <= a.to;

function eachDay(from: string, to: string) {
  const out: string[] = [];
  for (let k = from; k <= to; k = plusDays(k, 1)) out.push(k);
  return out;
}

/** The days in a range this clinician normally works, and the minutes they'd have worked. */
function workingDays(t: TherapistDoc, from: string, to: string) {
  const days: string[] = [];
  let minutes = 0;
  for (const k of eachDay(from, to)) {
    const w = t.weekly.find((x) => x.weekday === isoWeekday(keyDate(k)));
    if (!w) continue;
    days.push(k);
    minutes += w.end - w.start;
  }
  return { days, minutes };
}

function balance(
  t: TherapistDoc,
  kind: "annual" | "personal",
  on: string,
  pending: LeaveRequestDoc[],
): LeaveBalanceDto {
  const year = on.slice(0, 4);
  const inYear = (k: string) => k.startsWith(year);
  const perWeek = t.weekly.length;
  const base = kind === "annual" ? leaveRules.annualDays : leaveRules.personalDays;
  const entitlement = round1((base * perWeek) / 5);
  let taken = 0;
  let booked = 0;
  for (const off of t.timeOff ?? []) {
    if (balanceOf(off.reason) !== kind) continue;
    for (const k of workingDays(t, off.from, off.to).days.filter(inYear)) {
      if (k <= on) taken += 1;
      else booked += 1;
    }
  }
  const waiting = pending
    .filter((r) => r.therapistId.equals(t._id) && balanceOf(r.type) === kind)
    .reduce((n, r) => n + workingDays(t, r.from, r.to).days.filter(inYear).length, 0);
  return {
    entitlement,
    taken,
    booked,
    pending: waiting,
    remaining: round1(entitlement - taken - booked),
  };
}

type Context = {
  on: string;
  team: TherapistDoc[];
  requests: LeaveRequestDoc[];
  visits: { _id: ObjectId; therapistId: ObjectId; clientId: ObjectId; start: Date }[];
  patients: Map<string, string>;
};

async function context(): Promise<Context> {
  const { therapists, appointments, clients, db } = await collections();
  const on = today();
  const team = await therapists
    .find({ active: { $ne: false }, "staff.status": { $ne: "Archived" } })
    .toArray();
  const requests = await leaveCollection(db).find({}).sort({ requestedAt: -1 }).toArray();
  const visits = await appointments
    .find(
      { status: { $in: ["booked", "tentative"] }, start: { $gte: startOf(on) } },
      { projection: { therapistId: 1, clientId: 1, start: 1 } },
    )
    .toArray();
  const people = await clients
    .find(
      {
        _id: {
          $in: [...new Set(visits.map((v) => v.clientId.toHexString()))].map(
            (id) => new ObjectId(id),
          ),
        },
      },
      { projection: { name: 1 } },
    )
    .toArray();
  return {
    on,
    team,
    requests,
    visits,
    patients: new Map(people.map((p) => [p._id.toHexString(), p.name])),
  };
}

function visitsDuring(ctx: Context, therapistId: ObjectId, from: string, to: string) {
  const start = startOf(from).getTime();
  const end = startOf(to).getTime() + DAY_MS;
  return ctx.visits
    .filter(
      (v) =>
        v.therapistId.equals(therapistId) && v.start.getTime() >= start && v.start.getTime() < end,
    )
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

function toDto(r: LeaveRequestDoc, ctx: Context, t: TherapistDoc | undefined): LeaveRequestDto {
  const work = t ? workingDays(t, r.from, r.to) : { days: [], minutes: 0 };
  const visits = visitsDuring(ctx, r.therapistId, r.from, r.to);
  const teamAway: LeaveRequestDto["impact"]["teamAway"] = [];
  if (t) {
    for (const c of ctx.team) {
      if (c._id.equals(t._id) || c.discipline !== t.discipline || c.region !== t.region) continue;
      for (const off of c.timeOff ?? []) {
        if (overlaps(off, r))
          teamAway.push({ name: c.name, from: off.from, to: off.to, status: "Approved" });
      }
      for (const p of ctx.requests) {
        if (p.status === "Pending" && p.therapistId.equals(c._id) && overlaps(p, r)) {
          teamAway.push({ name: c.name, from: p.from, to: p.to, status: "Pending" });
        }
      }
    }
  }
  const kind = balanceOf(r.type);
  const pendingOthers = ctx.requests.filter((p) => p.status === "Pending" && !p._id.equals(r._id));
  const bal = t && kind ? balance(t, kind, ctx.on, pendingOthers) : null;
  const thisYear = work.days.filter((k) => k.startsWith(ctx.on.slice(0, 4))).length;
  const noticeDays = Math.round(
    (keyDate(r.from).getTime() -
      keyDate(keyOf(new Date(r.requestedAt.getTime() + 10 * 3_600_000))).getTime()) /
      DAY_MS,
  );
  return {
    id: r._id.toHexString(),
    ref: r.ref,
    staffId: r.therapistId.toHexString(),
    staffName: r.staffName,
    photoUrl: t ? photoUrl("therapist", t._id, t.photoAt) : null,
    discipline: t?.discipline ?? "",
    region: t?.region ?? "",
    type: r.type,
    from: r.from,
    to: r.to,
    note: r.note,
    status: r.status,
    requestedAt: r.requestedAt.toISOString(),
    decidedBy: r.decidedBy,
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    decisionNote: r.decisionNote,
    impact: {
      workingDays: work.days.length,
      hours: round1(work.minutes / 60),
      visits: visits.map((v) => ({
        id: v._id.toHexString(),
        when: slotLabel(v.start),
        patient: ctx.patients.get(v.clientId.toHexString()) ?? "Patient",
      })),
      caseloadVisits: t
        ? work.days
            .filter((k) => k >= ctx.on)
            .reduce((n, k) => n + caseloadVisits(t, keyDate(k)).length, 0)
        : 0,
      teamAway,
      shortNotice: r.type === "Annual leave" && noticeDays < leaveRules.noticeDays,
      balanceAfter:
        bal === null
          ? null
          : r.status === "Approved"
            ? bal.remaining
            : round1(bal.remaining - thisYear),
    },
  };
}

/** The HR view: requests to decide, who's away, and every clinician's balance. */
export async function leaveBoard(me: UserDoc): Promise<LeaveBoardDto> {
  requireHr(me);
  const ctx = await context();
  const { on, team, requests } = ctx;
  const byId = new Map(team.map((t) => [t._id.toHexString(), t]));
  const of = (r: LeaveRequestDoc) => byId.get(r.therapistId.toHexString());
  const pendingDocs = requests.filter((r) => r.status === "Pending");

  // The next three working weeks, from today.
  const days: string[] = [];
  for (let k = on; days.length < 15; k = plusDays(k, 1)) {
    if (isoWeekday(keyDate(k)) <= 5) days.push(k);
  }
  const last = days[days.length - 1] ?? on;
  const fortnight = plusDays(on, 13);

  const away: AwayDto[] = [];
  let visitsToCover = 0;
  let approvedDaysThisYear = 0;
  const awayToday = new Set<string>();
  const awaySoon = new Set<string>();
  for (const t of team) {
    const id = t._id.toHexString();
    const base = {
      staffId: id,
      staffName: t.name,
      photoUrl: photoUrl("therapist", t._id, t.photoAt),
      discipline: t.discipline,
      region: t.region,
    };
    for (const off of t.timeOff ?? []) {
      approvedDaysThisYear += workingDays(t, off.from, off.to).days.filter((k) =>
        k.startsWith(on.slice(0, 4)),
      ).length;
      if (off.to < on) continue;
      visitsToCover += visitsDuring(ctx, t._id, off.from < on ? on : off.from, off.to).length;
      if (off.from <= on && on <= off.to) awayToday.add(id);
      if (overlaps(off, { from: on, to: fortnight })) awaySoon.add(id);
      if (overlaps(off, { from: on, to: last })) {
        away.push({
          ...base,
          key: `${id}:${off.id}`,
          from: off.from,
          to: off.to,
          reason: off.reason,
          status: "Approved",
        });
      }
    }
    for (const r of pendingDocs) {
      if (r.therapistId.equals(t._id) && overlaps(r, { from: on, to: last })) {
        away.push({
          ...base,
          key: `${id}:${r._id.toHexString()}`,
          from: r.from,
          to: r.to,
          reason: r.type,
          status: "Pending",
        });
      }
    }
  }

  const since = Date.now() - 90 * DAY_MS;
  const decided = requests.filter(
    (r) => r.decidedAt && (r.status === "Approved" || r.status === "Declined"),
  );
  const recent = decided.filter((r) => (r.decidedAt?.getTime() ?? 0) >= since);
  const avgDecisionHours = recent.length
    ? round1(
        recent.reduce(
          (n, r) => n + ((r.decidedAt?.getTime() ?? 0) - r.requestedAt.getTime()) / 3_600_000,
          0,
        ) / recent.length,
      )
    : null;

  const balances: StaffBalanceDto[] = team
    .map((t) => ({
      staffId: t._id.toHexString(),
      staffName: t.name,
      photoUrl: photoUrl("therapist", t._id, t.photoAt),
      discipline: t.discipline,
      region: t.region,
      daysPerWeek: t.weekly.length,
      annual: balance(t, "annual", on, pendingDocs),
      personal: balance(t, "personal", on, pendingDocs),
    }))
    .sort((a, b) => a.staffName.localeCompare(b.staffName));

  return {
    today: on,
    days,
    summary: {
      pending: pendingDocs.length,
      awayToday: awayToday.size,
      awayNext14: awaySoon.size,
      visitsToCover,
      approvedDaysThisYear,
      avgDecisionHours,
    },
    pending: pendingDocs
      .map((r) => toDto(r, ctx, of(r)))
      .sort((a, b) => a.from.localeCompare(b.from)),
    history: requests
      .filter((r) => r.status !== "Pending")
      .slice(0, 40)
      .map((r) => toDto(r, ctx, of(r))),
    away: away.sort(
      (a, b) => a.from.localeCompare(b.from) || a.staffName.localeCompare(b.staffName),
    ),
    balances,
  };
}

async function myTherapist(user: UserDoc) {
  if (user.role !== "therapist" || !user.therapistId) throw new AuthError(403);
  const { therapists } = await collections();
  const t = await therapists.findOne({ _id: user.therapistId });
  if (!t) throw new UserFacingError("No therapist profile is linked to this account.", 404);
  return t;
}

/** The clinician's own balances and requests. */
export async function myLeave(user: UserDoc): Promise<MyLeaveDto> {
  const t = await myTherapist(user);
  const ctx = await context();
  const mine = ctx.requests.filter((r) => r.therapistId.equals(t._id));
  const pending = mine.filter((r) => r.status === "Pending");
  const self = ctx.team.find((x) => x._id.equals(t._id)) ?? t;
  return {
    today: ctx.on,
    daysPerWeek: t.weekly.length,
    annual: balance(self, "annual", ctx.on, pending),
    personal: balance(self, "personal", ctx.on, pending),
    // Colleagues' leave isn't the clinician's business: their view leaves it out.
    requests: mine.map((r) => {
      const dto = toDto(r, ctx, self);
      return { ...dto, impact: { ...dto.impact, teamAway: [] } };
    }),
  };
}

async function hrUserIds() {
  const { users } = await collections();
  const rows = await users
    .find(
      { role: "admin", disabled: { $ne: true }, staffRoles: { $in: HR_ROLES } },
      { projection: { _id: 1 } },
    )
    .toArray();
  return rows.map((u) => u._id);
}

const rangeLabel = (from: string, to: string) =>
  from === to
    ? shortDate(`${from}T00:00:00Z`)
    : `${shortDate(`${from}T00:00:00Z`)} to ${shortDate(`${to}T00:00:00Z`)}`;

export async function requestLeave(user: UserDoc, input: LeaveRequestInput) {
  const t = await myTherapist(user);
  const { db } = await collections();
  const on = today();
  const earliest = input.type === "Personal leave" ? plusDays(on, -leaveRules.backdateDays) : on;
  if (input.from < earliest) {
    throw new UserFacingError(
      input.type === "Personal leave"
        ? `Personal leave can go back up to ${leaveRules.backdateDays} days.`
        : "Leave can't start in the past. Choose today or a later day.",
    );
  }
  if (input.to > plusDays(on, 365))
    throw new UserFacingError("Leave can be requested up to a year ahead.");
  const work = workingDays(t, input.from, input.to);
  if (work.days.length === 0) {
    throw new UserFacingError("You don't work on any of those days, so no leave is needed.");
  }
  const clash =
    (t.timeOff ?? []).find((o) => overlaps(o, input)) ??
    (await leaveCollection(db).findOne({
      therapistId: t._id,
      status: "Pending",
      from: { $lte: input.to },
      to: { $gte: input.from },
    }));
  if (clash) {
    throw new UserFacingError(
      `You already have leave on some of those days (${rangeLabel(clash.from, clash.to)}).`,
    );
  }
  const doc: LeaveRequestDoc = {
    _id: new ObjectId(),
    ref: await nextRef(db, "leave", "LV", 4),
    therapistId: t._id,
    userId: user._id,
    staffName: t.name,
    type: input.type,
    from: input.from,
    to: input.to,
    note: input.note,
    status: "Pending",
    requestedAt: new Date(),
    decidedBy: null,
    decidedAt: null,
    decisionNote: "",
  };
  await leaveCollection(db).insertOne(doc);
  const hr = await hrUserIds();
  await notify(hr, {
    title: `${t.name} requested ${input.type.toLowerCase()}`,
    body: `${rangeLabel(input.from, input.to)}, ${work.days.length} working day${work.days.length === 1 ? "" : "s"}. Review the impact and approve or decline.`,
    href: "/care/hr/leave",
  });
  await audit(
    user,
    `Requested ${input.type.toLowerCase()} ${doc.ref}, ${input.from} to ${input.to}`,
    null,
  );
  await publish([...(await adminIds()), user._id], "care", {});
  return { ref: doc.ref };
}

export async function cancelLeave(user: UserDoc, id: string) {
  const t = await myTherapist(user);
  if (!ObjectId.isValid(id)) throw new UserFacingError("Leave request not found.", 404);
  const { db } = await collections();
  const r = await leaveCollection(db).findOne({ _id: new ObjectId(id), therapistId: t._id });
  if (!r) throw new UserFacingError("Leave request not found.", 404);
  if (r.status !== "Pending") {
    throw new UserFacingError("Only a request still waiting for a decision can be withdrawn.");
  }
  await leaveCollection(db).updateOne(
    { _id: r._id },
    {
      $set: {
        status: "Cancelled",
        decidedBy: user.name,
        decidedAt: new Date(),
        decisionNote: "Withdrawn",
      },
    },
  );
  await audit(user, `Withdrew leave request ${r.ref}`, null);
  await publish([...(await adminIds()), user._id], "care", {});
  return { ref: r.ref };
}

export async function decideLeave(
  me: UserDoc,
  input: { id: string; decision: "Approve" | "Decline"; note: string },
) {
  requireHr(me);
  if (!ObjectId.isValid(input.id)) throw new UserFacingError("Leave request not found.", 404);
  const { db, therapists, appointments } = await collections();
  const r = await leaveCollection(db).findOne({ _id: new ObjectId(input.id) });
  if (!r) throw new UserFacingError("Leave request not found.", 404);
  if (r.status !== "Pending") {
    throw new UserFacingError(`This request is already ${r.status.toLowerCase()}.`);
  }
  const approve = input.decision === "Approve";
  const decidedAt = new Date();
  const range = rangeLabel(r.from, r.to);
  let affected = 0;
  if (approve) {
    await therapists.updateOne(
      { _id: r.therapistId },
      {
        $push: { timeOff: { id: r._id.toHexString(), from: r.from, to: r.to, reason: r.type } },
        $set: { availabilityUpdatedAt: decidedAt },
      },
    );
    affected = await appointments.countDocuments({
      therapistId: r.therapistId,
      status: { $in: ["booked", "tentative"] },
      start: { $gte: startOf(r.from), $lt: new Date(startOf(r.to).getTime() + DAY_MS) },
    });
  }
  await leaveCollection(db).updateOne(
    { _id: r._id },
    {
      $set: {
        status: approve ? "Approved" : "Declined",
        decidedBy: me.name,
        decidedAt,
        decisionNote: input.note,
      },
    },
  );
  await notify([r.userId], {
    title: approve
      ? `Your ${r.type.toLowerCase()} is approved`
      : `Your ${r.type.toLowerCase()} request was declined`,
    body: approve
      ? `${range}. ${affected ? `The care team will move the ${affected} visit${affected === 1 ? "" : "s"} booked on those days.` : "No visits are booked on those days."}${input.note ? ` ${me.name}: ${input.note}` : ""}`
      : `${range}. ${me.name}: ${input.note}`,
    href: "/profile?tab=leave",
  });
  await audit(
    me,
    approve
      ? `Approved ${r.type.toLowerCase()} ${r.ref} for ${r.staffName}, ${r.from} to ${r.to}${affected ? `: ${affected} visits flagged for reassignment` : ""}`
      : `Declined ${r.type.toLowerCase()} ${r.ref} for ${r.staffName}: ${input.note}`,
    null,
  );
  await publish([...(await adminIds()), r.userId], "care", {});
  return { ref: r.ref, status: approve ? "Approved" : "Declined", affected };
}
