import { z } from "zod";
import { australianStates } from "./catalogue";

/**
 * Module 03: the participant's identity, contacts, representatives and consents. Shared by the
 * server and the screens. Clinical conclusions stay in the clinical modules.
 */

/** The participant's status, separate from each service episode (section 9). */
export const participantStatuses = [
  "Prospective",
  "Active",
  "On Hold",
  "Discharged",
  "Archived",
  "Deceased",
] as const;
export type ParticipantStatus = (typeof participantStatuses)[number];

/** Statuses an admin sets by hand; the rest follow from the services and discharge. */
export const manualStatuses = ["On Hold", "Archived", "Deceased"] as const;
export type ManualStatus = (typeof manualStatuses)[number];

export const contactRoles03 = [
  "Participant",
  "Parent",
  "Guardian",
  "Nominee",
  "Support Coordinator",
  "Carer",
  "Emergency Contact",
  "Plan Manager",
  "Referrer",
  "School Contact",
  "Other",
] as const;
export type ContactRole03 = (typeof contactRoles03)[number];

export const responsibilities = [
  "Booking",
  "Consent/Signatory",
  "Emergency",
  "Billing",
  "Clinical Coordination",
  "General Communication",
] as const;
export type Responsibility = (typeof responsibilities)[number];

export const authorityTypes = [
  "Self",
  "Parent/Guardian",
  "Legal Nominee",
  "Appointed Decision-Maker",
  "Consent-Based Delegate",
  "Other",
  "None",
] as const;
export type AuthorityType = (typeof authorityTypes)[number];

export const authorityScopes = [
  "View",
  "Communicate",
  "Schedule",
  "Sign",
  "Receive documents",
  "Approved reports",
] as const;
export type AuthorityScope = (typeof authorityScopes)[number];

export const contactStates = ["Invited", "Unverified", "Verified", "Expired", "Revoked"] as const;
export type ContactState = (typeof contactStates)[number];

/** The roles that act for the participant, so they need verified authority first (AT-11). */
export const delegateRoles: readonly ContactRole03[] = ["Parent", "Guardian", "Nominee"];

export const contactModes = ["Phone", "Email", "SMS", "Other"] as const;
export const languages = [
  "English",
  "Mandarin",
  "Arabic",
  "Vietnamese",
  "Cantonese",
  "Punjabi",
  "Greek",
  "Italian",
  "Auslan",
  "Other",
] as const;
export const accessibilityNeeds = [
  "Hearing",
  "Vision",
  "Alternative format",
  "Interpreter",
  "Easy Read",
  "Support person present",
] as const;

/** The consents and notices, each recorded on its own (section 7). */
export const consentItems = [
  {
    key: "general-care",
    label: "General care and assessment",
    help: "Agreement to receive assessment and therapy.",
  },
  {
    key: "privacy-notice",
    label: "Privacy notice",
    help: "Acknowledged the privacy notice. Not a consent to every clinical activity.",
  },
  {
    key: "share-coordinator",
    label: "Share with support coordinator",
    help: "Which records the coordinator may receive. Therapy notes and recordings are never included by default.",
  },
  {
    key: "telehealth",
    label: "Telehealth consultation",
    help: "Recorded by the responsible clinician for each consultation.",
  },
  {
    key: "recording",
    label: "Recording telehealth",
    help: "Off by default. A session can only be recorded once this is given.",
  },
  {
    key: "ai-scribe",
    label: "AI transcription and note drafting",
    help: "Drafts are always reviewed by the clinician. The participant can decline.",
  },
  {
    key: "photos",
    label: "Photos, video and school sharing",
    help: "Purpose-specific and limited. Extra care for minors.",
  },
  {
    key: "marketing",
    label: "Marketing communication",
    help: "Separate from essential service messages.",
  },
] as const;
export type ConsentKey = (typeof consentItems)[number]["key"];
export const consentStates = ["Not asked", "Given", "Refused", "Withdrawn"] as const;
export type ConsentState = (typeof consentStates)[number];

/** What the coordinator may receive when sharing is given (AT-13, AT-16). */
export const shareCategories = [
  "Appointment updates",
  "Approved reports",
  "Service agreement",
  "Invoices",
] as const;

const text = (max = 200) => z.string().trim().max(max);
const phone = z
  .string()
  .trim()
  .max(30)
  .refine((v) => v === "" || /^[+()\d\s-]{8,}$/.test(v), "Check the phone number");
const email = z
  .union([z.literal(""), z.email("Check the email address")])
  .transform((v) => v.toLowerCase());
const day = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Check the date")]);

