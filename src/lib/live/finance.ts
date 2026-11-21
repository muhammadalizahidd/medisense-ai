import { z } from "zod";

/**
 * Module 07: billing and financial management. Shared option lists, schemas, DTOs and the pure
 * money arithmetic. Claims, payments and refunds are simulations: no real money moves and no
 * genuine NDIS claim is ever submitted (AC-39).
 */

/* ------------------------------------------------------------------ option lists */

export const fundingPaths = [
  "Agency Managed",
  "Plan Managed",
  "Self-Managed",
  "Private",
  "Insurer",
  "Aged Care",
  "Other",
] as const;
export type FundingPath = (typeof fundingPaths)[number];

export const chargeSources = [
  "Session",
  "Assessment",
  "Report",
  "Travel",
  "Cancellation",
  "Non-face-to-face",
  "Other",
] as const;
export type ChargeSource = (typeof chargeSources)[number];

export const billingUnits = ["Hour", "Minute", "Each", "Km", "Other"] as const;
export type BillingUnit = (typeof billingUnits)[number];

export const taxTreatments = ["GST-free", "Taxable", "Out of scope", "Review Required"] as const;
export type TaxTreatment = (typeof taxTreatments)[number];
export const GST_RATE = 0.1;

export const lineStatuses = [
  "Captured",
  "Pending verification",
  "Ready",
  "Held",
  "Rejected",
  "Invoiced",
  "Claimed",
] as const;
export type LineStatus = (typeof lineStatuses)[number];

export const holdReasons = [
  "Missing evidence",
  "Coding error",
  "Funding question",
  "Dispute",
  "Duplicate",
  "Other",
] as const;
export type HoldReason = (typeof holdReasons)[number];

/** Billing exceptions, as filtered in the queue (section 10). */
export const exceptionKinds = [
  "Missing agreement",
  "Missing service confirmation",
  "Invalid rate",
  "Duplicate",
  "Funding query",
  "Payer missing",
  "Tax review",
  "Other",
] as const;
export type ExceptionKind = (typeof exceptionKinds)[number];

export const invoiceStatuses07 = [
  "Draft",
  "Pending Approval",
  "Approved",
  "Issued",
  "Part-Paid",
  "Paid",
  "Disputed",
  "Voided",
  "Credited",
] as const;

export const paymentTerms = ["Due on receipt", "7 days", "14 days", "30 days", "Custom"] as const;
export type PaymentTerms = (typeof paymentTerms)[number];
export const termDays: Record<Exclude<PaymentTerms, "Custom">, number> = {
  "Due on receipt": 0,
  "7 days": 7,
  "14 days": 14,
  "30 days": 30,
};
export const deliveryChannels = ["Email", "Secure portal", "Export/Download", "Manual"] as const;
export const billToTypes = [
  "Participant",
  "Plan Manager",
  "Agency pathway",
  "Insurer",
  "Private payer",
  "Other",
] as const;

export const claimStatuses = [
  "Ready",
  "Prepared",
  "Submitted",
  "Accepted",
  "Rejected",
  "Partially Paid",
  "Closed",
] as const;
export type ClaimStatus = (typeof claimStatuses)[number];

export const paymentMethods = [
  "Bank Transfer",
  "Card",
  "Cash",
  "Cheque",
  "NDIS Remittance",
  "Other",
] as const;
export const paymentStatuses = [
  "Unallocated",
  "Partially allocated",
  "Allocated",
  "Reconciled",
  "Reversed",
  "Refund pending",
] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

export const reconStatuses = [
  "Unmatched",
  "Suggested",
  "Matched",
  "Reviewed",
  "Reconciled",
] as const;
export type ReconStatus = (typeof reconStatuses)[number];

export const adjustmentTypes = ["Credit note", "Debit note", "Write-off", "Refund"] as const;
export type AdjustmentType = (typeof adjustmentTypes)[number];
export const adjustmentStatuses = [
  "Requested",
  "Reviewed",
  "Approved",
  "Rejected",
  "Applied",
] as const;
export type AdjustmentStatus = (typeof adjustmentStatuses)[number];
export const refundReasons = ["Overpayment", "Duplicate", "Cancellation", "Other"] as const;

