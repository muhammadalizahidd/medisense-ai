import { z } from "zod";

/**
 * Module 08: operations and workflow automation. Shared by the server, the hub and the task
 * screens. Rules do the deterministic steps; AI only summarises, extracts and suggests, and a
 * person approves anything clinical, financial or sent outside the organisation.
 */

/* ------------------------------------------------------------------ field dictionary (section 4) */

export const taskCategories = [
  "Referral",
  "Clinical Review",
  "Funding",
  "Scheduling",
  "Visit",
  "Telehealth",
  "Consent",
  "Documentation",
  "Billing",
  "Care Coordination",
  "Incident",
  "Other",
] as const;
export type TaskCategory = (typeof taskCategories)[number];

export const taskStatuses = [
  "New",
  "Assigned",
  "In Progress",
  "Waiting for Patient",
  "Waiting for Staff",
  "On Hold",
  "Completed",
  "Cancelled",
  "Escalated",
] as const;
export type TaskStatus = (typeof taskStatuses)[number];

export const priorities = ["Low", "Normal", "High", "Urgent"] as const;
export type TaskPriority = (typeof priorities)[number];

export const teams = ["Intake", "Scheduling", "Clinical", "Finance", "Operations"] as const;
export type Team = (typeof teams)[number];

export const entityKinds = [
  "Referral",
  "Participant",
  "Service Request",
  "Appointment",
  "Assessment",
  "Session",
  "Invoice",
  "Document",
  "Incident",
  "Funding Plan",
  "Rule",
] as const;
export type EntityKind = (typeof entityKinds)[number];

export const slaClasses = ["Standard", "Expedited", "Clinical Escalation", "Custom"] as const;
export type SlaClass = (typeof slaClasses)[number];
/** Business hours allowed before a task counts as overdue, by SLA classification. */
export const slaHours: Record<SlaClass, number> = {
  Standard: 24,
  Expedited: 8,
  "Clinical Escalation": 4,
  Custom: 24,
};

export const visibilities = ["Internal", "Team Only", "Clinical Restricted"] as const;
export type Visibility = (typeof visibilities)[number];

export const automationSources = ["Manual", "Rule", "AI Proposed", "External Event"] as const;
export type AutomationSource = (typeof automationSources)[number];

export const resolutionCodes = [
  "Completed",
  "Not Applicable",
  "Duplicate",
  "Withdrawn",
  "Could Not Complete",
  "Other",
] as const;
export type ResolutionCode = (typeof resolutionCodes)[number];

/* ------------------------------------------------------------------ transitions (section 5) */

export const taskMoves: Record<TaskStatus, readonly TaskStatus[]> = {
  New: ["Assigned", "On Hold", "Cancelled", "Escalated"],
  Assigned: ["In Progress", "Waiting for Staff", "Waiting for Patient", "On Hold", "Escalated"],
  "In Progress": ["Waiting for Staff", "Waiting for Patient", "Completed", "On Hold", "Escalated"],
  "Waiting for Patient": ["Assigned", "In Progress", "Cancelled", "Escalated"],
  "Waiting for Staff": ["Assigned", "In Progress", "On Hold", "Escalated"],
  "On Hold": ["Assigned", "In Progress", "Cancelled", "Escalated"],
  Escalated: ["Assigned", "In Progress", "Completed", "Cancelled"],
  Completed: [],
  Cancelled: [],
};
export const canMoveTask = (from: TaskStatus, to: TaskStatus) => taskMoves[from].includes(to);
export const isClosed = (s: TaskStatus) => s === "Completed" || s === "Cancelled";
export const isOpen = (s: TaskStatus) => !isClosed(s);
/** Waiting on someone outside the team, so the SLA clock and escalation pause. */
export const isPaused = (s: TaskStatus) => s === "Waiting for Patient" || s === "On Hold";

/* ------------------------------------------------------------------ rules (sections 6 and 7) */

export const ruleStatuses = ["Draft", "Active", "Paused", "Archived"] as const;
export type RuleStatus = (typeof ruleStatuses)[number];

export const triggerEvents = [
  "ReferralSubmitted",
  "ReferralUpdated",
  "DocumentUploaded",
  "FundingDue",
  "CaseReadyToAssign",
  "AppointmentCreated",
  "AppointmentChanged",
  "SessionCompleted",
  "NoteUnsigned",
  "AssessmentOverdue",
  "ServiceVerified",
  "ReportDue",
  "TaskOverdue",
  "RecordingReady",
] as const;
export type TriggerEvent = (typeof triggerEvents)[number];

