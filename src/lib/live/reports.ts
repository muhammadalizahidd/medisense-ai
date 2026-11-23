/**
 * Module 09: reports and analytics. Pure functions shared by the server (exports, scheduled runs)
 * and the screens, so an export always matches what was on screen (AT-29).
 */

import { reportDetailId, reportReadId } from "@/lib/permissions/catalogue";

/* ------------------------------------------------------------------ dates (Brisbane) */

const OFFSET = 10 * 3_600_000;
/** The Brisbane calendar day of a timestamp. Brisbane has no daylight saving (AT-06). */
export const dayKey = (iso: string | Date) =>
  new Date(new Date(iso).getTime() + OFFSET).toISOString().slice(0, 10);
const shift = (key: string, days: number) =>
  new Date(Date.parse(`${key}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export const datePresets = [
  "Today",
  "Yesterday",
  "Last 7 Days",
  "Last 30 Days",
  "This Month",
  "Last Month",
  "This Quarter",
  "Last Quarter",
  "Custom",
] as const;
export type DatePreset = (typeof datePresets)[number];

export function presetRange(p: DatePreset, today: string): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const monthStart = (yy: number, mm: number) =>
    new Date(Date.UTC(yy, mm - 1, 1)).toISOString().slice(0, 10);
  const monthEnd = (yy: number, mm: number) =>
    new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
  const q = Math.floor((m - 1) / 3);
  switch (p) {
    case "Today":
      return { from: today, to: today };
    case "Yesterday":
      return { from: shift(today, -1), to: shift(today, -1) };
    case "Last 7 Days":
      return { from: shift(today, -6), to: today };
    case "Last 30 Days":
    case "Custom":
      return { from: shift(today, -29), to: today };
    case "This Month":
      return { from: monthStart(y, m), to: monthEnd(y, m) };
    case "Last Month":
      return m === 1
        ? { from: monthStart(y - 1, 12), to: monthEnd(y - 1, 12) }
        : { from: monthStart(y, m - 1), to: monthEnd(y, m - 1) };
    case "This Quarter":
      return { from: monthStart(y, q * 3 + 1), to: monthEnd(y, q * 3 + 3) };
    case "Last Quarter":
      return q === 0
        ? { from: monthStart(y - 1, 10), to: monthEnd(y - 1, 12) }
        : { from: monthStart(y, q * 3 - 2), to: monthEnd(y, q * 3) };
  }
}

/** AT-07: a custom range must run forwards and stay inside the history we hold. */
export function rangeError(from: string, to: string, earliest: string, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
    return "Enter both dates.";
  if (from > to) return "The start date must be on or before the end date.";
  if (to < earliest)
    return `Records start on ${earliest}. Choose dates from ${earliest} to ${shift(today, 90)}.`;
  if (from > shift(today, 90)) return "Choose dates no more than 90 days ahead.";
  if (daysBetween(from, to) > 731) return "Choose a range of two years or less.";
  return null;
}

export const inRange = (iso: string | null | undefined, from: string, to: string) => {
  if (!iso) return false;
  const k = iso.length === 10 ? iso : dayKey(iso);
  return k >= from && k <= to;
};

export const compareModes = [
  "No comparison",
  "Previous equivalent period",
  "Same period last year",
] as const;
export type CompareMode = (typeof compareModes)[number];

export function compareRange(mode: CompareMode, from: string, to: string) {
  if (mode === "No comparison") return null;
  if (mode === "Same period last year") {
    const back = (k: string) => `${Number(k.slice(0, 4)) - 1}${k.slice(4)}`;
    return { from: back(from), to: back(to) };
  }
  const len = daysBetween(from, to) + 1;
  return { from: shift(from, -len), to: shift(to, -len) };
}

/** Monday of the Brisbane week holding the day. */
export function weekOf(key: string) {
  const wd = (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7;
  return shift(key, -wd);
}
export const timeGrains = ["Day", "Week", "Month", "Quarter"] as const;
export type TimeGrain = (typeof timeGrains)[number];
export function bucketOf(key: string, grain: TimeGrain) {
  if (grain === "Day") return key;
  if (grain === "Week") return weekOf(key);
  if (grain === "Month") return key.slice(0, 7);
  return `${key.slice(0, 4)}-Q${Math.floor((Number(key.slice(5, 7)) - 1) / 3) + 1}`;
}
export function bucketLabel(b: string, grain: TimeGrain) {
  if (grain === "Quarter") return b.replace("-", " ");
  const d = new Date(`${grain === "Month" ? `${b}-01` : b}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "UTC",
    ...(grain === "Month"
      ? { month: "short", year: "2-digit" }
      : { day: "numeric", month: "short" }),
  }).format(d);
}
/** Every bucket from the start to the end of the range, so empty periods show as zero. */
export function bucketsIn(from: string, to: string, grain: TimeGrain) {
  const out: string[] = [];
  for (let k = from; k <= to; k = shift(k, 1)) {
    const b = bucketOf(k, grain);
    if (out[out.length - 1] !== b) out.push(b);
    if (out.length > 400) break;
  }
  return out;
}

/* ------------------------------------------------------------------ facts (from the server) */

export const serviceSettings = [
  "NDIS",
  "Early Childhood/Paediatrics",
  "Aged Care",
  "Workers Compensation",
  "Private/Other",
] as const;
export type ServiceSetting = (typeof serviceSettings)[number];

export const appointmentModes = [
  "Home",
  "School",
  "Daycare",
  "Day Program",
  "Community",
  "Telehealth",
] as const;
export type AppointmentMode = (typeof appointmentModes)[number];

export const managementModes = [
  "Agency Managed",
  "Plan Managed",
  "Self-Managed",
  "Mixed/Multiple",
  "Other payer",
] as const;
export type ManagementMode = (typeof managementModes)[number];

