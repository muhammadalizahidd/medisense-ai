import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { AiError } from "@/lib/ai/types";
import { generateJson } from "@/lib/ai/engine";
import {
  activityFrequencies,
  activityNames,
  applicability,
  assessmentGaps,
  assistanceLevels,
  goalStatuses,
  participationStatuses,
  recommendations,
  reviewDecisions,
  safetyLevels,
  templateFor,
  type AssessmentDto,
  type ClinicalSummaryDto,
  type PlanDto,
} from "@/lib/live/clinical";
import { slotLabel } from "@/lib/live/time";
import { billVisit } from "./billing";
import { collections } from "./db";
import { noteStatusOf } from "./dto";
import { UserFacingError } from "./http";
import { adminIds, audit, notify, publish } from "./live";
import type { AssessmentDoc, ClientDoc, PlanDoc, UserDoc } from "./models";
import { partiesOf, visitFor } from "./visits";

/* ------------------------------------------------------------- access */

const isClinicalLead = (u: UserDoc) =>
  Boolean(u.staffRoles?.some((r) => r === "Clinical Lead" || r === "Super Admin"));

/** The therapist assigned to this service request, with the patient record. */
async function myService(user: UserDoc, clientId: ObjectId, needId: string) {
  const { clients } = await collections();
  const client = await clients.findOne({ _id: clientId });
  const need = client?.needs.find((n) => n.id === needId);
  if (!client || !need) throw new UserFacingError("Service not found.", 404);
  const mine =
    user.role === "therapist" &&
    user.therapistId &&
    need.therapistId?.equals(user.therapistId) &&
    (need.status === "assigned" || need.status === "completed");
  if (!mine) throw new UserFacingError("Only this service's therapist can do that.", 404);
  return { client, need };
}

/**
 * Clinical records are least privilege (section 2.1): the treating therapist edits; a Clinical Lead
 * can read; other admins see status summaries only.
 */
async function canRead(user: UserDoc, doc: { therapistId: ObjectId }) {
  if (user.role === "therapist" && user.therapistId?.equals(doc.therapistId)) return true;
  if (user.role === "admin" && isClinicalLead(user)) return false;
  throw new UserFacingError("Not found.", 404);
}

async function changed(client: ClientDoc, therapistUserId?: ObjectId) {
  await publish(
    [...(await adminIds()), client.userId, ...(therapistUserId ? [therapistUserId] : [])],
    "care",
    {
      clientId: client._id.toHexString(),
    },
  );
}

/* --------------------------------------------------------- assessments */

const sectionSchema = z.object({
  applicability: z.union([z.literal(""), z.enum(applicability)]),
  reason: z.string().max(1000),
  reported: z.string().max(3000),
  observed: z.string().max(3000),
  measure: z.string().max(500),
});

const activitySchema = z.object({
  id: z.string().max(60),
  activity: z.enum(activityNames),
  custom: z.string().max(120),
  participation: z.enum(participationStatuses),
  assistance: z.enum(assistanceLevels),
  frequency: z.enum(activityFrequencies),
  environment: z.string().max(500),
  safety: z.enum(safetyLevels),
  safetyNotes: z.string().max(500),
  observation: z.string().max(1500),
  reported: z.string().max(1500),
});

export const assessmentSaveSchema = z.object({
  consent: z.object({ obtained: z.boolean(), notes: z.string().max(500) }),
  sections: z.record(z.string().max(80), sectionSchema),
  activities: z.array(activitySchema).max(30),
  findings: z.string().max(6000),
  limitations: z.string().max(2000),
  recommendation: z.object({
    decision: z.union([z.literal(""), z.enum(recommendations)]),
    notes: z.string().max(2000),
  }),
});

function assessmentDto(a: AssessmentDoc, clientName: string, canEdit: boolean): AssessmentDto {
  return {
    id: a._id.toHexString(),
    clientId: a.clientId.toHexString(),
    clientName,
    needId: a.needId,
    support: a.support,
    discipline: a.discipline,
    kind: a.kind,
    template: templateFor(a.support, a.discipline),
    status: a.status,
    therapistName: a.therapistName,
    consent: a.consent,
    sections: a.sections,
    activities: a.activities,
    findings: a.findings,
    limitations: a.limitations,
    recommendation: a.recommendation,
    released: a.released ? { ...a.released, at: a.released.at.toISOString() } : null,
    signed: a.signed ? { ...a.signed, at: a.signed.at.toISOString() } : null,
    amendments: a.amendments.map((m) => ({ ...m, at: m.at.toISOString() })),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    canEdit: canEdit && (a.status === "Draft" || a.status === "In Progress"),
  };
}

