import { z } from "zod";
import { supports, type Support } from "./catalogue";

/**
 * Module 06: NDIS funding and service agreements. Shared by the server and the screens: the
 * option lists, the input schemas, the DTOs and the pure calculations (estimates, readiness).
 *
 * Every figure here is either a participant-reported value, a verified snapshot recorded by a
 * person, or a local estimate. Nothing is checked against the NDIA; claims are simulated.
 */

/* ------------------------------------------------------------------ option lists */

/** As on the referral form (AT-02): the referral-level label, kept as participant-reported. */
export const referralPlanTypes = ["Plan Managed", "Self-Managed", "Agency Managed"] as const;
/** Per budget, internally: mixed management is allowed (AT-02, scenario B). */
export const managementTypes = [
  "Plan Managed",
  "Self-Managed",
  "Agency Managed",
  "Unknown",
] as const;
export type Management = (typeof managementTypes)[number];

export const yesNoUnknown = ["Yes", "No", "Unknown"] as const;

export const evidenceStatuses = [
  "Not Received",
  "Received",
  "Pending Review",
  "Verified",
  "Rejected",
  "Superseded",
] as const;
export type EvidenceStatus = (typeof evidenceStatuses)[number];

export const evidenceCategories = [
  "NDIS plan excerpt",
  "Funding period schedule",
  "Plan-manager confirmation",
  "Payer authority",
  "Other",
] as const;
export type EvidenceCategory = (typeof evidenceCategories)[number];

export const infoSources = [
  "Participant",
  "Guardian",
  "Support Coordinator",
  "Plan Manager",
  "NDIA document",
  "Other",
] as const;
export type InfoSource = (typeof infoSources)[number];

export const geographies = ["National", "Remote", "Very Remote"] as const;
export type Geography = (typeof geographies)[number];

export const eligibilityStates = ["Unknown", "Needs Review", "Confirmed", "Not Confirmed"] as const;
export type Eligibility = (typeof eligibilityStates)[number];

/** The plan fields a reviewer accepts or rejects one by one (workflow step 4, AT-09). */
export const planFields = [
  { key: "ndisNumber", label: "NDIS number" },
  { key: "start", label: "Plan start date" },
  { key: "end", label: "Plan end date" },
  { key: "management", label: "Plan management" },
  { key: "fundingPeriods", label: "Funding periods" },
] as const;
export type PlanFieldKey = (typeof planFields)[number]["key"];
export const fieldStates = ["Participant-reported", "Verified", "Rejected"] as const;
export type FieldState = (typeof fieldStates)[number];

export const payerKinds = ["Plan manager", "Self-managed payer", "NDIA (agency managed)"] as const;
export type PayerKind = (typeof payerKinds)[number];
export const payerStatuses = ["Draft", "Awaiting Verification", "Verified", "Inactive"] as const;
export type PayerStatus = (typeof payerStatuses)[number];
export const deliveryMethods = ["Secure portal", "Email", "Other approved process"] as const;

/** Agency-managed pathway: what Finance confirms before a claim could be prepared (AT-05). */
export const agencyChecklist = [
  "Medisense is a registered NDIS provider for these supports",
  "The support is funded in an agency-managed budget",
  "A current service booking exists in the provider portal",
  "Current pricing arrangements were checked for this support",
] as const;

export const agreementTypes = ["Initial", "Renewal", "Amendment", "Replacement"] as const;
export type AgreementType = (typeof agreementTypes)[number];

export const agreementStatuses = [
  "Draft",
  "Internal Review",
  "Issued",
  "Viewed",
  "Changes Requested",
  "Signed",
  "Declined",
  "Cancelled",
  "Expired",
  "Superseded",
] as const;
export type AgreementStatus = (typeof agreementStatuses)[number];

/** Allowed status moves (section 7). Signed terms never change in place (AT-19). */
export const agreementMoves: Record<AgreementStatus, readonly AgreementStatus[]> = {
  Draft: ["Internal Review", "Issued", "Cancelled"],
  "Internal Review": ["Draft", "Issued", "Cancelled"],
  Issued: ["Viewed", "Signed", "Declined", "Changes Requested", "Cancelled", "Expired"],
  Viewed: ["Signed", "Declined", "Changes Requested", "Cancelled", "Expired"],
  "Changes Requested": ["Cancelled", "Superseded"],
  Signed: ["Superseded", "Expired"],
  Declined: ["Superseded"],
  Cancelled: [],
  Expired: ["Superseded"],
  Superseded: [],
};
/** Statuses whose lines count as planned commitment against a budget. */
export const committingStatuses: readonly AgreementStatus[] = [
  "Draft",
  "Internal Review",
  "Issued",
  "Viewed",
  "Changes Requested",
  "Signed",
];
export const editableStatuses: readonly AgreementStatus[] = ["Draft"];

