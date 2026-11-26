import { z } from "zod";

/* Module 16: Progress Monitoring & Clinical Reports. Shared by the server, the API and the screens. */

export const episodeStates = [
  "Assessment Only",
  "Active Treatment",
  "Paused",
  "Under Review",
  "Transfer Pending",
  "Discharged",
  "Closed",
] as const;
export type EpisodeState = (typeof episodeStates)[number];

export const observationStates = [
  "Draft",
  "Pending Review",
  "Verified",
  "Corrected",
  "Excluded",
] as const;
export const reviewStates = [
  "Not Started",
  "In Progress",
  "Awaiting Information",
  "Pending Signature",
  "Finalised",
  "Abandoned",
] as const;
export const reportStates = [
  "Requested",
  "Draft",
  "In Review",
  "Changes Requested",
  "Signed",
  "Released",
  "Superseded",
  "Withdrawn",
] as const;
export type ReportState = (typeof reportStates)[number];

export const progressStatuses = [
  "Not Started",
  "Improving",
  "Stable",
  "Declining",
  "Variable",
  "Unable to Determine",
] as const;
export const reviewTriggers = [
  "Scheduled",
  "Goal Reached",
  "Clinical Concern",
  "Change in Circumstances",
  "Funding Review",
  "Discharge",
] as const;
export const methods = [
  "Direct Observation",
  "Questionnaire",
  "Timed Test",
  "Instrument",
  "Participant Report",
  "Third-Party Report",
] as const;
export const conditionsSources = [
  "Observed",
  "Participant Reported",
  "Carer Reported",
  "Standardised Instrument",
  "Other",
] as const;
export const units = [
  "m",
  "cm",
  "sec",
  "min",
  "degrees",
  "repetitions",
  "%",
  "ordinal category",
  "scale-specific",
  "none",
] as const;
export const directions = [
  "Higher",
  "Lower",
  "Target Range",
  "Categorical",
  "Clinician Judgement",
] as const;
export const notAssessable = [
  "Declined",
  "Fatigue",
  "Safety",
  "Equipment Unavailable",
  "Not Applicable",
  "Other",
] as const;
export const settings = [
  "Home",
  "School",
  "Daycare",
  "Day Program",
  "Community",
  "Telehealth",
] as const;
export const domains = [
  "Self-Care",
  "Mobility",
  "Communication",
  "Social Interaction",
  "Learning",
  "Self-Management",
  "Domestic Life",
  "Community Participation",
] as const;
export const reviewOutcomes = [
  "Continue",
  "Revise Plan",
  "Further Assessment",
  "Refer/Transfer",
  "Assessment Only Completed",
  "Discharge",
] as const;
export const purposes = [
  "NDIS Review",
  "Treating Team",
  "Participant",
  "Referrer",
  "Insurer",
  "Other",
] as const;
export const recipients = [
  "Participant",
  "Guardian",
  "Support Coordinator",
  "Referrer",
  "Other",
] as const;
export const reportTypes = [
  "FCA report",
  "NDIS therapy progress report",
  "Discipline progress report",
  "Reassessment report",
  "Clinical handover",
  "Discharge summary",
] as const;
export type ReportType = (typeof reportTypes)[number];

/** Required sections per report template (section 10). */
export const reportTemplates: Record<ReportType, { key: string; title: string }[]> = {
  "FCA report": [
    { key: "question", title: "Referral question" },
    { key: "context", title: "Participant and context" },
    { key: "methods", title: "Methods" },
    { key: "domains", title: "Functional domains" },
    { key: "findings", title: "Findings and evidence" },
    { key: "support", title: "Participation and support needs" },
    { key: "recs", title: "Recommendations" },
  ],
  "NDIS therapy progress report": [
    { key: "goals", title: "Participant goals" },
    { key: "service", title: "Service delivered (period and frequency)" },
    { key: "outcomes", title: "Baseline and current outcomes" },
    { key: "approach", title: "Approach" },
    { key: "progress", title: "Observed progress and barriers" },
    { key: "recs", title: "Recommendations" },
  ],
  "Discipline progress report": [
    { key: "summary", title: "Course of care summary" },
    { key: "goals", title: "Goals reviewed" },
    { key: "interventions", title: "Interventions" },
    { key: "findings", title: "Objective findings" },
    { key: "interpretation", title: "Clinician interpretation" },
    { key: "plan", title: "Plan" },
  ],
  "Reassessment report": [
    { key: "dates", title: "Prior and current dates and methods" },
    { key: "comparability", title: "Comparability" },
    { key: "findings", title: "Updated findings" },
    { key: "decisions", title: "Decisions" },
  ],
  "Clinical handover": [
    { key: "supports", title: "Current supports" },
    { key: "risks", title: "Risks" },
    { key: "history", title: "Relevant history" },
    { key: "plan", title: "Latest signed plan" },
    { key: "pending", title: "Pending tasks and receiving provider" },
  ],
  "Discharge summary": [
    { key: "reason", title: "Reason and dates" },
    { key: "supports", title: "Supports delivered" },
    { key: "outcomes", title: "Outcomes" },
    { key: "concerns", title: "Outstanding concerns" },
    { key: "advice", title: "Advice and referrals" },
    { key: "followup", title: "Follow-up" },
  ],
};

