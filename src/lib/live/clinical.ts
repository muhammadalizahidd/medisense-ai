import type { Discipline, FundingStream, Support } from "./catalogue";

/**
 * Clinical and billing definitions from the functional requirements, sections 9–14. Shared by the
 * server and the screens. Option sets marked PROPOSED in the requirements are to confirm with
 * Medisense's clinical leads.
 */

/* --------------------------------------------------------- assessment (9) */

export const assessmentStatuses = [
  "Draft",
  "In Progress",
  "Awaiting Review",
  "Signed",
  "Amended",
  "Cancelled",
] as const;
export type AssessmentStatus = (typeof assessmentStatuses)[number];

export const applicability = ["Applicable", "Not applicable", "Unable to assess"] as const;
export type Applicability = (typeof applicability)[number];

/** 9.2 Standard functional activity record. */
export const activityNames = [
  "Dressing",
  "Bathing",
  "Toileting",
  "Meal preparation",
  "Shopping",
  "Cleaning",
  "School participation",
  "Community access",
  "Other",
] as const;
export const participationStatuses = [
  "Observed",
  "Participant reported",
  "Carer reported",
  "Not assessed",
] as const;
/** PROPOSED descriptive labels, not validated instrument scores. */
export const assistanceLevels = [
  "Independent",
  "Independent with aid",
  "Supervision",
  "Verbal prompting",
  "Partial physical assistance",
  "Full physical assistance",
  "Unable to assess",
] as const;
export const activityFrequencies = [
  "Daily",
  "Several times weekly",
  "Weekly",
  "Occasionally",
  "Not applicable",
] as const;
export const safetyLevels = ["None identified", "Concern identified", "Unknown"] as const;

export type ActivityRecord = {
  id: string;
  activity: (typeof activityNames)[number];
  custom: string;
  participation: (typeof participationStatuses)[number];
  assistance: (typeof assistanceLevels)[number];
  frequency: (typeof activityFrequencies)[number];
  environment: string;
  safety: (typeof safetyLevels)[number];
  safetyNotes: string;
  observation: string;
  reported: string;
};

export type SectionEntry = {
  applicability: Applicability | "";
  /** Why it's not applicable or couldn't be assessed. */
  reason: string;
  /** What the participant or carer said, kept apart from what was observed. */
  reported: string;
  observed: string;
  /** A measured value with its unit, tool or method, entered by the clinician. Never computed. */
  measure: string;
};

/** Step 9 of the lifecycle: what the assessment leads to. */
export const recommendations = [
  "Report only",
  "Treatment",
  "Further assessment",
  "Referral to another service",
  "Discharge",
] as const;
export type Recommendation = (typeof recommendations)[number];

export type TemplateSection = { key: string; title: string; prompts: string };
export type AssessmentTemplate = { id: string; title: string; sections: TemplateSection[] };

const section = (title: string, prompts: string): TemplateSection => ({
  key: title
    .toLowerCase()
    .replace(/[^a-z]+/g, "-")
    .replace(/^-|-$/g, ""),
  title,
  prompts,
});

/** 9.1 Occupational Therapy / FCA assessment bank. */
const otBank: TemplateSection[] = [
  section(
    "Referral history",
    "Reason for referral; participant priorities; living setting; reported diagnosis; medical considerations; medications if relevant; previous therapy; current supports",
  ),
  section(
    "Consent and risk",
    "Assessment consent; information sharing; visit safety; falls; transfer/manual handling; environmental/behavioural risks",
  ),
  section(
    "Self-care",
    "Dressing; grooming; bathing; toileting; feeding; independence and support needs",
  ),
  section("Domestic ADL", "Meal preparation; cleaning; laundry; household management; shopping"),
  section("Mobility", "Walking; transfers; stairs; mobility aids; balance; community access"),
  section(
    "Upper limb and physical function",
    "Reach; grip; manipulation; coordination; fatigue; functional performance",
  ),
  section(
    "Cognition and executive function",
    "Attention; memory; planning; sequencing; initiation; problem-solving",
  ),
  section(
    "Communication and sensory",
    "Communication supports; vision/hearing considerations; sensory impact",
  ),
  section(
    "Social and community participation",
    "Relationships; community use; transport; education; work/volunteering",
  ),
  section(
    "Home environment",
    "Entry; bathroom; doors; stairs; access barriers; hazards; equipment fit",
  ),
  section(
    "Assistive technology",
    "Current device; functional need; trial observations; suitability; training",
  ),
  section(
    "Support arrangements",
    "Informal/formal supports; tasks; frequency; assistance and supervision",
  ),
  section(
    "NDIS functional domains",
    "Mobility; Communication; Social interaction; Learning; Self-care; Self-management",
  ),
  section(
    "Standardised tools",
    "Authorised instrument, administration version, date, clinician-entered score and interpretation",
  ),
];