/** Starts the assessment for a service, or returns the one already open. */
export async function startAssessment(
  user: UserDoc,
  input: { clientId: ObjectId; needId: string; kind: "Initial" | "Reassessment" },
) {
  const { assessments, therapists } = await collections();
  const { client, need } = await myService(user, input.clientId, input.needId);
  const open = await assessments.findOne({
    clientId: client._id,
    needId: need.id,
    status: { $in: ["Draft", "In Progress"] },
  });
  if (open) return { id: open._id.toHexString() };
  const therapist = await therapists.findOne({ _id: user.therapistId! });
  const template = templateFor(need.support, need.discipline);
  const now = new Date();
  const doc: AssessmentDoc = {
    _id: new ObjectId(),
    clientId: client._id,
    needId: need.id,
    therapistId: user.therapistId!,
    therapistName: therapist?.name ?? user.name,
    support: need.support,
    discipline: need.discipline,
    kind: input.kind,
    status: "Draft",
    consent: { obtained: false, notes: "" },
    sections: Object.fromEntries(
      template.sections.map((s) => [
        s.key,
        { applicability: "", reason: "", reported: "", observed: "", measure: "" },
      ]),
    ),
    activities: [],
    findings: "",
    limitations: "",
    recommendation: { decision: "", notes: "" },
    released: null,
    signed: null,
    amendments: [],
    createdAt: now,
    updatedAt: now,
  };
  await assessments.insertOne(doc);
  await audit(
    user,
    `Started the ${input.kind.toLowerCase()} ${need.support} assessment`,
    client._id,
  );
  await changed(client);
  return { id: doc._id.toHexString() };
}

async function loadAssessment(user: UserDoc, id: ObjectId) {
  const { assessments, clients } = await collections();
  const a = await assessments.findOne({ _id: id });
  if (!a) throw new UserFacingError("Assessment not found.", 404);
  const canEdit = await canRead(user, a);
  const client = await clients.findOne({ _id: a.clientId });
  if (!client) throw new UserFacingError("Assessment not found.", 404);
  return { a, client, canEdit };
}

export async function getAssessment(user: UserDoc, id: ObjectId) {
  const { a, client, canEdit } = await loadAssessment(user, id);
  return assessmentDto(a, client.name, canEdit);
}

export async function saveAssessment(
  user: UserDoc,
  id: ObjectId,
  input: z.infer<typeof assessmentSaveSchema>,
) {
  const { assessments } = await collections();
  const { a, canEdit } = await loadAssessment(user, id);
  if (!canEdit || !(a.status === "Draft" || a.status === "In Progress")) {
    throw new UserFacingError("A signed assessment changes only by amendment.", 409);
  }
  await assessments.updateOne(
    { _id: id },
    { $set: { ...input, status: "In Progress", updatedAt: new Date() } },
  );
}

export async function signAssessment(user: UserDoc, id: ObjectId) {
  const db = await collections();
  const { a, client, canEdit } = await loadAssessment(user, id);
  if (!canEdit) throw new UserFacingError("Only the assessing therapist can sign.", 409);
  if (a.status !== "Draft" && a.status !== "In Progress")
    throw new UserFacingError("Already signed.", 409);
  const gaps = assessmentGaps(a);
  if (gaps.length)
    throw new UserFacingError(
      `Before signing: ${gaps.slice(0, 3).join(" ")}${gaps.length > 3 ? ` (+${gaps.length - 3} more)` : ""}`,
      409,
    );
  const now = new Date();
  await db.assessments.updateOne(
    { _id: id },
    { $set: { status: "Signed", signed: { byName: user.name, at: now }, updatedAt: now } },
  );
  await audit(user, `Signed the ${a.support} assessment: ${a.recommendation.decision}`, client._id);

  // Lifecycle phase 9: the recommendation decides what happens next.
  const decision = a.recommendation.decision;
  const admins = await adminIds();
  if (decision === "Report only") {
    await db.clients.updateOne(
      { _id: client._id, "needs.id": a.needId },
      { $set: { "needs.$.status": "completed" } },
    );
    await notify(admins, {
      title: `${a.support} complete: ${client.name}`,
      body: `Assessment-only service signed by ${user.name}. Release the report when ready.`,
      href: `/care/${client._id.toHexString()}`,
    });
  } else if (decision === "Treatment") {
    const existing = await db.plans.findOne({
      clientId: client._id,
      needId: a.needId,
      status: { $in: ["Draft", "Active", "Under Review", "Revised"] },
    });
    if (!existing) await createPlan(user, client, a);
  } else {
    await notify(admins, {
      title: `${decision}: ${client.name}`,
      body: `${user.name} recommends ${decision.toLowerCase()} after the ${a.support} assessment.${a.recommendation.notes ? ` ${a.recommendation.notes.slice(0, 140)}` : ""}`,
      href: `/care/${client._id.toHexString()}`,
    });
  }
  await changed(client, user._id);
  return { decision };
}

export const amendSchema = z.object({
  reason: z.string().trim().min(5, "Give the reason for the amendment").max(500),
  text: z.string().trim().min(5, "Write the amendment").max(4000),
});