/** Plausible ranges: a value outside is flagged for verification, never changed (AC-14). */
export const plausible: Record<string, [number, number]> = {
  m: [0, 5000],
  cm: [0, 300],
  sec: [0, 3600],
  min: [0, 600],
  degrees: [0, 360],
  repetitions: [0, 500],
  "%": [0, 100],
};

export type Observation = {
  id: string;
  ref: string;
  goalId: string | null;
  goalTitle: string;
  domain: string;
  method: string;
  instrument: string;
  licensed: boolean;
  raw: string;
  unit: string;
  date: string;
  setting: string;
  conditions: string;
  source: string;
  sourceLink: { label: string; href: string } | null;
  status: string;
  notAssessable: string;
  interpretation: string;
  assessor: string;
  flags: string[];
};

export type GoalProgress = {
  id: string;
  title: string;
  domain: string;
  direction: string;
  unit: string;
  method: string;
  baseline: string;
  current: string;
  target: string;
  state: string;
  status: string;
  percent: number | null;
  notCalculable: string;
  warnings: string[];
  points: { date: string; value: number; label: string }[];
  revisions: { at: string; by: string; from: string; to: string; reason: string }[];
};

export type ReviewDto = {
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
  visits: { setting: string; at: string }[];
  interpretation: string;
  outcome: string;
  signed: { by: string; at: string } | null;
  dueAt: string;
};

export type ReportRow = {
  id: string;
  ref: string;
  type: ReportType;
  participant: string;
  participantId: string;
  discipline: string;
  author: string;
  status: ReportState;
  purpose: string;
  dueAt: string;
  overdue: boolean;
  version: number;
  restricted: boolean;
  gaps: number;
  episodeId: string;
};

export type EpisodeRow = {
  id: string;
  participant: string;
  participantId: string;
  discipline: string;
  service: string;
  clinician: string;
  state: EpisodeState;
  goals: number;
  improving: number;
  achieved: number;
  progress: string;
  reviewDue: string | null;
  reviewOverdue: boolean;
  reportStatus: string;
  restricted: boolean;
};

export type EpisodeFull = {
  id: string;
  view: "edit" | "lead" | "status";
  participant: string;
  participantId: string;
  discipline: string;
  service: string;
  clinician: string;
  state: EpisodeState;
  planId: string | null;
  goals: GoalProgress[];
  observations: Observation[];
  reviews: ReviewDto[];
  reports: ReportRow[];
  discharge: {
    outcome: string;
    reason: string;
    followUp: string;
    exceptions: string;
    checklist: { item: string; done: boolean }[];
    clinical: string;
    financial: string;
    signed: { by: string; at: string } | null;
  };
  timeline: { at: string; by: string; action: string; reason: string }[];
  canEdit: boolean;
};

export type ReportFull = {
  id: string;
  ref: string;
  type: ReportType;
  view: "edit" | "lead" | "status";
  episodeId: string;
  participant: string;
  participantId: string;
  discipline: string;
  author: string;
  purpose: string;
  periodStart: string;
  periodEnd: string;
  status: ReportState;
  version: number;
  versions: { id: string; version: number; status: string; signedAt: string | null }[];
  restricted: boolean;
  sections: {
    key: string;
    title: string;
    text: string;
    origin: "clinician" | "ai";
    state: string;
    cites: string[];
  }[];
  limitations: string;
  evidence: { id: string; label: string; text: string; date: string; kind: string }[];
  gaps: { id: string; text: string; resolved: boolean; resolution: string }[];
  coSign: { required: boolean; status: string; by: string; note: string };
  signed: { by: string; at: string } | null;
  releases: { recipient: string; name: string; at: string; version: number; channel: string }[];
  dueAt: string;
  requestedBy: string;
  timeline: { at: string; by: string; action: string; reason: string }[];
  canEdit: boolean;
  canCoSign: boolean;
};

/* ------------------------------------------------------------------ rules */

/**
 * Goal progress under the module's safeguards (section 7): only upward numeric goals with a
 * baseline, target and comparable method get a percentage; everything else says why not.
 */
export function goalPercent(g: {
  direction: string;
  baseline: string;
  current: string;
  target: string;
  comparable: boolean;
}): { percent: number | null; reason: string } {
  const b = Number(g.baseline);
  const c = Number(g.current);
  const t = Number(g.target);
  if (g.direction === "Categorical" || g.direction === "Clinician Judgement")
    return { percent: null, reason: "Categorical goal: shown as recorded, not as a percentage" };
  if (g.direction !== "Higher")
    return { percent: null, reason: `${g.direction} goals need an approved rule; not calculated` };
  if (g.baseline === "" || Number.isNaN(b))
    return { percent: null, reason: "Not calculable: no baseline" };
  if (g.target === "" || Number.isNaN(t))
    return { percent: null, reason: "Not calculable: no target" };
  if (g.current === "" || Number.isNaN(c))
    return { percent: null, reason: "Not calculable: no current measure" };
  if (t === b) return { percent: null, reason: "Not calculable: target equals baseline" };
  if (!g.comparable)
    return { percent: null, reason: "Not calculable: methods or conditions differ" };
  return { percent: Math.round(((c - b) / (t - b)) * 100), reason: "" };
}

