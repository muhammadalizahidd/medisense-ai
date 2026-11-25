import type { Binary, ObjectId } from "mongodb";
import type {
  Discipline,
  DocumentKind,
  DocumentStatus,
  Frequency,
  FundingStream,
  Region,
  ServiceLocation,
  ServiceDecision,
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
import type {
  Address,
  ConsentKey,
  ConsentState,
  ContactInput,
  ManualStatus,
} from "@/lib/live/participant";
import type { RecordingStatus } from "@/lib/live/telehealth";
import type { AppointmentPurpose, SiteInput } from "@/lib/live/scheduling";
import type { WorkspacePrefs } from "@/lib/live/workspace";
import type {
  CompetencyStatus,
  CoverageInput,
  CredentialInput,
  CredentialStatus,
  EngagementStatus,
  StaffProfileInput,
} from "@/lib/live/staff";

import type { Appearance } from "@/app/theme-script";
import type { BuilderSpec } from "@/lib/live/report-catalogue";
import type { ReportFilters, ShareScope } from "@/lib/live/reports";
import type {
  AdjustmentStatus,
  AdjustmentType,
  BillingUnit,
  ChargeSource,
  ClaimStatus,
  Flag,
  FundingPath,
  HoldReason,
  InvoiceDraftInput,
  LineStatus,
  PaymentStatus,
  PaymentTerms,
  ReconStatus,
  TaxTreatment,
} from "@/lib/live/finance";
import type {
  AgreementStatus,
  AgreementType,
  Eligibility,
  EvidenceCategory,
  EvidenceStatus,
  FieldState,
  Geography,
  InfoSource,
  LineInput,
  Management,
  PayerKind,
  PayerStatus,
  PlanFieldKey,
  PriceItemInput,
} from "@/lib/live/funding";
import type {
  ApprovalStatus,
  ApprovalWorkflow,
  AutomationSource,
  Channel,
  Confidence,
  EntityKind,
  FindingCategory,
  FindingDecision,
  FindingResolution,
  FindingSeverity,
  MessageDto,
  MessageState,
  RecipientType,
  ResolutionCode,
  RuleInput,
  RuleStatus,
  RunDto,
  RunMode,
  SlaClass,
  TaskCategory,
  TaskPriority,
  TaskStatus,
  Team,
  Visibility,
} from "@/lib/live/operations";

export type UserRole = "admin" | "therapist" | "client";

export interface UserDoc {
  /** Shared history created by reports-demo.ts; removable in one query. */
  demo?: boolean;
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
  /** Set with a temporary password from User control: they choose their own at next sign-in. */
  mustChangePassword?: boolean;
  lastSignInAt?: Date | null;
  /** The Super Admin who created the account in User control. */
  createdBy?: ObjectId | null;
  /** Admin responsibilities; a Clinical Lead or Super Admin makes clinical triage decisions. */
  staffRoles?: string[];
  /** Theme, accent, typeface, density and text size, saved from Appearance. */
  appearance?: Appearance;
  /** Module 10 personal work settings; never organisational clinical policy. */
  workspacePrefs?: WorkspacePrefs;
  createdAt: Date;
}

/**
 * An office-staff role and the permissions it grants (see lib/permissions/catalogue). Built-in
 * roles start from the catalogue defaults; the Super Admin can edit them and add more.
 */
export interface RoleDoc {
  _id: ObjectId;
  /** Stable identifier; the display name can change. */
  slug: string;
  name: string;
  /**
   * Built-in roles only: the original name, which is what people's staffRoles store and what the
   * existing role checks compare, so renaming a built-in role never changes anyone's access.
   */
  legacyName?: string;
  description: string;
  builtIn: boolean;
  permissions: string[];
  /** Every permission that existed when this role was last seeded, so new ones are added once. */
  knownPermissions: string[];
  createdAt: Date;
  updatedAt: Date;
  updatedBy: ObjectId | null;
}

/** Platform-wide facts. The single Super Admin account is recorded here. */
export interface PlatformDoc {
  _id: "platform";
  superAdminId: ObjectId;
  updatedAt: Date;
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
  /** When an uploaded profile photo was last changed (photos.ts); none means the default. */
  photoAt?: Date | null;
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
  /** Module 04: staff profile, credential register, service eligibility and coverage. */
  staff?: StaffDoc;
  userId: ObjectId;
}

export interface StaffDoc {
  staffId: string;
  status: EngagementStatus;
  statusNote: { status: string; reason: string; byName: string; at: Date } | null;
  profile: StaffProfileInput;
  coverage: CoverageInput;
  credentials: (CredentialInput & {
    id: string;
    status: CredentialStatus;
    reviewedBy: string | null;
    reviewedAt: Date | null;
    note: string;
    /** HR asked the clinician for the renewed credential (People and HR alerts). */
    renewal?: { requestedAt: Date; byName: string } | null;
  })[];
  competencies: {
    support: string;
    status: CompetencyStatus;
    reviewedBy: string | null;
    reviewedAt: Date | null;
    note: string;
    supervisionRequired: boolean;
  }[];
}

export type NeedStatus = "needs-therapist" | "waiting" | "assigned" | "completed";

/** A service request: one per support asked for, under the one participant record. */
export interface ParticipantProfileDoc {
  /** Set by hand; otherwise the status follows the services and discharge. */
  manualStatus: ManualStatus | null;
  statusNote: { status: string; reason: string; byName: string; at: Date } | null;
  preferredName: string;
  pronouns: string;
  address: Address;
  addressHistory: { address: Address; until: Date; byName: string }[];
  language: string;
  interpreter: boolean;
  accessibility: string[];
  accessibilityNotes: string;
  contactMode: string;
  contactTime: string;
  /** Where each value came from, and who verified it (section 4, record provenance). */
  provenance: Record<string, { source: string; verifiedBy: string | null; at: Date }>;
  reportedDiagnosis: { text: string; source: string } | null;
}

export interface ContactDoc extends Omit<ContactInput, "id"> {
  id: string;
  /** A secure link to the participant's appointments, for authorised contacts only (AT-24). */
  portal?: { hash: string; expiresAt: Date } | null;
  state: "Invited" | "Unverified" | "Verified" | "Revoked";
  verifiedBy: string | null;
  verifiedAt: Date | null;
  revoked: { reason: string; byName: string; at: Date } | null;
  source: string;
  createdAt: Date;
}

export interface ConsentDoc {
  key: ConsentKey;
  state: ConsentState;
  version: string;
  respondent: string;
  recordedBy: string;
  at: Date | null;
  /** Share with coordinator: the record categories included. */
  scope: string[];
  note: string;
  history: {
    state: ConsentState;
    respondent: string;
    recordedBy: string;
    at: Date;
    note: string;
  }[];
}

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
  /** Shared history created by reports-demo.ts; removable in one query. */
  demo?: boolean;
  _id: ObjectId;
  /** When an uploaded profile photo was last changed (photos.ts); none means the default. */
  photoAt?: Date | null;
  /** Medical record number, MRN-DDMMYYYY-0001. The patient signs in to the app with it. */
  mrn?: string;
  /** Module 03: identity details, contacts and representatives, and consents. */
  profile?: ParticipantProfileDoc;
  contacts?: ContactDoc[];
  consents?: ConsentDoc[];
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
  /** Booked from the schedule with only a name and phone; intake completes the rest. */
  provisional?: { byName: string; at: Date; note: string } | null;
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
  /** Module 05: APT-000001, given once and never changed. */
  ref?: string;
  /** Where the visit happens and what the site needs (home access, school permission…). */
  site?: SiteInput | null;
  purpose?: AppointmentPurpose | null;
  /** Why a lower-ranked clinician was chosen over the suggestion (AC-15). */
  overrideReason?: string | null;
  /** Recorded with a no-show: attempts to reach the participant and any safety concern. */
  noShow?: { attempts: string; concern: boolean; byName: string; at: Date } | null;
  /** A secure link the participant opens without an account to confirm or ask for a change. */
  publicLink?: { hash: string; expiresAt: Date } | null;
  changeRequests?: { at: Date; note: string; resolved: boolean }[];
  /** A custom series agreed at booking, instead of the referral frequency's default. */
  seriesPlan?: { visits: number; everyDays: number } | null;
  /** When the visit was moved, from where, why and by whom (AT-13). */
  moved?: { from: Date; reason: string; byName: string; at: Date; notified: string } | null;
  /** Reminders sent again by staff, by trigger. */
  resent?: { trigger: string; at: Date; byName: string }[];
  /** Left by the patient after a completed visit, once. */
  feedback?: { rating: number; comment: string; at: Date } | null;
  /** Travel planned at booking and recorded on the day, kept apart from clinical time. */
  travelPlan?: { bookedMinutes: number; recordedMinutes: number | null; charge: string } | null;
  /** Shared history created by reports-demo.ts; removable in one query. */
  demo?: boolean;
  /** Module 10 scenario visits keep their day and time relative to today until they're started. */
  scenario?: { code: string; dayOffset: number; minutes: number } | null;
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

/** A one-to-one chat an admin opens with anyone in the system: staff, clinicians or patients. */
export interface DirectChatDoc {
  _id: ObjectId;
  memberIds: ObjectId[];
  /** Both member ids, sorted and joined, so a pair only ever has one chat. */
  pairKey: string;
  startedBy: ObjectId;
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
  attachment?: {
    kind: "document" | "image" | "video" | "audio";
    name: string;
    url: string;
    mime: string;
    size: number;
  } | null;
}

export type LiveEventType = "notification" | "message" | "care" | "read" | "typing" | "settings";

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
  /** Module 04: changes to a staff member's record. */
  therapistId?: ObjectId | null;
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
  /** Shared history created by reports-demo.ts; removable in one query. */
  demo?: boolean;
  _id: ObjectId;
  /** Shown to the submitter: REF- followed by the MRN, e.g. REF-MRN-12112026-0001. */
  reference: string;
  /** SHA-256 of the secret tracking token in the submitter's link. */
  trackingHash: string;
  /**
   * The family's app code, given on submission. With their email it shows progress in the app;
   * once accepted, the same code activates the patient's account.
   */
  access?: { codeHash: string; expiresAt: Date } | null;
  /** The MRN issued on submission; the reference is REF- followed by it. */
  mrn?: string;
  status: ReferralStatus;
  data: ReferralInput;
  /** Intake's decision for each requested support, by its position in data.supports. */
  services?: ServiceRecord[];
  /** The welcome message sent once the first visit is arranged (one per referral). */
  welcome?: {
    messageId: ObjectId;
    ref: string;
    state: string;
    channel: string;
    recipient: string;
    byName: string;
    at: Date;
  } | null;
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

export interface ServiceRecord {
  index: number;
  support: string;
  decision: ServiceDecision;
  reason: string;
  /** The service request on the patient record, once it exists. */
  needId: string | null;
  byName: string;
  at: Date;
}

export interface DocumentDoc {
  _id: ObjectId;
  /** Review state; missing on files from before reviews, which count as pending. */
  status?: DocumentStatus;
  version?: number;
  /** The earlier version this replaces, and the later one that replaced it. */
  supersedes?: ObjectId | null;
  replacedBy?: ObjectId | null;
  review?: { byName: string; at: Date; reason: string } | null;
  /** Module 06: funding evidence, seen by intake and Finance only (section 13). */
  area?: "funding" | null;
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
  /** Shared history created by reports-demo.ts; removable in one query. */
  demo?: boolean;
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
  /** Shared history created by reports-demo.ts; removable in one query. */
  demo?: boolean;
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
  /** Module 06: the payer route and agreement line in force when this line was made (AT-27). */
  payerRoute?: string;
  agreementId?: ObjectId | null;
  budgetId?: string | null;
  /** Module 07: the billable line this came from, its quantity, unit and tax. */
  billableId?: ObjectId | null;
  quantity?: number;
  unit?: string;
  tax?: TaxTreatment;
  gst?: number;
  discipline?: string;
  held?: boolean;
}

export interface InvoiceDoc {
  /** Demo history created by finance-demo.ts; removable in one query. */
  demo?: boolean;
  _id: ObjectId;
  number: string;
  clientId: ObjectId;
  funding: FundingStream;
  payer: string;
  status: InvoiceStatus;
  lines: InvoiceLine[];
  payments: { amount: number; reference: string; byName: string; at: Date; paymentId?: ObjectId }[];
  history: { status: InvoiceStatus; byName: string; note: string; at: Date }[];
  issuedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** Module 07 additions. */
  version?: number;
  path?: FundingPath;
  dueDate?: string | null;
  terms?: PaymentTerms;
  delivery?: string;
  billTo?: InvoiceDraftInput["billTo"];
  note?: string;
  agreementId?: ObjectId | null;
  credits?: { adjustmentId: ObjectId; ref: string; amount: number; at: Date; reason: string }[];
  comms?: { at: Date; byName: string; channel: string; to: string; subject: string }[];
  versions?: {
    version: number;
    at: Date;
    byName: string;
    reason: string;
    total: number;
    lines: InvoiceLine[];
  }[];
  dispute?: { reason: string; at: Date; byName: string } | null;
}

export interface TelehealthDoc {
  /** Shared history created by reports-demo.ts; removable in one query. */
  demo?: boolean;
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
    /** Stored media for playback (video with sound, and the audio track on its own). */
    media?: { video: string | null; audio: string | null } | null;
  };
  transcript: { at: Date; speaker: string; text: string }[];
  accessLog: { byName: string; purpose: string; action: string; at: Date }[];
  events: { at: Date; text: string }[];
}

