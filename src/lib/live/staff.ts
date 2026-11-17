import { z } from "zod";
import { disciplines, serviceLocations } from "./catalogue";

/**
 * Module 04: staff identity, credentials, service eligibility, coverage and capacity. Shared by
 * the server and the screens. Credential and competency approval is a human governance action:
 * the prototype records it, it doesn't check a live register.
 */

export const engagementStatuses = [
  "Invited",
  "Pending Verification",
  "Active",
  "On Leave",
  "Suspended",
  "Inactive",
  "Archived",
] as const;
export type EngagementStatus = (typeof engagementStatuses)[number];

/** Only these can be offered new patients. */
export const assignableStatuses: readonly EngagementStatus[] = ["Active"];

export const employmentTypes = [
  "Employee",
  "Contractor",
  "Casual",
  "Agency",
  "Volunteer",
  "Other",
] as const;

export const primaryLocations = ["Brisbane", "Other region", "Remote / Telehealth"] as const;

/** Where a clinician will see patients: the referral form's service locations. */
export const workSettings = serviceLocations;

export const credentialKinds = [
  "Registration",
  "Qualification",
  "Check",
  "Training",
  "Indemnity",
] as const;
export type CredentialKind = (typeof credentialKinds)[number];

export const credentialStatuses = [
  "Not Submitted",
  "Awaiting Review",
  "Verified",
  "Rejected",
  "Expired",
  "Under Review",
] as const;
export type CredentialStatus = (typeof credentialStatuses)[number];

export const competencyStatuses = ["Approved", "Pending", "Suspended", "Not approved"] as const;
export type CompetencyStatus = (typeof competencyStatuses)[number];

export const travelWillingness = ["Within zone", "Outside zone by approval", "No travel"] as const;
export const travelModes = ["Car", "Public transport", "Other"] as const;

const text = (max = 200) => z.string().trim().max(max);
const day = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Check the date")]);

export const staffProfileSchema = z.object({
  jobTitle: z.string().trim().min(2, "Enter the job title").max(100),
  displayName: text(100),
  employmentType: z.enum(employmentTypes),
  secondaryDisciplines: z.array(z.enum(disciplines)).max(8),
  primaryLocation: z.enum(primaryLocations),
  supervisorId: z.string().max(40),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the start date"),
  endDate: day,
  languages: z.array(text(40)).max(10),
  bio: text(800),
  workSettings: z.array(z.enum(workSettings)).max(8),
  employeeNumber: text(40),
});
export type StaffProfileInput = z.infer<typeof staffProfileSchema>;

export const coverageSchema = z.object({
  postcodes: z.array(z.string().regex(/^\d{4}$/, "A postcode has 4 digits")).max(200),
  travelWillingness: z.enum(travelWillingness),
  travelMode: z.enum(travelModes),
  bufferMinutes: z.number().int().min(0).max(120),
  maxPerDay: z.number().int().min(1).max(15),
  maxHoursWeek: z.number().min(1).max(60),
});
export type CoverageInput = z.infer<typeof coverageSchema>;

export const credentialSchema = z.object({
  kind: z.enum(credentialKinds),
  name: z.string().trim().min(2, "Name the credential").max(120),
  body: text(120),
  number: text(60),
  start: day,
  expiry: day,
  evidence: text(160),
  /** Needed for every booking: missing, unverified or expired blocks new assignments. */
  required: z.boolean(),
});
export type CredentialInput = z.infer<typeof credentialSchema>;

export type StaffCredentialDto = CredentialInput & {
  id: string;
  status: CredentialStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  note: string;
  /** Days until expiry; negative once expired; null when it doesn't expire. */
  daysLeft: number | null;
};

export type StaffCompetencyDto = {
  support: string;
  kind: "assessment" | "treatment";
  status: CompetencyStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  note: string;
  supervisionRequired: boolean;
};

export type CapacityLine = { label: string; hours: number; source: string };

export type StaffRecordDto = {
  id: string;
  /** Uploaded profile photo; null falls back to the default photo or initials. */
  photoUrl: string | null;
  staffId: string;
  name: string;
  email: string;
  phone: string | null;
  discipline: string;
  region: string;
  seniority: string;
  status: EngagementStatus;
  statusNote: { status: string; reason: string; byName: string; at: string } | null;
  profile: StaffProfileInput & { supervisorName: string | null };
  coverage: CoverageInput & { region: string };
  credentials: StaffCredentialDto[];
  competencies: StaffCompetencyDto[];
  /** Why they can't be offered new patients right now; empty when they can. */
  blocks: string[];
  warnings: string[];
  capacity: {
    period: string;
    lines: CapacityLine[];
    contracted: number;
    committed: number;
    available: number;
    utilisation: number;
    activePatients: number;
    pendingNotes: number;
    over: boolean;
  };
  supervisors: { id: string; name: string }[];
  /** True when the viewer may verify credentials and approve competencies. */
  canVerify: boolean;
  /** Booked visits on leave days or while they can't take patients: need reassignment. */
  affected: { id: string; ref: string; start: string; patient: string; reason: string }[];
  /** Staff this person supervises (seniors). */
  supervisees: { id: string; name: string; discipline: string; status: string; dueSoon: number }[];
  activity: { id: string; action: string; actor: string; at: string }[];
};