/** Signed records never change; an amendment is added with its reason, author and time. */
export async function amendAssessment(
  user: UserDoc,
  id: ObjectId,
  input: z.infer<typeof amendSchema>,
) {
  const { assessments } = await collections();
  const { a, client } = await loadAssessment(user, id);
  if (!(user.role === "therapist" && user.therapistId?.equals(a.therapistId))) {
    throw new UserFacingError("Only the assessing therapist can amend.", 409);
  }
  if (a.status !== "Signed" && a.status !== "Amended")
    throw new UserFacingError("Sign it before amending.", 409);
  await assessments.updateOne(
    { _id: id },
    {
      $set: { status: "Amended", updatedAt: new Date() },
      $push: { amendments: { ...input, byName: user.name, at: new Date() } },
    },
  );
  await audit(user, `Amended the ${a.support} assessment: ${input.reason}`, client._id);
  await changed(client);
}

export const releaseSchema = z.object({
  summary: z.string().trim().min(20, "Write the summary the participant will read").max(3000),
});

/** The participant sees the report only once the clinician releases it (E2E-08, E2E-15). */
export async function releaseAssessment(
  user: UserDoc,
  id: ObjectId,
  input: z.infer<typeof releaseSchema>,
) {
  const { assessments } = await collections();
  const { a, client } = await loadAssessment(user, id);
  if (!(user.role === "therapist" && user.therapistId?.equals(a.therapistId))) {
    throw new UserFacingError("Only the assessing therapist can release the report.", 409);
  }
  if (!a.signed) throw new UserFacingError("Sign the assessment before releasing it.", 409);
  await assessments.updateOne(
    { _id: id },
    { $set: { released: { summary: input.summary, byName: user.name, at: new Date() } } },
  );
  await notify([client.userId], {
    title: `Your ${a.support} report is ready`,
    body: `${user.name.split(" ")[0]} has shared the findings with you.`,
    href: "/mobile/patient",
  });
  await audit(user, `Released the ${a.support} report to the participant`, client._id);
  await changed(client);
}

/* ---------------------------------------------------------- treatment plans */

async function createPlan(user: UserDoc, client: ClientDoc, a: AssessmentDoc) {
  const { plans } = await collections();
  const need = client.needs.find((n) => n.id === a.needId);
  const now = new Date();
  const doc: PlanDoc = {
    _id: new ObjectId(),
    clientId: client._id,
    needId: a.needId,
    therapistId: a.therapistId,
    therapistName: a.therapistName,
    support: a.support,
    status: "Draft",
    version: 1,
    indication: a.findings.slice(0, 2000),
    goals: [],
    interventions: "",
    precautions: client.precautions ?? "",
    frequency: need?.frequency ?? "",
    duration: "",
    reviewDate: "",
    approved: null,
    reviews: [],
    progressSummary: null,
    createdAt: now,
    updatedAt: now,
  };
  await plans.insertOne(doc);
  await audit(user, `Drafted the ${a.support} treatment plan`, client._id);
  return doc;
}

/** Starts a plan from the latest signed assessment, or returns the open one. */
export async function startPlan(user: UserDoc, input: { clientId: ObjectId; needId: string }) {
  const db = await collections();
  const { client } = await myService(user, input.clientId, input.needId);
  const open = await db.plans.findOne({
    clientId: client._id,
    needId: input.needId,
    status: { $in: ["Draft", "Active", "Under Review", "Revised"] },
  });
  if (open) return { id: open._id.toHexString() };
  const signed = await db.assessments.findOne(
    { clientId: client._id, needId: input.needId, status: { $in: ["Signed", "Amended"] } },
    { sort: { createdAt: -1 } },
  );
  if (!signed)
    throw new UserFacingError("Sign the assessment first: the plan builds on its findings.", 409);
  const plan = await createPlan(user, client, signed);
  await changed(client);
  return { id: plan._id.toHexString() };
}

function planDto(p: PlanDoc, clientName: string, canEdit: boolean): PlanDto {
  return {
    id: p._id.toHexString(),
    clientId: p.clientId.toHexString(),
    clientName,
    needId: p.needId,
    support: p.support,
    status: p.status,
    version: p.version,
    therapistName: p.therapistName,
    indication: p.indication,
    goals: p.goals.map((g) => ({
      ...g,
      history: g.history.map((h) => ({
        value: h.value,
        note: h.note,
        byName: h.byName,
        at: h.at.toISOString(),
      })),
    })),
    interventions: p.interventions,
    precautions: p.precautions,
    frequency: p.frequency,
    duration: p.duration,
    reviewDate: p.reviewDate,
    approved: p.approved ? { ...p.approved, at: p.approved.at.toISOString() } : null,
    reviews: p.reviews.map((r) => ({ ...r, at: r.at.toISOString() })),
    progressSummary: p.progressSummary
      ? { ...p.progressSummary, at: p.progressSummary.at.toISOString() }
      : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    canEdit,
  };
}

async function loadPlan(user: UserDoc, id: ObjectId) {
  const { plans, clients } = await collections();
  const p = await plans.findOne({ _id: id });
  if (!p) throw new UserFacingError("Plan not found.", 404);
  const canEdit = await canRead(user, p);
  const client = await clients.findOne({ _id: p.clientId });
  if (!client) throw new UserFacingError("Plan not found.", 404);
  return { p, client, canEdit };
}

export async function getPlan(user: UserDoc, id: ObjectId) {
  const { p, client, canEdit } = await loadPlan(user, id);
  return planDto(p, client.name, canEdit);
}

