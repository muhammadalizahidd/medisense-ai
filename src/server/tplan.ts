import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { generateJson } from "@/lib/ai/engine";
import { AiError } from "@/lib/ai/types";
import { restrictedDisciplines } from "@/lib/live/records";
import {
  planMoves,
  progressShare,
  type GoalDto,
  type GoalState,
  type InterventionDto,
  type PlanAction,
  type PlanFullDto,
  type PlanRow,
  type PlanState,
} from "@/lib/live/tplan";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { audit, notify, publish } from "./live";
import { insertTask } from "./operations";
import type { ClientDoc, PlanDoc, UserDoc } from "./models";

/* ------------------------------------------------------------------ storage */

type GoalExt = Omit<
  GoalDto,
  | "id"
  | "description"
  | "baseline"
  | "target"
  | "current"
  | "points"
  | "share"
  | "closure"
  | "category"
  | "shared"
> & {
  closure: { reason: string; note: string; by: string; at: Date } | null;
  points: { value: string; date: Date; source: string; context: string; by: string }[];
  baselineAlternative: string;
};

export interface PlanExtDoc {
  _id: ObjectId;
  ref: string;
  state: PlanState;
  planType: string;
  priorities: string;
  setting: string;
  startDate: string;
  expectedEnd: string;
  informed: string;
  informedNotes: string;
  riskAcknowledged: boolean;
  sources: ObjectId[];
  noAssessmentReason: string;
  goals: Record<string, GoalExt>;
  interventions: InterventionDto[];
  coSign: { by: string; at: Date } | null;
  sharing: {
    shared: boolean;
    recipients: string[];
    goalIds: string[];
    by: string | null;
    at: Date | null;
    acknowledged: Date | null;
  };
  timeline: { at: Date; by: string; action: string; reason: string }[];
  aiGoals: { text: string; at: Date } | null;
  aiProgress: { text: string; cautions: string[]; at: Date } | null;
  supersedes: ObjectId | null;
  scenario?: string | null;
}

async function exts() {
  const { db } = await collections();
  return db.collection<PlanExtDoc>("planExt");
}

export async function nextPlanRef() {
  const { db } = await collections();
  const c = await db
    .collection<{ _id: string; seq: number }>("counters")
    .findOneAndUpdate(
      { _id: "tplan" },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" },
    );
  return `TP-${String(100 + (c?.seq ?? 1)).padStart(5, "0")}`;
}

const legacyState = (p: PlanDoc): PlanState =>
  p.status === "Active"
    ? "Active"
    : p.status === "Under Review"
      ? "Under Review"
      : p.status === "Completed"
        ? "Completed"
        : p.status === "Discontinued"
          ? "Discontinued"
          : "Draft";

export function blankPlanExt(
  p: Pick<PlanDoc, "_id" | "status">,
  ref: string,
  state?: PlanState,
): PlanExtDoc {
  return {
    _id: p._id,
    ref,
    state: state ?? legacyState(p as PlanDoc),
    planType: "Initial",
    priorities: "",
    setting: "Home",
    startDate: "",
    expectedEnd: "",
    informed: "Pending",
    informedNotes: "",
    riskAcknowledged: false,
    sources: [],
    noAssessmentReason: "",
    goals: {},
    interventions: [],
    coSign: null,
    sharing: { shared: false, recipients: [], goalIds: [], by: null, at: null, acknowledged: null },
    timeline: [],
    aiGoals: null,
    aiProgress: null,
    supersedes: null,
  };
}

async function extFor(p: PlanDoc) {
  const col = await exts();
  const found = await col.findOne({ _id: p._id });
  if (found) return found;
  const fresh = blankPlanExt(p, await nextPlanRef());
  await col.insertOne(fresh).catch(() => undefined);
  return (await col.findOne({ _id: p._id })) ?? fresh;
}

const legacyStatus = (s: PlanState): PlanDoc["status"] =>
  s === "Active"
    ? "Active"
    : s === "Under Review" || s === "Paused"
      ? "Under Review"
      : s === "Completed"
        ? "Completed"
        : s === "Discontinued" || s === "Superseded"
          ? "Discontinued"
          : "Draft";
const legacyGoal = (s: GoalState): PlanDoc["goals"][number]["status"] =>
  s === "Achieved"
    ? "Achieved"
    : s === "Revised"
      ? "Modified"
      : s === "Discontinued" || s === "Not Achieved"
        ? "Discontinued"
        : "Active";

/* ------------------------------------------------------------------ access */

const has = (u: UserDoc, ...roles: string[]) =>
  Boolean(u.staffRoles?.some((r) => roles.includes(r)));
const isLead = (u: UserDoc) => u.role === "admin" && has(u, "Clinical Lead", "Super Admin");

function viewOf(u: UserDoc, p: PlanDoc, discipline: string) {
  if (u.role === "therapist")
    return u.therapistId?.equals(p.therapistId) ? ("edit" as const) : ("none" as const);
  if (u.role !== "admin") return "none" as const;
  if (isLead(u)) return "lead" as const;
  return restrictedDisciplines.includes(discipline) ? ("status" as const) : ("status" as const);
}

async function coSignRequired(p: PlanDoc, discipline: string) {
  if (restrictedDisciplines.includes(discipline)) return true;
  const { therapists } = await collections();
  const t = await therapists.findOne({ _id: p.therapistId }, { projection: { seniority: 1 } });
  return t?.seniority === "Graduate";
}

/* ------------------------------------------------------------------ derived */