export const ruleScopes = ["Organisation", "Service", "Discipline", "Location", "Team"] as const;
export type RuleScope = (typeof ruleScopes)[number];

export const operators = [
  "equals",
  "not equals",
  "in",
  "not in",
  "exists",
  "missing",
  "date before",
  "date after",
  "count greater than",
] as const;
export type Operator = (typeof operators)[number];

export const actionTypes = [
  "Create Task",
  "Assign Task",
  "Suggest Therapist",
  "Auto-Assign Eligible Therapist",
  "Request Information",
  "Draft Message",
  "Send Approved Reminder",
  "Add Alert",
  "Escalate",
  "Set Administrative Status",
] as const;
export type ActionType = (typeof actionTypes)[number];

export const actionOwners = [
  "User",
  "Team",
  "Current Assignee",
  "Referral Owner",
  "Qualified Reviewer",
] as const;
export type ActionOwner = (typeof actionOwners)[number];

export const runModes = ["Simulation", "Suggest Only", "Execute Allowed Actions"] as const;
export type RunMode = (typeof runModes)[number];

export const approvalRequirements = [
  "Never",
  "Every Run",
  "Conditions Met",
  "First N Runs",
] as const;
export type ApprovalRequirement = (typeof approvalRequirements)[number];

export const duplicatePolicies = [
  "Skip Existing",
  "Update Existing",
  "Create Additional with reason",
] as const;
export type DuplicatePolicy = (typeof duplicatePolicies)[number];

export const delayKinds = [
  "Immediately",
  "Minutes",
  "Hours",
  "Business days",
  "Before due date",
] as const;
export type DelayKind = (typeof delayKinds)[number];

/** Fields a condition can test, by the record the trigger is about. Clinical narrative is excluded. */
export const conditionFields = [
  { id: "referral.status", label: "Referral status", sensitive: false },
  { id: "referral.funding", label: "Funding source", sensitive: false },
  { id: "referral.location", label: "Service location", sensitive: false },
  { id: "referral.supports", label: "Requested supports", sensitive: false },
  { id: "referral.gaps", label: "Missing items", sensitive: false },
  { id: "referral.documents", label: "Documents attached", sensitive: false },
  { id: "referral.knownRisk", label: "Known risk (Yes, No, Unknown)", sensitive: false },
  { id: "referral.riskDetails", label: "Risk details (narrative)", sensitive: true },
  { id: "referral.diagnosis", label: "Diagnosis (narrative)", sensitive: true },
  { id: "plan.end", label: "Plan end date", sensitive: false },
  { id: "appointment.start", label: "Appointment start", sensitive: false },
  { id: "appointment.modality", label: "Appointment modality", sensitive: false },
  { id: "appointment.status", label: "Appointment status", sensitive: false },
  { id: "note.status", label: "Session note status", sensitive: false },
  { id: "note.text", label: "Session note text", sensitive: true },
  { id: "consent.contact", label: "Contact consent", sensitive: false },
  { id: "consent.recording", label: "Recording consent", sensitive: false },
  { id: "task.status", label: "Task status", sensitive: false },
  { id: "task.dueAt", label: "Task due", sensitive: false },
  { id: "billable.status", label: "Billable line status", sensitive: false },
] as const;
export type ConditionField = (typeof conditionFields)[number]["id"];
export const isSensitiveField = (id: string) =>
  conditionFields.some((f) => f.id === id && f.sensitive);

export const conditionSchema = z.object({
  field: z.enum(conditionFields.map((f) => f.id) as [ConditionField, ...ConditionField[]]),
  op: z.enum(operators),
  value: z.string().trim().max(200),
});
export type ConditionInput = z.infer<typeof conditionSchema>;