/** Psychology and trauma work: small groups are suppressed for anyone without clinical scope. */
export const confidentialDisciplines = ["Psychology", "Trauma Therapy"];
/** Matches the disciplines and their support names (Psychological Therapy, Trauma Therapy…). */
export const isConfidential = (text: string) => /psycholog|trauma/i.test(text);
export const SUPPRESS_BELOW = 3;

export type ParticipantFact = {
  id: string;
  mrn: string;
  label: string;
  settings: ServiceSetting[];
  region: string;
  createdAt: string;
  dischargedAt: string | null;
  child: boolean;
  restricted: boolean;
};

export type ReferralFact = {
  id: string;
  ref: string;
  participantId: string | null;
  label: string;
  submittedAt: string;
  acceptedAt: string | null;
  status: string;
  source: string;
  settings: ServiceSetting[];
  management: ManagementMode | null;
  region: string;
  owner: string;
  supports: string[];
  disciplines: string[];
  missing: string[];
  lastContact: string | null;
  stageSince: string;
  blocked: boolean;
  direct: boolean;
};

export type ServiceFact = {
  id: string;
  referralId: string | null;
  participantId: string;
  label: string;
  support: string;
  discipline: string;
  kind: "assessment" | "treatment";
  status: string;
  therapistId: string | null;
  location: string;
  settings: ServiceSetting[];
  requestedAt: string;
  startedAt: string | null;
  closedAt: string | null;
  restricted: boolean;
};

export type ClinicianFact = {
  id: string;
  name: string;
  discipline: string;
  region: string;
  credential: "Current" | "Expiring" | "Lapsed";
  /** Rostered direct-care minutes per week, before leave. */
  weeklyMinutes: number;
  /** Brisbane day keys of leave and other days away. */
  leave: string[];
  /** Share of rostered time set aside for breaks, training and admin (documented exclusion). */
  nonClinicalShare: number;
  active: boolean;
};

export type AppointmentFact = {
  id: string;
  ref: string;
  participantId: string;
  label: string;
  therapistId: string;
  discipline: string;
  support: string;
  start: string;
  status: string;
  mode: AppointmentMode;
  settings: ServiceSetting[];
  scheduledMinutes: number;
  /** Verified clinical minutes from check-out; null when not recorded. */
  deliveredMinutes: number | null;
  verified: boolean;
  confirmed: boolean;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelledBy: "client" | "medisense" | null;
  late: boolean;
  movedFrom: string | null;
  travelBooked: number | null;
  travelRecorded: number | null;
  travelCharge: string;
  noteStatus: "None" | "Draft" | "Pending Signature" | "Final" | "Amended";
  noteDue: string | null;
  noteSignedAt: string | null;
  restricted: boolean;
};

export type AssessmentFact = {
  id: string;
  participantId: string;
  label: string;
  therapistId: string;
  therapist: string;
  support: string;
  discipline: string;
  kind: string;
  status: string;
  requestedAt: string;
  dueAt: string;
  signedAt: string | null;
  visits: number;
  assessmentOnly: boolean;
  restricted: boolean;
};

export type GoalReviewFact = {
  id: string;
  participantId: string;
  label: string;
  plan: string;
  support: string;
  discipline: string;
  status: string;
  reviewDue: string;
  goals: number;
  lastReview: string | null;
  restricted: boolean;
};

export type TelehealthFact = {
  appointmentId: string;
  ref: string;
  therapistId: string;
  discipline: string;
  start: string;
  attempt: "Joined" | "Did not join" | "Technical failure" | "Cancelled" | "Not yet";
  issue: string;
  joinOutcome: string;
  reconnects: number;
  recordingConsent: "Given" | "Declined" | "Not asked";
  recorded: boolean;
  restrictedAccessEvents: number;
};

export type InvoiceFact = {
  id: string;
  number: string;
  participantId: string;
  label: string;
  path: string;
  payer: string;
  status: string;
  createdAt: string;
  issuedAt: string | null;
  dueDate: string | null;
  gross: number;
  credits: number;
  paid: number;
  balance: number;
  /** Verified support-specific route per line, for mixed funding (AT-20). */
  routes: { route: string; amount: number }[];
};

export type PaymentFact = {
  id: string;
  ref: string;
  payer: string;
  receivedOn: string;
  amount: number;
  matched: number;
  unmatched: number;
  refunded: number;
  status: string;
};

export type BillableFact = {
  id: string;
  ref: string;
  session: string;
  start: string;
  item: string;
  units: number;
  route: string;
  path: string;
  state: string;
};

export type FundingFact = {
  id: string;
  participantId: string;
  label: string;
  allocation: string;
  management: string;
  period: string;
  verification: string;
  exception: string;
  owner: string;
  blocking: boolean;
  since: string;
};

export type TaskFact = {
  id: string;
  ref: string;
  title: string;
  category: string;
  status: string;
  priority: string;
  team: string;
  owner: string;
  dueAt: string;
  createdAt: string;
  source: string;
  ruleCode: string | null;
};

export type RuleFact = {
  code: string;
  name: string;
  status: string;
  triggered: number;
  successful: number;
  failed: number;
  skipped: number;
  overrides: number;
  exceptions: number;
  lastRun: string | null;
};

export type SuggestionFact = {
  id: string;
  type: string;
  at: string;
  decision: "Accepted" | "Rejected" | "Deferred" | "Pending";
  minutesSaved: number;
};

export type AuditFact = {
  id: string;
  at: string;
  actor: string;
  module: string;
  action: string;
  target: string;
  outcome: string;
};

