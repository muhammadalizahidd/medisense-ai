import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Binary, ObjectId, type Db } from "mongodb";
import { z } from "zod";
import { generateJson } from "@/lib/ai/engine";
import { AiError } from "@/lib/ai/types";
import {
  DOCUMENT_MAX_BYTES,
  DOCUMENT_TYPES,
  supportInfo,
  type Support,
} from "@/lib/live/catalogue";
import { hourlyRates } from "@/lib/live/clinical";
import {
  agencyChecklist,
  committingStatuses,
  eligibilityStates,
  evidenceCategories,
  infoSources,
  localRemaining,
  overlapping,
  planFields,
  planInputSchema,
  budgetInputSchema,
  payerInputSchema,
  type priceItemInputSchema,
  readinessGates,
  round2,
  lineEstimate,
  occurrences,
  aud,
  type BookingReadiness,
  type BudgetDto,
  type FundingAlertDto,
  type FundingOverviewDto,
  type FundingPolicy,
  type FundingWorkspaceDto,
  type GateDto,
  type GateKey,
  type GateSeverity,
  type HistoryDto,
  type Management,
  type PayerDto,
  type PlanDto,
  type PlanFieldKey,
  type PriceItemDto,
  type ReadinessDto,
  type EvidenceCategory,
  type InfoSource,
} from "@/lib/live/funding";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { adminIds, audit, publish } from "./live";
import type {
  AgreementDoc,
  ClientDoc,
  FundingBudget,
  FundingHistoryEntry,
  FundingPlanDoc,
  PayerDoc,
  PriceItemDoc,
  ReferralDoc,
  UserDoc,
} from "./models";

/* ------------------------------------------------------------------ roles */

const has = (u: UserDoc, ...roles: string[]) =>
  Boolean(u.staffRoles?.some((r) => roles.includes(r)));
/** Funding/Finance officers verify evidence and keep budgets (section 2, AT-10). */
export const canVerify = (u: UserDoc) => u.role === "admin" && has(u, "Finance", "Super Admin");
/** Intake and Finance create drafts, request information and upload evidence. */
export const canEditFunding = (u: UserDoc) =>
  u.role === "admin" && has(u, "Finance", "Intake Officer", "Super Admin");
export const isClinicalLead = (u: UserDoc) =>
  u.role === "admin" && has(u, "Clinical Lead", "Super Admin");

function mustEdit(u: UserDoc) {
  if (!canEditFunding(u)) {
    throw new UserFacingError("Only Intake or Finance staff can change funding records.", 409);
  }
}
function mustVerify(u: UserDoc, what: string) {
  if (!canVerify(u)) {
    throw new UserFacingError(
      `Only a Funding or Finance officer can ${what}. Ask Finance to review it.`,
      409,
    );
  }
}

/* ------------------------------------------------------------------ helpers */

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export const todayKey = () => new Date(Date.now() + 10 * 3_600_000).toISOString().slice(0, 10);
const daysUntil = (iso: string) =>
  iso ? Math.round((Date.parse(iso) - Date.parse(todayKey())) / 86_400_000) : null;
const fmtDay = (iso: string) =>
  iso
    ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(
        new Date(`${iso}T00:00:00`),
      )
    : "not recorded";

async function nextRef(db: Db, key: string, prefix: string, pad: number) {
  const counter = await db
    .collection<{ _id: string; seq: number }>("counters")
    .findOneAndUpdate(
      { _id: key },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" },
    );
  return `${prefix}-${String(counter?.seq ?? 1).padStart(pad, "0")}`;
}

const entry = (
  by: UserDoc | string,
  action: string,
  extra: Partial<FundingHistoryEntry> = {},
): FundingHistoryEntry => ({
  at: new Date(),
  byName: typeof by === "string" ? by : by.name,
  action,
  ...extra,
});

async function changed(clientId: ObjectId | null) {
  await publish(await adminIds(), "care", { funding: clientId?.toHexString() ?? null });
}

/* ------------------------------------------------------------------ policy */

type PolicyDoc = { _id: "funding" } & FundingPolicy & { updatedBy: string; updatedAt: Date };

const DEFAULT_POLICY: FundingPolicy = {
  reminderDays: [60, 30, 14],
  notAcceptedDays: 7,
  reviewTotalOver: 15000,
  declinePolicy: "Proceed with documented verbal agreement",
  providerEntity: "Medisense Allied Health Pty Ltd (legal entity to confirm)",
};

export async function fundingPolicy(): Promise<FundingPolicy> {
  const { db } = await collections();
  const doc = await db.collection<PolicyDoc>("settings").findOne({ _id: "funding" });
  return doc
    ? {
        reminderDays: doc.reminderDays,
        notAcceptedDays: doc.notAcceptedDays,
        reviewTotalOver: doc.reviewTotalOver,
        declinePolicy: doc.declinePolicy,
        providerEntity: doc.providerEntity,
      }
    : DEFAULT_POLICY;
}

export const policySchema = z.object({
  reminderDays: z.array(z.number().int().min(1).max(365)).min(1).max(5),
  notAcceptedDays: z.number().int().min(1).max(60),
  reviewTotalOver: z.number().min(0).max(1_000_000),
  declinePolicy: z.enum([
    "Proceed with documented verbal agreement",
    "Hold new bookings until resolved",
  ]),
  providerEntity: z.string().trim().min(3).max(160),
});

export async function setFundingPolicy(user: UserDoc, input: FundingPolicy) {
  mustVerify(user, "change funding policy");
  const { db } = await collections();
  await db.collection<PolicyDoc>("settings").updateOne(
    { _id: "funding" },
    {
      $set: {
        ...input,
        reminderDays: [...new Set(input.reminderDays)].sort((a, b) => b - a),
        updatedBy: user.name,
        updatedAt: new Date(),
      },
    },
    { upsert: true },
  );
  await audit(user, "Funding: updated funding policy settings", null);
  await changed(null);
}

/* ------------------------------------------------------------------ price catalogue */

const EDITION = "NDIS Pricing Arrangements 2026–27 (sample values: verify before use)";
const therapyLimits = (national: number) => ({
  National: national,
  Remote: round2(national * 1.4),
  "Very Remote": round2(national * 1.5),
});

/**
 * The starting catalogue. Item numbers are left for Finance to enter from the current NDIS
 * Pricing Arrangements: a support item code is never invented here (section 5).
 */
const SEED_ITEMS: Omit<PriceItemDoc, "updatedBy" | "updatedAt">[] = [
  {
    _id: "ot-therapy",
    code: "",
    name: "Assessment, recommendation, therapy or training: Occupational Therapist",
    category: "Capacity Building: Improved Daily Living",
    unit: "Hour",
    limits: therapyLimits(hourlyRates["Occupational Therapy"]),
    edition: EDITION,
    effectiveFrom: "2026-07-01",
    effectiveTo: "",
    supports: [
      "Functional Capacity Assessment",
      "SIL/ILO Housing Assessment",
      "SDA Housing Assessment",
      "Home Mod Assessment",
      "Assistive Technology Assessment",
      "Occupational Therapy",
    ],
    active: true,
  },
  {
    _id: "speech-therapy",
    code: "",
    name: "Assessment, recommendation, therapy or training: Speech Pathologist",
    category: "Capacity Building: Improved Daily Living",
    unit: "Hour",
    limits: therapyLimits(hourlyRates["Speech Pathology"]),
    edition: EDITION,
    effectiveFrom: "2026-07-01",
    effectiveTo: "",
    supports: ["Speech Therapy", "Swallowing Assessment", "Speech/Language Assessment"],
    active: true,
  },
  {
    _id: "physio-therapy",
    code: "",
    name: "Assessment, recommendation, therapy or training: Physiotherapist",
    category: "Capacity Building: Improved Daily Living",
    unit: "Hour",
    limits: therapyLimits(hourlyRates.Physiotherapy),
    edition: EDITION,
    effectiveFrom: "2026-07-01",
    effectiveTo: "",
    supports: ["Physiotherapy"],
    active: true,
  },
  {
    _id: "ep-therapy",
    code: "",
    name: "Assessment, recommendation, therapy or training: Exercise Physiologist",
    category: "Capacity Building: Improved Daily Living",
    unit: "Hour",
    limits: therapyLimits(hourlyRates["Exercise Physiology"]),
    edition: EDITION,
    effectiveFrom: "2026-07-01",
    effectiveTo: "",
    supports: ["Exercise Physiology"],
    active: true,
  },
  {
    _id: "psych-therapy",
    code: "",
    name: "Assessment, recommendation, therapy or training: Psychologist",
    category: "Capacity Building: Improved Daily Living",
    unit: "Hour",
    limits: therapyLimits(hourlyRates.Psychology),
    edition: EDITION,
    effectiveFrom: "2026-07-01",
    effectiveTo: "",
    supports: ["Psychological Assessment", "Psychological Therapy", "Trauma Therapy"],
    active: true,
  },
  {
    _id: "podiatry-therapy",
    code: "",
    name: "Assessment, recommendation, therapy or training: Podiatrist",
    category: "Capacity Building: Improved Daily Living",
    unit: "Hour",
    limits: therapyLimits(hourlyRates.Podiatry),
    edition: EDITION,
    effectiveFrom: "2026-07-01",
    effectiveTo: "",
    supports: ["Podiatry"],
    active: true,
  },
  {
    _id: "nursing-care",
    code: "",
    name: "Nursing care (continence, wound or catheter, AT): category to confirm",
    category: "To confirm with Finance",
    unit: "Hour",
    limits: { National: hourlyRates.Nursing, Remote: null, "Very Remote": null },
    edition: EDITION,
    effectiveFrom: "2026-07-01",
    effectiveTo: "",
    supports: ["Nursing"],
    active: true,
  },
  {
    _id: "provider-travel",
    code: "",
    name: "Provider travel: non-labour costs (per kilometre)",
    category: "Same budget as the support delivered",
    unit: "Kilometre",
    limits: { National: null, Remote: null, "Very Remote": null },
    edition: EDITION,
    effectiveFrom: "2026-07-01",
    effectiveTo: "",
    supports: [],
    active: true,
  },
  {
    _id: "ot-therapy-2025",
    code: "",
    name: "Occupational Therapist (previous edition)",
    category: "Capacity Building: Improved Daily Living",
    unit: "Hour",
    limits: therapyLimits(hourlyRates["Occupational Therapy"]),
    edition: "NDIS Pricing Arrangements 2025–26 (superseded)",
    effectiveFrom: "2025-07-01",
    effectiveTo: "2026-06-30",
    supports: ["Occupational Therapy"],
    active: false,
  },
];

export async function ensureCatalogue() {
  const { priceItems } = await collections();
  if ((await priceItems.estimatedDocumentCount()) > 0) return;
  const now = new Date();
  await priceItems.insertMany(
    SEED_ITEMS.map((i) => ({ ...i, updatedBy: "Initial catalogue", updatedAt: now })),
  );
}

function priceDto(i: PriceItemDoc): PriceItemDto {
  const today = todayKey();
  return {
    id: i._id,
    code: i.code,
    name: i.name,
    category: i.category,
    unit: i.unit,
    limits: i.limits,
    edition: i.edition,
    effectiveFrom: i.effectiveFrom,
    effectiveTo: i.effectiveTo,
    supports: i.supports,
    active: i.active,
    current: i.active && i.effectiveFrom <= today && (!i.effectiveTo || i.effectiveTo >= today),
  };
}

export async function savePriceItem(user: UserDoc, input: z.infer<typeof priceItemInputSchema>) {
  mustVerify(user, "edit the price catalogue");
  const { priceItems } = await collections();
  const id = input.id || `item-${randomUUID().slice(0, 8)}`;
  const { id: _omit, ...rest } = input;
  void _omit;
  await priceItems.updateOne(
    { _id: id },
    { $set: { ...rest, updatedBy: user.name, updatedAt: new Date() } },
    { upsert: true },
  );
  await audit(user, `Funding: price item "${input.name}" saved (${input.edition})`, null);
  await changed(null);
}

/** Which catalogue item suits a support today. */
function itemFor(items: PriceItemDoc[], support: string) {
  const today = todayKey();
  return (
    items.find(
      (i) =>
        i.active &&
        i.supports.includes(support as Support) &&
        i.effectiveFrom <= today &&
        (!i.effectiveTo || i.effectiveTo >= today),
    ) ?? null
  );
}

/* ------------------------------------------------------------------ plans */

/** The plan in force: one covering today (Active first), else the one ending last. */
export function currentPlan<T extends Pick<FundingPlanDoc, "status" | "start" | "end">>(
  plans: T[],
) {
  const live = plans.filter((p) => p.status !== "Superseded");
  const today = todayKey();
  const covering = live.filter((p) => (!p.start || p.start <= today) && (!p.end || p.end >= today));
  const rank = (p: T) => (p.status === "Active" ? 0 : p.status === "Draft" ? 1 : 2);
  const pick = covering.sort(
    (a, b) => rank(a) - rank(b) || (a.end || "9999").localeCompare(b.end || "9999"),
  )[0];
  return pick ?? live.sort((a, b) => (b.end || "").localeCompare(a.end || ""))[0] ?? null;
}

