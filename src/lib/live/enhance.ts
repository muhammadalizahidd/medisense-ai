import { z } from "zod";
import type { Proposal, SourceDoc } from "./agent";

/* AI Enhancements 01–07: shared types for the patient app, therapist app and portal. */

export const coachLevels = ["Plain", "Extra simple", "Step-by-step"] as const;
export const coachResults = ["Completed", "Partially completed", "Skipped", "Unable"] as const;
export const difficulties = ["None", "Mild", "Moderate", "Severe", "Prefer not to say"] as const;
export const skipReasons = [
  "Forgot",
  "Time",
  "Equipment unavailable",
  "Difficulty",
  "Unwell",
  "Other",
  "Prefer not to say",
] as const;
export const reporterRoles = ["Patient", "Caregiver"] as const;
export const changeOptions = ["Better", "About the same", "Worse", "Not sure"] as const;
export const yesNoPrivate = ["Yes", "No", "Prefer to discuss privately"] as const;
export const homeDone = ["All", "Most", "Some", "None", "Not assigned"] as const;
export const homeDifficulty = [
  "None",
  "Mild",
  "Moderate",
  "Significant",
  "Not applicable",
] as const;
export const logistics = ["Can attend", "Need reschedule", "Need assistance"] as const;
export const concernTypes = [
  "Pain",
  "Mobility",
  "Falls",
  "Fatigue",
  "Communication",
  "Daily activities",
  "Activity difficulty",
  "Other",
] as const;
export const fallOptions = ["None", "One", "More than one", "Prefer not to say"] as const;
export const noticedOptions = ["Today", "Yesterday", "Earlier", "Unsure"] as const;
export const concernStates = [
  "New",
  "Acknowledged",
  "In Review",
  "Follow-up Requested",
  "Resolved",
  "Closed - No Action",
] as const;
export const concernCategories = [
  "Routine review",
  "Therapist follow-up",
  "Safety escalation",
  "Insufficient information",
] as const;
export const interpretations = [
  "Progressing",
  "Monitor",
  "Reassess",
  "Goal achieved",
  "Other",
] as const;
export const followUps = [
  "None",
  "Review next visit",
  "Request measurement",
  "Reassessment",
  "Care-team discussion",
] as const;
export const suggestionDecisions = ["Accept", "Dismiss", "Needs discussion"] as const;
export const shareVisibility = [
  "Care-team only",
  "Approved patient share",
  "Approved caregiver share",
] as const;

/** Who is answering: the patient, or a verified caregiver acting within their scope. */
export type Reporter = {
  name: string;
  role: (typeof reporterRoles)[number];
  relationship: string;
  /** Caregivers only: what the treating therapist allowed them to do, and until when. */
  scope?: string[];
  until?: string | null;
};

export const languages = ["English", "Urdu", "Vietnamese", "Arabic", "Mandarin"] as const;
export const coachModes = ["Source-grounded AI", "Approved FAQ only"] as const;
export const checkinTemplates = [
  "Generic",
  "Initial assessment",
  "Therapy follow-up",
  "Telehealth",
  "Discipline-specific",
] as const;
export const caregiverScopes = ["Activities", "Appointments", "Concerns", "Progress"] as const;
export const feedbackRatings = ["Helpful", "Inaccurate", "Unsafe", "Missing info"] as const;

/** Extra questions each template adds to the core check-in. */
export const templateQuestions: Record<(typeof checkinTemplates)[number], string[]> = {
  Generic: [],
  "Initial assessment": ["What would you most like help with?", "Who helps you day to day?"],
  "Therapy follow-up": ["What has improved since last time?"],
  Telehealth: [
    "Is your camera and microphone working?",
    "Will you have a quiet, private space?",
    "Will a support person join?",
  ],
  "Discipline-specific": [
    "Any change in dressing or bathing?",
    "Any new difficulty with equipment at home?",
  ],
};