/** 9.3 Other disciplines: configurable parameter banks, each group a section. */
const banks: Record<string, string> = {
  Physiotherapy:
    "Pain location and context; Symptom behaviour; Range of movement; Muscle strength; Gait and distance; Transfers; Balance; Endurance; Falls; Functional limits; Exercise tolerance; Validated scale results",
  "Exercise Physiology":
    "Medical clearance and contraindications; Baseline function; Physical activity history; Exercise intensity method; Repetitions, sets and resistance; Exertion; Symptoms; Functional tests; Self-management and progress",
  "Speech Pathology":
    "Referral concern; Speech production; Receptive and expressive language; Social and pragmatic communication; Fluency; Voice; Augmentative communication; Age-appropriate measures; Family and school observation; Functional communication",
  "Swallowing Assessment":
    "History; Current diet and liquid context; Symptoms; Risk and referral flags; Observation and tool results; Recommendations; Specialist escalation",
  Psychology:
    "Presenting concern; Relevant history; Functional impact; Clinician-selected validated questionnaires; Safety and risk screening; Goals; Session method",
  "Trauma Therapy":
    "Trauma-informed consent and choice; Presenting impact; Safety and stabilisation; Client goals; Clinician-selected outcomes; Privacy and access restrictions",
  Nursing:
    "Vital signs; Continence assessment; Skin integrity; Wound location, type and dimensions; Catheter and support details; Medication-related observations; Risks; Care interventions; Follow-up",
  Podiatry:
    "Presenting foot concern; Relevant history; Foot, skin and nail findings; Vascular and neurological assessment; Footwear; Mobility and functional effect; Foot-care guidance",
  Dietetics:
    "Nutrition history; Dietary intake; Anthropometrics and clinical markers; Food access; Dietary goals; Risk screening; Nutrition intervention; Follow-up measures",
  "SIL/ILO / SDA housing":
    "Current living setting; Assistance and supervision; Functional support needs; Environment; Participation; Housing-related criteria; Source documents; Rationale and recommendations",
  "Home Modification":
    "Access problems; Room-specific barriers; Measurements; Hazards; Functional tasks; Photos and consent; Proposed modifications; Feasibility and approvals",
  "Assistive Technology":
    "Functional need; Environment; Current equipment; Trial device; Fitting and compatibility; Observed outcomes; Training requirements; Cost and quote; Safety and clinician rationale",
  Other: "Presenting concern; Relevant history; Observations; Risks; Recommendations",
};

const fromBank = (name: string) =>
  (banks[name] ?? banks.Other!).split("; ").map((title) => section(title, ""));

