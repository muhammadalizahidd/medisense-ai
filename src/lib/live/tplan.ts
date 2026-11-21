import { z } from "zod";

/**
 * Module 13: treatment plans and goals. Plans turn approved assessment findings and participant
 * priorities into goals, interventions and reviews. Nothing here prescribes: the clinician sets
 * every target, dose and decision, and signed versions never change in place.
 */

export const planStates = [
  "Not Started",
  "Draft",
  "Pending Review",
  "Ready for Approval",
  "Active",
  "Under Review",
  "Paused",
  "Superseded",
  "Completed",
  "Discontinued",
] as const;
export type PlanState = (typeof planStates)[number];

/** Section 3: only these moves are allowed. */
export const planMoves: Record<PlanState, readonly PlanState[]> = {
  "Not Started": ["Draft"],
  Draft: ["Pending Review", "Ready for Approval", "Discontinued"],
  "Pending Review": ["Draft", "Ready for Approval"],
  "Ready for Approval": ["Draft", "Active", "Pending Review"],
  Active: ["Under Review", "Paused", "Superseded", "Completed", "Discontinued"],
  "Under Review": ["Active", "Paused", "Superseded", "Completed", "Discontinued"],
  Paused: ["Active", "Under Review", "Completed", "Discontinued"],
  Superseded: [],
  Completed: [],
  Discontinued: [],
};

export const planTypes = [
  "Initial",
  "Revised",
  "Maintenance",
  "Transitional",
  "Discharge planning",
] as const;
export const settings = [
  "Home",
  "School",
  "Daycare",
  "Day Program",
  "Community",
  "Telehealth",
  "Mixed",
] as const;
export const informedStates = [
  "Agreed",
  "Declined",
  "Pending",
  "Capacity / representative review",
] as const;
export const goalCategories = [
  "Self-care",
  "Mobility",
  "Communication",
  "Cognition",
  "Participation",
  "Behavioural health",
  "Exercise",
  "Nutrition",
  "Continence",
  "Wound/skin",
  "Home environment",
  "Equipment",
  "Other",
] as const;
export const ownerships = ["Participant", "Clinician", "Shared decision"] as const;
export const goalPriorities = ["High", "Medium", "Low"] as const;
export const horizons = ["Short-term", "Medium-term", "Long-term", "Not specified"] as const;
export const measureTypes = [
  "Numeric",
  "Ordinal",
  "Categorical",
  "Time",
  "Frequency",
  "Observation",
  "Validated instrument",
  "Narrative",
] as const;
export const directions = [
  "Increase",
  "Decrease",
  "Maintain",
  "Meet threshold",
  "Descriptive",
] as const;
export const reviewFrequencies = [
  "Every session",
  "Every 4 sessions",
  "Every 8 sessions",
  "By date",
  "Clinician judgement",
] as const;
export const goalStates = [
  "Not Started",
  "In Progress",
  "Achieved",
  "Partially Achieved",
  "Not Achieved",
  "On Hold",
  "Revised",
  "Discontinued",
] as const;
export type GoalState = (typeof goalStates)[number];
export const barrierTypes = [
  "Environmental",
  "Health",
  "Attendance",
  "Resources",
  "Carer",
  "Equipment",
  "Other",
] as const;
export const closures = [
  "Met",
  "Partially met",
  "Not met",
  "No longer relevant",
  "Discontinued",
  "Unassessable",
] as const;
export const activityStates = [
  "Planned",
  "Active",
  "Completed",
  "Paused",
  "Replaced",
  "Discontinued",
] as const;
export const deliveryModes = ["In person", "Telehealth", "Home program", "Group", "Mixed"] as const;
export const reviewDecisions13 = [
  "Continue",
  "Revise",
  "Pause",
  "Complete",
  "Discontinue",
] as const;

/** Units a numeric goal can use; categories never get a percentage (AT-21, AT-24). */
export const units = [
  "m",
  "s",
  "min",
  "reps",
  "kg",
  "degrees",
  "%",
  "/10",
  "times/week",
  "steps",
  "words",
  "accuracy %",
  "cm",
  "mm",
] as const;

/**
 * Progress towards a numeric target as a share of the intended change. Only for numeric, time or
 * frequency goals that increase or decrease; never a recovery score (section 6).
 */