export const deliverySettings = [
  "Home",
  "School",
  "Telehealth",
  "Daycare",
  "Day Program",
  "Community",
  "Other",
] as const;
export const serviceUnits = [
  "Hour",
  "Session",
  "Assessment",
  "Report",
  "Kilometre",
  "Other",
] as const;
export type ServiceUnit = (typeof serviceUnits)[number];
export const lineFrequencies = ["Once", "Weekly", "Fortnightly", "Monthly", "As agreed"] as const;
export const lineKinds = ["Service", "Travel", "Non-face-to-face", "Report"] as const;
export type LineKind = (typeof lineKinds)[number];
export const communicationNeeds = [
  "Interpreter",
  "Easy Read",
  "Large print",
  "Accessible digital format",
  "Other",
] as const;
export const sharingMethods = ["Secure link", "Download", "Authorised email"] as const;
export const signatoryAuthorities = [
  "Participant (self)",
  "Parent or guardian of a minor",
  "Plan nominee",
  "Court or tribunal appointed guardian",
  "Other authorised representative",
] as const;

/** Approved content blocks (section 7). The wording is Medisense's to approve. */
export const rightsBlocks = [
  {
    key: "rights",
    title: "Your rights",
    text: "You choose the supports you receive and who provides them. You can ask questions at any time, have a support person with you, and receive this agreement in a format that suits you.",
  },
  {
    key: "responsibilities",
    title: "Our responsibilities",
    text: "We deliver the supports described here safely and respectfully, keep your information private, tell you about changes early, and only charge for supports that were delivered or for cancellations under the terms below.",
  },
  {
    key: "changes",
    title: "Changes and ending this agreement",
    text: "Either of us can ask to change this agreement. Changes to services, prices, dates, signatory or payment are made in a new version that you accept. Either of us can end the agreement with 14 days' written notice.",
  },
  {
    key: "complaints",
    title: "Feedback, complaints and disputes",
    text: "Tell us first so we can fix it. If you're not satisfied you can contact the NDIS Quality and Safeguards Commission. Raising a concern never affects your services.",
  },
] as const;

export const DEFAULT_CANCELLATION =
  "Please tell us at least 2 business days before a visit if you can't attend. A short-notice cancellation or a missed visit may be charged under the NDIS Pricing Arrangements; we'll always tell you first. Telehealth and rescheduling are offered where suitable.";

/* ------------------------------------------------------------------ readiness */

export const readinessGates = [
  { key: "clinical", label: "Clinical acceptance", owner: "Clinical Lead" },
  { key: "evidence", label: "Plan evidence", owner: "Finance" },
  { key: "budget", label: "Service budget", owner: "Finance" },
  { key: "payer", label: "Payer route", owner: "Finance" },
  { key: "agreement", label: "Agreement", owner: "Finance" },
  { key: "consent", label: "Consent", owner: "Intake" },
] as const;
export type GateKey = (typeof readinessGates)[number]["key"];
export type GateSeverity = "ok" | "warn" | "block";
export type BookingReadiness = "Ready" | "Conditional" | "Blocked";

/* ------------------------------------------------------------------ input schemas */

const text = (max: number) => z.string().trim().max(max).default("");
const day = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a full date")]);
const money = z.number().min(0, "Amounts can't be negative").max(10_000_000);
export const emailOrBlank = z.union([
  z.literal(""),
  z.string().trim().email("Enter a valid email address").max(160),
]);

export const periodSchema = z
  .object({ id: z.string().max(60).optional(), start: day, end: day, note: text(200) })
  .refine((p) => !p.start || !p.end || p.start <= p.end, {
    message: "The period can't end before it starts",
    path: ["end"],
  });

export const planInputSchema = z
  .object({
    ndisNumber: z
      .string()
      .trim()
      .max(20)
      .regex(/^\d*$/, "An NDIS number has digits only")
      .default(""),
    start: day,
    end: day,
    management: z.union([z.literal(""), z.enum(referralPlanTypes)]),
    fundingPeriods: z.enum(yesNoUnknown),
    periods: z.array(periodSchema).max(12),
    geography: z.enum(geographies),
    source: z.enum(infoSources),
    reason: text(300),
  })
  .refine((p) => !p.start || !p.end || p.start < p.end, {
    message: "The plan start must be before the end",
    path: ["end"],
  });
