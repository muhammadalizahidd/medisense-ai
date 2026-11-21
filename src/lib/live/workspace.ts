import { z } from "zod";
import type { Discipline } from "./catalogue";
import type { AppointmentDto } from "./types";

/**
 * Module 10, the therapist workspace: the clinician's own day in one place. Shared by the server
 * and the screens. Every figure is counted from the therapist's own records.
 */

export const deliveryModes = [
  "Home",
  "School",
  "Daycare",
  "Day Program",
  "Community",
  "Telehealth",
  "Other",
] as const;
export type DeliveryMode = (typeof deliveryModes)[number];

export const locationReadiness = [
  "Ready",
  "Needs Contact",
  "Address Unconfirmed",
  "Safety Review Required",
  "Not Applicable",
] as const;
export type LocationReadiness = (typeof locationReadiness)[number];

export const consentReadiness = [
  "Complete",
  "Outstanding",
  "Not Applicable",
  "Needs Review",
] as const;
export type ConsentReadiness = (typeof consentReadiness)[number];

export const docStatuses = [
  "Not Started",
  "Draft",
  "Ready for Signature",
  "Signed",
  "Amendment Required",
] as const;
export type DocStatus = (typeof docStatuses)[number];

export const wsAssessmentStatuses = [
  "Not Started",
  "In Progress",
  "Paused",
  "Awaiting Review",
  "Finalised",
  "Amended",
  "Cancelled",
] as const;
export type WsAssessmentStatus = (typeof wsAssessmentStatuses)[number];

export const wsTaskStatuses = [
  "Open",
  "In Progress",
  "Blocked",
  "Waiting",
  "Completed",
  "Cancelled",
] as const;
export type WsTaskStatus = (typeof wsTaskStatuses)[number];

export const wsPriorities = ["Critical", "High", "Medium", "Low"] as const;
export type WsPriority = (typeof wsPriorities)[number];

export type WsVisit = AppointmentDto & {
  ref: string;
  purpose: string;
  mode: DeliveryMode;
  location: string;
  travelMinutes: number | null;
  readiness: LocationReadiness;
  consent: ConsentReadiness;
  /** Why a Start Visit is blocked, and what to do about it (AT-24). Empty when it can start. */
  blockers: { reason: string; remedy: string }[];
  /** True when the visit has a precaution; the detail stays in the patient record. */
  safetyFlag: boolean;
  site: {
    contact: string;
    phone: string;
    room: string;
    access: string;
    permission: boolean | null;
  } | null;
  recordingConsent: "Given" | "Not given" | null;
  conflictWith: string[];
  needId: string | null;
  scenario: string | null;
};

export type WsAssessment = {
  id: string;
  clientId: string;
  clientName: string;
  support: string;
  kind: string;
  status: WsAssessmentStatus;
  startedAt: string;
  lastSavedAt: string;
  done: number;
  total: number;
  lastSection: string | null;
  missing: string[];
  nextVisit: string | null;
};

export type WsNote = {
  visitId: string;
  ref: string;
  clientName: string;
  discipline: Discipline;
  visitAt: string;
  status: DocStatus;
  ageHours: number;
  aiDrafted: boolean;
  /** The visit itself, so the note opens in place; null for an assessment amendment. */
  visit: AppointmentDto | null;
};

export type WsTask = {
  id: string;
  ref: string;
  title: string;
  category: string;
  status: WsTaskStatus;
  priority: WsPriority;
  dueAt: string;
  overdue: boolean;
  owner: string;
  participant: string | null;
  delegated: boolean;
  lastActivity: string;
  lastAction: string;
};

export type WsAlert = {
  key: string;
  kind:
    | "Risk review"
    | "Overdue follow-up"
    | "Expiring authorisation"
    | "Missing consent"
    | "Recording restriction"
    | "Schedule conflict"
    | "Overdue notes";
  severity: "High" | "Medium" | "Review";
  title: string;
  detail: string;
  href: string;
  acknowledged: { at: string } | null;
};

export type WsClient = {
  id: string;
  name: string;
  mrn: string;
  age: string;
  suburb: string;
  episodes: { needId: string; support: string; frequency: string; location: string }[];
  nextVisit: string | null;
  lastVisit: string | null;
  safetyFlag: boolean;
  conversationId: string | null;
};

export type WsBriefPoint = {
  text: string;
  source: string;
  sourceLabel: string | null;
  href: string | null;
  verified: boolean;
  decision: "Accepted" | "Rejected" | "Needs clarification" | null;
};

export type WsBrief = {
  id: string;
  generatedAt: string;
  summary: string;
  points: WsBriefPoint[];
  actions: WsBriefPoint[];
  limitations: string;
};

