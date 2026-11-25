import "server-only";
import { can } from "./permissions";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { generateJson } from "@/lib/ai/engine";
import { AiError } from "@/lib/ai/types";
import {
  goalPercent,
  outOfRange,
  reportTemplates,
  type EpisodeAction,
  type EpisodeFull,
  type EpisodeRow,
  type EpisodeState,
  type GoalProgress,
  type Observation,
  type ReportAction,
  type ReportFull,
  type ReportRow,
  type ReportState,
  type ReportType,
  type ReviewDto,
} from "@/lib/live/progress";
import { restrictedDisciplines } from "@/lib/live/records";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { audit, notify, publish } from "./live";
import type { ClientDoc, PlanDoc, UserDoc } from "./models";
import { insertTask } from "./operations";

/* ------------------------------------------------------------------ storage */

export interface OutcomeDoc {
  _id: ObjectId;
  ref: string;
  clientId: ObjectId;
  needId: string;
  goalId: string | null;
  domain: string;
  method: string;
  instrument: string;
  licensed: boolean;
  raw: string;
  unit: string;
  date: Date;
  planned: boolean;
  setting: string;
  conditions: string;
  source: string;
  sourceLink: { label: string; href: string } | null;
  status: string;
  notAssessable: string;
  interpretation: string;
  assessor: string;
  history: { at: Date; by: string; action: string }[];
  seeded?: boolean;
}

export interface EpisodeDoc {
  _id: string;
  clientId: ObjectId;
  needId: string;
  state: EpisodeState;
  reviewDue: Date | null;
  goalStatus: Record<string, { status: string; by: string; at: Date }>;
  revisions: Record<string, { at: Date; by: string; from: string; to: string; reason: string }[]>;
  reviews: {
    id: string;
    trigger: string;
    reason: string;
    state: string;
    domains: string[];
    items: {
      domain: string;
      result: string;
      method: string;
      source: string;
      setting: string;
      notAssessed: string;
    }[];
    visits: { setting: string; at: Date }[];
    interpretation: string;
    outcome: string;
    signed: { by: string; at: Date } | null;
    dueAt: Date;
  }[];
  discharge: {
    outcome: string;
    reason: string;
    followUp: string;
    exceptions: string;
    checklist: Record<string, boolean>;
    signed: { by: string; at: Date } | null;
  } | null;
  timeline: { at: Date; by: string; action: string; reason: string }[];
  seeded?: boolean;
}

export interface ReportDoc {
  _id: ObjectId;
  ref: string;
  episodeId: string;
  clientId: ObjectId;
  needId: string;
  therapistId: ObjectId;
  type: ReportType;
  purpose: string;
  periodStart: string;
  periodEnd: string;
  status: ReportState;
  version: number;
  supersedes: ObjectId | null;
  sections: ReportFull["sections"];
  limitations: string;
  gaps: { id: string; text: string; resolved: boolean; resolution: string }[];
  coSignRequired: boolean;
  coSign: { status: string; by: string; note: string; at: Date | null };
  signed: { by: string; at: Date } | null;
  releases: { recipient: string; name: string; at: Date; version: number; channel: string }[];
  dueAt: Date;
  requestedBy: string;
  timeline: { at: Date; by: string; action: string; reason: string }[];
  createdAt: Date;
  seeded?: boolean;
}

const DAY = 86_400_000;
export const DISCHARGE_ITEMS = [
  "All sessions closed",
  "Final report signed",
  "Referrals and handover sent",
  "Billing reconciled",
];

export async function stores() {
  const { db } = await collections();
  return {
    outcomes: db.collection<OutcomeDoc>("outcomes"),
    episodes: db.collection<EpisodeDoc>("progressEpisodes"),
    reports: db.collection<ReportDoc>("clinicalReports"),
    counters: db.collection<{ _id: string; seq: number }>("counters"),
  };
}

export async function nextRef(kind: "outcome" | "report") {
  const { counters } = await stores();
  const c = await counters.findOneAndUpdate(
    { _id: kind === "outcome" ? "outcomeRef" : "reportRef" },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" },
  );
  return `${kind === "outcome" ? "OUT" : "RPT"}-${String(c?.seq ?? 1).padStart(5, "0")}`;
}

export const episodeKey = (clientId: ObjectId | string, needId: string) =>
  `${String(clientId)}.${needId}`;
function parseKey(key: string) {
  const i = key.indexOf(".");
  if (i < 0 || !ObjectId.isValid(key.slice(0, i)))
    throw new UserFacingError("Episode not found.", 404);
  return { clientId: new ObjectId(key.slice(0, i)), needId: key.slice(i + 1) };
}

/* ------------------------------------------------------------------ access */

/** The lead view of progress and reports: the progress.oversight permission. */
const isLead = (u: UserDoc) => u.role === "admin" && can(u, "progress.oversight");

function viewOf(
  u: UserDoc,
  therapistId: ObjectId | null | undefined,
  discipline: string,
): "edit" | "lead" | "status" | "none" {
  if (u.role === "therapist")
    return therapistId && u.therapistId?.equals(therapistId) ? "edit" : "none";
  if (u.role !== "admin") return "none";
  // Supervisors see clinical content, except psychology and trauma, which stay restricted.
  if (isLead(u) && !restrictedDisciplines.includes(discipline)) return "lead";
  return "status";
}

/* ------------------------------------------------------------------ derived */

const dirMap: Record<string, string> = {
  Increase: "Higher",
  Decrease: "Lower",
  Maintain: "Target Range",
  Descriptive: "Categorical",
};

async function goalsFor(
  db: Awaited<ReturnType<typeof collections>>,
  clientId: ObjectId,
  needId: string,
) {
  const plan = await db.plans.findOne(
    { clientId, needId, status: { $in: ["Active", "Under Review", "Completed"] } },
    { sort: { version: -1 } },
  );
  const anyPlan =
    plan ?? (await db.plans.findOne({ clientId, needId }, { sort: { createdAt: -1 } }));
  const ext = anyPlan
    ? await db.db
        .collection<{
          _id: ObjectId;
          state?: string;
          goals?: Record<
            string,
            {
              title?: string;
              unit?: string;
              direction?: string;
              type?: string;
              category?: string;
              state?: string;
              context?: string;
            }
          >;
        }>("planExt")
        .findOne({ _id: anyPlan._id })
    : null;
  return { plan: anyPlan as PlanDoc | null, ext };
}