function goalDto(
  g: PlanDoc["goals"][number],
  e: GoalExt | undefined,
  sharedIds: string[],
): GoalDto {
  const x = e ?? defaultGoalExt(g);
  const share = progressShare({
    type: x.type,
    direction: x.direction,
    baseline: g.baseline,
    target: g.target,
    current: g.current || g.baseline,
  });
  return {
    id: g.id,
    title: x.title || g.description.slice(0, 60),
    description: g.description,
    category: g.domain || "Other",
    ownership: x.ownership,
    priority: x.priority,
    horizon: x.horizon,
    horizonReason: x.horizonReason,
    type: x.type,
    direction: x.direction,
    baseline: g.baseline,
    target: g.target,
    current: g.current,
    unit: x.unit,
    instrument: x.instrument,
    context: x.context,
    reviewFrequency: x.reviewFrequency,
    targetDate: x.targetDate,
    state: x.state,
    holdReason: x.holdReason,
    barriers: x.barriers,
    closure: x.closure ? { ...x.closure, at: x.closure.at.toISOString() } : null,
    achievedBy: x.achievedBy,
    interpretation: x.interpretation,
    points: [
      ...g.history.map((h) => ({
        value: h.value,
        date: h.at.toISOString(),
        source: "Signed session note",
        context: h.note,
        by: h.byName,
      })),
      ...x.points.map((p) => ({ ...p, date: p.date.toISOString() })),
    ].sort((a, b) => a.date.localeCompare(b.date)),
    share,
    shared: sharedIds.includes(g.id),
  };
}

function defaultGoalExt(g: PlanDoc["goals"][number]): GoalExt {
  const numeric = /^-?\d+(\.\d+)?$/.test(g.baseline) && /^-?\d+(\.\d+)?$/.test(g.target);
  return {
    title: g.description.slice(0, 60),
    ownership: "Shared decision",
    priority: "Medium",
    horizon: "Medium-term",
    horizonReason: "",
    type: numeric ? "Numeric" : "Observation",
    direction: numeric
      ? Number(g.target) >= Number(g.baseline)
        ? "Increase"
        : "Decrease"
      : "Descriptive",
    unit: "",
    instrument: "",
    context: "",
    reviewFrequency: "Every 4 sessions",
    targetDate: "",
    state:
      g.status === "Achieved"
        ? "Achieved"
        : g.status === "Discontinued"
          ? "Discontinued"
          : g.status === "Modified"
            ? "Revised"
            : "In Progress",
    holdReason: "",
    barriers: [],
    closure: null,
    achievedBy: null,
    interpretation: "",
    points: [],
    baselineAlternative: "",
  };
}

function blockersOf(p: PlanDoc, e: PlanExtDoc, client: ClientDoc, cs: boolean) {
  const out: string[] = [];
  if (!["Draft", "Pending Review", "Ready for Approval"].includes(e.state)) return out;
  if (!p.indication.trim()) out.push("Write the primary concern and clinical rationale.");
  if (!e.sources.length && !e.noAssessmentReason)
    out.push("Link a source assessment, or record why none applies.");
  const live = p.goals.filter(
    (g) => !["Discontinued", "Revised"].includes((e.goals[g.id] ?? defaultGoalExt(g)).state),
  );
  if (!live.length) out.push("Add at least one goal.");
  for (const g of live) {
    const x = e.goals[g.id] ?? defaultGoalExt(g);
    if (!g.baseline && !x.baselineAlternative)
      out.push(`"${x.title}": add a baseline or a documented alternative.`);
    if (
      ["Numeric", "Time", "Frequency"].includes(x.type) &&
      (!x.unit || !["Increase", "Decrease", "Maintain", "Meet threshold"].includes(x.direction))
    )
      out.push(`"${x.title}": numeric goals need a unit and a direction.`);
    if (x.type === "Validated instrument" && !x.instrument)
      out.push(`"${x.title}": name the instrument and version.`);
  }
  if (!e.interventions.length) out.push("Add at least one intervention linked to a goal.");
  if (!p.frequency.trim()) out.push("Set the recommended frequency.");
  if (!p.reviewDate) out.push("Set a review date.");
  if (p.reviewDate && e.startDate && p.reviewDate < e.startDate)
    out.push("The review date is before the start date.");
  if (e.informed === "Pending" || e.informed === "Capacity / representative review")
    out.push("Record the informed discussion and agreement.");
  if (e.informed === "Declined")
    out.push("The participant declined: record the decline instead of activating.");
  if ((client.precautions || p.precautions) && !e.riskAcknowledged)
    out.push("Acknowledge the clinical precautions.");
  if (cs && !e.coSign) out.push("Send for Clinical Lead review and co-signature.");
  return out;
}

async function load(id: ObjectId) {
  const db = await collections();
  const p = await db.plans.findOne({ _id: id });
  if (!p) throw new UserFacingError("Plan not found.", 404);
  const client = await db.clients.findOne({ _id: p.clientId });
  if (!client) throw new UserFacingError("Plan not found.", 404);
  const need = client.needs.find((n) => n.id === p.needId);
  return { db, p, client, discipline: need?.discipline ?? "Other" };
}

/* ------------------------------------------------------------------ DTO */

