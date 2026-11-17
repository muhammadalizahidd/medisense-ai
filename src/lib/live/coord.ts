import { z } from "zod";

/* Module 17: Therapist Tasks & Care Coordination. Shared by the server, the API and the screens. */

export const categories = [
  "Clinical Follow-up",
  "Documentation",
  "Assessment",
  "Care Coordination",
  "Referral",
  "Supervision",
  "Appointment Request",
  "Patient Communication",
  "Administrative Handoff",
  "Safety Review",
  "Other",
] as const;
export type Category = (typeof categories)[number];

export const sources = [
  "Manual",
  "Appointment",
  "Assessment",
  "Treatment Plan",
  "Clinical Note",
  "Report",
  "Referral",
  "Incident",
  "AI Suggestion",
  "Automation",
] as const;
export const priorities = ["Low", "Normal", "High", "Urgent"] as const;
export const statuses = [
  "Draft",
  "Open",
  "In Progress",
  "Waiting on Patient",
  "Waiting on Admin",
  "Waiting on Clinician",
  "Pending Review",
  "Completed",
  "Cancelled",
] as const;
export type Status = (typeof statuses)[number];
export const waiting: Status[] = ["Waiting on Patient", "Waiting on Admin", "Waiting on Clinician"];

/** Allowed transitions (section 5). Completed and Cancelled reopen only with a reason. */
export const transitions: Record<Status, Status[]> = {
  Draft: ["Open", "Cancelled"],
  Open: ["In Progress", ...waiting, "Pending Review", "Completed", "Cancelled"],
  "In Progress": [...waiting, "Pending Review", "Completed", "Cancelled"],
  "Waiting on Patient": ["In Progress", "Pending Review", "Completed", "Cancelled"],
  "Waiting on Admin": ["In Progress", "Pending Review", "Completed", "Cancelled"],
  "Waiting on Clinician": ["In Progress", "Pending Review", "Completed", "Cancelled"],
  "Pending Review": ["In Progress", "Completed"],
  Completed: ["Open"],
  Cancelled: ["Open"],
};

export const visibilities = [
  "Care Team",
  "Assigned Staff Only",
  "Clinical Restricted",
  "Admin Operational Only",
] as const;
export const reminders = ["None", "At Due", "24h Before", "48h Before", "Custom"] as const;
export const escalationReasons = [
  "Safety",
  "Overdue",
  "No response",
  "Scope/Access",
  "Clinical review",
  "Other",
] as const;
export const cancelReasons = [
  "Duplicate",
  "Not required",
  "Patient declined",
  "Moved",
  "Entered in error",
  "Other",
] as const;
export const contactModes = [
  "Phone",
  "Secure Message",
  "In Person",
  "Telehealth",
  "Other",
] as const;
export const handoffTypes = [
  "Funding Query",
  "Invoice Clarification",
  "Transport",
  "Agreement",
  "Form",
  "Other",
] as const;
export const checkStates = ["Not done", "Done", "Not applicable"] as const;
export const locations = [
  "Home",
  "School",
  "Daycare",
  "Day Program",
  "Community",
  "Telehealth",
] as const;

/** Categories whose completion needs an outcome, and those that need a clinical reviewer. */
export const needsOutcome: Category[] = [
  "Clinical Follow-up",
  "Supervision",
  "Safety Review",
  "Referral",
  "Care Coordination",
  "Assessment",
];
export const needsClinicalApproval: Category[] = ["Supervision", "Safety Review"];

export type TaskRow = {
  id: string;
  ref: string;
  title: string;
  category: Category;
  source: string;
  participant: string | null;
  participantId: string;
  discipline: string;
  assignee: string;
  priority: string;
  status: Status;
  dueAt: string | null;
  overdue: boolean;
  visibility: string;
  restricted: boolean;
  suggestion: "pending" | "accepted" | "rejected" | null;
  mine: boolean;
  sync: "Synced" | "Pending sync" | "Conflict";
};

