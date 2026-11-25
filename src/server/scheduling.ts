import "server-only";
import { can } from "./permissions";
import { createHash, randomBytes } from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import { z } from "zod";
import { supportInfo, type Frequency } from "@/lib/live/catalogue";
import { needsRiskReview } from "@/lib/live/referral";
import {
  assignmentModes,
  type AppointmentPurpose,
  type BookingStatus,
  type ReminderStatus,
  type ScheduleBoardDto,
  type ScheduleEventDto,
} from "@/lib/live/scheduling";
import { brisbaneDay, slotLabel } from "@/lib/live/time";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { adminIds, audit, notify, publish } from "./live";
import { hash, isAway, isSlotFree } from "./matching";
import type { AppointmentDoc, ClientDoc, ReferralDoc, UserDoc } from "./models";
import { orgSettings, setAssignmentMode } from "./settings";
import { ensureStaff, staffBlocks } from "./staff";
import { caseloadVisits } from "./matching";
import { previewSeries, recordOutcome } from "./visits";

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const HOUR = 3_600_000;

/** APT-000001 for every visit that doesn't have one yet, in the order they were made. */
async function ensureRefs(db: Db) {
  const appointments = db.collection<AppointmentDoc>("appointments");
  const missing = await appointments
    .find({ ref: { $exists: false } }, { projection: { _id: 1 } })
    .sort({ createdAt: 1, start: 1 })
    .toArray();
  if (!missing.length) return;
  const counter = await db
    .collection<{ _id: string; seq: number }>("counters")
    .findOneAndUpdate(
      { _id: "appointment" },
      { $inc: { seq: missing.length } },
      { upsert: true, returnDocument: "after" },
    );
  let seq = (counter?.seq ?? missing.length) - missing.length;
  for (const a of missing) {
    seq += 1;
    await appointments.updateOne(
      { _id: a._id, ref: { $exists: false } },
      { $set: { ref: `APT-${String(seq).padStart(6, "0")}` } },
    );
  }
}

function bookingStatus(a: AppointmentDoc): BookingStatus {
  switch (a.status) {
    case "tentative":
      return "Held";
    case "booked":
      return a.checkIn && !a.checkOut ? "In Progress" : "Confirmed";
    case "completed":
      return "Completed";
    case "aborted":
      return "Unable to Complete";
    case "no-show":
      return "No-show";
    case "rescheduled":
      return "Rescheduled";
    default:
      return "Cancelled";
  }
}

const live = (a: AppointmentDoc) => a.status === "booked" || a.status === "tentative";

function reminders(a: AppointmentDoc, client: ClientDoc | undefined, now: number) {
  if (a.status !== "booked") return [];
  const mode = client?.profile?.contactMode || "Email";
  const channel = mode === "Phone" ? "SMS" : mode;
  // With no contacts on file, reminders go to the participant's own phone or email.
  const contacts = client?.contacts ?? [];
  const allowed =
    contacts.length === 0 || contacts.some((c) => c.contactAllowed && c.state !== "Revoked");
  const confirmedAt = (a.createdAt ?? a.start).getTime();
  const triggers: [string, number][] = [
    ["Booking confirmed", confirmedAt],
    ["48 hours before", a.start.getTime() - 48 * HOUR],
    ["24 hours before", a.start.getTime() - 24 * HOUR],
    ["2 hours before", a.start.getTime() - 2 * HOUR],
  ];
  return triggers
    .filter(([, due]) => due >= confirmedAt - 1000)
    .map(([trigger, due]) => {
      const resent = a.resent?.filter((r) => r.trigger === trigger).at(-1);
      let status: ReminderStatus;
      let note = "";
      if (!allowed) {
        status = "Suppressed";
        note = "No contact may be messaged";
      } else if (due > now) {
        status = "Queued";
      } else if (resent) {
        status = "Delivered";
        note = `Resent by ${resent.byName}`;
      } else if (hash(`${a.ref}:${trigger}`) < 0.12) {
        status = "Failed";
        note =
          channel === "SMS" ? "Number not reachable (simulated)" : "Mailbox bounced (simulated)";
      } else {
        status = due < now - 2 * HOUR ? "Delivered" : "Sent";
      }
      return { trigger, channel, due: new Date(due).toISOString(), status, note };
    });
}

