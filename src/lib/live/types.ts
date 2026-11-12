import type { Appearance } from "@/app/theme-script";
import type {
  CaseloadStatus,
  Discipline,
  DocumentKind,
  Frequency,
  FundingStream,
  Region,
  ServiceLocation,
  StaffRole,
  SubmitterRole,
  Support,
} from "./catalogue";
import type { Gap, ReferralInput, ReferralStatus } from "./referral";

/** JSON shapes the API returns. Dates are ISO strings. */

export type Role = "admin" | "therapist" | "client";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  staffRoles: StaffRole[];
  appearance: Appearance | null;
};

export type NeedStatus = "needs-therapist" | "waiting" | "assigned" | "completed";

export type NeedDto = {
  id: string;
  support: Support;
  details: string;
  location: ServiceLocation;
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
  | "tentative"
  | "booked"
  | "completed"
  | "cancelled"
  | "late-cancelled"
  | "no-show"
  | "aborted"
  | "rescheduled";

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
  /** `text` and SOAP are the clinical note, sent to staff only; `forPatient` is the plain summary. */
  note: {
    text: string | null;
    soap: { subjective: string; objective: string; assessment: string; plan: string } | null;
    forPatient: string;
    status: "Draft" | "Pending Signature" | "Final" | "Amended";
    aiDrafted: boolean;
    signedAt: string | null;
    amendments: { reason: string; text: string; byName: string; at: string }[];
    byName: string;
    at: string;
  } | null;
  checkIn: { at: string; attendees: string; safe: boolean; notes: string; byName: string } | null;
  checkOut: { at: string; minutes: number; byName: string } | null;
  session: {
    goals: { goalId: string; value: string; note: string }[];
    interventions: string;
    response: string;
    incidents: string;
    followUp: string;
  } | null;
  aborted: { reason: string; remaining: string; byName: string; at: string } | null;
  invoiced: boolean;
  modality: "In person" | "Telehealth";
  confirmedByPatient: string | null;
  feedback: { rating: number; comment: string; at: string } | null;
};

export type AssignmentDto = {
  id: string;
  clientId: string;
  needId: string;
  clientName: string;
  therapistName: string;
  discipline: Discipline;
  status: "pending" | "accepted" | "declined" | "withdrawn";
  firstVisit: string;
  declineReason: string | null;
  createdAt: string;
};

export type DocumentDto = {
  id: string;
  kind: DocumentKind;
  name: string;
  size: number;
  uploadedBy: string;
  at: string;
};

export type ClientDetailDto = ClientSummaryDto & {
  precautions: string | null;
  documents: DocumentDto[];
  referrals: { id: string; reference: string }[];
  discharged: {
    at: string;
    reason: string;
    byName: string;
    outcomes: string | null;
    outstandingRisks: string | null;
    advice: string | null;
    handover: string | null;
  } | null;
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
  /** False when registration, screening or scope rules this clinician out (E2E-05). */
  eligible: boolean;
  slots: string[];
  availability: AvailabilitySummary;
};

export type RequestDto = AssignmentDto & {
  /** "6 years", or months for children under two. */
  age: string | null;
  suburb: string;
  funding: FundingStream;
  support: string;
  details: string;
  location: ServiceLocation;
  frequency: Frequency;
  notes: string;
  /** From clinical triage: read before accepting or visiting. */
  precautions: string | null;
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
  /** P04: approved plans' goals and released reports, nothing else clinical. */
  progress: {
    plans: {
      id: string;
      support: string;
      status: string;
      therapistName: string;
      reviewDate: string;
      goals: {
        id: string;
        description: string;
        baseline: string;
        target: string;
        current: string;
        status: string;
      }[];
    }[];
    reports: { id: string; support: string; summary: string; byName: string; at: string }[];
  };
  /** P05: invoices issued for this participant's services. */
  invoices: {
    id: string;
    number: string;
    status: string;
    payer: string;
    total: number;
    paid: number;
    issuedAt: string | null;
    lines: { date: string; description: string; amount: number }[];
  }[];
  /** Discharge advice from the clinician, once care has finished. */
  dischargeAdvice: string | null;
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
  | {
      type: "care";
      payload: { clientId?: string; referralId?: string; invoiceId?: string; visitId?: string };
    }
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
  active: boolean;
  registrationExpiry: string | null;
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

/** What a tracking link shows: the status and anything asked for, nothing else. */
export type PublicReferralDto = {
  reference: string;
  status: ReferralStatus;
  statusText: string;
  submittedAt: string;
  updatedAt: string;
  participantInitials: string;
  openRequest: { id: string; items: Gap[]; message: string; at: string } | null;
  canWithdraw: boolean;
};

export type ReferralSummaryDto = {
  id: string;
  reference: string;
  name: string;
  dateOfBirth: string;
  suburb: string;
  region: Region | null;
  status: ReferralStatus;
  funding: FundingStream;
  supports: string[];
  /** A reported risk or behaviours of concern (Yes or Unknown): clinical review before matching. */
  risk: boolean;
  gaps: number;
  duplicates: number;
  owner: string | null;
  submitterRole: SubmitterRole;
  submittedBy: "public" | "staff";
  createdAt: string;
  updatedAt: string;
};

export type ReferralDetailDto = ReferralSummaryDto & {
  data: ReferralInput;
  gapsList: Gap[];
  duplicatesList: { kind: "patient" | "referral"; id: string; name: string; why: string }[];
  duplicateDecision: { clientId: string | null; byName: string; at: string } | null;
  infoRequests: {
    id: string;
    items: Gap[];
    message: string;
    requestedBy: string;
    at: string;
    answer: string | null;
    answeredAt: string | null;
  }[];
  triage: {
    decision: "Accepted" | "Waitlisted" | "Declined" | "More information";
    notes: string;
    riskAction: string;
    precaution: string;
    byName: string;
    at: string;
  } | null;
  fundingReview: {
    verification: "Verified" | "Exception";
    exceptionReason: string;
    agreement: "Signed" | "Sent" | "Not required";
    consentRecorded: boolean;
    notes: string;
    byName: string;
    at: string;
  } | null;
  outcome: { reason: string; byName: string; at: string } | null;
  clientId: string | null;
  documents: DocumentDto[];
  history: { status: ReferralStatus; byName: string; note: string; at: string }[];
  activity: { id: string; action: string; actor: string; at: string }[];
  /** True when the viewer can make the clinical triage decision. */
  canTriage: boolean;
};
