import type { ObjectId } from "mongodb";
import type { Discipline, Frequency, FundingStream, Region } from "@/lib/live/catalogue";

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

export interface ClientNeed {
  discipline: Discipline;
  frequency: Frequency;
  status: NeedStatus;
  therapistId: ObjectId | null;
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
  discharged?: { at: Date; reason: string; byName: string } | null;
  userId: ObjectId;
  createdBy: ObjectId;
  createdAt: Date;
}

export type AssignmentStatus = "pending" | "accepted" | "declined" | "withdrawn";

export interface AssignmentDoc {
  _id: ObjectId;
  clientId: ObjectId;
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
  /** True for a late cancellation or no-show, which may be charged under the 48-hour policy. */
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

export type LiveEventType = "notification" | "message" | "care" | "read";

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
  at: Date;
}
