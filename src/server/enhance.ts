import "server-only";
import { ObjectId } from "mongodb";
import { generateJson } from "@/lib/ai/engine";
import type {
  ActivityDto,
  ChatMessage,
  CheckinAnswers,
  CheckinDto,
  CoachDto,
  CoachLogDto,
  CoachQuestionDto,
  ConcernDto,
  CoordinationDto,
  EnhanceAction,
  InboxDto,
  InsightDto,
  PatientEnhanceDto,
  Reporter,
  TherapistEnhanceDto,
} from "@/lib/live/enhance";
import { restrictedDisciplines } from "@/lib/live/records";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { audit, notify, publish } from "./live";
import type { ClientDoc, UserDoc } from "./models";
import {
  aiAllowed,
  assertReporter,
  autoSendCheckins,
  caregiverInfo,
  caregiverReporters,
  checkAttachment,
  ensureCaregiverDemo,
  sharingWithdrawn,
  feedbackDto,
  moreAction,
  moreTypes,
  prefsOf,
} from "./enhance-more";
import { copilotProposals, patientProposals } from "./agent-tools";
import { careTask, portalView } from "./portal";

/*
 * AI Enhancements 01–07. Every AI output here is a draft built only from records the person may
 * see, labelled as AI, and never applied without a person. If the AI service fails, each feature
 * falls back to the approved source content or a rule-built summary, and says so.
 */

export type Doc = { _id: ObjectId; kind: string; clientId: ObjectId; at: Date } & Record<
  string,
  unknown
>;

export async function col() {
  const { db } = await collections();
  return db.collection<Doc>("aiEnhance");
}

const bne = (d: Date | string) =>
  new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(d));
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d ? String(d) : null);
const id = (d: { _id: ObjectId }) => d._id.toHexString();

/** AI on a patient's information only while they allow it; otherwise the non-AI path runs. */
async function aiIf<T>(
  c: ClientDoc,
  task: string,
  system: string,
  user: string,
  schema: object,
  name: string,
) {
  if (!(await aiAllowed(c))) return null;
  const lang = (await prefsOf(c._id)).language;
  const sys =
    lang === "English"
      ? system
      : `${system} Write every text field in ${lang}; copy numbers, amounts and units exactly.`;
  return ai<T>(task, sys, user, schema, name);
}

async function ai<T>(task: string, system: string, user: string, schema: object, name: string) {
  try {
    const out = await generateJson(task, {
      system,
      user,
      schema: schema as never,
      schemaName: name,
      maxTokens: 1400,
    });
    return JSON.parse(out.text) as T;
  } catch {
    return null;
  }
}
const obj = (props: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(props),
  properties: props,
});
const str = { type: "string" };
const strs = { type: "array", items: { type: "string" } };

/* ------------------------------------------------------------------ access */

async function clientUser(c: ClientDoc) {
  const { users } = await collections();
  return users.findOne({ clientId: c._id });
}

export async function forPatient(u: UserDoc) {
  if (u.role !== "client" || !u.clientId)
    throw new UserFacingError("Sign in as a patient to use this.", 409);
  const { clients } = await collections();
  const c = await clients.findOne({ _id: u.clientId });
  if (!c) throw new UserFacingError("Your record wasn't found.", 404);
  return c;
}

/** A therapist sees only patients with a service assigned to them. */
export async function forTherapist(u: UserDoc, clientId: string) {
  if (u.role !== "therapist" || !u.therapistId)
    throw new UserFacingError("Only the treating therapist can do this.", 409);
  if (!ObjectId.isValid(clientId)) throw new UserFacingError("Patient not found.", 404);
  const { clients } = await collections();
  const c = await clients.findOne({ _id: new ObjectId(clientId) });
  const tid = u.therapistId;
  if (!c || !c.needs.some((n) => n.therapistId?.equals(tid)))
    throw new UserFacingError("This patient isn't on your caseload.", 409);
  return c;
}

async function therapistUserFor(c: ClientDoc) {
  const { users } = await collections();
  const need = c.needs.find((n) => n.therapistId);
  return need?.therapistId ? users.findOne({ therapistId: need.therapistId }) : null;
}

/* ------------------------------------------------------------------ plan sources */

type PlanExt = {
  _id: ObjectId;
  state?: string;
  sharing?: { shared?: boolean; goalIds?: string[] };
  goals?: Record<
    string,
    {
      title?: string;
      type?: string;
      unit?: string;
      points?: { value: string; date: Date; source: string }[];
    }
  >;
  interventions?: {
    id: string;
    name: string;
    sessionsPerWeek: number;
    minutes: number;
    home?: { instructions: string; frequency: string } | null;
  }[];
};

async function plansOf(c: ClientDoc) {
  const { db, plans } = await collections();
  const list = await plans.find({ clientId: c._id }).toArray();
  const exts = await db
    .collection<PlanExt>("planExt")
    .find({ _id: { $in: list.map((p) => p._id) } })
    .toArray();
  return list
    .map((p) => ({ p, x: exts.find((e) => e._id.equals(p._id)) ?? null }))
    .filter(({ x }) => !["Superseded", "Discontinued", "Completed"].includes(x?.state ?? ""));
}

/** Home activities from shared, signed plans: the only source the coach may use. */
async function activitiesOf(c: ClientDoc, coaches: Doc[]): Promise<ActivityDto[]> {
  const out: ActivityDto[] = [];
  for (const { p, x } of await plansOf(c)) {
    if (!x?.sharing?.shared || ["Draft", "Pending Review"].includes(x.state ?? "")) continue;
    for (const i of x.interventions ?? []) {
      if (!i.home) continue;
      const coach = coaches.find((k) => k.activityId === i.id && k.status !== "Superseded");
      out.push({
        planId: p._id.toHexString(),
        planVersion: p.version,
        activityId: i.id,
        name: i.name,
        instructions: i.home.instructions,
        frequency: i.home.frequency || `${i.sessionsPerWeek} times a week`,
        dose: `${i.minutes} minutes`,
        precautions: p.precautions || c.precautions || "",
        coach: coach ? coachDto(coach, p.version) : null,
      });
    }
  }
  return out;
}

function coachDto(k: Doc, currentVersion: number): CoachDto {
  return {
    id: id(k),
    planId: String(k.planId),
    planVersion: Number(k.planVersion),
    activityId: String(k.activityId),
    activityName: String(k.activityName),
    instructions: String(k.instructions),
    frequency: String(k.frequency),
    dose: String(k.dose),
    precautions: String(k.precautions),
    status: k.status as CoachDto["status"],
    level: k.level as CoachDto["level"],
    mode: (k.mode as CoachDto["mode"]) ?? "Source-grounded AI",
    steps: k.steps as CoachDto["steps"],
    faq: (k.faq as CoachDto["faq"]) ?? [],
    stale: Number(k.planVersion) !== currentVersion,
    ai: Boolean(k.ai),
    approvedBy: (k.approvedBy as string | null) ?? null,
    approvedAt: iso(k.approvedAt),
    history: ((k.history as { at: Date; by: string; action: string }[]) ?? []).map((h) => ({
      ...h,
      at: h.at.toISOString(),
    })),
  };
}

/* ------------------------------------------------------------------ mappers */

const reporterOf = (d: Doc) => d.reporter as Reporter;
const blankAnswers: CheckinAnswers = {
  change: "",
  changeDetail: "",
  newDifficulty: "",
  difficultyDetail: "",
  pain: "",
  homeDone: "",
  homeDifficulty: "",
  homeDifficultyDetail: "",
  concerns: "",
  questions: "",
  logistics: "",
  access: [],
  accurate: false,
};

