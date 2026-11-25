/**
 * Every permission an office-staff role can hold, with the default each built-in role starts with.
 * The defaults come from docs/role-permissions-inventory.md. This file has no imports, so the
 * server, the proxy and the screens can all read it.
 */

/** The built-in office-staff roles. The slug is stable; the name can be changed by the Super Admin. */
export const builtInRoles = [
  { slug: "intake-officer", name: "Intake Officer", description: "Referrals and patient intake." },
  { slug: "scheduler", name: "Scheduler", description: "Booking visits and assigning therapists." },
  { slug: "finance", name: "Finance", description: "Funding checks and billing." },
  {
    slug: "finance-manager",
    name: "Finance Manager",
    description: "Finance, plus approvals for charge rules, overrides and adjustments.",
  },
  {
    slug: "operations-manager",
    name: "Operations Manager",
    description: "Workflow rules, task queues and organisation-wide reports.",
  },
  {
    slug: "clinical-lead",
    name: "Clinical Lead",
    description: "Clinical triage, record oversight and credential approval.",
  },
] as const;

export type BuiltInRoleSlug = (typeof builtInRoles)[number]["slug"];

const INT: BuiltInRoleSlug = "intake-officer";
const SCH: BuiltInRoleSlug = "scheduler";
const FIN: BuiltInRoleSlug = "finance";
const FM: BuiltInRoleSlug = "finance-manager";
const OPS: BuiltInRoleSlug = "operations-manager";
const CL: BuiltInRoleSlug = "clinical-lead";
const ALL: BuiltInRoleSlug[] = [INT, SCH, FIN, FM, OPS, CL];

export const permissionGroups = [
  "Roles and apps",
  "Referrals and intake",
  "Scheduling and therapists",
  "Clinical records and oversight",
  "Funding",
  "Finance and billing",
  "Operations and approvals",
  "People and HR",
  "Messages",
  "Reports",
] as const;
export type PermissionGroup = (typeof permissionGroups)[number];

export type PermissionDef = {
  id: string;
  group: PermissionGroup;
  label: string;
  description: string;
  /** "scope" permissions decide whose data someone sees; "action" permissions decide what they can do. */
  kind: "action" | "scope";
  /** The built-in roles that hold it by default. */
  defaults: readonly BuiltInRoleSlug[];
};

const action = (
  id: string,
  group: PermissionGroup,
  label: string,
  description: string,
  defaults: readonly BuiltInRoleSlug[],
): PermissionDef => ({ id, group, label, description, kind: "action", defaults });

const scope = (
  id: string,
  group: PermissionGroup,
  label: string,
  description: string,
  defaults: readonly BuiltInRoleSlug[],
): PermissionDef => ({ id, group, label, description, kind: "scope", defaults });

const RA = "Roles and apps" as const;
const R = "Referrals and intake" as const;
const S = "Scheduling and therapists" as const;
const C = "Clinical records and oversight" as const;
const F = "Funding" as const;
const B = "Finance and billing" as const;
const O = "Operations and approvals" as const;
const H = "People and HR" as const;
const M = "Messages" as const;
const P = "Reports" as const;

/** The report domains, in the order reports list them. Kept in step with `domains` in lib/live/reports. */
export const reportDomains = [
  "Referrals",
  "Participants",
  "Staff",
  "Scheduling",
  "Clinical Operations",
  "Telehealth",
  "Finance",
  "Automation",
  "Audit",
] as const;
export type ReportDomainName = (typeof reportDomains)[number];

/** Who reads each report domain, and who also sees row-level detail, by default. */
export const reportDomainDefaults: Record<
  ReportDomainName,
  { read: readonly BuiltInRoleSlug[]; detail: readonly BuiltInRoleSlug[] }
> = {
  Referrals: { read: [INT, OPS], detail: [INT, OPS] },
  Participants: { read: [INT, OPS, CL], detail: [INT, OPS, CL] },
  Staff: { read: [OPS, CL], detail: [OPS, CL] },
  Scheduling: { read: [SCH, OPS, CL], detail: [SCH, OPS, CL] },
  "Clinical Operations": { read: [OPS, CL], detail: [CL] },
  Telehealth: { read: [SCH, OPS, CL], detail: [SCH, OPS, CL] },
  Finance: { read: [FIN, FM], detail: [FIN, FM] },
  Automation: { read: [OPS], detail: [OPS] },
  Audit: { read: [OPS], detail: [OPS] },
};