const goalSchema = z.object({
  id: z.string().max(60),
  description: z.string().trim().max(500),
  domain: z.string().max(60),
  measure: z.string().trim().max(300),
  baseline: z.string().trim().max(200),
  target: z.string().trim().max(200),
  current: z.string().trim().max(200),
  status: z.enum(goalStatuses),
  rationale: z.string().trim().max(500),
});

export const planSaveSchema = z.object({
  indication: z.string().max(3000),
  goals: z.array(goalSchema).max(12),
  interventions: z.string().max(3000),
  precautions: z.string().max(1500),
  frequency: z.string().max(120),
  duration: z.string().max(120),
  reviewDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
});

export async function savePlan(user: UserDoc, id: ObjectId, input: z.infer<typeof planSaveSchema>) {
  const { plans } = await collections();
  const { p, canEdit } = await loadPlan(user, id);
  if (!canEdit || !(p.status === "Draft" || p.status === "Revised")) {
    throw new UserFacingError(
      "An active plan changes through a review. Choose Revise to edit it.",
      409,
    );
  }
  const history = new Map(p.goals.map((g) => [g.id, g.history]));
  await plans.updateOne(
    { _id: id },
    {
      $set: {
        ...input,
        goals: input.goals.map((g) => ({
          ...g,
          id: g.id || randomUUID(),
          history: history.get(g.id) ?? [],
        })),
        updatedAt: new Date(),
      },
    },
  );
}

/** The clinician approves the plan; it becomes active and the participant can see its goals. */
export async function activatePlan(user: UserDoc, id: ObjectId) {
  const { plans } = await collections();
  const { p, client, canEdit } = await loadPlan(user, id);
  if (!canEdit || !(p.status === "Draft" || p.status === "Revised"))
    throw new UserFacingError("This plan can't be approved now.", 409);
  const gaps: string[] = [];
  if (!p.indication.trim()) gaps.push("the clinical indication");
  const goals = p.goals.filter((g) => g.status === "Active");
  if (!goals.length) gaps.push("at least one active goal");
  if (goals.some((g) => !g.description || !g.measure || !g.baseline || !g.target))
    gaps.push("a measure, baseline and target for every goal");
  if (!p.interventions.trim()) gaps.push("the interventions");
  if (!p.frequency.trim()) gaps.push("the frequency");
  if (!p.reviewDate) gaps.push("a review date");
  if (gaps.length) throw new UserFacingError(`Add ${gaps.join(", ")} before approving.`, 409);
  await plans.updateOne(
    { _id: id },
    {
      $set: {
        status: "Active",
        approved: { byName: user.name, at: new Date() },
        updatedAt: new Date(),
      },
    },
  );
  await notify([client.userId], {
    title: "Your treatment plan is ready",
    body: `${goals.length} goal${goals.length === 1 ? "" : "s"} for ${p.support.toLowerCase()}, agreed with ${user.name.split(" ")[0]}.`,
    href: "/mobile/patient",
  });
  await audit(user, `Approved the ${p.support} treatment plan (version ${p.version})`, client._id);
  await changed(client);
}

export const reviewSchema = z.object({
  decision: z.enum(reviewDecisions),
  notes: z.string().trim().min(5, "Write the review notes").max(3000),
  nextReviewDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  goals: z.array(z.object({ id: z.string(), status: z.enum(goalStatuses) })).max(12),
});

/** Lifecycle phase 12: review the plan, then continue, revise, transfer or discharge. */
export async function reviewPlan(user: UserDoc, id: ObjectId, input: z.infer<typeof reviewSchema>) {
  const { plans } = await collections();
  const { p, client, canEdit } = await loadPlan(user, id);
  if (!canEdit || !(p.status === "Active" || p.status === "Under Review"))
    throw new UserFacingError("Only an active plan can be reviewed.", 409);
  if (input.decision === "Continue" && !input.nextReviewDate)
    throw new UserFacingError("Set the next review date.");
  const status = {
    Continue: "Active",
    Revise: "Revised",
    Transfer: "Discontinued",
    Discharge: "Completed",
  } as const;
  const goalStatus = new Map(input.goals.map((g) => [g.id, g.status]));
  await plans.updateOne(
    { _id: id },
    {
      $set: {
        status: status[input.decision],
        goals: p.goals.map((g) => ({ ...g, status: goalStatus.get(g.id) ?? g.status })),
        ...(input.decision === "Continue" ? { reviewDate: input.nextReviewDate } : {}),
        ...(input.decision === "Revise" ? { version: p.version + 1, approved: null } : {}),
        updatedAt: new Date(),
      },
      $push: {
        reviews: {
          decision: input.decision,
          notes: input.notes,
          byName: user.name,
          at: new Date(),
        },
      },
    },
  );
  await audit(user, `Reviewed the ${p.support} plan: ${input.decision}`, client._id);
  if (input.decision === "Transfer" || input.decision === "Discharge") {
    await notify(await adminIds(), {
      title: `${input.decision}: ${client.name}`,
      body: `${user.name} reviewed the ${p.support} plan and recommends ${input.decision.toLowerCase()}.`,
      href: `/care/${client._id.toHexString()}`,
    });
  }
  await changed(client);
}

const progressSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "cautions"],
  properties: {
    summary: {
      type: "string",
      description: "Tentative narrative of progress against each goal, 3-6 sentences.",
    },
    cautions: {
      type: "array",
      items: { type: "string" },
      description: "Where measures are not comparable or data is thin.",
    },
  },
};

/** An AI progress summary from the recorded goal measures. A draft for the clinician to interpret. */
export async function draftProgressSummary(user: UserDoc, id: ObjectId) {
  const { plans } = await collections();
  const { p, canEdit } = await loadPlan(user, id);
  if (!canEdit) throw new UserFacingError("Only the treating therapist can do that.", 409);
  const facts = p.goals.map((g) => ({
    goal: g.description,
    measure: g.measure,
    baseline: g.baseline,
    target: g.target,
    current: g.current,
    status: g.status,
    readings: g.history.map((h) => ({
      date: h.at.toISOString().slice(0, 10),
      value: h.value,
      note: h.note,
    })),
  }));
  try {
    const out = await generateJson("progress-summary", {
      system:
        "You draft progress summaries for allied health clinicians. Use only the recorded values. Never invent measurements, diagnoses, doses or eligibility, never combine different scales into a percentage, and say plainly where readings are missing or not comparable. Write tentatively: the clinician interprets and signs.",
      user: `Service: ${p.support}\nGoals and recorded measures:\n${JSON.stringify(facts, null, 1)}`,
      schema: progressSchema,
      schemaName: "progress_summary",
      maxTokens: 900,
    });
    const parsed = JSON.parse(out.text) as { summary: string; cautions: string[] };
    const text = [parsed.summary, ...parsed.cautions.map((c) => `Caution: ${c}`)].join("\n");
    await plans.updateOne(
      { _id: id },
      { $set: { progressSummary: { text, at: new Date(), model: out.model } } },
    );
    return { text };
  } catch (error) {
    if (error instanceof AiError)
      throw new UserFacingError(`The AI draft isn't available: ${error.message}`, 409);
    throw new UserFacingError("The AI draft couldn't be read. Try again.", 409);
  }
}

/* --------------------------------------------- clinical summary for a patient */

/** Each service's assessments and plan, as statuses. Content stays with the treating clinician. */
export async function clinicalSummary(clientId: ObjectId): Promise<ClinicalSummaryDto[]> {
  const db = await collections();
  const client = await db.clients.findOne({ _id: clientId });
  if (!client) return [];
  const [assessments, plans] = await Promise.all([
    db.assessments.find({ clientId }).sort({ createdAt: -1 }).toArray(),
    db.plans.find({ clientId }).sort({ createdAt: -1 }).toArray(),
  ]);
  return client.needs.map((n) => {
    const plan = plans.find((p) => p.needId === n.id);
    return {
      needId: n.id,
      assessments: assessments
        .filter((a) => a.needId === n.id)
        .map((a) => ({
          id: a._id.toHexString(),
          status: a.status,
          kind: a.kind,
          recommendation: a.recommendation.decision,
          updatedAt: a.updatedAt.toISOString(),
        })),
      plan: plan
        ? {
            id: plan._id.toHexString(),
            status: plan.status,
            goals: plan.goals.length,
            achieved: plan.goals.filter((g) => g.status === "Achieved").length,
            reviewDate: plan.reviewDate,
          }
        : null,
    };
  });
}

/** What the participant may see (P04): approved plans' goals and released reports. */
export async function patientProgress(clientId: ObjectId) {
  const db = await collections();
  const [plans, reports] = await Promise.all([
    db.plans
      .find({ clientId, status: { $in: ["Active", "Under Review", "Completed"] } })
      .sort({ createdAt: -1 })
      .toArray(),
    db.assessments
      .find({ clientId, released: { $ne: null } })
      .sort({ createdAt: -1 })
      .toArray(),
  ]);
  return {
    plans: plans.map((p) => ({
      id: p._id.toHexString(),
      support: p.support,
      status: p.status,
      therapistName: p.therapistName,
      reviewDate: p.reviewDate,
      goals: p.goals
        .filter((g) => g.status !== "Discontinued")
        .map((g) => ({
          id: g.id,
          description: g.description,
          baseline: g.baseline,
          target: g.target,
          current: g.current,
          status: g.status,
        })),
    })),
    reports: reports.map((a) => ({
      id: a._id.toHexString(),
      support: a.support,
      summary: a.released!.summary,
      byName: a.released!.byName,
      at: a.released!.at.toISOString(),
    })),
  };
}

/* ------------------------------------------------- the visit (section 11) */