export function progressShare(g: {
  type: string;
  direction: string;
  baseline: string;
  target: string;
  current: string;
}) {
  if (!["Numeric", "Time", "Frequency"].includes(g.type)) return null;
  if (g.direction !== "Increase" && g.direction !== "Decrease") return null;
  const b = Number(g.baseline);
  const t = Number(g.target);
  const c = Number(g.current);
  if (![b, t, c].every(Number.isFinite) || t === b) return null;
  const share = (c - b) / (t - b);
  return Math.max(-1, Math.min(1.5, share));
}

/* ------------------------------------------------------------------ DTOs */

export type MeasurementPoint = {
  value: string;
  date: string;
  source: string;
  context: string;
  by: string;
};
export type GoalDto = {
  id: string;
  title: string;
  description: string;
  category: string;
  ownership: string;
  priority: string;
  horizon: string;
  horizonReason: string;
  type: string;
  direction: string;
  baseline: string;
  target: string;
  current: string;
  unit: string;
  instrument: string;
  context: string;
  reviewFrequency: string;
  targetDate: string;
  state: GoalState;
  holdReason: string;
  barriers: { type: string; note: string }[];
  closure: { reason: string; note: string; by: string; at: string } | null;
  achievedBy: string | null;
  interpretation: string;
  points: MeasurementPoint[];
  share: number | null;
  shared: boolean;
};
export type InterventionDto = {
  id: string;
  name: string;
  goalIds: string[];
  rationale: string;
  mode: string;
  sessionsPerWeek: number;
  minutes: number;
  weeks: number;
  dosage: {
    sets: string;
    reps: string;
    distance: string;
    time: string;
    resistance: string;
    assistance: string;
    prompts: string;
  };
  home: {
    activity: string;
    instructions: string;
    frequency: string;
    equipment: string;
    carer: string;
  } | null;
  precautions: string;
  stopCriteria: string;
  status: string;
};
export type PlanTimeline = { at: string; by: string; action: string; reason: string };

export type PlanFullDto = {
  id: string;
  ref: string;
  clientId: string;
  participant: string;
  participantId: string;
  needId: string;
  support: string;
  discipline: string;
  clinician: string;
  state: PlanState;
  version: number;
  planType: string;
  rationale: string;
  priorities: string;
  setting: string;
  startDate: string;
  reviewDate: string;
  expectedEnd: string;
  informed: string;
  informedNotes: string;
  precautions: string;
  riskAcknowledged: boolean;
  frequency: string;
  duration: string;
  sources: {
    id: string;
    ref: string;
    support: string;
    status: string;
    author: string;
    date: string;
  }[];
  noAssessmentReason: string;
  goals: GoalDto[];
  interventions: InterventionDto[];
  blockers: string[];
  coSign: { required: boolean; by: string | null; at: string | null };
  signed: { by: string; at: string } | null;
  sharing: {
    shared: boolean;
    recipients: string[];
    goalIds: string[];
    by: string | null;
    at: string | null;
    acknowledged: string | null;
  };
  versions: { id: string; version: number; state: PlanState; signedAt: string | null }[];
  timeline: PlanTimeline[];
  reviews: { decision: string; notes: string; by: string; at: string }[];
  aiGoals: { text: string; at: string } | null;
  aiProgress: { text: string; cautions: string[]; at: string } | null;
  contacts: string[];
  restricted: boolean;
  canEdit: boolean;
  canCoSign: boolean;
  view: "clinical" | "status";
  moves: PlanState[];
};

export type PlanRow = {
  id: string | null;
  ref: string;
  clientId: string;
  participant: string;
  participantId: string;
  needId: string;
  support: string;
  discipline: string;
  clinician: string;
  state: PlanState;
  version: number;
  goals: number;
  achieved: number;
  reviewDate: string;
  reviewOverdue: boolean;
  shared: boolean;
  restricted: boolean;
  updatedAt: string;
};

/* ------------------------------------------------------------------ actions */