/** The scheduling board for a period: every visit with its flags, and what still needs booking. */
/** Module 06 contract: booking readiness and its blockers for each service still to book. */
async function withReadiness(list: ScheduleBoardDto["unscheduled"]) {
  if (!list.length) return list;
  const { readinessForClient } = await import("./funding");
  const byClient = new Map<string, Awaited<ReturnType<typeof readinessForClient>>>();
  for (const id of new Set(list.map((u) => u.clientId))) {
    byClient.set(id, await readinessForClient(new ObjectId(id)));
  }
  return list.map((u) => {
    const r = byClient.get(u.clientId)?.find((x) => x.needId === u.needId);
    return r
      ? {
          ...u,
          readiness: r.booking,
          blockers: r.gates
            .filter((g) => g.severity !== "ok")
            .map((g) => `${g.label}: ${g.status} (${g.owner})`),
        }
      : u;
  });
}

export async function scheduleBoard(from: Date, to: Date): Promise<ScheduleBoardDto> {
  const db = await collections();
  await ensureRefs(db.db);
  const [visits, clients, rawTeam, refs, assigns, { assignmentMode }, fundingPlans] =
    await Promise.all([
      db.appointments
        .find({ start: { $gte: from, $lt: to } })
        .sort({ start: 1 })
        .toArray(),
      // Consent history is the largest part of each record and the board never reads it.
      db.clients.find({}, { projection: { consents: 0, fundingDetails: 0 } }).toArray(),
      db.therapists.find().toArray(),
      db.referrals
        .find(
          { clientId: { $ne: null } },
          { projection: { clientId: 1, data: 1, fundingReview: 1 } },
        )
        .toArray(),
      db.assignments.find().toArray(),
      orgSettings(),
      // Module 06: plan end dates and funding periods, for "beyond the plan" warnings (AT-34).
      db.fundingPlans
        .find(
          { status: { $ne: "Superseded" } },
          { projection: { clientId: 1, end: 1, periods: 1, ref: 1 } },
        )
        .toArray(),
    ]);
  const planEndOf = (clientId: ObjectId) =>
    fundingPlans
      .filter((p) => p.clientId?.equals(clientId) && p.end)
      .sort((a, b) => b.end.localeCompare(a.end))[0] ?? null;
  const team = await Promise.all(rawTeam.map((t) => ensureStaff(db.db, t)));
  const shown = visits.filter((v) => !(v.status === "cancelled" && !v.cancellation));
  const clientById = new Map(clients.map((c) => [c._id.toHexString(), c]));
  const teamById = new Map(team.map((t) => [t._id.toHexString(), t]));
  const refFor = (c: ClientDoc | undefined) =>
    c ? refs.find((r) => r.clientId?.equals(c._id)) : undefined;
  const fundingOf = (r: Pick<ReferralDoc, "fundingReview"> | undefined) =>
    !r?.fundingReview
      ? ("Not reviewed" as const)
      : r.fundingReview.verification === "Exception"
        ? ("Exception" as const)
        : ("Verified" as const);

  // The first visit for each service decides initial assessment versus continuation.
  const needIds = [...new Set(shown.flatMap((v) => (v.needId ? [v.needId] : [])))];
  const firsts = await db.appointments
    .aggregate<{ _id: string; first: Date }>([
      { $match: { needId: { $in: needIds }, status: { $nin: ["cancelled", "late-cancelled"] } } },
      { $group: { _id: "$needId", first: { $min: "$start" } } },
    ])
    .toArray();
  const firstOf = new Map(firsts.map((f) => [f._id, f.first.getTime()]));
  const seriesOf = new Map<string, AppointmentDoc[]>();
  for (const v of shown) {
    if (!v.seriesId || ["cancelled", "late-cancelled", "rescheduled"].includes(v.status)) continue;
    const k = v.seriesId.toHexString();
    seriesOf.set(k, [...(seriesOf.get(k) ?? []), v]);
  }
  const now = Date.now();

  const events: ScheduleEventDto[] = shown.map((v) => {
    const c = clientById.get(v.clientId.toHexString());
    const t = teamById.get(v.therapistId.toHexString());
    const need = c?.needs.find((n) => n.id === v.needId);
    const support = need?.support ?? v.discipline;
    const referral = refFor(c);
    const purpose: AppointmentPurpose =
      v.purpose ??
      (v.modality === "Telehealth"
        ? "Telehealth Consultation"
        : need && supportInfo(need.support).kind === "assessment"
          ? (firstOf.get(need.id) ?? v.start.getTime()) < v.start.getTime()
            ? "Assessment Continuation"
            : "Initial Assessment"
          : "Treatment Session");
    const flags: ScheduleEventDto["flags"] = [];
    if (live(v)) {
      const clash = shown.find(
        (o) =>
          o !== v &&
          live(o) &&
          o.therapistId.equals(v.therapistId) &&
          o.start < v.end &&
          v.start < o.end,
      );
      if (clash)
        flags.push({ kind: "conflict", label: `Overlaps ${clash.ref ?? "another visit"}` });
      if (t && isAway(t, brisbaneDay(v.start))) {
        flags.push({ kind: "leave", label: `${t.name} is on leave: needs reassignment` });
      }
      const blocks =
        t && v.start.getTime() > now ? staffBlocks(t, need?.support ?? null, null) : [];
      if (blocks.length)
        flags.push({ kind: "blocked", label: `Clinician can't deliver: ${blocks[0]}` });
      if (c?.precautions) flags.push({ kind: "risk", label: `Precaution: ${c.precautions}` });
      const plan = planEndOf(v.clientId);
      const day = new Date(v.start.getTime() + 10 * HOUR).toISOString().slice(0, 10);
      if (plan && day > plan.end) {
        flags.push({
          kind: "funding",
          label: `After the NDIS plan ends (${plan.ref} ends ${plan.end}): check the new plan`,
        });
      } else if (
        plan?.periods.some((p) => day > p.end) &&
        !plan.periods.some((p) => day >= p.start && day <= p.end)
      ) {
        flags.push({
          kind: "funding",
          label: "Outside the plan's funding periods: check the next period",
        });
      }
      const funding = fundingOf(referral);
      if (funding !== "Verified") {
        flags.push({
          kind: "funding",
          label:
            funding === "Exception"
              ? "Funding exception: not confirmed funded"
              : "Funding not reviewed",
        });
      }
    }
    const openChange = (v.changeRequests ?? []).find((r) => !r.resolved);
    if (openChange) flags.push({ kind: "change", label: `Change requested: ${openChange.note}` });

    const accepted = assigns.find((a) => a.appointmentId.equals(v._id));
    const history: ScheduleEventDto["history"] = [
      {
        at: (v.createdAt ?? v.start).toISOString(),
        label:
          v.seriesId && !v.seriesId.equals(v._id)
            ? "Booked as part of the series"
            : "Held and offered to the clinician",
        by: "Scheduling",
      },
    ];
    if (v.overrideReason) {
      history.push({
        at: (v.createdAt ?? v.start).toISOString(),
        label: `Chosen over the suggestion: ${v.overrideReason}`,
        by: "Scheduling",
      });
    }
    if (accepted?.respondedAt) {
      history.push({
        at: accepted.respondedAt.toISOString(),
        label:
          accepted.status === "accepted"
            ? "Clinician accepted; visit confirmed"
            : `Clinician ${accepted.status}${accepted.declineReason ? `: ${accepted.declineReason}` : ""}`,
        by: t?.name ?? "Clinician",
      });
    }
    if (v.replaces)
      history.push({
        at: (v.createdAt ?? v.start).toISOString(),
        label: "Rebooked in place of a cancelled visit",
        by: "Scheduling",
      });
    if (v.moved) {
      history.push({
        at: v.moved.at.toISOString(),
        label: `Moved from ${slotLabel(v.moved.from)}: ${v.moved.reason}. Notified ${v.moved.notified}`,
        by: v.moved.byName,
      });
    }
    if (v.confirmedByPatient)
      history.push({
        at: v.confirmedByPatient.toISOString(),
        label: "Participant confirmed",
        by: c?.name ?? "Participant",
      });
    for (const r of v.changeRequests ?? []) {
      history.push({
        at: r.at.toISOString(),
        label: `Participant asked for a change: ${r.note}${r.resolved ? " (resolved)" : ""}`,
        by: "Participant link",
      });
    }
    if (v.checkIn)
      history.push({
        at: v.checkIn.at.toISOString(),
        label: `Checked in${v.checkIn.safe ? ", safe to proceed" : ", safety concern"}`,
        by: v.checkIn.byName,
      });
    if (v.checkOut)
      history.push({
        at: v.checkOut.at.toISOString(),
        label: `Checked out after ${v.checkOut.minutes} min`,
        by: v.checkOut.byName,
      });
    if (v.aborted)
      history.push({
        at: v.aborted.at.toISOString(),
        label: `Unable to complete: ${v.aborted.reason}`,
        by: v.aborted.byName,
      });
    if (v.cancellation)
      history.push({
        at: v.cancellation.at.toISOString(),
        label: `${v.status === "no-show" ? "Did not attend" : "Cancelled"}: ${v.cancellation.reason}${v.cancellation.chargeable ? " (may be charged)" : ""}`,
        by: v.cancellation.actorName,
      });
    if (v.noShow)
      history.push({
        at: v.noShow.at.toISOString(),
        label: `Contact attempts: ${v.noShow.attempts}${v.noShow.concern ? "; safety concern raised" : ""}`,
        by: v.noShow.byName,
      });
    for (const r of v.resent ?? [])
      history.push({
        at: r.at.toISOString(),
        label: `Reminder resent: ${r.trigger}`,
        by: r.byName,
      });
    history.sort((a, b) => a.at.localeCompare(b.at));

    const series = v.seriesId ? seriesOf.get(v.seriesId.toHexString()) : undefined;
    return {
      id: v._id.toHexString(),
      ref: v.ref ?? "APT-…",
      start: v.start.toISOString(),
      end: v.end.toISOString(),
      status: bookingStatus(v),
      rawStatus: v.status,
      confirmation: openChange
        ? "Change requested"
        : v.confirmedByPatient
          ? "Confirmed by participant"
          : "Awaiting participant",
      purpose,
      clientId: v.clientId.toHexString(),
      patient: c?.name ?? "Patient",
      therapistId: v.therapistId.toHexString(),
      therapist: t?.name ?? "Clinician",
      discipline: v.discipline,
      support,
      location:
        v.site?.location ?? need?.location ?? (v.modality === "Telehealth" ? "Telehealth" : "Home"),
      modality: v.modality ?? "In person",
      series: (() => {
        const ordered = series
          ? [...series].sort((x, y) => x.start.getTime() - y.start.getTime())
          : [];
        const index = ordered.indexOf(v) + 1;
        return ordered.length > 1 && index > 0 ? { index, total: ordered.length } : null;
      })(),
      flags,
      site: v.site ?? null,
      history,
      reminders: reminders(v, c, now),
      noShow: v.noShow ? { attempts: v.noShow.attempts, concern: v.noShow.concern } : null,
      changeRequests: (v.changeRequests ?? []).map((r) => ({ ...r, at: r.at.toISOString() })),
    };
  });

  const unscheduled: ScheduleBoardDto["unscheduled"] = [];
  const pending: ScheduleBoardDto["pending"] = [];
  for (const c of clients) {
    if (c.discharged) continue;
    const referral = refFor(c);
    for (const n of c.needs) {
      if (n.status === "needs-therapist") {
        unscheduled.push({
          clientId: c._id.toHexString(),
          needId: n.id,
          patient: c.name,
          support: n.support,
          discipline: n.discipline,
          location: n.location ?? "Home",
          frequency: n.frequency,
          since: c.createdAt.toISOString(),
          risk: Boolean(c.precautions) || Boolean(referral && needsRiskReview(referral.data)),
          funding: fundingOf(referral),
        });
      } else if (n.status === "waiting") {
        const a = assigns.find((x) => x.needId === n.id && x.status === "pending");
        pending.push({
          clientId: c._id.toHexString(),
          patient: c.name,
          support: n.support,
          therapist: teamById.get(n.therapistId?.toHexString() ?? "")?.name ?? "Clinician",
          since: (a?.createdAt ?? c.createdAt).toISOString(),
        });
      }
    }
  }

  // Midnight in Brisbane, as a UTC time.
  const today = brisbaneDay(new Date()).getTime() - 10 * HOUR;
  const inDays = (e: ScheduleEventDto, days: number) => {
    const s = new Date(e.start).getTime();
    return s >= today && s < today + days * 86_400_000;
  };
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    events,
    unscheduled: await withReadiness(unscheduled),
    pending,
    therapists: team
      .filter((t) => t.active !== false)
      .map((t) => ({
        id: t._id.toHexString(),
        name: t.name,
        discipline: t.discipline,
        region: t.region,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    counts: {
      today: events.filter((e) => inDays(e, 1) && e.status !== "Cancelled").length,
      week: events.filter((e) => inDays(e, 7) && e.status !== "Cancelled").length,
      unscheduled: unscheduled.length,
      pending: pending.length,
      exceptions: events.filter((e) =>
        e.flags.some((f) => f.kind !== "risk" && f.kind !== "funding"),
      ).length,
      cancelledWeek: events.filter((e) => inDays(e, 7) && e.status === "Cancelled").length,
      remindersFailed: events.reduce(
        (n, e) => n + e.reminders.filter((r) => r.status === "Failed").length,
        0,
      ),
    },
    mode: assignmentMode,
  };
}

export const scheduleActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("no-show"),
    attempts: z.string().trim().min(3, "Record the attempts to reach them").max(500),
    concern: z.boolean(),
  }),
  z.object({ type: z.literal("patient-link") }),
  z.object({ type: z.literal("resend"), trigger: z.string().max(40) }),
  z.object({ type: z.literal("resolve-change"), index: z.number().int().min(0) }),
  z.object({
    type: z.literal("move"),
    start: z.iso.datetime(),
    /** The start the person saw: if the booking changed meanwhile, nothing is overwritten (AT-31). */
    expectedStart: z.iso.datetime(),
    reason: z.string().trim().min(3, "Give a reason for the move").max(300),
  }),
]);

