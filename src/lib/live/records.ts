import { z } from "zod";

/**
 * Module 11: the longitudinal, permission-aware clinical record. Shared by the server and the
 * record screens. Reported, unknown, not assessed and confirmed are always kept apart: a blank is
 * never shown as a negative finding.
 */

/* ------------------------------------------------------------------ access */

/** How much of a record this person sees, decided on the server for every request. */
export const accessLevels = [
  "treating",
  "clinical-lead",
  "intake",
  "scheduler",
  "finance",
  "none",
] as const;
export type AccessLevel = (typeof accessLevels)[number];
export const accessLabel: Record<AccessLevel, string> = {
  treating: "Treating clinician",
  "clinical-lead": "Clinical Lead (authorised access)",
  intake: "Intake view: identity, referral and documents",
  scheduler: "Scheduling view: visit precautions only",
  finance: "Finance view: funding summary only",
  none: "No access",
};
export const accessPurposes = [
  "Clinical review of disclosed risk",
  "Supervision",
  "Care-team handover",
  "Complaint or incident review",
  "Quality audit",
] as const;

/** Disciplines whose session notes stay with that discipline unless explicitly shared (section 11.2). */
export const restrictedDisciplines = ["Psychology", "Trauma Therapy"];

/* ------------------------------------------------------------------ dictionaries */

export const conditionStatuses = [
  "Reported by referral",
  "Confirmed by clinician",
  "Under investigation",
  "Resolved",
  "Historical",
] as const;
export const infoSources = [
  "Referral",
  "Participant",
  "Guardian",
  "External document",
  "Treating clinician",
  "Teacher",
] as const;
export const medicationStatuses = ["Current", "Historical", "Ceased", "Unclear"] as const;
export const medicationVerifications = [
  "Unverified",
  "Patient reported",
  "External document reviewed",
  "Clinician reconciled",
] as const;
export const allergyStates = [
  "Not assessed",
  "Unknown",
  "No known allergies reported",
  "Specific allergies recorded",
] as const;
export type AllergyState = (typeof allergyStates)[number];
export const riskTypes = [
  "Falls",
  "Manual handling",
  "Aggression or behaviour",
  "Safeguarding",
  "Infection control",
  "Environmental",
  "Swallowing",
  "Medication",
  "Other",
] as const;
export const riskOrigins = [
  "Referral disclosed",
  "Patient",
  "Carer",
  "Prior record",
  "Clinician assessment",
] as const;
export const riskSeverities = ["Unassessed", "Low", "Moderate", "High", "Critical"] as const;
export type RiskSeverity = (typeof riskSeverities)[number];
export const riskReviewStates = ["Pending", "Reviewed", "Needs update", "Retired"] as const;
export const episodeStatuses = [
  "Awaiting assessment",
  "Active",
  "On hold",
  "Discharged",
  "Closed",
] as const;
export type EpisodeStatus = (typeof episodeStatuses)[number];
export const entryTypes = [
  "Clinical observation",
  "History review",
  "Phone contact",
  "Case conference",
  "Handover",
  "School liaison",
  "Safety update",
] as const;
export const documentCategories = [
  "Referral letter / NDIS excerpt",
  "Medical history / discharge summary",
  "Assessment form",
  "FCA / home modification / AT report",
  "Medication / allergy evidence",
  "Consent / service document",
  "Authorised photo",
  "Clinical note / addendum",
  "Telehealth recording / transcript",
  "Patient-shared document",
] as const;
export const historySections = [
  {
    id: "presenting",
    label: "Presenting concern",
    hint: "Reason, onset, duration, client-reported effect, priority, source",
  },
  {
    id: "medical",
    label: "Medical conditions history",
    hint: "Conditions are recorded on the Conditions tab with their status",
  },
  {
    id: "surgical",
    label: "Surgical / hospital history",
    hint: "Procedure or event, approximate date, relevance, source. Unknown is a valid answer",
  },
  {
    id: "developmental",
    label: "Developmental history",
    hint: "Milestones, concerns, schooling, caregiver reports (paediatric)",
  },
  {
    id: "functional",
    label: "Functional history",
    hint: "ADLs, mobility, participation, aids, support level. Measurement belongs in assessments",
  },
  {
    id: "social",
    label: "Social / household context",
    hint: "Living arrangement, carers, accessibility, occupation or education",
  },
  {
    id: "communication",
    label: "Communication / accessibility",
    hint: "Language, interpreter, AAC, hearing or vision requirements",
  },
  {
    id: "supports",
    label: "Existing supports",
    hint: "Services, frequency, support workers, assistive devices",
  },
  {
    id: "pastTherapies",
    label: "Past therapies",
    hint: "Discipline, provider, dates, response, prior reports",
  },
  {
    id: "observations",
    label: "Health observations",
    hint: "Relevant vitals or findings with units, method, date and assessor",
  },
] as const;
export type HistorySectionId = (typeof historySections)[number]["id"];
/** Every history answer says what kind of answer it is; blank never means "no". */
export const answerStates = [
  "Not reported",
  "Unknown",
  "Not assessed",
  "Not applicable",
  "Recorded",
] as const;
export type AnswerState = (typeof answerStates)[number];