function buildGoals(
  plan: PlanDoc | null,
  ext: {
    goals?: Record<
      string,
      {
        title?: string;
        unit?: string;
        direction?: string;
        type?: string;
        category?: string;
        state?: string;
      }
    >;
  } | null,
  outcomes: OutcomeDoc[],
  ep: EpisodeDoc | null,
): GoalProgress[] {
  return (plan?.goals ?? []).map((g) => {
    const x = ext?.goals?.[g.id];
    const obs = outcomes
      .filter(
        (o) =>
          o.goalId === g.id &&
          ["Verified", "Corrected"].includes(o.status) &&
          !o.notAssessable &&
          !o.planned,
      )
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    const first = obs[0];
    const last = obs.at(-1);
    const direction =
      x?.type === "Ordinal" || x?.type === "Observation"
        ? "Categorical"
        : (dirMap[x?.direction ?? ""] ?? "Clinician Judgement");
    const baseline = first?.raw ?? g.baseline;
    const current = last?.raw ?? g.current;
    const comparable =
      !first || !last || (first.method === last.method && first.unit === last.unit);
    const pct = goalPercent({ direction, baseline, current, target: g.target, comparable });
    const warnings: string[] = [];
    if (!comparable)
      warnings.push(
        first?.method !== last?.method
          ? `Method changed (${first?.method} to ${last?.method}): compare with care`
          : `Unit changed (${first?.unit} to ${last?.unit}): results aren't comparable`,
      );
    if (obs.some((o) => outOfRange(o.raw, o.unit)))
      warnings.push("A value is outside the expected range: verify it");
    const nums = obs.map((o) => Number(o.raw)).filter((n) => !Number.isNaN(n));
    let status = ep?.goalStatus[g.id]?.status ?? "";
    if (!status) {
      if (obs.length < 2 || direction === "Categorical")
        status = obs.length ? "Unable to Determine" : "Not Started";
      else {
        const d = (nums.at(-1) ?? 0) - (nums[0] ?? 0);
        status =
          direction === "Lower"
            ? d < 0
              ? "Improving"
              : d > 0
                ? "Declining"
                : "Stable"
            : d > 0
              ? "Improving"
              : d < 0
                ? "Declining"
                : "Stable";
      }
    }
    return {
      id: g.id,
      title: x?.title ?? g.description,
      domain: x?.category ?? g.domain,
      direction,
      unit: x?.unit ?? last?.unit ?? "",
      method: last?.method ?? "",
      baseline,
      current,
      target: g.target,
      state: x?.state ?? String(g.status),
      status,
      percent: pct.percent,
      notCalculable: pct.reason,
      warnings,
      points: obs
        .filter((o) => !Number.isNaN(Number(o.raw)))
        .map((o) => ({
          date: o.date.toISOString(),
          value: Number(o.raw),
          label: `${o.method}${o.conditions ? `, ${o.conditions}` : ""}`,
        })),
      revisions: (ep?.revisions[g.id] ?? []).map((r) => ({ ...r, at: r.at.toISOString() })),
    };
  });
}

function obsDto(o: OutcomeDoc, goalTitle: string): Observation {
  const flags: string[] = [];
  if (outOfRange(o.raw, o.unit)) flags.push("Outside expected range: verify");
  if (o.method === "Instrument" && !o.licensed) flags.push("Instrument licence not recorded");
  if (o.planned) flags.push("Planned measurement");
  return {
    id: o._id.toHexString(),
    ref: o.ref,
    goalId: o.goalId,
    goalTitle,
    domain: o.domain,
    method: o.method,
    instrument: o.instrument,
    licensed: o.licensed,
    raw: o.raw,
    unit: o.unit,
    date: o.date.toISOString(),
    setting: o.setting,
    conditions: o.conditions,
    source: o.source,
    sourceLink: o.sourceLink,
    status: o.status,
    notAssessable: o.notAssessable,
    interpretation: o.interpretation,
    assessor: o.assessor,
    flags,
  };
}

function stateOf(
  ep: EpisodeDoc | null,
  plan: PlanDoc | null,
  hasAssessment: boolean,
): EpisodeState {
  if (ep?.state) return ep.state;
  if (plan) return "Active Treatment";
  return hasAssessment ? "Assessment Only" : "Active Treatment";
}

/* ------------------------------------------------------------------ episodes */

export async function episodeList(u: UserDoc): Promise<EpisodeRow[]> {
  const db = await collections();
  const s = await stores();
  if (u.role !== "therapist" && u.role !== "admin") return [];
  const q =
    u.role === "therapist"
      ? { "needs.therapistId": u.therapistId ?? new ObjectId() }
      : { "needs.therapistId": { $ne: null } };
  const clients = await db.clients.find(q).toArray();
  const ther = await db.therapists.find({}, { projection: { name: 1 } }).toArray();
  const plans = await db.plans
    .find({ clientId: { $in: clients.map((c) => c._id) } })
    .sort({ version: -1 })
    .toArray();
  const exts = await db.db
    .collection<{
      _id: ObjectId;
      goals?: Record<
        string,
        {
          title?: string;
          unit?: string;
          direction?: string;
          type?: string;
          category?: string;
          state?: string;
        }
      >;
    }>("planExt")
    .find({ _id: { $in: plans.map((p) => p._id) } })
    .toArray();
  const outs = await s.outcomes.find({ clientId: { $in: clients.map((c) => c._id) } }).toArray();
  const eps = await s.episodes.find({ clientId: { $in: clients.map((c) => c._id) } }).toArray();
  const reps = await s.reports
    .find({ clientId: { $in: clients.map((c) => c._id) } })
    .sort({ createdAt: -1 })
    .toArray();
  const assessed = new Set(
    (
      await db.assessments
        .find(
          { clientId: { $in: clients.map((c) => c._id) } },
          { projection: { clientId: 1, needId: 1 } },
        )
        .toArray()
    ).map((a) => `${a.clientId.toHexString()}.${a.needId}`),
  );
  const rows: EpisodeRow[] = [];
  const now = Date.now();
  for (const c of clients)
    for (const n of c.needs.filter(
      (x) =>
        x.therapistId &&
        (u.role === "admin" || x.therapistId.equals(u.therapistId ?? new ObjectId())),
    )) {
      const key = episodeKey(c._id, n.id);
      if (viewOf(u, n.therapistId, n.discipline) === "none") continue;
      const plan =
        plans.find(
          (p) =>
            p.clientId.equals(c._id) &&
            p.needId === n.id &&
            ["Active", "Under Review", "Completed"].includes(String(p.status)),
        ) ??
        plans.find((p) => p.clientId.equals(c._id) && p.needId === n.id) ??
        null;
      const ext = plan ? (exts.find((x) => x._id.equals(plan._id)) ?? null) : null;
      const ep = eps.find((e) => e._id === key) ?? null;
      const goals = buildGoals(
        plan,
        ext,
        outs.filter((o) => o.clientId.equals(c._id) && o.needId === n.id),
        ep,
      );
      const due = ep?.reviewDue ?? null;
      const rep = reps.find((r) => r.episodeId === key);
      const improving = goals.filter((g) => g.status === "Improving").length;
      rows.push({
        id: key,
        participant: c.name,
        participantId: c.mrn ?? "",
        discipline: n.discipline,
        service: n.support ?? n.discipline,
        clinician: ther.find((t) => n.therapistId && t._id.equals(n.therapistId))?.name ?? "",
        state: stateOf(ep, plan, assessed.has(key)),
        goals: goals.length,
        improving,
        achieved: goals.filter((g) => g.state === "Achieved").length,
        progress: !goals.length
          ? "No goals"
          : improving
            ? `${improving} improving`
            : goals.some((g) => g.status === "Declining")
              ? "Declining"
              : "Stable",
        reviewDue: due?.toISOString() ?? null,
        reviewOverdue: Boolean(due && due.getTime() < now),
        reportStatus: rep ? `${rep.type}: ${rep.status}` : "No report",
        restricted: restrictedDisciplines.includes(n.discipline),
      });
    }
  return rows;
}