export const reportReadId = (domain: ReportDomainName) =>
  `reports.read.${domain.toLowerCase().replace(/\s+/g, "-")}`;
export const reportDetailId = (domain: ReportDomainName) =>
  `reports.detail.${domain.toLowerCase().replace(/\s+/g, "-")}`;

const reportPermissions: PermissionDef[] = reportDomains.flatMap((domain) => [
  scope(
    reportReadId(domain),
    P,
    `Read ${domain} reports`,
    `See aggregate ${domain} figures in reports.`,
    reportDomainDefaults[domain].read,
  ),
  scope(
    reportDetailId(domain),
    P,
    `See ${domain} row-level detail`,
    `Open the individual records behind ${domain} report figures.`,
    reportDomainDefaults[domain].detail,
  ),
]);

export const permissions: readonly PermissionDef[] = [
  // Roles and apps. Built-in roles keep the admin app they have today; the other apps start off.
  action(
    "roles.manage",
    RA,
    "Manage roles",
    "Open the roles tab and switch apps on or off for roles, but only the apps this person holds.",
    [],
  ),
  action(
    "app.admin",
    RA,
    "Admin app",
    "Open the staff app: office screens, reports and settings.",
    ALL,
  ),
  action(
    "app.therapist",
    RA,
    "Therapist app",
    "Open the therapist app: own caseload, sessions and notes.",
    [],
  ),
  action("app.mobile.family", RA, "Mobile: family", "Open the family mobile app.", []),
  action("app.mobile.patient", RA, "Mobile: patient", "Open the patient mobile app.", []),
  action("app.mobile.staff", RA, "Mobile: staff", "Open the staff mobile app.", []),
  action("app.mobile.therapist", RA, "Mobile: therapist", "Open the therapist mobile view.", []),
  // Referrals and intake
  action(
    "referrals.triage",
    R,
    "Make the clinical triage decision",
    "Accept, decline or waitlist a referral that needs clinical review, and record how a reported risk is managed.",
    [CL],
  ),
  action(
    "referrals.process",
    R,
    "Process referrals",
    "Open referrals, verify details, run the AI review and add documents.",
    [INT, CL],
  ),
  action(
    "patient-requests.process",
    R,
    "Handle patient requests and invites",
    "Work patient requests and the patient onboarding board, and invite patients to the app.",
    [INT, SCH, CL],
  ),

  // Scheduling and therapists
  action(
    "schedule.manage",
    S,
    "Manage the schedule",
    "Book, move and cancel visits, quick book, and manage resources.",
    [SCH, OPS],
  ),
  action("schedule.assign", S, "Assign therapists", "Assign a therapist to a patient's need.", [
    SCH,
    OPS,
  ]),
  action(
    "operations.matching",
    S,
    "Assign from the matching queue",
    "Pick a therapist for a case from the operations matching queue.",
    [SCH, OPS],
  ),
  action(
    "therapists.view",
    S,
    "See the therapist directory",
    "Open therapist profiles and the directory.",
    [SCH, OPS, CL],
  ),
  action(
    "therapists.add",
    S,
    "Add a therapist",
    "Create a therapist with credentials and a login.",
    [SCH, OPS, CL],
  ),
  action(
    "therapists.deactivate",
    S,
    "Deactivate or reactivate a therapist",
    "Stop or restore a therapist's sign-in and new bookings.",
    [SCH, OPS, CL],
  ),
  action(
    "therapists.reset-password",
    S,
    "Reset a therapist's password",
    "Issue a new temporary password to a therapist.",
    [SCH, OPS, CL],
  ),
  action("therapists.export", S, "Export the therapist list", "Download the therapist list.", [
    SCH,
    OPS,
    CL,
  ]),
  action(
    "staff.verify-credentials",
    S,
    "Verify credentials and competencies",
    "Verify registrations and checks, and approve competencies and service eligibility.",
    [CL],
  ),

  // Clinical records and oversight
  scope(
    "records.view.clinical",
    C,
    "Open the full clinical record",
    "See the whole clinical record after recording the purpose.",
    [CL],
  ),
  scope(
    "records.view.intake",
    C,
    "See the intake summary of a record",
    "See referral and intake details without clinical notes.",
    [INT, OPS],
  ),
  scope(
    "records.view.scheduling",
    C,
    "See the scheduling summary of a record",
    "See visits and availability without clinical notes.",
    [SCH],
  ),
  scope(
    "records.view.finance",
    C,
    "See the funding and billing summary of a record",
    "See funding and invoices without clinical notes.",
    [FIN, FM],
  ),
  action(
    "records.grant-access",
    C,
    "Grant record access",
    "Grant someone access to a record and record the purpose of an access.",
    [CL],
  ),
  action("records.review-risks", C, "Review reported risks", "Review risks reported on a record.", [
    CL,
  ]),
  scope(
    "assessments.view",
    C,
    "Clinical view of assessments",
    "Read assessments as a clinical reviewer.",
    [CL],
  ),
  action("assessments.cosign", C, "Co-sign assessments", "Co-sign a signed assessment.", [CL]),
  action(
    "assessments.review",
    C,
    "Complete an assessment review",
    "Complete the review of an assessment.",
    [CL],
  ),
  scope(
    "plans.oversight",
    C,
    "Lead view of treatment plans",
    "See every treatment plan as a clinical lead.",
    [CL],
  ),
  scope(
    "progress.oversight",
    C,
    "Lead view of progress and reports",
    "See progress and reports as a clinical lead.",
    [CL],
  ),
  scope(
    "documentation.oversight",
    C,
    "Lead view of notes",
    "See session notes as a clinical lead. Restricted disciplines stay with their discipline unless supervised.",
    [CL],
  ),
  scope("sessions.oversight", C, "Lead view of sessions", "See sessions as a clinical lead.", [CL]),
  action(
    "sessions.finance-verify",
    C,
    "Verify a session for billing",
    "See the finance view of a session and verify it for billing.",
    [FIN, FM],
  ),
  action(
    "recordings.manage",
    C,
    "Manage telehealth recordings",
    "See every recording and manage restricted ones.",
    [CL],
  ),
  action(
    "coordination.review",
    C,
    "Review clinical coordination tasks",
    "Review and complete clinical-approval tasks and handovers.",
    [CL],
  ),

  // Funding
  action(
    "funding.verify",
    F,
    "Verify funding",
    "Verify plans, evidence, payers and policy, and edit the price catalogue.",
    [FIN, FM],
  ),
  action("funding.edit", F, "Edit funding", "Edit funding plans, budgets and agreements.", [
    INT,
    FIN,
    FM,
  ]),
  action(
    "funding.clinical-gate",
    F,
    "Clinical gate on funding",
    "Pass or return the clinical gate on a funding plan.",
    [CL],
  ),

  // Finance and billing
  action("finance.work", B, "Work billing", "Work billables, invoices, payments and claims.", [
    FIN,
    FM,
  ]),
  action(
    "finance.approve",
    B,
    "Approve finance exceptions",
    "Change charge rules, approve rate overrides, release duplicates, override a billing check, approve invoices over the limit and void issued invoices.",
    [FM],
  ),

  // Operations and approvals
  action(
    "operations.retry-runs",
    O,
    "Retry failed automation runs",
    "Retry or skip an automation run that failed.",
    [INT, SCH, FM, OPS, CL],
  ),
  action(
    "operations.manage",
    O,
    "Manage operations",
    "Change operations settings and workflow rules, and see and work every team's tasks.",
    [OPS],
  ),
  scope(
    "operations.clinical",
    O,
    "Clinical restricted work",
    "See and act on clinical restricted tasks, decide risk-flag findings and approve clinical reviews.",
    [CL],
  ),
  scope(
    "operations.team.intake",
    O,
    "Work the Intake queue",
    "See and work tasks for the Intake team.",
    [INT],
  ),
  scope(
    "operations.team.scheduling",
    O,
    "Work the Scheduling queue",
    "See and work tasks for the Scheduling team.",
    [SCH],
  ),
  scope(
    "operations.team.finance",
    O,
    "Work the Finance queue",
    "See and work tasks for the Finance team.",
    [FIN, FM],
  ),
  scope(
    "operations.team.clinical",
    O,
    "Work the Clinical queue",
    "See and work tasks for the Clinical team.",
    [CL],
  ),
  scope(
    "operations.team.operations",
    O,
    "Work the Operations queue",
    "See and work tasks for the Operations team.",
    [OPS],
  ),
  action(
    "approvals.decide.funding",
    O,
    "Decide funding exception approvals",
    "Approve or decline a funding exception.",
    [FIN, FM],
  ),
  action(
    "approvals.decide.billing-adjustment",
    O,
    "Decide billing adjustments",
    "Approve or decline write-offs, credits and refunds.",
    [FM],
  ),
  action(
    "approvals.decide.clinical",
    O,
    "Decide clinical approvals",
    "Decide clinical-risk referrals, therapist assignment exceptions, telehealth recording reviews and sensitive document distribution.",
    [CL],
  ),
  action(
    "approvals.decide.manager",
    O,
    "Decide manager approvals",
    "Decide unusual travel or booking exceptions and workflow rule activation.",
    [OPS],
  ),

  // Reports
  scope(
    "reports.clinical-detail",
    P,
    "Clinical row-level detail in reports",
    "Open clinical detail behind report figures.",
    [CL],
  ),
  scope(
    "reports.share.team",
    P,
    "Share reports with a team",
    "Share a saved report with a team.",
    ALL,
  ),
  scope(
    "reports.share.organisation",
    P,
    "Share reports organisation-wide",
    "Share a saved report with everyone.",
    [OPS],
  ),
  action(
    "reports.therapist",
    P,
    "View therapist reports",
    "Open the reports of any one therapist: their caseload, sessions, notes and progress.",
    [OPS, CL],
  ),
  action(
    "reports.schedule",
    P,
    "Schedule report deliveries",
    "Set a report to be delivered on a schedule.",
    [FM, OPS, CL],
  ),
  // People and HR
  action(
    "hr.manage",
    H,
    "Manage people and HR",
    "See credential alerts, decide leave requests, approve timesheets and remind staff.",
    [OPS, CL],
  ),
  // Messages
  action(
    "messages.use",
    M,
    "Message anyone",
    "Start chats with office staff, clinicians and patients from Messages.",
    ALL,
  ),
  ...reportPermissions,
];