/* ------------------------------------------------------------------ DTOs */

export type Provenance = { source: string; by: string; at: string };

export type EpisodeDto = {
  id: string;
  support: string;
  discipline: string;
  status: EpisodeStatus;
  clinician: string | null;
  mine: boolean;
  restricted: boolean;
  location: string;
  assessment: { id: string; status: string; href: string } | null;
  plan: { id: string; status: string; reviewDate: string; href: string } | null;
};

export type HistoryDto = Record<
  HistorySectionId,
  { state: AnswerState; text: string; source: string; by: string | null; at: string | null }
>;

export type ConditionDto = {
  id: string;
  label: string;
  status: (typeof conditionStatuses)[number];
  source: (typeof infoSources)[number];
  onset: string;
  evidence: string;
  by: string;
  at: string;
};
export type MedicationDto = {
  id: string;
  name: string;
  strength: string;
  route: string;
  frequency: string;
  indication: string;
  status: (typeof medicationStatuses)[number];
  verification: (typeof medicationVerifications)[number];
  source: string;
  reviewedAt: string | null;
  by: string;
};
export type AllergyDto = {
  id: string;
  substance: string;
  reaction: string;
  severity: string;
  source: string;
  confirmed: boolean;
  by: string;
  at: string;
};
export type RiskDto = {
  id: string;
  types: string[];
  origin: (typeof riskOrigins)[number];
  severity: RiskSeverity;
  description: string;
  mitigation: string;
  escalation: string;
  review: (typeof riskReviewStates)[number];
  reviewDue: string;
  reviewer: string | null;
  sharing: "Relevant staff only" | "Operational safety summary";
  by: string;
  at: string;
};
export type EntryDto = {
  id: string;
  type: (typeof entryTypes)[number];
  episodeId: string | null;
  episodeLabel: string;
  discipline: string;
  title: string;
  text: string;
  informant: "Clinician observation" | "Participant report" | "Carer report" | "Teacher report";
  status: "Draft" | "Signed" | "Voided";
  restricted: boolean;
  /** True when the viewer can't read it; the text is withheld and only the fact is shown. */
  hidden: boolean;
  missing: string[];
  author: string;
  createdAt: string;
  signedAt: string | null;
  addenda: { text: string; reason: string; by: string; at: string }[];
  voided: { reason: string; by: string; at: string } | null;
  offline: boolean;
};
export type TimelineEvent = {
  id: string;
  at: string;
  kind:
    | "Referral"
    | "Assessment"
    | "Treatment plan"
    | "Visit"
    | "Outcome"
    | "Consent"
    | "Report"
    | "Amendment"
    | "Entry"
    | "Recording"
    | "Discharge"
    | "Risk";
  title: string;
  detail: string;
  discipline: string | null;
  by: string | null;
  href: string | null;
  restricted: boolean;
};
export type RecordDocDto = {
  id: string;
  name: string;
  kind: string;
  category: string;
  episodeId: string | null;
  source: string;
  author: string;
  receivedAt: string;
  version: number;
  restricted: boolean;
  hidden: boolean;
  reviewedBy: string | null;
  shares: { recipient: string; expires: string | null; revoked: boolean; by: string; at: string }[];
  href: string | null;
};
export type ConsentRowDto = {
  key: string;
  label: string;
  state: string;
  respondent: string;
  recordedBy: string;
  at: string | null;
  scope: string[];
  note: string;
  history: { state: string; by: string; at: string; note: string }[];
};
export type CareTeamDto = {
  clinicians: { name: string; discipline: string; episode: string; status: string }[];
  contacts: {
    name: string;
    role: string;
    relationship: string;
    authority: string;
    verified: boolean;
    contactAllowed: boolean;
    sharing: string;
  }[];
};
export type ExceptionDto = {
  id: string;
  kind:
    | "Conflict"
    | "Missing history"
    | "Possible duplicate"
    | "Pending verification"
    | "Unsynchronised draft";
  title: string;
  detail: string;
  sources: string[];
  resolved: { by: string; at: string; note: string } | null;
};
export type AccessLogDto = {
  at: string;
  by: string;
  role: string;
  action: string;
  purpose: string;
};
export type AiSummaryDto = {
  kind: "summary" | "gaps" | "handover";
  text: string;
  points: { text: string; source: string; uncertain: boolean }[];
  at: string;
  approved: { by: string; at: string } | null;
};