/** Marks check-ins whose visit has moved since they were sent or answered. */
async function withReschedule(list: CheckinDto[]) {
  const { appointments } = await collections();
  const ids = list.flatMap((x) =>
    ObjectId.isValid(x.appointmentId) ? [new ObjectId(x.appointmentId)] : [],
  );
  const appts = ids.length
    ? await appointments.find({ _id: { $in: ids } }, { projection: { start: 1 } }).toArray()
    : [];
  return list.map((x) => {
    const a = appts.find((y) => y._id.toHexString() === x.appointmentId);
    return {
      ...x,
      rescheduled: Boolean(
        a && x.visitAt && a.start.toISOString() !== new Date(x.visitAt).toISOString(),
      ),
    };
  });
}
const logDto = (d: Doc): CoachLogDto => ({
  id: id(d),
  coachId: String(d.coachId),
  activityName: String(d.activityName),
  result: String(d.result),
  difficulty: String(d.difficulty),
  reason: String(d.reason ?? ""),
  concern: Boolean(d.concern),
  comment: String(d.comment ?? ""),
  reporter: reporterOf(d),
  at: d.at.toISOString(),
  review: d.review as CoachLogDto["review"],
  sourceVersion: Number(d.sourceVersion),
  attachment: (d.attachment as CoachLogDto["attachment"]) ?? null,
});
const questionDto = (d: Doc): CoachQuestionDto => ({
  id: id(d),
  coachId: String(d.coachId),
  activityName: String(d.activityName),
  question: String(d.question),
  answer: String(d.answer),
  outcome: d.outcome as CoachQuestionDto["outcome"],
  sources: (d.sources as string[]) ?? [],
  at: d.at.toISOString(),
  reporter: reporterOf(d),
  helpRequested: Boolean(d.helpRequested),
  resolved: Boolean(d.resolved),
});
const checkinDto = (d: Doc): CheckinDto => ({
  id: id(d),
  appointmentId: String(d.appointmentId),
  visitAt: iso(d.visitAt) ?? "",
  service: String(d.service),
  status: d.status as CheckinDto["status"],
  reporter: reporterOf(d),
  answers: (d.answers as CheckinAnswers | null) ?? blankAnswers,
  submittedAt: iso(d.submittedAt),
  flags: (d.flags as string[]) ?? [],
  brief: (d.brief as CheckinDto["brief"]) ?? null,
  review: (d.review as CheckinDto["review"]) ?? "Not Reviewed",
  template: String(d.template ?? "Generic"),
  extraQuestions: (d.extraQuestions as string[]) ?? [],
  requestedBy: (d.requestedBy as string | null) ?? null,
  channel: String(d.channel ?? "In app"),
  rescheduled: false,
  reviewNote: String(d.reviewNote ?? ""),
  reviewedBy: (d.reviewedBy as string | null) ?? null,
});
const concernDto = (d: Doc): ConcernDto => ({
  id: id(d),
  ref: String(d.ref),
  source: String(d.source),
  how: String(d.how),
  types: (d.types as string[]) ?? [],
  pain: String(d.pain ?? ""),
  falls: String(d.falls ?? ""),
  description: String(d.description ?? ""),
  noticed: String(d.noticed ?? ""),
  callback: Boolean(d.callback),
  reporter: reporterOf(d),
  at: d.at.toISOString(),
  status: d.status as ConcernDto["status"],
  category: d.category as ConcernDto["category"],
  card: d.card as ConcernDto["card"],
  actions: ((d.actions as { at: Date; by: string; action: string; comment: string }[]) ?? []).map(
    (a) => ({ ...a, at: a.at.toISOString() }),
  ),
  patientMessage: String(d.patientMessage ?? ""),
  duplicateOf: (d.duplicateOf as string | null) ?? null,
  attachment: (d.attachment as ConcernDto["attachment"]) ?? null,
});
const insightDto = (d: Doc): InsightDto => ({
  id: id(d),
  planId: String(d.planId),
  goalId: String(d.goalId),
  goalTitle: String(d.goalTitle),
  unit: String(d.unit ?? ""),
  baseline: String(d.baseline ?? ""),
  target: String(d.target ?? ""),
  points: (d.points as InsightDto["points"]) ?? [],
  trend: d.trend as InsightDto["trend"],
  narrative: String(d.narrative),
  gaps: (d.gaps as string[]) ?? [],
  uncertainty: String(d.uncertainty ?? ""),
  ai: Boolean(d.ai),
  status: d.status as InsightDto["status"],
  interpretation: String(d.interpretation ?? ""),
  interpretationNote: String(d.interpretationNote ?? ""),
  followUp: String(d.followUp ?? "None"),
  share: Boolean(d.share),
  patientSummary: String(d.patientSummary ?? ""),
  at: d.at.toISOString(),
  by: (d.by as string | null) ?? null,
  stale: false,
});
const coordDto = (d: Doc): CoordinationDto => ({
  id: id(d),
  at: d.at.toISOString(),
  disciplines: d.disciplines as CoordinationDto["disciplines"],
  restrictedOmitted: Number(d.restrictedOmitted ?? 0),
  briefing: String(d.briefing ?? ""),
  ai: Boolean(d.ai),
  suggestions: d.suggestions as CoordinationDto["suggestions"],
  shares: ((d.shares as (CoordinationDto["shares"][number] & { at: Date })[]) ?? []).map((s) => ({
    ...s,
    at: iso(s.at) ?? "",
  })),
});
const chatOf = (d: Doc | null): ChatMessage[] =>
  ((d?.messages as (ChatMessage & { at: Date | string })[]) ?? []).map((m) => ({
    ...m,
    at: iso(m.at) ?? "",
  }));

/* ------------------------------------------------------------------ views */

export async function patientEnhance(u: UserDoc): Promise<PatientEnhanceDto> {
  await ensureCaregiverDemo();
  const c = await forPatient(u);
  await autoSendCheckins(c);
  const portal = await portalView(u);
  const docs = await (await col()).find({ clientId: c._id }).sort({ at: -1 }).toArray();
  const of = (k: string) => docs.filter((d) => d.kind === k);
  const activities = (await activitiesOf(c, of("coach"))).map((a) =>
    // Patients see only published guidance from the current plan version.
    a.coach && (a.coach.status !== "Active" || a.coach.stale)
      ? { ...a, coach: { ...a.coach, steps: [], faq: [] } }
      : a,
  );
  const prefs = await prefsOf(c._id);
  const care = caregiverInfo(u);
  const allowed = caregiverReporters(portal.representatives, prefs);
  // A caregiver on their own account answers only as themselves, within their access.
  const me = care ? (allowed.find((r) => r.name === u.name) ?? null) : null;
  const reporters: Reporter[] = care
    ? me
      ? [me]
      : []
    : [{ name: u.name, role: "Patient", relationship: "Self" }, ...allowed];
  const { clients } = await collections();
  const people = care
    ? await clients.find({ _id: { $in: care.for } }, { projection: { name: 1 } }).toArray()
    : [];
  const noShare = sharingWithdrawn(c);
  return {
    actingAs: care
      ? {
          name: u.name,
          relationship: care.relationship,
          scope: me?.scope ?? [],
          until: me?.until ?? null,
          participants: people.map((x) => ({ id: x._id.toHexString(), name: x.name })),
          current: c._id.toHexString(),
        }
      : null,
    accessDenied:
      care && !me
        ? `Your caregiver access for ${c.name.split(" ")[0]} has ended or was withdrawn. Contact the care team if you need it again.`
        : null,
    sharingWithdrawn: noShare,
    reporters,
    activities,
    logs: of("coachLog").map(logDto),
    questions: of("coachQuestion").map(questionDto),
    checkins: await withReschedule(of("checkin").map(checkinDto)),
    upcoming: portal.appointments
      .filter((a) => a.status === "Upcoming")
      .map((a) => ({
        id: a.id,
        start: a.start,
        service: a.service,
        clinician: a.clinician,
        mode: a.mode,
      })),
    concerns: of("concern").map(concernDto),
    insights: of("insight")
      .filter((d) => d.status === "Approved" && d.share)
      .map((d) => ({
        goalTitle: String(d.goalTitle),
        summary: String(d.patientSummary),
        at: iso(d.decidedAt) ?? d.at.toISOString(),
        by: (d.by as string | null) ?? null,
      })),
    shares: of("coord").flatMap((d) =>
      ((d.shares as { visibility: string; text: string; at: Date; by: string }[]) ?? [])
        .filter((s) => !noShare && s.visibility !== "Care-team only")
        .filter((s) => !care || s.visibility === "Approved caregiver share")
        .map((s) => ({ text: s.text, at: iso(s.at) ?? "", by: s.by })),
    ),
    chat: chatOf(
      docs.find(
        (d) => d.kind === "chat" && d.userId instanceof ObjectId && d.userId.equals(u._id),
      ) ?? null,
    ),
    prefs,
  };
}

async function goalsOf(c: ClientDoc) {
  const out: TherapistEnhanceDto["goals"] = [];
  for (const { p, x } of await plansOf(c)) {
    for (const g of p.goals) {
      const gx = x?.goals?.[g.id];
      out.push({
        planId: p._id.toHexString(),
        goalId: g.id,
        title: gx?.title ?? g.description,
        unit: gx?.unit ?? "",
        baseline: g.baseline,
        target: g.target,
        points: (gx?.points ?? []).map((pt) => ({
          date: pt.date.toISOString(),
          value: String(pt.value),
          source: pt.source,
        })),
      });
    }
  }
  return out;
}