export const ruleInputSchema = z.object({
  name: z.string().trim().min(3, "Give the rule a name").max(120),
  description: z.string().trim().min(5, "Describe what the rule does").max(600),
  trigger: z.enum(triggerEvents),
  scope: z.enum(ruleScopes),
  scopeValue: z.string().trim().max(80),
  join: z.enum(["AND", "OR"]),
  conditions: z.array(conditionSchema).max(8),
  action: z.enum(actionTypes),
  owner: z.enum(actionOwners),
  team: z.enum(teams),
  delayKind: z.enum(delayKinds),
  delayValue: z.number().int().min(0).max(720),
  escalateAfterHours: z.number().int().min(0).max(720),
  escalateTo: z.enum(teams),
  exclusions: z.string().trim().max(300),
  runMode: z.enum(runModes),
  approval: z.enum(approvalRequirements),
  approvalRuns: z.number().int().min(0).max(50),
  duplicatePolicy: z.enum(duplicatePolicies),
  quietStart: z.string().regex(/^\d{2}:\d{2}$/),
  quietEnd: z.string().regex(/^\d{2}:\d{2}$/),
  messageTemplate: z.string().trim().max(60),
  messageChannel: z.string().trim().max(30),
  changeReason: z.string().trim().min(3, "Say why the rule is changing").max(300),
});
export type RuleInput = z.infer<typeof ruleInputSchema>;

/**
 * Combinations that could put clinical detail where it shouldn't be (OP-028): a narrative field
 * feeding a message, or a clinical status change. Empty when the rule is safe to save.
 */
export function unsafeRule(r: Pick<RuleInput, "conditions" | "action" | "messageChannel">) {
  const out: string[] = [];
  const narrative = r.conditions.filter((c) => isSensitiveField(c.field));
  const messaging = ["Draft Message", "Send Approved Reminder", "Request Information"].includes(
    r.action,
  );
  if (narrative.length && messaging) {
    out.push(
      `A message can't be triggered from ${narrative
        .map((c) => conditionFields.find((f) => f.id === c.field)?.label ?? c.field)
        .join(", ")}: it could disclose clinical detail. Use the structured field instead.`,
    );
  }
  if (narrative.length && r.action === "Auto-Assign Eligible Therapist") {
    out.push("Auto-assignment can't depend on clinical narrative: route to a Clinical Lead.");
  }
  if (
    r.action === "Auto-Assign Eligible Therapist" &&
    r.conditions.some((c) => c.field === "referral.knownRisk" && c.value !== "No")
  ) {
    out.push("Auto-assignment stops at any risk flag. Only Known risk = No can auto-assign.");
  }
  if (messaging && r.messageChannel === "SMS" && narrative.length) {
    out.push("SMS can carry only a minimal notice, never clinical narrative.");
  }
  return out;
}

/* ------------------------------------------------------------------ notifications (section 10) */

export const recipientTypes = [
  "Patient",
  "Guardian",
  "Support Coordinator",
  "Assigned Therapist",
  "Team",
  "Finance",
] as const;
export type RecipientType = (typeof recipientTypes)[number];

export const channels = ["In-App", "Email", "SMS", "Secure Link"] as const;
export type Channel = (typeof channels)[number];

export const messageStates = [
  "Draft",
  "Awaiting Approval",
  "Queued",
  "Sent",
  "Delivered",
  "Failed",
  "Suppressed",
] as const;
export type MessageState = (typeof messageStates)[number];

export type TemplateDef = {
  id: string;
  category: string;
  version: number;
  channel: Channel;
  subject: string;
  body: string;
  /** True when the template is approved for automatic sending. */
  approved: boolean;
};