/** Scheduling actions on one visit; cancel, reschedule and check-in use the visit routes. */
export async function scheduleAction(
  admin: UserDoc,
  id: ObjectId,
  action: z.infer<typeof scheduleActionSchema>,
) {
  const { appointments } = await collections();
  const visit = await appointments.findOne({ _id: id });
  if (!visit) throw new UserFacingError("Appointment not found.", 404);
  const result: { link?: string } = {};
  switch (action.type) {
    case "no-show": {
      await recordOutcome(admin, id, { outcome: "no-show" });
      await appointments.updateOne(
        { _id: id },
        {
          $set: {
            noShow: {
              attempts: action.attempts,
              concern: action.concern,
              byName: admin.name,
              at: new Date(),
            },
          },
        },
      );
      await audit(
        admin,
        `${visit.ref ?? "Visit"} did not attend. Attempts: ${action.attempts}${action.concern ? "; safety concern raised" : ""}`,
        visit.clientId,
      );
      break;
    }
    case "patient-link": {
      if (visit.status !== "booked" && visit.status !== "tentative") {
        throw new UserFacingError("Links are only for upcoming visits.", 409);
      }
      const token = randomBytes(24).toString("base64url");
      await appointments.updateOne(
        { _id: id },
        {
          $set: {
            publicLink: {
              hash: sha256(token),
              expiresAt: new Date(
                Math.min(visit.start.getTime() + 2 * HOUR, Date.now() + 14 * 86_400_000),
              ),
            },
          },
        },
      );
      await audit(
        admin,
        `Created a participant link for ${visit.ref ?? "a visit"}`,
        visit.clientId,
      );
      result.link = `/appointment/${token}`;
      break;
    }
    case "resend": {
      await appointments.updateOne(
        { _id: id },
        { $push: { resent: { trigger: action.trigger, at: new Date(), byName: admin.name } } },
      );
      await audit(
        admin,
        `Resent the "${action.trigger}" reminder for ${visit.ref ?? "a visit"} (simulated)`,
        visit.clientId,
      );
      break;
    }
    case "move": {
      if (visit.status !== "booked" && visit.status !== "tentative") {
        throw new UserFacingError("Only an upcoming visit can be moved.", 409);
      }
      if (visit.start.toISOString() !== new Date(action.expectedStart).toISOString()) {
        throw new UserFacingError(
          `Someone changed ${visit.ref ?? "this visit"} a moment ago (now ${slotLabel(visit.start)}). Refresh and try again.`,
          409,
        );
      }
      const { therapists, clients } = await collections();
      const t = await therapists.findOne({ _id: visit.therapistId });
      const c = await clients.findOne({ _id: visit.clientId });
      if (!t || !c) throw new UserFacingError("Appointment not found.", 404);
      const start = new Date(action.start);
      const minutes = (visit.end.getTime() - visit.start.getTime()) / 60_000;
      const held = (
        await appointments
          .find({ therapistId: t._id, holdsSlot: true, start: { $gte: new Date() } })
          .toArray()
      ).filter((a) => !a._id.equals(visit._id));
      if (!isSlotFree(t, start, held)) {
        throw new UserFacingError(
          `${t.name} isn't free then (working hours, leave, travel buffers or another visit). Choose another time.`,
          409,
        );
      }
      const blocks = staffBlocks(
        t,
        c.needs.find((n) => n.id === visit.needId)?.support ?? null,
        null,
      );
      if (blocks.length)
        throw new UserFacingError(`${t.name} can't take visits now: ${blocks[0]}.`, 409);
      const newId = new ObjectId();
      const updated = await appointments.updateOne(
        { _id: visit._id, start: visit.start, status: visit.status },
        { $set: { status: "rescheduled", holdsSlot: false } },
      );
      if (updated.modifiedCount !== 1) {
        throw new UserFacingError(
          "Someone changed this visit a moment ago. Refresh and try again.",
          409,
        );
      }
      const {
        _id: _old,
        ref: _ref,
        publicLink: _link,
        resent: _resent,
        changeRequests: _cr,
        ...rest
      } = visit;
      void _old;
      void _ref;
      void _link;
      void _resent;
      void _cr;
      await appointments.insertOne({
        ...rest,
        _id: newId,
        start,
        end: new Date(start.getTime() + minutes * 60_000),
        holdsSlot: true,
        replaces: visit._id,
        confirmedByPatient: null,
        moved: {
          from: visit.start,
          reason: action.reason,
          byName: admin.name,
          at: new Date(),
          notified: `${c.name.split(" ")[0]} and ${t.name.split(" ")[0]}`,
        },
        createdAt: new Date(),
      });
      await notify([c.userId, t.userId], {
        title: `Visit moved: ${slotLabel(start)}`,
        body: `${visit.discipline} moved from ${slotLabel(visit.start)} to ${slotLabel(start)}. ${action.reason}`,
        href: "/mobile/patient",
      });
      await audit(
        admin,
        `Moved ${visit.ref ?? "a visit"} from ${slotLabel(visit.start)} to ${slotLabel(start)}: ${action.reason} (participant and clinician notified)`,
        visit.clientId,
      );
      break;
    }
    case "resolve-change": {
      await appointments.updateOne(
        { _id: id },
        { $set: { [`changeRequests.${action.index}.resolved`]: true } },
      );
      await audit(
        admin,
        `Resolved a participant change request for ${visit.ref ?? "a visit"}`,
        visit.clientId,
      );
      break;
    }
  }
  await publish(await adminIds(), "care", { clientId: visit.clientId.toHexString() });
  return result;
}

