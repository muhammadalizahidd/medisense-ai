import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { generateJson } from "@/lib/ai/engine";
import { AiError } from "@/lib/ai/types";
import { templates } from "@/lib/live/assess";
import { restrictedDisciplines } from "@/lib/live/records";
import {
  checklistFor,
  measurementFlags,
  type Attendance,
  type AttendeeRec,
  type CheckState,
  type InterventionRec,
  type RecordState,
  type Safety,
  type SessionAction,
  type SessionFull,
  type SessionMode,
  type SessionRow,
  type Verification,
} from "@/lib/live/sessions";
import { abortVisit, amendNote, checkIn, checkOut, writeSoapNote } from "./clinical";
import { collections } from "./db";
import { noteStatusOf } from "./dto";
import { UserFacingError } from "./http";
import { audit, publish } from "./live";
import type { AppointmentDoc, ClientDoc, UserDoc } from "./models";
import { insertTask } from "./operations";
import { cancelVisit, recordOutcome } from "./visits";

/* ------------------------------------------------------------------ storage */

/** Module 14 fields kept beside the appointment, keyed by its _id, so Module 05 stays untouched. */
export interface SessionExtDoc {
  _id: ObjectId;
  ref: string;
  purpose: string;
  purposeOther: string;
  siteDetail: string;
  checklist: Record<string, { state: CheckState; note: string; by: string; at: Date }>;
  identity: { identity: boolean; location: boolean; by: string; at: Date } | null;
  attendees: AttendeeRec[];
  safety: { status: Safety; detail: string; action: string; escalated: boolean };
  safetyStop: boolean;
  partial: { remaining: string } | null;
  interventions: (Omit<InterventionRec, "at"> & { at: Date })[];
  performed: Record<string, string[]>;
  aiNote: { verified: boolean; at: Date } | null;
  disposition: string;
  dispositionNote: string;
  followUps: { type: string; note: string; taskId: string | null }[];
  outcomeReason: string;
  times: { start: Date; end: Date; reason: string } | null;
  docMinutes: number | null;
  verification: { state: Verification; note: string; by: string; at: Date } | null;
  sync: {
    state: "Synced" | "Unsynced draft" | "Conflict";
    conflict: { field: "subjective" | "objective"; mobile: string; web: string; at: Date } | null;
  };
  brief: { text: string; sources: string[]; at: Date } | null;
  incident: { severity: string; detail: string; at: Date; ref: string } | null;
  timeline: { at: Date; by: string; action: string; reason: string }[];
  seeded?: boolean;
}

export async function sessionExts() {
  const { db } = await collections();
  return db.collection<SessionExtDoc>("sessionExt");
}

export async function nextSessionRef() {
  const { db } = await collections();
  const c = await db
    .collection<{ _id: string; seq: number }>("counters")
    .findOneAndUpdate(
      { _id: "session" },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" },
    );
  return `SES-${String(c?.seq ?? 1).padStart(6, "0")}`;
}

export function modeOf(a: AppointmentDoc): SessionMode {
  if (a.modality === "Telehealth") return "Telehealth";
  switch (a.site?.location) {
    case "School":
      return "School";
    case "Daycare":
      return "Daycare";
    case "Day Program":
      return "Day Program";
    case "Other community location":
      return "Other Community Location";
    case "Telehealth":
      return "Telehealth";
    default:
      return "Home";
  }
}

const purposeMap: Record<string, string> = {
  "Initial Assessment": "Initial Assessment",
  "Assessment Continuation": "Assessment Continuation",
  "Treatment Session": "Treatment",
  Review: "Review",
  Reassessment: "Reassessment",
};

export function blankSessionExt(a: AppointmentDoc, ref: string): SessionExtDoc {
  return {
    _id: a._id,
    ref,
    purpose: purposeMap[a.purpose ?? ""] ?? "Treatment",
    purposeOther: "",
    siteDetail: a.site?.siteName ?? "",
    checklist: {},
    identity: null,
    attendees: [
      {
        name: "Participant",
        role: "Participant",
        present: true,
        authority: "Self",
        recordingConsent: "Not asked",
      },
    ],
    safety: { status: "Not Assessed", detail: "", action: "", escalated: false },
    safetyStop: false,
    partial: null,
    interventions: [],
    performed: {},
    aiNote: null,
    disposition: "",
    dispositionNote: "",
    followUps: [],
    outcomeReason: "",
    times: null,
    docMinutes: null,
    verification: null,
    sync: { state: "Synced", conflict: null },
    brief: null,
    incident: null,
    timeline: [],
  };
}

async function extFor(a: AppointmentDoc) {
  const col = await sessionExts();
  const found = await col.findOne({ _id: a._id });
  if (found) return found;
  const fresh = blankSessionExt(a, await nextSessionRef());
  await col.insertOne(fresh).catch(() => undefined);
  return (await col.findOne({ _id: a._id })) ?? fresh;
}

/* ------------------------------------------------------------------ access */

const has = (u: UserDoc, ...roles: string[]) =>
  Boolean(u.staffRoles?.some((r) => roles.includes(r)));
const isLead = (u: UserDoc) => u.role === "admin" && has(u, "Clinical Lead", "Super Admin");
const isFinance = (u: UserDoc) => u.role === "admin" && has(u, "Finance", "Finance Manager");