export const deliveryChannels = ["In app", "SMS (simulated)", "Email (simulated)"] as const;
export const autoSendHours = ["Off", "24", "48"] as const;
export const attachmentTypes = ["application/pdf", "image/jpeg", "image/png"] as const;
export const MAX_ATTACHMENT = 1_500_000;

/** A small file sent with a concern or a home-activity log; only clinicians open it. */
export type Attachment = { name: string; type: string; size: number; dataUrl?: string };
/** A file being attached in the app, before it is sent. */
export type NewAttachment = {
  name: string;
  type: (typeof attachmentTypes)[number];
  size: number;
  dataUrl: string;
};

export type EnhancePrefs = {
  aiConsent: "Allowed" | "Withdrawn";
  language: (typeof languages)[number];
  caregivers: {
    name: string;
    relationship: string;
    scope: string[];
    until: string | null;
    revoked: boolean;
    by: string;
    at: string;
  }[];
  checkinAuto: {
    hours: (typeof autoSendHours)[number];
    channel: (typeof deliveryChannels)[number];
    template: (typeof checkinTemplates)[number];
  };
};
export type FeedbackDto = {
  id: string;
  source: "Assistant" | "Coach" | "Copilot";
  rating: (typeof feedbackRatings)[number];
  note: string;
  excerpt: string;
  by: string;
  at: string;
  resolved: boolean;
};
export type OversightDto = {
  coach: Record<string, number>;
  checkins: Record<string, number>;
  concerns: Record<string, number>;
  categories: Record<string, number>;
  insights: Record<string, number>;
  feedback: Record<string, number>;
  aiWithdrawn: number;
  caregiversActive: number;
  escalations: { ref: string; status: string; category: string; at: string; reviewer: string }[];
  followUps: {
    category: string;
    priority: string;
    status: string;
    owner: string;
    due: string | null;
  }[];
  insightsWaiting: { status: string; days: number }[];
};

export type CoachStep = { text: string; source: string };
export type CoachDto = {
  id: string;
  planId: string;
  planVersion: number;
  activityId: string;
  activityName: string;
  instructions: string;
  frequency: string;
  dose: string;
  precautions: string;
  status: "Draft" | "Active" | "Paused" | "Superseded";
  level: (typeof coachLevels)[number];
  mode: (typeof coachModes)[number];
  steps: CoachStep[];
  faq: { q: string; a: string; source: string }[];
  /** True when the plan has a newer version than the one this guidance was written from. */
  stale: boolean;
  ai: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  history: { at: string; by: string; action: string }[];
};
export type ActivityDto = {
  planId: string;
  planVersion: number;
  activityId: string;
  name: string;
  instructions: string;
  frequency: string;
  dose: string;
  precautions: string;
  coach: CoachDto | null;
};
export type CoachLogDto = {
  id: string;
  coachId: string;
  activityName: string;
  result: string;
  difficulty: string;
  reason: string;
  concern: boolean;
  comment: string;
  reporter: Reporter;
  at: string;
  review: "New" | "Acknowledged";
  sourceVersion: number;
  attachment: Attachment | null;
};
export type CoachQuestionDto = {
  id: string;
  coachId: string;
  activityName: string;
  question: string;
  answer: string;
  outcome: "Answered" | "Ask therapist" | "Safety" | "Change refused";
  sources: string[];
  at: string;
  reporter: Reporter;
  helpRequested: boolean;
  resolved: boolean;
};