export type RecordDto = {
  clientId: string;
  participantId: string;
  name: string;
  dateOfBirth: string | null;
  pronouns: string;
  preferredName: string;
  suburb: string;
  region: string;
  funding: string;
  referral: {
    id: string;
    reference: string;
    source: string;
    submittedAt: string;
    href: string;
  } | null;
  primaryContact: { name: string; relationship: string; verified: boolean } | null;
  nextAppointment: { at: string; location: string; status: string; ref: string } | null;
  lastVisit: { at: string; clinician: string; signed: boolean } | null;
  lastUpdated: { at: string; by: string };
  completeness: "Missing" | "Needs review" | "Verified";
  access: AccessLevel;
  accessNote: string;
  /** A Clinical Lead records a purpose before the full record opens (logged). */
  needsPurpose: boolean;
  accessRequests: {
    id: string;
    name: string;
    reason: string;
    at: string;
    status: "Pending" | "Granted" | "Declined";
    until: string | null;
  }[];
  canGrant: boolean;
  canWrite: boolean;
  canSign: boolean;
  precautions: string | null;
  alerts: { tone: "over" | "watch"; text: string }[];
  episodes: EpisodeDto[];
  history: HistoryDto | null;
  historyReview: { by: string; at: string; sources: string[] } | null;
  conditions: ConditionDto[];
  medications: MedicationDto[];
  medicationsReadOnly: boolean;
  allergyState: AllergyState;
  allergyStateSource: Provenance | null;
  allergies: AllergyDto[];
  risks: RiskDto[];
  safetySummary: string[];
  entries: EntryDto[];
  timeline: TimelineEvent[];
  documents: RecordDocDto[];
  consents: ConsentRowDto[];
  careTeam: CareTeamDto;
  exceptions: ExceptionDto[];
  accessLog: AccessLogDto[];
  ai: AiSummaryDto[];
  goals: {
    description: string;
    current: string;
    target: string;
    status: string;
    shared: boolean;
  }[];
  discharged: { at: string; reason: string } | null;
};

export type RecordListItem = {
  clientId: string;
  participantId: string;
  name: string;
  age: string | null;
  suburb: string;
  episodes: {
    support: string;
    discipline: string;
    status: EpisodeStatus;
    clinician: string | null;
    mine: boolean;
  }[];
  access: AccessLevel;
  nextAppointment: string | null;
  openRisks: number;
  highRisk: boolean;
  completeness: "Missing" | "Needs review" | "Verified";
  unsigned: number;
  exceptions: number;
  lastUpdated: string;
};

/* ------------------------------------------------------------------ inputs */

const t = (max: number) => z.string().trim().max(max);