export type PlanInput = z.infer<typeof planInputSchema>;

export const budgetInputSchema = z.object({
  id: z.string().max(60).optional(),
  name: z.string().trim().min(2, "Name the budget").max(120),
  priceItemId: z.string().max(60).default(""),
  management: z.enum(managementTypes),
  payerId: z.string().max(40).default(""),
  periodId: z.string().max(60).default(""),
  reportedTotal: money.nullable(),
  sharing: text(300),
  alertThreshold: z.number().int().min(10).max(100),
  travelAllowed: z.boolean(),
  travelNote: text(200),
  reason: text(300),
});
export type BudgetInput = z.infer<typeof budgetInputSchema>;

export const payerInputSchema = z
  .object({
    kind: z.enum(payerKinds),
    name: z.string().trim().min(2, "Enter the company or payer name").max(120),
    contactName: text(120),
    email: emailOrBlank,
    phone: text(30),
    deliveryMethod: z.enum(deliveryMethods),
    clientId: z.string().max(40).default(""),
    authority: text(200),
    abn: z
      .string()
      .trim()
      .regex(/^(\d{11})?$/, "An ABN has 11 digits")
      .default(""),
    billingNotes: text(300),
    effectiveFrom: day,
  })
  .superRefine((p, ctx) => {
    // Plan-managed invoices go to the plan manager by email (section 6).
    if (p.kind === "Plan manager" && !p.email) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "A plan manager needs an email for invoices",
      });
    }
    if (p.kind === "Self-managed payer" && !p.authority) {
      ctx.addIssue({
        code: "custom",
        path: ["authority"],
        message: "Record the authority this payer has (for example: participant, or nominee)",
      });
    }
  });
export type PayerInput = z.infer<typeof payerInputSchema>;

export const priceItemInputSchema = z.object({
  id: z.string().max(60).optional(),
  code: z
    .string()
    .trim()
    .max(30)
    .regex(/^[0-9_]*$/, "Item numbers use digits and underscores")
    .default(""),
  name: z.string().trim().min(3).max(160),
  category: z.string().trim().min(3).max(120),
  unit: z.enum(serviceUnits),
  limits: z.object({
    National: money.nullable(),
    Remote: money.nullable(),
    "Very Remote": money.nullable(),
  }),
  edition: z.string().trim().min(3).max(60),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveTo: day,
  supports: z.array(z.enum(supports)).max(20),
  active: z.boolean(),
});
export type PriceItemInput = z.infer<typeof priceItemInputSchema>;

export const lineInputSchema = z.object({
  id: z.string().max(60).optional(),
  needId: z.string().max(60).default(""),
  support: z.string().trim().min(2).max(120),
  kind: z.enum(lineKinds),
  scope: text(400),
  deliverySetting: z.enum(deliverySettings),
  unit: z.enum(serviceUnits),
  quantity: z.number().min(0, "Quantity can't be negative").max(10_000),
  frequency: z.enum(lineFrequencies),
  unitPrice: money,
  priceItemId: z.string().max(60).default(""),
  budgetId: z.string().max(60).default(""),
});
export type LineInput = z.infer<typeof lineInputSchema>;

export const agreementInputSchema = z
  .object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the start date"),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the end date"),
    planId: z.string().max(40).default(""),
    signatory: z.object({
      contactId: z.string().max(60).default(""),
      name: z.string().trim().min(2, "Name the signatory").max(120),
      email: emailOrBlank,
      authority: z.enum(signatoryAuthorities),
    }),
    lines: z.array(lineInputSchema).max(30),
    cancellation: z.string().trim().min(20, "Add the cancellation terms").max(1500),
    rights: z.array(z.string().max(30)).max(10),
    communication: z.array(z.enum(communicationNeeds)).max(5),
    communicationNote: text(200),
    sharing: z.enum(sharingMethods),
    reason: text(300),
  })
  .refine((a) => a.start <= a.end, {
    message: "The agreement can't end before it starts",
    path: ["end"],
  });
export type AgreementInput = z.infer<typeof agreementInputSchema>;