/** The template a service's assessment starts from. A clinician can mark any section not applicable. */
export function templateFor(support: Support, discipline: Discipline): AssessmentTemplate {
  const consent = section(
    "Consent and risk",
    "Assessment consent; information sharing; visit safety; risks",
  );
  const withConsent = (title: string, list: TemplateSection[]) => ({
    id: title,
    title,
    sections: list.some((s) => s.key === consent.key) ? list : [consent, ...list],
  });
  if (support === "SIL/ILO Housing Assessment" || support === "SDA Housing Assessment") {
    return withConsent("SIL/ILO and SDA housing assessment", [
      ...otBank.slice(0, 2),
      ...fromBank("SIL/ILO / SDA housing"),
    ]);
  }
  if (support === "Home Mod Assessment") {
    return withConsent("Home modification assessment", [
      ...otBank.slice(0, 2),
      ...fromBank("Home Modification"),
    ]);
  }
  if (support === "Assistive Technology Assessment") {
    return withConsent("Assistive technology assessment", [
      ...otBank.slice(0, 2),
      ...fromBank("Assistive Technology"),
    ]);
  }
  if (discipline === "Occupational Therapy") {
    return withConsent(
      support === "Functional Capacity Assessment"
        ? "Functional Capacity Assessment (OT/FCA)"
        : "Occupational therapy assessment",
      otBank,
    );
  }
  if (support === "Swallowing Assessment")
    return withConsent("Swallowing assessment", fromBank("Swallowing Assessment"));
  return withConsent(`${discipline} assessment`, fromBank(discipline));
}

/**
 * Mandatory safeguards before signing (section 9): consent, every section marked applicable or
 * not with a reason, observed or reported evidence for applicable ones, findings and a decision.
 * Rules, not AI. The same list shows on screen while the clinician works.
 */
export function assessmentGaps(a: {
  consent: { obtained: boolean };
  sections: Record<string, SectionEntry>;
  findings: string;
  recommendation: { decision: string };
  support: Support;
  discipline: Discipline;
}) {
  const gaps: string[] = [];
  if (!a.consent.obtained) gaps.push("Record the participant's consent to the assessment.");
  for (const s of templateFor(a.support, a.discipline).sections) {
    const e = a.sections[s.key];
    if (!e?.applicability)
      gaps.push(`${s.title}: mark it applicable, not applicable or unable to assess.`);
    else if (e.applicability === "Applicable" && !e.observed.trim() && !e.reported.trim()) {
      gaps.push(`${s.title}: record what was observed or reported.`);
    } else if (e.applicability !== "Applicable" && !e.reason.trim()) {
      gaps.push(`${s.title}: give the reason it's ${e.applicability.toLowerCase()}.`);
    }
  }
  if (!a.findings.trim()) gaps.push("Write the clinical synthesis.");
  if (!a.recommendation.decision) gaps.push("Choose the clinical recommendation.");
  return gaps;
}

/* ------------------------------------------------- treatment plans (10) */

export const planStatuses = [
  "Draft",
  "Active",
  "Under Review",
  "Revised",
  "Completed",
  "Discontinued",
] as const;
export type PlanStatus = (typeof planStatuses)[number];

export const goalStatuses = ["Active", "Achieved", "Modified", "Discontinued"] as const;
export type GoalStatus = (typeof goalStatuses)[number];

export const goalDomains = [
  "Mobility",
  "Communication",
  "Social interaction",
  "Learning",
  "Self-care",
  "Self-management",
] as const;

/** Step 12: what a review of the plan decides. */
export const reviewDecisions = ["Continue", "Revise", "Transfer", "Discharge"] as const;
export type ReviewDecision = (typeof reviewDecisions)[number];

/* ---------------------------------------------------- session notes (10) */

export const noteStatuses = ["Draft", "Pending Signature", "Final", "Amended"] as const;
export type NoteStatus = (typeof noteStatuses)[number];

/* ------------------------------------------------------------ billing (14) */

export const invoiceStatuses = [
  "Draft",
  "Pending Approval",
  "Approved",
  "Issued",
  "Part-Paid",
  "Paid",
  "Disputed",
  "Voided",
  "Credited",
] as const;
export type InvoiceStatus = (typeof invoiceStatuses)[number];

