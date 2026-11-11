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
import type { Gap, ReferralInput, ReferralStatus } from "@/lib/live/referral";

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
  userId: ObjectId;
}

export type NeedStatus = "needs-therapist" | "waiting" | "assigned";

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
  discharged?: { at: Date; reason: string; byName: string } | null;
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
  "tentative" | "booked" | "completed" | "cancelled" | "late-cancelled" | "no-show";

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
  /** Written by the therapist after a completed visit. */
  note?: { text: string; forPatient: string; byName: string; at: Date } | null;
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