async function loadEpisode(key: string) {
  const db = await collections();
  const { clientId, needId } = parseKey(key);
  const client = await db.clients.findOne({ _id: clientId });
  const need = client?.needs.find((n) => n.id === needId);
  if (!client || !need) throw new UserFacingError("Episode not found.", 404);
  const s = await stores();
  const ep = await s.episodes.findOne({ _id: key });
  return { db, s, client, need, ep, clientId, needId };
}

export async function episodeDetail(u: UserDoc, key: string): Promise<EpisodeFull> {
  const { db, s, client, need, ep, clientId, needId } = await loadEpisode(key);
  const v = viewOf(u, need.therapistId, need.discipline);
  if (v === "none") throw new UserFacingError("Episode not found.", 404);
  const clinical = v !== "status";
  const { plan, ext } = await goalsFor(db, clientId, needId);
  const outs = await s.outcomes.find({ clientId, needId }).sort({ date: -1 }).toArray();
  const goals = buildGoals(plan, ext, outs, ep);
  const t = need.therapistId
    ? await db.therapists.findOne({ _id: need.therapistId }, { projection: { name: 1 } })
    : null;
  const hasAssess = Boolean(
    await db.assessments.findOne({ clientId, needId }, { projection: { _id: 1 } }),
  );
  const reports = await reportRows(u, { episodeId: key });
  const d = ep?.discharge;
  const checklist = DISCHARGE_ITEMS.map((item) => ({ item, done: Boolean(d?.checklist[item]) }));
  return {
    id: key,
    view: v,
    participant: client.name,
    participantId: client.mrn ?? "",
    discipline: need.discipline,
    service: need.support ?? need.discipline,
    clinician: t?.name ?? "",
    state: stateOf(ep, plan, hasAssess),
    planId: plan?._id.toHexString() ?? null,
    goals: clinical
      ? goals
      : goals.map((g) => ({
          ...g,
          title: "Goal",
          baseline: "",
          current: "",
          target: "",
          points: [],
          warnings: [],
          revisions: [],
        })),
    observations: clinical
      ? outs.map((o) =>
          obsDto(o, goals.find((g) => g.id === o.goalId)?.title ?? "Not linked to a goal"),
        )
      : [],
    reviews: (ep?.reviews ?? []).map((r) => ({
      ...r,
      items: clinical ? r.items : [],
      interpretation: clinical ? r.interpretation : "",
      visits: r.visits.map((x) => ({ ...x, at: x.at.toISOString() })),
      signed: r.signed ? { by: r.signed.by, at: r.signed.at.toISOString() } : null,
      dueAt: r.dueAt.toISOString(),
    })) as ReviewDto[],
    reports,
    discharge: {
      outcome: clinical ? (d?.outcome ?? "") : "",
      reason: d?.reason ?? "",
      followUp: clinical ? (d?.followUp ?? "") : "",
      exceptions: clinical ? (d?.exceptions ?? "") : "",
      checklist,
      clinical: d?.signed ? "Discharged" : "Open",
      financial: d?.checklist["Billing reconciled"]
        ? "Closed"
        : d?.signed
          ? "Pending reconciliation"
          : "Open",
      signed: d?.signed ? { by: d.signed.by, at: d.signed.at.toISOString() } : null,
    },
    timeline: (ep?.timeline ?? [])
      .map((h) => ({ ...h, at: h.at.toISOString(), reason: clinical ? h.reason : "" }))
      .reverse(),
    canEdit: v === "edit",
  };
}

function blankEpisode(key: string, clientId: ObjectId, needId: string): EpisodeDoc {
  return {
    _id: key,
    clientId,
    needId,
    state: "Active Treatment",
    reviewDue: null,
    goalStatus: {},
    revisions: {},
    reviews: [],
    discharge: null,
    timeline: [],
  };
}

