import type { Binary, ObjectId } from "mongodb";
import type {
  Discipline,
  DocumentKind,
  Frequency,
  FundingStream,
  Region,
  ServiceLocation,
  StaffRole,
  Support,
} from "@/lib/live/catalogue";
import type {
  ActivityRecord,
  AssessmentStatus,
  GoalStatus,
  InvoiceStatus,
  PlanStatus,
  Recommendation,
  ReviewDecision,
  SectionEntry,
} from "@/lib/live/clinical";
import type { Gap, ReferralInput, ReferralStatus } from "@/lib/live/referral";
import type { RecordingStatus } from "@/lib/live/telehealth";

export type UserRole = "admin" | "therapist" | "client";

export interface UserDoc {
  _id: ObjectId;
  email: string;
  name: string;
  role: UserRole;
  /** Null until a client activates their account with an invite code. */
  passwordHash: string | null;
  invite: { codeHash: string; expiresAt: Date } | null;
  therapistId: ObjectId | null;
  clientId: ObjectId | null;
  phone?: string | null;
  /** True once staff have left: they can't sign in. */
  disabled?: boolean;
  /** Admin responsibilities; a Clinical Lead or Super Admin makes clinical triage decisions. */
  staffRoles?: StaffRole[];
  createdAt: Date;
}

export interface SessionDoc {
  /** SHA-256 of the cookie token, so a leaked database never yields a usable session. */
  _id: string;
  userId: ObjectId;
  expiresAt: Date;
}

export interface WeeklyHours {
  /** 1 = Monday … 5 = Friday. Medisense works Monday to Friday. */
  weekday: number;
  /** Minutes after midnight, Brisbane time. */
  start: number;
  end: number;
}

export interface TimeOff {
  id: string;
  /** Brisbane calendar days, "YYYY-MM-DD", inclusive. */
  from: string;
  to: string;
  reason: string;
}

export interface TherapistProfile {
  bio: string;
  qualifications: string;
  languages: string[];
}

export interface TherapistCredentials {
  registration: string;
  /** "YYYY-MM-DD". */
  registrationExpiry: string;
  screeningExpiry: string;
  /** Assessment-only supports this clinician is credentialed to deliver. */
  assessmentScopes: Support[];
}

export interface TherapistDoc {
  _id: ObjectId;
  slug: string;
  name: string;
  discipline: Discipline;
  region: Region;
  seniority: "Graduate" | "Clinician" | "Senior";
  capacity: number;
  activeClients: number;
  /** Caseload health score: Healthy below 60, Watch 60–79, At Risk from 80. */
  caseloadScore: number;
  sessionMinutes: number;
  weekly: WeeklyHours[];
  /** Leave and other days away; no new visits are offered on these days. */
  timeOff?: TimeOff[];
  profile?: TherapistProfile;
  availabilityUpdatedAt?: Date | null;
  /** Registration, screening and the assessments they're credentialed for (E2E-05). */
  credentials?: TherapistCredentials;
  /** False once they've left: not offered in matching and can't sign in. */
  active?: boolean;
  userId: ObjectId;
}

export type NeedStatus = "needs-therapist" | "waiting" | "assigned" | "completed";

/** A service request: one per support asked for, under the one participant record. */
export interface ClientNeed {
  id: string;
  support: Support;
  discipline: Discipline;
  frequency: Frequency;
  /** Nursing type, "Other" support details or an "Other" frequency, in the referral's words. */
  details?: string;
  location?: ServiceLocation;
  status: NeedStatus;
  therapistId: ObjectId | null;
  referralId?: ObjectId | null;
}

export interface ClientDoc {
  _id: ObjectId;
  name: string;
  dateOfBirth: string | null;
  email: string;
  phone: string | null;
  suburb: string;
  region: Region;
  funding: FundingStream;
  needs: ClientNeed[];
  notes: string;
  emergencyContact?: { name: string; relationship: string; phone: string } | null;
  /** From clinical triage: what every therapist must know before a visit. */
  precautions?: string | null;
  /** Payer details from the referral, for invoicing. Finance sees these, not clinical notes. */
  fundingDetails?: {
    payer: string;
    payerEmail: string;
    ndisNumber: string;
    planEndDate: string;
    planType: string;
  } | null;
  discharged?: {
    at: Date;
    reason: string;
    byName: string;
    outcomes?: string;
    outstandingRisks?: string;
    advice?: string;
    handover?: string;
    signedBy?: string | null;
  } | null;
  userId: ObjectId;
  createdBy: ObjectId;
  createdAt: Date;
}

export type AssignmentStatus = "pending" | "accepted" | "declined" | "withdrawn";

export interface AssignmentDoc {
  _id: ObjectId;
  clientId: ObjectId;
  /** The service request this asks the therapist to take. */
  needId: string;
  therapistId: ObjectId;
  discipline: Discipline;
  status: AssignmentStatus;
  appointmentId: ObjectId;
  declineReason: string | null;
  createdBy: ObjectId;
  createdAt: Date;
  respondedAt: Date | null;
}