export type CheckinAnswers = {
  change: string;
  changeDetail: string;
  newDifficulty: string;
  difficultyDetail: string;
  pain: string;
  homeDone: string;
  homeDifficulty: string;
  homeDifficultyDetail: string;
  concerns: string;
  questions: string;
  logistics: string;
  access: string[];
  accurate: boolean;
  /** Answers to the template's extra questions, keyed by the question. */
  extra?: Record<string, string>;
};
export type CheckinDto = {
  id: string;
  appointmentId: string;
  visitAt: string;
  service: string;
  status: "Sent" | "Draft" | "Submitted";
  template: string;
  extraQuestions: string[];
  requestedBy: string | null;
  channel: string;
  /** The visit moved after the check-in was answered: the therapist decides if it still applies. */
  rescheduled: boolean;
  reporter: Reporter;
  answers: CheckinAnswers;
  submittedAt: string | null;
  flags: string[];
  brief: {
    summary: string;
    reported: string[];
    context: string[];
    concerns: string[];
    questions: string[];
    missing: string[];
    ai: boolean;
  } | null;
  review: "Not Reviewed" | "Reviewed" | "Clarification Requested";
  reviewNote: string;
  reviewedBy: string | null;
};

export type ConcernDto = {
  id: string;
  ref: string;
  source: string;
  how: string;
  types: string[];
  pain: string;
  falls: string;
  description: string;
  noticed: string;
  callback: boolean;
  reporter: Reporter;
  at: string;
  status: (typeof concernStates)[number];
  category: (typeof concernCategories)[number];
  card: { summary: string; context: string[]; uncertainty: string; ai: boolean };
  actions: { at: string; by: string; action: string; comment: string }[];
  patientMessage: string;
  duplicateOf: string | null;
  attachment: Attachment | null;
};

export type InsightDto = {
  id: string;
  planId: string;
  goalId: string;
  goalTitle: string;
  unit: string;
  baseline: string;
  target: string;
  points: { date: string; value: string; source: string }[];
  trend:
    "Improving" | "Stable" | "Declining" | "Mixed" | "Insufficient evidence" | "Not comparable";
  narrative: string;
  gaps: string[];
  uncertainty: string;
  ai: boolean;
  status: "Draft" | "Approved" | "Rejected" | "Superseded";
  interpretation: string;
  interpretationNote: string;
  followUp: string;
  share: boolean;
  patientSummary: string;
  at: string;
  by: string | null;
  /** New measurements were recorded after this draft: review it again. */
  stale: boolean;
};

export type CoordinationDto = {
  id: string;
  at: string;
  disciplines: { service: string; clinician: string; goals: string[] }[];
  restrictedOmitted: number;
  briefing: string;
  ai: boolean;
  suggestions: {
    id: string;
    type: string;
    text: string;
    nextStep: string;
    sources: string[];
    decision: "Pending" | (typeof suggestionDecisions)[number];
    reason: string;
  }[];
  shares: {
    id: string;
    recipient: string;
    visibility: (typeof shareVisibility)[number];
    text: string;
    status: "Shared" | "Acknowledged" | "Clarification requested";
    note?: string;
    at: string;
    by: string;
  }[];
};

export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  outcome?:
    "Answered" | "Needs clarification" | "No authorised source" | "Human review" | "Urgent concern";
  sources?: string[];
  actions?: { label: string; target: string }[];
  proposedTask?: string | null;
  /** Shared agent contract: changes to confirm, and the approved sources cited. */
  proposals?: Proposal[];
  sourceDocs?: SourceDoc[];
  at: string;
};

export type PatientEnhanceDto = {
  reporters: Reporter[];
  activities: ActivityDto[];
  logs: CoachLogDto[];
  questions: CoachQuestionDto[];
  checkins: CheckinDto[];
  upcoming: { id: string; start: string; service: string; clinician: string; mode: string }[];
  concerns: ConcernDto[];
  insights: { goalTitle: string; summary: string; at: string; by: string | null }[];
  shares: { text: string; at: string; by: string }[];
  chat: ChatMessage[];
  prefs: EnhancePrefs;
  /** Set when a caregiver is signed in on their own account, acting for this participant. */
  actingAs: {
    name: string;
    relationship: string;
    scope: string[];
    until: string | null;
    participants: { id: string; name: string }[];
    current: string;
  } | null;
  /** The caregiver's access has ended: nothing patient-specific is shown. */
  accessDenied: string | null;
  sharingWithdrawn: boolean;
};