export async function episodeAction(u: UserDoc, key: string, a: EpisodeAction) {
  const { db, s, client, need, ep, clientId, needId } = await loadEpisode(key);
  const v = viewOf(u, need.therapistId, need.discipline);
  if (v !== "edit")
    throw new UserFacingError("Only the treating clinician changes this episode.", 409);
  const e = ep ?? blankEpisode(key, clientId, needId);
  if (e.discharge?.signed && a.type !== "checklist")
    throw new UserFacingError("This episode is discharged.", 409);
  const now = new Date();
  let note = "";
  let reason = "";
  switch (a.type) {
    case "observation": {
      const o = a.observation;
      const date = new Date(o.date);
      if (date.getTime() > now.getTime() + 60_000 && !o.planned)
        throw new UserFacingError("A future date needs the 'planned' label.");
      if (!o.raw && !o.notAssessable)
        throw new UserFacingError("Record a result, or choose why it couldn't be assessed.");
      const { plan } = await goalsFor(db, clientId, needId);
      if (o.goalId && !plan?.goals.some((g) => g.id === o.goalId))
        throw new UserFacingError("That goal belongs to another episode.", 409);
      await s.outcomes.insertOne({
        _id: new ObjectId(),
        ref: await nextRef("outcome"),
        clientId,
        needId,
        goalId: o.goalId || null,
        domain: o.domain,
        method: o.method,
        instrument: o.instrument,
        licensed: o.licensed,
        raw: o.notAssessable ? "" : o.raw,
        unit: o.unit,
        date,
        planned: o.planned,
        setting: o.setting,
        conditions: o.conditions,
        source: o.source,
        sourceLink: null,
        status: o.status,
        notAssessable: o.notAssessable,
        interpretation: o.interpretation,
        assessor: u.name,
        history: [{ at: now, by: u.name, action: `Recorded (${o.status})` }],
      });
      note = `Observation recorded: ${o.domain}${o.notAssessable ? ` not assessed (${o.notAssessable})` : `, ${o.raw} ${o.unit}`}${outOfRange(o.raw, o.unit) ? " (outside expected range, flagged)" : ""}`;
      break;
    }
    case "verify-observation": {
      const o = await s.outcomes.findOne({ _id: new ObjectId(a.id), clientId, needId });
      if (!o) throw new UserFacingError("Observation not found.", 404);
      await s.outcomes.updateOne(
        { _id: o._id },
        {
          $set: { status: a.status },
          $push: {
            history: { at: now, by: u.name, action: `${a.status}${a.note ? `: ${a.note}` : ""}` },
          },
        },
      );
      note = `${o.ref} ${a.status.toLowerCase()}`;
      reason = a.note;
      break;
    }
    case "revise-goal": {
      const { plan } = await goalsFor(db, clientId, needId);
      const g = plan?.goals.find((x) => x.id === a.goalId);
      if (!plan || !g) throw new UserFacingError("Goal not found.", 404);
      await db.plans.updateOne(
        { _id: plan._id, "goals.id": a.goalId },
        { $set: { "goals.$.target": a.target } },
      );
      e.revisions[a.goalId] = [
        ...(e.revisions[a.goalId] ?? []),
        { at: now, by: u.name, from: g.target, to: a.target, reason: a.reason },
      ];
      note = `Goal target revised from ${g.target || "none"} to ${a.target}`;
      reason = a.reason;
      break;
    }
    case "goal-status":
      if (!a.confirm) throw new UserFacingError("Confirm the status as the treating clinician.");
      e.goalStatus[a.goalId] = { status: a.status, by: u.name, at: now };
      note = `Goal progress set to ${a.status} by the clinician`;
      break;
    case "start-review": {
      if (
        e.reviews.some((r) =>
          ["In Progress", "Awaiting Information", "Pending Signature"].includes(r.state),
        )
      )
        throw new UserFacingError("Finish the open reassessment first.", 409);
      e.reviews.push({
        id: randomUUID(),
        trigger: a.trigger,
        reason: a.reason,
        state: "In Progress",
        domains: a.domains,
        items: [],
        visits: [],
        interpretation: "",
        outcome: "",
        signed: null,
        dueAt: new Date(now.getTime() + 14 * DAY),
      });
      e.state = "Under Review";
      note = `Reassessment started: ${a.trigger}`;
      reason = a.reason;
      break;
    }
    case "review-item": {
      const r = e.reviews.find((x) => x.id === a.reviewId);
      if (!r || r.state === "Finalised")
        throw new UserFacingError("This reassessment can't change.", 409);
      if (!r.domains.includes(a.domain))
        throw new UserFacingError("Choose one of the reassessment's domains.");
      if (!a.result && !a.notAssessed)
        throw new UserFacingError("Record the finding, or a structured reason it wasn't assessed.");
      r.items = [
        ...r.items.filter((x) => x.domain !== a.domain),
        {
          domain: a.domain,
          result: a.result,
          method: a.method,
          source: a.source,
          setting: a.setting,
          notAssessed: a.notAssessed,
        },
      ];
      if (!r.visits.some((x) => x.setting === a.setting && now.getTime() - x.at.getTime() < DAY))
        r.visits.push({ setting: a.setting, at: now });
      r.state = r.items.length >= r.domains.length ? "Pending Signature" : "In Progress";
      note = `Reassessment: ${a.domain} ${a.notAssessed ? `not assessed (${a.notAssessed})` : "recorded"} (${a.setting})`;
      break;
    }
    case "review-pause": {
      const r = e.reviews.find((x) => x.id === a.reviewId);
      if (!r) throw new UserFacingError("Reassessment not found.", 404);
      r.state = "Awaiting Information";
      note = "Reassessment saved part-way; continues next visit";
      reason = a.reason;
      await task(
        u,
        client,
        need.discipline,
        `Book reassessment continuation: ${client.name}`,
        "Scheduling",
        key,
        3,
      );
      break;
    }
    case "review-finalise": {
      const r = e.reviews.find((x) => x.id === a.reviewId);
      if (!r) throw new UserFacingError("Reassessment not found.", 404);
      const missing = r.domains.filter((d) => !r.items.some((x) => x.domain === d));
      if (missing.length)
        throw new UserFacingError(
          `Unfinished sections: ${missing.join(", ")}. Record or mark not assessed.`,
        );
      if (!a.safetyChecked)
        throw new UserFacingError("Confirm the risk and consent review before finalising.");
      r.interpretation = a.interpretation;
      r.outcome = a.outcome;
      r.state = "Finalised";
      r.signed = { by: u.name, at: now };
      e.state =
        a.outcome === "Assessment Only Completed"
          ? "Assessment Only"
          : a.outcome === "Discharge"
            ? "Transfer Pending"
            : a.outcome === "Refer/Transfer"
              ? "Transfer Pending"
              : "Active Treatment";
      e.reviewDue = new Date(now.getTime() + 56 * DAY);
      const t = {
        "Revise Plan": "Revise the treatment plan",
        "Further Assessment": "Book further assessment",
        "Refer/Transfer": "Arrange referral and handover",
        Discharge: "Prepare discharge",
        Continue: "",
        "Assessment Only Completed": "Write the FCA report",
      }[a.outcome];
      if (t)
        await task(
          u,
          client,
          need.discipline,
          `${t}: ${client.name}`,
          a.outcome === "Further Assessment" ? "Scheduling" : "Clinical",
          key,
          5,
        );
      note = `Reassessment signed · ${a.outcome}`;
      break;
    }
    case "request-report": {
      const id = await createReport(
        u,
        client,
        need,
        key,
        a.reportType,
        a.purpose,
        new Date(a.due),
        u.name,
      );
      note = `Report requested: ${a.reportType}`;
      await recordEpisode(e, u, note, "");
      return { ok: true, id };
    }
    case "discharge": {
      const d = e.discharge ?? {
        outcome: "",
        reason: "",
        followUp: "",
        exceptions: "",
        checklist: {},
        signed: null,
      };
      const open = DISCHARGE_ITEMS.filter((i) => !d.checklist[i] && i !== "Billing reconciled");
      if (open.length && a.exceptions.length < 5)
        throw new UserFacingError(
          `Complete the checklist or document an exception: ${open.join(", ")}.`,
        );
      e.discharge = {
        ...d,
        outcome: a.outcome,
        reason: a.reason,
        followUp: a.followUp,
        exceptions: a.exceptions,
        signed: { by: u.name, at: now },
      };
      e.state = "Discharged";
      note = "Clinical discharge signed; financial closure tracked separately";
      reason = a.reason;
      if (!d.checklist["Billing reconciled"])
        await task(
          u,
          client,
          need.discipline,
          `Reconcile billing at discharge: ${client.name}`,
          "Finance",
          key,
          5,
        );
      break;
    }
    case "checklist": {
      const d = e.discharge ?? {
        outcome: "",
        reason: "",
        followUp: "",
        exceptions: "",
        checklist: {},
        signed: null,
      };
      d.checklist[a.item] = a.done;
      e.discharge = d;
      note = `Discharge checklist: ${a.item} ${a.done ? "done" : "reopened"}`;
      break;
    }
  }
  await recordEpisode(e, u, note, reason);
  await audit(u, `${client.name} ${need.discipline}: ${note}`, client._id);
  await changed(client._id);
  return { ok: true };
}