export const addressSchema = z.object({
  street: text(160),
  suburb: text(80),
  state: z.enum(australianStates),
  postcode: z
    .string()
    .trim()
    .regex(/^(\d{4})?$/, "A postcode has 4 digits"),
});
export type Address = z.infer<typeof addressSchema>;

export const detailsSchema = z.object({
  name: z.string().trim().min(2, "Enter the legal name").max(120),
  preferredName: text(60),
  pronouns: text(40),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date of birth"),
  email,
  phone,
  address: addressSchema,
  language: text(40),
  interpreter: z.boolean(),
  accessibility: z.array(z.enum(accessibilityNeeds)).max(10),
  accessibilityNotes: text(500),
  contactMode: z.union([z.literal(""), z.enum(contactModes)]),
  contactTime: text(80),
});
export type ParticipantDetails = z.infer<typeof detailsSchema>;

export const contactSchema = z.object({
  id: z.string().max(60).optional(),
  role: z.enum(contactRoles03),
  name: z.string().trim().min(2, "Enter the contact's name").max(120),
  organisation: text(120),
  relationship: text(60),
  phone,
  email,
  responsibilities: z.array(z.enum(responsibilities)).max(6),
  primaryFor: z.array(z.enum(responsibilities)).max(6),
  authorityType: z.enum(authorityTypes),
  authorityScope: z.array(z.enum(authorityScopes)).max(6),
  authorityExpires: day,
  restrictions: text(300),
  contactAllowed: z.boolean(),
});
export type ContactInput = z.infer<typeof contactSchema>;

/** Fields a full profile needs (AT-21): shown as missing until they're filled. */
export function profileGaps(p: {
  details: ParticipantDetails;
  contacts: { state: ContactState; responsibilities: string[]; role: string }[];
  consents: { key: string; state: ConsentState }[];
}): string[] {
  const d = p.details;
  const out: string[] = [];
  if (!d.dateOfBirth) out.push("Date of birth");
  if (!d.phone && !d.email) out.push("A phone number or email");
  if (!d.address.street || !d.address.suburb || !d.address.postcode) out.push("Current address");
  if (!d.contactMode) out.push("Preferred contact method");
  if (!p.contacts.some((c) => c.responsibilities.includes("Emergency") && c.state !== "Revoked")) {
    out.push("Emergency contact");
  }
  if (
    !p.contacts.some(
      (c) =>
        c.responsibilities.includes("Booking") &&
        (c.state === "Verified" || c.role === "Participant"),
    )
  ) {
    out.push("Verified booking contact");
  }
  for (const key of ["privacy-notice", "general-care"]) {
    if (p.consents.find((c) => c.key === key)?.state !== "Given") {
      out.push(consentItems.find((i) => i.key === key)!.label);
    }
  }
  return out;
}
export const PROFILE_CHECKS = 8;

export type ContactDto = Omit<ContactInput, "id"> & {
  id: string;
  state: ContactState;
  verifiedBy: string | null;
  verifiedAt: string | null;
  revoked: { reason: string; byName: string; at: string } | null;
  source: string;
  createdAt: string;
  /** False for a representative whose authority isn't verified and current. */
  canAct: boolean;
};

export type ConsentDto = {
  key: ConsentKey;
  label: string;
  help: string;
  state: ConsentState;
  version: string;
  respondent: string;
  recordedBy: string;
  at: string | null;
  scope: string[];
  note: string;
  history: {
    state: ConsentState;
    respondent: string;
    recordedBy: string;
    at: string;
    note: string;
  }[];
};

export type ParticipantProfileDto = {
  status: ParticipantStatus;
  statusNote: { status: string; reason: string; byName: string; at: string } | null;
  completeness: { percent: number; missing: string[] };
  details: ParticipantDetails;
  provenance: Record<string, { source: string; verifiedBy: string | null; at: string }>;
  addressHistory: { address: Address; until: string; byName: string }[];
  contacts: ContactDto[];
  consents: ConsentDto[];
  clinical: {
    reportedDiagnosis: { text: string; source: string } | null;
    verified: { support: string; byName: string; at: string; summary: string | null }[];
    risks: {
      text: string;
      kind: string;
      source: string;
      reviewed: { byName: string; at: string; action: string } | null;
    }[];
  };
  referrals: {
    id: string;
    reference: string;
    status: string;
    createdAt: string;
    submitter: string;
    enteredBy: string;
    funding: string;
    location: string;
    supports: { name: string; frequency: string; decision: string | null }[];
    goals: string;
    history: { status: string; byName: string; note: string; at: string }[];
  }[];
  upcomingInPerson: number;
  /** A linked summary only: verification belongs to the Funding module (AT-19). */
  funding: {
    source: string;
    region: string;
    payer: string;
    ndisNumber: string;
    planType: string;
    planEndDate: string;
  };
};