export const previewSchema = z.object({
  therapistId: z.string(),
  start: z.iso.datetime(),
  frequency: z.enum(["Assessment", "Weekly", "Fortnightly", "Monthly", "Other"]),
  custom: z
    .object({ visits: z.number().int().min(1).max(26), everyDays: z.number().int().min(7).max(56) })
    .nullable()
    .default(null),
});

/** Every occurrence a series would book, with collisions flagged for a person to place (AT-12). */
export async function seriesPreview(input: z.infer<typeof previewSchema>) {
  const { therapists, appointments } = await collections();
  if (!ObjectId.isValid(input.therapistId)) throw new UserFacingError("Clinician not found.", 404);
  const t = await therapists.findOne({ _id: new ObjectId(input.therapistId) });
  if (!t) throw new UserFacingError("Clinician not found.", 404);
  const held = await appointments
    .find({ therapistId: t._id, holdsSlot: true, start: { $gte: new Date() } })
    .toArray();
  return previewSeries(
    t,
    new Date(input.start),
    input.frequency as Frequency,
    held,
    input.custom,
  ).map((o) => ({
    ...o,
    away: o.start ? isAway(t, brisbaneDay(new Date(o.start))) : false,
  }));
}

export const modeSchema = z.object({ mode: z.enum(assignmentModes) });
export { setAssignmentMode };