/* ------------------------------------------------------------------ calculations */

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** How many units a line covers over the agreement period (section 12). */
export function occurrences(
  frequency: (typeof lineFrequencies)[number],
  start: string,
  end: string,
) {
  if (frequency === "Once" || frequency === "As agreed") return 1;
  const days = Math.max(0, (Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
  const step = frequency === "Weekly" ? 7 : frequency === "Fortnightly" ? 14 : 30.44;
  return Math.max(1, Math.floor(days / step));
}

/**
 * Estimated total of one line: quantity per occurrence × unit price × occurrences. Travel and
 * non-face-to-face lines are their own lines, never folded in (AT-14).
 */
export function lineEstimate(
  line: Pick<LineInput, "quantity" | "unitPrice" | "frequency">,
  start: string,
  end: string,
) {
  return round2(line.quantity * line.unitPrice * occurrences(line.frequency, start, end));
}

/** Locally estimated remaining = last verified snapshot − local commitments; null when unverified (AT-17). */
export function localRemaining(verified: number | null, committed: number) {
  return verified === null ? null : round2(verified - committed);
}

export function overlapping(periods: { start: string; end: string }[]) {
  const sorted = periods
    .filter((p) => p.start && p.end)
    .sort((a, b) => a.start.localeCompare(b.start));
  const clashes: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i]!.start <= sorted[i - 1]!.end) clashes.push(i);
  }
  return clashes.length > 0;
}

export const aud = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

export const maskNdis = (n: string) =>
  n.length > 4 ? `${"•".repeat(n.length - 4)}${n.slice(-4)}` : n;

/* ------------------------------------------------------------------ DTOs */

export type FieldCheckDto = {
  key: PlanFieldKey;
  label: string;
  reported: string;
  current: string;
  state: FieldState;
  source: string;
  note: string;
  by: string | null;
  at: string | null;
  /** True when the reported value and the recorded value disagree (AT-09). */
  differs: boolean;
};

export type EvidenceDto = {
  id: string;
  documentId: string | null;
  category: EvidenceCategory;
  name: string;
  status: EvidenceStatus;
  source: InfoSource;
  version: number;
  note: string;
  uploadedBy: string;
  at: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  scan: ScanDto | null;
};

/** Values "read" from a plan document. Simulated in the prototype: a stored sample set. */
export type ScanDto = {
  at: string;
  by: string;
  ndisNumber: string;
  start: string;
  end: string;
  management: (typeof referralPlanTypes)[number];
  fundingPeriods: "Yes" | "No";
  periods: { start: string; end: string }[];
  budgets: { name: string; management: Management; amount: number }[];
  confidence: number;
  applied: { by: string; at: string } | null;
};

export type PeriodDto = { id: string; start: string; end: string; note: string };

export type BudgetDto = {
  id: string;
  name: string;
  priceItemId: string;
  priceItem: string;
  management: Management;
  payerId: string;
  payer: string | null;
  payerStatus: PayerStatus | null;
  periodId: string;
  period: string;
  reportedTotal: number | null;
  verified: { amount: number; at: string; by: string; source: string } | null;
  committed: number;
  used: number;
  remaining: number | null;
  eligibility: Eligibility;
  eligibilityNote: string;
  eligibilityBy: string | null;
  sharing: string;
  alertThreshold: number;
  travelAllowed: boolean;
  travelNote: string;
  warnings: string[];
};

export type InfoRequestDto = {
  id: string;
  items: string[];
  message: string;
  to: string;
  by: string;
  at: string;
  receivedAt: string | null;
  receivedNote: string;
};

export type PlanDto = {
  id: string;
  ref: string;
  status: "Draft" | "Active" | "Expired" | "Superseded";
  clientId: string | null;
  referralId: string | null;
  participant: string;
  ndisNumber: string;
  start: string;
  end: string;
  management: string;
  fundingPeriods: (typeof yesNoUnknown)[number];
  periods: PeriodDto[];
  geography: Geography;
  evidenceStatus: "Missing" | "Under Review" | "Verified" | "Rejected";
  fields: FieldCheckDto[];
  evidence: EvidenceDto[];
  budgets: BudgetDto[];
  infoRequests: InfoRequestDto[];
  agencyChecks: string[];
  missing: string[];
  overlaps: boolean;
  daysToEnd: number | null;
  createdAt: string;
  updatedAt: string;
};

export type PayerDto = {
  id: string;
  ref: string;
  kind: PayerKind;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  deliveryMethod: string;
  status: PayerStatus;
  clientId: string;
  client: string | null;
  authority: string;
  abn: string;
  billingNotes: string;
  effectiveFrom: string;
  replacedBy: string | null;
  verifiedBy: string | null;
  usedBy: number;
  history: { at: string; by: string; action: string }[];
};