export async function therapistEnhance(u: UserDoc, clientId: string): Promise<TherapistEnhanceDto> {
  const c = await forTherapist(u, clientId);
  await autoSendCheckins(c);
  // The database is far away, so the independent reads go together rather than one after another.
  const [docs, goals, prefs, reps] = await Promise.all([
    col().then((d) => d.find({ clientId: c._id }).sort({ at: -1 }).toArray()),
    goalsOf(c),
    prefsOf(c._id),
    clientUser(c).then(async (pu) => (pu ? (await portalView(pu)).representatives : [])),
  ]);
  const of = (k: string) => docs.filter((d) => d.kind === k);
  const { appointments } = await collections();
  const [visits, amended, versions] = await Promise.all([
    appointments
      .find({
        clientId: c._id,
        therapistId: u.therapistId ?? undefined,
        status: "booked",
        start: { $gte: new Date() },
      })
      .sort({ start: 1 })
      .limit(6)
      .toArray(),
    appointments
      .find(
        { clientId: c._id, "note.amendments.0": { $exists: true } },
        { projection: { "note.amendments.at": 1 } },
      )
      .toArray(),
    plansOf(c),
  ]);
  // A note amended after an insight was drafted, or a newer plan version, means review it again.
  const lastAmend = Math.max(
    0,
    ...amended.flatMap((v) => (v.note?.amendments ?? []).map((x) => new Date(x.at).getTime())),
  );
  const planVersion = new Map(versions.map(({ p }) => [p._id.toHexString(), p.version]));
  return {
    client: { id: c._id.toHexString(), name: c.name },
    upcoming: visits.map((v) => ({
      id: v._id.toHexString(),
      start: v.start.toISOString(),
      service:
        c.needs.find((n) => n.therapistId?.equals(v.therapistId))?.support ?? String(v.discipline),
    })),
    sharingWithdrawn: sharingWithdrawn(c),
    activities: await activitiesOf(c, of("coach")),
    logs: of("coachLog").map(logDto),
    questions: of("coachQuestion").map(questionDto),
    checkins: await withReschedule(of("checkin").map(checkinDto)),
    concerns: of("concern").map(concernDto),
    goals,
    insights: of("insight")
      .map(insightDto)
      .map((i) => {
        const g = goals.find((x) => x.goalId === i.goalId);
        const raw = of("insight").find((x) => x._id.toHexString() === i.id);
        const versionMoved =
          raw?.planVersion !== undefined && planVersion.get(i.planId) !== Number(raw.planVersion);
        return {
          ...i,
          stale:
            i.status !== "Superseded" &&
            Boolean(
              (g && g.points.length !== i.points.length) ||
              versionMoved ||
              lastAmend > new Date(i.at).getTime(),
            ),
        };
      }),
    coordination: of("coord")[0] ? coordDto(of("coord")[0]!) : null,
    chat: chatOf(
      docs.find(
        (d) => d.kind === "copilot" && d.userId instanceof ObjectId && d.userId.equals(u._id),
      ) ?? null,
    ),
    prefs,
    representatives: reps
      .filter((r) => r.status === "Verified" || r.status === "Active")
      .map((r) => ({ name: r.name, relationship: r.relationship })),
    feedback: of("feedback").map(feedbackDto),
  };
}

/** Everything waiting for this therapist's review, across their caseload. */
export async function therapistInbox(u: UserDoc): Promise<InboxDto> {
  if (u.role !== "therapist" || !u.therapistId)
    throw new UserFacingError("Only therapists have this inbox.", 409);
  const { clients } = await collections();
  const mine = await clients.find({ "needs.therapistId": u.therapistId }).toArray();
  const name = new Map(mine.map((c) => [c._id.toHexString(), c.name]));
  const docs = await (
    await col()
  )
    .find({ clientId: { $in: mine.map((c) => c._id) } })
    .sort({ at: -1 })
    .toArray();
  const tag = <T>(d: Doc, dto: T) => ({
    ...dto,
    clientId: d.clientId.toHexString(),
    patient: name.get(d.clientId.toHexString()) ?? "",
  });
  return {
    concerns: docs
      .filter(
        (d) =>
          d.kind === "concern" && !["Resolved", "Closed - No Action"].includes(String(d.status)),
      )
      .map((d) => tag(d, concernDto(d))),
    checkins: docs
      .filter((d) => d.kind === "checkin" && d.status === "Submitted" && d.review !== "Reviewed")
      .map((d) => tag(d, checkinDto(d))),
    logs: docs
      .filter((d) => d.kind === "coachLog" && d.review === "New")
      .map((d) => tag(d, logDto(d))),
    questions: docs
      .filter((d) => d.kind === "coachQuestion" && d.helpRequested && !d.resolved)
      .map((d) => tag(d, questionDto(d))),
    feedback: docs
      .filter((d) => d.kind === "feedback" && !d.resolved)
      .map((d) => tag(d, feedbackDto(d))),
  };
}

/* ------------------------------------------------------------------ rules */

const DOSE =
  /\b(more|double|twice|extra|increase|harder|longer|less|fewer|reduce|skip|instead|change|swap|add)\b/i;
const DOSE_OBJ =
  /\b(reps?|repetitions?|sets?|times?|minutes?|weights?|exercises?|activit(?:y|ies)|dose|days?|sessions?|routine)\b/i;
const SAFETY =
  /\b(hurt|hurts|pain|painful|fell|fall|fallen|dizzy|faint|chest|breath|bleed|swollen|worse|emergency)\b/i;
const CLINICAL_RECORD =
  /\b(assessments?|clinical (notes?|records?|reports?)|case notes?|session notes?|diagnos[ie]s)\b/i;
const SAFETY_TEXT =
  "Stop the activity. If you feel unwell or this could be an emergency, call 000. Otherwise contact your care team on the Medisense number in your app. This app is not monitored around the clock; your therapist has been told.";

/* ------------------------------------------------------------------ actions */