/** Plain-language templates. None carries clinical narrative (OP-036). */
export const templates: TemplateDef[] = [
  {
    id: "TPL-REF-RECEIVED",
    category: "Referral Received",
    version: 3,
    channel: "Email",
    subject: "We've received your referral {{referral_number}}",
    body: "Hi {{preferred_name}}, thanks for your referral {{referral_number}}. Our intake team will be in touch within two business days.",
    approved: true,
  },
  {
    id: "TPL-MISSING-INFO",
    category: "Missing Information",
    version: 2,
    channel: "Secure Link",
    subject: "A few details for referral {{referral_number}}",
    body: "Hi {{preferred_name}}, we need a little more information to continue referral {{referral_number}}. Please use the secure link to reply or upload documents.",
    approved: true,
  },
  {
    id: "TPL-BOOKING",
    category: "Booking",
    version: 4,
    channel: "SMS",
    subject: "Appointment reminder",
    body: "Hi {{preferred_name}}, a reminder of your Medisense appointment on {{appointment_date}} at {{appointment_time}} ({{location_type}}). Reply via the secure link to change it.",
    approved: true,
  },
  {
    id: "TPL-RESCHEDULE",
    category: "Rescheduling",
    version: 2,
    channel: "Email",
    subject: "Your appointment has moved",
    body: "Hi {{preferred_name}}, your appointment has moved to {{appointment_date}} at {{appointment_time}}. Contact us through the secure link if this doesn't suit.",
    approved: true,
  },
  {
    id: "TPL-CANCEL",
    category: "Cancellation",
    version: 1,
    channel: "Email",
    subject: "Appointment cancelled",
    body: "Hi {{preferred_name}}, your appointment on {{appointment_date}} has been cancelled. We'll contact you to rebook.",
    approved: true,
  },
  {
    id: "TPL-VISIT",
    category: "Visit Instructions",
    version: 2,
    channel: "Email",
    subject: "Preparing for your visit",
    body: "Hi {{preferred_name}}, your therapist will visit on {{appointment_date}} at {{appointment_time}}. Please make sure someone can let them in and that pets are secured.",
    approved: true,
  },
  {
    id: "TPL-TELEHEALTH",
    category: "Telehealth",
    version: 3,
    channel: "Secure Link",
    subject: "Get ready for your video appointment",
    body: "Hi {{preferred_name}}, your video appointment is on {{appointment_date}} at {{appointment_time}}. Please open the secure link to check your camera and microphone and give consent.",
    approved: true,
  },
  {
    id: "TPL-DOC-REQUIRED",
    category: "Document Required",
    version: 1,
    channel: "Secure Link",
    subject: "Document needed for {{referral_number}}",
    body: "Hi {{preferred_name}}, please upload your current plan document through the secure link so we can continue referral {{referral_number}}.",
    approved: true,
  },
  {
    id: "TPL-FUNDING",
    category: "Funding Alert",
    version: 1,
    channel: "In-App",
    subject: "Funding review needed",
    body: "Funding for {{preferred_name}} needs review before {{appointment_date}}.",
    approved: true,
  },
  {
    id: "TPL-STAFF-TASK",
    category: "Staff Task",
    version: 1,
    channel: "In-App",
    subject: "New task assigned",
    body: "A task has been assigned to you: {{task_title}}.",
    approved: true,
  },
  {
    id: "TPL-REPORT",
    category: "Report Ready",
    version: 1,
    channel: "Email",
    subject: "Your report is ready",
    body: "Hi {{preferred_name}}, your report is ready. Sign in to the patient app to view the approved version.",
    approved: false,
  },
];
export const templateVariables = [
  "preferred_name",
  "referral_number",
  "appointment_date",
  "appointment_time",
  "channel",
  "location_type",
  "task_title",
] as const;

/** Words that suggest clinical narrative in a message (OP-036, section 14). */
const sensitiveWords =
  /\b(diagnos\w*|risk|self[- ]harm|suicid\w*|trauma|abuse|behaviour\w*|psycholog\w*|medication|incident)\b/i;
export const hasSensitiveText = (text: string) => sensitiveWords.test(text);

/** Fills a template's variables; missing ones are reported, never guessed (OP-034). */
export function renderTemplate(body: string, vars: Partial<Record<string, string>>) {
  const missing: string[] = [];
  const text = body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = vars[key];
    if (!v) {
      if (!missing.includes(key)) missing.push(key);
      return `[${key.replace(/_/g, " ")}]`;
    }
    return v;
  });
  return { text, missing };
}

/* ------------------------------------------------------------------ approvals (section 11) */

export const approvalWorkflows = [
  "Clinical-risk referral",
  "Funding exception",
  "Therapist assignment exception",
  "Unusual travel / booking exception",
  "Sensitive document distribution",
  "Telehealth recording review",
  "Billing adjustment",
  "Workflow rule activation",
] as const;
export type ApprovalWorkflow = (typeof approvalWorkflows)[number];
export const approverFor: Record<ApprovalWorkflow, string> = {
  "Clinical-risk referral": "Clinical Lead",
  "Funding exception": "Finance reviewer",
  "Therapist assignment exception": "Clinical Lead and Scheduler",
  "Unusual travel / booking exception": "Operations Manager",
  "Sensitive document distribution": "Authorised record owner",
  "Telehealth recording review": "Record custodian",
  "Billing adjustment": "Finance Manager",
  "Workflow rule activation": "Operations Manager",
};
export const approvalCriteria: Record<ApprovalWorkflow, string> = {
  "Clinical-risk referral": "Decision and documented rationale",
  "Funding exception": "Verified payer or recorded alternate arrangement",
  "Therapist assignment exception": "Eligible practitioner and case suitability",
  "Unusual travel / booking exception": "Confirmed arrangements and responsible party",
  "Sensitive document distribution": "Correct identity, authority and document clearance",
  "Telehealth recording review": "Consent valid, purpose authorised, access logged",
  "Billing adjustment": "Adjustment reason and authorisation",
  "Workflow rule activation": "Simulation reviewed, scope clear, version activated",
};
export const approvalStatuses = ["Pending", "Approved", "Rejected", "Changes requested"] as const;
export type ApprovalStatus = (typeof approvalStatuses)[number];