/** The pre-visit summary: everything to read before arriving, from the record itself. */
export async function briefing(user: UserDoc, visitId: ObjectId) {
  const db = await collections();
  const { visit, actsFor } = await visitFor(user, visitId);
  if (actsFor === "client") throw new UserFacingError("Visit not found.", 404);
  const { client } = await partiesOf(visit);
  const need = client.needs.find(
    (n) => n.discipline === visit.discipline && n.therapistId?.equals(visit.therapistId),
  );
  const [plan, assessment, last] = await Promise.all([
    need
      ? db.plans.findOne(
          {
            clientId: client._id,
            needId: need.id,
            status: { $in: ["Active", "Under Review", "Revised", "Draft"] },
          },
          { sort: { createdAt: -1 } },
        )
      : null,
    need
      ? db.assessments.findOne(
          { clientId: client._id, needId: need.id },
          { sort: { createdAt: -1 } },
        )
      : null,
    db.appointments.findOne(
      {
        clientId: client._id,
        therapistId: visit.therapistId,
        status: "completed",
        start: { $lt: visit.start },
      },
      { sort: { start: -1 } },
    ),
  ]);
  return {
    visitId: visit._id.toHexString(),
    patient: client.name,
    when: visit.start.toISOString(),
    service: need?.support ?? visit.discipline,
    location: need?.location ?? "Home",
    suburb: client.suburb,
    phone: client.phone,
    precautions: client.precautions ?? null,
    notes: client.notes,
    consent: assessment?.consent.obtained ?? false,
    assessment: assessment ? { id: assessment._id.toHexString(), status: assessment.status } : null,
    plan: plan
      ? {
          id: plan._id.toHexString(),
          status: plan.status,
          goals: plan.goals
            .filter((g) => g.status === "Active")
            .map((g) => ({
              id: g.id,
              description: g.description,
              measure: g.measure,
              baseline: g.baseline,
              target: g.target,
              current: g.current,
            })),
        }
      : null,
    lastVisit: last
      ? {
          at: last.start.toISOString(),
          plan: last.note?.plan ?? "",
          summary: last.note?.forPatient ?? "",
        }
      : null,
  };
}

export const checkInSchema = z.object({
  attendees: z.string().trim().min(2, "Say who is present").max(300),
  safe: z.boolean(),
  notes: z.string().trim().max(1000),
  at: z.iso.datetime().optional(),
});

/** Arrival: identity, location and attendees confirmed, immediate safety checked, time captured. */
export async function checkIn(user: UserDoc, id: ObjectId, input: z.infer<typeof checkInSchema>) {
  const { appointments } = await collections();
  const { visit, actsFor } = await visitFor(user, id);
  if (actsFor !== "therapist")
    throw new UserFacingError("Only the visiting therapist can check in.", 409);
  if (visit.status !== "booked")
    throw new UserFacingError("Only a booked visit can be checked in.", 409);
  if (visit.checkIn) throw new UserFacingError("Already checked in.", 409);
  const at = input.at ? new Date(input.at) : new Date();
  if (Math.abs(at.getTime() - visit.start.getTime()) > 12 * 3_600_000) {
    throw new UserFacingError("Check in on the day of the visit.", 409);
  }
  if (!input.safe)
    throw new UserFacingError(
      "If it isn't safe to continue, end the visit as incomplete and record why.",
      409,
    );
  await appointments.updateOne(
    { _id: id },
    {
      $set: {
        checkIn: {
          at,
          attendees: input.attendees,
          safe: true,
          notes: input.notes,
          byName: user.name,
        },
      },
    },
  );
  const { client } = await partiesOf(visit);
  await audit(user, `Checked in for the visit on ${slotLabel(visit.start)}`, client._id);
  await changed(client);
}

export const sessionSchema = z.object({
  goals: z
    .array(
      z.object({
        goalId: z.string().max(60),
        value: z.string().trim().max(200),
        note: z.string().trim().max(500),
      }),
    )
    .max(12),
  interventions: z.string().trim().max(3000),
  response: z.string().trim().max(3000),
  incidents: z.string().trim().max(2000),
  followUp: z.string().trim().max(2000),
});

/** What was done and measured, against the plan's goals. Measured values update each goal. */
export async function saveSession(
  user: UserDoc,
  id: ObjectId,
  input: z.infer<typeof sessionSchema>,
) {
  const db = await collections();
  const { visit, actsFor } = await visitFor(user, id);
  if (actsFor !== "therapist")
    throw new UserFacingError("Only the visiting therapist can record the session.", 409);
  if (!visit.checkIn) throw new UserFacingError("Check in first.", 409);
  if (visit.status !== "booked" && visit.status !== "completed")
    throw new UserFacingError("This visit can't be recorded.", 409);
  await db.appointments.updateOne({ _id: id }, { $set: { session: input } });
  const { client } = await partiesOf(visit);
  const measured = input.goals.filter((g) => g.value);
  if (measured.length) {
    const plan = await db.plans.findOne({
      clientId: client._id,
      therapistId: visit.therapistId,
      "goals.id": { $in: measured.map((g) => g.goalId) },
    });
    if (plan) {
      const byId = new Map(measured.map((g) => [g.goalId, g]));
      await db.plans.updateOne(
        { _id: plan._id },
        {
          $set: {
            goals: plan.goals.map((g) => {
              const m = byId.get(g.id);
              if (!m) return g;
              const history = g.history.filter((h) => !h.visitId?.equals(visit._id));
              return {
                ...g,
                current: m.value,
                history: [
                  ...history,
                  {
                    value: m.value,
                    note: m.note,
                    at: visit.start,
                    byName: user.name,
                    visitId: visit._id,
                  },
                ],
              };
            }),
            updatedAt: new Date(),
          },
        },
      );
    }
  }
  if (input.incidents) {
    await notify(await adminIds(), {
      title: `Incident recorded: ${client.name}`,
      body: `${user.name} recorded an incident at the visit on ${slotLabel(visit.start)}.`,
      href: `/care/${client._id.toHexString()}`,
    });
  }
  await audit(
    user,
    `Recorded the session for ${slotLabel(visit.start)}${input.incidents ? " (incident noted)" : ""}`,
    client._id,
  );
  await changed(client);
}