export type PermissionId = string;

export const permissionIds: readonly string[] = permissions.map((p) => p.id);

export const permissionById = (id: string) => permissions.find((p) => p.id === id);

/** The permissions a built-in role starts with. */
export const defaultPermissionsFor = (slug: BuiltInRoleSlug): string[] =>
  permissions.filter((p) => p.defaults.includes(slug)).map((p) => p.id);

/**
 * Permissions whose toggle the app obeys today. A toggle for anything else is saved but not yet
 * enforced: the older role checks still decide. Modules are added here as they move over.
 */
export const enforcedPermissions: readonly string[] = [
  // People and HR, and Messages
  "hr.manage",
  "messages.use",
  // Roles and apps
  "roles.manage",
  "app.admin",
  "app.therapist",
  "app.mobile.family",
  "app.mobile.patient",
  "app.mobile.staff",
  "app.mobile.therapist",
  // Referrals and intake
  "referrals.triage",
  "referrals.process",
  "patient-requests.process",
  // Funding
  "funding.verify",
  "funding.edit",
  "funding.clinical-gate",
  // Finance and billing
  "finance.work",
  "finance.approve",
  // Scheduling and therapists
  "schedule.manage",
  "schedule.assign",
  "operations.matching",
  "operations.retry-runs",
  "therapists.view",
  "therapists.add",
  "therapists.deactivate",
  "therapists.reset-password",
  "therapists.export",
  "staff.verify-credentials",
  // Clinical oversight
  "assessments.view",
  "assessments.cosign",
  "assessments.review",
  "plans.oversight",
  "progress.oversight",
  "documentation.oversight",
  "recordings.manage",
  "coordination.review",
  // Operations and approvals
  "operations.manage",
  "operations.clinical",
  "operations.team.intake",
  "operations.team.scheduling",
  "operations.team.finance",
  "operations.team.clinical",
  "operations.team.operations",
  "approvals.decide.funding",
  "approvals.decide.billing-adjustment",
  "approvals.decide.clinical",
  "approvals.decide.manager",
  // Records and sessions
  "records.view.clinical",
  "records.view.intake",
  "records.view.scheduling",
  "records.view.finance",
  "records.grant-access",
  "records.review-risks",
  "sessions.oversight",
  "sessions.finance-verify",
  // Reports and scopes
  "reports.clinical-detail",
  "reports.share.team",
  "reports.share.organisation",
  "reports.schedule",
  "reports.therapist",
  ...reportPermissions.map((p) => p.id),
];