export type TherapistEnhanceDto = {
  client: { id: string; name: string };
  activities: ActivityDto[];
  logs: CoachLogDto[];
  questions: CoachQuestionDto[];
  checkins: CheckinDto[];
  concerns: ConcernDto[];
  goals: {
    planId: string;
    goalId: string;
    title: string;
    unit: string;
    baseline: string;
    target: string;
    points: { date: string; value: string; source: string }[];
  }[];
  insights: InsightDto[];
  coordination: CoordinationDto | null;
  chat: ChatMessage[];
  prefs: EnhancePrefs;
  representatives: { name: string; relationship: string }[];
  feedback: FeedbackDto[];
  upcoming: { id: string; start: string; service: string }[];
  sharingWithdrawn: boolean;
};

export type InboxDto = {
  concerns: (ConcernDto & { clientId: string; patient: string })[];
  checkins: (CheckinDto & { clientId: string; patient: string })[];
  logs: (CoachLogDto & { clientId: string; patient: string })[];
  questions: (CoachQuestionDto & { clientId: string; patient: string })[];
  feedback: (FeedbackDto & { clientId: string; patient: string })[];
};

/* ------------------------------------------------------------------ actions */

const t = (n: number) => z.string().trim().max(n);
const reporter = z.object({
  name: t(80).min(2),
  role: z.enum(reporterRoles),
  relationship: t(60),
  scope: z.array(t(40)).max(8).optional(),
  until: t(40).nullable().optional(),
});
const answers = z.object({
  change: t(40),
  changeDetail: t(1000),
  newDifficulty: t(40),
  difficultyDetail: t(1000),
  pain: t(20),
  homeDone: t(40),
  homeDifficulty: t(40),
  homeDifficultyDetail: t(1000),
  concerns: t(1500),
  questions: t(1000),
  logistics: t(40),
  access: z.array(t(60)).max(6),
  accurate: z.boolean(),
  extra: z.record(z.string(), t(1000)).optional(),
});

const attachment = z
  .object({
    name: t(120).min(1),
    type: z.enum(attachmentTypes),
    size: z.number().int().min(1).max(MAX_ATTACHMENT),
    dataUrl: z.string().max(2_100_000),
  })
  .nullable()
  .optional();