export type ReportFacts = {
  participants: ParticipantFact[];
  referrals: ReferralFact[];
  services: ServiceFact[];
  clinicians: ClinicianFact[];
  appointments: AppointmentFact[];
  assessments: AssessmentFact[];
  goalReviews: GoalReviewFact[];
  telehealth: TelehealthFact[];
  invoices: InvoiceFact[];
  payments: PaymentFact[];
  billables: BillableFact[];
  funding: FundingFact[];
  tasks: TaskFact[];
  rules: RuleFact[];
  suggestions: SuggestionFact[];
  audit: AuditFact[];
};

export const emptyFacts = (): ReportFacts => ({
  participants: [],
  referrals: [],
  services: [],
  clinicians: [],
  appointments: [],
  assessments: [],
  goalReviews: [],
  telehealth: [],
  invoices: [],
  payments: [],
  billables: [],
  funding: [],
  tasks: [],
  rules: [],
  suggestions: [],
  audit: [],
});

/* ------------------------------------------------------------------ roles and scope (section 8) */

export const domains = [
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
export type Domain = (typeof domains)[number];
export const shareScopes = ["Private", "Team", "Organisation"] as const;
export type ShareScope = (typeof shareScopes)[number];

export type ReportScope = {
  label: string;
  domains: Domain[];
  /** Domains where row-level detail is allowed; others are aggregate only. */
  detail: Domain[];
  clinicalDetail: boolean;
  share: ShareScope[];
  schedule: boolean;
  teams: string[];
};

/** Therapists and patients keep fixed scopes, whatever roles they carry (section 8). */
function fixedScope(role: string): ReportScope {
  // A therapist sees their own caseload only (the server filters the records).
  if (role === "therapist")
    return {
      label: "Therapist (own caseload)",
      domains: ["Staff", "Scheduling", "Clinical Operations", "Telehealth"],
      detail: ["Staff", "Scheduling", "Clinical Operations", "Telehealth"],
      clinicalDetail: true,
      share: ["Private"],
      schedule: false,
      teams: ["Clinical"],
    };
  return {
    label: "Participant",
    domains: [],
    detail: [],
    clinicalDetail: false,
    share: [],
    schedule: false,
    teams: [],
  };
}

/** Names a person's roles for the reports header. It only labels the scope; permissions decide it. */
function scopeLabel(staffRoles: readonly string[]): string {
  const has = (r: string) => staffRoles.includes(r);
  const label = has("Super Admin")
    ? has("Clinical Lead")
      ? "Director (clinical scope)"
      : "Director"
    : has("Operations Manager")
      ? "Operations Manager"
      : has("Clinical Lead")
        ? "Clinical Lead"
        : has("Finance Manager")
          ? "Finance Manager"
          : [
              has("Intake Officer") && "Intake",
              has("Scheduler") && "Scheduling",
              has("Finance") && "Finance",
            ]
              .filter(Boolean)
              .join(", ") || "Staff";
  return label;
}

/**
 * A person's reporting scope, from the permissions their roles grant (section 8). Therapists and
 * patients keep their fixed scopes. Row-level detail only counts for a domain the person can read.
 */
export function scopeFromPermissions(
  held: ReadonlySet<string> | readonly string[],
  role: string,
  staffRoles: readonly string[],
): ReportScope {
  if (role !== "admin") return fixedScope(role);
  const has = (id: string) =>
    Array.isArray(held) ? held.includes(id) : (held as ReadonlySet<string>).has(id);
  const read = domains.filter((d) => has(reportReadId(d)));
  const detail = read.filter((d) => has(reportDetailId(d)));
  const teamPermissions: [string, string][] = [
    ["operations.team.intake", "Intake"],
    ["operations.team.scheduling", "Scheduling"],
    ["operations.team.clinical", "Clinical"],
    ["operations.team.finance", "Finance"],
    ["operations.team.operations", "Operations"],
  ];
  return {
    // The label only names the person's roles; what they can see comes from the permissions.
    label: scopeLabel(staffRoles),
    domains: read,
    detail,
    clinicalDetail: has("reports.clinical-detail"),
    share: shareScopes.filter(
      (s) =>
        s === "Private" ||
        (s === "Team" && has("reports.share.team")) ||
        (s === "Organisation" && has("reports.share.organisation")),
    ),
    schedule: has("reports.schedule"),
    teams: teamPermissions.filter(([id]) => has(id)).map(([, team]) => team),
  };
}

/* ------------------------------------------------------------------ filters (section 3) */

export type ReportFilters = {
  preset: DatePreset;
  from: string;
  to: string;
  setting: ServiceSetting | "";
  discipline: string;
  support: string;
  mode: AppointmentMode | "";
  region: string;
  therapist: string;
  management: ManagementMode | "";
  status: string;
  search: string;
  compare: CompareMode;
  grain: TimeGrain;
};

export const blankFilters = (today: string): ReportFilters => ({
  preset: "This Quarter",
  ...presetRange("This Quarter", today),
  setting: "",
  discipline: "",
  support: "",
  mode: "",
  region: "",
  therapist: "",
  management: "",
  status: "",
  search: "",
  compare: "Previous equivalent period",
  grain: "Week",
});

export function filterSummary(f: ReportFilters) {
  return [
    `${f.preset === "Custom" ? "Custom" : f.preset}: ${f.from} to ${f.to}`,
    f.setting && `Setting: ${f.setting}`,
    f.discipline && `Discipline: ${f.discipline}`,
    f.support && `Support: ${f.support}`,
    f.mode && `Mode: ${f.mode}`,
    f.region && `Region: ${f.region}`,
    f.therapist && `Therapist: ${f.therapist}`,
    f.management && `Funding: ${f.management}`,
    f.status && `Status: ${f.status}`,
    f.search && `Search: "${f.search}"`,
  ].filter((x): x is string => Boolean(x));
}

const q = (s: string) => s.toLowerCase();
const matches = (f: ReportFilters, ...values: (string | null | undefined)[]) =>
  !f.search || values.some((v) => v && q(v).includes(q(f.search.trim())));

/** Filters that apply to every domain; dates are applied per measure on its declared basis. */
export function scoped(
  facts: ReportFacts,
  f: ReportFilters,
  names: Map<string, string>,
): ReportFacts {
  const set = (s: ServiceSetting[]) => !f.setting || s.includes(f.setting);
  const therapistOk = (id: string | null) =>
    !f.therapist || (f.therapist === "Unassigned" ? !id : names.get(id ?? "") === f.therapist);
  const services = facts.services.filter(
    (s) =>
      set(s.settings) &&
      (!f.discipline || s.discipline === f.discipline) &&
      (!f.support || s.support === f.support) &&
      therapistOk(s.therapistId) &&
      (!s.restricted || !f.search) &&
      matches(f, s.label, s.id, s.referralId),
  );
  return {
    ...facts,
    participants: facts.participants.filter(
      (p) =>
        set(p.settings) &&
        (!f.region || p.region === f.region) &&
        (!p.restricted || !f.search) &&
        matches(f, p.mrn, p.label),
    ),
    referrals: facts.referrals.filter(
      (r) =>
        set(r.settings) &&
        (!f.region || r.region === f.region) &&
        (!f.discipline || r.disciplines.includes(f.discipline)) &&
        (!f.support || r.supports.includes(f.support)) &&
        (!f.management || r.management === f.management) &&
        matches(f, r.ref, r.label),
    ),
    services,
    clinicians: facts.clinicians.filter(
      (c) =>
        (!f.discipline || c.discipline === f.discipline) &&
        (!f.region || c.region === f.region) &&
        (!f.therapist || c.name === f.therapist),
    ),
    appointments: facts.appointments.filter(
      (a) =>
        set(a.settings) &&
        (!f.discipline || a.discipline === f.discipline) &&
        (!f.support || a.support === f.support) &&
        (!f.mode || a.mode === f.mode) &&
        therapistOk(a.therapistId) &&
        (!a.restricted || !f.search) &&
        matches(f, a.ref, a.label),
    ),
    assessments: facts.assessments.filter(
      (a) =>
        (!f.discipline || a.discipline === f.discipline) &&
        (!f.support || a.support === f.support) &&
        therapistOk(a.therapistId) &&
        (!a.restricted || !f.search) &&
        matches(f, a.label, a.id),
    ),
    goalReviews: facts.goalReviews.filter(
      (g) =>
        (!f.discipline || g.discipline === f.discipline) &&
        (!f.support || g.support === f.support) &&
        (!g.restricted || !f.search) &&
        matches(f, g.label, g.plan),
    ),
    telehealth: facts.telehealth.filter(
      (t) =>
        (!f.discipline || t.discipline === f.discipline) &&
        (!f.mode || f.mode === "Telehealth") &&
        therapistOk(t.therapistId) &&
        matches(f, t.ref),
    ),
    invoices: facts.invoices.filter(
      (i) =>
        (!f.management ||
          i.path === f.management ||
          (f.management === "Other payer" &&
            !["Agency Managed", "Plan Managed", "Self-Managed"].includes(i.path))) &&
        matches(f, i.number, i.label, i.payer),
    ),
    payments: facts.payments.filter((p) => matches(f, p.ref, p.payer)),
    billables: facts.billables.filter((b) => matches(f, b.ref, b.session)),
    funding: facts.funding.filter(
      (x) => (!f.management || x.management === f.management) && matches(f, x.label, x.id),
    ),
    tasks: facts.tasks.filter((t) => matches(f, t.ref, t.title)),
  };
}

/* ------------------------------------------------------------------ KPI catalogue (section 4) */

export type Unit =
  | "parent referrals"
  | "requests"
  | "%"
  | "hours"
  | "days"
  | "referrals"
  | "people"
  | "episodes"
  | "bookings"
  | "sessions"
  | "assessments"
  | "notes"
  | "documents"
  | "invoices"
  | "AUD"
  | "cases"
  | "tasks";

export type MetricValue = {
  /** Null renders as N/A: missing denominator or no history (section 4 guardrails). */
  value: number | null;
  numerator?: number;
  denominator?: number;
  sample?: number;
  /** Records excluded because a source field was missing (Data Incomplete, AT-18). */
  incomplete?: number;
  note?: string;
};

export type MetricDef = {
  id: string;
  label: string;
  unit: Unit;
  domain: Domain;
  basis: string;
  definition: string;
  limit: string;
  /** Snapshot metrics read state at the range end, not events in the range. */
  snapshot?: boolean;
  /** Higher is better, for the comparison arrow colour. */
  better?: "up" | "down";
  drill: { module: string; href: string };
  compute: (f: ReportFacts, from: string, to: string, ctx: Ctx) => MetricValue;
};

export type Ctx = { today: string; now: string };

const pct = (n: number, d: number): MetricValue =>
  d > 0
    ? { value: Math.round((n / d) * 1000) / 10, numerator: n, denominator: d }
    : {
        value: null,
        numerator: n,
        denominator: 0,
        note: "No eligible records, so the rate can't be calculated.",
      };
const count = (n: number): MetricValue => ({ value: n });
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
};
const round1 = (n: number) => Math.round(n * 10) / 10;
const money = (n: number) => Math.round(n * 100) / 100;
const snapEnd = (to: string, ctx: Ctx) => (to < ctx.today ? to : ctx.today);
const asOf = (iso: string | null, end: string) => Boolean(iso) && dayKey(iso as string) <= end;