function fieldValue(plan: FundingPlanDoc, key: PlanFieldKey): string {
  if (key === "fundingPeriods") {
    return plan.fundingPeriods === "Yes"
      ? `Yes (${plan.periods.length} period${plan.periods.length === 1 ? "" : "s"})`
      : plan.fundingPeriods;
  }
  return String(plan[key] ?? "");
}
function reportedValue(plan: FundingPlanDoc, key: PlanFieldKey): string {
  if (key === "fundingPeriods") return plan.reported.fundingPeriods;
  return plan.reported[key];
}

/** The overall plan-evidence gate (section 10). */
function evidenceStatusOf(plan: FundingPlanDoc): PlanDto["evidenceStatus"] {
  const live = plan.evidence.filter((e) => e.status !== "Superseded");
  const fields = Object.values(plan.fields);
  if (live.some((e) => e.status === "Rejected") && !live.some((e) => e.status === "Verified")) {
    return "Rejected";
  }
  const coreVerified = (["ndisNumber", "end"] as PlanFieldKey[]).every(
    (k) => plan.fields[k]?.state === "Verified",
  );
  if (live.some((e) => e.status === "Verified") && coreVerified) return "Verified";
  if (live.length || fields.some((f) => f?.state === "Verified")) return "Under Review";
  return "Missing";
}

/** What a reviewer still needs: rules, so they are labelled as checks rather than AI. */
function missingOf(plan: FundingPlanDoc, payers: PayerDoc[]): string[] {
  const out: string[] = [];
  if (!plan.ndisNumber) out.push("NDIS number");
  if (!plan.end) out.push("Plan end date");
  if (!plan.start) out.push("Plan start date (optional until evidenced)");
  if (!plan.evidence.some((e) => e.status !== "Superseded" && e.status !== "Rejected")) {
    out.push("Plan evidence document (NDIS plan excerpt)");
  }
  if (plan.fundingPeriods === "Unknown") out.push("Whether the plan has funding periods");
  if (plan.fundingPeriods === "Yes" && !plan.periods.length) out.push("Funding period dates");
  if (!plan.budgets.length) out.push("At least one support budget");
  for (const b of plan.budgets) {
    if (b.management === "Unknown") out.push(`How "${b.name}" is managed`);
    if (b.management === "Agency Managed") continue;
    const payer = b.payerId ? payers.find((p) => p._id.equals(b.payerId!)) : null;
    if (!payer) out.push(`Payer for "${b.name}"`);
    else if (payer.kind === "Plan manager" && !payer.email) {
      out.push(`Plan manager email for "${b.name}" (${payer.name})`);
    }
  }
  return out;
}

function budgetDto(
  plan: FundingPlanDoc,
  b: FundingBudget,
  payers: PayerDoc[],
  items: PriceItemDoc[],
  agreements: AgreementDoc[],
  usedByBudget: Map<string, number>,
): BudgetDto {
  const payer = b.payerId ? (payers.find((p) => p._id.equals(b.payerId!)) ?? null) : null;
  const item = items.find((i) => i._id === b.priceItemId) ?? null;
  const period = plan.periods.find((p) => p.id === b.periodId);
  const committed = round2(
    agreements
      .filter((a) => committingStatuses.includes(a.status))
      .flatMap((a) =>
        a.lines.filter((l) => l.budgetId === b.id).map((l) => lineEstimate(l, a.start, a.end)),
      )
      .reduce((s, n) => s + n, 0),
  );
  const used = round2(usedByBudget.get(b.id) ?? 0);
  const remaining = localRemaining(b.verified?.amount ?? null, committed);
  const warnings: string[] = [];
  if (!b.verified) warnings.push("No verified snapshot: available funds are not known.");
  if (b.verified && committed > (b.verified.amount * b.alertThreshold) / 100) {
    warnings.push(
      `Local commitments (${aud(committed)}) are over ${b.alertThreshold}% of the last verified snapshot. Local estimate only.`,
    );
  }
  if (item && !item.active) warnings.push(`Support item "${item.name}" is inactive.`);
  if (payer?.status === "Inactive") warnings.push(`Payer ${payer.name} is inactive: replace it.`);
  if (b.management === "Plan Managed" && payer && payer.kind !== "Plan manager") {
    warnings.push("Plan-managed budget, but the payer isn't a plan manager.");
  }
  if (b.sharing)
    warnings.push("Budget flexibility noted but not confirmed: check before relying on it.");
  return {
    id: b.id,
    name: b.name,
    priceItemId: b.priceItemId,
    priceItem: item ? item.name : "Not linked",
    management: b.management,
    payerId: b.payerId?.toHexString() ?? "",
    payer: b.management === "Agency Managed" ? "NDIA (agency managed)" : (payer?.name ?? null),
    payerStatus: b.management === "Agency Managed" ? null : (payer?.status ?? null),
    periodId: b.periodId,
    period: period ? `${fmtDay(period.start)} to ${fmtDay(period.end)}` : "Whole plan",
    reportedTotal: b.reportedTotal,
    verified: b.verified
      ? {
          amount: b.verified.amount,
          at: b.verified.at.toISOString(),
          by: b.verified.byName,
          source: b.verified.source,
        }
      : null,
    committed,
    used,
    remaining,
    eligibility: b.eligibility,
    eligibilityNote: b.eligibilityNote,
    eligibilityBy: b.eligibilityBy,
    sharing: b.sharing,
    alertThreshold: b.alertThreshold,
    travelAllowed: b.travelAllowed,
    travelNote: b.travelNote,
    warnings,
  };
}