export type AppointmentStatus =
  | "tentative"
  | "booked"
  | "completed"
  | "cancelled"
  | "late-cancelled"
  | "no-show"
  | "aborted"
  | "rescheduled";

/** Session delivery (section 10): what happened in the visit, against the plan's goals. */
export interface SessionRecord {
  goals: { goalId: string; value: string; note: string }[];
  interventions: string;
  response: string;
  incidents: string;
  followUp: string;
}

export interface SessionNote {
  /** SOAP: Subjective, Objective, Assessment, Plan. */
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  /** The whole clinical note as one text, for lists and earlier notes. */
  text: string;
  forPatient: string;
  status?: "Draft" | "Pending Signature" | "Final" | "Amended";
  aiDrafted?: boolean;
  signedAt?: Date | null;
  amendments?: { reason: string; text: string; byName: string; at: Date }[];
  byName: string;
  at: Date;
}

export interface Cancellation {
  /** Who called it off. Only a client-side cancellation can count as late. */
  by: "client" | "medisense";
  reason: string;
  /** Whole hours between the cancellation and the visit. */
  noticeHours: number;
  /** True for a late cancellation or a visit the patient did not attend; may be charged. */
  chargeable: boolean;
  actorName: string;
  at: Date;
}

export interface AppointmentDoc {
  _id: ObjectId;
  therapistId: ObjectId;
  clientId: ObjectId;
  discipline: Discipline;
  start: Date;
  end: Date;
  status: AppointmentStatus;
  /** True while the appointment occupies the therapist's time (tentative or booked). */
  holdsSlot: boolean;
  /** The first visit of a recurring series; null for a one-off. */
  seriesId?: ObjectId | null;
  /** The visit this one was booked to replace. */
  replaces?: ObjectId | null;
  cancellation?: Cancellation | null;
  /** Written by the therapist after a completed visit; signed notes change only by amendment. */
  note?: SessionNote | null;
  checkIn?: { at: Date; attendees: string; safe: boolean; notes: string; byName: string } | null;
  checkOut?: { at: Date; minutes: number; byName: string } | null;
  session?: SessionRecord | null;
  /** An incomplete visit: why, and what remains to do. */
  aborted?: { reason: string; remaining: string; byName: string; at: Date } | null;
  /** Set once the service is verified and on an invoice. */
  invoiceId?: ObjectId | null;
  /** The service request this visit delivers. */
  needId?: string | null;
  /** Telehealth is an appointment modality (section 1); in person by default. */
  modality?: "In person" | "Telehealth";
  /** The patient confirmed they'll be there (P03). */
  confirmedByPatient?: Date | null;
  /** Left by the patient after a completed visit, once. */
  feedback?: { rating: number; comment: string; at: Date } | null;
  createdAt: Date;
}

export interface NotificationDoc {
  _id: ObjectId;
  userId: ObjectId;
  title: string;
  body: string;
  href: string;
  read: boolean;
  createdAt: Date;
}

export interface ConversationDoc {
  _id: ObjectId;
  clientId: ObjectId;
  therapistId: ObjectId;
  memberIds: ObjectId[];
  lastMessage: { body: string; senderId: ObjectId; at: Date } | null;
  createdAt: Date;
}

export interface MessageDoc {
  _id: ObjectId;
  conversationId: ObjectId;
  senderId: ObjectId;
  body: string;
  createdAt: Date;
  readBy: ObjectId[];
}

export type LiveEventType = "notification" | "message" | "care" | "read" | "typing";