const ACTIVE_NEED = ["assigned", "waiting", "needs-therapist"];
const OPEN_ASSESSMENT = ["Draft", "In Progress", "Awaiting Review"];
const ISSUED = ["Issued", "Part-Paid", "Paid", "Disputed", "Credited"];

/** Delivered: completed, with the service confirmed (section 4). No-shows and cancellations excluded. */
export const isDelivered = (a: AppointmentFact) => a.status === "completed" && a.verified;
export const isCancelled = (a: AppointmentFact) =>
  a.status === "cancelled" || a.status === "late-cancelled";

/** Rostered direct-care capacity in a range, after leave and the documented exclusions (AT-21). */
export function capacityHours(c: ClinicianFact, from: string, to: string) {
  if (!c.active) return 0;
  let days = 0;
  for (let k = from; k <= to; k = shift(k, 1)) {
    const wd = new Date(`${k}T00:00:00Z`).getUTCDay();
    if (wd === 0 || wd === 6 || c.leave.includes(k)) continue;
    days += 1;
  }
  return round1(((c.weeklyMinutes / 5) * days * (1 - c.nonClinicalShare)) / 60);
}

export const metrics: MetricDef[] = [
  {
    id: "new-referrals",
    label: "New referrals",
    unit: "parent referrals",
    domain: "Referrals",
    basis: "Submitted",
    definition:
      "Count of referral IDs submitted in the period. Saved drafts are never stored as referrals, so they can't be counted.",
    limit: "One referral asking for two supports counts once here.",
    drill: { module: "Referrals and intake", href: "/care/referrals" },
    compute: (f, from, to) =>
      count(f.referrals.filter((r) => inRange(r.submittedAt, from, to)).length),
  },
  {
    id: "requested-supports",
    label: "Requested supports",
    unit: "requests",
    domain: "Referrals",
    basis: "Submitted",
    definition: "Count of supports asked for on referrals submitted in the period.",
    limit: "Can exceed the referral count: one referral can ask for several supports.",
    drill: { module: "Referrals and intake", href: "/care/referrals" },
    compute: (f, from, to) =>
      count(
        f.referrals
          .filter((r) => inRange(r.submittedAt, from, to))
          .reduce((s, r) => s + r.supports.length, 0),
      ),
  },
  {
    id: "intake-completion",
    label: "Intake completion rate",
    unit: "%",
    domain: "Referrals",
    basis: "Submitted (cohort)",
    better: "up",
    definition:
      "Referrals submitted in the period that are now Accepted, divided by all referrals submitted in the period, × 100. Withdrawn referrals are excluded from the cohort.",
    limit: "Cohort is set by submission date; later decisions update it.",
    drill: { module: "Referrals and intake", href: "/care/referrals" },
    compute: (f, from, to) => {
      const cohort = f.referrals.filter(
        (r) => inRange(r.submittedAt, from, to) && r.status !== "Withdrawn",
      );
      return pct(
        cohort.filter((r) => r.status === "Accepted" || r.status === "Closed").length,
        cohort.length,
      );
    },
  },
  {
    id: "median-intake",
    label: "Median intake time",
    unit: "hours",
    domain: "Referrals",
    basis: "Accepted",
    better: "down",
    definition:
      "Median of accepted time minus submitted time, in calendar hours, for referrals accepted in the period.",
    limit: "Unresolved referrals are excluded; the sample count is shown.",
    drill: { module: "Referrals and intake", href: "/care/referrals" },
    compute: (f, from, to) => {
      const xs = f.referrals
        .filter((r) => r.acceptedAt && inRange(r.acceptedAt, from, to))
        .map((r) => (Date.parse(r.acceptedAt as string) - Date.parse(r.submittedAt)) / 3_600_000);
      const m = median(xs);
      return {
        value: m === null ? null : round1(m),
        sample: xs.length,
        note: m === null ? "No referrals were accepted in the period." : undefined,
      };
    },
  },
  {
    id: "missing-info",
    label: "Missing-information queue",
    unit: "referrals",
    domain: "Referrals",
    basis: "Snapshot at range end",
    snapshot: true,
    better: "down",
    definition: "Referrals whose current status is Needs Information.",
    limit: "Current status; history is not replayed.",
    drill: { module: "Referrals and intake", href: "/care/referrals" },
    compute: (f) => count(f.referrals.filter((r) => r.status === "Needs Information").length),
  },
  {
    id: "unassigned",
    label: "Unassigned services",
    unit: "requests",
    domain: "Participants",
    basis: "Snapshot at range end",
    snapshot: true,
    better: "down",
    definition: "Accepted, active service requests with no eligible clinician assigned.",
    limit: "Waitlisted requests are counted; completed ones are not.",
    drill: { module: "Therapists", href: "/care" },
    compute: (f) =>
      count(
        f.services.filter(
          (s) => s.status === "needs-therapist" || (s.status === "waiting" && !s.therapistId),
        ).length,
      ),
  },
  {
    id: "active-participants",
    label: "Unique active participants",
    unit: "people",
    domain: "Participants",
    basis: "Snapshot at range end",
    snapshot: true,
    definition:
      "Distinct participant IDs with at least one active service request on the snapshot date.",
    limit: "A person with two services counts once (AT-02).",
    drill: { module: "Patients", href: "/care" },
    compute: (f, _from, to, ctx) => {
      const end = snapEnd(to, ctx);
      return count(
        new Set(
          f.services
            .filter(
              (s) =>
                ACTIVE_NEED.includes(s.status) &&
                asOf(s.requestedAt, end) &&
                !(s.closedAt && dayKey(s.closedAt) <= end),
            )
            .map((s) => s.participantId),
        ).size,
      );
    },
  },
  {
    id: "new-starts",
    label: "New service starts",
    unit: "episodes",
    domain: "Participants",
    basis: "Started",
    definition: "Service requests whose first delivered visit falls in the period.",
    limit: "Repeat appointments are not new episodes.",
    drill: { module: "Patients", href: "/care" },
    compute: (f, from, to) =>
      count(f.services.filter((s) => inRange(s.startedAt, from, to)).length),
  },
  {
    id: "scheduled",
    label: "Scheduled appointments",
    unit: "bookings",
    domain: "Scheduling",
    basis: "Scheduled",
    definition:
      "Appointments whose scheduled start is in the period, whatever happened next. Tentative holds are excluded.",
    limit: "Moved visits count on their new date; the original date is kept on the row.",
    drill: { module: "Scheduling", href: "/care/schedule" },
    compute: (f, from, to) =>
      count(
        f.appointments.filter((a) => a.status !== "tentative" && inRange(a.start, from, to)).length,
      ),
  },
  {
    id: "delivered",
    label: "Delivered sessions",
    unit: "sessions",
    domain: "Scheduling",
    basis: "Completed",
    better: "up",
    definition: "Appointments marked completed with the service confirmed, in the period.",
    limit: "Did not attend and cancelled visits are excluded (AT-15).",
    drill: { module: "Scheduling", href: "/care/schedule" },
    compute: (f, from, to) =>
      count(f.appointments.filter((a) => isDelivered(a) && inRange(a.start, from, to)).length),
  },
  {
    id: "cancellation-rate",
    label: "Cancellation rate",
    unit: "%",
    domain: "Scheduling",
    basis: "Scheduled",
    better: "down",
    definition:
      "Cancelled ÷ (cancelled + completed + did not attend) × 100, for visits scheduled in the period.",
    limit: "Future visits still booked are excluded from the denominator.",
    drill: { module: "Scheduling", href: "/care/schedule" },
    compute: (f, from, to) => {
      const c = f.appointments.filter((a) => inRange(a.start, from, to));
      const cancelled = c.filter(isCancelled).length;
      return pct(
        cancelled,
        cancelled + c.filter((a) => a.status === "completed" || a.status === "no-show").length,
      );
    },
  },
  {
    id: "no-show-rate",
    label: "Did not attend rate",
    unit: "%",
    domain: "Scheduling",
    basis: "Scheduled",
    better: "down",
    definition: "Did not attend ÷ (completed + did not attend) × 100.",
    limit: "N/A when there are no completed or did-not-attend visits.",
    drill: { module: "Scheduling", href: "/care/schedule" },
    compute: (f, from, to) => {
      const c = f.appointments.filter((a) => inRange(a.start, from, to));
      const ns = c.filter((a) => a.status === "no-show").length;
      return pct(ns, ns + c.filter((a) => a.status === "completed").length);
    },
  },
  {
    id: "telehealth-adoption",
    label: "Telehealth adoption",
    unit: "%",
    domain: "Telehealth",
    basis: "Completed",
    definition: "Delivered telehealth sessions ÷ all delivered sessions × 100.",
    limit: "Not a quality measure.",
    drill: { module: "Scheduling", href: "/care/schedule" },
    compute: (f, from, to) => {
      const d = f.appointments.filter((a) => isDelivered(a) && inRange(a.start, from, to));
      return pct(d.filter((a) => a.mode === "Telehealth").length, d.length);
    },
  },
  {
    id: "tech-failure",
    label: "Technical failure rate",
    unit: "%",
    domain: "Telehealth",
    basis: "Scheduled",
    better: "down",
    definition:
      "Telehealth appointments with a recorded technology failure ÷ attempted telehealth appointments × 100.",
    limit: "Only attempts with a known outcome count.",
    drill: { module: "Telehealth", href: "/telehealth/recordings" },
    compute: (f, from, to) => {
      const t = f.telehealth.filter(
        (x) =>
          inRange(x.start, from, to) &&
          ["Joined", "Did not join", "Technical failure"].includes(x.attempt),
      );
      return pct(
        t.filter((x) => x.attempt === "Technical failure" || x.reconnects > 0).length,
        t.length,
      );
    },
  },
  {
    id: "booked-hours",
    label: "Clinician booked hours",
    unit: "hours",
    domain: "Staff",
    basis: "Scheduled",
    definition:
      "Sum of scheduled clinical duration for booked and completed appointments in the period.",
    limit: "Allocated time can differ from actual time.",
    drill: { module: "Therapists", href: "/care/therapists" },
    compute: (f, from, to) =>
      count(
        round1(
          f.appointments
            .filter((a) => ["booked", "completed"].includes(a.status) && inRange(a.start, from, to))
            .reduce((s, a) => s + a.scheduledMinutes, 0) / 60,
        ),
      ),
  },
  {
    id: "delivered-hours",
    label: "Clinician delivered hours",
    unit: "hours",
    domain: "Staff",
    basis: "Completed",
    better: "up",
    definition:
      "Sum of verified clinical minutes ÷ 60 for delivered sessions in the period. Travel and documentation are separate.",
    limit: "Sessions without recorded minutes are listed as Data Incomplete.",
    drill: { module: "Therapists", href: "/care/therapists" },
    compute: (f, from, to) => {
      const d = f.appointments.filter((a) => isDelivered(a) && inRange(a.start, from, to));
      const known = d.filter((a) => a.deliveredMinutes !== null);
      return {
        value: round1(known.reduce((s, a) => s + (a.deliveredMinutes ?? 0), 0) / 60),
        incomplete: d.length - known.length,
      };
    },
  },
  {
    id: "utilisation",
    label: "Utilisation",
    unit: "%",
    domain: "Staff",
    basis: "Completed",
    definition:
      "Delivered direct-care hours ÷ eligible rostered direct-care hours × 100. Eligible clinicians have at least one booking in the period. Leave days and 15% of rostered time (breaks, training, admin) are excluded from capacity.",
    limit: "N/A when capacity is zero (AT-22).",
    drill: { module: "Therapists", href: "/care/therapists" },
    compute: (f, from, to) => {
      const end = to;
      const booked = new Set(
        f.appointments
          .filter((a) => a.status !== "tentative" && inRange(a.start, from, to))
          .map((a) => a.therapistId),
      );
      const eligible = f.clinicians.filter((c) => booked.has(c.id));
      const cap = eligible.reduce((s, c) => s + capacityHours(c, from, end), 0);
      const ids = new Set(eligible.map((c) => c.id));
      const del =
        f.appointments
          .filter((a) => isDelivered(a) && ids.has(a.therapistId) && inRange(a.start, from, to))
          .reduce((s, a) => s + (a.deliveredMinutes ?? 0), 0) / 60;
      const v = pct(del, cap);
      return {
        ...v,
        numerator: round1(del),
        denominator: round1(cap),
        ...(v.value === null ? { note: "No rostered capacity in the period." } : {}),
      };
    },
  },
  {
    id: "assessment-backlog",
    label: "Assessment backlog",
    unit: "assessments",
    domain: "Clinical Operations",
    basis: "Snapshot at range end",
    snapshot: true,
    better: "down",
    definition:
      "Assessments not finalised on the snapshot date. Cancelled (withdrawn) assessments are excluded.",
    limit: "One assessment over three visits counts once (AT-13).",
    drill: { module: "Clinical records", href: "/care" },
    compute: (f, _from, to, ctx) => {
      const end = snapEnd(to, ctx);
      return count(
        f.assessments.filter(
          (a) =>
            asOf(a.requestedAt, end) &&
            a.status !== "Cancelled" &&
            !(a.signedAt && dayKey(a.signedAt) <= end),
        ).length,
      );
    },
  },
  {
    id: "overdue-notes",
    label: "Overdue clinical notes",
    unit: "notes",
    domain: "Clinical Operations",
    basis: "Snapshot now",
    snapshot: true,
    better: "down",
    definition: "Required session notes not finalised and past their 48-hour signature due time.",
    limit: "Documentation status only; never a judgement about care quality.",
    drill: { module: "Clinical records", href: "/care/schedule" },
    compute: (f, _from, _to, ctx) =>
      count(
        f.appointments.filter(
          (a) =>
            a.status === "completed" &&
            a.noteDue &&
            a.noteDue < ctx.now &&
            !["Final", "Amended"].includes(a.noteStatus),
        ).length,
      ),
  },
  {
    id: "reports-due",
    label: "Reports due",
    unit: "documents",
    domain: "Clinical Operations",
    basis: "Due",
    better: "down",
    definition: "Assessment reports with a due date in the period that are not finalised.",
    limit: "Detail is for authorised clinical staff only.",
    drill: { module: "Clinical records", href: "/care" },
    compute: (f, from, to) =>
      count(
        f.assessments.filter(
          (a) => OPEN_ASSESSMENT.includes(a.status) && inRange(a.dueAt, from, to),
        ).length,
      ),
  },
  {
    id: "assessment-turnaround",
    label: "Assessment turnaround",
    unit: "days",
    domain: "Clinical Operations",
    basis: "Finalised",
    better: "down",
    definition:
      "Median of report signed minus assessment request received, in calendar days, for assessments signed in the period.",
    limit: "The completed cohort count is shown.",
    drill: { module: "Clinical records", href: "/care" },
    compute: (f, from, to) => {
      const xs = f.assessments
        .filter((a) => a.signedAt && inRange(a.signedAt, from, to))
        .map((a) => (Date.parse(a.signedAt as string) - Date.parse(a.requestedAt)) / 86_400_000);
      const m = median(xs);
      return {
        value: m === null ? null : round1(m),
        sample: xs.length,
        note: m === null ? "No assessments were signed in the period." : undefined,
      };
    },
  },
  {
    id: "draft-invoices",
    label: "Draft invoices",
    unit: "invoices",
    domain: "Finance",
    basis: "Snapshot at range end",
    snapshot: true,
    definition: "Invoices in Draft or Pending Approval (review required).",
    limit: "Not revenue until issued (AT-24).",
    drill: { module: "Billing and finance", href: "/care/billing?tab=invoices" },
    compute: (f) =>
      count(
        f.invoices.filter((i) => ["Draft", "Pending Approval", "Approved"].includes(i.status))
          .length,
      ),
  },
  {
    id: "issued-revenue",
    label: "Issued revenue (net)",
    unit: "AUD",
    domain: "Finance",
    basis: "Issued",
    better: "up",
    definition:
      "Sum of issued invoice totals in the period, minus credits issued against them (net). Gross is shown alongside.",
    limit: "Not cash collected. Drafts are excluded.",
    drill: { module: "Billing and finance", href: "/care/billing?tab=invoices" },
    compute: (f, from, to) => {
      const inv = f.invoices.filter(
        (i) => ISSUED.includes(i.status) && inRange(i.issuedAt, from, to),
      );
      const gross = money(inv.reduce((s, i) => s + i.gross, 0));
      const credits = money(inv.reduce((s, i) => s + i.credits, 0));
      return {
        value: money(gross - credits),
        numerator: gross,
        denominator: credits,
        note: `Gross ${gross.toFixed(2)} less credits ${credits.toFixed(2)}`,
      };
    },
  },
  {
    id: "payments-received",
    label: "Payments received",
    unit: "AUD",
    domain: "Finance",
    basis: "Paid (receipt date)",
    better: "up",
    definition: "Sum of confirmed payments on their receipt date in the period, less refunds.",
    limit: "Not equal to billed revenue; counted on payment date, not visit date (AT-25).",
    drill: { module: "Billing and finance", href: "/care/billing?tab=payments" },
    compute: (f, from, to) =>
      count(
        money(
          f.payments
            .filter((p) => p.status !== "Reversed" && inRange(p.receivedOn, from, to))
            .reduce((s, p) => s + p.amount - p.refunded, 0),
        ),
      ),
  },
  {
    id: "outstanding",
    label: "Outstanding balance",
    unit: "AUD",
    domain: "Finance",
    basis: "Snapshot at range end",
    snapshot: true,
    definition: "Sum of issued invoice balances not fully settled on the snapshot date.",
    limit: "Includes overdue and not yet due.",
    drill: { module: "Billing and finance", href: "/care/billing?tab=invoices" },
    compute: (f) =>
      count(
        money(
          f.invoices
            .filter((i) => ["Issued", "Part-Paid", "Disputed"].includes(i.status))
            .reduce((s, i) => s + i.balance, 0),
        ),
      ),
  },
  {
    id: "overdue-receivables",
    label: "Overdue receivables",
    unit: "AUD",
    domain: "Finance",
    basis: "Snapshot at range end",
    snapshot: true,
    better: "down",
    definition: "Sum of unpaid issued balances whose due date is before the snapshot date.",
    limit: "Ageing buckets 1–30, 31–60, 61–90, 90+ days from the snapshot date (AT-27).",
    drill: { module: "Billing and finance", href: "/care/billing?tab=invoices" },
    compute: (f, _from, to, ctx) => {
      const end = snapEnd(to, ctx);
      return count(
        money(
          f.invoices
            .filter(
              (i) =>
                ["Issued", "Part-Paid", "Disputed"].includes(i.status) &&
                i.balance > 0 &&
                i.dueDate &&
                i.dueDate < end,
            )
            .reduce((s, i) => s + i.balance, 0),
        ),
      );
    },
  },
  {
    id: "funding-exceptions",
    label: "Funding exceptions",
    unit: "cases",
    domain: "Finance",
    basis: "Snapshot now",
    snapshot: true,
    better: "down",
    definition: "Support allocations with an active plan verification or authorisation blocker.",
    limit: "Not the same as an exhausted budget; remaining funds are never inferred.",
    drill: { module: "Funding and agreements", href: "/care/funding?tab=alerts" },
    compute: (f) => count(f.funding.filter((x) => x.blocking).length),
  },
  {
    id: "ai-accepted",
    label: "AI suggestions accepted",
    unit: "%",
    domain: "Automation",
    basis: "Reviewed",
    definition:
      "Accepted AI suggestions ÷ reviewed suggestions × 100. Rejected and deferred are counted separately.",
    limit: "Pending suggestions are not in the denominator.",
    drill: { module: "Operations", href: "/care/operations" },
    compute: (f, from, to) => {
      const s = f.suggestions.filter((x) => inRange(x.at, from, to) && x.decision !== "Pending");
      return pct(s.filter((x) => x.decision === "Accepted").length, s.length);
    },
  },
  {
    id: "tasks-overdue",
    label: "Tasks overdue",
    unit: "tasks",
    domain: "Automation",
    basis: "Snapshot now",
    snapshot: true,
    better: "down",
    definition: "Open assigned tasks whose due time is before now (business timestamp).",
    limit: "Completed and cancelled tasks are excluded.",
    drill: { module: "Operations", href: "/care/operations?tab=queue" },
    compute: (f, _from, _to, ctx) =>
      count(
        f.tasks.filter((t) => !["Completed", "Cancelled"].includes(t.status) && t.dueAt < ctx.now)
          .length,
      ),
  },
];