export async function planDetail(u: UserDoc, id: ObjectId): Promise<PlanFullDto> {
  const { db, p, client, discipline } = await load(id);
  const v = viewOf(u, p, discipline);
  if (v === "none") throw new UserFacingError("Plan not found.", 404);
  const e = await extFor(p);
  const cs = await coSignRequired(p, discipline);
  const clinical = v !== "status";
  const sourceDocs = await db.assessments.find({ _id: { $in: e.sources } }).toArray();
  const assessExt = await db.db
    .collection<{ _id: ObjectId; ref: string }>("assessExt")
    .find({ _id: { $in: e.sources } })
    .toArray();
  const versions = await db.plans
    .find(
      { clientId: p.clientId, needId: p.needId },
      { projection: { version: 1, status: 1, approved: 1 } },
    )
    .sort({ version: 1 })
    .toArray();
  const vExts = await (
    await exts()
  )
    .find({ _id: { $in: versions.map((x) => x._id) } }, { projection: { state: 1 } })
    .toArray();
  const goals = p.goals.map((g) => goalDto(g, e.goals[g.id], e.sharing.goalIds));
  return {
    id: p._id.toHexString(),
    ref: e.ref,
    clientId: client._id.toHexString(),
    participant: client.name,
    participantId: client.mrn ?? "",
    needId: p.needId,
    support: p.support,
    discipline,
    clinician: p.therapistName,
    state: e.state,
    version: p.version,
    planType: e.planType,
    rationale: clinical ? p.indication : "",
    priorities: clinical ? e.priorities : "",
    setting: e.setting,
    startDate: e.startDate,
    reviewDate: p.reviewDate,
    expectedEnd: e.expectedEnd,
    informed: e.informed,
    informedNotes: clinical ? e.informedNotes : "",
    precautions: clinical ? p.precautions || client.precautions || "" : "",
    riskAcknowledged: e.riskAcknowledged,
    frequency: p.frequency,
    duration: p.duration,
    sources: sourceDocs.map((a) => ({
      id: a._id.toHexString(),
      ref: assessExt.find((x) => x._id.equals(a._id))?.ref ?? "Assessment",
      support: a.support,
      status: a.status,
      author: a.therapistName,
      date: (a.signed?.at ?? a.createdAt).toISOString(),
    })),
    noAssessmentReason: e.noAssessmentReason,
    goals: clinical
      ? goals
      : // Readiness roles only count goals; titles, baselines and targets are clinical content.
        goals.map((g, i) => ({
          ...g,
          title: `Goal ${i + 1}`,
          description: "",
          baseline: "",
          target: "",
          current: "",
          instrument: "",
          context: "",
          interpretation: "",
          share: null,
          points: [],
          barriers: [],
          closure: g.closure ? { ...g.closure, note: "" } : null,
          holdReason: "",
        })),
    interventions: clinical
      ? e.interventions
      : e.interventions.map((i) => ({
          ...i,
          dosage: {
            sets: "",
            reps: "",
            distance: "",
            time: "",
            resistance: "",
            assistance: "",
            prompts: "",
          },
          home: null,
          precautions: "",
          stopCriteria: "",
          rationale: "",
        })),
    blockers: blockersOf(p, e, client, cs),
    coSign: { required: cs, by: e.coSign?.by ?? null, at: e.coSign?.at.toISOString() ?? null },
    signed: p.approved ? { by: p.approved.byName, at: p.approved.at.toISOString() } : null,
    sharing: {
      ...e.sharing,
      at: e.sharing.at?.toISOString() ?? null,
      acknowledged: e.sharing.acknowledged?.toISOString() ?? null,
    },
    versions: versions.map((x) => ({
      id: x._id.toHexString(),
      version: x.version,
      state: vExts.find((y) => y._id.equals(x._id))?.state ?? legacyState(x as PlanDoc),
      signedAt: x.approved?.at.toISOString() ?? null,
    })),
    timeline: e.timeline
      .map((h) => ({ ...h, at: h.at.toISOString(), reason: clinical ? h.reason : "" }))
      .reverse(),
    reviews: p.reviews.map((r) => ({
      decision: r.decision,
      notes: clinical ? r.notes : "",
      by: r.byName,
      at: r.at.toISOString(),
    })),
    aiGoals: clinical && e.aiGoals ? { ...e.aiGoals, at: e.aiGoals.at.toISOString() } : null,
    aiProgress:
      clinical && e.aiProgress ? { ...e.aiProgress, at: e.aiProgress.at.toISOString() } : null,
    contacts: [
      "Participant",
      ...(client.contacts ?? [])
        .filter((c) => c.state === "Verified" && c.contactAllowed)
        .map((c) => `${c.name} (${c.role})`),
    ],
    restricted: restrictedDisciplines.includes(discipline),
    canEdit:
      v === "edit" &&
      [
        "Draft",
        "Pending Review",
        "Ready for Approval",
        "Active",
        "Under Review",
        "Paused",
      ].includes(e.state),
    canCoSign: v === "lead" && cs && e.state === "Pending Review",
    view: clinical ? "clinical" : "status",
    moves: [...planMoves[e.state]],
  };
}