/* -------------------------------------------------- participant appointment link */

async function byLink(token: string) {
  const { appointments } = await collections();
  const visit = await appointments.findOne({ "publicLink.hash": sha256(token) });
  if (!visit || !visit.publicLink || visit.publicLink.expiresAt < new Date()) {
    throw new UserFacingError(
      "This appointment link isn't valid any more. Ask your care team for a new one.",
      404,
    );
  }
  return visit;
}

/** What the participant sees without an account: the safe summary only (AT-10). */
export async function publicAppointment(token: string) {
  const { therapists, clients } = await collections();
  const v = await byLink(token);
  const [t, c] = await Promise.all([
    therapists.findOne({ _id: v.therapistId }, { projection: { name: 1, discipline: 1 } }),
    clients.findOne({ _id: v.clientId }, { projection: { name: 1, needs: 1 } }),
  ]);
  const need = c?.needs.find((n) => n.id === v.needId);
  return {
    ref: v.ref ?? "",
    when: slotLabel(v.start),
    start: v.start.toISOString(),
    end: v.end.toISOString(),
    timezone: "AEST · Brisbane",
    first: c?.name.split(" ")[0] ?? "",
    therapist: t?.name ?? "Your clinician",
    service: need?.support ?? v.discipline,
    mode: v.modality === "Telehealth" ? "Video visit" : "In person",
    place:
      v.modality === "Telehealth"
        ? "Online: your joining link comes before the visit"
        : v.site?.siteName || (v.site?.location ?? need?.location ?? "Home"),
    status:
      v.status === "booked" ? "Booked" : v.status === "tentative" ? "Being arranged" : "Changed",
    confirmed: Boolean(v.confirmedByPatient),
    changeRequested: (v.changeRequests ?? []).some((r) => !r.resolved),
  };
}