function planDto(
  plan: FundingPlanDoc,
  payers: PayerDoc[],
  items: PriceItemDoc[],
  agreements: AgreementDoc[],
  usedByBudget: Map<string, number>,
): PlanDto {
  return {
    id: plan._id.toHexString(),
    ref: plan.ref,
    status: plan.status,
    clientId: plan.clientId?.toHexString() ?? null,
    referralId: plan.referralId?.toHexString() ?? null,
    participant: plan.participant,
    ndisNumber: plan.ndisNumber,
    start: plan.start,
    end: plan.end,
    management: plan.management,
    fundingPeriods: plan.fundingPeriods,
    periods: plan.periods,
    geography: plan.geography,
    evidenceStatus: evidenceStatusOf(plan),
    fields: planFields.map((f) => {
      const check = plan.fields[f.key];
      const reported = reportedValue(plan, f.key);
      const current = fieldValue(plan, f.key);
      return {
        key: f.key,
        label: f.label,
        reported: reported || "Not given",
        current: current || "Not recorded",
        state: check?.state ?? "Participant-reported",
        source: check?.source || "Referral form",
        note: check?.note ?? "",
        by: check?.byName ?? null,
        at: check?.at?.toISOString() ?? null,
        differs:
          Boolean(reported) &&
          Boolean(current) &&
          (f.key === "fundingPeriods"
            ? !current.startsWith(reported === "Unsure" ? "Unknown" : reported)
            : reported !== current),
      };
    }),
    evidence: plan.evidence
      .slice()
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .map((e) => ({
        id: e.id,
        documentId: e.documentId?.toHexString() ?? null,
        category: e.category,
        name: e.name,
        status: e.status,
        source: e.source,
        version: e.version,
        note: e.note,
        uploadedBy: e.uploadedBy,
        at: e.at.toISOString(),
        reviewedBy: e.reviewedBy,
        reviewedAt: e.reviewedAt?.toISOString() ?? null,
        scan: e.scan
          ? {
              at: e.scan.at.toISOString(),
              by: e.scan.byName,
              ndisNumber: e.scan.ndisNumber,
              start: e.scan.start,
              end: e.scan.end,
              management: e.scan.management,
              fundingPeriods: e.scan.fundingPeriods,
              periods: e.scan.periods,
              budgets: e.scan.budgets,
              confidence: e.scan.confidence,
              applied: e.scan.applied
                ? { by: e.scan.applied.byName, at: e.scan.applied.at.toISOString() }
                : null,
            }
          : null,
      })),
    budgets: plan.budgets.map((b) => budgetDto(plan, b, payers, items, agreements, usedByBudget)),
    infoRequests: plan.infoRequests.map((r) => ({
      id: r.id,
      items: r.items,
      message: r.message,
      to: r.to,
      by: r.byName,
      at: r.at.toISOString(),
      receivedAt: r.receivedAt?.toISOString() ?? null,
      receivedNote: r.receivedNote,
    })),
    agencyChecks: plan.agencyChecks,
    missing: missingOf(plan, payers),
    overlaps: overlapping(plan.periods),
    daysToEnd: daysUntil(plan.end),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

/**
 * The prototype's document "scan": a stable sample set per document, built around what the record
 * already holds so the values look consistent. Nothing is read from the file.
 */
function sampleScan(
  plan: FundingPlanDoc,
  evidenceId: string,
  byName: string,
): NonNullable<FundingPlanDoc["evidence"][number]["scan"]> {
  let seed = 0;
  for (const ch of evidenceId) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const next = () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return seed / 4294967296;
  };
  // A plan document carries a proper 9-digit NDIS number, whatever was typed on the referral.
  const ndisNumber =
    [plan.ndisNumber, plan.reported.ndisNumber].find((n) => /^\d{9}$/.test(n)) ??
    `43${String(Math.floor(next() * 1e7)).padStart(7, "0")}`;
  const end =
    plan.end && plan.end > "2000-01-01" && (!plan.start || plan.start <= plan.end)
      ? plan.end
      : new Date(Date.now() + (120 + Math.floor(next() * 210)) * 86_400_000)
          .toISOString()
          .slice(0, 10);
  const endDate = new Date(`${end}T00:00:00Z`);
  const start =
    plan.start ||
    new Date(
      Date.UTC(endDate.getUTCFullYear() - 1, endDate.getUTCMonth(), endDate.getUTCDate() + 1),
    )
      .toISOString()
      .slice(0, 10);
  const management =
    (["Plan Managed", "Self-Managed", "Agency Managed"] as const).find(
      (m) => m === (plan.management || plan.reported.management),
    ) ?? "Plan Managed";
  const withPeriods =
    plan.fundingPeriods === "Yes" ? true : plan.fundingPeriods === "No" ? false : next() > 0.45;
  const mid = new Date((Date.parse(start) + Date.parse(end)) / 2).toISOString().slice(0, 10);
  const dayAfter = new Date(Date.parse(mid) + 86_400_000).toISOString().slice(0, 10);
  const names = plan.budgets.length
    ? plan.budgets.map((b) => ({ name: b.name, management: b.management }))
    : [{ name: "Capacity Building: Improved Daily Living", management: management as Management }];
  if (next() > 0.5) names.push({ name: "Core: Consumables", management: management as Management });
  return {
    at: new Date(),
    byName,
    ndisNumber,
    start,
    end,
    management,
    fundingPeriods: withPeriods ? "Yes" : "No",
    periods: withPeriods
      ? plan.periods.length
        ? plan.periods.map((p) => ({ start: p.start, end: p.end }))
        : [
            { start, end: mid },
            { start: dayAfter, end },
          ]
      : [],
    budgets: names.map((n) => ({
      ...n,
      management: n.management === "Unknown" ? (management as Management) : n.management,
      amount: Math.round((6000 + next() * 18000) / 10) * 10,
    })),
    confidence: Math.round((0.86 + next() * 0.12) * 100) / 100,
    applied: null,
  };
}

/** Workflow step 1 (AT-01): a draft from the referral, every value labelled participant-reported. */
export async function planFromReferral(
  r: ReferralDoc,
  clientId: ObjectId | null,
  byName: string,
): Promise<FundingPlanDoc | null> {
  const db = await collections();
  const existing = await db.fundingPlans.findOne({ referralId: r._id });
  if (existing) {
    if (clientId && !existing.clientId) {
      await db.fundingPlans.updateOne({ _id: existing._id }, { $set: { clientId } });
      return { ...existing, clientId };
    }
    return existing;
  }
  const f = r.data.funding;
  if (f.source !== "NDIS") return null;
  await ensureCatalogue();
  const items = await db.priceItems.find().toArray();
  const now = new Date();
  const name = `${r.data.participant.firstName} ${r.data.participant.lastName}`.trim();

  // A plan manager named on the referral becomes a draft payer, awaiting verification.
  let payerId: ObjectId | null = null;
  if (f.planType === "Plan Managed" && f.planManagerCompany) {
    const found = await db.payers.findOne({
      kind: "Plan manager",
      name: {
        $regex: `^${f.planManagerCompany.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        $options: "i",
      },
    });
    if (found) payerId = found._id;
    else {
      payerId = new ObjectId();
      await db.payers.insertOne({
        _id: payerId,
        ref: await nextRef(db.db, "payer", "PAY", 4),
        kind: "Plan manager",
        name: f.planManagerCompany,
        contactName: "",
        email: f.planManagerEmail,
        phone: "",
        deliveryMethod: "Email",
        status: "Awaiting Verification",
        clientId: null,
        authority: "",
        abn: "",
        billingNotes: "",
        effectiveFrom: "",
        replacedBy: null,
        verifiedBy: null,
        history: [entry(byName, `Created from referral ${r.reference} (participant-reported)`)],
        createdAt: now,
      });
    }
  }

  // One draft budget per catalogue item the requested supports need.
  const budgets: FundingBudget[] = [];
  // One draft budget per support category the requested services fall in (an NDIS plan funds
  // therapy from one Capacity Building budget, whatever the discipline).
  for (const requested of r.data.supports) {
    const support = requested.support;
    const item = itemFor(items, support);
    const category = item?.category ?? `${support} (category to confirm)`;
    if (
      budgets.some(
        (b) => (items.find((i) => i._id === b.priceItemId)?.category ?? b.name) === category,
      )
    ) {
      continue;
    }
    budgets.push({
      id: randomUUID(),
      name: item?.category.startsWith("Capacity Building")
        ? item.category
        : `${supportInfo(support as Support).discipline ?? support} budget`,
      priceItemId: item?._id ?? "",
      management: (f.planType || "Unknown") as Management,
      payerId: f.planType === "Plan Managed" ? payerId : null,
      periodId: "",
      reportedTotal: null,
      verified: null,
      eligibility: "Unknown",
      eligibilityNote: "",
      eligibilityBy: null,
      sharing: "",
      alertThreshold: 80,
      travelAllowed: false,
      travelNote: "",
    });
  }

  const docs = await db.documents
    .find({ referralId: r._id, kind: "NDIS plan" }, { projection: { data: 0 } })
    .toArray();
  const periods =
    f.fundingPeriods === "Yes"
      ? f.periods.map((p) => ({ id: randomUUID(), start: p.start, end: p.end, note: "" }))
      : [];
  const plan: FundingPlanDoc = {
    _id: new ObjectId(),
    ref: await nextRef(db.db, "fundingPlan", "PLN", 4),
    status: "Draft",
    clientId,
    referralId: r._id,
    participant: name,
    ndisNumber: f.ndisNumber,
    start: "",
    end: f.planEndDate,
    management: f.planType,
    fundingPeriods:
      f.fundingPeriods === "Yes" ? "Yes" : f.fundingPeriods === "No" ? "No" : "Unknown",
    periods,
    geography: "National",
    reported: {
      ndisNumber: f.ndisNumber,
      start: "",
      end: f.planEndDate,
      management: f.planType,
      fundingPeriods: f.fundingPeriods || "Not answered",
      planManagerCompany: f.planManagerCompany,
      planManagerEmail: f.planManagerEmail,
    },
    fields: {},
    evidence: docs.map((d) => ({
      id: randomUUID(),
      documentId: d._id,
      category: "NDIS plan excerpt" as EvidenceCategory,
      name: d.name,
      status: "Pending Review",
      source: "Participant" as InfoSource,
      version: 1,
      note: "Attached to the referral",
      uploadedBy: d.uploadedBy,
      at: d.at,
      reviewedBy: null,
      reviewedAt: null,
    })),
    budgets,
    infoRequests: [],
    agencyChecks: [],
    history: [
      entry(byName, `Draft created from referral ${r.reference}`, {
        reason: "All values are participant-reported until verified",
      }),
    ],
    createdAt: now,
    updatedAt: now,
  };
  // Atomic on the referral: two requests arriving together must not both create a plan.
  const res = await db.fundingPlans.updateOne(
    { referralId: r._id },
    { $setOnInsert: plan },
    { upsert: true },
  );
  if (!res.upsertedId) return db.fundingPlans.findOne({ referralId: r._id });
  return plan;
}

let ensuring: Promise<void> | null = null;

/**
 * Plans for NDIS participants accepted before Module 06, so every participant has a record.
 * One run at a time: overlapping page loads used to create a duplicate draft each.
 */
export function ensurePlans() {
  ensuring ??= createMissingPlans().finally(() => {
    ensuring = null;
  });
  return ensuring;
}

async function createMissingPlans() {
  const db = await collections();
  const clients = await db.clients
    .find({ funding: "NDIS", discharged: { $in: [null, undefined] } })
    .project<{ _id: ObjectId; name: string }>({ _id: 1, name: 1 })
    .toArray();
  if (!clients.length) return;
  const withPlan = new Set(
    (await db.fundingPlans.distinct("clientId", { clientId: { $in: clients.map((c) => c._id) } }))
      .filter(Boolean)
      .map((id) => String(id)),
  );
  for (const c of clients.filter((x) => !withPlan.has(String(x._id)))) {
    const r = await db.referrals.findOne({ clientId: c._id }, { sort: { createdAt: -1 } });
    if (r) {
      await planFromReferral(r, c._id, "Funding setup");
      continue;
    }
    const client = await db.clients.findOne({ _id: c._id });
    const fd = client?.fundingDetails;
    const now = new Date();
    await db.fundingPlans.insertOne({
      _id: new ObjectId(),
      ref: await nextRef(db.db, "fundingPlan", "PLN", 4),
      status: "Draft",
      clientId: c._id,
      referralId: null,
      participant: c.name,
      ndisNumber: fd?.ndisNumber ?? "",
      start: "",
      end: fd?.planEndDate ?? "",
      management: fd?.planType ?? "",
      fundingPeriods: "Unknown",
      periods: [],
      geography: "National",
      reported: {
        ndisNumber: fd?.ndisNumber ?? "",
        start: "",
        end: fd?.planEndDate ?? "",
        management: fd?.planType ?? "",
        fundingPeriods: "Not answered",
        planManagerCompany: fd?.payer ?? "",
        planManagerEmail: fd?.payerEmail ?? "",
      },
      fields: {},
      evidence: [],
      budgets: [],
      infoRequests: [],
      agencyChecks: [],
      history: [entry("Funding setup", "Draft created from the participant's funding details")],
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function loadPlan(id: ObjectId) {
  const { fundingPlans } = await collections();
  const plan = await fundingPlans.findOne({ _id: id });
  if (!plan) throw new UserFacingError("Funding plan not found.", 404);
  return plan;
}

/** AT-11: a second plan for the same participant, with its own dates. */
export async function newPlan(user: UserDoc, clientId: ObjectId) {
  mustEdit(user);
  const db = await collections();
  const client = await db.clients.findOne({ _id: clientId });
  if (!client) throw new UserFacingError("Participant not found.", 404);
  const now = new Date();
  const plan: FundingPlanDoc = {
    _id: new ObjectId(),
    ref: await nextRef(db.db, "fundingPlan", "PLN", 4),
    status: "Draft",
    clientId,
    referralId: null,
    participant: client.name,
    ndisNumber: client.fundingDetails?.ndisNumber ?? "",
    start: "",
    end: "",
    management: "",
    fundingPeriods: "Unknown",
    periods: [],
    geography: "National",
    reported: {
      ndisNumber: "",
      start: "",
      end: "",
      management: "",
      fundingPeriods: "Not answered",
      planManagerCompany: "",
      planManagerEmail: "",
    },
    fields: {},
    evidence: [],
    budgets: [],
    infoRequests: [],
    agencyChecks: [],
    history: [entry(user, "New plan record added")],
    createdAt: now,
    updatedAt: now,
  };
  await db.fundingPlans.insertOne(plan);
  await audit(user, `Funding: added plan ${plan.ref}`, clientId);
  await changed(clientId);
  return { planId: plan._id.toHexString() };
}

export const planActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("update"), plan: planInputSchema }),
  z.object({
    type: z.literal("field-review"),
    key: z.enum(planFields.map((f) => f.key) as [PlanFieldKey, ...PlanFieldKey[]]),
    decision: z.enum(["Verified", "Rejected", "Participant-reported"]),
    source: z.enum(infoSources),
    note: z.string().trim().max(500).default(""),
  }),
  z.object({
    type: z.literal("evidence-review"),
    evidenceId: z.string().max(60),
    decision: z.enum(["Verified", "Rejected", "Pending Review"]),
    note: z.string().trim().max(500).default(""),
  }),
  z.object({ type: z.literal("budget-save"), budget: budgetInputSchema }),
  z.object({ type: z.literal("scan"), evidenceId: z.string().max(60) }),
  z.object({
    type: z.literal("apply-scan"),
    evidenceId: z.string().max(60),
    budgets: z.boolean().default(true),
  }),
  z.object({
    type: z.literal("budget-remove"),
    budgetId: z.string().max(60),
    reason: z.string().trim().min(3).max(300),
  }),
  z.object({
    type: z.literal("budget-verify"),
    budgetId: z.string().max(60),
    amount: z.number().min(0).max(10_000_000),
    source: z.enum(infoSources),
    note: z.string().trim().max(500).default(""),
  }),
  z.object({
    type: z.literal("budget-eligibility"),
    budgetId: z.string().max(60),
    state: z.enum(eligibilityStates),
    note: z.string().trim().max(500).default(""),
  }),
  z.object({
    type: z.literal("info-request"),
    items: z.array(z.string().trim().min(2).max(160)).min(1).max(12),
    message: z.string().trim().min(10).max(2000),
    to: z.string().trim().min(2).max(160),
  }),
  z.object({
    type: z.literal("info-received"),
    requestId: z.string().max(60),
    note: z.string().trim().max(500).default(""),
  }),
  z.object({
    type: z.literal("agency-check"),
    item: z.enum(agencyChecklist),
    checked: z.boolean(),
  }),
  z.object({
    type: z.literal("status"),
    status: z.enum(["Draft", "Active", "Expired", "Superseded"]),
    reason: z.string().trim().min(3).max(300),
  }),
]);
export type PlanAction = z.infer<typeof planActionSchema>;

export async function planAction(user: UserDoc, planId: ObjectId, action: PlanAction) {
  let uploadLink: string | null = null;
  const db = await collections();
  const plan = await loadPlan(planId);
  const now = new Date();
  const log: FundingHistoryEntry[] = [];
  const set: Partial<FundingPlanDoc> = {};

  switch (action.type) {
    case "update": {
      mustEdit(user);
      const next = action.plan;
      const changes: { key: string; from: string; to: string }[] = [];
      const compare = (key: string, from: string, to: string) => {
        if (from !== to) changes.push({ key, from: from || "blank", to: to || "blank" });
      };
      compare("NDIS number", plan.ndisNumber, next.ndisNumber);
      compare("Plan start", plan.start, next.start);
      compare("Plan end", plan.end, next.end);
      compare("Plan management", plan.management, next.management);
      compare("Funding periods", plan.fundingPeriods, next.fundingPeriods);
      compare(
        "Periods",
        plan.periods.map((p) => `${p.start}–${p.end}`).join(", "),
        next.periods.map((p) => `${p.start}–${p.end}`).join(", "),
      );
      compare("Service geography", plan.geography, next.geography);
      if (!changes.length) throw new UserFacingError("Nothing has changed.");
      // Overriding a value that conflicts with what was reported needs a reason (section 4).
      const conflicts =
        (plan.reported.ndisNumber && next.ndisNumber !== plan.reported.ndisNumber) ||
        (plan.reported.end && next.end !== plan.reported.end);
      if (conflicts && !next.reason) {
        throw new UserFacingError(
          "These values differ from what the referral reported. Add a reason for the change.",
        );
      }
      if (next.fundingPeriods === "Yes" && !next.periods.length) {
        throw new UserFacingError("Add at least one funding period, or choose No or Unknown.");
      }
      if (next.periods.some((p) => !p.start || !p.end)) {
        throw new UserFacingError("Each funding period needs a start and an end date.");
      }
      if (next.ndisNumber) {
        const dup = await db.fundingPlans.findOne({
          ndisNumber: next.ndisNumber,
          clientId: { $ne: plan.clientId },
          _id: { $ne: plan._id },
        });
        if (dup) {
          log.push(
            entry(user, "Possible duplicate NDIS number flagged", {
              reason: `Also on ${dup.ref} (${dup.participant}). Not merged: a person decides.`,
            }),
          );
        }
      }
      Object.assign(set, {
        ndisNumber: next.ndisNumber,
        start: next.start,
        end: next.end,
        management: next.management,
        fundingPeriods: next.fundingPeriods,
        periods:
          next.fundingPeriods === "Yes"
            ? next.periods
                .map((p) => ({
                  id: p.id || randomUUID(),
                  start: p.start,
                  end: p.end,
                  note: p.note,
                }))
                .sort((a, b) => a.start.localeCompare(b.start))
            : [],
        geography: next.geography,
      });
      // A changed value goes back to unverified: the old verification was for the old value.
      const fieldsTouched: PlanFieldKey[] = [];
      if (plan.ndisNumber !== next.ndisNumber) fieldsTouched.push("ndisNumber");
      if (plan.start !== next.start) fieldsTouched.push("start");
      if (plan.end !== next.end) fieldsTouched.push("end");
      if (plan.management !== next.management) fieldsTouched.push("management");
      if (plan.fundingPeriods !== next.fundingPeriods || changes.some((c) => c.key === "Periods")) {
        fieldsTouched.push("fundingPeriods");
      }
      const fields = { ...plan.fields };
      for (const k of fieldsTouched) {
        if (fields[k]?.state === "Verified") {
          fields[k] = {
            state: "Participant-reported",
            source: next.source,
            note: "Changed after verification",
            byName: user.name,
            at: now,
          };
        }
      }
      set.fields = fields;
      for (const c of changes) {
        log.push(
          entry(user, `${c.key} changed`, {
            from: c.from,
            to: c.to,
            reason: next.reason || `Source: ${next.source}`,
          }),
        );
      }
      if (overlapping(set.periods ?? [])) {
        log.push(entry(user, "Overlapping funding periods flagged for review"));
      }
      break;
    }
    case "field-review": {
      if (action.decision === "Verified") mustVerify(user, "verify plan details");
      else mustEdit(user);
      if (action.decision === "Rejected" && !action.note) {
        throw new UserFacingError("Give the reason for rejecting this value.");
      }
      const label = planFields.find((f) => f.key === action.key)!.label;
      const value = fieldValue(plan, action.key);
      if (action.decision === "Verified" && !value) {
        throw new UserFacingError(`Record the ${label.toLowerCase()} before verifying it.`);
      }
      set.fields = {
        ...plan.fields,
        [action.key]: {
          state: action.decision,
          source: action.source,
          note: action.note,
          byName: user.name,
          at: now,
        },
      };
      log.push(
        entry(user, `${label} ${action.decision.toLowerCase()}`, {
          to: value,
          reason: [`Source: ${action.source}`, action.note].filter(Boolean).join(". "),
        }),
      );
      break;
    }
    case "evidence-review": {
      if (action.decision === "Verified") mustVerify(user, "verify plan evidence");
      else mustEdit(user);
      if (action.decision === "Rejected" && !action.note) {
        throw new UserFacingError("Give the reason for rejecting this evidence (AT-08).");
      }
      const ev = plan.evidence.find((e) => e.id === action.evidenceId);
      if (!ev) throw new UserFacingError("Evidence not found.", 404);
      if (ev.status === "Superseded")
        throw new UserFacingError("A replaced version can't be reviewed.", 409);
      set.evidence = plan.evidence.map((e) =>
        e.id === ev.id
          ? {
              ...e,
              status: action.decision,
              note: action.note || e.note,
              reviewedBy: user.name,
              reviewedAt: now,
            }
          : e,
      );
      log.push(
        entry(user, `Evidence "${ev.name}" v${ev.version} ${action.decision.toLowerCase()}`, {
          reason: action.note,
        }),
      );
      break;
    }
    case "scan": {
      mustEdit(user);
      const ev = plan.evidence.find((e) => e.id === action.evidenceId);
      if (!ev) throw new UserFacingError("Evidence not found.", 404);
      if (ev.status === "Superseded") throw new UserFacingError("Scan the current version.", 409);
      set.evidence = plan.evidence.map((e) =>
        e.id === ev.id ? { ...e, scan: sampleScan(plan, ev.id, user.name) } : e,
      );
      log.push(
        entry(user, `Document read: ${ev.name} v${ev.version}`, {
          reason: "Simulated scan: sample values",
        }),
      );
      break;
    }
    case "apply-scan": {
      mustEdit(user);
      const ev = plan.evidence.find((e) => e.id === action.evidenceId);
      if (!ev?.scan) throw new UserFacingError("Scan the document first.", 409);
      const v = ev.scan;
      const from = `Read from ${ev.name} v${ev.version} (simulated scan)`;
      const touched: { key: PlanFieldKey; label: string; before: string; after: string }[] = [
        {
          key: "ndisNumber" as const,
          label: "NDIS number",
          before: plan.ndisNumber,
          after: v.ndisNumber,
        },
        { key: "start" as const, label: "Plan start", before: plan.start, after: v.start },
        { key: "end" as const, label: "Plan end", before: plan.end, after: v.end },
        {
          key: "management" as const,
          label: "Plan management",
          before: plan.management,
          after: v.management,
        },
        {
          key: "fundingPeriods" as const,
          label: "Funding periods",
          before: plan.fundingPeriods,
          after: v.fundingPeriods,
        },
      ].filter((t) => t.before !== t.after || t.key === "fundingPeriods");
      Object.assign(set, {
        ndisNumber: v.ndisNumber,
        start: v.start,
        end: v.end,
        management: v.management,
        fundingPeriods: v.fundingPeriods,
        periods: v.periods.map((p) => ({
          id: randomUUID(),
          start: p.start,
          end: p.end,
          note: "From the plan document",
        })),
      });
      // Applied values are recorded, not verified: Finance still checks each one (section 4).
      const fields = { ...plan.fields };
      for (const t of touched) {
        fields[t.key] = {
          state: "Participant-reported",
          source: "NDIA document",
          note: from,
          byName: user.name,
          at: now,
        };
      }
      set.fields = fields;
      if (action.budgets) {
        const budgets = [...plan.budgets];
        for (const sb of v.budgets) {
          const match = budgets.find((b) => b.name === sb.name);
          if (match) match.reportedTotal = sb.amount;
          else {
            budgets.push({
              id: randomUUID(),
              name: sb.name,
              priceItemId: "",
              management: sb.management,
              payerId: null,
              periodId: "",
              reportedTotal: sb.amount,
              verified: null,
              eligibility: "Unknown",
              eligibilityNote: "",
              eligibilityBy: null,
              sharing: "",
              alertThreshold: 80,
              travelAllowed: false,
              travelNote: "",
            });
          }
        }
        set.budgets = budgets;
      }
      set.evidence = plan.evidence.map((e) =>
        e.id === ev.id && e.scan
          ? { ...e, scan: { ...e.scan, applied: { byName: user.name, at: now } } }
          : e,
      );
      for (const t of touched)
        log.push(
          entry(user, `${t.label} set from the document`, {
            from: t.before || "blank",
            to: t.after,
            reason: from,
          }),
        );
      if (action.budgets)
        log.push(
          entry(user, `Budget amounts recorded from the document (reported, not verified)`, {
            to: v.budgets.map((b) => `${b.name} ${aud(b.amount)}`).join("; "),
            reason: from,
          }),
        );
      break;
    }
    case "budget-save": {
      mustEdit(user);
      const input = action.budget;
      const payerId =
        input.payerId && ObjectId.isValid(input.payerId) ? new ObjectId(input.payerId) : null;
      if (input.management === "Plan Managed" && payerId) {
        const payer = await db.payers.findOne({ _id: payerId });
        if (payer?.kind !== "Plan manager") {
          throw new UserFacingError(
            "A plan-managed budget is paid by a plan manager. Choose one from the directory.",
          );
        }
      }
      if (input.management === "Self-Managed" && payerId) {
        const payer = await db.payers.findOne({ _id: payerId });
        if (payer?.kind !== "Self-managed payer") {
          throw new UserFacingError(
            "A self-managed budget is paid by an authorised self-managed payer.",
          );
        }
      }
      if (input.management === "Agency Managed" && payerId) {
        throw new UserFacingError("Agency-managed budgets are claimed from the NDIA, not a payer.");
      }
      if (input.periodId && !plan.periods.some((p) => p.id === input.periodId)) {
        throw new UserFacingError("Choose one of this plan's funding periods.");
      }
      const existing = input.id ? plan.budgets.find((b) => b.id === input.id) : null;
      if (existing) {
        const diffs: string[] = [];
        if (existing.management !== input.management)
          diffs.push(`management ${existing.management} → ${input.management}`);
        if (String(existing.payerId ?? "") !== String(payerId ?? "")) diffs.push("payer changed");
        if (existing.reportedTotal !== input.reportedTotal)
          diffs.push(`reported total ${aud(existing.reportedTotal)} → ${aud(input.reportedTotal)}`);
        if (existing.priceItemId !== input.priceItemId) diffs.push("support item changed");
        if (diffs.length && !input.reason) {
          throw new UserFacingError("Give a change reason: earlier values are kept in history.");
        }
        set.budgets = plan.budgets.map((b) =>
          b.id === existing.id
            ? {
                ...b,
                name: input.name,
                priceItemId: input.priceItemId,
                management: input.management,
                payerId,
                periodId: input.periodId,
                reportedTotal: input.reportedTotal,
                sharing: input.sharing,
                alertThreshold: input.alertThreshold,
                travelAllowed: input.travelAllowed,
                travelNote: input.travelNote,
                // A payer change mid-plan needs a fresh look at agreements and billing (section 11).
                ...(String(existing.payerId ?? "") !== String(payerId ?? "")
                  ? { eligibility: "Needs Review" as const }
                  : {}),
              }
            : b,
        );
        log.push(
          entry(user, `Budget "${input.name}" updated`, {
            from: diffs.join("; ") || "details",
            reason: input.reason,
          }),
        );
      } else {
        set.budgets = [
          ...plan.budgets,
          {
            id: randomUUID(),
            name: input.name,
            priceItemId: input.priceItemId,
            management: input.management,
            payerId,
            periodId: input.periodId,
            reportedTotal: input.reportedTotal,
            verified: null,
            eligibility: "Unknown",
            eligibilityNote: "",
            eligibilityBy: null,
            sharing: input.sharing,
            alertThreshold: input.alertThreshold,
            travelAllowed: input.travelAllowed,
            travelNote: input.travelNote,
          },
        ];
        log.push(entry(user, `Budget "${input.name}" added (${input.management})`));
      }
      break;
    }
    case "budget-remove": {
      mustEdit(user);
      const b = plan.budgets.find((x) => x.id === action.budgetId);
      if (!b) throw new UserFacingError("Budget not found.", 404);
      const used = await db.agreements.countDocuments({
        "lines.budgetId": b.id,
        status: { $in: [...committingStatuses] },
      });
      if (used)
        throw new UserFacingError(
          "An agreement line uses this budget. Change that line first.",
          409,
        );
      set.budgets = plan.budgets.filter((x) => x.id !== b.id);
      log.push(entry(user, `Budget "${b.name}" removed`, { reason: action.reason }));
      break;
    }
    case "budget-verify": {
      mustVerify(user, "record a verified funding snapshot");
      const b = plan.budgets.find((x) => x.id === action.budgetId);
      if (!b) throw new UserFacingError("Budget not found.", 404);
      set.budgets = plan.budgets.map((x) =>
        x.id === b.id
          ? {
              ...x,
              verified: {
                amount: round2(action.amount),
                at: now,
                byName: user.name,
                source: action.source,
              },
            }
          : x,
      );
      log.push(
        entry(user, `Verified snapshot for "${b.name}"`, {
          from: aud(b.verified?.amount ?? null),
          to: aud(action.amount),
          reason: [`Source: ${action.source}`, action.note].filter(Boolean).join(". "),
        }),
      );
      break;
    }
    case "budget-eligibility": {
      if (action.state === "Confirmed" || action.state === "Not Confirmed") {
        mustVerify(user, "confirm service eligibility for a budget");
      } else mustEdit(user);
      if (
        (action.state === "Confirmed" || action.state === "Not Confirmed") &&
        action.note.length < 5
      ) {
        throw new UserFacingError("Give the rationale or evidence for this decision.");
      }
      const b = plan.budgets.find((x) => x.id === action.budgetId);
      if (!b) throw new UserFacingError("Budget not found.", 404);
      set.budgets = plan.budgets.map((x) =>
        x.id === b.id
          ? {
              ...x,
              eligibility: action.state,
              eligibilityNote: action.note,
              eligibilityBy: user.name,
            }
          : x,
      );
      log.push(
        entry(user, `Service eligibility for "${b.name}"`, {
          from: b.eligibility,
          to: action.state,
          reason: action.note,
        }),
      );
      break;
    }
    case "info-request": {
      mustEdit(user);
      const token = randomBytes(24).toString("base64url");
      uploadLink = `/upload/${token}`;
      set.infoRequests = [
        ...plan.infoRequests,
        {
          id: randomUUID(),
          items: action.items,
          message: action.message,
          to: action.to,
          byName: user.name,
          at: now,
          receivedAt: null,
          receivedNote: "",
          link: { hash: sha256(token), expiresAt: new Date(Date.now() + 14 * 86_400_000) },
        },
      ];
      log.push(
        entry(user, `Requested information from ${action.to}`, {
          to: action.items.join("; "),
          reason: "Secure upload link open for 14 days (delivery simulated)",
        }),
      );
      break;
    }
    case "info-received": {
      mustEdit(user);
      const req = plan.infoRequests.find((r) => r.id === action.requestId);
      if (!req) throw new UserFacingError("Request not found.", 404);
      set.infoRequests = plan.infoRequests.map((r) =>
        r.id === req.id ? { ...r, receivedAt: now, receivedNote: action.note } : r,
      );
      log.push(entry(user, `Information received from ${req.to}`, { reason: action.note }));
      break;
    }
    case "agency-check": {
      mustVerify(user, "complete the agency-managed checklist");
      set.agencyChecks = action.checked
        ? [...new Set([...plan.agencyChecks, action.item])]
        : plan.agencyChecks.filter((c) => c !== action.item);
      log.push(entry(user, `${action.checked ? "Confirmed" : "Unticked"}: ${action.item}`));
      break;
    }
    case "status": {
      mustVerify(user, "change a plan's status");
      if (action.status === "Active" && evidenceStatusOf(plan) !== "Verified") {
        throw new UserFacingError(
          "Verify the plan evidence, NDIS number and end date before making it active.",
          409,
        );
      }
      set.status = action.status;
      log.push(
        entry(user, "Plan status changed", {
          from: plan.status,
          to: action.status,
          reason: action.reason,
        }),
      );
      break;
    }
  }

  await db.fundingPlans.updateOne(
    { _id: plan._id },
    { $set: { ...set, updatedAt: now }, $push: { history: { $each: log } } },
  );
  for (const l of log) {
    await audit(user, `Funding ${plan.ref}: ${l.action}${l.to ? ` → ${l.to}` : ""}`, plan.clientId);
  }
  await changed(plan.clientId);
  return { ok: true, link: uploadLink };
}

/** AT-08: upload evidence, or a new version that supersedes the old one (never deleted). */
export async function uploadEvidence(
  user: UserDoc,
  planId: ObjectId,
  file: { name: string; type: string; bytes: Buffer },
  meta: { category: string; source: string; replaceId: string },
) {
  mustEdit(user);
  if (!(DOCUMENT_TYPES as readonly string[]).includes(file.type)) {
    throw new UserFacingError(`${file.name}: upload a PDF, JPG or PNG.`);
  }
  if (file.bytes.length > DOCUMENT_MAX_BYTES)
    throw new UserFacingError(`${file.name} is larger than 5 MB.`);
  const category = (evidenceCategories as readonly string[]).includes(meta.category)
    ? (meta.category as EvidenceCategory)
    : "Other";
  const source = (infoSources as readonly string[]).includes(meta.source)
    ? (meta.source as InfoSource)
    : "Other";
  const db = await collections();
  const plan = await loadPlan(planId);
  const old = meta.replaceId ? plan.evidence.find((e) => e.id === meta.replaceId) : null;
  if (meta.replaceId && !old)
    throw new UserFacingError("The version to replace wasn't found.", 404);
  const now = new Date();
  const documentId = new ObjectId();
  await db.documents.insertOne({
    _id: documentId,
    referralId: plan.referralId,
    clientId: plan.clientId,
    kind: category === "NDIS plan excerpt" ? "NDIS plan" : "Other",
    name: file.name.slice(0, 160),
    mime: file.type,
    size: file.bytes.length,
    data: new Binary(file.bytes),
    uploadedBy: user.name,
    at: now,
    status: "Pending review",
    version: (old?.version ?? 0) + 1,
    supersedes: old?.documentId ?? null,
    replacedBy: null,
    review: null,
    area: "funding",
  });
  if (old?.documentId) {
    await db.documents.updateOne(
      { _id: old.documentId },
      { $set: { replacedBy: documentId, status: "Superseded" } },
    );
  }
  const evidence = [
    ...plan.evidence.map((e) =>
      old && e.id === old.id ? { ...e, status: "Superseded" as const } : e,
    ),
    {
      id: randomUUID(),
      documentId,
      category: old?.category ?? category,
      name: file.name.slice(0, 160),
      status: "Pending Review" as const,
      source,
      version: (old?.version ?? 0) + 1,
      note: old
        ? `Replaces v${old.version}${old.status === "Rejected" ? ` (rejected: ${old.note})` : ""}`
        : "",
      uploadedBy: user.name,
      at: now,
      reviewedBy: null,
      reviewedAt: null,
    },
  ];
  const log = entry(
    user,
    old
      ? `Evidence replaced with v${old.version + 1}: ${file.name}`
      : `Evidence uploaded: ${file.name}`,
    {
      reason: `Category: ${category}. Source: ${source}`,
    },
  );
  // A plan document fills the plan's details when it's uploaded. Prototype: the values come from
  // the record's own data (a stable sample set per document); the file itself is not read.
  const fill: Partial<FundingPlanDoc> = {};
  const extra: FundingHistoryEntry[] = [];
  const effective = old?.category ?? category;
  if (effective === "NDIS plan excerpt" || effective === "Funding period schedule") {
    const v = sampleScan(plan, evidence[evidence.length - 1]!.id, user.name);
    const from = `Recorded from ${file.name.slice(0, 80)}`;
    const changes: [PlanFieldKey, string, string, string][] = [
      ["ndisNumber", "NDIS number", plan.ndisNumber, v.ndisNumber],
      ["start", "Plan start", plan.start, v.start],
      ["end", "Plan end", plan.end, v.end],
      ["management", "Plan management", plan.management, v.management],
      ["fundingPeriods", "Funding periods", plan.fundingPeriods, v.fundingPeriods],
    ];
    const fields = { ...plan.fields };
    for (const [key, label, before, after] of changes) {
      if (before === after) continue;
      fields[key] = {
        state: "Participant-reported",
        source: "NDIA document",
        note: from,
        byName: user.name,
        at: now,
      };
      extra.push(
        entry(user, `${label} recorded from the plan document`, {
          from: before || "blank",
          to: after,
          reason: from,
        }),
      );
    }
    const budgets = plan.budgets.map((b) => ({ ...b }));
    const added: string[] = [];
    for (const sb of v.budgets) {
      const match = budgets.find((b) => b.name === sb.name);
      if (match) {
        if (match.reportedTotal === null) {
          match.reportedTotal = sb.amount;
          added.push(`${sb.name} ${aud(sb.amount)}`);
        }
      } else {
        budgets.push({
          id: randomUUID(),
          name: sb.name,
          priceItemId: "",
          management: sb.management,
          payerId: null,
          periodId: "",
          reportedTotal: sb.amount,
          verified: null,
          eligibility: "Unknown",
          eligibilityNote: "",
          eligibilityBy: null,
          sharing: "",
          alertThreshold: 80,
          travelAllowed: false,
          travelNote: "",
        });
        added.push(`${sb.name} ${aud(sb.amount)}`);
      }
    }
    Object.assign(fill, {
      ndisNumber: v.ndisNumber,
      start: v.start,
      end: v.end,
      management: v.management,
      fundingPeriods: v.fundingPeriods,
      periods: v.periods.map((pp, i) => ({
        id: plan.periods[i]?.id ?? randomUUID(),
        start: pp.start,
        end: pp.end,
        note: plan.periods[i]?.note ?? "",
      })),
      fields,
      budgets,
    });
    if (added.length) {
      extra.push(
        entry(user, "Budget amounts recorded from the plan document (reported, not verified)", {
          to: added.join("; "),
          reason: from,
        }),
      );
    }
  }
  await db.fundingPlans.updateOne(
    { _id: plan._id },
    { $set: { evidence, ...fill, updatedAt: now }, $push: { history: { $each: [log, ...extra] } } },
  );
  await audit(user, `Funding ${plan.ref}: ${log.action}`, plan.clientId);
  await changed(plan.clientId);
}

/* ------------------------------------------------------------------ payers */

function payerDto(p: PayerDoc, clients: Map<string, string>, plans: FundingPlanDoc[]): PayerDto {
  return {
    id: p._id.toHexString(),
    ref: p.ref,
    kind: p.kind,
    name: p.name,
    contactName: p.contactName,
    email: p.email,
    phone: p.phone,
    deliveryMethod: p.deliveryMethod,
    status: p.status,
    clientId: p.clientId?.toHexString() ?? "",
    client: p.clientId ? (clients.get(p.clientId.toHexString()) ?? null) : null,
    authority: p.authority,
    abn: p.abn,
    billingNotes: p.billingNotes,
    effectiveFrom: p.effectiveFrom,
    replacedBy: p.replacedBy?.toHexString() ?? null,
    verifiedBy: p.verifiedBy,
    usedBy: plans.filter((pl) => pl.budgets.some((b) => b.payerId?.equals(p._id))).length,
    history: p.history
      .slice()
      .reverse()
      .map((h) => ({
        at: h.at.toISOString(),
        by: h.byName,
        action: [h.action, h.reason].filter(Boolean).join(": "),
      })),
  };
}

export const payerActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("save"), payer: payerInputSchema }),
  z.object({
    type: z.literal("verify"),
    note: z.string().trim().min(3, "Say how the contact was confirmed").max(300),
  }),
  z.object({ type: z.literal("inactivate"), reason: z.string().trim().min(3).max(300) }),
  z.object({
    type: z.literal("replace"),
    replacementId: z.string().max(40),
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the effective date"),
    reason: z.string().trim().min(3).max(300),
  }),
]);
export type PayerAction = z.infer<typeof payerActionSchema>;

export async function payerAction(user: UserDoc, id: ObjectId | null, action: PayerAction) {
  mustEdit(user);
  const db = await collections();
  const now = new Date();
  if (!id) {
    if (action.type !== "save") throw new UserFacingError("Save the payer first.");
    const input = action.payer;
    const _id = new ObjectId();
    await db.payers.insertOne({
      _id,
      ref: await nextRef(db.db, "payer", "PAY", 4),
      kind: input.kind,
      name: input.name,
      contactName: input.contactName,
      email: input.email,
      phone: input.phone,
      deliveryMethod: input.deliveryMethod,
      status: input.email || input.phone ? "Awaiting Verification" : "Draft",
      clientId:
        input.clientId && ObjectId.isValid(input.clientId) ? new ObjectId(input.clientId) : null,
      authority: input.authority,
      abn: input.abn,
      billingNotes: input.billingNotes,
      effectiveFrom: input.effectiveFrom,
      replacedBy: null,
      verifiedBy: null,
      history: [entry(user, "Payer added")],
      createdAt: now,
    });
    await audit(user, `Funding: payer ${input.name} added`, null);
    await changed(null);
    return { payerId: _id.toHexString() };
  }
  const payer = await db.payers.findOne({ _id: id });
  if (!payer) throw new UserFacingError("Payer not found.", 404);
  const set: Partial<PayerDoc> = {};
  let log: FundingHistoryEntry;
  switch (action.type) {
    case "save": {
      const input = action.payer;
      const contactChanged = input.email !== payer.email || input.phone !== payer.phone;
      Object.assign(set, {
        kind: input.kind,
        name: input.name,
        contactName: input.contactName,
        email: input.email,
        phone: input.phone,
        deliveryMethod: input.deliveryMethod,
        authority: input.authority,
        abn: input.abn,
        billingNotes: input.billingNotes,
        effectiveFrom: input.effectiveFrom,
        // New contact details need confirming again.
        ...(contactChanged && payer.status === "Verified"
          ? { status: "Awaiting Verification" as const, verifiedBy: null }
          : {}),
      });
      log = entry(user, "Payer details updated", {
        from: contactChanged ? [payer.email, payer.phone].filter(Boolean).join(", ") : undefined,
        to: contactChanged ? [input.email, input.phone].filter(Boolean).join(", ") : undefined,
      });
      break;
    }
    case "verify": {
      mustVerify(user, "verify a payer");
      if (payer.status === "Inactive")
        throw new UserFacingError("An inactive payer can't be verified.", 409);
      if (payer.kind === "Plan manager" && !payer.email) {
        throw new UserFacingError("Add the plan manager's email before verifying.", 409);
      }
      set.status = "Verified";
      set.verifiedBy = user.name;
      log = entry(user, "Payer contact verified", { reason: action.note });
      break;
    }
    case "inactivate": {
      mustVerify(user, "inactivate a payer");
      set.status = "Inactive";
      log = entry(user, "Payer made inactive", { reason: action.reason });
      break;
    }
    case "replace": {
      mustVerify(user, "replace a payer");
      if (!ObjectId.isValid(action.replacementId))
        throw new UserFacingError("Choose the new payer.");
      const next = await db.payers.findOne({ _id: new ObjectId(action.replacementId) });
      if (!next || next._id.equals(payer._id))
        throw new UserFacingError("Choose a different payer.");
      // Budgets move to the new payer from the effective date; issued invoices keep theirs (AT-27).
      const plans = await db.fundingPlans.find({ "budgets.payerId": payer._id }).toArray();
      for (const pl of plans) {
        await db.fundingPlans.updateOne(
          { _id: pl._id },
          {
            $set: {
              budgets: pl.budgets.map((b) =>
                b.payerId?.equals(payer._id)
                  ? { ...b, payerId: next._id, eligibility: "Needs Review" as const }
                  : b,
              ),
              updatedAt: now,
            },
            $push: {
              history: entry(user, `Payer changed mid-plan: ${payer.name} → ${next.name}`, {
                reason: `${action.reason}. Effective ${action.effectiveFrom}. Earlier invoices keep ${payer.name}.`,
              }),
            },
          },
        );
      }
      await db.payers.updateOne(
        { _id: next._id },
        {
          $set: { effectiveFrom: action.effectiveFrom },
          $push: { history: entry(user, `Replaces ${payer.name}`, { reason: action.reason }) },
        },
      );
      set.status = "Inactive";
      set.replacedBy = next._id;
      log = entry(user, `Replaced by ${next.name} from ${action.effectiveFrom}`, {
        reason: action.reason,
      });
      break;
    }
  }
  await db.payers.updateOne({ _id: payer._id }, { $set: set, $push: { history: log } });
  await audit(user, `Funding: payer ${payer.name}: ${log.action}`, payer.clientId);
  await changed(payer.clientId);
  return { ok: true };
}

/* ------------------------------------------------------------------ AI completeness check */

/**
 * Workflow step 2: the rules list what is missing; AI then flags mismatches and drafts a
 * non-clinical follow-up for a person to review and send. It verifies nothing.
 */
export async function aiFundingCheck(user: UserDoc, planId: ObjectId) {
  mustEdit(user);
  const db = await collections();
  const plan = await loadPlan(planId);
  const payers = await db.payers.find().toArray();
  const missing = missingOf(plan, payers);
  const client = plan.clientId ? await db.clients.findOne({ _id: plan.clientId }) : null;
  const contacts = (client?.contacts ?? [])
    .filter((c) => c.state !== "Revoked")
    .map((c) => ({ name: c.name, role: c.role }));
  try {
    const out = await generateJson("funding-check", {
      system:
        "You help an NDIS provider's intake and finance staff review a participant's funding record. Using only the record given: (1) list mismatches or risks (reported vs recorded values that differ, plan end date passed or within 60 days, funding periods unknown, budgets with unknown management, plan-managed budgets without a plan manager email); (2) draft a short, warm, non-clinical message asking the right person for the missing items. Never state that funding is available, never infer eligibility, never mention diagnosis or clinical details, never promise outcomes. The staff member verifies and sends it.",
      user: JSON.stringify({
        today: todayKey(),
        participant: plan.participant,
        recorded: {
          ndisNumberPresent: Boolean(plan.ndisNumber),
          start: plan.start,
          end: plan.end,
          management: plan.management,
          fundingPeriods: plan.fundingPeriods,
          periods: plan.periods,
          budgets: plan.budgets.map((b) => ({
            name: b.name,
            management: b.management,
            payer: payers.find((p) => b.payerId && p._id.equals(b.payerId))?.name ?? null,
            payerEmailPresent: Boolean(
              payers.find((p) => b.payerId && p._id.equals(b.payerId))?.email,
            ),
            verified: Boolean(b.verified),
          })),
          evidence: plan.evidence.map((e) => ({ category: e.category, status: e.status })),
        },
        reported: { ...plan.reported, ndisNumber: plan.reported.ndisNumber ? "given" : "" },
        missingByRules: missing,
        possibleRecipients: contacts,
      }),
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["flags", "recipient", "subject", "message"],
        properties: {
          flags: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "why"],
              properties: { label: { type: "string" }, why: { type: "string" } },
            },
          },
          recipient: { type: "string" },
          subject: { type: "string" },
          message: { type: "string" },
        },
      },
      schemaName: "funding_check",
      maxTokens: 1100,
    });
    const parsed = JSON.parse(out.text) as {
      flags: { label: string; why: string }[];
      recipient: string;
      subject: string;
      message: string;
    };
    await db.fundingPlans.updateOne(
      { _id: plan._id },
      {
        $push: {
          history: entry(user, "AI completeness check run", {
            reason: `${parsed.flags.length} flags; draft prepared for review`,
          }),
        },
      },
    );
    return { missing, ...parsed };
  } catch (error) {
    if (error instanceof AiError)
      throw new UserFacingError(`AI isn't available: ${error.message}`, 409);
    throw new UserFacingError("The AI answer couldn't be read. Try again.", 409);
  }
}

/* ------------------------------------------------------------------ readiness */

type Ctx = {
  plans: FundingPlanDoc[];
  agreements: AgreementDoc[];
  payers: PayerDoc[];
  reviews: Map<string, { byName: string; at: Date; note: string }>;
  referral: ReferralDoc | null;
  policy: FundingPolicy;
};

/** The latest version of each agreement chain, ignoring superseded and cancelled ones. */
function currentAgreements(agreements: AgreementDoc[]) {
  const byRoot = new Map<string, AgreementDoc>();
  for (const a of agreements) {
    if (a.status === "Cancelled") continue;
    const key = a.rootId.toHexString();
    const prev = byRoot.get(key);
    // A signed version stays in force until its amendment is signed.
    if (!prev) byRoot.set(key, a);
    else if (prev.status === "Signed" && a.status !== "Signed") continue;
    else if (a.status === "Signed" && prev.status !== "Signed") byRoot.set(key, a);
    else if (a.version > prev.version) byRoot.set(key, a);
  }
  return [...byRoot.values()].filter((a) => a.status !== "Superseded");
}

function gate(
  key: GateKey,
  status: string,
  severity: GateSeverity,
  next: string,
  href: string,
  reviews: Ctx["reviews"],
  clientId: string,
  needId: string,
): GateDto {
  const def = readinessGates.find((g) => g.key === key)!;
  const reviewed = reviews.get(`${clientId}:${needId}:${key}`) ?? null;
  return {
    key,
    label: def.label,
    status,
    // A reviewed warning is accepted by a person; a hard block stays a block.
    severity: severity === "warn" && reviewed ? "ok" : severity,
    owner: def.owner,
    next,
    href,
    reviewed: reviewed
      ? { by: reviewed.byName, at: reviewed.at.toISOString(), note: reviewed.note }
      : null,
  };
}

/** Section 10: independent gates per service request; never one blended status. */
export function readinessFor(client: ClientDoc, ctx: Ctx): ReadinessDto[] {
  const id = client._id.toHexString();
  const base = `/care/funding/${id}`;
  const today = todayKey();
  const plan = currentPlan(ctx.plans);
  const current = currentAgreements(ctx.agreements);
  const consent = client.consents?.find((c) => c.key === "general-care")?.state ?? "Not asked";
  const triage = ctx.referral?.triage?.decision ?? null;
  return client.needs
    .filter((n) => n.status !== "completed")
    .map((n) => {
      const need = n.id;
      const service = ctx.referral?.services?.find((s) => s.needId === need);
      const clinicalReview = ctx.reviews.get(`${id}:${need}:clinical-state`);
      const clinicalState = clinicalReview?.note.startsWith("Not Cleared")
        ? "Not Cleared"
        : service?.decision === "Declined"
          ? "Not Cleared"
          : triage === "Accepted" || !ctx.referral
            ? "Cleared"
            : "Pending";
      const gates: GateDto[] = [];
      gates.push(
        gate(
          "clinical",
          clinicalState,
          clinicalState === "Cleared" ? "ok" : clinicalState === "Not Cleared" ? "block" : "warn",
          clinicalState === "Cleared"
            ? "Cleared at clinical triage"
            : "Clinical Lead confirms scope and suitability",
          `/care/${id}`,
          ctx.reviews,
          id,
          need,
        ),
      );

      if (client.funding !== "NDIS") {
        gates.push(
          gate(
            "evidence",
            "Not applicable",
            "ok",
            `${client.funding} funded: no NDIS plan`,
            base,
            ctx.reviews,
            id,
            need,
          ),
        );
      } else {
        const ev = plan ? evidenceStatusOf(plan) : "Missing";
        gates.push(
          gate(
            "evidence",
            ev,
            ev === "Verified" ? "ok" : ev === "Rejected" ? "warn" : "warn",
            ev === "Verified"
              ? "Plan evidence verified"
              : ev === "Rejected"
                ? "Request a replacement document"
                : "Finance reviews the plan evidence",
            `${base}?tab=plans`,
            ctx.reviews,
            id,
            need,
          ),
        );
      }

      // The agreement line for this service, then its budget and payer.
      const withLine = current
        .map((a) => ({ a, line: a.lines.find((l) => l.needId === need && l.kind === "Service") }))
        .filter((x) => x.line)
        .sort((x, y) => y.a.version - x.a.version)[0];
      const budget =
        (withLine?.line?.budgetId && plan?.budgets.find((b) => b.id === withLine.line!.budgetId)) ||
        plan?.budgets.find((b) => {
          const own = SEED_ITEMS.find((i) => i._id === b.priceItemId);
          const wanted = SEED_ITEMS.find((i) => i.supports.includes(n.support));
          return own && wanted && own.category === wanted.category;
        }) ||
        null;

      let budgetState = "Unknown";
      let budgetSev: GateSeverity = "warn";
      let budgetNext = "Link this service to a support budget";
      if (client.funding !== "NDIS") {
        budgetState = "Not applicable";
        budgetSev = "ok";
        budgetNext = "Not NDIS-funded";
      } else if (budget) {
        if (budget.eligibility === "Not Confirmed") {
          budgetState = "Not Suitable";
          budgetSev = "block";
          budgetNext = "Finance finds another budget or payer";
        } else if (budget.eligibility === "Confirmed" && budget.verified) {
          const committed = ctx.agreements
            .filter((a) => committingStatuses.includes(a.status))
            .flatMap((a) =>
              a.lines
                .filter((l) => l.budgetId === budget.id)
                .map((l) => lineEstimate(l, a.start, a.end)),
            )
            .reduce((s, x) => s + x, 0);
          if (committed > budget.verified.amount) {
            budgetState = "Review Required";
            budgetNext = "Local commitments exceed the verified snapshot (estimate)";
          } else {
            budgetState = "Suitable";
            budgetSev = "ok";
            budgetNext = `Verified snapshot ${aud(budget.verified.amount)} on ${fmtDay(budget.verified.at.toISOString().slice(0, 10))}`;
          }
        } else {
          budgetState = "Review Required";
          budgetNext = budget.verified
            ? "Confirm service eligibility"
            : "Record a verified funding snapshot";
        }
      }
      gates.push(
        gate(
          "budget",
          budgetState,
          budgetSev,
          budgetNext,
          `${base}?tab=budgets`,
          ctx.reviews,
          id,
          need,
        ),
      );

      let payerState = "Missing";
      let payerSev: GateSeverity = "warn";
      let payerNext = "Assign the payer for this budget";
      if (client.funding !== "NDIS") {
        payerState = client.fundingDetails?.payer ? "Draft" : "Missing";
        payerNext = client.fundingDetails?.payer
          ? `Payer on file: ${client.fundingDetails.payer}`
          : "Record the payer";
      } else if (budget?.management === "Agency Managed") {
        const done = plan!.agencyChecks.length === agencyChecklist.length;
        payerState = done ? "Verified" : "Draft";
        payerSev = done ? "ok" : "warn";
        payerNext = done
          ? "Agency-managed checklist complete"
          : "Complete the agency-managed checklist";
      } else if (budget?.payerId) {
        const payer = ctx.payers.find((p) => p._id.equals(budget.payerId!));
        if (payer?.status === "Verified") {
          payerState = "Verified";
          payerSev = "ok";
          payerNext = `${payer.name}`;
        } else if (payer?.status === "Inactive") {
          payerState = "Missing";
          payerNext = `${payer.name} is inactive: replace the payer`;
        } else if (payer) {
          payerState = "Draft";
          payerNext = `Verify ${payer.name}'s contact details`;
        }
      }
      gates.push(
        gate(
          "payer",
          payerState,
          payerSev,
          payerNext,
          `${base}?tab=budgets`,
          ctx.reviews,
          id,
          need,
        ),
      );

      let agState = "Not started";
      let agSev: GateSeverity = "warn";
      let agNext = "Prepare a service agreement (recommended)";
      let agHref = `${base}?tab=agreements`;
      if (withLine) {
        const a = withLine.a;
        agHref = `/care/funding/agreements/${a._id.toHexString()}`;
        const expired = a.status === "Signed" && a.end < today;
        if (a.status === "Signed" && !expired) {
          agState = "Signed";
          agSev = "ok";
          agNext = `${a.ref} v${a.version} signed`;
        } else if (expired || a.status === "Expired") {
          agState = "Expired";
          agSev = "block";
          agNext = "Renew the agreement before new bookings";
        } else if (a.status === "Declined") {
          agState = "Declined";
          agSev =
            ctx.policy.declinePolicy === "Hold new bookings until resolved" ? "block" : "warn";
          agNext =
            ctx.policy.declinePolicy === "Hold new bookings until resolved"
              ? "Policy: hold new bookings until resolved"
              : "Policy: proceed with a documented verbal agreement";
        } else if (a.status === "Issued" || a.status === "Viewed") {
          agState = "Issued";
          agNext = `Waiting for ${a.signatory.name} to accept`;
        } else {
          agState = "Draft";
          agNext =
            a.status === "Changes Requested"
              ? "Prepare the amendment"
              : "Finish and issue the agreement";
        }
      }
      gates.push(gate("agreement", agState, agSev, agNext, agHref, ctx.reviews, id, need));

      gates.push(
        gate(
          "consent",
          consent === "Given" ? "Recorded" : consent === "Withdrawn" ? "Withdrawn" : "Pending",
          consent === "Given" ? "ok" : consent === "Withdrawn" ? "block" : "warn",
          consent === "Given"
            ? "General care consent recorded"
            : consent === "Withdrawn"
              ? "Consent withdrawn: suitability changes"
              : "Record consent on the participant record",
          `/care/${id}?tab=consent`,
          ctx.reviews,
          id,
          need,
        ),
      );

      const booking: BookingReadiness = gates.some((g) => g.severity === "block")
        ? "Blocked"
        : gates.some((g) => g.severity === "warn")
          ? "Conditional"
          : "Ready";
      return {
        needId: need,
        support: n.support,
        discipline: n.discipline,
        booking,
        gates,
      };
    });
}

export const reviewSchema = z.object({
  needId: z.string().max(60),
  gate: z.enum(["clinical", "evidence", "budget", "payer", "agreement", "consent"]),
  note: z.string().trim().min(3, "Say why this is acceptable for now").max(300),
  clinicalState: z.enum(["Cleared", "Not Cleared"]).optional(),
});

/** AT-24: a permitted person marks a gate reviewed (accepted for now) with a note. */
export async function reviewGate(
  user: UserDoc,
  clientId: ObjectId,
  input: z.infer<typeof reviewSchema>,
) {
  const db = await collections();
  if (input.gate === "clinical") {
    if (!isClinicalLead(user))
      throw new UserFacingError("Only a Clinical Lead decides clinical acceptance.", 409);
    if (input.clinicalState) {
      await db.readinessReviews.updateOne(
        { _id: `${clientId.toHexString()}:${input.needId}:clinical-state` },
        {
          $set: {
            byName: user.name,
            at: new Date(),
            note: `${input.clinicalState}: ${input.note}`,
          },
        },
        { upsert: true },
      );
    }
  } else if (input.gate === "consent") {
    mustEdit(user);
  } else {
    mustVerify(user, "accept a funding gate");
  }
  if (input.gate !== "clinical" || !input.clinicalState) {
    await db.readinessReviews.updateOne(
      { _id: `${clientId.toHexString()}:${input.needId}:${input.gate}` },
      { $set: { byName: user.name, at: new Date(), note: input.note } },
      { upsert: true },
    );
  }
  await audit(user, `Funding: readiness gate "${input.gate}" reviewed: ${input.note}`, clientId);
  await changed(clientId);
}

/* ------------------------------------------------------------------ alerts */

export function alertsFor(
  plans: FundingPlanDoc[],
  agreements: AgreementDoc[],
  payers: PayerDoc[],
  clients: Map<string, ClientDoc>,
  futureVisits: { clientId: ObjectId; start: Date; ref?: string }[],
  acks: Map<string, { byName: string; at: Date }>,
  policy: FundingPolicy,
  priceItems: PriceItemDoc[],
): FundingAlertDto[] {
  const out: FundingAlertDto[] = [];
  const today = todayKey();
  const now = new Date().toISOString();
  const push = (a: Omit<FundingAlertDto, "acknowledged" | "at"> & { at?: string }) => {
    const ack = acks.get(a.key);
    out.push({
      ...a,
      at: a.at ?? now,
      acknowledged: ack ? { by: ack.byName, at: ack.at.toISOString() } : null,
    });
  };
  const nameOf = (id: ObjectId | null, fallback: string) =>
    id ? (clients.get(id.toHexString())?.name ?? fallback) : fallback;
  const hrefOf = (p: FundingPlanDoc, tab = "plans") =>
    p.clientId ? `/care/funding/${p.clientId.toHexString()}?tab=${tab}` : "/care/funding";
  const reminder = [...policy.reminderDays].sort((a, b) => a - b);

  for (const p of plans.filter((x) => x.status !== "Superseded")) {
    const who = nameOf(p.clientId, p.participant);
    const d = daysUntil(p.end);
    if (d !== null) {
      if (d < 0) {
        push({
          key: `exp:${p._id}:past`,
          kind: "plan-expiry",
          severity: "high",
          title: `Plan ${p.ref} ended ${fmtDay(p.end)}`,
          detail: "Check whether a new plan exists. Old plan kept for history.",
          owner: "Finance",
          clientId: p.clientId?.toHexString() ?? null,
          participant: who,
          href: hrefOf(p),
        });
      } else {
        const bucket = reminder.find((r) => d <= r);
        if (bucket !== undefined) {
          push({
            key: `exp:${p._id}:${bucket}`,
            kind: "plan-expiry",
            severity: bucket <= 14 ? "high" : bucket <= 30 ? "medium" : "low",
            title: `Plan ${p.ref} ends in ${d} day${d === 1 ? "" : "s"}`,
            detail: `Ends ${fmtDay(p.end)} (${bucket}-day reminder). Staff verify whether an updated plan exists.`,
            owner: "Finance",
            clientId: p.clientId?.toHexString() ?? null,
            participant: who,
            href: hrefOf(p),
          });
        }
      }
    }
    for (const per of p.periods) {
      const pd = daysUntil(per.end);
      if (pd !== null && pd >= 0 && pd <= 30) {
        push({
          key: `period:${p._id}:${per.id}`,
          kind: "period-end",
          severity: "medium",
          title: `Funding period ends ${fmtDay(per.end)}`,
          detail:
            "Possible booking exposure after this date. Clinically necessary care is never cancelled automatically.",
          owner: "Finance",
          clientId: p.clientId?.toHexString() ?? null,
          participant: who,
          href: hrefOf(p),
        });
      }
    }
    if (overlapping(p.periods)) {
      push({
        key: `overlap:${p._id}`,
        kind: "duplicate",
        severity: "medium",
        title: `Overlapping funding periods on ${p.ref}`,
        detail: "Two periods overlap for the same plan. Review the dates.",
        owner: "Finance",
        clientId: p.clientId?.toHexString() ?? null,
        participant: who,
        href: hrefOf(p),
      });
    }
    for (const b of p.budgets) {
      const payer = b.payerId ? payers.find((x) => x._id.equals(b.payerId!)) : null;
      if (b.management === "Plan Managed" && (!payer || !payer.email)) {
        push({
          key: `pm-email:${p._id}:${b.id}`,
          kind: "missing-email",
          severity: "medium",
          title: `Plan manager email missing for "${b.name}"`,
          detail:
            "Draft a secure request to an authorised person. Admin verifies who may receive it.",
          owner: "Intake",
          clientId: p.clientId?.toHexString() ?? null,
          participant: who,
          href: hrefOf(p, "budgets"),
        });
      }
      if (payer?.status === "Inactive") {
        push({
          key: `payer-inactive:${p._id}:${b.id}`,
          kind: "payer-inactive",
          severity: "high",
          title: `Inactive payer on "${b.name}"`,
          detail: `${payer.name} is inactive. New agreements can't be issued until it's replaced.`,
          owner: "Finance",
          clientId: p.clientId?.toHexString() ?? null,
          participant: who,
          href: hrefOf(p, "budgets"),
        });
      }
      if (b.verified) {
        const committed = agreements
          .filter(
            (a) =>
              committingStatuses.includes(a.status) &&
              a.clientId.equals(p.clientId ?? new ObjectId()),
          )
          .flatMap((a) =>
            a.lines.filter((l) => l.budgetId === b.id).map((l) => lineEstimate(l, a.start, a.end)),
          )
          .reduce((s, x) => s + x, 0);
        if (committed > (b.verified.amount * b.alertThreshold) / 100) {
          push({
            key: `over:${p._id}:${b.id}:${Math.round(committed)}`,
            kind: "over-commitment",
            severity: committed > b.verified.amount ? "high" : "medium",
            title: `Possible over-commitment on "${b.name}"`,
            detail: `Local commitments ${aud(committed)} vs last verified snapshot ${aud(b.verified.amount)} (${fmtDay(b.verified.at.toISOString().slice(0, 10))}). Local estimate, not an NDIA balance.`,
            owner: "Finance",
            clientId: p.clientId?.toHexString() ?? null,
            participant: who,
            href: hrefOf(p, "budgets"),
          });
        }
      }
    }
    for (const e of p.evidence.filter((x) => x.status === "Rejected")) {
      push({
        key: `ev-rej:${e.id}`,
        kind: "evidence-rejected",
        severity: "medium",
        title: `Evidence rejected: ${e.name}`,
        detail: e.note || "Request a replacement document.",
        owner: "Intake",
        clientId: p.clientId?.toHexString() ?? null,
        participant: who,
        href: hrefOf(p),
      });
    }
    for (const r of p.infoRequests.filter((x) => !x.receivedAt)) {
      const age = Math.floor((Date.now() - r.at.getTime()) / 86_400_000);
      if (age >= 3) {
        push({
          key: `info:${r.id}`,
          kind: "info-outstanding",
          severity: "low",
          title: `Information requested ${age} days ago`,
          detail: `From ${r.to}: ${r.items.join(", ")}`,
          owner: "Intake",
          clientId: p.clientId?.toHexString() ?? null,
          participant: who,
          href: hrefOf(p),
        });
      }
    }
    if (p.ndisNumber) {
      const dup = plans.find(
        (o) =>
          o.ndisNumber === p.ndisNumber &&
          !o._id.equals(p._id) &&
          String(o.clientId) !== String(p.clientId),
      );
      if (dup && String(p._id) < String(dup._id)) {
        push({
          key: `dup:${p._id}:${dup._id}`,
          kind: "duplicate",
          severity: "high",
          title: "Duplicate NDIS number",
          detail: `${p.ref} (${who}) and ${dup.ref} (${nameOf(dup.clientId, dup.participant)}) share an NDIS number. No automatic merge.`,
          owner: "Intake",
          clientId: p.clientId?.toHexString() ?? null,
          participant: who,
          href: hrefOf(p),
        });
      }
    }
    // AT-34: a booked visit after the plan's end date.
    if (p.end && p.clientId) {
      const beyond = futureVisits.filter(
        (v) => v.clientId.equals(p.clientId!) && v.start.toISOString().slice(0, 10) > p.end,
      );
      if (beyond.length) {
        push({
          key: `beyond:${p._id}:${beyond.length}`,
          kind: "beyond-plan",
          severity: "high",
          title: `${beyond.length} booked visit${beyond.length === 1 ? "" : "s"} after the plan ends`,
          detail: `First on ${fmtDay(beyond[0]!.start.toISOString().slice(0, 10))}; plan ${p.ref} ends ${fmtDay(p.end)}. Clinical decisions stay with the clinician.`,
          owner: "Scheduler",
          clientId: p.clientId.toHexString(),
          participant: who,
          href: hrefOf(p),
        });
      }
    }
  }

  for (const a of agreements) {
    const who = nameOf(a.clientId, "Participant");
    const href = `/care/funding/agreements/${a._id.toHexString()}`;
    if (a.status === "Issued" || a.status === "Viewed") {
      const issued = [...a.events].reverse().find((e) => e.action === "Issued");
      const age = issued ? Math.floor((Date.now() - issued.at.getTime()) / 86_400_000) : 0;
      if (age >= policy.notAcceptedDays) {
        push({
          key: `not-accepted:${a._id}`,
          kind: "not-accepted",
          severity: "medium",
          title: `${a.ref} v${a.version} not accepted after ${age} days`,
          detail: `Issued to ${a.signatory.name}. Send a reminder; never assume consent.`,
          owner: "Finance",
          clientId: a.clientId.toHexString(),
          participant: who,
          href,
        });
      }
    }
    if ((a.status === "Signed" && a.end < today) || a.status === "Expired") {
      push({
        key: `ag-exp:${a._id}`,
        kind: "agreement-expired",
        severity: "high",
        title: `${a.ref} expired ${fmtDay(a.end)}`,
        detail:
          "New agreement-dependent service lines are blocked. Escalate rather than silently removing services.",
        owner: "Finance",
        clientId: a.clientId.toHexString(),
        participant: who,
        href,
      });
    }
    if (a.status === "Draft" || a.status === "Internal Review") {
      const over = a.lines.filter((l) => l.priceLimit !== null && l.unitPrice > l.priceLimit);
      if (over.length) {
        push({
          key: `price:${a._id}:${over.length}`,
          kind: "price-limit",
          severity: "high",
          title: `${a.ref}: price above the configured limit`,
          detail: over
            .map((l) => `${l.support}: ${aud(l.unitPrice)} > ${aud(l.priceLimit)}`)
            .join("; "),
          owner: "Finance",
          clientId: a.clientId.toHexString(),
          participant: who,
          href,
        });
      }
    }
    void priceItems;
  }

  const rank = { high: 0, medium: 1, low: 2 } as const;
  return out.sort(
    (x, y) =>
      Number(Boolean(x.acknowledged)) - Number(Boolean(y.acknowledged)) ||
      rank[x.severity] - rank[y.severity],
  );
}

export async function acknowledgeAlert(user: UserDoc, key: string, note: string) {
  mustEdit(user);
  const { fundingAcks } = await collections();
  await fundingAcks.updateOne(
    { _id: key },
    { $set: { byName: user.name, at: new Date(), note } },
    { upsert: true },
  );
  await audit(
    user,
    `Funding: alert acknowledged (${key.split(":")[0]})${note ? `: ${note}` : ""}`,
    null,
  );
  await changed(null);
}

/* ------------------------------------------------------------------ read models */

async function usedByBudget(clientIds: ObjectId[]) {
  const { invoices } = await collections();
  const map = new Map<string, number>();
  const rows = await invoices
    .find({ clientId: { $in: clientIds }, status: { $ne: "Voided" } })
    .toArray();
  for (const inv of rows) {
    for (const l of inv.lines) {
      if (l.budgetId) map.set(l.budgetId, (map.get(l.budgetId) ?? 0) + l.amount);
    }
  }
  return map;
}

async function loadAll() {
  const db = await collections();
  await ensureCatalogue();
  await ensurePlans();
  const [plans, agreements, payers, priceItems, acks, reviews, clients, policy] = await Promise.all(
    [
      db.fundingPlans.find().toArray(),
      db.agreements.find().sort({ createdAt: -1 }).toArray(),
      db.payers.find().sort({ name: 1 }).toArray(),
      db.priceItems.find().sort({ active: -1, name: 1 }).toArray(),
      db.fundingAcks.find().toArray(),
      db.readinessReviews.find().toArray(),
      db.clients.find().toArray(),
      fundingPolicy(),
    ],
  );
  const futureVisits = await db.appointments
    .find(
      { status: "booked", start: { $gte: new Date() } },
      { projection: { clientId: 1, start: 1, ref: 1 } },
    )
    .toArray();
  return {
    plans,
    agreements,
    payers,
    priceItems,
    acks: new Map(acks.map((a) => [a._id, a])),
    reviews: new Map(reviews.map((r) => [r._id, r])),
    clients: new Map(clients.map((c) => [c._id.toHexString(), c])),
    policy,
    futureVisits,
  };
}

export async function fundingOverview(user: UserDoc): Promise<FundingOverviewDto> {
  const all = await loadAll();
  const db = await collections();
  const used = await usedByBudget([...all.clients.values()].map((c) => c._id));
  const { agreementDtos } = await import("./agreements");
  const agreements = await agreementDtos(all.agreements, all);
  const alerts = alertsFor(
    all.plans,
    all.agreements,
    all.payers,
    all.clients,
    all.futureVisits,
    all.acks,
    all.policy,
    all.priceItems,
  );
  const referrals = await db.referrals
    .find({ clientId: { $ne: null } }, { projection: { clientId: 1, triage: 1, services: 1 } })
    .toArray();
  const rows = [...all.clients.values()]
    .filter(
      (c) =>
        !c.discharged && (c.funding === "NDIS" || all.plans.some((p) => p.clientId?.equals(c._id))),
    )
    .map((c) => {
      const plans = all.plans.filter((p) => p.clientId?.equals(c._id) && p.status !== "Superseded");
      const plan = currentPlan(plans);
      const dto = plan ? planDto(plan, all.payers, all.priceItems, all.agreements, used) : null;
      const ags = currentAgreements(all.agreements.filter((a) => a.clientId.equals(c._id)));
      const latest = ags.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
      const ready = readinessFor(c, {
        plans,
        agreements: all.agreements.filter((a) => a.clientId.equals(c._id)),
        payers: all.payers,
        reviews: all.reviews,
        referral:
          (referrals.find((r) => r.clientId?.equals(c._id)) as ReferralDoc | undefined) ?? null,
        policy: all.policy,
      });
      const booking: BookingReadiness = ready.some((r) => r.booking === "Blocked")
        ? "Blocked"
        : ready.some((r) => r.booking === "Conditional")
          ? "Conditional"
          : ready.length
            ? "Ready"
            : "Conditional";
      return {
        clientId: c._id.toHexString(),
        participant: c.name,
        mrn: c.mrn ?? null,
        planRef: plan?.ref ?? null,
        planId: plan?._id.toHexString() ?? null,
        management: plan?.management || "Not recorded",
        budgets: (plan?.budgets ?? []).map((b) => ({ name: b.name, management: b.management })),
        end: plan?.end ?? "",
        daysToEnd: plan ? daysUntil(plan.end) : null,
        evidence: dto?.evidenceStatus ?? ("No plan" as const),
        agreement: latest?.status ?? ("None" as const),
        booking,
        warnings: alerts.filter((a) => a.clientId === c._id.toHexString() && !a.acknowledged)
          .length,
      };
    })
    .sort((a, b) => a.participant.localeCompare(b.participant));
  const clientNames = new Map([...all.clients.values()].map((c) => [c._id.toHexString(), c.name]));
  return {
    rows,
    alerts,
    agreements,
    payers: all.payers.map((p) => payerDto(p, clientNames, all.plans)),
    priceItems: all.priceItems.map(priceDto),
    counts: {
      plans: rows.filter((r) => r.planRef).length,
      verified: rows.filter((r) => r.evidence === "Verified").length,
      expiring: rows.filter(
        (r) =>
          r.daysToEnd !== null &&
          r.daysToEnd >= 0 &&
          r.daysToEnd <= Math.max(...all.policy.reminderDays),
      ).length,
      awaitingSignature: agreements.filter((a) => a.status === "Issued" || a.status === "Viewed")
        .length,
      blocked: rows.filter((r) => r.booking === "Blocked").length,
      alerts: alerts.filter((a) => !a.acknowledged).length,
    },
    can: { verify: canVerify(user), edit: canEditFunding(user) },
    policy: all.policy,
    clients: [...all.clients.values()]
      .filter((c) => !c.discharged)
      .map((c) => ({ id: c._id.toHexString(), name: c.name, mrn: c.mrn ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function fundingWorkspace(
  user: UserDoc,
  clientId: ObjectId,
): Promise<FundingWorkspaceDto> {
  const all = await loadAll();
  const db = await collections();
  const client = all.clients.get(clientId.toHexString());
  if (!client) throw new UserFacingError("Participant not found.", 404);
  const referral = await db.referrals.findOne({ clientId }, { sort: { createdAt: -1 } });
  const plans = all.plans.filter((p) => p.clientId?.equals(clientId));
  const agreements = all.agreements.filter((a) => a.clientId.equals(clientId));
  const used = await usedByBudget([clientId]);
  const { agreementDtos } = await import("./agreements");
  const clientNames = new Map([...all.clients.values()].map((c) => [c._id.toHexString(), c.name]));
  const alerts = alertsFor(
    plans,
    agreements,
    all.payers,
    all.clients,
    all.futureVisits,
    all.acks,
    all.policy,
    all.priceItems,
  );
  const audits = await db.audit
    .find({ clientId, action: { $regex: "^Funding" } })
    .sort({ at: -1 })
    .limit(80)
    .toArray();
  const history: HistoryDto[] = [
    ...plans.flatMap((p) =>
      p.history.map((h) => ({
        at: h.at.toISOString(),
        by: h.byName,
        area: `Plan ${p.ref}`,
        action: h.action,
        detail: [h.from && h.to ? `${h.from} → ${h.to}` : (h.to ?? h.from ?? ""), h.reason]
          .filter(Boolean)
          .join(" · "),
      })),
    ),
    ...agreements.flatMap((a) =>
      a.events.map((e) => ({
        at: e.at.toISOString(),
        by: e.byName,
        area: `Agreement ${a.ref} v${a.version}`,
        action: e.action,
        detail: e.note,
      })),
    ),
    ...all.payers
      .filter(
        (p) =>
          plans.some((pl) => pl.budgets.some((b) => b.payerId?.equals(p._id))) ||
          p.clientId?.equals(clientId),
      )
      .flatMap((p) =>
        p.history.map((h) => ({
          at: h.at.toISOString(),
          by: h.byName,
          area: `Payer ${p.name}`,
          action: h.action,
          detail: [h.from && h.to ? `${h.from} → ${h.to}` : "", h.reason]
            .filter(Boolean)
            .join(" · "),
        })),
      ),
    ...audits
      .filter((a) => /readiness|alert/.test(a.action))
      .map((a) => ({
        at: a.at.toISOString(),
        by: a.actorName,
        area: "Readiness",
        action: a.action.replace(/^Funding: /, ""),
        detail: "",
      })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return {
    client: {
      id: clientId.toHexString(),
      name: client.name,
      mrn: client.mrn ?? null,
      funding: client.funding,
      reported: referral
        ? {
            planType: referral.data.funding.planType || "Not given",
            planManagerCompany: referral.data.funding.planManagerCompany,
            planManagerEmail: referral.data.funding.planManagerEmail,
          }
        : null,
    },
    plans: plans
      .sort((a, b) => (b.end || "9999").localeCompare(a.end || "9999"))
      .map((p) => planDto(p, all.payers, all.priceItems, all.agreements, used)),
    agreements: await agreementDtos(agreements, all),
    readiness: readinessFor(client, {
      plans,
      agreements,
      payers: all.payers,
      reviews: all.reviews,
      referral,
      policy: all.policy,
    }),
    alerts,
    history,
    payers: all.payers.map((p) => payerDto(p, clientNames, all.plans)),
    priceItems: all.priceItems.map(priceDto),
    needs: client.needs
      .filter((n) => n.status !== "completed")
      .map((n) => ({
        id: n.id,
        support: n.support,
        discipline: n.discipline,
        frequency: n.frequency,
        location: n.location ?? "Home",
      })),
    contacts: (client.contacts ?? [])
      .filter((c) => c.state !== "Revoked")
      .map((c) => ({
        id: c.id,
        name: c.name,
        role: c.role,
        email: c.email,
        state: c.state,
        signs: c.responsibilities.includes("Consent/Signatory") || c.role === "Participant",
      })),
    can: { verify: canVerify(user), edit: canEditFunding(user), clinical: isClinicalLead(user) },
    policy: all.policy,
  };
}

/** What every booking flow needs: readiness for one participant (Module 05 contract). */
export async function readinessForClient(clientId: ObjectId) {
  const all = await loadAll();
  const db = await collections();
  const client = all.clients.get(clientId.toHexString());
  if (!client) return [];
  const referral = await db.referrals.findOne({ clientId }, { sort: { createdAt: -1 } });
  return readinessFor(client, {
    plans: all.plans.filter((p) => p.clientId?.equals(clientId)),
    agreements: all.agreements.filter((a) => a.clientId.equals(clientId)),
    payers: all.payers,
    reviews: all.reviews,
    referral,
    policy: all.policy,
  });
}

export type LoadedFunding = Awaited<ReturnType<typeof loadAll>>;
export {
  loadAll,
  currentAgreements,
  occurrences,
  fmtDay,
  nextRef,
  entry,
  mustEdit,
  mustVerify,
  itemFor,
  changed,
};

/* ------------------------------------------------------------------ secure upload (step 3) */

async function byUploadToken(token: string) {
  const { fundingPlans } = await collections();
  const hash = sha256(token);
  const plan = await fundingPlans.findOne({ "infoRequests.link.hash": hash });
  const req = plan?.infoRequests.find((r) => r.link?.hash === hash);
  if (!plan || !req || !req.link || req.link.expiresAt < new Date()) {
    throw new UserFacingError(
      "This upload link has expired or isn't valid. Ask Medisense for a new one.",
      404,
    );
  }
  return { plan, req };
}

/** What the person asked sees: who is asking, what for, and nothing else from the record. */
export async function uploadRequest(token: string) {
  const { plan, req } = await byUploadToken(token);
  return {
    participant: plan.participant.split(" ")[0] ?? "the participant",
    to: req.to,
    items: req.items,
    message: req.message,
    expires: req.link!.expiresAt.toISOString(),
    received: plan.evidence
      .filter((e) => e.uploadedBy === `${req.to} (secure link)`)
      .map((e) => ({ name: e.name, at: e.at.toISOString() })),
  };
}

/** Files arrive as evidence pending Finance review; the request is marked received. */
export async function uploadByToken(
  token: string,
  file: { name: string; type: string; bytes: Buffer },
  category: string,
) {
  const { plan, req } = await byUploadToken(token);
  const db = await collections();
  if (!(DOCUMENT_TYPES as readonly string[]).includes(file.type) || file.type.includes("word")) {
    throw new UserFacingError(`${file.name}: upload a PDF, JPG or PNG.`);
  }
  if (file.bytes.length > DOCUMENT_MAX_BYTES)
    throw new UserFacingError(`${file.name} is larger than 5 MB.`);
  const now = new Date();
  const documentId = new ObjectId();
  const by = `${req.to} (secure link)`;
  const cat = (evidenceCategories as readonly string[]).includes(category)
    ? (category as EvidenceCategory)
    : "Other";
  await db.documents.insertOne({
    _id: documentId,
    referralId: plan.referralId,
    clientId: plan.clientId,
    kind: cat === "NDIS plan excerpt" ? "NDIS plan" : "Other",
    name: file.name.slice(0, 160),
    mime: file.type,
    size: file.bytes.length,
    data: new Binary(file.bytes),
    uploadedBy: by,
    at: now,
    status: "Pending review",
    version: 1,
    supersedes: null,
    replacedBy: null,
    review: null,
    area: "funding",
  });
  await db.fundingPlans.updateOne(
    { _id: plan._id },
    {
      $push: {
        evidence: {
          id: randomUUID(),
          documentId,
          category: cat,
          name: file.name.slice(0, 160),
          status: "Received",
          source: /coordinator/i.test(req.to)
            ? "Support Coordinator"
            : /plan manager/i.test(req.to)
              ? "Plan Manager"
              : "Participant",
          version: 1,
          note: `Uploaded through the secure link for: ${req.items.join("; ")}`,
          uploadedBy: by,
          at: now,
          reviewedBy: null,
          reviewedAt: null,
        },
        history: entry(by, `Uploaded ${file.name} through the secure link`, {
          reason: "Pending Finance review",
        }),
      },
      $set: {
        updatedAt: now,
        infoRequests: plan.infoRequests.map((r) =>
          r.id === req.id
            ? {
                ...r,
                receivedAt: r.receivedAt ?? now,
                receivedNote: `Files received: ${file.name}`,
              }
            : r,
        ),
      },
    },
  );
  await db.audit.insertOne({
    _id: new ObjectId(),
    actorId: plan._id,
    actorName: by,
    action: `Funding ${plan.ref}: evidence uploaded through the secure link (${file.name})`,
    clientId: plan.clientId,
    at: now,
  });
  await changed(plan.clientId);
}