export async function enhanceAction(u: UserDoc, a: EnhanceAction) {
  const care = caregiverInfo(u);
  if (care) {
    if (a.type === "prefs")
      throw new UserFacingError("Only the patient can change their AI settings.", 409);
    // Whatever the form says, a caregiver account reports as that caregiver.
    if ("reporter" in a && a.reporter)
      a = { ...a, reporter: { name: u.name, role: "Caregiver", relationship: care.relationship } };
  }
  if (moreTypes.has(a.type)) return moreAction(u, a as Parameters<typeof moreAction>[1]);
  const k = await col();
  const now = new Date();
  const find = async (docId: string, kind: string) => {
    if (!ObjectId.isValid(docId)) throw new UserFacingError("Not found.", 404);
    const d = await k.findOne({ _id: new ObjectId(docId), kind });
    if (!d) throw new UserFacingError("Not found.", 404);
    return d;
  };
  const ownPatient = async (d: Doc) => {
    const c = await forPatient(u);
    if (!d.clientId.equals(c._id)) throw new UserFacingError("Not found.", 404);
    return c;
  };
  const ownTherapist = async (d: Doc) => forTherapist(u, d.clientId.toHexString());
  const tell = async (c: ClientDoc, title: string, href = "/mobile/therapist") => {
    const t = await therapistUserFor(c);
    if (t) {
      await notify([t._id], { title, body: c.name, href });
      await publish([t._id], "care");
    }
  };
  const tellPatient = async (c: ClientDoc, title: string, body: string) => {
    const p = await clientUser(c);
    if (p) {
      await notify([p._id], { title, body, href: "/mobile/patient" });
      await publish([p._id], "care");
    }
  };

  switch (a.type) {
    /* ---------------- 01 home therapy coach ---------------- */
    case "coach-draft": {
      const c = await forTherapist(u, a.clientId);
      const act = (await activitiesOf(c, [])).find(
        (x) => x.planId === a.planId && x.activityId === a.activityId,
      );
      if (!act) throw new UserFacingError("Only a published home activity can have a coach.", 409);
      const out = await aiIf<{
        steps: { text: string; source: string }[];
        faq: { q: string; a: string; source: string }[];
      }>(
        c,
        "coach-draft",
        `You turn a clinician-approved home activity into patient guidance at the "${a.level}" reading level. Use ONLY the approved instruction text, frequency, duration and precautions given. Never add steps, equipment, repetitions, doses, exercises or advice that are not written. Each step's source must be one of: "Instructions", "Frequency", "Duration", "Precautions". Write 3 to 7 short steps and up to 3 FAQ answers taken from the same text. If the text is too thin to explain, return fewer steps rather than inventing.`,
        `Activity: ${act.name}\nInstructions: ${act.instructions}\nFrequency: ${act.frequency}\nDuration: ${act.dose}\nPrecautions: ${act.precautions || "NONE RECORDED: do not write any step or FAQ about precautions or safety"}`,
        obj({
          steps: { type: "array", items: obj({ text: str, source: str }) },
          faq: { type: "array", items: obj({ q: str, a: str, source: str }) },
        }),
        "coach_draft",
      );
      const kept = (out?.steps ?? []).filter((x) => act.precautions || x.source !== "Precautions");
      const steps = kept.length
        ? kept
        : act.instructions
            .split(/(?<=[.;])\s+/)
            .filter(Boolean)
            .map((s) => ({ text: s.trim(), source: "Instructions" }));
      const prev = await k.findOne({
        kind: "coach",
        clientId: c._id,
        activityId: a.activityId,
        status: { $ne: "Superseded" },
      });
      if (prev) await k.updateOne({ _id: prev._id }, { $set: { status: "Superseded" } });
      const r = await k.insertOne({
        _id: new ObjectId(),
        kind: "coach",
        clientId: c._id,
        at: now,
        planId: act.planId,
        planVersion: act.planVersion,
        activityId: act.activityId,
        activityName: act.name,
        instructions: act.instructions,
        frequency: act.frequency,
        dose: act.dose,
        precautions: act.precautions,
        status: "Draft",
        level: a.level,
        steps,
        faq: out?.faq ?? [],
        ai: Boolean(out),
        approvedBy: null,
        approvedAt: null,
        history: [
          {
            at: now,
            by: u.name,
            action: out
              ? "AI explanation drafted"
              : "Draft built from the approved text (AI unavailable)",
          },
        ],
      });
      await audit(u, "Coach guidance drafted", c._id);
      return { id: r.insertedId.toHexString() };
    }
    case "coach-edit": {
      const d = await find(a.coachId, "coach");
      await ownTherapist(d);
      if (d.status === "Superseded") throw new UserFacingError("This guidance was replaced.", 409);
      await k.updateOne(
        { _id: d._id },
        {
          $set: { steps: a.steps, status: "Draft" },
          $push: { history: { at: now, by: u.name, action: "Edited by clinician" } } as never,
        },
      );
      return { ok: true };
    }
    case "coach-state": {
      const d = await find(a.coachId, "coach");
      const c = await ownTherapist(d);
      const act = (await activitiesOf(c, [])).find((x) => x.activityId === d.activityId);
      if (a.to === "Active" && (!act || act.planVersion !== d.planVersion))
        throw new UserFacingError(
          "The plan changed. Draft new guidance from the current version first.",
          409,
        );
      await k.updateOne(
        { _id: d._id },
        {
          $set: {
            status: a.to,
            ...(a.to === "Active" ? { approvedBy: u.name, approvedAt: now } : {}),
          },
          $push: {
            history: {
              at: now,
              by: u.name,
              action: a.to === "Active" ? "Published to the patient" : "Paused",
            },
          } as never,
        },
      );
      await audit(u, a.to === "Active" ? "Coach guidance published" : "Coach paused", c._id);
      if (a.to === "Active")
        await tellPatient(c, "New guidance for your home activity", String(d.activityName));
      return { ok: true };
    }
    case "coach-ask": {
      const d = await find(a.coachId, "coach");
      const c = await ownPatient(d);
      if (d.status !== "Active")
        throw new UserFacingError("The coach is paused. Contact your therapist.", 409);
      const steps = d.steps as { text: string; source: string }[];
      const faq = (d.faq as { q: string; a: string; source: string }[]) ?? [];
      let answer = "";
      let outcome: CoachQuestionDto["outcome"] = "Answered";
      let sources: string[] = [];
      if (SAFETY.test(a.question)) {
        outcome = "Safety";
        answer = `${SAFETY_TEXT}\n\nApproved precautions: ${String(d.precautions) || "none recorded"}.`;
        sources = ["Precautions", "Medisense safety guidance"];
      } else if (d.mode === "Approved FAQ only" && !DOSE.test(a.question)) {
        const words = a.question
          .toLowerCase()
          .split(/\W+/)
          .filter((w) => w.length > 3);
        const hit = faq
          .map((f) => ({ f, n: words.filter((w) => f.q.toLowerCase().includes(w)).length }))
          .sort((x, y) => y.n - x.n)[0];
        if (hit && hit.n > 0) {
          answer = hit.f.a;
          sources = ["Approved FAQ", hit.f.source];
        } else {
          outcome = "Ask therapist";
          answer =
            "This activity answers only from your therapist's approved questions, and none matches. Ask your therapist.";
          sources = ["Approved FAQ"];
        }
      } else if (DOSE.test(a.question) && DOSE_OBJ.test(a.question)) {
        outcome = "Change refused";
        answer = `I can't change what your therapist prescribed. Your approved amount is ${String(d.frequency)}, ${String(d.dose)}. I can send your question to your therapist.`;
        sources = ["Frequency", "Duration"];
      } else {
        const out = await aiIf<{ answer: string; grounded: boolean; sources: string[] }>(
          c,
          "coach-answer",
          "You answer a patient's question about ONE home activity using ONLY the approved guidance below. Plain, kind, short. If the guidance does not answer it, set grounded false and say you can't confirm it from the approved instructions. Never diagnose, never change or suggest amounts, never add exercises. Sources: list the labels you used (Instructions, Frequency, Duration, Precautions, FAQ).",
          `Activity: ${String(d.activityName)}\nSteps:\n${steps.map((s, i) => `${i + 1}. [${s.source}] ${s.text}`).join("\n")}\nFrequency: ${String(d.frequency)}\nDuration: ${String(d.dose)}\nPrecautions: ${String(d.precautions) || "None"}\nFAQ:\n${faq.map((f) => `Q: ${f.q} A: ${f.a}`).join("\n")}\n\nQuestion from ${a.reporter.name} (${a.reporter.role}): ${a.question}`,
          obj({ answer: str, grounded: { type: "boolean" }, sources: strs }),
          "coach_answer",
        );
        if (!out) {
          outcome = "Ask therapist";
          answer = `The assistant isn't available right now. Your approved steps are:\n${steps.map((s, i) => `${i + 1}. ${s.text}`).join("\n")}`;
          sources = ["Instructions"];
        } else if (!out.grounded) {
          outcome = "Ask therapist";
          answer = `${out.answer} I can't confirm that from your approved instructions, so it's best to ask your therapist.`;
          sources = out.sources;
        } else {
          answer = out.answer;
          sources = out.sources;
        }
      }
      const r = await k.insertOne({
        _id: new ObjectId(),
        kind: "coachQuestion",
        clientId: c._id,
        at: now,
        coachId: id(d),
        activityName: d.activityName,
        question: a.question,
        answer,
        outcome,
        sources,
        reporter: a.reporter,
        helpRequested: outcome === "Safety",
        resolved: false,
      });
      if (outcome === "Safety") {
        await careTask(
          c,
          String(d.planId),
          "Safety Review",
          `Safety concern from home coach: ${String(d.activityName)}`,
          "High",
        );
        await tell(c, "Safety concern raised from the home coach");
      }
      return { id: r.insertedId.toHexString(), answer, outcome, sources };
    }
    case "coach-help": {
      const d = await find(a.questionId, "coachQuestion");
      const c = await ownPatient(d);
      // One open request per question: repeat taps are folded into the first.
      if (!d.helpRequested) {
        await k.updateOne({ _id: d._id }, { $set: { helpRequested: true } });
        await careTask(
          c,
          "",
          "Clinical Follow-up",
          `Home coach question: ${String(d.activityName)}`,
          "Normal",
        );
        await tell(c, "A patient asked for help with a home activity");
      }
      return { ok: true, duplicate: Boolean(d.helpRequested) };
    }
    case "coach-log": {
      const d = await find(a.coachId, "coach");
      const c = await ownPatient(d);
      if (d.status !== "Active")
        throw new UserFacingError("The coach is paused. Contact your therapist.", 409);
      await assertReporter(c, a.reporter, "Activities");
      if (a.result !== "Completed" && !a.reason)
        throw new UserFacingError(
          "Say why it wasn't completed (you can choose Prefer not to say).",
        );
      await k.insertOne({
        _id: new ObjectId(),
        kind: "coachLog",
        clientId: c._id,
        at: now,
        coachId: id(d),
        activityName: d.activityName,
        result: a.result,
        difficulty: a.difficulty,
        reason: a.result === "Completed" ? "" : a.reason,
        concern: a.concern,
        comment: a.comment,
        reporter: a.reporter,
        review: "New",
        sourceVersion: d.planVersion,
        attachment: checkAttachment(a.attachment),
      });
      if (a.concern) {
        const n = await k.countDocuments({ kind: "concern" });
        await k.insertOne({
          _id: new ObjectId(),
          kind: "concern",
          clientId: c._id,
          at: now,
          ref: `CON-${String(1001 + n)}`,
          source: `Home therapy feedback: ${String(d.activityName)}`,
          how: "Prefer not to say",
          newDifficulty: "Unsure",
          types: ["Activity difficulty"],
          pain: "",
          falls: "Prefer not to say",
          description: a.comment,
          noticed: "Today",
          callback: false,
          reporter: a.reporter,
          status: "New",
          category: "Therapist follow-up",
          card: {
            summary: `${a.reporter.name} flagged a new concern while logging ${String(d.activityName)}${a.comment ? `: "${a.comment}"` : "."}`,
            context: [`Plan v${String(d.planVersion)}: ${String(d.frequency)}, ${String(d.dose)}`],
            uncertainty: "Raised from a home-activity log; details may be limited.",
            ai: false,
          },
          actions: [{ at: now, by: a.reporter.name, action: "Reported", comment: "" }],
          patientMessage: "",
          duplicateOf: null,
        });
        await careTask(
          c,
          String(d.planId),
          "Safety Review",
          `New concern logged with ${String(d.activityName)}`,
          "High",
        );
        await tell(c, "New concern logged with a home activity");
      } else await tell(c, "Home activity logged");
      return { ok: true, safety: a.concern ? SAFETY_TEXT : null };
    }
    case "log-ack": {
      const d = await find(a.logId, "coachLog");
      await ownTherapist(d);
      await k.updateOne({ _id: d._id }, { $set: { review: "Acknowledged", reviewedBy: u.name } });
      return { ok: true };
    }
    case "question-resolve": {
      const d = await find(a.questionId, "coachQuestion");
      const c = await ownTherapist(d);
      await k.updateOne(
        { _id: d._id },
        { $set: { resolved: true, reply: a.reply, resolvedBy: u.name } },
      );
      if (a.reply) await tellPatient(c, "Your therapist replied about your home activity", a.reply);
      return { ok: true };
    }

    /* ---------------- 02 pre-appointment check-in ---------------- */
    case "checkin-save": {
      const c = await forPatient(u);
      const { appointments } = await collections();
      const appt = ObjectId.isValid(a.appointmentId)
        ? await appointments.findOne({ _id: new ObjectId(a.appointmentId), clientId: c._id })
        : null;
      if (!appt) throw new UserFacingError("Visit not found.", 404);
      await assertReporter(c, a.reporter, "Appointments");
      if (a.submit && !a.answers.accurate)
        throw new UserFacingError(
          "Confirm the answers are accurate to the best of your knowledge.",
        );
      const flags: string[] = [];
      if (a.answers.change === "Worse")
        flags.push(`Reported feeling worse: "${a.answers.changeDetail || "no detail"}"`);
      if (a.answers.newDifficulty === "Yes")
        flags.push(`New difficulty: "${a.answers.difficultyDetail || "no detail"}"`);
      if (Number(a.answers.pain) >= 7) flags.push(`Pain reported as ${a.answers.pain}/10`);
      if (a.answers.homeDifficulty === "Significant")
        flags.push("Significant difficulty with home activities");
      if (a.answers.logistics !== "Can attend" && a.answers.logistics)
        flags.push(`Logistics: ${a.answers.logistics}`);
      const existing = await k.findOne({
        kind: "checkin",
        clientId: c._id,
        appointmentId: a.appointmentId,
      });
      let brief: CheckinDto["brief"] = null;
      if (a.submit) {
        const goals = (await goalsOf(c)).map(
          (g) => `${g.title} (baseline ${g.baseline}, target ${g.target})`,
        );
        const acts = (await activitiesOf(c, [])).map((x) => `${x.name}: ${x.frequency}, ${x.dose}`);
        const missing = Object.entries({
          "Change since last visit": a.answers.change,
          Pain: a.answers.pain,
          "Home activities": a.answers.homeDone,
        })
          .filter(([, v]) => !v || v === "Not sure")
          .map(([k2]) => k2);
        const out = await aiIf<{
          summary: string;
          reported: string[];
          context: string[];
          concerns: string[];
          questions: string[];
        }>(
          c,
          "checkin-brief",
          "You prepare a short pre-visit briefing for the treating therapist. 'reported' lists what the respondent said, each starting 'Reported:'. 'context' lists only the approved goals and activities that relate, each starting 'Recorded:'. 'concerns' repeats only flagged answers verbatim. 'questions' repeats the respondent's questions faithfully. Never diagnose, grade urgency, recommend treatment or invent measurements.",
          `Respondent: ${a.reporter.name} (${a.reporter.role}${a.reporter.role === "Caregiver" ? `, ${a.reporter.relationship}` : ""})\nAnswers: ${JSON.stringify(a.answers)}\nFlags: ${flags.join("; ") || "none"}\nApproved goals: ${goals.join("; ") || "none"}\nApproved home activities: ${acts.join("; ") || "none"}`,
          obj({ summary: str, reported: strs, context: strs, concerns: strs, questions: strs }),
          "checkin_brief",
        );
        brief = out
          ? { ...out, missing, ai: true }
          : {
              summary: "AI briefing unavailable. The original answers are shown below.",
              reported: [
                `Reported: change since last visit: ${a.answers.change || "not answered"}`,
                `Reported: home activities done: ${a.answers.homeDone || "not answered"}`,
              ],
              context: goals.slice(0, 3).map((g) => `Recorded: ${g}`),
              concerns: flags,
              questions: a.answers.questions ? [a.answers.questions] : [],
              missing,
              ai: false,
            };
      }
      const set = {
        answers: a.answers,
        reporter: a.reporter,
        status: a.submit ? "Submitted" : "Draft",
        flags,
        ...(a.submit ? { submittedAt: now, brief, review: "Not Reviewed" } : {}),
      };
      if (existing) await k.updateOne({ _id: existing._id }, { $set: set });
      else
        await k.insertOne({
          _id: new ObjectId(),
          kind: "checkin",
          clientId: c._id,
          at: now,
          appointmentId: a.appointmentId,
          visitAt: appt.start,
          service:
            c.needs.find((n) => n.therapistId?.equals(appt.therapistId))?.support ??
            String(appt.discipline),
          submittedAt: null,
          brief: null,
          review: "Not Reviewed",
          reviewNote: "",
          reviewedBy: null,
          ...set,
        });
      if (a.submit) {
        await audit(u, "Pre-visit check-in submitted", c._id);
        await tell(
          c,
          flags.length ? "Pre-visit check-in needs review" : "Pre-visit check-in submitted",
        );
      }
      return { ok: true, flags };
    }
    case "checkin-review": {
      const d = await find(a.checkinId, "checkin");
      const c = await ownTherapist(d);
      await k.updateOne(
        { _id: d._id },
        { $set: { review: a.review, reviewNote: a.note, reviewedBy: u.name } },
      );
      await audit(u, `Pre-visit check-in ${a.review.toLowerCase()}`, c._id);
      if (a.review === "Clarification Requested")
        await tellPatient(
          c,
          "Your therapist has a question about your check-in",
          a.note || "Please check your messages.",
        );
      return { ok: true };
    }

    /* ---------------- 04 early risk detection ---------------- */
    case "concern": {
      const c = await forPatient(u);
      await assertReporter(c, a.reporter, "Concerns");
      if (a.newDifficulty !== "No" && !a.description)
        throw new UserFacingError("Tell us a little about the difficulty.");
      const category: ConcernDto["category"] =
        a.falls === "One" || a.falls === "More than one" || Number(a.pain) >= 7
          ? "Safety escalation"
          : !a.description && a.how !== "Worse"
            ? "Insufficient information"
            : a.how === "Worse" || a.newDifficulty === "Yes"
              ? "Therapist follow-up"
              : "Routine review";
      const goals = (await goalsOf(c)).map(
        (g) =>
          `${g.title}: baseline ${g.baseline}, latest ${g.points.at(-1)?.value ?? "none recorded"} (${g.points.at(-1)?.date.slice(0, 10) ?? "no date"})`,
      );
      const recent = (
        await k.find({ kind: "coachLog", clientId: c._id }).sort({ at: -1 }).limit(5).toArray()
      ).map(
        (l) =>
          `${l.at.toISOString().slice(0, 10)} ${String(l.activityName)}: ${String(l.result)}, difficulty ${String(l.difficulty)}`,
      );
      const out = await aiIf<{ summary: string; context: string[]; uncertainty: string }>(
        c,
        "concern-card",
        "You prepare a concern review card for the treating therapist. 'summary': what changed, when and who reported it, in two sentences, quoting the report. 'context': up to 3 lines comparing with the approved goals or recent logs given, each naming its source; if there is nothing to compare say 'Baseline unavailable'. 'uncertainty': what is unknown or needs verification. Never diagnose, never give a risk score, never recommend treatment.",
        `Report from ${a.reporter.name} (${a.reporter.role}): feeling ${a.how}; new difficulty ${a.newDifficulty}; types ${a.types.join(", ") || "none"}; pain ${a.pain || "not given"}; falls ${a.falls}; noticed ${a.noticed}; description: "${a.description}". Source: ${a.source}.\nApproved goals: ${goals.join("; ") || "none"}\nRecent activity logs: ${recent.join("; ") || "none"}`,
        obj({ summary: str, context: strs, uncertainty: str }),
        "concern_card",
      );
      const count = await k.countDocuments({ kind: "concern" });
      const open48 = await k
        .find({
          kind: "concern",
          clientId: c._id,
          at: { $gte: new Date(now.getTime() - 48 * 3_600_000) },
          status: { $nin: ["Resolved", "Closed - No Action"] },
        })
        .toArray();
      const dup = open48.find((x) =>
        ((x.types as string[]) ?? []).some((t) => (a.types as string[]).includes(t)),
      );
      const r = await k.insertOne({
        _id: new ObjectId(),
        kind: "concern",
        clientId: c._id,
        at: now,
        ref: `CON-${String(1001 + count)}`,
        duplicateOf: dup ? String(dup.ref) : null,
        attachment: checkAttachment(a.attachment),
        source: a.source,
        how: a.how,
        newDifficulty: a.newDifficulty,
        types: a.types,
        pain: a.pain,
        falls: a.falls,
        description: a.description,
        noticed: a.noticed,
        callback: a.callback,
        reporter: a.reporter,
        status: "New",
        category,
        card: out
          ? { ...out, ai: true }
          : {
              summary: `${a.reporter.name} reported feeling ${a.how.toLowerCase()}: "${a.description || "no description"}".`,
              context: goals.length ? goals.slice(0, 2) : ["Baseline unavailable"],
              uncertainty: "AI summary unavailable; review the original report.",
              ai: false,
            },
        actions: [{ at: now, by: a.reporter.name, action: "Reported", comment: "" }],
        patientMessage: "",
      });
      if (category === "Safety escalation")
        await careTask(
          c,
          "",
          "Safety Review",
          `Safety concern reported: ${a.types.join(", ") || "see report"}`,
          "High",
        );
      await tell(c, `Concern reported: ${category}`);
      await audit(u, "Concern reported", c._id);
      return {
        id: r.insertedId.toHexString(),
        category,
        safety: category === "Safety escalation" ? SAFETY_TEXT : null,
      };
    }
    case "concern-act": {
      const d = await find(a.concernId, "concern");
      const c = await ownTherapist(d);
      if (["Resolved", "Closed - No Action"].includes(a.to) && !a.comment)
        throw new UserFacingError("Add a clinical comment before closing.");
      await k.updateOne(
        { _id: d._id },
        {
          $set: { status: a.to, ...(a.patientMessage ? { patientMessage: a.patientMessage } : {}) },
          $push: { actions: { at: now, by: u.name, action: a.to, comment: a.comment } } as never,
        },
      );
      if (a.to === "Follow-up Requested")
        await careTask(c, "", "Clinical Follow-up", `Follow up concern ${String(d.ref)}`, "High");
      if (a.patientMessage)
        await tellPatient(c, "Update on the concern you reported", a.patientMessage);
      await audit(u, `Concern ${a.to.toLowerCase()}`, c._id);
      return { ok: true };
    }

    /* ---------------- 05 treatment effectiveness ---------------- */
    case "insight-draft": {
      const c = await forTherapist(u, a.clientId);
      const g = (await goalsOf(c)).find((x) => x.planId === a.planId && x.goalId === a.goalId);
      if (!g) throw new UserFacingError("Goal not found.", 404);
      const nums = g.points.map((p) => Number(p.value));
      const numeric = nums.length > 0 && nums.every((n) => Number.isFinite(n));
      const sources = new Set(g.points.map((p) => p.source));
      let trend: InsightDto["trend"];
      const gaps: string[] = [];
      if (g.points.length < 2) trend = "Insufficient evidence";
      else if (!numeric || !g.unit) trend = "Not comparable";
      else {
        const diffs = nums.slice(1).map((n, i) => n - nums[i]!);
        trend = diffs.every((x) => x > 0)
          ? "Improving"
          : diffs.every((x) => x < 0)
            ? "Declining"
            : diffs.every((x) => x === 0)
              ? "Stable"
              : "Mixed";
      }
      if (g.points.length < 2)
        gaps.push("Fewer than two recorded measurements, so no trend can be shown.");
      if (sources.size > 1)
        gaps.push(
          `Measurements come from different sources (${[...sources].join(", ")}); check they are comparable.`,
        );
      const last = g.points.at(-1);
      if (last && Date.now() - new Date(last.date).getTime() > 60 * 86_400_000)
        gaps.push("No new measurement in the last 60 days.");
      if (g.points.some((p) => /report/i.test(p.source)))
        gaps.push("Some values are patient- or carer-reported, not verified.");
      const series = g.points
        .map((p) => `${p.date.slice(0, 10)}: ${p.value} ${g.unit} (${p.source})`)
        .join("; ");
      const out = await aiIf<{ narrative: string; patientSummary: string; uncertainty: string }>(
        c,
        "effectiveness-insight",
        "You describe documented change in one therapy goal for the treating clinician. 'narrative': two sentences stating only the recorded values and dates. Never predict recovery, give probabilities, diagnose or recommend treatment. 'patientSummary': one plain, encouraging but factual sentence the clinician may choose to share. 'uncertainty': one sentence on what the data cannot show.",
        `Goal: ${g.title}. Baseline ${g.baseline}, target ${g.target} ${g.unit}. Computed trend (rule): ${trend}. Recorded series: ${series || "none"}. Data gaps: ${gaps.join(" ") || "none"}.`,
        obj({ narrative: str, patientSummary: str, uncertainty: str }),
        "effectiveness_insight",
      );
      const r = await k.insertOne({
        _id: new ObjectId(),
        kind: "insight",
        clientId: c._id,
        at: now,
        planId: a.planId,
        planVersion:
          (await plansOf(c)).find(({ p }) => p._id.toHexString() === a.planId)?.p.version ?? null,
        goalId: a.goalId,
        goalTitle: g.title,
        unit: g.unit,
        baseline: g.baseline,
        target: g.target,
        points: g.points,
        trend,
        narrative:
          out?.narrative ??
          (series ? `Recorded values: ${series}.` : "No recorded measurements for this goal yet."),
        gaps,
        uncertainty:
          out?.uncertainty ?? "AI text unavailable; the recorded values are shown as entered.",
        ai: Boolean(out),
        status: "Draft",
        interpretation: "",
        interpretationNote: "",
        followUp: "None",
        share: false,
        patientSummary: out?.patientSummary ?? "",
        by: null,
      });
      await k.updateMany(
        {
          kind: "insight",
          clientId: c._id,
          goalId: a.goalId,
          status: "Draft",
          _id: { $ne: r.insertedId },
        },
        { $set: { status: "Superseded" } },
      );
      return { id: r.insertedId.toHexString() };
    }
    case "insight-decide": {
      const d = await find(a.insightId, "insight");
      const c = await ownTherapist(d);
      if (a.decision === "Approve" && !a.interpretation)
        throw new UserFacingError("Record your clinical interpretation first.");
      if (a.decision === "Approve" && a.share && !a.patientSummary)
        throw new UserFacingError("Write the summary the patient will see.");
      const status =
        a.decision === "Approve" ? "Approved" : a.decision === "Reject" ? "Rejected" : "Draft";
      await k.updateOne(
        { _id: d._id },
        {
          $set: {
            status,
            interpretation: a.interpretation,
            interpretationNote: a.interpretationNote,
            followUp: a.followUp,
            share: a.decision === "Approve" && a.share,
            patientSummary: a.patientSummary,
            by: u.name,
            decidedAt: now,
          },
        },
      );
      if (a.decision === "Approve" && a.followUp !== "None")
        await careTask(
          c,
          String(d.planId),
          "Clinical Follow-up",
          `${a.followUp}: ${String(d.goalTitle)}`,
          "Normal",
        );
      if (a.decision === "Approve" && a.share)
        await tellPatient(c, "Your therapist shared a progress update", String(d.goalTitle));
      await audit(u, `Progress insight ${status.toLowerCase()}`, c._id);
      return { ok: true };
    }

    /* ---------------- 03 multidisciplinary coordination ---------------- */
    case "coord-brief": {
      const c = await forTherapist(u, a.clientId);
      const { users, appointments } = await collections();
      const plans = await plansOf(c);
      let restricted = 0;
      const disciplines: CoordinationDto["disciplines"] = [];
      for (const n of c.needs.filter((x) => x.status !== "completed")) {
        if ((restrictedDisciplines as readonly string[]).includes(n.discipline)) {
          restricted += 1;
          continue;
        }
        const t = n.therapistId ? await users.findOne({ therapistId: n.therapistId }) : null;
        const plan = plans.find(
          ({ p }) =>
            p.needId === n.id &&
            ["Active", "Under Review", "Paused"].includes(
              plans.find((y) => y.p._id.equals(p._id))?.x?.state ?? "",
            ),
        );
        disciplines.push({
          service: n.support,
          clinician: t?.name ?? "Not yet assigned",
          goals: plan ? plan.p.goals.map((g) => plan.x?.goals?.[g.id]?.title ?? g.description) : [],
        });
      }
      const visits = (
        await appointments
          .find({ clientId: c._id, start: { $gte: now }, status: "booked" })
          .sort({ start: 1 })
          .limit(6)
          .toArray()
      ).map((v) => `${v.start.toISOString().slice(0, 16)} ${v.discipline}`);
      const tasks = (
        await (
          await collections()
        ).db
          .collection("careTasks")
          .find({ clientId: c._id, status: { $nin: ["Completed", "Cancelled"] } })
          .limit(8)
          .toArray()
      ).map((x) => `${String(x.title)} (${String(x.status)})`);
      const out =
        disciplines.length < 2
          ? null
          : await aiIf<{
              briefing: string;
              suggestions: { type: string; text: string; nextStep: string; sources: string[] }[];
            }>(
              c,
              "coordination-brief",
              "You help clinicians coordinate one participant's multidisciplinary care. 'briefing': three sentences, attributing each fact to its discipline. 'suggestions': up to 4 POTENTIAL coordination opportunities, each with type (Related goals, Timing conflict, Missing follow-up, Shared environmental need, Other), the observation, a suggested next step for human confirmation (discuss, share a summary, request an update), and the exact source labels used. Never merge goals, never change plans, never diagnose. If a discipline has no approved goals, say 'Not enough approved information' rather than guessing.",
              `Disciplines (restricted records omitted: ${restricted}):\n${disciplines.map((d) => `- ${d.service} (${d.clinician}): goals ${d.goals.join("; ") || "none approved"}`).join("\n")}\nUpcoming visits: ${visits.join("; ") || "none"}\nOpen care tasks: ${tasks.join("; ") || "none"}`,
              obj({
                briefing: str,
                suggestions: {
                  type: "array",
                  items: obj({ type: str, text: str, nextStep: str, sources: strs }),
                },
              }),
              "coordination_brief",
            );
      const suggestions = (
        out?.suggestions ??
        (disciplines.length < 2
          ? []
          : [
              {
                type: "Related goals",
                text: "More than one discipline is involved; their goals are listed side by side for review.",
                nextStep: "Consider a care-team discussion",
                sources: disciplines.map((d) => d.service),
              },
            ])
      ).map((s, i) => ({ ...s, id: `s${i + 1}`, decision: "Pending", reason: "" }));
      const r = await k.insertOne({
        _id: new ObjectId(),
        kind: "coord",
        clientId: c._id,
        at: now,
        disciplines,
        restrictedOmitted: restricted,
        briefing:
          out?.briefing ??
          (disciplines.length < 2
            ? "Only one discipline is active; no cross-discipline suggestions."
            : "AI briefing unavailable. Each discipline's approved goals are listed below."),
        ai: Boolean(out),
        suggestions,
        shares: [],
      });
      return { id: r.insertedId.toHexString() };
    }
    case "coord-decide": {
      const d = await find(a.coordId, "coord");
      await ownTherapist(d);
      if (a.decision !== "Accept" && !a.reason) throw new UserFacingError("Give a reason.");
      const suggestions = (d.suggestions as CoordinationDto["suggestions"]).map((s) =>
        s.id === a.suggestionId ? { ...s, decision: a.decision, reason: a.reason } : s,
      );
      await k.updateOne({ _id: d._id }, { $set: { suggestions } });
      return { ok: true };
    }
    case "coord-share": {
      const d = await find(a.coordId, "coord");
      const c = await ownTherapist(d);
      if (a.visibility !== "Care-team only" && sharingWithdrawn(c))
        throw new UserFacingError(
          "The patient has withdrawn consent to share. Keep this update within the care team.",
          409,
        );
      await k.updateOne(
        { _id: d._id },
        {
          $push: {
            shares: {
              id: new ObjectId().toHexString(),
              recipient: a.recipient,
              visibility: a.visibility,
              text: a.text,
              status: "Shared",
              at: now,
              by: u.name,
            },
          } as never,
        },
      );
      if (a.visibility !== "Care-team only")
        await tellPatient(c, "Your care team shared an update", a.text.slice(0, 120));
      await audit(u, `Coordination update shared (${a.visibility})`, c._id);
      return { ok: true };
    }

    /* ---------------- 07 patient assistant and clinical copilot ---------------- */
    case "chat": {
      if (u.role === "client") return patientChat(u, a.text);
      if (u.role === "therapist") return copilotChat(u, a.clientId, a.text);
      throw new UserFacingError("The assistant isn't available for this role.", 409);
    }
    case "chat-task": {
      const c = await forTherapist(u, a.clientId);
      await careTask(c, "", "Clinical Follow-up", a.title, "Normal");
      await audit(u, "Task created from copilot", c._id);
      return { ok: true };
    }
  }
}