export type TaskFull = TaskRow & {
  view: "edit" | "review" | "status";
  instructions: string;
  sourceLink: { label: string; href: string } | null;
  collaborators: string[];
  reminder: string;
  checklist: { label: string; state: string }[];
  fields: {
    contactMode: string;
    attempts: { at: string; mode: string; outcome: string; next: string; by: string }[];
    recipient: string;
    channel: string;
    consentOk: boolean;
    destination: string;
    purpose: string;
    shareAuthority: boolean;
    documents: { label: string; shareable: boolean }[];
    ack: { by: string; at: string; comment: string } | null;
    handoffType: string;
    location: string;
    window: string;
    frequency: string;
    schedulerResponse: string;
    supervisor: string;
    reviewFeedback: string;
    riskCategory: string;
    immediateAction: string;
    linkedRecordStatus: string;
  };
  outcome: string;
  escalation: { reason: string; to: string; at: string } | null;
  cancelReason: string;
  waitReason: string;
  completed: { by: string; at: string } | null;
  comments: { by: string; at: string; text: string }[];
  history: { at: string; by: string; action: string; reason: string }[];
  aiDraft: { text: string; sources: string[] } | null;
  conflict: { field: string; mobile: string; web: string } | null;
  allowed: Status[];
  assignable: { id: string; name: string; role: string }[];
  canEdit: boolean;
  canReview: boolean;
};

export type CareTeamRow = {
  participant: string;
  participantId: string;
  episodes: { discipline: string; clinician: string; restricted: boolean; goals: number }[];
};

/* ------------------------------------------------------------------ actions */

const t = (n: number) => z.string().trim().max(n);

export const createTaskSchema = z.object({
  title: t(160).min(3, "Write a clear action as the title"),
  category: z.enum(categories),
  clientId: t(40),
  needId: t(60),
  assigneeId: t(40).min(1, "Choose who owns it"),
  priority: z.enum(priorities),
  dueAt: t(40),
  noDue: z.boolean(),
  reminder: z.enum(reminders),
  visibility: z.enum(visibilities),
  instructions: t(4000).min(5, "Write the instructions"),
  checklist: z.array(t(160)).max(12),
  open: z.boolean(),
  urgentDetail: t(400),
});

export const taskActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), to: z.enum(statuses), reason: t(400), outcome: t(1500) }),
  z.object({ type: z.literal("assign"), assigneeId: t(40).min(1), reason: t(300) }),
  z.object({ type: z.literal("priority"), priority: z.enum(priorities) }),
  z.object({
    type: z.literal("checklist"),
    index: z.number().int().min(0).max(20),
    state: z.enum(checkStates),
  }),
  z.object({ type: z.literal("comment"), text: t(1500).min(1) }),
  z.object({
    type: z.literal("attempt"),
    mode: z.enum(contactModes),
    outcome: t(600).min(2),
    next: t(40),
  }),
  z.object({
    type: z.literal("escalate"),
    reason: z.enum(escalationReasons),
    detail: t(600).min(3),
  }),
  z.object({ type: z.literal("cancel"), reason: z.enum(cancelReasons), detail: t(400) }),
  z.object({ type: z.literal("reopen"), reason: t(400).min(5, "Give the reason for reopening") }),
  z.object({
    type: z.literal("handover"),
    documents: z.array(t(120)).max(12),
    shareAuthority: z.boolean(),
    purpose: t(600).min(3),
  }),
  z.object({ type: z.literal("acknowledge"), comment: t(600) }),
  z.object({
    type: z.literal("send-scheduling"),
    location: z.enum(locations),
    window: t(120).min(2),
    frequency: t(80),
  }),
  z.object({
    type: z.literal("scheduler-response"),
    response: z.enum(["Accepted", "Rejected", "Query"]),
    note: t(400),
  }),
  z.object({
    type: z.literal("review"),
    decision: z.enum(["Approve", "Return for changes"]),
    feedback: t(1000),
  }),
  z.object({
    type: z.literal("patient-message"),
    recipient: t(120),
    channel: z.enum(["Secure Message", "SMS", "Email"]),
    text: t(1000).min(5),
  }),
  z.object({
    type: z.literal("suggestion"),
    decision: z.enum(["accept", "reject"]),
    title: t(160),
  }),
  z.object({ type: z.literal("resolve-conflict"), keep: z.enum(["mobile", "web"]) }),
  z.object({ type: z.literal("draft-summary") }),
]);
export type TaskAction = z.infer<typeof taskActionSchema>;

export const statusTone: Record<Status, "healthy" | "watch" | "over" | "available" | "outline"> = {
  Draft: "outline",
  Open: "available",
  "In Progress": "available",
  "Waiting on Patient": "watch",
  "Waiting on Admin": "watch",
  "Waiting on Clinician": "watch",
  "Pending Review": "watch",
  Completed: "healthy",
  Cancelled: "outline",
};