export async function planList(u: UserDoc): Promise<PlanRow[]> {
  const db = await collections();
  const mine = u.role === "therapist";
  const plans = await db.plans
    .find(mine ? { therapistId: u.therapistId ?? new ObjectId() } : {})
    .sort({ updatedAt: -1 })
    .limit(400)
    .toArray();
  const extMap = new Map(
    (await (await exts()).find({ _id: { $in: plans.map((p) => p._id) } }).toArray()).map((e) => [
      e._id.toHexString(),
      e,
    ]),
  );
  const clientIds = [...new Set(plans.map((p) => p.clientId.toHexString()))].map(
    (x) => new ObjectId(x),
  );
  const clients = await db.clients
    .find(
      mine
        ? { "needs.therapistId": u.therapistId ?? new ObjectId() }
        : { $or: [{ _id: { $in: clientIds } }, { "needs.status": "assigned" }] },
    )
    .toArray();
  const byId = new Map(clients.map((c) => [c._id.toHexString(), c]));
  const today = new Date(Date.now() + 10 * 3_600_000).toISOString().slice(0, 10);
  const rows: PlanRow[] = [];
  for (const p of plans) {
    const c = byId.get(p.clientId.toHexString()) ?? (await db.clients.findOne({ _id: p.clientId }));
    if (!c) continue;
    const discipline = c.needs.find((n) => n.id === p.needId)?.discipline ?? "Other";
    let e = extMap.get(p._id.toHexString());
    if (!e) e = await extFor(p);
    const states = p.goals.map((g) => (e.goals[g.id] ?? defaultGoalExt(g)).state);
    rows.push({
      id: p._id.toHexString(),
      ref: e.ref,
      clientId: c._id.toHexString(),
      participant: c.name,
      participantId: c.mrn ?? "",
      needId: p.needId,
      support: p.support,
      discipline,
      clinician: p.therapistName,
      state: e.state,
      version: p.version,
      goals: p.goals.length,
      achieved: states.filter((s) => s === "Achieved").length,
      reviewDate: p.reviewDate,
      reviewOverdue: Boolean(
        p.reviewDate && p.reviewDate < today && ["Active", "Under Review"].includes(e.state),
      ),
      shared: e.sharing.shared,
      restricted: restrictedDisciplines.includes(discipline),
      updatedAt: p.updatedAt.toISOString(),
    });
  }
  // Episodes accepted for treatment with no plan yet (section 3: Not Started).
  for (const c of clients) {
    for (const n of c.needs.filter(
      (x) =>
        x.status === "assigned" &&
        x.therapistId &&
        (!mine || x.therapistId.equals(u.therapistId ?? new ObjectId())),
    )) {
      if (plans.some((p) => p.clientId.equals(c._id) && p.needId === n.id)) continue;
      rows.push({
        id: null,
        ref: "—",
        clientId: c._id.toHexString(),
        participant: c.name,
        participantId: c.mrn ?? "",
        needId: n.id,
        support: n.support,
        discipline: n.discipline,
        clinician: "",
        state: "Not Started",
        version: 0,
        goals: 0,
        achieved: 0,
        reviewDate: "",
        reviewOverdue: false,
        shared: false,
        restricted: restrictedDisciplines.includes(n.discipline),
        updatedAt: c.createdAt.toISOString(),
      });
    }
  }
  return rows;
}