/* ------------------------------------------------------------------ AI referral review (section 8) */

export const findingCategories = [
  "Missing",
  "Inconsistent",
  "Duplicate Candidate",
  "Risk Flag",
  "Document Extraction",
  "Recommendation",
] as const;
export type FindingCategory = (typeof findingCategories)[number];
export const findingSeverities = [
  "Informational",
  "Action Needed",
  "Clinical Review Required",
] as const;
export type FindingSeverity = (typeof findingSeverities)[number];
export const confidences = ["Low", "Medium", "High"] as const;
export type Confidence = (typeof confidences)[number];
export const findingDecisions = [
  "Accept",
  "Correct",
  "Reject",
  "Request Clarification",
  "Escalate",
] as const;
export type FindingDecision = (typeof findingDecisions)[number];
export const findingResolutions = ["Open", "Resolved", "Rejected", "Deferred"] as const;
export type FindingResolution = (typeof findingResolutions)[number];

/* ------------------------------------------------------------------ queue (section 12) */

export const queueTabs = [
  "All",
  "Mine",
  "Unassigned",
  "Due Today",
  "Overdue",
  "Awaiting Patient",
  "Escalated",
  "Completed",
] as const;
export type QueueTab = (typeof queueTabs)[number];
export const sorts = [
  "Due Soonest",
  "Oldest First",
  "Highest Priority",
  "Created Newest",
  "Most Recently Updated",
] as const;
export type QueueSort = (typeof sorts)[number];
export const bulkActions = [
  "Assign to team",
  "Apply tag",
  "Acknowledge",
  "Send approved reminder",
  "Close as duplicate",
] as const;
export type BulkAction = (typeof bulkActions)[number];
/** Never in a bulk action (OP-011). */
export const bulkExcludedCategories: TaskCategory[] = ["Clinical Review", "Consent", "Incident"];

export const priorityRank: Record<TaskPriority, number> = { Urgent: 0, High: 1, Normal: 2, Low: 3 };

/* ------------------------------------------------------------------ DTOs */

export type OpsCan = {
  manager: boolean;
  clinical: boolean;
  intake: boolean;
  scheduler: boolean;
  finance: boolean;
  recordings: boolean;
  roleLabel: string;
  teams: Team[];
};

export type TaskHistoryDto = { at: string; by: string; action: string };

export type TaskDto = {
  id: string;
  ref: string;
  title: string;
  category: TaskCategory;
  status: TaskStatus;
  priority: TaskPriority;
  urgentReason: string;
  team: Team;
  assigneeId: string | null;
  assigneeName: string | null;
  related: { kind: EntityKind; ref: string; label: string; href: string | null };
  participant: string | null;
  service: string | null;
  discipline: string | null;
  locationType: string | null;
  createdAt: string;
  updatedAt: string;
  dueAt: string;
  sla: SlaClass;
  visibility: Visibility;
  source: AutomationSource;
  ruleCode: string | null;
  ruleVersion: number | null;
  checklist: {
    id: string;
    label: string;
    required: boolean;
    done: boolean;
    by: string | null;
    at: string | null;
  }[];
  notes: { id: string; text: string; by: string; at: string; edited: boolean }[];
  attachments: { name: string; size: number; type: string; restricted: boolean }[];
  history: TaskHistoryDto[];
  resolution: { code: ResolutionCode; note: string; by: string; at: string } | null;
  holdReason: string;
  escalation: { owner: string; reason: string; at: string; outcome: string } | null;
  acknowledged: { by: string; at: string } | null;
  tags: string[];
  version: number;
  overdue: boolean;
  dueToday: boolean;
  /** Present only for people allowed to see it (OP-047). */
  restrictedNote: string | null;
  restrictedHidden: boolean;
  /** Present only for people with recording access (OP-048). */
  recordingHref: string | null;
  recordingHidden: boolean;
  suggestion: boolean;
  scenario: string | null;
};