export type PriceItemDto = PriceItemInput & { id: string; current: boolean };

export type AgreementLineDto = LineInput & {
  id: string;
  occurrences: number;
  estimate: number;
  priceItem: string;
  priceEdition: string;
  priceEffective: string;
  priceLimit: number | null;
  overLimit: boolean;
  budget: string | null;
  management: Management | null;
  payerRoute: string;
};

export type AgreementEventDto = { at: string; by: string; action: string; note: string };

export type AgreementDto = {
  id: string;
  ref: string;
  version: number;
  type: AgreementType;
  rootId: string;
  previousId: string | null;
  clientId: string;
  participant: string;
  planId: string;
  planRef: string | null;
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
  lines: AgreementLineDto[];
  total: number;
  cancellation: string;
  rights: string[];
  communication: string[];
  communicationNote: string;
  sharing: string;
  review: {
    required: boolean;
    reasons: string[];
    by: string | null;
    at: string | null;
    note: string;
  };
  acceptance: { name: string; role: string; at: string; version: number; method: string } | null;
  changeRequest: { note: string; at: string } | null;
  declined: { reason: string; at: string; outcome: string } | null;
  linkActive: boolean;
  linkExpires: string | null;
  warnings: string[];
  sdaAccommodation: boolean;
  events: AgreementEventDto[];
  versions: { id: string; version: number; status: AgreementStatus; type: AgreementType }[];
  createdAt: string;
  updatedAt: string;
};

export type GateDto = {
  key: GateKey;
  label: string;
  status: string;
  severity: GateSeverity;
  owner: string;
  next: string;
  href: string;
  reviewed: { by: string; at: string; note: string } | null;
};

export type ReadinessDto = {
  needId: string;
  support: string;
  discipline: string;
  booking: BookingReadiness;
  gates: GateDto[];
};

export type FundingAlertDto = {
  key: string;
  kind:
    | "plan-expiry"
    | "period-end"
    | "missing-email"
    | "duplicate"
    | "over-commitment"
    | "price-limit"
    | "not-accepted"
    | "agreement-expired"
    | "evidence-rejected"
    | "payer-inactive"
    | "beyond-plan"
    | "info-outstanding";
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  owner: string;
  clientId: string | null;
  participant: string;
  href: string;
  at: string;
  acknowledged: { by: string; at: string } | null;
};

export type HistoryDto = { at: string; by: string; area: string; action: string; detail: string };

export type FundingWorkspaceDto = {
  client: {
    id: string;
    name: string;
    mrn: string | null;
    funding: string;
    reported: { planType: string; planManagerCompany: string; planManagerEmail: string } | null;
  };
  plans: PlanDto[];
  agreements: AgreementDto[];
  readiness: ReadinessDto[];
  alerts: FundingAlertDto[];
  history: HistoryDto[];
  payers: PayerDto[];
  priceItems: PriceItemDto[];
  needs: {
    id: string;
    support: Support;
    discipline: string;
    frequency: string;
    location: string;
  }[];
  contacts: {
    id: string;
    name: string;
    role: string;
    email: string;
    state: string;
    signs: boolean;
  }[];
  can: { verify: boolean; edit: boolean; clinical: boolean };
  policy: FundingPolicy;
};

export type FundingPolicy = {
  reminderDays: number[];
  notAcceptedDays: number;
  reviewTotalOver: number;
  declinePolicy: "Proceed with documented verbal agreement" | "Hold new bookings until resolved";
  providerEntity: string;
};

export type FundingOverviewRow = {
  clientId: string;
  participant: string;
  mrn: string | null;
  planRef: string | null;
  planId: string | null;
  management: string;
  budgets: { name: string; management: Management }[];
  end: string;
  daysToEnd: number | null;
  evidence: PlanDto["evidenceStatus"] | "No plan";
  agreement: AgreementStatus | "None";
  booking: BookingReadiness;
  warnings: number;
};

export type FundingOverviewDto = {
  rows: FundingOverviewRow[];
  alerts: FundingAlertDto[];
  agreements: AgreementDto[];
  payers: PayerDto[];
  priceItems: PriceItemDto[];
  counts: {
    plans: number;
    verified: number;
    expiring: number;
    awaitingSignature: number;
    blocked: number;
    alerts: number;
  };
  can: { verify: boolean; edit: boolean };
  policy: FundingPolicy;
  clients: { id: string; name: string; mrn: string | null }[];
};
