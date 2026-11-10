import type { CaseloadStatus, Discipline, Frequency, FundingStream, Region } from "./catalogue";

/** JSON shapes the API returns. Dates are ISO strings. */

export type Role = "admin" | "therapist" | "client";

export type SessionUser = { id: string; name: string; email: string; role: Role };

export type NeedStatus = "needs-therapist" | "waiting" | "assigned";

export type NeedDto = {
  discipline: Discipline;
  frequency: Frequency;
  status: NeedStatus;
  therapistName: string | null;
};

export type ClientStage = "Needs a therapist" | "Waiting for therapist" | "Active" | "Discharged";

export type ClientSummaryDto = {
  id: string;
  name: string;
  suburb: string;
  region: Region;
  funding: FundingStream;
  needs: NeedDto[];
  stage: ClientStage;
  createdAt: string;
};

export type VisitStatus =
  "tentative" | "booked" | "completed" | "cancelled" | "late-cancelled" | "no-show";

export type AppointmentDto = {
  id: string;
  clientId: string;
  start: string;
  end: string;
  status: VisitStatus;
  discipline: Discipline;
  clientName: string;
  therapistName: string;
  /** "Visit 3 of 8" for a recurring series; null for a one-off. */
  series: { index: number; total: number } | null;
  cancellation: {
    by: "client" | "medisense";
    reason: string;
    noticeHours: number;
    chargeable: boolean;
    actorName: string;
  } | null;
  /** `text` is the clinical note, sent to staff only; `forPatient` is the plain summary. */
  note: { text: string | null; forPatient: string; byName: string; at: string } | null;
  feedback: { rating: number; comment: string; at: string } | null;
};

export type AssignmentDto = {
  id: string;
  clientId: string;
  clientName: string;
  therapistName: string;
  discipline: Discipline;
  status: "pending" | "accepted" | "declined" | "withdrawn";
  firstVisit: string;
  declineReason: string | null;
  createdAt: string;
};

export type ClientDetailDto = ClientSummaryDto & {
  discharged: { at: string; reason: string; byName: string } | null;
  emergencyContact: { name: string; relationship: string; phone: string } | null;
  dateOfBirth: string | null;
  email: string;
  phone: string | null;
  notes: string;
  account: "Invited" | "Active" | "Invite expired";
  assignments: AssignmentDto[];
  appointments: AppointmentDto[];
  activity: { id: string; action: string; actor: string; at: string }[];
};

export type AvailabilitySummary = {
  /** "Mon, Tue, Thu · 9 am–5 pm" */
  pattern: string;
  /** Time off starting within the next four weeks. */
  away: { from: string; to: string; reason: string }[];
};

export type MatchDto = {
  therapistId: string;
  name: string;
  discipline: Discipline;
  region: Region;
  seniority: "Graduate" | "Clinician" | "Senior";
  status: CaseloadStatus;
  activeClients: number;
  capacity: number;
  sessionMinutes: number;
  score: number;
  reasons: { label: string; tone: "good" | "neutral" | "warn" }[];
  slots: string[];
  availability: AvailabilitySummary;
};

export type RequestDto = AssignmentDto & {
  /** "6 years", or months for children under two. */
  age: string | null;
  suburb: string;
  funding: FundingStream;
  frequency: Frequency;
  notes: string;
};

export type TherapistHomeDto = {
  therapist: {
    name: string;
    discipline: Discipline;
    region: Region;
    activeClients: number;
    capacity: number;
    status: CaseloadStatus;
  };
  requests: RequestDto[];
  clients: {
    id: string;
    name: string;
    suburb: string;
    discipline: Discipline;
    frequency: Frequency;
    conversationId: string | null;
    discharged: boolean;
  }[];
  upcoming: AppointmentDto[];
  /** Past visits still waiting for "Attended" or "Did not attend". */
  toRecord: AppointmentDto[];
  /** Completed visits in the last 30 days without a session note. */
  notesToWrite: AppointmentDto[];
  /** Completed, missed and cancelled visits from the last two weeks, newest first. */
  recent: AppointmentDto[];
};

export type ClientHomeDto = {
  name: string;
  phone: string | null;
  emergencyContact: { name: string; relationship: string; phone: string } | null;
  discharged: { at: string; reason: string } | null;
  /** Completed visits the patient hasn't rated yet. */
  toRate: AppointmentDto[];
  needs: NeedDto[];
  team: { therapistName: string; discipline: Discipline; conversationId: string | null }[];
  upcoming: AppointmentDto[];
};

export type NotificationDto = {
  id: string;
  title: string;
  body: string;
  href: string;
  read: boolean;
  createdAt: string;
};

export type ConversationDto = {
  id: string;
  clientId: string;
  title: string;
  subtitle: string;
  lastMessage: string | null;
  lastAt: string | null;
  unread: number;
};

export type MessageDto = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  /** True once the other person has opened the conversation after it was sent. */
  seen: boolean;
};

export type LiveEvent =
  | { type: "notification"; payload: { title: string } }
  | { type: "message"; payload: { message: MessageDto } }
  | { type: "care"; payload: { clientId?: string } }
  | { type: "read"; payload: { conversationId: string; readerId?: string } }
  | { type: "typing"; payload: { conversationId: string; name: string } }
  | { type: "connected"; payload: Record<string, never> };

export type LiveOverviewDto = {
  onboarding: {
    needsTherapist: number;
    waiting: number;
    active: number;
    oldestPendingAt: string | null;
  };
  visits: { today: number; week: { day: string; booked: number; cancelled: number }[] };
  /** Last 30 days. */
  cancellations: { total: number; late: number; noShows: number };
  team: { therapists: number; activeClients: number; capacity: number; atRisk: number };
};

export type WeeklyHoursDto = { weekday: number; start: number; end: number };
export type TimeOffDto = { id: string; from: string; to: string; reason: string };

export type TherapistCardDto = {
  id: string;
  name: string;
  discipline: Discipline;
  region: Region;
  seniority: "Graduate" | "Clinician" | "Senior";
  status: CaseloadStatus;
  activeClients: number;
  capacity: number;
  availability: AvailabilitySummary;
  rating: { average: number; count: number } | null;
};

export type TherapistDetailDto = TherapistCardDto & {
  email: string;
  phone: string | null;
  profile: { bio: string; qualifications: string; languages: string[] };
  weekly: WeeklyHoursDto[];
  timeOff: TimeOffDto[];
  sessionMinutes: number;
  stats: { upcoming: number; completed: number; noShows: number; lateCancellations: number };
  patients: {
    id: string;
    name: string;
    discipline: Discipline;
    since: string;
    discharged: boolean;
  }[];
  feedback: { rating: number; comment: string; at: string; patient: string; visit: string }[];
  history: { id: string; action: string; at: string }[];
};
