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

/** The referral form's frequency options. */
export const frequencies = ["Assessment", "Weekly", "Fortnightly", "Monthly"] as const;
export type Frequency = (typeof frequencies)[number];

/** Ways to pay named on the website (contact, services, psychology and Brisbane pages). */
export const fundingStreams = [
  "NDIS",
  "Workers' compensation",
  "Aged care",
  "Medicare",
  "Private health insurance",
  "Self-funded",
  "Life insurance",
] as const;
export type FundingStream = (typeof fundingStreams)[number];

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
};

export const cancelReasons = [
  "Client unwell",
  "Family or carer unavailable",
  "Clinician unwell or unavailable",
  "Appointment clash",
  "Other",
] as const;
