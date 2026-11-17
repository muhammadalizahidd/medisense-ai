/** Medisense's services, from medisense.com.au and its referral form. Shared by server and screens. */

export const disciplines = [
  "Occupational Therapy",
  "Speech Pathology",
  "Physiotherapy",
  "Exercise Physiology",
  "Psychology",
  "Trauma Therapy",
  "Dietetics",
  "Podiatry",
  "Nursing",
] as const;

export type Discipline = (typeof disciplines)[number];

/** What a therapist in each discipline is called. */
export const practitioner: Record<Discipline, string> = {
  "Occupational Therapy": "Occupational Therapist",
  "Speech Pathology": "Speech Pathologist",
  Physiotherapy: "Physiotherapist",
  "Exercise Physiology": "Exercise Physiologist",
  Psychology: "Psychologist",
  "Trauma Therapy": "Trauma Therapist",
  Dietetics: "Dietitian",
  Podiatry: "Podiatrist",
  Nursing: "Registered Nurse",
};

/** Short labels for charts and tight spaces. */
export const disciplineShort: Record<Discipline, string> = {
  "Occupational Therapy": "OT",
  "Speech Pathology": "Speech",
  Physiotherapy: "Physio",
  "Exercise Physiology": "EP",
  Psychology: "Psych",
  "Trauma Therapy": "Trauma",
  Dietetics: "Dietetics",
  Podiatry: "Podiatry",
  Nursing: "Nursing",
};

const disciplineWords: [RegExp, Discipline][] = [
  [/speech|swallow|language/i, "Speech Pathology"],
  [/occupational|ot/i, "Occupational Therapy"],
  [/physio(?!log)|physiotherap/i, "Physiotherapy"],
  [/exercise|ep/i, "Exercise Physiology"],
  [/trauma/i, "Trauma Therapy"],
  [/psycholog|counsell/i, "Psychology"],
  [/diet|nutrition/i, "Dietetics"],
  [/podiat|foot|orthotic/i, "Podiatry"],
  [/nurs|wound|continence|catheter/i, "Nursing"],
];

/** The first discipline named in free text, such as a referral's services line. */
export function disciplineIn(text: string): Discipline | undefined {
  return disciplineWords.find(([pattern]) => pattern.test(text))?.[1];
}

/** The referral form's frequency options (functional requirements, section 5). */
export const frequencies = ["Assessment", "Weekly", "Fortnightly", "Monthly", "Other"] as const;
export type Frequency = (typeof frequencies)[number];

/** Funding sources (functional requirements, section 14). */
export const fundingStreams = [
  "NDIS",
  "Workers Compensation",
  "Aged Care",
  "Private",
  "Other",
] as const;
export type FundingStream = (typeof fundingStreams)[number];

/** How an NDIS plan is managed, as on the referral form. */
export const planTypes = ["Plan Managed", "Self-Managed", "Agency Managed"] as const;
export type PlanType = (typeof planTypes)[number];

export const yesNoUnknown = ["Yes", "No", "Unknown"] as const;
export type YesNoUnknown = (typeof yesNoUnknown)[number];

/** The funding-periods question (F04). */
export const yesNoUnsure = ["Yes", "No", "Unsure"] as const;
export type YesNoUnsure = (typeof yesNoUnsure)[number];

/** Where the service happens, as on the referral form. */
export const serviceLocations = [
  "Home",
  "School",
  "Telehealth",
  "Daycare",
  "Day Program",
  "Other community location",
] as const;
export type ServiceLocation = (typeof serviceLocations)[number];

/** Everything except telehealth is an in-person visit that needs an address. */
export const isInPerson = (location: ServiceLocation) => location !== "Telehealth";

export type SupportKind = "assessment" | "treatment";

/**
 * The supports a referral can request (functional requirements, section 4), each with the
 * discipline that delivers it and whether it can be an assessment on its own.
 * `discipline` is null for "Other": intake chooses who delivers it.
 */
export const supportCatalogue = [
  {
    name: "Functional Capacity Assessment",
    discipline: "Occupational Therapy",
    kind: "assessment",
  },
  { name: "SIL/ILO Housing Assessment", discipline: "Occupational Therapy", kind: "assessment" },
  { name: "SDA Housing Assessment", discipline: "Occupational Therapy", kind: "assessment" },
  { name: "Home Mod Assessment", discipline: "Occupational Therapy", kind: "assessment" },
  {
    name: "Assistive Technology Assessment",
    discipline: "Occupational Therapy",
    kind: "assessment",
  },
  { name: "Occupational Therapy", discipline: "Occupational Therapy", kind: "treatment" },
  { name: "Speech Therapy", discipline: "Speech Pathology", kind: "treatment" },
  { name: "Swallowing Assessment", discipline: "Speech Pathology", kind: "assessment" },
  { name: "Speech/Language Assessment", discipline: "Speech Pathology", kind: "assessment" },
  { name: "Exercise Physiology", discipline: "Exercise Physiology", kind: "treatment" },
  { name: "Physiotherapy", discipline: "Physiotherapy", kind: "treatment" },
  { name: "Psychological Assessment", discipline: "Psychology", kind: "assessment" },
  { name: "Psychological Therapy", discipline: "Psychology", kind: "treatment" },
  { name: "Trauma Therapy", discipline: "Trauma Therapy", kind: "treatment" },
  { name: "Nursing", discipline: "Nursing", kind: "treatment" },
  { name: "Podiatry", discipline: "Podiatry", kind: "treatment" },
  { name: "Other", discipline: null, kind: "treatment" },
] as const satisfies readonly { name: string; discipline: Discipline | null; kind: SupportKind }[];