export type RuleVersionDto = { version: number; by: string; reason: string; at: string };

export type RuleDto = RuleInput & {
  id: string;
  code: string;
  status: RuleStatus;
  version: number;
  versions: RuleVersionDto[];
  owner: ActionOwner;
  defaultOwnerLabel: string;
  check: string;
  proposedAction: string;
  runs: number;
  created: number;
  errors: number;
  lastRun: string | null;
  pendingApproval: boolean;
  builtIn: boolean;
};

export type RunDto = {
  id: string;
  ref: string;
  ruleCode: string;
  ruleName: string;
  ruleVersion: number;
  trigger: string;
  entity: string;
  input: string;
  actions: string[];
  outcome:
    | "Task created"
    | "Updated existing"
    | "Duplicate skipped"
    | "Suppressed"
    | "Blocked"
    | "Error"
    | "Suggested"
    | "Simulated"
    | "Message queued"
    | "Escalated"
    | "Closed";
  detail: string;
  mode: RunMode;
  retries: number;
  resolved: boolean;
  at: string;
};

export type ApprovalDto = {
  id: string;
  ref: string;
  workflow: ApprovalWorkflow;
  title: string;
  reason: string;
  initiator: string;
  approver: string;
  criteria: string;
  status: ApprovalStatus;
  slaHours: number;
  dueAt: string;
  overdue: boolean;
  related: { label: string; href: string | null };
  taskId: string | null;
  comments: { by: string; text: string; at: string }[];
  decisions: { by: string; decision: string; note: string; at: string }[];
  canDecide: boolean;
  restricted: boolean;
  createdAt: string;
};

export type MessageDto = {
  id: string;
  ref: string;
  template: string;
  templateVersion: number;
  category: string;
  recipientType: RecipientType;
  recipient: string;
  authority: "Verified" | "Missing authority" | "Not required";
  channel: Channel;
  subject: string;
  body: string;
  missing: string[];
  state: MessageState;
  reason: string;
  attempts: number;
  related: { label: string; href: string | null };
  taskId: string | null;
  history: { at: string; state: MessageState; note: string }[];
  createdAt: string;
};

export type FindingDto = {
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
  decision: {
    decision: FindingDecision;
    value: string;
    note: string;
    by: string;
    at: string;
  } | null;
};

export type ReviewDto = {
  referralId: string;
  reference: string;
  participant: string;
  status: string;
  supports: string[];
  submittedAt: string;
  snapshotAt: string;
  validatorRan: string | null;
  aiRan: string | null;
  findings: FindingDto[];
  restricted: boolean;
  ready: boolean;
  blockers: string[];
  href: string;
  documents: { name: string; kind: string }[];
};

export type MatchCaseDto = {
  taskId: string | null;
  clientId: string;
  needId: string;
  participant: string;
  support: string;
  discipline: string;
  location: string;
  region: string;
  waitingDays: number;
  risk: boolean;
  precaution: boolean;
  blockers: string[];
  autoEligible: boolean;
  href: string;
};

export type OpsSettings = {
  workdayStart: string;
  workdayEnd: string;
  timezone: string;
  planWarningDays: number;
  noteThresholdHours: number;
  noteEscalateHours: number;
  assessmentOverdueDays: number;
  reminderCapPerDay: number;
  quietStart: string;
  quietEnd: string;
  retentionDays: number;
  aiReviewEnabled: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
};

export const settingsSchema = z.object({
  workdayStart: z.string().regex(/^\d{2}:\d{2}$/),
  workdayEnd: z.string().regex(/^\d{2}:\d{2}$/),
  planWarningDays: z.number().int().min(1).max(120),
  noteThresholdHours: z.number().int().min(1).max(168),
  noteEscalateHours: z.number().int().min(2).max(336),
  assessmentOverdueDays: z.number().int().min(1).max(90),
  reminderCapPerDay: z.number().int().min(1).max(5),
  quietStart: z.string().regex(/^\d{2}:\d{2}$/),
  quietEnd: z.string().regex(/^\d{2}:\d{2}$/),
  retentionDays: z.number().int().min(30).max(3650),
  aiReviewEnabled: z.boolean(),
});