async function recordEpisode(e: EpisodeDoc, u: UserDoc, action: string, reason: string) {
  const s = await stores();
  e.timeline.push({ at: new Date(), by: u.name, action, reason });
  await s.episodes.replaceOne({ _id: e._id }, e, { upsert: true });
}

async function changed(clientId: ObjectId) {
  const { users } = await collections();
  await publish(
    (
      await users
        .find({ role: { $in: ["admin", "therapist"] } }, { projection: { _id: 1 } })
        .toArray()
    ).map((x) => x._id),
    "care",
    { clientId: clientId.toHexString() },
  );
}

async function task(
  u: UserDoc,
  client: ClientDoc,
  discipline: string,
  title: string,
  team: "Clinical" | "Scheduling" | "Finance",
  key: string,
  days: number,
  assignee: string | null = null,
) {
  const { users } = await collections();
  const who = assignee ? await users.findOne({ name: assignee }, { projection: { _id: 1 } }) : null;
  await insertTask(u, {
    title,
    category:
      team === "Finance" ? "Billing" : team === "Scheduling" ? "Scheduling" : "Clinical Review",
    status: "New",
    priority: "Normal",
    urgentReason: "",
    team,
    assigneeId: who?._id ?? null,
    assigneeName: assignee,
    related: {
      kind: "Participant",
      ref: client.mrn ?? client.name,
      label: client.name,
      href: `/care/progress/${encodeURIComponent(key)}`,
    },
    clientId: client._id,
    referralId: null,
    appointmentId: null,
    participant: client.name,
    service: discipline,
    discipline,
    locationType: "",
    dueAt: new Date(Date.now() + days * DAY),
    sla: "Standard",
    visibility: team === "Clinical" ? "Team Only" : "Internal",
    source: "Rule",
    ruleCode: "PRG-16",
    ruleVersion: 1,
    idemKey: `progress:${key}:${title}`,
    restrictedNote: null,
    recordingHref: null,
    suggestion: false,
    scenario: null,
    checklist: [],
    historyNote: "Raised from progress monitoring",
  });
}

/* ------------------------------------------------------------------ reports */

async function createReport(
  u: UserDoc,
  client: ClientDoc,
  need: ClientDoc["needs"][number],
  key: string,
  type: ReportType,
  purpose: string,
  due: Date,
  requestedBy: string,
) {
  const db = await collections();
  const s = await stores();
  if (!need.therapistId) throw new UserFacingError("The episode has no treating clinician.", 409);
  const t = await db.therapists.findOne(
    { _id: need.therapistId },
    { projection: { seniority: 1, name: 1 } },
  );
  const now = new Date();
  const doc: ReportDoc = {
    _id: new ObjectId(),
    ref: await nextRef("report"),
    episodeId: key,
    clientId: client._id,
    needId: need.id,
    therapistId: need.therapistId,
    type,
    purpose,
    periodStart: new Date(now.getTime() - 84 * DAY).toISOString().slice(0, 10),
    periodEnd: now.toISOString().slice(0, 10),
    status: "Requested",
    version: 1,
    supersedes: null,
    sections: reportTemplates[type].map((x) => ({
      ...x,
      text: "",
      origin: "clinician" as const,
      state: "clinician",
      cites: [],
    })),
    limitations: "",
    gaps: [],
    // Governance setting: clinician-level authors' NDIS and FCA reports are co-signed by a lead.
    coSignRequired:
      t?.seniority !== "Senior" && ["NDIS therapy progress report", "FCA report"].includes(type),
    coSign: { status: "Not required", by: "", note: "", at: null },
    signed: null,
    releases: [],
    dueAt: due,
    requestedBy,
    timeline: [{ at: now, by: u.name, action: `Report requested (${purpose})`, reason: "" }],
    createdAt: now,
  };
  await s.reports.insertOne(doc);
  await task(
    u,
    client,
    need.discipline,
    `Write ${type}: ${client.name}`,
    "Clinical",
    key,
    Math.max(1, Math.round((due.getTime() - now.getTime()) / DAY)),
    t?.name ?? null,
  );
  return doc._id.toHexString();
}