export const checkOutSchema = z.object({ at: z.iso.datetime().optional() });

/** Wrap-up: check-out captures the actual duration and the visit is attended. A note is due next. */
export async function checkOut(user: UserDoc, id: ObjectId, input: z.infer<typeof checkOutSchema>) {
  const { appointments } = await collections();
  const { visit, actsFor } = await visitFor(user, id);
  if (actsFor !== "therapist")
    throw new UserFacingError("Only the visiting therapist can check out.", 409);
  if (!visit.checkIn) throw new UserFacingError("Check in first.", 409);
  if (visit.status !== "booked") throw new UserFacingError("Already checked out.", 409);
  const at = input.at ? new Date(input.at) : new Date();
  const minutes = Math.round((at.getTime() - visit.checkIn.at.getTime()) / 60_000);
  if (minutes < 5)
    throw new UserFacingError("Check-out must be at least 5 minutes after check-in.", 409);
  if (minutes > 8 * 60)
    throw new UserFacingError("Check the check-out time: that's over 8 hours.", 409);
  await appointments.updateOne(
    { _id: id, status: "booked" },
    { $set: { status: "completed", checkOut: { at, minutes, byName: user.name } } },
  );
  const { client } = await partiesOf(visit);
  await audit(user, `Checked out: ${minutes} minutes on ${slotLabel(visit.start)}`, client._id);
  await changed(client);
  return { minutes };
}

export const abortSchema = z.object({
  reason: z.string().trim().min(3, "Say why the visit ended early").max(1000),
  remaining: z.string().trim().max(1000),
});

/** An incomplete visit: the reason and what remains are kept, and intake is asked to rebook. */
export async function abortVisit(user: UserDoc, id: ObjectId, input: z.infer<typeof abortSchema>) {
  const { appointments } = await collections();
  const { visit, actsFor } = await visitFor(user, id);
  if (actsFor === "client") throw new UserFacingError("Visit not found.", 404);
  if (visit.status !== "booked")
    throw new UserFacingError("Only a booked visit can end early.", 409);
  await appointments.updateOne(
    { _id: id, status: "booked" },
    {
      $set: {
        status: "aborted",
        holdsSlot: false,
        aborted: { ...input, byName: user.name, at: new Date() },
      },
    },
  );
  const { client } = await partiesOf(visit);
  await notify(await adminIds(), {
    title: `Visit incomplete: ${client.name}`,
    body: `${input.reason}. ${input.remaining ? `Still to do: ${input.remaining}. ` : ""}Book a follow-up visit.`,
    href: `/care/${client._id.toHexString()}`,
  });
  await audit(
    user,
    `Ended the visit on ${slotLabel(visit.start)} as incomplete: ${input.reason}`,
    client._id,
  );
  await changed(client);
}

/* --------------------------------------------- session notes (SOAP, signed) */

export const soapSchema = z.object({
  subjective: z.string().trim().max(3000),
  objective: z.string().trim().max(3000),
  assessment: z.string().trim().max(3000),
  plan: z.string().trim().max(3000),
  forPatient: z.string().trim().max(800),
  aiDrafted: z.boolean().default(false),
  sign: z.boolean(),
});

/**
 * The SOAP note. Saved as a draft until the clinician signs it; signing makes it final, shows the
 * patient the plain summary, and verifies the service for billing.
 */