export const enhanceActionSchema = z.discriminatedUnion("type", [
  // 01 coach (patient)
  z.object({ type: z.literal("coach-ask"), coachId: t(40), question: t(500).min(2), reporter }),
  z.object({
    type: z.literal("coach-log"),
    coachId: t(40),
    result: z.enum(coachResults),
    difficulty: z.enum(difficulties),
    reason: t(60),
    concern: z.boolean(),
    comment: t(1500),
    reporter,
    attachment,
  }),
  z.object({ type: z.literal("coach-help"), questionId: t(40) }),
  // 01 coach (therapist)
  z.object({
    type: z.literal("coach-draft"),
    clientId: t(40),
    planId: t(40),
    activityId: t(60),
    level: z.enum(coachLevels),
  }),
  z.object({
    type: z.literal("coach-edit"),
    coachId: t(40),
    steps: z
      .array(z.object({ text: t(400).min(1), source: t(60) }))
      .min(1)
      .max(12),
  }),
  z.object({
    type: z.literal("coach-state"),
    coachId: t(40),
    to: z.enum(["Active", "Paused"]),
  }),
  z.object({ type: z.literal("log-ack"), logId: t(40) }),
  z.object({ type: z.literal("question-resolve"), questionId: t(40), reply: t(1000) }),
  // 02 check-in
  z.object({
    type: z.literal("checkin-save"),
    appointmentId: t(40),
    answers,
    submit: z.boolean(),
    reporter,
  }),
  z.object({
    type: z.literal("checkin-review"),
    checkinId: t(40),
    review: z.enum(["Reviewed", "Clarification Requested"]),
    note: t(800),
  }),
  // 04 concerns
  z.object({
    type: z.literal("concern"),
    source: t(60),
    how: z.enum(["Better", "Same", "Worse", "Prefer not to say"]),
    newDifficulty: z.enum(["Yes", "No", "Unsure"]),
    types: z.array(z.enum(concernTypes)).max(8),
    pain: t(20),
    falls: z.enum(fallOptions),
    description: t(1500),
    noticed: z.enum(noticedOptions),
    callback: z.boolean(),
    reporter,
    attachment,
  }),
  z.object({
    type: z.literal("concern-act"),
    concernId: t(40),
    to: z.enum(concernStates),
    comment: t(1000),
    patientMessage: t(800),
  }),
  // 05 insights
  z.object({ type: z.literal("insight-draft"), clientId: t(40), planId: t(40), goalId: t(60) }),
  z.object({
    type: z.literal("insight-decide"),
    insightId: t(40),
    decision: z.enum(["Approve", "Reject", "Withdraw"]),
    interpretation: t(40),
    interpretationNote: t(1000),
    followUp: t(40),
    share: z.boolean(),
    patientSummary: t(800),
  }),
  // 03 coordination
  z.object({ type: z.literal("coord-brief"), clientId: t(40) }),
  z.object({
    type: z.literal("coord-decide"),
    coordId: t(40),
    suggestionId: t(40),
    decision: z.enum(suggestionDecisions),
    reason: t(500),
  }),
  z.object({
    type: z.literal("coord-share"),
    coordId: t(40),
    recipient: t(120).min(2),
    visibility: z.enum(shareVisibility),
    text: t(2000).min(5),
  }),
  // 07 assistant and copilot
  z.object({ type: z.literal("chat"), text: t(800).min(1), clientId: t(40) }),
  z.object({ type: z.literal("chat-task"), clientId: t(40), title: t(160).min(3) }),
  // Completing the specs: consent, language, feedback, sharing, templates, retraction.
  z.object({
    type: z.literal("prefs"),
    aiConsent: z.enum(["Allowed", "Withdrawn"]),
    language: z.enum(languages),
  }),
  z.object({
    type: z.literal("feedback"),
    source: z.enum(["Assistant", "Coach", "Copilot"]),
    clientId: t(40),
    excerpt: t(600),
    rating: z.enum(feedbackRatings),
    note: t(600),
  }),
  z.object({ type: z.literal("feedback-resolve"), feedbackId: t(40) }),
  z.object({ type: z.literal("coach-mode"), coachId: t(40), mode: z.enum(coachModes) }),
  z.object({ type: z.literal("translate"), coachId: t(40), language: z.enum(languages) }),
  z.object({
    type: z.literal("checkin-send"),
    appointmentId: t(40),
    template: z.enum(checkinTemplates),
    questions: z.array(t(200).min(3)).max(8).optional(),
    channel: z.enum(deliveryChannels).optional(),
  }),
  z.object({
    type: z.literal("checkin-auto"),
    clientId: t(40),
    hours: z.enum(autoSendHours),
    channel: z.enum(deliveryChannels),
    template: z.enum(checkinTemplates),
  }),
  z.object({
    type: z.literal("share-clarify"),
    coordId: t(40),
    shareId: t(40),
    note: t(500).min(3),
  }),
  z.object({ type: z.literal("switch-participant"), clientId: t(40) }),
  z.object({ type: z.literal("share-ack"), coordId: t(40), shareId: t(40) }),
  z.object({ type: z.literal("suggestion-task"), coordId: t(40), suggestionId: t(40) }),
  z.object({ type: z.literal("concern-retract"), concernId: t(40), reason: t(400) }),
  z.object({
    type: z.literal("caregiver-access"),
    clientId: t(40),
    name: t(80).min(2),
    relationship: t(60),
    scope: z.array(z.enum(caregiverScopes)).max(4),
    until: t(20),
    revoked: z.boolean(),
  }),
  z.object({ type: z.literal("chat-clear"), clientId: t(40) }),
]);
export type EnhanceAction = z.infer<typeof enhanceActionSchema>;