async function reportRows(u: UserDoc, filter: Record<string, unknown> = {}): Promise<ReportRow[]> {
  const db = await collections();
  const s = await stores();
  const q =
    u.role === "therapist" ? { ...filter, therapistId: u.therapistId ?? new ObjectId() } : filter;
  if (u.role !== "therapist" && u.role !== "admin") return [];
  const reps = await s.reports.find(q).sort({ dueAt: 1 }).limit(500).toArray();
  const clients = await db.clients
    .find(
      { _id: { $in: reps.map((r) => r.clientId) } },
      { projection: { name: 1, mrn: 1, needs: 1 } },
    )
    .toArray();
  const ther = await db.therapists.find({}, { projection: { name: 1 } }).toArray();
  const now = Date.now();
  return reps.flatMap((r) => {
    const c = clients.find((x) => x._id.equals(r.clientId));
    const need = c?.needs.find((n) => n.id === r.needId);
    const discipline = need?.discipline ?? "";
    if (viewOf(u, r.therapistId, discipline) === "none") return [];
    return [
      {
        id: r._id.toHexString(),
        ref: r.ref,
        type: r.type,
        participant: c?.name ?? "",
        participantId: c?.mrn ?? "",
        discipline,
        author: ther.find((t) => t._id.equals(r.therapistId))?.name ?? "",
        status: r.status,
        purpose: r.purpose,
        dueAt: r.dueAt.toISOString(),
        overdue:
          !["Signed", "Released", "Superseded", "Withdrawn"].includes(r.status) &&
          r.dueAt.getTime() < now,
        version: r.version,
        restricted: restrictedDisciplines.includes(discipline),
        gaps: r.gaps.filter((g) => !g.resolved).length,
        episodeId: r.episodeId,
      },
    ];
  });
}

export async function reportList(u: UserDoc) {
  return reportRows(u);
}

async function loadReport(id: ObjectId) {
  const db = await collections();
  const s = await stores();
  const r = await s.reports.findOne({ _id: id });
  if (!r) throw new UserFacingError("Report not found.", 404);
  const client = await db.clients.findOne({ _id: r.clientId });
  const need = client?.needs.find((n) => n.id === r.needId);
  if (!client || !need) throw new UserFacingError("Report not found.", 404);
  return { db, s, r, client, need };
}

/** Evidence a report may cite: verified outcomes, signed notes and finalised reassessments only. */
async function evidenceFor(r: ReportDoc) {
  const db = await collections();
  const s = await stores();
  const start = new Date(r.periodStart);
  const outs = await s.outcomes
    .find({
      clientId: r.clientId,
      needId: r.needId,
      status: { $in: ["Verified", "Corrected"] },
      planned: false,
      date: { $gte: new Date(start.getTime() - 120 * DAY) },
    })
    .sort({ date: 1 })
    .toArray();
  const notes = await db.appointments
    .find({
      clientId: r.clientId,
      needId: r.needId,
      "note.signedAt": { $ne: null },
      start: { $gte: start },
    })
    .sort({ start: -1 })
    .limit(4)
    .toArray();
  const ep = await s.episodes.findOne({ _id: r.episodeId });
  const ev: ReportFull["evidence"] = [
    ...outs.map((o) => ({
      id: `out:${o._id.toHexString()}`,
      kind: "Outcome",
      label: `${o.ref} ${o.domain}`,
      text: o.notAssessable
        ? `Not assessed: ${o.notAssessable}`
        : `${o.raw} ${o.unit} (${o.method}; ${o.source}; ${o.setting}${o.conditions ? `; ${o.conditions}` : ""})`,
      date: o.date.toISOString(),
    })),
    ...notes.map((n) => ({
      id: `note:${n._id.toHexString()}`,
      kind: "Signed note",
      label: `Session ${n.start.toISOString().slice(0, 10)}`,
      text: (n.note?.text ?? "").slice(0, 500),
      date: n.start.toISOString(),
    })),
    ...(ep?.reviews ?? [])
      .filter((x) => x.state === "Finalised")
      .map((x) => ({
        id: `rev:${x.id}`,
        kind: "Reassessment",
        label: `Reassessment (${x.trigger})`,
        text: `${x.interpretation} Outcome: ${x.outcome}.`,
        date: (x.signed?.at ?? x.dueAt).toISOString(),
      })),
  ];
  return ev;
}

/** Data-quality rules a reviewer must act on before signing (section 11). */
async function gapsFor(r: ReportDoc, evidence: ReportFull["evidence"]) {
  const db = await collections();
  const s = await stores();
  const keep = (id: string) => r.gaps.find((g) => g.id === id);
  const out: ReportDoc["gaps"] = [];
  const { plan } = await goalsFor(db, r.clientId, r.needId);
  const outs = await s.outcomes.find({ clientId: r.clientId, needId: r.needId }).toArray();
  for (const g of plan?.goals ?? []) {
    const obs = outs.filter(
      (o) => o.goalId === g.id && ["Verified", "Corrected"].includes(o.status),
    );
    if (!g.baseline && !obs.length)
      out.push(
        keep(`nobase:${g.id}`) ?? {
          id: `nobase:${g.id}`,
          text: `No baseline for "${g.description.slice(0, 60)}": numeric trend unavailable`,
          resolved: false,
          resolution: "",
        },
      );
    const last = obs.sort((a, b) => b.date.getTime() - a.date.getTime())[0];
    if (last && Date.now() - last.date.getTime() > 90 * DAY)
      out.push(
        keep(`old:${g.id}`) ?? {
          id: `old:${g.id}`,
          text: `Latest measure for "${g.description.slice(0, 60)}" is over 90 days old`,
          resolved: false,
          resolution: "",
        },
      );
    if (obs.some((o) => o.raw && !Number.isNaN(Number(o.raw)) && (!o.unit || o.unit === "none")))
      out.push(
        keep(`unit:${g.id}`) ?? {
          id: `unit:${g.id}`,
          text: `A numeric result for "${g.description.slice(0, 60)}" has no unit`,
          resolved: false,
          resolution: "",
        },
      );
  }
  const drafts = outs.filter((o) => ["Draft", "Pending Review"].includes(o.status)).length;
  if (drafts)
    out.push(
      keep("unverified") ?? {
        id: "unverified",
        text: `${drafts} unverified observation(s) were excluded from the evidence`,
        resolved: false,
        resolution: "",
      },
    );
  if (r.periodStart > r.periodEnd)
    out.push({
      id: "period",
      text: "The report period ends before it starts",
      resolved: false,
      resolution: "",
    });
  if (!evidence.length)
    out.push(
      keep("noevidence") ?? {
        id: "noevidence",
        text: "No verified evidence in this period: the report can only be narrative",
        resolved: false,
        resolution: "",
      },
    );
  // A drafted section that contradicts verified evidence stops sign-off (AC-42).
  for (const sec of r.sections.filter((x) => x.origin === "ai" && x.state !== "rejected"))
    for (const m of sec.text.matchAll(/(\d+(?:\.\d+)?)\s?(m|metres|sec|seconds|degrees|%)\b/g)) {
      const raw = m[1] ?? "";
      if (!evidence.some((e) => e.text.includes(raw))) {
        const id = `unsupported:${sec.key}:${raw}`;
        out.push(
          keep(id) ?? {
            id,
            text: `"${m[0]}" in ${sec.title} doesn't match any cited evidence`,
            resolved: false,
            resolution: "",
          },
        );
      }
    }
  return out;
}