export function outOfRange(raw: string, unit: string): boolean {
  const r = plausible[unit];
  const v = Number(raw);
  return Boolean(r && raw !== "" && !Number.isNaN(v) && (v < r[0] || v > r[1]));
}

/* ------------------------------------------------------------------ actions */

const t = (n: number) => z.string().trim().max(n);

export const observationInput = z.object({
  goalId: t(60),
  domain: t(60).min(2),
  method: z.enum(methods),
  instrument: t(120),
  licensed: z.boolean(),
  raw: t(120),
  unit: z.enum(units),
  date: z.iso.datetime(),
  planned: z.boolean(),
  setting: z.enum(settings),
  conditions: t(400),
  source: z.enum(conditionsSources),
  status: z.enum(["Draft", "Pending Review", "Verified"]),
  notAssessable: z.union([z.literal(""), z.enum(notAssessable)]),
  interpretation: t(1500),
});

export const episodeActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("observation"), observation: observationInput }),
  z.object({
    type: z.literal("verify-observation"),
    id: t(60),
    status: z.enum(["Verified", "Corrected", "Excluded"]),
    note: t(400),
  }),
  z.object({
    type: z.literal("revise-goal"),
    goalId: t(60),
    target: t(60),
    reason: t(500).min(5, "Give the reason for the revision"),
  }),
  z.object({
    type: z.literal("goal-status"),
    goalId: t(60),
    status: z.enum(progressStatuses),
    confirm: z.boolean(),
  }),
  z.object({
    type: z.literal("start-review"),
    trigger: z.enum(reviewTriggers),
    reason: t(500),
    domains: z.array(t(60)).min(1, "Choose at least one domain").max(10),
  }),
  z.object({
    type: z.literal("review-item"),
    reviewId: t(60),
    domain: t(60),
    result: t(600),
    method: z.enum(methods),
    source: z.enum(conditionsSources),
    setting: z.enum(settings),
    notAssessed: z.union([z.literal(""), z.enum(notAssessable)]),
  }),
  z.object({ type: z.literal("review-pause"), reviewId: t(60), reason: t(300) }),
  z.object({
    type: z.literal("review-finalise"),
    reviewId: t(60),
    interpretation: t(3000).min(10, "Write the clinical interpretation"),
    outcome: z.enum(reviewOutcomes),
    safetyChecked: z.boolean(),
  }),
  z.object({
    type: z.literal("request-report"),
    reportType: z.enum(reportTypes),
    purpose: z.enum(purposes),
    due: z.iso.datetime(),
  }),
  z.object({
    type: z.literal("discharge"),
    outcome: t(1500).min(10, "Summarise the outcome"),
    reason: t(400).min(3, "Give the reason"),
    followUp: t(1500).min(5, "Summarise follow-up"),
    exceptions: t(1000),
  }),
  z.object({ type: z.literal("checklist"), item: t(120), done: z.boolean() }),
]);
export type EpisodeAction = z.infer<typeof episodeActionSchema>;

export const reportActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("generate") }),
  z.object({
    type: z.literal("section"),
    key: t(40),
    text: t(5000),
    state: z.enum(["accepted", "edited", "rejected", "clinician"]),
    reason: t(300),
  }),
  z.object({ type: z.literal("limitations"), text: t(2000) }),
  z.object({ type: z.literal("period"), start: t(10), end: t(10) }),
  z.object({ type: z.literal("resolve"), id: t(80), resolution: t(400).min(3) }),
  z.object({ type: z.literal("submit") }),
  z.object({ type: z.literal("sign"), confirm: z.boolean() }),
  z.object({
    type: z.literal("co-sign"),
    decision: z.enum(["Approve", "Request changes"]),
    note: t(600),
  }),
  z.object({
    type: z.literal("release"),
    recipient: z.enum(recipients),
    name: t(120).min(2, "Name the recipient"),
    authorityVerified: z.boolean(),
    consentVerified: z.boolean(),
    channel: z.enum(["Secure link", "Patient app", "Secure email"]),
  }),
  z.object({ type: z.literal("amend"), reason: t(400).min(5) }),
  z.object({ type: z.literal("withdraw"), reason: t(400).min(5) }),
]);
export type ReportAction = z.infer<typeof reportActionSchema>;

export const reportTone: Record<
  ReportState,
  "healthy" | "watch" | "over" | "available" | "outline"
> = {
  Requested: "outline",
  Draft: "available",
  "In Review": "watch",
  "Changes Requested": "over",
  Signed: "healthy",
  Released: "healthy",
  Superseded: "outline",
  Withdrawn: "outline",
};

export const episodeTone: Record<
  EpisodeState,
  "healthy" | "watch" | "over" | "available" | "outline"
> = {
  "Assessment Only": "available",
  "Active Treatment": "healthy",
  Paused: "watch",
  "Under Review": "watch",
  "Transfer Pending": "watch",
  Discharged: "outline",
  Closed: "outline",
};