/** AT-01: a plan from an assigned episode, without creating another participant. */
export async function createPlan13(u: UserDoc, clientId: ObjectId, needId: string) {
  const db = await collections();
  if (u.role !== "therapist" || !u.therapistId)
    throw new UserFacingError("Only the assigned therapist creates a plan.", 409);
  const client = await db.clients.findOne({ _id: clientId });
  const need = client?.needs.find((n) => n.id === needId);
  if (!client || !need || !need.therapistId?.equals(u.therapistId))
    throw new UserFacingError("This service isn't assigned to you.", 409);
  const open = await db.plans.findOne({
    clientId,
    needId,
    status: { $in: ["Draft", "Active", "Under Review", "Revised"] },
  });
  if (open) return { id: open._id.toHexString() };
  const signed = await db.assessments
    .find({ clientId, needId, status: { $in: ["Signed", "Amended"] } })
    .sort({ createdAt: -1 })
    .toArray();
  const t = await db.therapists.findOne({ _id: u.therapistId });
  const now = new Date();
  const p: PlanDoc = {
    _id: new ObjectId(),
    clientId,
    needId,
    therapistId: u.therapistId,
    therapistName: t?.name ?? u.name,
    support: need.support,
    status: "Draft",
    version: 1,
    indication: signed[0]?.findings.slice(0, 2000) ?? "",
    goals: [],
    interventions: "",
    precautions: client.precautions ?? "",
    frequency: need.frequency ?? "",
    duration: "",
    reviewDate: "",
    approved: null,
    reviews: [],
    progressSummary: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.plans.insertOne(p);
  const e = blankPlanExt(p, await nextPlanRef(), "Draft");
  e.sources = signed.slice(0, 1).map((a) => a._id);
  e.setting =
    (need.location as string) === "Telehealth"
      ? "Telehealth"
      : (need.location as string) === "School"
        ? "School"
        : "Home";
  e.timeline.push({ at: now, by: u.name, action: "Plan created (Draft)", reason: "" });
  await (await exts()).insertOne(e);
  await audit(u, `Created ${need.support} treatment plan ${e.ref}`, clientId);
  return { id: p._id.toHexString() };
}

/* ------------------------------------------------------------------ actions */

const num = (s: string) => /^-?\d+(\.\d+)?$/.test(s.trim());

export async function planAction(u: UserDoc, id: ObjectId, action: PlanAction) {
  const { db, p, client, discipline } = await load(id);
  const v = viewOf(u, p, discipline);
  const e = await extFor(p);
  const col = await exts();
  const cs = await coSignRequired(p, discipline);
  const now = new Date();
  const setE: Partial<PlanExtDoc> = {};
  const setP: Partial<PlanDoc> = {};
  let note = "";
  let reason = "";
  const moveTo = (to: PlanState) => {
    if (!planMoves[e.state].includes(to))
      throw new UserFacingError(`A ${e.state} plan can't move to ${to}.`, 409);
    setE.state = to;
    setP.status = legacyStatus(to);
  };
  const signedLocked = !["Draft", "Pending Review", "Ready for Approval"].includes(e.state);

  if (action.type === "co-sign") {
    if (v !== "lead") throw new UserFacingError("Only a Clinical Lead co-signs.", 409);
    if (e.state !== "Pending Review")
      throw new UserFacingError("Nothing is waiting for co-signature.", 409);
    setE.coSign = { by: u.name, at: now };
    moveTo("Ready for Approval");
    note = `Reviewed and co-signed by ${u.name}`;
    reason = action.note;
  } else {
    if (v !== "edit")
      throw new UserFacingError("Only the treating clinician changes this plan.", 409);
    if (["Superseded", "Completed", "Discontinued"].includes(e.state))
      throw new UserFacingError("This plan is closed and read-only.", 409);
    const draftOnly = ["header", "goal", "intervention"].includes(action.type);
    if (draftOnly && signedLocked)
      throw new UserFacingError(
        "A signed plan isn't edited directly. Use Revise to create a new version.",
        409,
      );
    switch (action.type) {
      case "header": {
        if (action.reviewDate && action.startDate && action.reviewDate < action.startDate)
          throw new UserFacingError("The review date can't be before the start date.");
        Object.assign(setE, {
          planType: action.planType,
          priorities: action.priorities,
          setting: action.setting,
          startDate: action.startDate,
          expectedEnd: action.expectedEnd,
          informed: action.informed,
          informedNotes: action.informedNotes,
          riskAcknowledged: action.riskAcknowledged,
          noAssessmentReason: action.noAssessmentReason,
        });
        Object.assign(setP, {
          indication: action.rationale,
          reviewDate: action.reviewDate,
          frequency: action.frequency,
          duration: action.duration,
        });
        note = "Plan details saved";
        break;
      }
      case "goal": {
        const g = action.goal;
        if (["Numeric", "Time", "Frequency"].includes(g.type)) {
          if (!g.unit) throw new UserFacingError("A numeric goal needs a unit.");
          if (g.baseline && !num(g.baseline))
            throw new UserFacingError("The baseline must be a number in the goal's unit.");
          if (g.target && !num(g.target))
            throw new UserFacingError("The target must be a number in the goal's unit.");
          if (!["Increase", "Decrease", "Maintain", "Meet threshold"].includes(g.direction))
            throw new UserFacingError(
              "Choose whether the goal increases, decreases, maintains or meets a threshold.",
            );
        }
        if (g.type === "Validated instrument" && !g.instrument)
          throw new UserFacingError("Name the instrument and version.");
        if (!g.baseline && !g.baselineAlternative)
          throw new UserFacingError(
            "Add a baseline, or document an alternative (for example: not yet measurable).",
          );
        if (g.horizon === "Not specified" && !g.horizonReason)
          throw new UserFacingError("Say why no time horizon is set.");
        if (g.targetDate && e.startDate && g.targetDate < e.startDate)
          throw new UserFacingError("The target date is before the plan start.");
        const gid = g.id || randomUUID();
        const existing = p.goals.find((x) => x.id === gid);
        const base = {
          id: gid,
          description: g.description,
          domain: g.category,
          measure:
            g.type === "Validated instrument"
              ? g.instrument
              : `${g.type}${g.unit ? ` (${g.unit})` : ""}`,
          baseline: g.baseline,
          target: g.target,
          current: existing?.current ?? g.baseline,
          status: existing?.status ?? "Active",
          rationale: g.context,
          history: existing?.history ?? [],
        };
        setP.goals = existing ? p.goals.map((x) => (x.id === gid ? base : x)) : [...p.goals, base];
        const prev = e.goals[gid];
        setE.goals = {
          ...e.goals,
          [gid]: {
            ...(prev ?? defaultGoalExt(base)),
            title: g.title,
            ownership: g.ownership,
            priority: g.priority,
            horizon: g.horizon,
            horizonReason: g.horizonReason,
            type: g.type,
            direction: g.direction,
            unit: g.unit,
            instrument: g.instrument,
            context: g.context,
            reviewFrequency: g.reviewFrequency,
            targetDate: g.targetDate,
            baselineAlternative: g.baselineAlternative,
            state: prev?.state ?? "Not Started",
          },
        };
        note = `${existing ? "Goal updated" : "Goal added"}: ${g.title}`;
        break;
      }
      case "goal-state": {
        const g = p.goals.find((x) => x.id === action.goalId);
        if (!g) throw new UserFacingError("Goal not found.", 404);
        const x = e.goals[g.id] ?? defaultGoalExt(g);
        if (action.state === "On Hold" && action.reason.length < 3)
          throw new UserFacingError("Give the reason for putting the goal on hold.");
        // AT-27: a goal is achieved only when the therapist confirms it with evidence.
        if (action.state === "Achieved" && (!action.confirm || action.reason.length < 3))
          throw new UserFacingError("Confirm the goal is achieved and cite the evidence.");
        setE.goals = {
          ...e.goals,
          [g.id]: {
            ...x,
            state: action.state,
            holdReason: action.state === "On Hold" ? action.reason : "",
            achievedBy: action.state === "Achieved" ? u.name : x.achievedBy,
            interpretation: action.reason || x.interpretation,
          },
        };
        setP.goals = p.goals.map((y) =>
          y.id === g.id ? { ...y, status: legacyGoal(action.state) } : y,
        );
        note = `Goal "${x.title}" → ${action.state}`;
        reason = action.reason;
        break;
      }
      case "goal-close": {
        const g = p.goals.find((x) => x.id === action.goalId);
        if (!g) throw new UserFacingError("Goal not found.", 404);
        const x = e.goals[g.id] ?? defaultGoalExt(g);
        if (action.note.length < 3) throw new UserFacingError("Record why the goal is closing.");
        const state: GoalState =
          action.reason === "Met"
            ? "Achieved"
            : action.reason === "Partially met"
              ? "Partially Achieved"
              : action.reason === "Not met"
                ? "Not Achieved"
                : "Discontinued";
        setE.goals = {
          ...e.goals,
          [g.id]: {
            ...x,
            state,
            closure: { reason: action.reason, note: action.note, by: u.name, at: now },
          },
        };
        setP.goals = p.goals.map((y) => (y.id === g.id ? { ...y, status: legacyGoal(state) } : y));
        note = `Goal closed: ${x.title} (${action.reason})`;
        reason = action.note;
        break;
      }
      case "barrier": {
        const g = p.goals.find((x) => x.id === action.goalId);
        if (!g) throw new UserFacingError("Goal not found.", 404);
        const x = e.goals[g.id] ?? defaultGoalExt(g);
        setE.goals = {
          ...e.goals,
          [g.id]: { ...x, barriers: [...x.barriers, { type: action.barrier, note: action.note }] },
        };
        note = `Barrier on "${x.title}": ${action.barrier}`;
        break;
      }
      case "measure": {
        const g = p.goals.find((x) => x.id === action.goalId);
        if (!g) throw new UserFacingError("Goal not found.", 404);
        const x = e.goals[g.id] ?? defaultGoalExt(g);
        if (["Numeric", "Time", "Frequency"].includes(x.type) && !num(action.value))
          throw new UserFacingError(`Enter a number in ${x.unit || "the goal's unit"}.`);
        setE.goals = {
          ...e.goals,
          [g.id]: {
            ...x,
            points: [
              ...x.points,
              {
                value: action.value,
                date: now,
                source: action.source,
                context: action.context,
                by: u.name,
              },
            ],
            interpretation: action.interpretation || x.interpretation,
            state: x.state === "Not Started" ? "In Progress" : x.state,
          },
        };
        setP.goals = p.goals.map((y) => (y.id === g.id ? { ...y, current: action.value } : y));
        // AT-27: reaching the target only marks a candidate; the clinician confirms.
        const share = progressShare({
          type: x.type,
          direction: x.direction,
          baseline: g.baseline,
          target: g.target,
          current: action.value,
        });
        note = `Measurement on "${x.title}": ${action.value}${x.unit ? ` ${x.unit}` : ""}${share !== null && share >= 1 ? " (target reached: confirm achievement)" : ""}`;
        break;
      }
      case "intervention": {
        const i = action.intervention;
        const goalIds = new Set(p.goals.map((g) => g.id));
        if (i.goalIds.some((g) => !goalIds.has(g)))
          throw new UserFacingError("Link interventions to goals in this plan.");
        if (i.dosage.reps && !num(i.dosage.reps))
          throw new UserFacingError("Repetitions must be a number.");
        if (i.dosage.sets && !num(i.dosage.sets))
          throw new UserFacingError("Sets must be a number.");
        if (i.mode === "Telehealth" && /manual|hands-on|transfer practice/i.test(i.name))
          throw new UserFacingError(
            "This intervention may not suit telehealth: confirm the modality or choose in person.",
          );
        const iid = i.id || randomUUID();
        const item: InterventionDto = { ...i, id: iid };
        setE.interventions = e.interventions.some((x) => x.id === iid)
          ? e.interventions.map((x) => (x.id === iid ? item : x))
          : [...e.interventions, item];
        setP.interventions = (setE.interventions ?? []).map((x) => x.name).join("; ");
        note = `Intervention ${e.interventions.some((x) => x.id === iid) ? "updated" : "added"}: ${i.name}`;
        break;
      }
      case "move": {
        if (action.to === "Pending Review") {
          if (!cs)
            throw new UserFacingError("This service doesn't need a Clinical Lead review.", 409);
        }
        if (action.to === "Ready for Approval") {
          const left = blockersOf(p, { ...e, state: "Draft" }, client, cs).filter(
            (b) => !b.startsWith("Send for Clinical Lead"),
          );
          if (left.length)
            throw new UserFacingError(`Not ready: ${left.slice(0, 3).join(" ")}`, 409);
          if (cs && !e.coSign)
            throw new UserFacingError("Send it for Clinical Lead review first.", 409);
        }
        if (action.to === "Paused" && action.reason.length < 3)
          throw new UserFacingError("Give the hold reason.");
        if (action.to === "Discontinued" && action.reason.length < 3)
          throw new UserFacingError("Record the rationale for discontinuing.");
        moveTo(action.to);
        note = `${e.state} → ${action.to}`;
        reason = action.reason;
        break;
      }
      case "sign": {
        if (e.state !== "Ready for Approval")
          throw new UserFacingError("Validate the plan first (Ready for Approval).", 409);
        const left = blockersOf(p, { ...e, state: "Draft" }, client, cs);
        if (left.length)
          throw new UserFacingError(`Before signing: ${left.slice(0, 3).join(" ")}`, 409);
        moveTo("Active");
        setP.approved = { byName: u.name, at: now };
        for (const [gid, x] of Object.entries(e.goals))
          if (x.state === "Not Started")
            setE.goals = { ...(setE.goals ?? e.goals), [gid]: { ...x, state: "In Progress" } };
        if (e.supersedes) {
          // A newly signed version replaces the previous one, which stays read-only (AT-13).
          await col.updateOne(
            { _id: e.supersedes },
            {
              $set: { state: "Superseded" },
              $push: {
                timeline: {
                  at: now,
                  by: u.name,
                  action: `Superseded by version ${p.version}`,
                  reason: "",
                },
              },
            },
          );
          await db.plans.updateOne(
            { _id: e.supersedes },
            { $set: { status: "Discontinued", updatedAt: now } },
          );
        }
        await insertTask(u, {
          title: `Arrange agreed appointments: ${client.name} (${p.support}, ${p.frequency || "as planned"})`,
          category: "Scheduling",
          status: "New",
          priority: "Normal",
          urgentReason: "",
          team: "Scheduling",
          assigneeId: null,
          assigneeName: null,
          related: {
            kind: "Participant",
            ref: client.mrn ?? client.name,
            label: client.name,
            href: `/care/plans/${p._id.toHexString()}`,
          },
          clientId: client._id,
          referralId: null,
          appointmentId: null,
          participant: client.name,
          service: p.support,
          discipline,
          locationType: e.setting,
          dueAt: new Date(now.getTime() + 2 * 86_400_000),
          sla: "Standard",
          visibility: "Internal",
          source: "Rule",
          ruleCode: "AUT-06",
          ruleVersion: 1,
          idemKey: `plan-activated:${p._id.toHexString()}:v${p.version}`,
          restrictedNote: null,
          recordingHref: null,
          suggestion: false,
          scenario: null,
          checklist: [
            { label: "Book the agreed frequency" },
            { label: "Check service readiness and funding" },
          ],
          historyNote: `Plan ${e.ref} v${p.version} activated`,
        }).catch(() => undefined);
        note = `Signed and activated by ${u.name} (version ${p.version})`;
        break;
      }
      case "review": {
        if (!["Active", "Under Review", "Paused"].includes(e.state))
          throw new UserFacingError("Only an active plan is reviewed.", 409);
        if (action.decision === "Continue" && !action.nextReviewDate)
          throw new UserFacingError("Set the next review date.");
        if (action.decision === "Revise") {
          await reviseVersion(u, p, e, action.notes);
          note = "Reviewed: revise (new draft version created)";
        } else {
          const to: PlanState =
            action.decision === "Continue"
              ? "Active"
              : action.decision === "Pause"
                ? "Paused"
                : action.decision === "Complete"
                  ? "Completed"
                  : "Discontinued";
          if (to !== e.state) moveTo(to);
          if (action.decision === "Continue") setP.reviewDate = action.nextReviewDate;
          note = `Reviewed: ${action.decision}`;
          if (to === "Completed" || to === "Discontinued") {
            await insertTask(u, {
              title: `Closure checks: ${client.name} (${p.support})`,
              category: "Care Coordination",
              status: "New",
              priority: "Normal",
              urgentReason: "",
              team: "Finance",
              assigneeId: null,
              assigneeName: null,
              related: {
                kind: "Participant",
                ref: client.mrn ?? client.name,
                label: client.name,
                href: `/care/plans/${p._id.toHexString()}`,
              },
              clientId: client._id,
              referralId: null,
              appointmentId: null,
              participant: client.name,
              service: p.support,
              discipline,
              locationType: null,
              dueAt: new Date(now.getTime() + 3 * 86_400_000),
              sla: "Standard",
              visibility: "Team Only",
              source: "Rule",
              ruleCode: "AUT-13",
              ruleVersion: 1,
              idemKey: null,
              restrictedNote: null,
              recordingHref: null,
              suggestion: false,
              scenario: null,
              checklist: [
                { label: "Check service records" },
                { label: "Close outstanding operational items" },
              ],
              historyNote: `Plan ${to.toLowerCase()}`,
            }).catch(() => undefined);
          }
        }
        await db.plans.updateOne(
          { _id: p._id },
          {
            $push: {
              reviews: {
                decision:
                  action.decision === "Pause"
                    ? "Continue"
                    : action.decision === "Complete"
                      ? "Discharge"
                      : action.decision === "Discontinue"
                        ? "Transfer"
                        : action.decision,
                notes: action.notes,
                byName: u.name,
                at: now,
              },
            },
          },
        );
        reason = action.notes;
        break;
      }
      case "revise": {
        if (!["Active", "Under Review", "Paused"].includes(e.state))
          throw new UserFacingError("Only a signed plan is revised.", 409);
        const nid = await reviseVersion(u, p, e, action.reason);
        note = "New draft version created";
        reason = action.reason;
        await col.updateOne(
          { _id: p._id },
          { $push: { timeline: { at: now, by: u.name, action: note, reason } } },
        );
        return { ok: true, id: nid };
      }
      case "decline": {
        // Case H: the participant declines; the decision and next steps are recorded.
        setE.informed = "Declined";
        setE.informedNotes = action.notes;
        if (!["Discontinued"].includes(e.state)) {
          setE.state = "Discontinued";
          setP.status = "Discontinued";
        }
        note = "Participant declined the proposed plan; closed without treatment";
        reason = action.notes;
        break;
      }
      case "share": {
        if (!["Active", "Under Review"].includes(e.state))
          throw new UserFacingError("Share once the plan is signed and active.", 409);
        const allowed = new Set([
          "Participant",
          ...(client.contacts ?? [])
            .filter((c) => c.state === "Verified" && c.contactAllowed)
            .map((c) => `${c.name} (${c.role})`),
        ]);
        if (action.recipients.some((r) => !allowed.has(r)))
          throw new UserFacingError("Share only with verified, authorised recipients.", 409);
        setE.sharing = {
          shared: true,
          recipients: action.recipients,
          goalIds: action.goalIds,
          by: u.name,
          at: now,
          acknowledged: null,
        };
        note = `Shared ${action.goalIds.length} goal(s) with ${action.recipients.join(", ")}`;
        await notify([client.userId], {
          title: "Your treatment goals are ready to view",
          body: `${action.goalIds.length} goal${action.goalIds.length === 1 ? "" : "s"} for ${p.support.toLowerCase()}.`,
          href: "/mobile/patient",
        });
        break;
      }
      case "revoke":
        setE.sharing = { ...e.sharing, shared: false };
        note = "Sharing revoked";
        break;
      case "ai-goals": {
        const out = await aiGoals(p, client.name, action.notes);
        setE.aiGoals = { text: out, at: now };
        note = "AI drafted goal wording (needs your edit)";
        break;
      }
      case "ai-progress": {
        const out = await aiProgress(p, e);
        setE.aiProgress = { ...out, at: now };
        note = "AI progress summary drafted";
        break;
      }
    }
  }
  if (Object.keys(setP).length)
    await db.plans.updateOne({ _id: p._id }, { $set: { ...setP, updatedAt: now } });
  await col.updateOne(
    { _id: p._id },
    { $set: setE, $push: { timeline: { at: now, by: u.name, action: note, reason } } },
  );
  await audit(u, `Plan ${e.ref}: ${note}`, client._id);
  const { users } = await collections();
  await publish(
    (
      await users
        .find({ role: { $in: ["admin", "therapist"] } }, { projection: { _id: 1 } })
        .toArray()
    ).map((x) => x._id),
    "care",
    { clientId: client._id.toHexString(), plan: p._id.toHexString() },
  );
  return { ok: true };
}

async function reviseVersion(u: UserDoc, p: PlanDoc, e: PlanExtDoc, reason: string) {
  const db = await collections();
  const open = await db.plans.findOne({
    clientId: p.clientId,
    needId: p.needId,
    version: p.version + 1,
  });
  if (open) return open._id.toHexString();
  const now = new Date();
  const copy: PlanDoc = {
    ...p,
    _id: new ObjectId(),
    version: p.version + 1,
    status: "Draft",
    approved: null,
    reviews: [],
    createdAt: now,
    updatedAt: now,
  };
  await db.plans.insertOne(copy);
  const ne: PlanExtDoc = {
    ...e,
    _id: copy._id,
    ref: e.ref,
    state: "Draft",
    planType: "Revised",
    coSign: null,
    supersedes: p._id,
    sharing: { ...e.sharing, shared: false },
    timeline: [
      {
        at: now,
        by: u.name,
        action: `Version ${copy.version} drafted from version ${p.version}`,
        reason,
      },
    ],
    aiGoals: null,
    aiProgress: null,
  };
  await (await exts()).insertOne(ne);
  return copy._id.toHexString();
}

/* ------------------------------------------------------------------ AI (section 12) */

async function aiGoals(p: PlanDoc, name: string, notes: string) {
  try {
    const out = await generateJson("plan-goals", {
      system:
        "You help an allied health clinician word treatment goals. Turn their notes into 2-4 draft SMART goal statements in plain words, using the participant's priorities. Do not invent baselines, targets, numbers, doses or diagnoses: leave a [baseline] or [target] placeholder where the clinician must decide. The clinician edits and approves every goal.",
      user: `Participant: ${name}. Service: ${p.support}.\nClinician notes:\n${notes}`,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["goals"],
        properties: { goals: { type: "array", items: { type: "string" } } },
      },
      schemaName: "plan_goals",
      maxTokens: 700,
    });
    return (JSON.parse(out.text) as { goals: string[] }).goals
      .map((g, i) => `${i + 1}. ${g}`)
      .join("\n");
  } catch (error) {
    if (error instanceof AiError)
      throw new UserFacingError(`AI isn't available right now: ${error.message}`, 409);
    throw new UserFacingError("The AI answer couldn't be read. Try again.", 409);
  }
}