export async function reportDetail(u: UserDoc, id: ObjectId): Promise<ReportFull> {
  const { db, s, r, client, need } = await loadReport(id);
  const v = viewOf(u, r.therapistId, need.discipline);
  if (v === "none") throw new UserFacingError("Report not found.", 404);
  const clinical = v !== "status";
  const t = await db.therapists.findOne({ _id: r.therapistId }, { projection: { name: 1 } });
  const versions = await s.reports
    .find({ episodeId: r.episodeId, type: r.type })
    .sort({ version: 1 })
    .toArray();
  await audit(u, `Viewed report ${r.ref}`, client._id);
  return {
    id: r._id.toHexString(),
    ref: r.ref,
    type: r.type,
    view: v,
    episodeId: r.episodeId,
    participant: client.name,
    participantId: client.mrn ?? "",
    discipline: need.discipline,
    author: t?.name ?? "",
    purpose: r.purpose,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    status: r.status,
    version: r.version,
    versions: versions.map((x) => ({
      id: x._id.toHexString(),
      version: x.version,
      status: x.status,
      signedAt: x.signed?.at.toISOString() ?? null,
    })),
    restricted: restrictedDisciplines.includes(need.discipline),
    sections: clinical ? r.sections : r.sections.map((x) => ({ ...x, text: "", cites: [] })),
    limitations: clinical ? r.limitations : "",
    evidence: clinical ? await evidenceFor(r) : [],
    gaps: clinical ? r.gaps : [],
    coSign: {
      required: r.coSignRequired,
      status: r.coSign.status,
      by: r.coSign.by,
      note: clinical ? r.coSign.note : "",
    },
    signed: r.signed ? { by: r.signed.by, at: r.signed.at.toISOString() } : null,
    releases: r.releases.map((x) => ({ ...x, at: x.at.toISOString() })),
    dueAt: r.dueAt.toISOString(),
    requestedBy: r.requestedBy,
    timeline: r.timeline
      .map((h) => ({ ...h, at: h.at.toISOString(), reason: clinical ? h.reason : "" }))
      .reverse(),
    canEdit: v === "edit" && ["Requested", "Draft", "Changes Requested"].includes(r.status),
    canCoSign: v === "lead" && r.status === "In Review" && r.coSignRequired,
  };
}