/** Module 07 (section 4). Overdue is derived from the due date and balance, not stored. */
export const invoiceMoves: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  Draft: ["Pending Approval", "Voided"],
  "Pending Approval": ["Approved", "Draft", "Voided"],
  Approved: ["Issued", "Draft", "Voided"],
  Issued: ["Part-Paid", "Paid", "Disputed", "Credited", "Voided"],
  "Part-Paid": ["Paid", "Disputed", "Credited"],
  Paid: ["Credited"],
  Disputed: ["Issued", "Part-Paid", "Paid", "Credited", "Voided"],
  Voided: [],
  Credited: [],
};

/**
 * PROPOSED hourly rates per discipline, after the NDIS therapy price limits. Medisense confirms
 * the real rates, support item numbers and travel rules in its service agreements (section 18).
 */
export const hourlyRates: Record<Discipline, number> = {
  "Occupational Therapy": 193.99,
  "Speech Pathology": 193.99,
  Physiotherapy: 193.99,
  "Exercise Physiology": 166.99,
  Psychology: 232.99,
  "Trauma Therapy": 232.99,
  Dietetics: 193.99,
  Podiatry: 193.99,
  Nursing: 150.0,
};

/** The share of a visit charged for a late cancellation or non-attendance. PROPOSED. */
export const CANCELLATION_CHARGE_SHARE = 1;

export const money = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

/* --------------------------------------------------------------- DTOs */

export type AssessmentDto = {
  id: string;
  clientId: string;
  clientName: string;
  needId: string;
  support: Support;
  discipline: Discipline;
  kind: "Initial" | "Reassessment";
  template: AssessmentTemplate;
  status: AssessmentStatus;
  therapistName: string;
  consent: { obtained: boolean; notes: string };
  sections: Record<string, SectionEntry>;
  activities: ActivityRecord[];
  findings: string;
  limitations: string;
  recommendation: { decision: Recommendation | ""; notes: string };
  released: { summary: string; byName: string; at: string } | null;
  signed: { byName: string; at: string } | null;
  amendments: { reason: string; text: string; byName: string; at: string }[];
  createdAt: string;
  updatedAt: string;
  /** False for admins: operations see the status, not the clinical content. */
  canEdit: boolean;
  reviews: {
    requestedBy: string;
    requestedAt: string;
    comment: string | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
  }[];
  cancelled: { reason: string; byName: string; at: string } | null;
  /** True for a Clinical Lead when the assessment is waiting for their review. */
  canReview: boolean;
};

export type GoalDto = {
  id: string;
  description: string;
  domain: string;
  measure: string;
  baseline: string;
  target: string;
  current: string;
  status: GoalStatus;
  rationale: string;
  history: { value: string; note: string; at: string; byName: string }[];
};

export type PlanDto = {
  id: string;
  clientId: string;
  clientName: string;
  needId: string;
  support: Support;
  status: PlanStatus;
  version: number;
  therapistName: string;
  indication: string;
  goals: GoalDto[];
  interventions: string;
  precautions: string;
  frequency: string;
  duration: string;
  reviewDate: string;
  approved: { byName: string; at: string } | null;
  reviews: { decision: ReviewDecision; notes: string; byName: string; at: string }[];
  progressSummary: { text: string; at: string; model: string } | null;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
};

/** One service request's clinical work, as a summary for lists and the admin view. */
export type ClinicalSummaryDto = {
  needId: string;
  assessments: {
    id: string;
    status: AssessmentStatus;
    kind: "Initial" | "Reassessment";
    recommendation: string;
    updatedAt: string;
  }[];
  plan: {
    id: string;
    status: PlanStatus;
    goals: number;
    achieved: number;
    reviewDate: string;
  } | null;
};

export type InvoiceLineDto = {
  id: string;
  kind: "service" | "cancellation" | "adjustment";
  date: string;
  description: string;
  itemCode: string;
  minutes: number;
  rate: number;
  amount: number;
};

export type InvoiceDto = {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  funding: FundingStream;
  payer: string;
  status: InvoiceStatus;
  lines: InvoiceLineDto[];
  total: number;
  paid: number;
  exceptions: string[];
  history: { status: InvoiceStatus; byName: string; note: string; at: string }[];
  payments: { amount: number; reference: string; byName: string; at: string }[];
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