export async function writeSoapNote(
  user: UserDoc,
  id: ObjectId,
  input: z.infer<typeof soapSchema>,
) {
  const { appointments } = await collections();
  const { visit, actsFor } = await visitFor(user, id);
  if (actsFor === "client") throw new UserFacingError("Only the care team can write notes.", 409);
  if (visit.status !== "completed")
    throw new UserFacingError("Check out of the visit before writing its note.", 409);
  if (visit.note && ["Final", "Amended"].includes(noteStatusOf(visit))) {
    throw new UserFacingError("This note is signed. Add an amendment instead.", 409);
  }
  if (input.sign && actsFor !== "therapist")
    throw new UserFacingError("Only the treating clinician can sign.", 409);
  const text = [
    input.subjective && `S: ${input.subjective}`,
    input.objective && `O: ${input.objective}`,
    input.assessment && `A: ${input.assessment}`,
    input.plan && `P: ${input.plan}`,
  ]
    .filter(Boolean)
    .join("\n");
  if (input.sign) {
    const missing = (["subjective", "objective", "assessment", "plan"] as const).filter(
      (k) => input[k].length < 3,
    );
    if (missing.length) throw new UserFacingError(`Complete ${missing.join(", ")} before signing.`);
    if (input.forPatient.length < 10)
      throw new UserFacingError("Add a short summary for the patient before signing.");
  }
  if (text.length < 3) throw new UserFacingError("Write the note first.");
  const now = new Date();
  await appointments.updateOne(
    { _id: id },
    {
      $set: {
        note: {
          subjective: input.subjective,
          objective: input.objective,
          assessment: input.assessment,
          plan: input.plan,
          text,
          forPatient: input.forPatient,
          status: input.sign ? "Final" : "Draft",
          aiDrafted: input.aiDrafted || Boolean(visit.note?.aiDrafted),
          signedAt: input.sign ? now : null,
          amendments: [],
          byName: user.name,
          at: now,
        },
      },
    },
  );
  const { client, therapist } = await partiesOf(visit);
  if (input.sign) {
    await notify([client.userId], {
      title: `Visit summary from ${therapist.name.split(" ")[0]}`,
      body: `Your ${visit.discipline.toLowerCase()} visit on ${slotLabel(visit.start)}: ${input.forPatient.slice(0, 120)}`,
      href: "/mobile/patient",
    });
    // Service verified: attended, checked out and signed. It goes to finance's draft invoice.
    const fresh = await appointments.findOne({ _id: id });
    if (fresh) await billVisit(fresh, "service");
  }
  await audit(
    user,
    `${input.sign ? "Signed" : "Saved a draft of"} the session note for ${slotLabel(visit.start)}`,
    client._id,
  );
  await changed(client, therapist.userId);
}

export async function amendNote(user: UserDoc, id: ObjectId, input: z.infer<typeof amendSchema>) {
  const { appointments } = await collections();
  const { visit, actsFor } = await visitFor(user, id);
  if (actsFor !== "therapist")
    throw new UserFacingError("Only the treating clinician can amend.", 409);
  if (!visit.note || !["Final", "Amended"].includes(noteStatusOf(visit)))
    throw new UserFacingError("Sign the note before amending.", 409);
  await appointments.updateOne(
    { _id: id },
    {
      $set: { "note.status": "Amended" },
      $push: { "note.amendments": { ...input, byName: user.name, at: new Date() } },
    },
  );
  const { client } = await partiesOf(visit);
  await audit(
    user,
    `Amended the session note for ${slotLabel(visit.start)}: ${input.reason}`,
    client._id,
  );
  await changed(client);
}

const soapJson = {
  type: "object",
  additionalProperties: false,
  required: ["subjective", "objective", "assessment", "plan", "forPatient", "missing"],
  properties: {
    subjective: { type: "string" },
    objective: { type: "string" },
    assessment: { type: "string" },
    plan: { type: "string" },
    forPatient: {
      type: "string",
      description: "Two plain-language sentences for the patient or family.",
    },
    missing: {
      type: "array",
      items: { type: "string" },
      description: "Information a complete note would need that the clinician didn't give.",
    },
  },
};

export const draftSchema = z.object({
  rough: z.string().trim().min(15, "Write a few lines first").max(6000),
});

/** Turns the clinician's rough notes and the session record into a SOAP draft. Never signs. */
export async function draftSoap(user: UserDoc, id: ObjectId, input: z.infer<typeof draftSchema>) {
  const { visit, actsFor } = await visitFor(user, id);
  if (actsFor !== "therapist")
    throw new UserFacingError("Only the treating clinician can draft notes.", 409);
  const { client } = await partiesOf(visit);
  const context = {
    service: visit.discipline,
    date: visit.start.toISOString().slice(0, 10),
    attended: visit.checkIn?.attendees,
    minutes: visit.checkOut?.minutes,
    session: visit.session,
    precautions: client.precautions,
  };
  try {
    const out = await generateJson("soap-draft", {
      system:
        "You draft SOAP session notes for allied health clinicians from their own rough notes. Use only what the clinician wrote and the session record. Never invent measurements, scores, diagnoses, medication or doses. Keep reported information (what the participant or carer said) in Subjective and observed findings in Objective. If something is missing, list it in `missing` instead of guessing. Write in Australian English, concise clinical style.",
      user: `Session record: ${JSON.stringify(context)}\n\nClinician's rough notes:\n${input.rough}`,
      schema: soapJson,
      schemaName: "soap_note",
      maxTokens: 1200,
    });
    const draft = JSON.parse(out.text) as Record<string, unknown>;
    await audit(
      user,
      `Generated an AI draft of the session note for ${slotLabel(visit.start)}`,
      client._id,
    );
    return { ...draft, model: out.model };
  } catch (error) {
    if (error instanceof AiError)
      throw new UserFacingError(`The AI draft isn't available: ${error.message}`, 409);
    throw new UserFacingError("The AI draft couldn't be read. Try again.", 409);
  }
}