export const travelCategories = [
  "Therapist travel labour",
  "Travel non-labour",
  "Non-face-to-face",
  "Cancellation",
  "Other",
] as const;
export const billableBases = ["Actual", "Contracted", "Rule-based"] as const;

export const datePresets = [
  "Today",
  "This Week",
  "This Month",
  "Last Month",
  "This Quarter",
  "This Financial Year",
  "Custom",
] as const;
export type DatePreset = (typeof datePresets)[number];
export const ageingBuckets = [
  "Current",
  "1–30 days",
  "31–60 days",
  "61–90 days",
  "90+ days",
] as const;
export type AgeingBucket = (typeof ageingBuckets)[number];
export const reportGroupings = [
  "Month",
  "Payer",
  "Discipline",
  "Therapist",
  "Service",
  "Location",
] as const;

/* ------------------------------------------------------------------ charge rules */

export type PathRule = {
  /** Each charge category is only offered when the path, the rule and the agreement allow it. */
  travelLabour: boolean;
  travelNonLabour: boolean;
  nonFaceToFace: boolean;
  reportWriting: boolean;
  cancellation: boolean;
  /** Cancellations inside this notice window may be charged. */
  cancellationNoticeHours: number;
  /** Share of the scheduled fee charged for a chargeable cancellation (0–100). */
  cancellationShare: number;
  priceLimitsApply: boolean;
  tax: TaxTreatment;
  terms: Exclude<PaymentTerms, "Custom">;
  billTo: (typeof billToTypes)[number];
};

export type ChargeRules = {
  version: number;
  effectiveFrom: string;
  paths: Record<FundingPath, PathRule>;
  /** Unbilled verified services older than this many days raise a finance alert. */
  unbilledDays: number;
  /** An invoice above this total needs a Finance Manager's approval before issue. */
  managerApprovalOver: number;
  /** Write-offs up to this amount still need a Finance Manager; above it, a Director note. */
  writeOffLimit: number;
  updatedBy: string;
  updatedAt: string;
};

const ndis = (over: Partial<PathRule>): PathRule => ({
  travelLabour: true,
  travelNonLabour: true,
  nonFaceToFace: true,
  reportWriting: true,
  cancellation: true,
  cancellationNoticeHours: 48,
  cancellationShare: 100,
  priceLimitsApply: true,
  tax: "GST-free",
  terms: "14 days",
  billTo: "Plan Manager",
  ...over,
});

/** Sample rules for the prototype: Medisense confirms its real rules (open question 2). */
export const DEFAULT_RULES: Omit<ChargeRules, "updatedBy" | "updatedAt"> = {
  version: 1,
  effectiveFrom: "2026-07-01",
  paths: {
    "Agency Managed": ndis({ billTo: "Agency pathway", terms: "Due on receipt" }),
    "Plan Managed": ndis({}),
    "Self-Managed": ndis({ priceLimitsApply: false, billTo: "Participant" }),
    Private: {
      travelLabour: false,
      travelNonLabour: false,
      nonFaceToFace: false,
      reportWriting: true,
      cancellation: true,
      cancellationNoticeHours: 24,
      cancellationShare: 50,
      priceLimitsApply: false,
      tax: "Review Required",
      terms: "7 days",
      billTo: "Private payer",
    },
    Insurer: {
      travelLabour: true,
      travelNonLabour: true,
      nonFaceToFace: false,
      reportWriting: true,
      cancellation: false,
      cancellationNoticeHours: 24,
      cancellationShare: 0,
      priceLimitsApply: false,
      tax: "Review Required",
      terms: "30 days",
      billTo: "Insurer",
    },
    "Aged Care": {
      travelLabour: false,
      travelNonLabour: false,
      nonFaceToFace: false,
      reportWriting: false,
      cancellation: false,
      cancellationNoticeHours: 24,
      cancellationShare: 0,
      priceLimitsApply: true,
      tax: "GST-free",
      terms: "30 days",
      billTo: "Other",
    },
    Other: {
      travelLabour: false,
      travelNonLabour: false,
      nonFaceToFace: false,
      reportWriting: false,
      cancellation: false,
      cancellationNoticeHours: 24,
      cancellationShare: 0,
      priceLimitsApply: false,
      tax: "Review Required",
      terms: "14 days",
      billTo: "Other",
    },
  },
  unbilledDays: 7,
  managerApprovalOver: 5000,
  writeOffLimit: 500,
};