export type WsBlock = {
  day: string;
  kind: "Visit" | "Telehealth" | "Travel" | "Documentation" | "Leave";
  start: string;
  end: string;
  label: string;
  visitId: string | null;
};

export type WorkspaceDto = {
  therapist: {
    name: string;
    discipline: Discipline;
    region: string;
    capacity: number;
    sessionMinutes: number;
    supervisor: string | null;
  };
  now: string;
  today: string;
  visits: WsVisit[];
  blocks: WsBlock[];
  assessments: WsAssessment[];
  notes: WsNote[];
  tasks: WsTask[];
  alerts: WsAlert[];
  clients: WsClient[];
  supervision: {
    id: string;
    clientName: string;
    support: string;
    requestedAt: string;
    status: "Awaiting response" | "Commented";
    comment: string | null;
    reviewer: string | null;
  }[];
  reports: {
    id: string;
    kind: "Plan review" | "Assessment report";
    clientName: string;
    requestedBy: string;
    due: string;
    progress: number;
    href: string;
  }[];
  telehealth: {
    visitId: string;
    ref: string;
    clientName: string;
    start: string;
    readiness: "Ready" | "Device check needed" | "Consent outstanding" | "Waiting room open";
    link: "Sent" | "Not sent";
    recording: "Consented" | "Not consented";
  }[];
  capacity: {
    activeClients: number;
    activeEpisodes: number;
    contactHours: number;
    travelHours: number;
    documentationHours: number;
    leaveHours: number;
    availableHours: number;
  };
  brief: WsBrief | null;
  recipients: { id: string; name: string; role: string }[];
  prefs: WorkspacePrefs;
};

/** Personal work settings (section 3). They never change organisational clinical policy. */
export const workspacePrefsSchema = z.object({
  defaultView: z.enum(["Day", "Week", "List"]),
  showAi: z.boolean(),
  includeCancelled: z.boolean(),
  notify: z.object({
    appointmentChanges: z.boolean(),
    assessmentsDue: z.boolean(),
    supervisorComments: z.boolean(),
    taskAssigned: z.boolean(),
  }),
  /** Lock-screen and device notifications never carry clinical detail; this hides names too. */
  hideNamesOnDevice: z.boolean(),
  largeText: z.boolean(),
});
export type WorkspacePrefs = z.infer<typeof workspacePrefsSchema>;

export const defaultPrefs: WorkspacePrefs = {
  defaultView: "Day",
  showAi: true,
  includeCancelled: false,
  notify: {
    appointmentChanges: true,
    assessmentsDue: true,
    supervisorComments: true,
    taskAssigned: true,
  },
  hideNamesOnDevice: true,
  largeText: false,
};

export const workspaceActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("acknowledge"), key: z.string().min(1).max(200) }),
  z.object({ type: z.literal("brief") }),
  z.object({
    type: z.literal("review-suggestion"),
    briefId: z.string().min(1),
    list: z.enum(["points", "actions"]),
    index: z.number().int().min(0).max(40),
    decision: z.enum(["Accepted", "Rejected", "Needs clarification"]),
  }),
  z.object({
    type: z.literal("follow-up"),
    visitId: z.string().min(1),
    reason: z.string().trim().min(3, "Give the reason").max(400),
    dueAt: z.iso.datetime(),
  }),
  z.object({
    type: z.literal("supervisor-review"),
    visitId: z.string().nullable(),
    assessmentId: z.string().nullable(),
    note: z.string().trim().min(3, "Say what you'd like reviewed").max(600),
  }),
  z.object({
    type: z.literal("message"),
    recipientId: z.string().min(1, "Choose who to send it to"),
    clientId: z.string().nullable(),
    sensitivity: z.enum(["Routine", "Clinical Restricted"]),
    text: z.string().trim().min(3, "Write the message").max(2000),
  }),
  z.object({
    type: z.literal("safety"),
    visitId: z.string().nullable(),
    what: z.string().trim().min(5, "Describe what happened").max(2000),
    immediateDanger: z.boolean(),
  }),
  z.object({ type: z.literal("prefs"), prefs: workspacePrefsSchema }),
]);
export type WorkspaceAction = z.infer<typeof workspaceActionSchema>;

/** Task priorities in the module's words; the operations hub keeps its own scale. */
export const priorityLabel: Record<string, WsPriority> = {
  Urgent: "Critical",
  High: "High",
  Normal: "Medium",
  Low: "Low",
};

export const taskStatusLabel: Record<string, WsTaskStatus> = {
  New: "Open",
  Assigned: "Open",
  "In Progress": "In Progress",
  "Waiting for Patient": "Waiting",
  "Waiting for Staff": "Waiting",
  "On Hold": "Blocked",
  Escalated: "Blocked",
  Completed: "Completed",
  Cancelled: "Cancelled",
};