export type Support = (typeof supportCatalogue)[number]["name"];
export const supports = supportCatalogue.map((s) => s.name) as unknown as readonly [
  Support,
  ...Support[],
];

export const supportInfo = (name: Support) =>
  supportCatalogue.find((s) => s.name === name) ?? supportCatalogue[supportCatalogue.length - 1]!;

/** Nursing sub-selection (section 4.1). */
export const nursingTypes = [
  "Continence Assessment",
  "AT Assessment",
  "Wound/Catheter Supports",
  "Other",
] as const;
export type NursingType = (typeof nursingTypes)[number];

/** Who is sending the referral. PROPOSED in the requirements: to confirm with Medisense. */
export const submitterRoles = [
  "Participant",
  "Parent or guardian",
  "Authorised representative",
  "Support coordinator",
  "Other referrer",
] as const;
export type SubmitterRole = (typeof submitterRoles)[number];

/** Who signs the service agreement or takes booking calls. PROPOSED: options to confirm. */
export const contactRoles = [
  "Participant",
  "Parent or guardian",
  "Plan nominee",
  "Support coordinator",
  "Other",
] as const;
export type ContactRole = (typeof contactRoles)[number];

export const contactMethods = ["Phone", "Email", "SMS"] as const;
export type ContactMethod = (typeof contactMethods)[number];

export const australianStates = ["QLD", "NSW", "VIC", "ACT", "TAS", "SA", "WA", "NT"] as const;

/** Admin responsibilities (section 2). Clinical triage needs a Clinical Lead or Super Admin. */
export const staffRoles = [
  "Super Admin",
  "Intake Officer",
  "Scheduler",
  "Finance",
  "Finance Manager",
  "Operations Manager",
  "Clinical Lead",
] as const;
export type StaffRole = (typeof staffRoles)[number];

/** A document's review state (section 11): a replacement supersedes, never deletes. */
export const documentStatuses = ["Pending review", "Accepted", "Rejected", "Superseded"] as const;
export type DocumentStatus = (typeof documentStatuses)[number];

/** What intake decides for each requested service: they move independently (section 11). */
export const serviceDecisions = ["Accepted", "Waitlisted", "Declined"] as const;
export type ServiceDecision = (typeof serviceDecisions)[number];

/**
 * Medical record number: MRN-DDMMYYYY-0001, numbered per day. The patient signs in to the app with
 * it, and their referral reference is REF- followed by it.
 */
export const MRN_PATTERN = /^MRN-\d{8}-\d{4}$/;
export const referralReferenceFor = (mrn: string) => `REF-${mrn}`;

/** Files a referral can carry: plan excerpts, letters, reports. */
export const documentKinds = ["NDIS plan", "Referral letter", "Report", "Other"] as const;
export type DocumentKind = (typeof documentKinds)[number];
export const DOCUMENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;
export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;

export const regions = ["Brisbane North", "Brisbane South"] as const;
export type Region = (typeof regions)[number];

/** Medisense's hours: Monday to Friday, 9:00 am to 5:00 pm. */
export const OPEN_MINUTES = 9 * 60;
export const CLOSE_MINUTES = 17 * 60;

export type CaseloadStatus = "Healthy" | "Watch" | "At Risk";

/** The platform's one status scale: Healthy below 60, Watch 60–79, At Risk from 80. */
export function caseloadStatus(score: number): CaseloadStatus {
  if (score >= 80) return "At Risk";
  if (score >= 60) return "Watch";
  return "Healthy";
}

/** Why a therapist turns down a new client. Admins see the reason and choose someone else. */
export const declineReasons = [
  "No room in my caseload",
  "The time doesn't suit",
  "Outside my area",
  "Not the right fit clinically",
  "Other",
] as const;

/** From medisense.com.au: 48 hours' notice is needed to cancel or reschedule. */
export const CANCELLATION_NOTICE_HOURS = 48;

/** How many visits a frequency books after the first, and how far apart. */
export const seriesPlan: Record<Frequency, { visits: number; everyDays: number }> = {
  Assessment: { visits: 1, everyDays: 0 },
  Weekly: { visits: 8, everyDays: 7 },
  Fortnightly: { visits: 6, everyDays: 14 },
  Monthly: { visits: 4, everyDays: 28 },
  // A frequency the referral described in words: book the first visit, the therapist plans the rest.
  Other: { visits: 1, everyDays: 0 },
};

export const cancelReasons = [
  "Patient unwell",
  "Family or carer unavailable",
  "Clinician unwell or unavailable",
  "Appointment clash",
  "Other",
] as const;

export const dischargeReasons = [
  "Goals met",
  "Funding ended",
  "Moved out of the area",
  "Patient's choice",
  "Transferred to another provider",
  "Other",
] as const;