/* ------------------------------------------------------------------ arithmetic (section 11) */

/** Cents, so totals never drift (AC-13, AC-14). */
export const cents = (n: number) => Math.round(n * 100);
export const round2 = (n: number) => cents(n) / 100;

export function lineMoney(quantity: number, rate: number, tax: TaxTreatment) {
  const subtotal = round2(quantity * rate);
  const gst = tax === "Taxable" ? round2(subtotal * GST_RATE) : 0;
  return { subtotal, gst, total: round2(subtotal + gst) };
}

/** Quantity from minutes for an hourly or per-minute unit, to 4 decimal places. */
export function quantityFor(unit: BillingUnit, minutes: number, fallback = 1) {
  if (unit === "Hour") return Math.round((minutes / 60) * 10000) / 10000;
  if (unit === "Minute") return minutes;
  return fallback;
}

/** Whether a cancellation can be charged under the path's rule, and for how many minutes (S05). */
export function cancellationDecision(
  rule: PathRule,
  noticeHours: number,
  scheduledMinutes: number,
  version: number,
) {
  if (!rule.cancellation) {
    return {
      charge: false,
      minutes: 0,
      note: `Waived: cancellation charges aren't permitted for this funding path under charge rules v${version}`,
    };
  }
  if (noticeHours >= rule.cancellationNoticeHours) {
    return {
      charge: false,
      minutes: 0,
      note: `Waived: ${noticeHours} h notice meets the ${rule.cancellationNoticeHours} h rule`,
    };
  }
  const minutes = Math.round((scheduledMinutes * rule.cancellationShare) / 100);
  return {
    charge: true,
    minutes,
    note: `Charged ${rule.cancellationShare}% of the scheduled ${scheduledMinutes} min: ${noticeHours} h notice, rule ${rule.cancellationNoticeHours} h (v${version})`,
  };
}

export function ageingOf(
  dueDate: string | null,
  today: string,
  balance: number,
): AgeingBucket | null {
  if (!dueDate || balance <= 0) return null;
  const days = Math.floor((Date.parse(today) - Date.parse(dueDate)) / 86_400_000);
  if (days <= 0) return "Current";
  if (days <= 30) return "1–30 days";
  if (days <= 60) return "31–60 days";
  if (days <= 90) return "61–90 days";
  return "90+ days";
}

export function addDaysIso(iso: string, days: number) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** The date range a preset covers, in Brisbane days; the financial year starts 1 July. */
export function presetRange(
  preset: DatePreset,
  today: string,
  custom?: { from: string; to: string },
) {
  const d = new Date(`${today}T00:00:00Z`);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  switch (preset) {
    case "Today":
      return { from: today, to: today };
    case "This Week": {
      const dow = (d.getUTCDay() + 6) % 7;
      return { from: addDaysIso(today, -dow), to: addDaysIso(today, 6 - dow) };
    }
    case "This Month":
      return { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0))) };
    case "Last Month":
      return { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) };
    case "This Quarter": {
      const q = Math.floor(m / 3) * 3;
      return { from: iso(new Date(Date.UTC(y, q, 1))), to: iso(new Date(Date.UTC(y, q + 3, 0))) };
    }
    case "This Financial Year": {
      const start = m >= 6 ? y : y - 1;
      return { from: `${start}-07-01`, to: `${start + 1}-06-30` };
    }
    case "Custom":
      return custom ?? { from: today, to: today };
  }
}

export const aud = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

/* ------------------------------------------------------------------ schemas */

const text = (max: number) => z.string().trim().max(max).default("");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a full date");
const money = z.number().finite().max(10_000_000);