async function appendChat(
  kind: "chat" | "copilot",
  u: UserDoc,
  clientId: ObjectId,
  msgs: ChatMessage[],
) {
  const k = await col();
  await k.updateOne(
    { kind, userId: u._id, clientId },
    {
      $setOnInsert: { _id: new ObjectId(), kind, userId: u._id, clientId, at: new Date() },
      $push: {
        messages: { $each: msgs.map((m) => ({ ...m, at: new Date() })), $slice: -40 },
      } as never,
    },
    { upsert: true },
  );
}

async function patientChat(u: UserDoc, text: string) {
  const c = await forPatient(u);
  const p = await portalView(u);
  const asked: ChatMessage = { role: "user", text, at: new Date().toISOString() };
  let reply: ChatMessage;
  if (!(await aiAllowed(c))) {
    reply = {
      role: "assistant",
      text: "You've turned AI assistance off, so I won't read your records. You can still use Visits, My care and Messages, or turn AI back on in Ask Medisense settings.",
      outcome: "Human review",
      sources: [],
      actions: [{ label: "Message my care team", target: "messages" }],
      at: "",
    };
  } else if (SAFETY.test(text) && /\b(now|today|bad|severe|can't|cannot|help)\b/i.test(text)) {
    reply = {
      role: "assistant",
      text: SAFETY_TEXT,
      outcome: "Urgent concern",
      sources: ["Medisense safety guidance"],
      actions: [{ label: "Report a concern", target: "concern" }],
      at: "",
    };
  } else if (caregiverInfo(u) && CLINICAL_RECORD.test(text)) {
    // A caregiver's relationship never opens clinical records; only what is shared with them.
    reply = {
      role: "assistant",
      text: `I can show only documents and guidance shared with your caregiver account. ${c.name.split(" ")[0]}'s clinical assessments and notes aren't shared with you, so I can't show them. You can ask the care team.`,
      outcome: "No authorised source",
      sources: [],
      actions: [{ label: "Message my care team", target: "messages" }],
      at: "",
    };
  } else if (DOSE.test(text) && DOSE_OBJ.test(text)) {
    reply = {
      role: "assistant",
      text: "I can't change your therapist's instructions. Please ask your therapist before changing the prescribed amount.",
      outcome: "Human review",
      sources: ["Your approved plan"],
      actions: [
        { label: "Open my plan", target: "care" },
        { label: "Message my care team", target: "messages" },
      ],
      at: "",
    };
  } else {
    const facts = [
      ...p.appointments
        .filter((x) => x.status === "Upcoming")
        .slice(0, 4)
        .map(
          (x) =>
            `[Appointment ${x.ref}] ${x.service} with ${x.clinician}, ${bne(x.start)} Brisbane time, ${x.mode}`,
        ),
      ...p.plans.flatMap((pl) =>
        pl.activities.map(
          (x) => `[Plan v${pl.version}] ${x.name}: ${x.frequency}, ${x.dose}. ${x.instructions}`,
        ),
      ),
      ...p.plans.flatMap((pl) =>
        pl.goals.map(
          (g) => `[Goal] ${g.title}: started ${g.baseline}, now ${g.current}, aim ${g.target}`,
        ),
      ),
      ...p.invoices
        .filter((i) => i.due > 0)
        .map(
          (i) => `[Invoice ${i.number}] ${i.status}, $${i.due.toFixed(2)} due, payer ${i.payer}`,
        ),
      ...p.referrals.map(
        (r) =>
          `[Referral ${r.ref}] ${r.status}${r.actionNeeded ? `; action needed: ${r.actionNeeded}` : ""}`,
      ),
      ...p.documents.slice(0, 5).map((d) => `[Document] ${d.title} (${d.kind}, ${d.date})`),
    ];
    const out = await aiIf<{
      answer: string;
      outcome: string;
      sources: string[];
      actions: string[];
    }>(
      c,
      "patient-assistant",
      "You are the Medisense patient assistant. Answer ONLY from the facts listed, in simple language, in 1 to 3 sentences. Cite the bracketed labels you used in 'sources'. If the facts don't answer it, outcome 'No authorised source' and say you can't verify that and offer to send it to the care team. Never diagnose, never give medical advice, never change treatment, never reveal clinical notes. 'actions' may include: visits, care, documents, payments, messages, concern, upload (use upload when a referral needs a missing document). outcome is one of Answered, Needs clarification, No authorised source, Human review.",
      `Facts:\n${facts.join("\n") || "none"}\n\nQuestion: ${text}`,
      obj({ answer: str, outcome: str, sources: strs, actions: strs }),
      "patient_assistant",
    );
    const label: Record<string, string> = {
      visits: "View appointments",
      care: "Open my plan",
      documents: "Open documents",
      upload: "Upload the missing document",
      payments: "Open payments",
      messages: "Message my care team",
      concern: "Report a concern",
    };
    reply = out
      ? {
          role: "assistant",
          text: out.answer,
          outcome: ([
            "Answered",
            "Needs clarification",
            "No authorised source",
            "Human review",
          ].includes(out.outcome)
            ? out.outcome
            : "Answered") as ChatMessage["outcome"],
          sources: out.sources,
          actions: out.actions
            .filter((x) => label[x])
            .map((x) => ({ label: label[x]!, target: x })),
          at: "",
        }
      : {
          role: "assistant",
          text: "The assistant isn't available right now. You can still use Visits, My care and Messages as usual.",
          outcome: "No authorised source",
          sources: [],
          actions: [{ label: "Message my care team", target: "messages" }],
          at: "",
        };
  }
  if (reply.outcome !== "Urgent concern" && (await aiAllowed(c))) {
    const extra = await patientProposals(u, c, p, text, caregiverInfo(u) ? "Caregiver" : "Patient");
    if (extra.proposals.length) {
      reply.text = extra.note || reply.text;
      reply.outcome = "Answered";
    }
    reply.proposals = extra.proposals;
    // An answer drawn from the plan cites the published plan itself, openable like any source.
    const plan = p.plans[0];
    const fromPlan = plan && (reply.sources ?? []).some((x) => /plan v|goal/i.test(x));
    reply.sourceDocs = [
      ...(fromPlan
        ? [
            {
              id: `PLAN-${plan.id.slice(-4).toUpperCase()}`,
              title: `${plan.service} plan`,
              version: `v${plan.version}`,
              status: "Approved" as const,
              approved: `by ${plan.clinician}`,
              module: "Treatment plans",
              audience: ["Patient" as const, "Caregiver" as const],
              snippet: plan.activities
                .map((x) => `${x.name}: ${x.frequency}, ${x.dose}. ${x.instructions}`)
                .join(" "),
            },
          ]
        : []),
      ...extra.sourceDocs,
    ];
  }
  await appendChat("chat", u, c._id, [asked, reply]);
  return { reply };
}

async function copilotChat(u: UserDoc, clientId: string, text: string) {
  const c = await forTherapist(u, clientId);
  const { db, appointments } = await collections();
  const docs = await (await col()).find({ clientId: c._id }).sort({ at: -1 }).limit(30).toArray();
  const goals = await goalsOf(c);
  const visits = await appointments
    .find({ clientId: c._id })
    .sort({ start: -1 })
    .limit(8)
    .toArray();
  const tasks = await db
    .collection("careTasks")
    .find({ clientId: c._id, status: { $nin: ["Completed", "Cancelled"] } })
    .limit(8)
    .toArray();
  const facts = [
    `[Profile] ${c.name}; services ${c.needs.map((n) => n.support).join(", ")}; precautions ${c.precautions || "none recorded"}`,
    ...goals.map(
      (g) =>
        `[Goal · approved plan] ${g.title}: baseline ${g.baseline}, target ${g.target}; measures ${g.points.map((p) => `${p.date.slice(0, 10)} ${p.value}`).join(", ") || "none"}`,
    ),
    ...visits.map((v) => `[Visit ${bne(v.start)}] ${v.discipline}, ${v.status}`),
    ...tasks.map((x) => `[Task] ${String(x.title)} (${String(x.status)})`),
    ...docs
      .filter((d) => d.kind === "concern")
      .map(
        (d) =>
          `[Concern ${String(d.ref)} · patient-reported] ${String(d.description)} (${String(d.status)})`,
      ),
    ...docs
      .filter((d) => d.kind === "checkin" && d.status === "Submitted")
      .map(
        (d) =>
          `[Check-in · patient-reported] change ${String((d.answers as CheckinAnswers).change)}, questions: ${(d.answers as CheckinAnswers).questions || "none"}`,
      ),
    ...docs
      .filter((d) => d.kind === "coachLog")
      .slice(0, 5)
      .map(
        (d) =>
          `[Home log · ${reporterOf(d).role}-reported] ${String(d.activityName)} ${String(d.result)}, difficulty ${String(d.difficulty)}`,
      ),
  ];
  const asked: ChatMessage = { role: "user", text, at: new Date().toISOString() };
  const out = await aiIf<{ answer: string; sources: string[]; proposedTask: string }>(
    c,
    "clinical-copilot",
    "You are a clinical copilot for the treating therapist. Answer from the listed records only, concise, and keep patient-reported facts labelled as such. Cite bracketed labels in 'sources'. Never diagnose or make the clinical decision; flag missing information. If a follow-up task would help, put a short task title in 'proposedTask', otherwise an empty string. A task is only a proposal.",
    `Records:\n${facts.join("\n")}\n\nTherapist asks: ${text}`,
    obj({ answer: str, sources: strs, proposedTask: str }),
    "clinical_copilot",
  );
  const reply: ChatMessage = out
    ? {
        role: "assistant",
        text: out.answer,
        outcome: "Answered",
        sources: out.sources,
        proposedTask: out.proposedTask || null,
        at: "",
      }
    : {
        role: "assistant",
        text: "The copilot isn't available right now. The records are still in the patient file.",
        outcome: "No authorised source",
        sources: [],
        proposedTask: null,
        at: "",
      };
  const extra = await copilotProposals(u, c, text, reply.proposedTask ?? null);
  reply.proposals = extra.proposals;
  reply.sourceDocs = extra.sourceDocs;
  if (extra.proposals.length) reply.proposedTask = null;
  await appendChat("copilot", u, c._id, [asked, reply]);
  return { reply };
}