async function aiProgress(p: PlanDoc, e: PlanExtDoc) {
  const facts = p.goals.flatMap((g, gi) => {
    const x = e.goals[g.id] ?? defaultGoalExt(g);
    return [
      `[G${gi + 1}] ${x.title}: ${x.type}, ${x.direction}, baseline ${g.baseline} ${x.unit}, target ${g.target} ${x.unit}, status ${x.state}`,
      ...x.points.map(
        (pt, pi) =>
          `[G${gi + 1}.${pi + 1}] ${pt.date.toISOString().slice(0, 10)} ${pt.value} ${x.unit} (${pt.source}; ${pt.context})`,
      ),
      ...g.history.map(
        (h, hi) =>
          `[G${gi + 1}.S${hi + 1}] ${h.at.toISOString().slice(0, 10)} ${h.value} (signed session note)`,
      ),
    ];
  });
  try {
    const out = await generateJson("plan-progress", {
      system:
        "Summarise progress against each goal from the documented measurements only, citing the bracketed tags. It is not a recovery score. Do not compare measurements taken with different methods or units, do not compute percentages for categorical goals, and flag thin or non-comparable data as cautions. The clinician interprets and approves.",
      user: facts.join("\n"),
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["summary", "cautions"],
        properties: {
          summary: { type: "string" },
          cautions: { type: "array", items: { type: "string" } },
        },
      },
      schemaName: "plan_progress",
      maxTokens: 900,
    });
    const parsed = JSON.parse(out.text) as { summary: string; cautions: string[] };
    return { text: parsed.summary, cautions: parsed.cautions.slice(0, 5) };
  } catch (error) {
    if (error instanceof AiError)
      throw new UserFacingError(`AI isn't available right now: ${error.message}`, 409);
    throw new UserFacingError("The AI answer couldn't be read. Try again.", 409);
  }
}