export const publicActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm") }),
  z.object({
    action: z.literal("change"),
    note: z.string().trim().min(5, "Tell us what would suit you").max(500),
  }),
]);

export async function publicAppointmentAction(
  token: string,
  input: z.infer<typeof publicActionSchema>,
) {
  const { appointments } = await collections();
  const v = await byLink(token);
  if (v.status !== "booked" && v.status !== "tentative") {
    throw new UserFacingError(
      "This appointment has already changed. Your care team will be in touch.",
      409,
    );
  }
  if (input.action === "confirm") {
    await appointments.updateOne({ _id: v._id }, { $set: { confirmedByPatient: new Date() } });
  } else {
    await appointments.updateOne(
      { _id: v._id },
      { $push: { changeRequests: { at: new Date(), note: input.note, resolved: false } } },
    );
    await notify(await adminIds(), {
      title: `Change requested for ${v.ref ?? "an appointment"}`,
      body: input.note,
      href: "/care/schedule",
    });
  }
  await publish(await adminIds(), "care", { clientId: v.clientId.toHexString() });
  return publicAppointment(token);
}

export const leaveSchema = z.object({
  therapistId: z.string(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.enum(["Annual leave", "Sick leave", "Training", "Unpaid leave", "Other"]),
});

/** Approved leave: visits on those days are flagged for reassignment, never moved silently. */
export async function addLeave(admin: UserDoc, input: z.infer<typeof leaveSchema>) {
  const { therapists, appointments } = await collections();
  if (input.to < input.from) throw new UserFacingError("The leave must end after it starts.");
  if (!ObjectId.isValid(input.therapistId)) throw new UserFacingError("Clinician not found.", 404);
  const t = await therapists.findOne({ _id: new ObjectId(input.therapistId) });
  if (!t) throw new UserFacingError("Clinician not found.", 404);
  await therapists.updateOne(
    { _id: t._id },
    {
      $push: {
        timeOff: {
          id: randomBytes(8).toString("hex"),
          from: input.from,
          to: input.to,
          reason: input.reason,
        },
      },
    },
  );
  const fromDate = new Date(`${input.from}T00:00:00+10:00`);
  const toDate = new Date(new Date(`${input.to}T00:00:00+10:00`).getTime() + 86_400_000);
  const affected = await appointments.countDocuments({
    therapistId: t._id,
    status: { $in: ["booked", "tentative"] },
    start: { $gte: fromDate, $lt: toDate },
  });
  await audit(
    admin,
    `Recorded ${input.reason.toLowerCase()} for ${t.name}, ${input.from} to ${input.to}${affected ? `: ${affected} visits flagged for reassignment` : ""}`,
    null,
  );
  await publish(await adminIds(), "care", {});
  return { affected };
}

export type ResourceDay = {
  date: string;
  working: number;
  leave: string | null;
  booked: number;
  existing: number;
  visits: number;
};

/** S05-08: each clinician's week: hours, leave, booked time and what's left. */
export async function resourceWeek(monday: Date) {
  const { therapists, appointments, db } = await collections();
  const team = await Promise.all(
    (
      await therapists
        .find({ active: { $ne: false } })
        .sort({ name: 1 })
        .toArray()
    ).map((t) => ensureStaff(db, t)),
  );
  const end = new Date(monday.getTime() + 7 * 86_400_000);
  const visits = await appointments
    .find({
      start: { $gte: monday, $lt: end },
      status: { $in: ["booked", "tentative", "completed"] },
    })
    .toArray();
  return team.map((t) => {
    const days: ResourceDay[] = [];
    for (let i = 0; i < 5; i += 1) {
      const dayStart = new Date(monday.getTime() + i * 86_400_000);
      const key = new Date(dayStart.getTime() + 10 * HOUR).toISOString().slice(0, 10);
      const dayKey = brisbaneDay(new Date(dayStart.getTime() + 10 * HOUR));
      const w = t.weekly.find((x) => x.weekday === i + 1);
      const off = (t.timeOff ?? []).find((o) => o.from <= key && key <= o.to);
      const mine = visits.filter(
        (v) =>
          v.therapistId.equals(t._id) &&
          v.start >= dayStart &&
          v.start < new Date(dayStart.getTime() + 86_400_000),
      );
      const existing =
        w && !off ? caseloadVisits(t, dayKey).reduce((n, v) => n + (v.end - v.start), 0) : 0;
      days.push({
        date: key,
        working: w ? w.end - w.start : 0,
        leave: off ? off.reason : null,
        booked: mine.reduce((n, v) => n + (v.end.getTime() - v.start.getTime()) / 60_000, 0),
        existing,
        visits: mine.length,
      });
    }
    return {
      id: t._id.toHexString(),
      name: t.name,
      discipline: t.discipline,
      region: t.region,
      status: t.staff?.status ?? "Active",
      days,
    };
  });
}

/** Recent scheduling decisions for the audit view (S05-10). */
export async function schedulingAudit() {
  const { audit: log } = await collections();
  const rows = await log
    .find({
      action: {
        $regex:
          "APT-|Asked .* to take|Assignment mode|reminder|Moved |leave for|participant link|Automatic allocation",
        $options: "i",
      },
    })
    .sort({ at: -1 })
    .limit(80)
    .toArray();
  return rows.map((r) => ({
    id: r._id.toHexString(),
    action: r.action,
    actor: r.actorName,
    at: r.at.toISOString(),
  }));
}

/** Finance-only staff see times, people and outcomes, not site, safety or clinical detail (AT-23). */
export function forViewer(board: ScheduleBoardDto, viewer: UserDoc): ScheduleBoardDto {
  // Anyone with a clinical, intake or scheduling view of records sees the whole board.
  const scheduling =
    can(viewer, "records.view.clinical") ||
    can(viewer, "records.view.intake") ||
    can(viewer, "records.view.scheduling");
  if (scheduling) return board;
  return {
    ...board,
    events: board.events.map((e) => ({
      ...e,
      site: null,
      flags: e.flags.filter((f) => f.kind === "funding"),
      history: e.history.filter((h) => !/safety|precaution/i.test(h.label)),
      noShow: e.noShow ? { attempts: "Restricted", concern: false } : null,
    })),
    restricted: true,
  };
}

/** S05-06: the clinician's own agenda: only their visits, no reminder or other staff detail. */
export async function mySchedule(user: UserDoc) {
  if (!user.therapistId) throw new UserFacingError("Only clinicians have a schedule here.", 409);
  const { assignments } = await collections();
  const today = brisbaneDay(new Date()).getTime() - 10 * HOUR;
  const board = await scheduleBoard(
    new Date(today - 7 * 86_400_000),
    new Date(today + 15 * 86_400_000),
  );
  const mine = user.therapistId.toHexString();
  const pending = await assignments.countDocuments({
    therapistId: user.therapistId,
    status: "pending",
  });
  return {
    events: board.events
      .filter((e) => e.therapistId === mine)
      .map((e) => ({ ...e, reminders: [] })),
    pending,
  };
}

export const clinicianChangeSchema = z.object({
  appointmentId: z.string(),
  note: z.string().trim().min(5, "Say what needs to change").max(400),
});

/** A clinician asks scheduling to change a visit; nothing moves until scheduling acts. */
export async function clinicianChange(user: UserDoc, input: z.infer<typeof clinicianChangeSchema>) {
  const { appointments } = await collections();
  if (!ObjectId.isValid(input.appointmentId)) throw new UserFacingError("Visit not found.", 404);
  const v = await appointments.findOne({ _id: new ObjectId(input.appointmentId) });
  if (!v || !user.therapistId || !v.therapistId.equals(user.therapistId)) {
    throw new UserFacingError("Visit not found.", 404);
  }
  if (v.status !== "booked" && v.status !== "tentative") {
    throw new UserFacingError("Only an upcoming visit can be changed.", 409);
  }
  await appointments.updateOne(
    { _id: v._id },
    {
      $push: {
        changeRequests: { at: new Date(), note: `Clinician: ${input.note}`, resolved: false },
      },
    },
  );
  await notify(await adminIds(), {
    title: `${user.name} asked to change ${v.ref ?? "a visit"}`,
    body: input.note,
    href: "/care/schedule",
  });
  await audit(user, `Asked scheduling to change ${v.ref ?? "a visit"}: ${input.note}`, v.clientId);
  await publish(await adminIds(), "care", { clientId: v.clientId.toHexString() });
}