type View = SessionFull["view"] | "none";

function viewOf(u: UserDoc, a: AppointmentDoc): View {
  if (u.role === "therapist") return u.therapistId?.equals(a.therapistId) ? "edit" : "none";
  if (u.role !== "admin") return "none";
  // A Clinical Lead reviews clinical content, but no role gets blanket access to psychology or
  // trauma therapy sessions: those stay at status level (section 9).
  if (isLead(u)) return restrictedDisciplines.includes(a.discipline) ? "status" : "lead";
  if (isFinance(u)) return "finance";
  return "status";
}

/* ------------------------------------------------------------------ derived */

export function attendanceOf(
  a: AppointmentDoc,
  e: Pick<SessionExtDoc, "safetyStop" | "partial">,
): Attendance {
  switch (a.status) {
    case "cancelled":
    case "late-cancelled":
      return "Cancelled";
    case "no-show":
      return "No Show";
    case "aborted":
      return e.safetyStop ? "Safety Stop" : "Partially Completed";
    case "completed":
      return e.partial ? "Partially Completed" : "Completed";
    case "booked":
      if (a.checkIn) return "In Progress";
      return a.confirmedByPatient ? "Confirmed" : "Scheduled";
    default:
      return "Scheduled";
  }
}

export function recordOf(a: AppointmentDoc): RecordState {
  if (!a.note) return "Not Started";
  const s = noteStatusOf(a);
  if (s === "Final") return "Signed";
  if (s === "Amended") return "Amended";
  if (s === "Pending Signature") return "Awaiting Review";
  return "Draft";
}

function verificationOf(a: AppointmentDoc, e: SessionExtDoc): Verification {
  if (e.verification) return e.verification.state;
  if (["cancelled"].includes(a.status)) return "Not billable";
  return "Unverified";
}

function nextStep(att: Attendance, rec: RecordState, e: SessionExtDoc, mode: SessionMode): string {
  if (e.sync.state === "Conflict") return "Resolve the edit conflict";
  if (att === "Scheduled" || att === "Confirmed") {
    const items = checklistFor(mode);
    const open = items.filter(
      (i) => e.checklist[i]?.state !== "Confirmed" && e.checklist[i]?.state !== "Not applicable",
    ).length;
    return open ? `Pre-visit checklist: ${open} to confirm` : "Ready to check in";
  }
  if (att === "In Progress") return "Record activities, then end the session";
  if (att === "No Show" || att === "Cancelled") return "Follow-up handled by scheduling";
  if (att === "Safety Stop") return "Escalation with the Clinical Lead";
  if (rec === "Not Started") return "Write the session note";
  if (rec === "Draft" || rec === "Awaiting Review")
    return e.aiNote && !e.aiNote.verified ? "Verify the AI draft, then sign" : "Sign the note";
  return "Done";
}

function noteGaps(a: AppointmentDoc, e: SessionExtDoc): string[] {
  const out: string[] = [];
  const n = a.note;
  for (const [k, label] of [
    ["subjective", "Subjective"],
    ["objective", "Objective"],
    ["assessment", "Assessment"],
    ["plan", "Plan"],
  ] as const)
    if (!n?.[k] || n[k].length < 3) out.push(`${label} is blank`);
  if (!n?.forPatient || n.forPatient.length < 10) out.push("Patient summary is blank");
  for (const i of e.interventions) for (const f of i.flags) out.push(`${i.activity}: ${f}`);
  if (e.aiNote && !e.aiNote.verified) out.push("AI draft not yet verified by you");
  if (a.checkIn && a.checkOut && a.checkOut.at < a.checkIn.at)
    out.push("End time is before start time");
  if (e.sync.state === "Conflict") out.push("Resolve the edit conflict between devices");
  return out;
}

/* ------------------------------------------------------------------ list */

export async function sessionList(u: UserDoc): Promise<SessionRow[]> {
  const db = await collections();
  const day = 86_400_000;
  const now = Date.now();
  const q: Record<string, unknown> = {
    status: { $ne: "tentative" },
    start: { $gte: new Date(now - 28 * day), $lte: new Date(now + 14 * day) },
  };
  if (u.role === "therapist") q.therapistId = u.therapistId ?? new ObjectId();
  else if (u.role !== "admin") return [];
  const appts = await db.appointments.find(q).sort({ start: -1 }).limit(900).toArray();
  const exts = await (
    await sessionExts()
  )
    .find({ _id: { $in: appts.map((a) => a._id) } })
    .toArray();
  const extMap = new Map(exts.map((e) => [e._id.toHexString(), e]));
  const clients = await db.clients
    .find(
      {
        _id: {
          $in: [...new Set(appts.map((a) => a.clientId.toHexString()))].map((x) => new ObjectId(x)),
        },
      },
      { projection: { name: 1, mrn: 1 } },
    )
    .toArray();
  const therapists = await db.therapists.find({}, { projection: { name: 1 } }).toArray();
  const rows: SessionRow[] = [];
  for (const a of appts) {
    const v = viewOf(u, a);
    if (v === "none") continue;
    const e = extMap.get(a._id.toHexString()) ?? blankSessionExt(a, "");
    const c = clients.find((x) => x._id.equals(a.clientId));
    const mode = modeOf(a);
    const att = attendanceOf(a, e);
    const rec = recordOf(a);
    rows.push({
      id: a._id.toHexString(),
      ref: e.ref || `SES-${a._id.toHexString().slice(-6).toUpperCase()}`,
      apt: a.ref ?? "",
      participant: c?.name ?? "Participant",
      participantId: c?.mrn ?? "",
      therapist: therapists.find((t) => t._id.equals(a.therapistId))?.name ?? "",
      discipline: a.discipline,
      purpose: e.purpose,
      mode,
      start: a.start.toISOString(),
      attendance: att,
      record: rec,
      verification: verificationOf(a, e),
      safety: e.safety.status,
      restricted: restrictedDisciplines.includes(a.discipline),
      next: v === "edit" ? nextStep(att, rec, e, mode) : att,
      sync: e.sync.state,
    });
  }
  return rows;
}