export async function reportAction(u: UserDoc, id: ObjectId, a: ReportAction) {
  const { db, s, r, client, need } = await loadReport(id);
  const v = viewOf(u, r.therapistId, need.discipline);
  if (v === "none") throw new UserFacingError("Report not found.", 404);
  const now = new Date();
  const set: Partial<ReportDoc> = {};
  let note = "";
  let reason = "";
  let created: string | null = null;
  const editable = ["Requested", "Draft", "Changes Requested"].includes(r.status);
  if (a.type === "co-sign") {
    if (v !== "lead" || !r.coSignRequired)
      throw new UserFacingError("Only a Clinical Lead co-signs this report.", 409);
    if (r.status !== "In Review")
      throw new UserFacingError("Nothing is waiting for co-signature.", 409);
    if (a.decision === "Approve") {
      set.coSign = { status: "Approved", by: u.name, note: a.note, at: now };
      set.status = "Signed";
      note = "Co-signed by the Clinical Lead";
    } else {
      if (a.note.length < 5) throw new UserFacingError("Say what needs changing.");
      set.coSign = { status: "Changes requested", by: u.name, note: a.note, at: now };
      set.status = "Changes Requested";
      set.signed = null;
      note = "Changes requested by the Clinical Lead";
      reason = a.note;
      const t = await db.therapists.findOne({ _id: r.therapistId }, { projection: { name: 1 } });
      await task(
        u,
        client,
        need.discipline,
        `Update ${r.ref} after review`,
        "Clinical",
        r.episodeId,
        2,
        t?.name ?? null,
      );
    }
  } else {
    if (v !== "edit")
      throw new UserFacingError("Only the treating clinician changes this report.", 409);
    const need2 = () => {
      if (!editable)
        throw new UserFacingError(
          "The report is signed or in review. Amend it as a new version.",
          409,
        );
    };
    switch (a.type) {
      case "generate": {
        need2();
        const evidence = await evidenceFor(r);
        set.sections = await aiReport(r, evidence, client.name.split(" ")[0] ?? "the participant");
        set.status = "Draft";
        note = `AI drafted the report from ${evidence.length} verified source(s); not clinically verified`;
        break;
      }
      case "section":
        need2();
        set.sections = r.sections.map((x) =>
          x.key === a.key
            ? {
                ...x,
                text: a.state === "rejected" ? "" : a.text,
                state: a.state,
                origin: a.state === "clinician" ? "clinician" : x.origin,
              }
            : x,
        );
        if (r.status === "Requested") set.status = "Draft";
        note = `${r.sections.find((x) => x.key === a.key)?.title ?? "Section"}: ${a.state}`;
        reason = a.reason;
        break;
      case "limitations":
        need2();
        set.limitations = a.text;
        note = "Limitations updated";
        break;
      case "period":
        need2();
        if (a.start > a.end) throw new UserFacingError("The period must start before it ends.");
        set.periodStart = a.start;
        set.periodEnd = a.end;
        note = `Report period ${a.start} to ${a.end}`;
        break;
      case "resolve":
        set.gaps = r.gaps.map((g) =>
          g.id === a.id ? { ...g, resolved: true, resolution: a.resolution } : g,
        );
        note = "Data-quality finding resolved";
        reason = a.resolution;
        break;
      case "submit":
        need2();
        set.status = "Draft";
        note = "Saved";
        break;
      case "sign": {
        need2();
        if (!a.confirm)
          throw new UserFacingError(
            "Confirm you reviewed the sources, interpretation, limitations and recipients.",
          );
        const pending = r.sections.filter((x) => x.origin === "ai" && x.state === "pending");
        if (pending.length)
          throw new UserFacingError(
            `Review the AI sections first: ${pending.map((x) => x.title).join(", ")}.`,
            409,
          );
        const empty = r.sections.filter((x) => x.state !== "rejected" && x.text.trim().length < 3);
        if (empty.length)
          throw new UserFacingError(`Complete: ${empty.map((x) => x.title).join(", ")}.`, 409);
        if (r.gaps.some((g) => !g.resolved))
          throw new UserFacingError("Resolve or document every data-quality finding first.", 409);
        set.signed = { by: u.name, at: now };
        set.status = r.coSignRequired ? "In Review" : "Signed";
        if (r.coSignRequired) {
          set.coSign = { status: "Pending", by: "", note: "", at: null };
          await task(
            u,
            client,
            need.discipline,
            `Co-sign ${r.ref}`,
            "Clinical",
            r.episodeId,
            2,
            "Helen Brooks",
          );
        }
        if (r.supersedes)
          await s.reports.updateOne(
            { _id: r.supersedes },
            {
              $set: { status: "Superseded" },
              $push: {
                timeline: {
                  at: now,
                  by: u.name,
                  action: `Superseded by version ${r.version}`,
                  reason: "",
                },
              },
            },
          );
        note = r.coSignRequired ? "Author signed; sent for co-signature" : "Signed";
        break;
      }
      case "release": {
        if (!["Signed", "Released"].includes(r.status))
          throw new UserFacingError("Only a signed report can be released.", 409);
        if (!a.authorityVerified || !a.consentVerified)
          throw new UserFacingError(
            "Verify the recipient's authority and consent before releasing.",
            409,
          );
        if (
          a.recipient === "Guardian" &&
          !(client.contacts ?? []).some((c) =>
            /guardian|parent|nominee/i.test(`${c.relationship ?? ""} ${c.role ?? ""}`),
          )
        )
          throw new UserFacingError(
            "No guardian authority is on file for this participant. Record it first.",
            409,
          );
        set.releases = [
          ...r.releases,
          { recipient: a.recipient, name: a.name, at: now, version: r.version, channel: a.channel },
        ];
        set.status = "Released";
        note = `Released version ${r.version} to ${a.recipient} (${a.name}) by ${a.channel}`;
        if (a.recipient === "Participant" && client.userId)
          await notify([client.userId], {
            title: "A report is ready for you",
            body: `Your ${r.type.toLowerCase()} has been shared with you.`,
            href: "/mobile/patient",
          });
        break;
      }
      case "amend": {
        if (!["Signed", "Released"].includes(r.status))
          throw new UserFacingError("Only a signed report is amended.", 409);
        const copy: ReportDoc = {
          ...r,
          _id: new ObjectId(),
          ref: await nextRef("report"),
          version: r.version + 1,
          supersedes: r._id,
          status: "Draft",
          signed: null,
          releases: [],
          coSign: { status: "Not required", by: "", note: "", at: null },
          timeline: [
            {
              at: now,
              by: u.name,
              action: `Version ${r.version + 1} drafted from ${r.ref}`,
              reason: a.reason,
            },
          ],
          createdAt: now,
        };
        await s.reports.insertOne(copy);
        created = copy._id.toHexString();
        note = `Amendment started as version ${r.version + 1}; the signed version stays available`;
        reason = a.reason;
        break;
      }
      case "withdraw":
        if (["Signed", "Released", "Superseded"].includes(r.status))
          throw new UserFacingError("Signed reports are amended, not withdrawn.", 409);
        set.status = "Withdrawn";
        note = "Report withdrawn";
        reason = a.reason;
        break;
    }
  }
  if (
    !["Signed", "Released", "Superseded", "Withdrawn"].includes((set.status ?? r.status) as string)
  ) {
    const merged = { ...r, ...set } as ReportDoc;
    set.gaps = await gapsFor(merged, await evidenceFor(merged));
  }
  await s.reports.updateOne(
    { _id: r._id },
    { $set: set, $push: { timeline: { at: now, by: u.name, action: note, reason } } },
  );
  await audit(u, `${r.ref}: ${note}`, client._id);
  await changed(client._id);
  return { ok: true, id: created ?? r._id.toHexString() };
}

async function aiReport(
  r: ReportDoc,
  evidence: ReportFull["evidence"],
  first: string,
): Promise<ReportDoc["sections"]> {
  if (!evidence.length)
    throw new UserFacingError(
      "There is no verified evidence to draft from. Write the report yourself.",
      409,
    );
  const tagged = evidence.map(
    (e, i) => `[E${i + 1}] ${e.kind} ${e.date.slice(0, 10)} ${e.label}: ${e.text}`,
  );
  try {
    const out = await generateJson("clinical-report-draft", {
      system:
        "Draft an allied health clinical report from the verified evidence only, citing the bracketed tags. Describe measured changes neutrally with their date, method and conditions; do not call a change clinically significant. Never invent a measurement, baseline, diagnosis, recommendation of funding or support hours. Where data is missing say so. Keep 'service delivered' separate from 'outcomes measured'. Call the person 'the participant', never 'client'. The clinician reviews and signs.",
      user: `Report type: ${r.type}. Purpose: ${r.purpose}. Participant first name: ${first}. Period ${r.periodStart} to ${r.periodEnd}.\nSections: ${r.sections.map((s) => `${s.key}=${s.title}`).join(", ")}\nEvidence:\n${tagged.join("\n")}`,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["sections"],
        properties: {
          sections: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["key", "text", "cites"],
              properties: {
                key: { type: "string" },
                text: { type: "string" },
                cites: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
      schemaName: "clinical_report",
      maxTokens: 2000,
    });
    const parsed = JSON.parse(out.text) as {
      sections: { key: string; text: string; cites: string[] }[];
    };
    const norm = (v: string) => v.trim().toLowerCase();
    return r.sections.map((s) => {
      const x = parsed.sections.find(
        (y) => norm(y.key) === norm(s.key) || norm(y.key) === norm(s.title),
      );
      return x
        ? {
            ...s,
            text: x.text.slice(0, 5000),
            cites: x.cites.slice(0, 8),
            origin: "ai" as const,
            state: "pending",
          }
        : s;
    });
  } catch (error) {
    if (error instanceof AiError)
      throw new UserFacingError(
        `AI isn't available right now: ${error.message}. Your report is saved; write it yourself or try again.`,
        409,
      );
    throw new UserFacingError("The AI draft couldn't be read. Try again.", 409);
  }
}