export const recordActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("open"), purpose: z.enum(accessPurposes) }),
  z.object({
    type: z.literal("request-access"),
    reason: t(400).min(10, "Explain why you need access"),
  }),
  z.object({
    type: z.literal("grant"),
    requestId: z.string().max(60),
    approve: z.boolean(),
    note: t(400),
  }),
  z.object({
    type: z.literal("history"),
    section: z.enum(historySections.map((s) => s.id) as [HistorySectionId, ...HistorySectionId[]]),
    state: z.enum(answerStates),
    text: t(3000),
    source: z.enum(infoSources),
  }),
  z.object({
    type: z.literal("history-reviewed"),
    sources: z.array(t(80)).min(1, "Say which sources you reviewed").max(10),
  }),
  z.object({
    type: z.literal("condition"),
    id: z.string().max(60).optional(),
    label: t(160).min(2),
    status: z.enum(conditionStatuses),
    source: z.enum(infoSources),
    onset: t(40),
    evidence: t(400),
  }),
  z.object({
    type: z.literal("medication"),
    id: z.string().max(60).optional(),
    name: t(120).min(2),
    strength: t(60),
    route: t(60),
    frequency: t(80),
    indication: t(160),
    status: z.enum(medicationStatuses),
    verification: z.enum(medicationVerifications),
    source: t(80),
  }),
  z.object({
    type: z.literal("allergy-state"),
    state: z.enum(allergyStates),
    source: z.enum(infoSources),
  }),
  z.object({
    type: z.literal("allergy"),
    substance: t(120).min(2),
    reaction: t(200),
    severity: t(40),
    source: z.enum(infoSources),
  }),
  z.object({
    type: z.literal("risk"),
    id: z.string().max(60).optional(),
    types: z.array(z.enum(riskTypes)).min(1, "Choose at least one risk type"),
    origin: z.enum(riskOrigins),
    severity: z.enum(riskSeverities),
    description: t(1500).min(5, "Describe the risk and its triggers"),
    mitigation: t(1500),
    escalation: t(400),
    reviewDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sharing: z.enum(["Relevant staff only", "Operational safety summary"]),
  }),
  z.object({
    type: z.literal("risk-review"),
    id: z.string().max(60),
    state: z.enum(riskReviewStates),
    note: t(600),
  }),
  z.object({
    type: z.literal("entry"),
    id: z.string().max(60).optional(),
    entryType: z.enum(entryTypes),
    episodeId: z.string().max(80).nullable(),
    title: t(160).min(3),
    text: t(8000),
    informant: z.enum([
      "Clinician observation",
      "Participant report",
      "Carer report",
      "Teacher report",
    ]),
    missing: z.array(t(120)).max(12),
    offline: z.boolean().default(false),
    baseAt: z.string().max(40).optional(),
  }),
  z.object({ type: z.literal("sign"), id: z.string().max(60) }),
  z.object({
    type: z.literal("addendum"),
    id: z.string().max(60),
    text: t(4000).min(5),
    reason: t(400).min(5, "Give the reason for the addendum"),
  }),
  z.object({ type: z.literal("void"), id: z.string().max(60), reason: t(400).min(5) }),
  z.object({
    type: z.literal("document"),
    documentId: z.string().max(40),
    category: z.enum(documentCategories),
    episodeId: z.string().max(80).nullable(),
    restricted: z.boolean(),
    reviewed: z.boolean(),
  }),
  z.object({
    type: z.literal("share"),
    documentId: z.string().max(40),
    recipient: t(160).min(2),
    expires: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
  }),
  z.object({ type: z.literal("revoke"), documentId: z.string().max(40), recipient: t(160) }),
  z.object({ type: z.literal("resolve"), id: z.string().max(80), note: t(600).min(3) }),
  z.object({ type: z.literal("ai"), kind: z.enum(["summary", "gaps", "handover"]) }),
  z.object({ type: z.literal("ai-approve"), kind: z.enum(["summary", "gaps", "handover"]) }),
]);
export type RecordAction = z.infer<typeof recordActionSchema>;

export const completenessTone = {
  Missing: "over",
  "Needs review": "watch",
  Verified: "healthy",
} as const;
export const severityTone: Record<RiskSeverity, "over" | "watch" | "neutral" | "healthy"> = {
  Critical: "over",
  High: "over",
  Moderate: "watch",
  Low: "healthy",
  Unassessed: "neutral",
};