/* ------------------------------------------------------------------ detail */

async function load(id: ObjectId) {
  const db = await collections();
  const a = await db.appointments.findOne({ _id: id });
  if (!a) throw new UserFacingError("Session not found.", 404);
  const client = await db.clients.findOne({ _id: a.clientId });
  if (!client) throw new UserFacingError("Session not found.", 404);
  const therapist = await db.therapists.findOne(
    { _id: a.therapistId },
    { projection: { name: 1 } },
  );
  return { db, a, client, therapistName: therapist?.name ?? "Treating clinician" };
}

async function planGoals(db: Awaited<ReturnType<typeof collections>>, a: AppointmentDoc) {
  const plan = await db.plans.findOne(
    {
      clientId: a.clientId,
      ...(a.needId ? { needId: a.needId } : {}),
      status: { $in: ["Active", "Under Review"] },
    },
    { sort: { version: -1 } },
  );
  const anyPlan =
    plan ??
    (await db.plans.findOne(
      { clientId: a.clientId, ...(a.needId ? { needId: a.needId } : {}) },
      { sort: { createdAt: -1 } },
    ));
  if (!anyPlan) return { goals: [], planState: "No plan", planId: null };
  const ext = await db.db
    .collection<{
      _id: ObjectId;
      state?: string;
      goals?: Record<
        string,
        { title?: string; unit?: string; context?: string; points?: { value: string }[] }
      >;
    }>("planExt")
    .findOne({ _id: anyPlan._id });
  const goals = anyPlan.goals.map((g) => {
    const x = ext?.goals?.[g.id];
    const last = x?.points?.at(-1)?.value ?? g.history.at(-1)?.value ?? g.baseline;
    return {
      id: g.id,
      title: x?.title ?? g.description,
      previous: last ? String(last) : "",
      unit: x?.unit ?? "",
      context: x?.context ?? "",
    };
  });
  return {
    goals,
    planState: ext?.state ?? String(anyPlan.status),
    planId: anyPlan._id.toHexString(),
  };
}