/* ------------------------------------------------------------------ Module 06 */

export interface FundingHistoryEntry {
  at: Date;
  byName: string;
  action: string;
  /** Previous and new values, when a value changed. */
  from?: string;
  to?: string;
  reason?: string;
}

export interface FundingPlanDoc {
  _id: ObjectId;
  ref: string;
  status: "Draft" | "Active" | "Expired" | "Superseded";
  clientId: ObjectId | null;
  referralId: ObjectId | null;
  participant: string;
  ndisNumber: string;
  start: string;
  end: string;
  /** The referral-level label (Plan Managed, Self-Managed, Agency Managed), participant-reported. */
  management: string;
  fundingPeriods: "Yes" | "No" | "Unknown";
  periods: { id: string; start: string; end: string; note: string }[];
  geography: Geography;
  /** Values as the referral reported them, kept apart from the recorded values (AT-09). */
  reported: {
    ndisNumber: string;
    start: string;
    end: string;
    management: string;
    fundingPeriods: string;
    planManagerCompany: string;
    planManagerEmail: string;
  };
  fields: Partial<
    Record<
      PlanFieldKey,
      {
        state: FieldState;
        source: InfoSource | "";
        note: string;
        byName: string | null;
        at: Date | null;
      }
    >
  >;
  evidence: {
    id: string;
    documentId: ObjectId | null;
    category: EvidenceCategory;
    name: string;
    status: EvidenceStatus;
    source: InfoSource;
    version: number;
    note: string;
    uploadedBy: string;
    at: Date;
    reviewedBy: string | null;
    reviewedAt: Date | null;
    /** A simulated read of the document's values (stored sample set). */
    scan?: {
      at: Date;
      byName: string;
      ndisNumber: string;
      start: string;
      end: string;
      management: "Plan Managed" | "Self-Managed" | "Agency Managed";
      fundingPeriods: "Yes" | "No";
      periods: { start: string; end: string }[];
      budgets: { name: string; management: Management; amount: number }[];
      confidence: number;
      applied: { byName: string; at: Date } | null;
    } | null;
  }[];
  budgets: FundingBudget[];
  infoRequests: {
    id: string;
    items: string[];
    message: string;
    to: string;
    byName: string;
    at: Date;
    receivedAt: Date | null;
    receivedNote: string;
    /** Workflow step 3: a secure upload link for the person asked (no account needed). */
    link?: { hash: string; expiresAt: Date } | null;
  }[];
  agencyChecks: string[];
  history: FundingHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FundingBudget {
  id: string;
  name: string;
  priceItemId: string;
  management: Management;
  payerId: ObjectId | null;
  periodId: string;
  reportedTotal: number | null;
  verified: { amount: number; at: Date; byName: string; source: string } | null;
  eligibility: Eligibility;
  eligibilityNote: string;
  eligibilityBy: string | null;
  sharing: string;
  alertThreshold: number;
  travelAllowed: boolean;
  travelNote: string;
}

export interface PayerDoc {
  _id: ObjectId;
  ref: string;
  kind: PayerKind;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  deliveryMethod: string;
  status: PayerStatus;
  /** A self-managed payer belongs to one participant; plan managers serve many. */
  clientId: ObjectId | null;
  authority: string;
  abn: string;
  billingNotes: string;
  effectiveFrom: string;
  replacedBy: ObjectId | null;
  verifiedBy: string | null;
  history: FundingHistoryEntry[];
  createdAt: Date;
}

export interface PriceItemDoc extends Omit<PriceItemInput, "id"> {
  _id: string;
  updatedBy: string;
  updatedAt: Date;
}

export interface AgreementLine extends Omit<LineInput, "id"> {
  id: string;
  /** Snapshots taken when the line was priced, so later catalogue edits never change it. */
  priceEdition: string;
  priceEffective: string;
  priceLimit: number | null;
  payerRoute: string;
}

export interface AgreementDoc {
  _id: ObjectId;
  ref: string;
  version: number;
  type: AgreementType;
  rootId: ObjectId;
  previousId: ObjectId | null;
  clientId: ObjectId;
  planId: ObjectId | null;
  status: AgreementStatus;
  provider: string;
  start: string;
  end: string;
  signatory: {
    contactId: string;
    name: string;
    email: string;
    authority: string;
    verified: boolean;
    verifiedBy: string | null;
  };
  lines: AgreementLine[];
  cancellation: string;
  rights: string[];
  communication: string[];
  communicationNote: string;
  sharing: string;
  review: {
    required: boolean;
    reasons: string[];
    byName: string | null;
    at: Date | null;
    note: string;
  };
  link: { hash: string; expiresAt: Date } | null;
  acceptance: {
    name: string;
    role: string;
    at: Date;
    version: number;
    method: string;
    consent: string;
  } | null;
  changeRequest: { note: string; at: Date } | null;
  declined: { reason: string; at: Date; outcome: string } | null;
  events: { at: Date; byName: string; action: string; note: string }[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FundingAckDoc {
  _id: string;
  byName: string;
  at: Date;
  note: string;
}

/* ------------------------------------------------------------------ Module 07 */

export interface FinanceEvent {
  at: Date;
  byName: string;
  action: string;
}

/** A charge waiting to be invoiced or claimed, made from one delivered source (section 5). */
export interface BillableDoc {
  /** Demo history created by finance-demo.ts; removable in one query. */
  demo?: boolean;
  _id: ObjectId;
  ref: string;
  /** "appointment:<id>:service" style key: one source, one charge (AC-03). */
  sourceKey: string;
  source: ChargeSource;
  appointmentId: ObjectId | null;
  parentId: ObjectId | null;
  clientId: ObjectId;
  needId: string | null;
  support: string;
  discipline: string;
  therapistId: ObjectId | null;
  therapist: string;
  start: Date;
  end: Date;
  deliveredMinutes: number;
  billableMinutes: number;
  location: string;
  path: FundingPath;
  payerRoute: string;
  agreementId: ObjectId | null;
  agreementRef: string | null;
  budgetId: string | null;
  priceItemId: string | null;
  itemCode: string;
  itemName: string;
  unit: BillingUnit;
  quantity: number;
  rate: number;
  rateSource: string;
  priceLimit: number | null;
  tax: TaxTreatment;
  confirmation: { byName: string; at: Date; how: string } | null;
  travel: {
    category: string;
    minutes: number;
    km: number;
    costs: number;
    basis: string;
    evidence: string;
  } | null;
  status: LineStatus;
  flags: Flag[];
  hold: { reason: HoldReason; note: string; byName: string; at: Date } | null;
  override: {
    rate: number;
    reason: string;
    requestedBy: string;
    approvedBy: string | null;
    at: Date;
  } | null;
  invoiceId: ObjectId | null;
  claimId: ObjectId | null;
  duplicateOf: ObjectId | null;
  /** AC-36: a configurable, non-safety check a Finance Manager overrode, with the reason. */
  overrides?: { kind: string; reason: string; byName: string; at: Date }[];
  history: FinanceEvent[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ClaimDoc {
  /** Demo history created by finance-demo.ts; removable in one query. */
  demo?: boolean;
  _id: ObjectId;
  ref: string;
  clientId: ObjectId;
  status: ClaimStatus;
  billableIds: ObjectId[];
  total: number;
  paid: number;
  outcome: { status: string; note: string; at: Date } | null;
  history: FinanceEvent[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentDoc {
  /** Demo history created by finance-demo.ts; removable in one query. */
  demo?: boolean;
  _id: ObjectId;
  ref: string;
  payer: string;
  receivedOn: string;
  method: string;
  amount: number;
  reference: string;
  note: string;
  status: PaymentStatus;
  allocations: {
    target: "invoice" | "claim";
    id: ObjectId;
    amount: number;
    at: Date;
    byName: string;
  }[];
  recon: ReconStatus;
  /** Approved refunds out of the unapplied balance (simulated; no money moves). */
  refunded?: number;
  history: FinanceEvent[];
  createdAt: Date;
}

export interface StatementLineDoc {
  /** Demo history created by finance-demo.ts; removable in one query. */
  demo?: boolean;
  _id: ObjectId;
  date: string;
  amount: number;
  reference: string;
  description: string;
  status: ReconStatus;
  paymentId: ObjectId | null;
  reviewedBy: string | null;
  importedAt: Date;
}

export interface AdjustmentDoc {
  /** Demo history created by finance-demo.ts; removable in one query. */
  demo?: boolean;
  _id: ObjectId;
  ref: string;
  type: AdjustmentType;
  status: AdjustmentStatus;
  invoiceId: ObjectId | null;
  paymentId: ObjectId | null;
  lineIds: string[];
  amount: number;
  reason: string;
  refundReason: string | null;
  rebill: boolean;
  rebillInvoiceId: ObjectId | null;
  requestedBy: string;
  reviewedBy: string | null;
  decidedBy: string | null;
  history: FinanceEvent[];
  createdAt: Date;
  updatedAt: Date;
}

/* ------------------------------------------------------------------ Module 08 */

export interface OpsEvent {
  at: Date;
  by: string;
  action: string;
}

export interface OpsTaskDoc {
  /** Shared history created by reports-demo.ts; removable in one query. */
  demo?: boolean;
  _id: ObjectId;
  ref: string;
  title: string;
  category: TaskCategory;
  status: TaskStatus;
  priority: TaskPriority;
  urgentReason: string;
  team: Team;
  assigneeId: ObjectId | null;
  assigneeName: string | null;
  related: { kind: EntityKind; ref: string; label: string; href: string | null };
  clientId: ObjectId | null;
  referralId: ObjectId | null;
  appointmentId: ObjectId | null;
  participant: string | null;
  service: string | null;
  discipline: string | null;
  locationType: string | null;
  dueAt: Date;
  sla: SlaClass;
  visibility: Visibility;
  source: AutomationSource;
  ruleCode: string | null;
  ruleVersion: number | null;
  /** Rule + event + entity: one task per key, so a repeated trigger never duplicates (OP-032). */
  idemKey: string | null;
  checklist: {
    id: string;
    label: string;
    required: boolean;
    done: boolean;
    by: string | null;
    at: Date | null;
  }[];
  notes: { id: string; text: string; by: string; at: Date; edits: { text: string; at: Date }[] }[];
  attachments: { name: string; size: number; type: string; restricted: boolean }[];
  history: OpsEvent[];
  resolution: { code: ResolutionCode; note: string; by: string; at: Date } | null;
  holdReason: string;
  escalation: { owner: string; reason: string; at: Date; outcome: string } | null;
  acknowledged: { by: string; at: Date } | null;
  tags: string[];
  /** Seen only by clinical staff (OP-047). */
  restrictedNote: string | null;
  /** A recording link, seen only by people allowed to play recordings (OP-048). */
  recordingHref: string | null;
  /** Proposed by a Suggest Only rule: a person confirms it before work starts. */
  suggestion: boolean;
  scenario: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface OpsRuleDoc extends RuleInput {
  _id: ObjectId;
  code: string;
  status: RuleStatus;
  version: number;
  versions: { version: number; by: string; reason: string; at: Date; snapshot: RuleInput }[];
  check: string;
  proposedAction: string;
  defaultOwnerLabel: string;
  builtIn: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OpsRunDoc {
  _id: ObjectId;
  ref: string;
  /** Rule + event + entity, so the same skip or suppression is logged once. */
  key: string;
  ruleCode: string;
  ruleName: string;
  ruleVersion: number;
  trigger: string;
  entity: string;
  input: string;
  actions: string[];
  outcome: RunDto["outcome"];
  detail: string;
  mode: RunMode;
  retries: number;
  resolved: boolean;
  at: Date;
}

export interface OpsApprovalDoc {
  _id: ObjectId;
  ref: string;
  key: string;
  workflow: ApprovalWorkflow;
  title: string;
  reason: string;
  initiator: string;
  status: ApprovalStatus;
  slaHours: number;
  related: { label: string; href: string | null };
  taskId: ObjectId | null;
  ruleId: ObjectId | null;
  restricted: boolean;
  comments: { by: string; text: string; at: Date }[];
  decisions: { by: string; decision: string; note: string; at: Date }[];
  createdAt: Date;
  updatedAt: Date;
}

export interface OpsMessageDoc {
  _id: ObjectId;
  ref: string;
  key: string;
  template: string;
  templateVersion: number;
  category: string;
  recipientType: RecipientType;
  recipient: string;
  authority: MessageDto["authority"];
  channel: Channel;
  subject: string;
  body: string;
  missing: string[];
  state: MessageState;
  reason: string;
  attempts: number;
  related: { label: string; href: string | null };
  taskId: ObjectId | null;
  clientId: ObjectId | null;
  history: { at: Date; state: MessageState; note: string }[];
  createdAt: Date;
}

export interface OpsFindingDoc {
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  confidence: Confidence | null;
  field: string;
  label: string;
  detail: string;
  source: string;
  evidence: string;
  original: string;
  suggested: string;
  origin: "Validator" | "AI";
  resolution: FindingResolution;
  decision: { decision: FindingDecision; value: string; note: string; by: string; at: Date } | null;
}

export interface OpsReviewDoc {
  _id: ObjectId;
  referralId: ObjectId;
  /** The submitted referral as it was reviewed; never overwritten by a correction (section 8). */
  snapshot: ReferralInput;
  snapshotAt: Date;
  validatorRan: Date | null;
  aiRan: Date | null;
  findings: OpsFindingDoc[];
  /** Corrections a person accepted, kept apart from the submitted values. */
  verified: { field: string; value: string; source: string; by: string; at: Date }[];
}

/* ------------------------------------------------------------------ Module 09 */

export interface ReportEvent {
  at: Date;
  by: string;
  action: string;
}

/** A saved report view: a catalogue report with filters, or a builder definition. */
export interface ReportViewDoc {
  /** Shared demo history created by reports-demo.ts; removable in one query. */
  demo?: boolean;
  _id: ObjectId;
  name: string;
  description: string;
  ownerId: ObjectId;
  ownerName: string;
  /** The owner's team when shared with a team (AT-32). */
  team: string | null;
  scope: ShareScope;
  reportId: string | null;
  spec: BuilderSpec | null;
  filters: ReportFilters;
  status: "Active" | "Archived";
  version: number;
  history: ReportEvent[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ReportRunRecord {
  id: string;
  at: Date;
  outcome: "Queued" | "Processing" | "Delivered" | "Failed" | "Cancelled";
  detail: string;
  exportId: ObjectId | null;
  delivered: string[];
  excluded: string[];
  attempt: number;
  /** Queued, Processing, then the outcome, each with its time (section 7). */
  steps?: { state: string; at: Date }[];
}

export interface ReportScheduleDoc {
  demo?: boolean;
  _id: ObjectId;
  ref: string;
  name: string;
  reportId: string;
  viewId: ObjectId | null;
  /** A relative date range, re-evaluated at each run. */
  preset: string;
  filters: Partial<ReportFilters>;
  frequency: "One-time" | "Daily" | "Weekly" | "Monthly";
  weekday: number | null;
  monthDay: number | "Last business day" | null;
  oneTimeDate: string | null;
  time: string;
  timezone: "Australia/Brisbane";
  recipients: { kind: "self" | "user" | "group"; id: string; name: string }[];
  delivery: "In-app" | "Email link";
  format: "CSV" | "XLSX" | "PDF summary";
  contents: "Summary only" | "Aggregate with chart data" | "Permitted detail rows";
  status: "Draft" | "Active" | "Paused" | "Failed" | "Archived";
  ownerId: ObjectId;
  ownerName: string;
  nextRun: Date | null;
  runs: ReportRunRecord[];
  history: ReportEvent[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ReportExportDoc {
  demo?: boolean;
  _id: ObjectId;
  ref: string;
  /** Same person, same request, within two minutes: one export (AT-35). */
  idemKey: string;
  reportId: string;
  title: string;
  domain: string;
  ownerId: ObjectId;
  ownerName: string;
  format: "CSV" | "XLSX" | "PDF summary";
  contents: "Summary only" | "Aggregate with chart data" | "Permitted detail rows";
  filters: ReportFilters;
  summary: string[];
  unit: string;
  basis: string;
  columns: { key: string; label: string; kind: string }[];
  rows: Record<string, string | number | null>[];
  metrics: { label: string; value: string; unit: string }[];
  generatedAt: Date;
  freshness: Date;
  expiresAt: Date;
  status: "Ready" | "Revoked" | "Expired" | "Failed";
  revoked: { by: string; at: Date; reason: string } | null;
  recipientIds: ObjectId[];
  scheduleId: ObjectId | null;
  downloads: { by: string; at: Date; format: string; outcome: string }[];
}

export interface ReportInsightDoc {
  /** type:period, so one insight per type and period; a dismissal sticks (AT-39). */
  _id: string;
  type: string;
  title: string;
  category: string;
  severity: "Info" | "Review" | "Urgent Operational";
  period: string;
  source: string;
  evidenceCount: number;
  evidence: { label: string; value: string }[];
  threshold: string;
  rule: string;
  suggestion: string;
  href: string;
  generatedAt: Date;
  owner: string;
  status: "New" | "Reviewed" | "Acknowledged" | "Dismissed";
  evidenceHash: string;
  taskId: ObjectId | null;
  ai: { text: string; at: Date; by: string } | null;
  history: ReportEvent[];
}