export const metricById = new Map(metrics.map((m) => [m.id, m]));

export type MetricResult = MetricValue & {
  def: MetricDef;
  previous: MetricValue | null;
  /** Why the comparison is N/A, when it is. */
  compareNote: string | null;
};

/** One KPI with its comparison. History before the earliest record is N/A, never zero. */
export function runMetric(
  id: string,
  facts: ReportFacts,
  f: ReportFilters,
  ctx: Ctx & { earliest: string },
): MetricResult {
  const def = metricById.get(id);
  if (!def) throw new Error(`Unknown metric ${id}`);
  const cur = def.compute(facts, f.from, f.to, ctx);
  const cmp = compareRange(f.compare, f.from, f.to);
  let previous: MetricValue | null = null;
  let compareNote: string | null = null;
  if (cmp) {
    if (def.snapshot) compareNote = "Snapshot measure: history isn't replayed, so no comparison.";
    else if (cmp.to < ctx.earliest) compareNote = `No records before ${ctx.earliest}.`;
    else previous = def.compute(facts, cmp.from, cmp.to, ctx);
  }
  return { ...cur, def, previous, compareNote };
}

/* ------------------------------------------------------------------ formatting */

export function formatValue(v: number | null, unit: Unit) {
  if (v === null) return "N/A";
  if (unit === "AUD")
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      maximumFractionDigits: v >= 10_000 ? 0 : 2,
    }).format(v);
  if (unit === "%") return `${v.toFixed(1)}%`;
  if (unit === "hours" || unit === "days") return `${v.toFixed(1)}`;
  return new Intl.NumberFormat("en-AU").format(v);
}

export function delta(r: MetricResult) {
  if (!r.previous || r.previous.value === null || r.value === null) return null;
  const diff = r.value - r.previous.value;
  const good = r.def.better ? (r.def.better === "up" ? diff > 0 : diff < 0) : null;
  return { diff: Math.round(diff * 10) / 10, good: diff === 0 ? null : good };
}