export const lineEditSchema = z.object({
  quantity: z.number().positive("Quantity must be above zero").max(10_000).optional(),
  minutes: z
    .number()
    .int()
    .min(1)
    .max(24 * 60)
    .optional(),
  tax: z.enum(taxTreatments).optional(),
  itemCode: text(40).optional(),
  reason: z.string().trim().min(3, "Give a reason for the correction").max(300),
});

export const travelSchema = z.object({
  category: z.enum(travelCategories),
  minutes: z.number().int().min(0).max(600).default(0),
  km: z.number().min(0).max(2000).default(0),
  costs: money.min(0).default(0),
  basis: z.enum(billableBases),
  evidence: z
    .string()
    .trim()
    .min(5, "Describe the evidence (for example odometer or receipt)")
    .max(400),
});

export const invoiceDraftSchema = z.object({
  dueDate: day,
  terms: z.enum(paymentTerms),
  delivery: z.enum(deliveryChannels),
  billTo: z.object({
    type: z.enum(billToTypes),
    name: z.string().trim().min(2, "Enter who the invoice is addressed to").max(160),
    email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]),
    address: text(240),
    abn: z
      .string()
      .trim()
      .regex(/^(\d{11})?$/, "An ABN has 11 digits")
      .default(""),
    reference: text(80),
  }),
  note: text(500),
});
export type InvoiceDraftInput = z.infer<typeof invoiceDraftSchema>;

export const paymentInputSchema = z.object({
  payer: z.string().trim().min(2, "Enter the payer").max(160),
  receivedOn: day,
  method: z.enum(paymentMethods),
  amount: z.number().positive("A receipt is above zero").max(1_000_000),
  reference: z.string().trim().min(2, "Enter the remittance or bank reference").max(80),
  note: text(300),
});
export type PaymentInput = z.infer<typeof paymentInputSchema>;

export const allocationSchema = z.object({
  allocations: z
    .array(
      z.object({
        target: z.enum(["invoice", "claim"]),
        id: z.string().max(40),
        amount: z.number().positive().max(1_000_000),
      }),
    )
    .min(1)
    .max(20),
});

export const adjustmentInputSchema = z.object({
  type: z.enum(adjustmentTypes),
  invoiceId: z.string().max(40).default(""),
  paymentId: z.string().max(40).default(""),
  lineIds: z.array(z.string().max(60)).max(50).default([]),
  amount: z.number().positive("Enter an amount above zero").max(1_000_000),
  reason: z.string().trim().min(5, "Give the reason").max(500),
  refundReason: z.enum(refundReasons).optional(),
  rebill: z.boolean().default(false),
});
export type AdjustmentInput = z.infer<typeof adjustmentInputSchema>;

/* ------------------------------------------------------------------ DTOs */

export type Flag = { kind: ExceptionKind; label: string; severity: "block" | "warn" };

export type BillableDto = {
  id: string;
  ref: string;
  sourceKey: string;
  source: ChargeSource;
  sourceRef: string;
  parentId: string | null;
  clientId: string;
  participant: string;
  support: string;
  discipline: string;
  therapist: string;
  start: string;
  end: string;
  deliveredMinutes: number;
  billableMinutes: number;
  location: string;
  path: FundingPath;
  payerRoute: string;
  agreement: string | null;
  itemCode: string;
  itemName: string;
  unit: BillingUnit;
  quantity: number;
  rate: number;
  rateSource: string;
  priceLimit: number | null;
  tax: TaxTreatment;
  amounts: { subtotal: number; gst: number; total: number };
  confirmation: { by: string; at: string; how: string } | null;
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
  hold: { reason: HoldReason; note: string; by: string; at: string } | null;
  override: { rate: number; reason: string; requestedBy: string; approvedBy: string | null } | null;
  invoice: { id: string; number: string } | null;
  claim: { id: string; ref: string } | null;
  duplicateOf: string | null;
  history: { at: string; by: string; action: string }[];
  createdAt: string;
};