export type OpsHubDto = {
  today: string;
  now: string;
  can: OpsCan;
  me: { id: string; name: string };
  tasks: TaskDto[];
  rules: RuleDto[];
  runs: RunDto[];
  approvals: ApprovalDto[];
  messages: MessageDto[];
  reviews: ReviewDto[];
  matching: MatchCaseDto[];
  settings: OpsSettings;
  assignmentMode: string;
  staff: { id: string; name: string; teams: Team[] }[];
  hiddenRestricted: number;
  lastScan: string | null;
};

/* ------------------------------------------------------------------ task inputs */

export const taskInputSchema = z
  .object({
    title: z.string().trim().min(5, "The title needs at least 5 characters").max(150),
    category: z.enum(taskCategories),
    priority: z.enum(priorities),
    urgentReason: z.string().trim().max(400),
    team: z.enum(teams),
    assigneeId: z.string().max(40).nullable(),
    relatedKind: z.enum(entityKinds),
    relatedRef: z.string().trim().min(2, "Link the task to a record").max(80),
    dueAt: z.iso.datetime(),
    sla: z.enum(slaClasses),
    visibility: z.enum(visibilities),
    note: z.string().trim().max(10_000),
    checklist: z.array(z.string().trim().min(2).max(160)).max(12),
    allowPastDue: z.boolean().default(false),
  })
  .superRefine((t, ctx) => {
    if (t.priority === "Urgent" && t.urgentReason.length < 5) {
      ctx.addIssue({ code: "custom", path: ["urgentReason"], message: "Say why this is urgent" });
    }
  });
export type TaskInput = z.infer<typeof taskInputSchema>;

/* ------------------------------------------------------------------ client helpers */

export function filterTasks(
  tasks: TaskDto[],
  f: {
    tab: QueueTab;
    me: string;
    search: string;
    category: string;
    status: string;
    priority: string;
    team: string;
    assignee: string;
    service: string;
    discipline: string;
    location: string;
    source: string;
    from: string;
    to: string;
  },
) {
  const q = f.search.trim().toLowerCase();
  return tasks.filter((t) => {
    const tabOk =
      f.tab === "All"
        ? isOpen(t.status)
        : f.tab === "Mine"
          ? t.assigneeId === f.me && isOpen(t.status)
          : f.tab === "Unassigned"
            ? !t.assigneeId && isOpen(t.status)
            : f.tab === "Due Today"
              ? t.dueToday && isOpen(t.status)
              : f.tab === "Overdue"
                ? t.overdue
                : f.tab === "Awaiting Patient"
                  ? t.status === "Waiting for Patient"
                  : f.tab === "Escalated"
                    ? t.status === "Escalated"
                    : isClosed(t.status);
    if (!tabOk) return false;
    if (f.category && t.category !== f.category) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.team && t.team !== f.team) return false;
    if (f.assignee && (t.assigneeName ?? "") !== f.assignee) return false;
    if (f.service && t.service !== f.service) return false;
    if (f.discipline && t.discipline !== f.discipline) return false;
    if (f.location && t.locationType !== f.location) return false;
    if (f.source && t.source !== f.source) return false;
    const day = t.dueAt.slice(0, 10);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    if (q) {
      const hay = [t.ref, t.title, t.related.ref, t.related.label, t.participant ?? ""]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function sortTasks(tasks: TaskDto[], sort: QueueSort) {
  const list = [...tasks];
  const by = {
    "Due Soonest": (a: TaskDto, b: TaskDto) => a.dueAt.localeCompare(b.dueAt),
    "Oldest First": (a: TaskDto, b: TaskDto) => a.createdAt.localeCompare(b.createdAt),
    "Highest Priority": (a: TaskDto, b: TaskDto) =>
      priorityRank[a.priority] - priorityRank[b.priority] || a.dueAt.localeCompare(b.dueAt),
    "Created Newest": (a: TaskDto, b: TaskDto) => b.createdAt.localeCompare(a.createdAt),
    "Most Recently Updated": (a: TaskDto, b: TaskDto) => b.updatedAt.localeCompare(a.updatedAt),
  }[sort];
  return list.sort(by);
}

/** A rate with its denominator, or N/A when there is nothing to divide by (section 15). */
export function rate(numerator: number, denominator: number) {
  if (!denominator) return { label: "N/A", value: null as number | null, of: "0" };
  const value = Math.round((numerator / denominator) * 1000) / 10;
  return { label: `${value}%`, value, of: `${numerator} of ${denominator}` };
}