const t = (n: number) => z.string().trim().max(n);
const day = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);
export const goalInput = z.object({
  id: t(60).optional(),
  title: t(120).min(3, "Give the goal a short title"),
  description: t(600).min(10, "Describe the functional outcome"),
  category: z.enum(goalCategories),
  ownership: z.enum(ownerships),
  priority: z.enum(goalPriorities),
  horizon: z.enum(horizons),
  horizonReason: t(300),
  type: z.enum(measureTypes),
  direction: z.enum(directions),
  baseline: t(120),
  target: t(120),
  unit: t(30),
  instrument: t(120),
  context: t(300),
  reviewFrequency: z.enum(reviewFrequencies),
  targetDate: day,
  baselineAlternative: t(300),
});
export const interventionInput = z.object({
  id: t(60).optional(),
  name: t(160).min(3),
  goalIds: z.array(t(60)).min(1, "Link the intervention to at least one goal"),
  rationale: t(600),
  mode: z.enum(deliveryModes),
  sessionsPerWeek: z.number().min(0).max(14),
  minutes: z.number().int().min(0).max(480),
  weeks: z.number().int().min(0).max(104),
  dosage: z.object({
    sets: t(20),
    reps: t(20),
    distance: t(20),
    time: t(20),
    resistance: t(40),
    assistance: t(80),
    prompts: t(80),
  }),
  home: z
    .object({
      activity: t(200),
      instructions: t(800),
      frequency: t(80),
      equipment: t(160),
      carer: t(200),
    })
    .nullable(),
  precautions: t(600),
  stopCriteria: t(400),
  status: z.enum(activityStates),
});

export const planActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("header"),
    planType: z.enum(planTypes),
    rationale: t(3000),
    priorities: t(1500),
    setting: z.enum(settings),
    startDate: day,
    reviewDate: day,
    expectedEnd: day,
    informed: z.enum(informedStates),
    informedNotes: t(800),
    riskAcknowledged: z.boolean(),
    frequency: t(120),
    duration: t(120),
    noAssessmentReason: t(400),
  }),
  z.object({ type: z.literal("goal"), goal: goalInput }),
  z.object({
    type: z.literal("goal-state"),
    goalId: t(60),
    state: z.enum(goalStates),
    reason: t(600),
    confirm: z.boolean(),
  }),
  z.object({
    type: z.literal("goal-close"),
    goalId: t(60),
    reason: z.enum(closures),
    note: t(600),
  }),
  z.object({
    type: z.literal("barrier"),
    goalId: t(60),
    barrier: z.enum(barrierTypes),
    note: t(300),
  }),
  z.object({
    type: z.literal("measure"),
    goalId: t(60),
    value: t(60).min(1),
    source: z.enum([
      "Signed session note",
      "Direct observation",
      "Participant report",
      "Carer report",
      "Validated instrument",
    ]),
    context: t(300),
    interpretation: t(800),
  }),
  z.object({ type: z.literal("intervention"), intervention: interventionInput }),
  z.object({ type: z.literal("move"), to: z.enum(planStates), reason: t(800) }),
  z.object({ type: z.literal("co-sign"), note: t(600) }),
  z.object({ type: z.literal("sign") }),
  z.object({
    type: z.literal("review"),
    decision: z.enum(reviewDecisions13),
    notes: t(3000).min(5, "Write the review notes"),
    nextReviewDate: day,
  }),
  z.object({
    type: z.literal("revise"),
    reason: t(600).min(5, "Say why the plan is being revised"),
  }),
  z.object({
    type: z.literal("decline"),
    notes: t(1500).min(10, "Record the discussion and decision"),
  }),
  z.object({
    type: z.literal("share"),
    recipients: z.array(t(120)).min(1, "Choose an authorised recipient"),
    goalIds: z.array(t(60)).min(1, "Choose the goals to share"),
  }),
  z.object({ type: z.literal("revoke") }),
  z.object({ type: z.literal("ai-goals"), notes: t(3000).min(10, "Write your notes first") }),
  z.object({ type: z.literal("ai-progress") }),
]);
export type PlanAction = z.infer<typeof planActionSchema>;

export const stateTone: Record<PlanState, "healthy" | "watch" | "over" | "available" | "neutral"> =
  {
    "Not Started": "neutral",
    Draft: "available",
    "Pending Review": "watch",
    "Ready for Approval": "watch",
    Active: "healthy",
    "Under Review": "watch",
    Paused: "neutral",
    Superseded: "neutral",
    Completed: "healthy",
    Discontinued: "neutral",
  };
export const goalTone: Record<GoalState, "healthy" | "watch" | "over" | "available" | "neutral"> = {
  "Not Started": "neutral",
  "In Progress": "available",
  Achieved: "healthy",
  "Partially Achieved": "watch",
  "Not Achieved": "over",
  "On Hold": "neutral",
  Revised: "neutral",
  Discontinued: "neutral",
};