export type InvoiceLineDto = {
  id: string;
  billableId: string | null;
  date: string;
  description: string;
  discipline: string;
  itemCode: string;
  quantity: number;
  unit: string;
  rate: number;
  tax: TaxTreatment;
  subtotal: number;
  gst: number;
  total: number;
  kind: string;
  held: boolean;
};

export type InvoiceDto07 = {
  id: string;
  number: string;
  version: number;
  clientId: string;
  participant: string;
  path: FundingPath | string;
  payer: string;
  billTo: InvoiceDraftInput["billTo"];
  status: string;
  overdue: boolean;
  ageing: AgeingBucket | null;
  issuedAt: string | null;
  dueDate: string | null;
  terms: PaymentTerms;
  delivery: string;
  note: string;
  agreement: { id: string; ref: string; start: string; end: string } | null;
  lines: InvoiceLineDto[];
  subtotal: number;
  gst: number;
  total: number;
  paid: number;
  credited: number;
  balance: number;
  arithmetic: string[];
  blockers: string[];
  warnings: string[];
  allocations: { paymentRef: string; amount: number; at: string; by: string }[];
  credits: { ref: string; amount: number; at: string; reason: string }[];
  comms: { at: string; by: string; channel: string; to: string; subject: string }[];
  versions: { version: number; at: string; by: string; reason: string; total: number }[];
  history: { status: string; by: string; note: string; at: string }[];
  dispute: { reason: string; at: string; by: string } | null;
  needsManager: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ClaimDto = {
  id: string;
  ref: string;
  clientId: string;
  participant: string;
  ndisNumber: string;
  status: ClaimStatus;
  lines: {
    billableId: string;
    ref: string;
    date: string;
    support: string;
    itemCode: string;
    quantity: number;
    rate: number;
    total: number;
  }[];
  total: number;
  paid: number;
  outcome: { status: string; note: string; at: string } | null;
  checks: string[];
  history: { at: string; by: string; action: string }[];
  createdAt: string;
};

export type PaymentDto = {
  id: string;
  ref: string;
  payer: string;
  receivedOn: string;
  method: string;
  amount: number;
  reference: string;
  note: string;
  status: PaymentStatus;
  allocated: number;
  unapplied: number;
  allocations: {
    target: "invoice" | "claim";
    id: string;
    label: string;
    amount: number;
    at: string;
    by: string;
  }[];
  duplicateRef: boolean;
  recon: ReconStatus;
  history: { at: string; by: string; action: string }[];
};

export type StatementLineDto = {
  id: string;
  date: string;
  amount: number;
  reference: string;
  description: string;
  status: ReconStatus;
  paymentId: string | null;
  paymentRef: string | null;
  suggestions: {
    kind: "payment" | "invoice";
    id: string;
    label: string;
    score: number;
    why: string[];
  }[];
  duplicate: boolean;
  reviewedBy: string | null;
};

export type AdjustmentDto = {
  id: string;
  ref: string;
  type: AdjustmentType;
  status: AdjustmentStatus;
  invoice: { id: string; number: string } | null;
  payment: { id: string; ref: string } | null;
  amount: number;
  reason: string;
  refundReason: string | null;
  rebill: boolean;
  rebillInvoice: { id: string; number: string } | null;
  requestedBy: string;
  reviewedBy: string | null;
  decidedBy: string | null;
  history: { at: string; by: string; action: string }[];
  createdAt: string;
};

export type FinanceCan = { officer: boolean; manager: boolean; view: boolean; therapist: boolean };

export type FinanceHubDto = {
  today: string;
  billables: BillableDto[];
  invoices: InvoiceDto07[];
  claims: ClaimDto[];
  payments: PaymentDto[];
  statement: StatementLineDto[];
  adjustments: AdjustmentDto[];
  rules: ChargeRules;
  priceItems: {
    id: string;
    code: string;
    name: string;
    unit: string;
    limit: number | null;
    edition: string;
    effectiveFrom: string;
    effectiveTo: string;
    active: boolean;
  }[];
  clinicians: string[];
  services: string[];
  can: FinanceCan;
  alerts: {
    key: string;
    severity: "high" | "medium" | "low";
    title: string;
    detail: string;
    href: string;
  }[];
};