async function assessmentsFor(
  db: Awaited<ReturnType<typeof collections>>,
  a: AppointmentDoc,
  e: SessionExtDoc,
) {
  const list = await db.assessments
    .find({ clientId: a.clientId, ...(a.needId ? { needId: a.needId } : {}) })
    .sort({ createdAt: -1 })
    .limit(4)
    .toArray();
  const exts = await db.db
    .collection<{
      _id: ObjectId;
      ref: string;
      templateId: string;
      excluded: string[];
      observations: { domain: string }[];
      status?: string;
    }>("assessExt")
    .find({ _id: { $in: list.map((x) => x._id) } })
    .toArray();
  return list
    .map((x) => {
      const ex = exts.find((y) => y._id.equals(x._id));
      if (!ex) return null;
      const tpl = templates.find((t) => t.id === ex.templateId);
      const done = new Set(ex.observations.map((o) => o.domain));
      return {
        id: x._id.toHexString(),
        ref: ex.ref,
        title: tpl?.title ?? "Assessment",
        status: String(x.status),
        sections: (tpl?.domains ?? [])
          .filter((d) => !ex.excluded.includes(d.key))
          .map((d) => ({ id: d.key, title: d.title, done: done.has(d.key) })),
        performed: e.performed[x._id.toHexString()] ?? [],
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
}

export async function sessionDetail(u: UserDoc, id: ObjectId): Promise<SessionFull> {
  const { db, a, client, therapistName } = await load(id);
  const v = viewOf(u, a);
  if (v === "none") throw new UserFacingError("Session not found.", 404);
  const e = await extFor(a);
  const clinical = v === "edit" || v === "lead";
  const mode = modeOf(a);
  const att = attendanceOf(a, e);
  const rec = recordOf(a);
  const { goals, planState, planId } = clinical
    ? await planGoals(db, a)
    : { goals: [], planState: "", planId: null };
  const tele = mode === "Telehealth" ? await db.telehealth.findOne({ appointmentId: a._id }) : null;
  const previous = clinical
    ? (
        await db.appointments
          .find({
            clientId: a.clientId,
            discipline: a.discipline,
            status: "completed",
            start: { $lt: a.start },
            "note.text": { $exists: true },
          })
          .sort({ start: -1 })
          .limit(3)
          .toArray()
      ).map((p) => ({
        date: p.start.toISOString(),
        summary: (p.note?.text ?? "").slice(0, 260),
        by: p.note?.byName ?? "",
      }))
    : [];
  const n = a.note;
  return {
    id: a._id.toHexString(),
    ref: e.ref,
    apt: a.ref ?? "",
    view: v,
    participant: client.name,
    participantId: client.mrn ?? "",
    clientId: client._id.toHexString(),
    therapist: therapistName,
    discipline: a.discipline,
    restricted: restrictedDisciplines.includes(a.discipline),
    purpose: e.purpose,
    purposeOther: e.purposeOther,
    mode,
    siteDetail: e.siteDetail,
    // Telehealth keeps the join context, not the home address (section 4).
    address: mode === "Telehealth" || v === "finance" ? "" : a.site?.address || client.suburb || "",
    siteContact: a.site?.siteContact ?? "",
    start: a.start.toISOString(),
    end: a.end.toISOString(),
    actualStart: (e.times?.start ?? a.checkIn?.at)?.toISOString() ?? null,
    actualEnd: (e.times?.end ?? a.checkOut?.at)?.toISOString() ?? null,
    directMinutes: e.times
      ? Math.round((e.times.end.getTime() - e.times.start.getTime()) / 60_000)
      : (a.checkOut?.minutes ?? null),
    docMinutes: e.docMinutes,
    attendance: att,
    record: rec,
    verification: verificationOf(a, e),
    verificationNote:
      v === "finance" || v === "lead" || v === "edit" ? (e.verification?.note ?? "") : "",
    checklist: checklistFor(mode).map((item) => ({
      item,
      state: e.checklist[item]?.state ?? "",
      note: clinical ? (e.checklist[item]?.note ?? "") : "",
    })),
    identity: e.identity ? { ...e.identity, at: e.identity.at.toISOString() } : null,
    attendees: clinical ? e.attendees : e.attendees.map((x) => ({ ...x, authority: "" })),
    safety: clinical
      ? e.safety
      : { status: e.safety.status, detail: "", action: "", escalated: e.safety.escalated },
    goals,
    planState,
    planId,
    interventions: clinical ? e.interventions.map((i) => ({ ...i, at: i.at.toISOString() })) : [],
    assessments: clinical ? await assessmentsFor(db, a, e) : [],
    note: {
      subjective: clinical ? (n?.subjective ?? "") : "",
      objective: clinical ? (n?.objective ?? "") : "",
      assessment: clinical ? (n?.assessment ?? "") : "",
      plan: clinical ? (n?.plan ?? "") : "",
      forPatient: clinical ? (n?.forPatient ?? "") : "",
      aiDrafted: Boolean(n?.aiDrafted),
      verified: e.aiNote ? e.aiNote.verified : true,
      status: n ? noteStatusOf(a) : "Not started",
      signedAt: n?.signedAt?.toISOString() ?? null,
      by: n?.byName ?? "",
      amendments: clinical
        ? (n?.amendments ?? []).map((m) => ({
            reason: m.reason,
            text: m.text,
            by: m.byName,
            at: m.at.toISOString(),
          }))
        : [],
    },
    noteGaps: v === "edit" ? noteGaps(a, e) : [],
    disposition: clinical ? e.disposition : "",
    dispositionNote: clinical ? e.dispositionNote : "",
    followUps: e.followUps.map((f) => ({ ...f, note: clinical ? f.note : "" })),
    outcomeReason: e.outcomeReason,
    telehealth:
      mode === "Telehealth"
        ? {
            id: tele?._id.toHexString() ?? null,
            state: tele?.state ?? "Not started",
            recording: tele?.recording.status ?? "Off",
            consent: {
              video: Boolean(tele?.consents.video?.given),
              recording: Boolean(tele?.consents.recording?.given),
              transcription: Boolean(tele?.consents.transcription?.given),
            },
            events: (tele?.events ?? [])
              .slice(-8)
              .map((x) => ({ at: x.at.toISOString(), text: x.text })),
          }
        : null,
    sync: {
      state: e.sync.state,
      conflict:
        e.sync.conflict && v === "edit"
          ? { ...e.sync.conflict, at: e.sync.conflict.at.toISOString() }
          : null,
    },
    brief: clinical && e.brief ? { ...e.brief, at: e.brief.at.toISOString() } : null,
    risks: clinical
      ? [
          client.precautions,
          ...(e.safety.status === "Concern / Precaution" ? [e.safety.detail] : []),
        ].filter((x): x is string => Boolean(x))
      : [],
    previous,
    incident:
      clinical && e.incident
        ? { ...e.incident, at: e.incident.at.toISOString() }
        : e.incident
          ? {
              severity: e.incident.severity,
              detail: "",
              at: e.incident.at.toISOString(),
              ref: e.incident.ref,
            }
          : null,
    timeline: e.timeline
      .map((h) => ({
        at: h.at.toISOString(),
        by: h.by,
        action: h.action,
        reason: clinical ? h.reason : "",
      }))
      .reverse(),
    canEdit: v === "edit",
    canVerify: v === "finance",
  };
}

/* ------------------------------------------------------------------ actions */

function related(a: AppointmentDoc, client: ClientDoc, ref: string) {
  return {
    kind: "Session" as const,
    ref,
    label: client.name,
    href: `/care/sessions/${a._id.toHexString()}`,
  };
}

async function task(
  u: UserDoc,
  a: AppointmentDoc,
  client: ClientDoc,
  ref: string,
  t: {
    title: string;
    category:
      | "Scheduling"
      | "Clinical Review"
      | "Billing"
      | "Care Coordination"
      | "Documentation"
      | "Visit";
    team: "Scheduling" | "Clinical" | "Finance" | "Operations";
    priority?: "Normal" | "High" | "Urgent";
    days?: number;
  },
) {
  const created = await insertTask(u, {
    title: t.title,
    category: t.category,
    status: "New",
    priority: t.priority ?? "Normal",
    urgentReason: t.priority === "Urgent" ? "Safety concern raised in a session" : "",
    team: t.team,
    assigneeId: null,
    assigneeName: null,
    related: related(a, client, ref),
    clientId: client._id,
    referralId: null,
    appointmentId: a._id,
    participant: client.name,
    service: a.discipline,
    discipline: a.discipline,
    locationType: modeOf(a),
    dueAt: new Date(Date.now() + (t.days ?? 2) * 86_400_000),
    sla: t.priority === "Urgent" ? "Clinical Escalation" : "Standard",
    visibility: t.team === "Clinical" ? "Team Only" : "Internal",
    source: "Rule",
    ruleCode: "SES-14",
    ruleVersion: 1,
    // One task per session and purpose, so a repeated click never creates a duplicate.
    idemKey: `session:${a._id.toHexString()}:${t.title}`,
    restrictedNote: null,
    recordingHref: null,
    suggestion: false,
    scenario: null,
    checklist: [],
    historyNote: `Raised from session ${ref}`,
  });
  return created;
}

export async function sessionAction(u: UserDoc, id: ObjectId, action: SessionAction) {
  const { db, a, client } = await load(id);
  const v = viewOf(u, a);
  if (v === "none") throw new UserFacingError("Session not found.", 404);
  const col = await sessionExts();
  const e = await extFor(a);
  const now = new Date();
  const set: Partial<SessionExtDoc> = {};
  let note = "";
  let reason = "";

  if (action.type === "verify") {
    if (v !== "finance") throw new UserFacingError("Only Finance verifies service delivery.", 409);
    if (["Scheduled", "Confirmed", "In Progress"].includes(attendanceOf(a, e)))
      throw new UserFacingError("Verify a session after it has happened.", 409);
    set.verification = { state: action.state, note: action.note, by: u.name, at: now };
    note = `Delivery marked ${action.state}`;
    reason = action.note;
  } else {
    if (v !== "edit")
      throw new UserFacingError("Only the treating clinician changes this session.", 409);
    const att = attendanceOf(a, e);
    const live = att === "In Progress";
    const ended = ["Completed", "Partially Completed"].includes(att);
    switch (action.type) {
      case "details":
        if (action.purpose === "Other" && action.purposeOther.length < 3)
          throw new UserFacingError("Explain the purpose when it's Other.");
        if (e.purpose !== action.purpose) note = `Purpose set to ${action.purpose}`;
        else note = "Session details updated";
        set.purpose = action.purpose;
        set.purposeOther = action.purposeOther;
        set.siteDetail = action.siteDetail;
        break;
      case "checklist": {
        if (!checklistFor(modeOf(a)).includes(action.item))
          throw new UserFacingError("That item isn't on this session's checklist.");
        set.checklist = {
          ...e.checklist,
          [action.item]: { state: action.state, note: action.note, by: u.name, at: now },
        };
        note = `Checklist: ${action.item} ${action.state.toLowerCase()}`;
        break;
      }
      case "attendee": {
        const rest = e.attendees.filter((x) => x.name !== action.attendee.name);
        set.attendees = [...rest, action.attendee];
        note = `Attendee recorded: ${action.attendee.role}`;
        // A new attendee during a recording needs their consent before recording continues (AT-40).
        if (modeOf(a) === "Telehealth" && action.attendee.recordingConsent !== "Given") {
          const tele = await db.telehealth.findOne({ appointmentId: a._id });
          if (tele && ["Recording", "Paused"].includes(tele.recording.status)) {
            await db.telehealth.updateOne(
              { _id: tele._id },
              {
                $set: { "recording.status": "Paused" },
                $push: {
                  events: {
                    at: now,
                    text: `Recording paused: ${action.attendee.role} joined without recording consent`,
                  },
                },
              },
            );
            note += "; recording paused until consent is confirmed";
          }
        }
        break;
      }
      case "check-in": {
        if (a.status !== "booked")
          throw new UserFacingError("Only a booked session can be checked in.", 409);
        if (a.checkIn) throw new UserFacingError("Already checked in.", 409);
        if (!action.identity || !action.location)
          throw new UserFacingError(
            "Confirm the participant's identity and location before starting.",
          );
        set.identity = { identity: true, location: true, by: u.name, at: now };
        set.safety = {
          status: action.safety,
          detail: action.safetyDetail,
          action: "",
          escalated: false,
        };
        if (action.safety === "Unsafe to Proceed") {
          if (action.safetyDetail.length < 5)
            throw new UserFacingError("Describe why it's unsafe.");
          await abortVisit(u, a._id, {
            reason: `Unsafe to proceed: ${action.safetyDetail}`,
            remaining: "Full session",
          });
          set.safetyStop = true;
          set.safety = {
            status: action.safety,
            detail: action.safetyDetail,
            action: "Visit stopped; Clinical Lead notified",
            escalated: true,
          };
          await task(u, a, client, e.ref, {
            title: `Safety stop: review with ${client.name}'s clinician`,
            category: "Clinical Review",
            team: "Clinical",
            priority: "Urgent",
            days: 1,
          });
          note = "Session stopped at check-in: unsafe to proceed";
          reason = action.safetyDetail;
          break;
        }
        await checkIn(u, a._id, {
          attendees:
            e.attendees
              .filter((x) => x.present)
              .map((x) => `${x.role}${x.name !== x.role ? ` (${x.name})` : ""}`)
              .join(", ") || "Participant",
          safe: true,
          notes: action.notes,
        });
        if (action.safety === "Concern / Precaution") {
          set.safety.escalated = true;
          await task(u, a, client, e.ref, {
            title: `Precaution raised in session: ${client.name}`,
            category: "Clinical Review",
            team: "Clinical",
            priority: "High",
            days: 1,
          });
        }
        note = "Checked in: identity and location confirmed";
        break;
      }
      case "safety": {
        set.safety = {
          status: action.status,
          detail: action.detail,
          action: action.action,
          escalated: e.safety.escalated,
        };
        note = `Safety: ${action.status}`;
        reason = action.detail;
        if (action.status === "Unsafe to Proceed") {
          if (action.detail.length < 5) throw new UserFacingError("Describe why it's unsafe.");
          if (live) {
            await abortVisit(u, a._id, {
              reason: `Safety stop: ${action.detail}`,
              remaining: "Rest of the session",
            });
            set.safetyStop = true;
          }
          set.safety.escalated = true;
          set.incident = {
            severity: "Requires review",
            detail: action.detail,
            at: now,
            ref: `INC-${randomUUID().slice(0, 6).toUpperCase()}`,
          };
          await task(u, a, client, e.ref, {
            title: `Safety stop: escalate ${client.name}`,
            category: "Clinical Review",
            team: "Clinical",
            priority: "Urgent",
            days: 1,
          });
          note = "Safety stop: session ended and escalated";
        } else if (action.status === "Concern / Precaution" && !e.safety.escalated) {
          set.safety.escalated = true;
          await task(u, a, client, e.ref, {
            title: `Precaution raised in session: ${client.name}`,
            category: "Clinical Review",
            team: "Clinical",
            priority: "High",
            days: 1,
          });
        }
        break;
      }
      case "intervention": {
        if (!live && !ended)
          throw new UserFacingError("Check in before recording activities.", 409);
        if (recordOf(a) === "Signed" || recordOf(a) === "Amended")
          throw new UserFacingError("The note is signed. Add an addendum instead.", 409);
        const i = action.intervention;
        if (i.adverse === "Yes" && i.adverseDetail.length < 5)
          throw new UserFacingError("Describe the adverse event.");
        const flags = measurementFlags(i);
        const rec = { ...i, id: i.id ?? randomUUID(), flags, at: now, by: u.name };
        set.interventions = i.id
          ? e.interventions.map((x) => (x.id === i.id ? rec : x))
          : [...e.interventions, rec];
        note = `${i.id ? "Updated" : "Recorded"} activity: ${i.activity}${flags.length ? ` (flagged: ${flags.join("; ")})` : ""}`;
        if (i.adverse === "Yes") {
          set.incident = {
            severity: "Requires review",
            detail: i.adverseDetail,
            at: now,
            ref: `INC-${randomUUID().slice(0, 6).toUpperCase()}`,
          };
          await task(u, a, client, e.ref, {
            title: `Adverse event to review: ${client.name}`,
            category: "Clinical Review",
            team: "Clinical",
            priority: "High",
            days: 1,
          });
        }
        break;
      }
      case "remove-intervention":
        if (recordOf(a) === "Signed" || recordOf(a) === "Amended")
          throw new UserFacingError("The note is signed. Add an addendum instead.", 409);
        set.interventions = e.interventions.filter((x) => x.id !== action.id);
        note = "Removed an activity";
        break;
      case "assessment-sections":
        set.performed = { ...e.performed, [action.assessmentId]: action.sections };
        note = `Assessment sections for this visit: ${action.sections.length}`;
        break;
      case "note": {
        if (e.sync.state === "Conflict")
          throw new UserFacingError("Resolve the edit conflict first.", 409);
        if (action.sign && e.aiNote && !e.aiNote.verified)
          throw new UserFacingError(
            "Verify the AI draft before signing: it stays unverified until you review it.",
            409,
          );
        if (action.sign) {
          const flagged = e.interventions.filter((i) => i.flags.length);
          if (flagged.length)
            throw new UserFacingError(
              `Fix or explain the flagged values first: ${flagged.map((i) => i.activity).join(", ")}.`,
              409,
            );
        }
        await writeSoapNote(u, a._id, {
          ...action,
          aiDrafted: Boolean(a.note?.aiDrafted),
          ready: false,
        });
        note = action.sign ? "Signed the session note" : "Saved the note as a draft";
        if (action.sign && !e.verification)
          await task(u, a, client, e.ref, {
            title: `Verify delivered service: ${a.ref ?? e.ref}`,
            category: "Billing",
            team: "Finance",
            days: 3,
          });
        break;
      }
      case "verify-ai":
        if (!e.aiNote) throw new UserFacingError("There is no AI draft to verify.", 409);
        set.aiNote = { verified: true, at: now };
        note = "Reviewed and verified the AI draft";
        break;
      case "addendum":
        await amendNote(u, a._id, { reason: action.reason, text: action.text });
        note = "Added an addendum; the signed note is preserved";
        reason = action.reason;
        break;
      case "end": {
        if (!live) throw new UserFacingError("Only a session in progress can end.", 409);
        await checkOut(u, a._id, {});
        set.disposition = action.disposition;
        set.dispositionNote = action.note;
        set.docMinutes = action.docMinutes;
        set.partial = action.partial ? { remaining: action.remaining } : null;
        const ups: SessionExtDoc["followUps"] = [];
        for (const f of action.followUps.filter((x) => x.type !== "None")) {
          const map = {
            "New Session": {
              team: "Scheduling",
              category: "Scheduling",
              title: `Book next session: ${client.name}`,
            },
            "Further Assessment": {
              team: "Scheduling",
              category: "Scheduling",
              title: `Book assessment continuation: ${client.name}`,
            },
            Report: {
              team: "Clinical",
              category: "Documentation",
              title: `Write report: ${client.name}`,
            },
            "Care Coordination": {
              team: "Operations",
              category: "Care Coordination",
              title: `Care coordination: ${client.name}`,
            },
            "Urgent Clinical Escalation": {
              team: "Clinical",
              category: "Clinical Review",
              title: `Urgent clinical escalation: ${client.name}`,
            },
          } as const;
          const m = map[f.type as keyof typeof map];
          const tk = await task(u, a, client, e.ref, {
            title: m.title,
            category: m.category,
            team: m.team,
            priority: f.type === "Urgent Clinical Escalation" ? "Urgent" : "Normal",
          });
          ups.push({ type: f.type, note: f.note, taskId: tk.task?._id.toHexString() ?? null });
        }
        set.followUps = [...e.followUps, ...ups];
        note = `Session ended${action.partial ? " partially completed" : ""} · ${action.disposition}${ups.length ? ` · ${ups.length} follow-up task(s)` : ""}`;
        reason = action.partial ? action.remaining : "";
        break;
      }
      case "no-show":
        await recordOutcome(u, a._id, { outcome: "no-show" });
        set.outcomeReason = action.reason;
        set.verification = {
          state: "Unverified",
          note: "No-show: review against the cancellation policy",
          by: "Automation",
          at: now,
        };
        await task(u, a, client, e.ref, {
          title: `Did not attend: review charge for ${a.ref ?? e.ref}`,
          category: "Billing",
          team: "Finance",
          days: 3,
        });
        await task(u, a, client, e.ref, {
          title: `Contact ${client.name} after a missed session`,
          category: "Visit",
          team: "Scheduling",
          days: 1,
        });
        note = "Recorded as did not attend; no clinical note created";
        reason = action.reason;
        break;
      case "cancel":
        await cancelVisit(u, a._id, { by: "client", reason: "Other" });
        set.outcomeReason = action.reason;
        note = "Session cancelled";
        reason = action.reason;
        break;
      case "abort":
        await abortVisit(u, a._id, { reason: action.reason, remaining: action.remaining });
        note = "Session ended early";
        reason = action.reason;
        break;
      case "times": {
        const s = new Date(action.actualStart);
        const en = new Date(action.actualEnd);
        if (en <= s) throw new UserFacingError("The end time must be after the start time.");
        if (action.reason.length < 5)
          throw new UserFacingError("Give a reason for changing recorded times.");
        set.times = { start: s, end: en, reason: action.reason };
        note = `Recorded times changed to ${Math.round((en.getTime() - s.getTime()) / 60_000)} minutes`;
        reason = action.reason;
        break;
      }
      case "resolve-conflict": {
        if (!e.sync.conflict) throw new UserFacingError("There is no conflict to resolve.", 409);
        const c = e.sync.conflict;
        const value = action.keep === "mobile" ? c.mobile : c.web;
        if (a.note && !["Final", "Amended"].includes(noteStatusOf(a)))
          await db.appointments.updateOne({ _id: a._id }, { $set: { [`note.${c.field}`]: value } });
        set.sync = { state: "Synced", conflict: null };
        note = `Edit conflict resolved: kept the ${action.keep === "mobile" ? "phone" : "web"} version`;
        break;
      }
      case "ai-brief": {
        set.brief = { ...(await aiBrief(db, a, client)), at: now };
        note = "AI summarised earlier notes, goals and risks";
        break;
      }
      case "ai-note": {
        if (!ended) throw new UserFacingError("End the session before drafting its note.", 409);
        if (recordOf(a) === "Signed" || recordOf(a) === "Amended")
          throw new UserFacingError("The note is already signed.", 409);
        const d = await aiNote(a, e, client);
        await writeSoapNote(u, a._id, { ...d, aiDrafted: true, sign: false, ready: false });
        set.aiNote = { verified: false, at: now };
        note = "AI drafted the note from recorded activities: unverified until reviewed";
        break;
      }
    }
  }

  await col.updateOne(
    { _id: a._id },
    {
      $set: set,
      $push: { timeline: { at: now, by: u.name, action: note, reason } },
    },
  );
  await audit(u, `${e.ref}: ${note}`, client._id);
  const { users } = await collections();
  await publish(
    (
      await users
        .find({ role: { $in: ["admin", "therapist"] } }, { projection: { _id: 1 } })
        .toArray()
    ).map((x) => x._id),
    "care",
    { clientId: client._id.toHexString(), session: a._id.toHexString() },
  );
  return { ok: true };
}

/* ------------------------------------------------------------------ AI */

async function aiBrief(
  db: Awaited<ReturnType<typeof collections>>,
  a: AppointmentDoc,
  client: ClientDoc,
) {
  const prev = await db.appointments
    .find({
      clientId: a.clientId,
      discipline: a.discipline,
      status: "completed",
      "note.text": { $exists: true },
      start: { $lt: a.start },
    })
    .sort({ start: -1 })
    .limit(3)
    .toArray();
  const { goals } = await planGoals(db, a);
  const facts = [
    ...prev.map(
      (p, i) =>
        `[N${i + 1}] ${p.start.toISOString().slice(0, 10)} note: ${(p.note?.text ?? "").slice(0, 600)}`,
    ),
    ...goals.map((g, i) => `[G${i + 1}] goal: ${g.title}; last recorded ${g.previous} ${g.unit}`),
    client.precautions ? `[R1] documented precaution: ${client.precautions}` : "",
  ].filter(Boolean);
  if (!facts.length)
    throw new UserFacingError(
      "There are no earlier signed notes, goals or risks to summarise yet.",
      409,
    );
  try {
    const out = await generateJson("session-brief", {
      system:
        "Prepare a short pre-session brief for a therapist from the approved earlier notes, goals and documented risks only. Cite the bracketed tags for every point. Do not add findings, diagnoses or recommendations that aren't in the sources. The therapist verifies it.",
      user: facts.join("\n"),
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["brief", "sources"],
        properties: {
          brief: { type: "string" },
          sources: { type: "array", items: { type: "string" } },
        },
      },
      schemaName: "session_brief",
      maxTokens: 700,
    });
    const parsed = JSON.parse(out.text) as { brief: string; sources: string[] };
    return { text: parsed.brief, sources: parsed.sources.slice(0, 8) };
  } catch (error) {
    if (error instanceof AiError)
      throw new UserFacingError(`AI isn't available right now: ${error.message}`, 409);
    throw new UserFacingError("The AI answer couldn't be read. Try again.", 409);
  }
}

async function aiNote(a: AppointmentDoc, e: SessionExtDoc, client: ClientDoc) {
  const facts = e.interventions.map(
    (i, n) =>
      `[A${n + 1}] ${i.activity}: ${i.resultType} result ${i.result || "not recorded"} ${i.unit} (${i.method || "method not stated"}; ${i.source}); support ${i.support || "not recorded"}; response ${i.response}; ${i.narrative}`,
  );
  if (!facts.length)
    throw new UserFacingError("Record at least one activity before drafting a note.", 409);
  try {
    const out = await generateJson("session-note", {
      system:
        "Draft a SOAP note for a therapy session using only the recorded activities given, citing the bracketed tags. Keep observed, patient-reported and third-party information distinct. Never invent findings, scores or diagnoses; leave a field brief rather than guessing. Write a plain one- or two-sentence summary for the participant with no clinical jargon. Call the person 'the participant', never 'client'. The clinician reviews, corrects and signs.",
      user: `Participant: ${client.name.split(" ")[0]}. Discipline: ${a.discipline}. Disposition: ${e.disposition || "not recorded"}.\n${facts.join("\n")}`,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["subjective", "objective", "assessment", "plan", "forPatient"],
        properties: {
          subjective: { type: "string" },
          objective: { type: "string" },
          assessment: { type: "string" },
          plan: { type: "string" },
          forPatient: { type: "string" },
        },
      },
      schemaName: "session_note",
      maxTokens: 1100,
    });
    const p = JSON.parse(out.text) as Record<
      "subjective" | "objective" | "assessment" | "plan" | "forPatient",
      string
    >;
    const cap = (s: string, n: number) => s.slice(0, n);
    return {
      subjective: cap(p.subjective, 3000),
      objective: cap(p.objective, 3000),
      assessment: cap(p.assessment, 3000),
      plan: cap(p.plan, 3000),
      forPatient: cap(p.forPatient, 800),
    };
  } catch (error) {
    if (error instanceof UserFacingError) throw error;
    if (error instanceof AiError)
      throw new UserFacingError(`AI isn't available right now: ${error.message}`, 409);
    throw new UserFacingError("The AI answer couldn't be read. Try again.", 409);
  }
}