/** One row per change a person should see straight away. Kept for a day, then expired. */
export interface EventDoc {
  _id: ObjectId;
  userIds: ObjectId[];
  type: LiveEventType;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface AuditDoc {
  _id: ObjectId;
  actorId: ObjectId;
  actorName: string;
  action: string;
  clientId: ObjectId | null;
  referralId?: ObjectId | null;
  at: Date;
}

export interface InfoRequest {
  id: string;
  items: Gap[];
  message: string;
  requestedBy: string;
  at: Date;
  answer: string | null;
  answeredAt: Date | null;
}

export interface ReferralDoc {
  _id: ObjectId;
  /** Shown to the submitter, e.g. MSR-7K2Q9P. Reveals nothing on its own. */
  reference: string;
  /** SHA-256 of the secret tracking token in the submitter's link. */
  trackingHash: string;
  /**
   * The family's app code, given on submission. With their email it shows progress in the app;
   * once accepted, the same code activates the patient's account.
   */
  access?: { codeHash: string; expiresAt: Date } | null;
  status: ReferralStatus;
  data: ReferralInput;
  /** Set during intake review; used for matching. */
  region: Region | null;
  /** From the automated completeness check, as last run. */
  gaps: Gap[];
  infoRequests: InfoRequest[];
  /** Possible duplicates found on submission. A person always decides. */
  duplicates: { kind: "patient" | "referral"; id: string; name: string; why: string }[];
  duplicateDecision: { clientId: ObjectId | null; byName: string; at: Date } | null;
  owner: { id: ObjectId; name: string } | null;
  triage: {
    decision: "Accepted" | "Waitlisted" | "Declined" | "More information";
    notes: string;
    riskAction: string;
    precaution: string;
    byName: string;
    at: Date;
  } | null;
  fundingReview: {
    verification: "Verified" | "Exception";
    exceptionReason: string;
    agreement: "Signed" | "Sent" | "Not required";
    consentRecorded: boolean;
    notes: string;
    byName: string;
    at: Date;
  } | null;
  outcome: { reason: string; byName: string; at: Date } | null;
  clientId: ObjectId | null;
  submittedBy: "public" | "staff";
  createdBy: ObjectId | null;
  history: { status: ReferralStatus; byName: string; note: string; at: Date }[];
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentDoc {
  _id: ObjectId;
  referralId: ObjectId | null;
  clientId: ObjectId | null;
  kind: DocumentKind;
  name: string;
  mime: string;
  size: number;
  data: Binary;
  uploadedBy: string;
  at: Date;
}

export interface AssessmentReview {
  requestedBy: string;
  requestedAt: Date;
  comment: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
}

export interface AssessmentDoc {
  _id: ObjectId;
  clientId: ObjectId;
  needId: string;
  therapistId: ObjectId;
  therapistName: string;
  support: Support;
  discipline: Discipline;
  kind: "Initial" | "Reassessment";
  status: AssessmentStatus;
  consent: { obtained: boolean; notes: string };
  sections: Record<string, SectionEntry>;
  activities: ActivityRecord[];
  findings: string;
  limitations: string;
  recommendation: { decision: Recommendation | ""; notes: string };
  released: { summary: string; byName: string; at: Date } | null;
  signed: { byName: string; at: Date } | null;
  amendments: { reason: string; text: string; byName: string; at: Date }[];
  reviews?: AssessmentReview[];
  cancelled?: { reason: string; byName: string; at: Date } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GoalDoc {
  id: string;
  description: string;
  domain: string;
  measure: string;
  baseline: string;
  target: string;
  current: string;
  status: GoalStatus;
  rationale: string;
  history: { value: string; note: string; at: Date; byName: string; visitId: ObjectId | null }[];
}

export interface PlanDoc {
  _id: ObjectId;
  clientId: ObjectId;
  needId: string;
  therapistId: ObjectId;
  therapistName: string;
  support: Support;
  status: PlanStatus;
  version: number;
  indication: string;
  goals: GoalDoc[];
  interventions: string;
  precautions: string;
  frequency: string;
  duration: string;
  reviewDate: string;
  approved: { byName: string; at: Date } | null;
  reviews: { decision: ReviewDecision; notes: string; byName: string; at: Date }[];
  progressSummary: { text: string; at: Date; model: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceLine {
  id: string;
  kind: "service" | "cancellation" | "adjustment";
  visitId: ObjectId | null;
  date: Date;
  description: string;
  itemCode: string;
  minutes: number;
  rate: number;
  amount: number;
}

export interface InvoiceDoc {
  _id: ObjectId;
  number: string;
  clientId: ObjectId;
  funding: FundingStream;
  payer: string;
  status: InvoiceStatus;
  lines: InvoiceLine[];
  payments: { amount: number; reference: string; byName: string; at: Date }[];
  history: { status: InvoiceStatus; byName: string; note: string; at: Date }[];
  issuedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TelehealthDoc {
  _id: ObjectId;
  appointmentId: ObjectId;
  clientId: ObjectId;
  therapistId: ObjectId;
  /** SHA-256 of the one-time join token; a new link replaces the old. */
  tokenHash: string | null;
  linkSentAt: Date | null;
  suitability: { ok: boolean; notes: string; byName: string; at: Date } | null;
  guest: { name: string; relationship: string; verified: boolean; at: Date } | null;
  consents: {
    video: { given: boolean; by: string; at: Date } | null;
    recording: { given: boolean; by: string; at: Date } | null;
    transcription: { given: boolean; by: string; at: Date } | null;
    sharing: { given: boolean; by: string; at: Date } | null;
  };
  device: { camera: boolean; microphone: boolean; network: "good" | "poor" } | null;
  state: "Not started" | "Waiting" | "In call" | "Ended";
  waitingSince: Date | null;
  admittedAt: Date | null;
  endedAt: Date | null;
  participants: { name: string; role: string; joinedAt: Date }[];
  screenShare: boolean;
  recordingAllowed: boolean;
  recording: {
    status: RecordingStatus;
    segments: { start: Date; end: Date }[];
    availableAt: Date | null;
    durationSec: number;
    retentionUntil: Date | null;
    deleted: { reason: string; byName: string; at: Date } | null;
    restricted: boolean;
  };
  transcript: { at: Date; speaker: string; text: string }[];
  accessLog: { byName: string; purpose: string; action: string; at: Date }[];
  events: { at: Date; text: string }[];
}
