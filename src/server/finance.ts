import "server-only";
import { can } from "./permissions";
import { ObjectId, type Db } from "mongodb";
import { z } from "zod";
import { supportInfo, type Support } from "@/lib/live/catalogue";
import { hourlyRates } from "@/lib/live/clinical";
import {
  addDaysIso,
  ageingOf,
  cancellationDecision,
  aud,
  DEFAULT_RULES,
  holdReasons,
  invoiceDraftSchema,
  lineEditSchema,
  lineMoney,
  quantityFor,
  round2,
  taxTreatments,
  termDays,
  travelSchema,
  type BillableDto,
  type BillingUnit,
  type ChargeRules,
  type ChargeSource,
  type ClaimDto,
  type Flag,
  type FundingPath,
  type InvoiceDto07,
  type InvoiceLineDto,
  type PathRule,
} from "@/lib/live/finance";
import { collections } from "./db";
import { needOfVisit } from "./dto";
import { currentPlan } from "./funding";
import { UserFacingError } from "./http";
import { audit, notify, publish } from "./live";
import type {
  AgreementDoc,
  AppointmentDoc,
  BillableDoc,
  ClaimDoc,
  ClientDoc,
  FinanceEvent,
  FundingPlanDoc,
  InvoiceDoc,
  InvoiceLine,
  PayerDoc,
  PriceItemDoc,
  UserDoc,
} from "./models";

/* ------------------------------------------------------------------ roles (section 2, AC-31) */

/** Works billing: the finance.work permission. */
export const isOfficer = (u: UserDoc) => u.role === "admin" && can(u, "finance.work");
/** Approves finance exceptions: the finance.approve permission. */
export const isManager = (u: UserDoc) => u.role === "admin" && can(u, "finance.approve");

export function mustOfficer(u: UserDoc) {
  if (!isOfficer(u)) throw new UserFacingError("Only Finance can do this.", 409);
}
export function mustManager(u: UserDoc, what: string) {
  if (!isManager(u)) {
    throw new UserFacingError(`Only a Finance Manager can ${what}. Send it for approval.`, 409);
  }
}

/* ------------------------------------------------------------------ helpers */

export const todayKey = () => new Date(Date.now() + 10 * 3_600_000).toISOString().slice(0, 10);
export const dayOf = (d: Date) => new Date(d.getTime() + 10 * 3_600_000).toISOString().slice(0, 10);
export const ev = (by: UserDoc | string, action: string): FinanceEvent => ({
  at: new Date(),
  byName: typeof by === "string" ? by : by.name,
  action,
});

export async function nextRef(db: Db, key: string, prefix: string, pad: number) {
  const c = await db
    .collection<{ _id: string; seq: number }>("counters")
    .findOneAndUpdate(
      { _id: key },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" },
    );
  return `${prefix}-${String(c?.seq ?? 1).padStart(pad, "0")}`;
}

export async function financeUserIds() {
  const { users } = await collections();
  const rows = await users
    .find(
      { role: "admin", staffRoles: { $in: ["Finance", "Finance Manager", "Super Admin"] } },
      { projection: { _id: 1 } },
    )
    .toArray();
  return rows.map((r) => r._id);
}
export async function managerIds() {
  const { users } = await collections();
  const rows = await users
    .find(
      { role: "admin", staffRoles: { $in: ["Finance Manager", "Super Admin"] } },
      { projection: { _id: 1 } },
    )
    .toArray();
  return rows.map((r) => r._id);
}
export async function financeChanged(extra: Record<string, unknown> = {}) {
  const { users } = await collections();
  const ids = (
    await users
      .find({ role: { $in: ["admin", "therapist"] } }, { projection: { _id: 1 } })
      .toArray()
  ).map((u) => u._id);
  await publish(ids, "care", { finance: true, ...extra });
}

/* ------------------------------------------------------------------ charge rules */

type RulesDoc = { _id: "billing" } & ChargeRules;

export async function chargeRules(): Promise<ChargeRules> {
  const { db } = await collections();
  const doc = await db.collection<RulesDoc>("settings").findOne({ _id: "billing" });
  if (!doc)
    return {
      ...DEFAULT_RULES,
      updatedBy: "Default sample rules",
      updatedAt: new Date(0).toISOString(),
    };
  const { _id, ...rest } = doc;
  void _id;
  return rest;
}

const pathRuleSchema = z.object({
  travelLabour: z.boolean(),
  travelNonLabour: z.boolean(),
  nonFaceToFace: z.boolean(),
  reportWriting: z.boolean(),
  cancellation: z.boolean(),
  cancellationNoticeHours: z.number().int().min(0).max(168),
  cancellationShare: z.number().min(0).max(100),
  priceLimitsApply: z.boolean(),
  tax: z.enum(taxTreatments),
  terms: z.enum(["Due on receipt", "7 days", "14 days", "30 days"]),
  billTo: z.enum([
    "Participant",
    "Plan Manager",
    "Agency pathway",
    "Insurer",
    "Private payer",
    "Other",
  ]),
});
export const rulesSchema = z.object({
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paths: z.record(z.string(), pathRuleSchema),
  unbilledDays: z.number().int().min(1).max(90),
  managerApprovalOver: z.number().min(0).max(1_000_000),
  writeOffLimit: z.number().min(0).max(1_000_000),
});

/** New rule versions apply to new charges; issued invoices never recalculate (AC-12). */
export async function saveRules(user: UserDoc, input: z.infer<typeof rulesSchema>) {
  mustManager(user, "change charge rules");
  const { db } = await collections();
  const before = await chargeRules();
  await db.collection<RulesDoc>("settings").updateOne(
    { _id: "billing" },
    {
      $set: {
        ...input,
        paths: input.paths as ChargeRules["paths"],
        version: before.version + 1,
        updatedBy: user.name,
        updatedAt: new Date().toISOString(),
      },
    },
    { upsert: true },
  );
  await audit(
    user,
    `Finance: charge rules v${before.version + 1} saved (effective ${input.effectiveFrom})`,
    null,
  );
  await financeChanged();
}

/* ------------------------------------------------------------------ routing and rates */

type Route = {
  path: FundingPath;
  payerRoute: string;
  payer: PayerDoc | null;
  agreement: AgreementDoc | null;
  agreementLine: AgreementDoc["lines"][number] | null;
  plan: FundingPlanDoc | null;
  budgetId: string | null;
};

/** Section 7: the support-level funding path and payer, never one participant-level guess. */
export async function routeFor(
  client: ClientDoc,
  needId: string | null,
  day: string,
): Promise<Route> {
  const db = await collections();
  if (client.funding !== "NDIS") {
    const path: FundingPath =
      client.funding === "Workers Compensation"
        ? "Insurer"
        : client.funding === "Aged Care"
          ? "Aged Care"
          : client.funding === "Private"
            ? "Private"
            : "Other";
    const payer = client.fundingDetails?.payer || "";
    return {
      path,
      payerRoute: payer ? `${path}: ${payer}` : `${path}: payer to confirm`,
      payer: null,
      agreement: null,
      agreementLine: null,
      plan: null,
      budgetId: null,
    };
  }
  const [plans, agreements, payers] = await Promise.all([
    db.fundingPlans.find({ clientId: client._id }).toArray(),
    db.agreements
      .find({ clientId: client._id, status: "Signed", start: { $lte: day }, end: { $gte: day } })
      .sort({ version: -1 })
      .toArray(),
    db.payers.find().toArray(),
  ]);
  const plan = currentPlan(plans);
  const agreement =
    agreements.find((a) => a.lines.some((l) => l.needId === needId && l.kind === "Service")) ??
    null;
  const line = agreement?.lines.find((l) => l.needId === needId && l.kind === "Service") ?? null;
  const planOfLine = agreement?.planId
    ? (plans.find((p) => p._id.equals(agreement.planId!)) ?? plan)
    : plan;
  const budget =
    planOfLine?.budgets.find((b) => b.id === line?.budgetId) ?? planOfLine?.budgets[0] ?? null;
  const management =
    budget?.management && budget.management !== "Unknown"
      ? budget.management
      : planOfLine?.management;
  const path: FundingPath =
    management === "Agency Managed"
      ? "Agency Managed"
      : management === "Self-Managed"
        ? "Self-Managed"
        : management === "Plan Managed"
          ? "Plan Managed"
          : "Other";
  const payer = budget?.payerId
    ? (payers.find((p) => p._id.equals(budget.payerId!)) ?? null)
    : null;
  const payerRoute =
    path === "Agency Managed"
      ? "NDIA (agency managed): claim simulated"
      : path === "Plan Managed"
        ? payer
          ? `Plan manager: ${payer.name}`
          : "Plan manager to confirm"
        : path === "Self-Managed"
          ? payer
            ? `Self-managed: ${payer.name}`
            : "Self-managed: payer to confirm"
          : "Payer to confirm";
  return {
    path,
    payerRoute,
    payer,
    agreement,
    agreementLine: line,
    plan: planOfLine ?? null,
    budgetId: budget?.id ?? null,
  };
}

/** The rate effective on the service date: agreement line, then catalogue edition, then default. */
export function rateFor(
  route: Route,
  items: PriceItemDoc[],
  support: string,
  discipline: string,
  day: string,
  rule: PathRule,
): {
  rate: number;
  source: string;
  item: PriceItemDoc | null;
  limit: number | null;
  unit: BillingUnit;
} {
  const geography = route.plan?.geography ?? "National";
  const effective = (i: PriceItemDoc) =>
    i.effectiveFrom <= day && (!i.effectiveTo || i.effectiveTo >= day);
  const agreed = route.agreementLine;
  const fromLine = agreed?.priceItemId
    ? (items.find((i) => i._id === agreed.priceItemId) ?? null)
    : null;
  // The catalogue edition in force on the service date, active now or not (AC-12).
  const dated =
    (fromLine && effective(fromLine) ? fromLine : null) ??
    items.find((i) => effective(i) && i.supports.includes(support as Support)) ??
    null;
  const limit = rule.priceLimitsApply && dated ? (dated.limits[geography] ?? null) : null;
  if (agreed && agreed.unit === "Hour") {
    return {
      rate: agreed.unitPrice,
      source: `Agreement ${route.agreement!.ref} v${route.agreement!.version}`,
      item: dated ?? fromLine,
      limit,
      unit: "Hour",
    };
  }
  if (dated && dated.limits[geography] !== null && dated.limits[geography] !== undefined) {
    return {
      rate: dated.limits[geography]!,
      source: `Catalogue: ${dated.edition}`,
      item: dated,
      limit,
      unit: "Hour",
    };
  }
  return {
    rate: hourlyRates[discipline as keyof typeof hourlyRates] ?? 0,
    source: "Default rate: confirm in Rates and charge rules",
    item: null,
    limit,
    unit: "Hour",
  };
}

/* ------------------------------------------------------------------ checks (section 5, 12) */

export async function flagsFor(b: BillableDoc, client: ClientDoc | null): Promise<Flag[]> {
  const db = await collections();
  const flags: Flag[] = [];
  const overridden = new Set((b.overrides ?? []).map((o) => o.kind));
  const day = dayOf(b.start);
  if (b.source !== "Cancellation" && !b.confirmation) {
    flags.push({
      kind: "Missing service confirmation",
      label: "Service delivery not confirmed (check-out and signed note)",
      severity: "block",
    });
  }
  if (b.source === "Travel" && !b.travel?.evidence) {
    flags.push({
      kind: "Missing service confirmation",
      label: "Travel distance and evidence to confirm",
      severity: "block",
    });
  }
  if (/to confirm/i.test(b.payerRoute)) {
    flags.push({
      kind: "Payer missing",
      label: "No verified payer for this support",
      severity: "block",
    });
  }
  if (client?.funding === "NDIS" && !b.agreementId && !overridden.has("Missing agreement")) {
    flags.push({
      kind: "Missing agreement",
      label: "No signed service agreement covers this date",
      severity: "warn",
    });
  }
  if (client?.funding === "NDIS" && !overridden.has("Funding query")) {
    const plans = await db.fundingPlans
      .find({ clientId: b.clientId, status: { $ne: "Superseded" } })
      .toArray();
    const plan = currentPlan(plans);
    if (!plan?.end) {
      flags.push({
        kind: "Funding query",
        label: "No NDIS plan end date recorded",
        severity: "warn",
      });
    } else if (day > plan.end) {
      flags.push({
        kind: "Funding query",
        label: `Service on ${day} is after the plan ended ${plan.end}: payer validation needed`,
        severity: "block",
      });
    } else if (plan.start && day < plan.start) {
      flags.push({
        kind: "Funding query",
        label: `Service on ${day} is before the plan started ${plan.start}`,
        severity: "block",
      });
    }
  }
  if (b.priceLimit !== null && b.rate > b.priceLimit && !b.override?.approvedBy) {
    flags.push({
      kind: "Invalid rate",
      label: `${aud(b.rate)} is above the ${aud(b.priceLimit)} limit: Finance Manager approval needed`,
      severity: "block",
    });
  }
  if (b.override && !b.override.approvedBy) {
    flags.push({
      kind: "Invalid rate",
      label: `Rate override to ${aud(b.override.rate)} awaits Finance Manager approval`,
      severity: "block",
    });
  }
  if (b.tax === "Review Required" && !overridden.has("Tax review")) {
    flags.push({
      kind: "Tax review",
      label: "Tax treatment needs Finance review",
      severity: "warn",
    });
  }
  if (b.status !== "Held" || !b.duplicateOf) {
    const twin = await db.billables.findOne({
      _id: { $ne: b._id },
      clientId: b.clientId,
      support: b.support,
      source: b.source,
      therapist: b.therapist,
      billableMinutes: b.billableMinutes,
      start: {
        $gte: new Date(Date.parse(`${day}T00:00:00+10:00`)),
        $lt: new Date(Date.parse(`${day}T00:00:00+10:00`) + 86_400_000),
      },
      status: { $nin: ["Rejected"] },
      sourceKey: { $ne: b.sourceKey },
      parentId: b.parentId,
    });
    if (twin)
      flags.push({
        kind: "Duplicate",
        label: `Possible duplicate of ${twin.ref} (same participant, day, service and minutes)`,
        severity: "warn",
      });
  }
  if (b.duplicateOf) {
    flags.push({
      kind: "Duplicate",
      label: "Same source already captured: held to stop a double charge",
      severity: "block",
    });
  }
  if (b.payerRoute.startsWith("Plan manager:") || b.payerRoute.startsWith("Self-managed:")) {
    const name = b.payerRoute.split(": ").slice(1).join(": ");
    const payer = await db.payers.findOne({ name });
    if (payer && payer.status !== "Verified") {
      flags.push({
        kind: "Payer missing",
        label: `Payer ${payer.name} isn't verified yet (blocks issue)`,
        severity: "warn",
      });
    }
  }
  return flags;
}

const statusFrom = (b: BillableDoc, flags: Flag[]) =>
  b.status === "Invoiced" || b.status === "Claimed" || b.status === "Rejected"
    ? b.status
    : b.hold || b.duplicateOf
      ? "Held"
      : flags.some((f) => f.severity === "block")
        ? "Pending verification"
        : "Ready";

export async function refresh(id: ObjectId) {
  const db = await collections();
  const b = await db.billables.findOne({ _id: id });
  if (!b) return null;
  const client = await db.clients.findOne({ _id: b.clientId });
  const flags = await flagsFor(b, client);
  const status = statusFrom(b, flags);
  await db.billables.updateOne({ _id: id }, { $set: { flags, status, updatedAt: new Date() } });
  return { ...b, flags, status };
}

/* ------------------------------------------------------------------ capture (workflow steps 1–3) */

/**
 * A finalised session, assessment visit or chargeable cancellation becomes a billable line (AC-01).
 * The clinical record is never changed by billing (AC-02).
 */
export async function captureVisit(
  visit: AppointmentDoc,
  kind: "service" | "cancellation",
  byName = "Service verification",
) {
  const db = await collections();
  const client = await db.clients.findOne({ _id: visit.clientId });
  const therapist = await db.therapists.findOne({ _id: visit.therapistId });
  if (!client || !therapist) return null;
  const need = needOfVisit(client, visit);
  const day = dayOf(visit.start);
  const rules = await chargeRules();
  const route = await routeFor(client, need?.id ?? null, day);
  const rule = rules.paths[route.path];
  const items = await db.priceItems.find().toArray();
  const rated = rateFor(
    route,
    items,
    need?.support ?? visit.discipline,
    visit.discipline,
    day,
    rule,
  );
  const scheduled = Math.round((visit.end.getTime() - visit.start.getTime()) / 60_000);
  const delivered = kind === "service" ? (visit.checkOut?.minutes ?? scheduled) : 0;
  const sourceKey = `appointment:${visit._id.toHexString()}:${kind}`;
  const existing = await db.billables.findOne({
    sourceKey,
    parentId: null,
    status: { $ne: "Rejected" },
  });
  const location = visit.modality === "Telehealth" ? "Telehealth" : (need?.location ?? "Home");
  const source: ChargeSource =
    kind === "cancellation"
      ? "Cancellation"
      : need && supportInfo(need.support).kind === "assessment"
        ? "Assessment"
        : "Session";

  let billableMinutes = kind === "service" ? delivered : scheduled;
  let status: BillableDoc["status"] = "Captured";
  const notes: string[] = [];
  if (kind === "cancellation") {
    const decision = cancellationDecision(
      rule,
      visit.cancellation?.noticeHours ?? 0,
      scheduled,
      rules.version,
    );
    if (!decision.charge) status = "Rejected";
    else billableMinutes = decision.minutes;
    notes.push(decision.note);
  }
  const now = new Date();
  const doc: BillableDoc = {
    _id: new ObjectId(),
    ref: await nextRef(db.db, "billable", "BIL", 6),
    sourceKey,
    source,
    appointmentId: visit._id,
    parentId: null,
    clientId: client._id,
    needId: need?.id ?? null,
    support: need?.support ?? visit.discipline,
    discipline: visit.discipline,
    therapistId: therapist._id,
    therapist: therapist.name,
    start: visit.start,
    end: visit.end,
    deliveredMinutes: delivered,
    billableMinutes,
    location,
    path: route.path,
    payerRoute: route.payerRoute,
    agreementId: route.agreement?._id ?? null,
    agreementRef: route.agreement ? `${route.agreement.ref} v${route.agreement.version}` : null,
    budgetId: route.budgetId,
    priceItemId: rated.item?._id ?? null,
    itemCode: rated.item?.code || "To confirm",
    itemName: rated.item?.name ?? `${visit.discipline} (no catalogue item)`,
    unit: rated.unit,
    quantity: quantityFor(rated.unit, billableMinutes),
    rate: rated.rate,
    rateSource: rated.source,
    priceLimit: rated.limit,
    tax: rule.tax,
    confirmation:
      kind === "service" && visit.checkOut && visit.note && visit.note.status !== "Draft"
        ? {
            byName: visit.checkOut.byName || therapist.name,
            at: visit.checkOut.at,
            how: "Checked out with a signed note",
          }
        : null,
    travel: null,
    status,
    flags: [],
    hold: null,
    override: null,
    invoiceId: null,
    claimId: null,
    duplicateOf: existing?._id ?? null,
    history: [
      ev(byName, `Captured from ${visit.ref ?? "visit"} (${kind})`),
      ...notes.map((n) => ev("Charge rules", n)),
    ],
    createdAt: now,
    updatedAt: now,
  };
  if (existing)
    doc.history.push(ev("Duplicate check", `Same source as ${existing.ref}: held for review`));
  await db.billables.insertOne(doc);
  await refresh(doc._id);

  // Separate, visible travel line when the agreement, the rules and the setting allow it (section 8).
  if (kind === "service" && !existing && location !== "Telehealth") {
    const travel = route.agreement?.lines.find((l) => l.needId === need?.id && l.kind === "Travel");
    if (travel && rule.travelNonLabour) {
      const t: BillableDoc = {
        ...doc,
        _id: new ObjectId(),
        ref: await nextRef(db.db, "billable", "BIL", 6),
        sourceKey: `${sourceKey}:travel`,
        source: "Travel",
        parentId: doc._id,
        deliveredMinutes: 0,
        billableMinutes: 0,
        priceItemId: travel.priceItemId || null,
        itemCode: items.find((i) => i._id === travel.priceItemId)?.code || "To confirm",
        itemName: items.find((i) => i._id === travel.priceItemId)?.name ?? "Provider travel",
        unit: "Km",
        quantity: travel.quantity,
        rate: travel.unitPrice,
        rateSource: `Agreement ${route.agreement!.ref} v${route.agreement!.version} (contracted)`,
        priceLimit: travel.priceLimit,
        confirmation: null,
        travel: null,
        status: "Captured",
        history: [
          ev(
            "Charge rules",
            `Travel line from the agreement: ${travel.quantity} km contracted; distance and evidence to confirm`,
          ),
        ],
      };
      await db.billables.insertOne(t);
      await refresh(t._id);
    }
  }
  await financeChanged();
  return doc._id;
}

/* ------------------------------------------------------------------ DTOs */

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function billableDto(
  b: BillableDoc,
  names: Map<string, string>,
  invoices: Map<string, string>,
  claims: Map<string, string>,
): BillableDto {
  return {
    id: b._id.toHexString(),
    ref: b.ref,
    sourceKey: b.sourceKey,
    source: b.source,
    sourceRef: b.appointmentId ? `Visit ${b.appointmentId.toHexString().slice(-6)}` : b.sourceKey,
    parentId: b.parentId?.toHexString() ?? null,
    clientId: b.clientId.toHexString(),
    participant: names.get(b.clientId.toHexString()) ?? "Participant",
    support: b.support,
    discipline: b.discipline,
    therapist: b.therapist,
    start: b.start.toISOString(),
    end: b.end.toISOString(),
    deliveredMinutes: b.deliveredMinutes,
    billableMinutes: b.billableMinutes,
    location: b.location,
    path: b.path,
    payerRoute: b.payerRoute,
    agreement: b.agreementRef,
    itemCode: b.itemCode,
    itemName: b.itemName,
    unit: b.unit,
    quantity: b.quantity,
    rate: b.rate,
    rateSource: b.rateSource,
    priceLimit: b.priceLimit,
    tax: b.tax,
    amounts: lineMoney(b.quantity, b.rate, b.tax),
    confirmation: b.confirmation
      ? { by: b.confirmation.byName, at: b.confirmation.at.toISOString(), how: b.confirmation.how }
      : null,
    travel: b.travel,
    status: b.status,
    flags: b.flags,
    hold: b.hold
      ? { reason: b.hold.reason, note: b.hold.note, by: b.hold.byName, at: b.hold.at.toISOString() }
      : null,
    override: b.override
      ? {
          rate: b.override.rate,
          reason: b.override.reason,
          requestedBy: b.override.requestedBy,
          approvedBy: b.override.approvedBy,
        }
      : null,
    invoice: b.invoiceId
      ? {
          id: b.invoiceId.toHexString(),
          number: invoices.get(b.invoiceId.toHexString()) ?? "Invoice",
        }
      : null,
    claim: b.claimId
      ? { id: b.claimId.toHexString(), ref: claims.get(b.claimId.toHexString()) ?? "Claim" }
      : null,
    duplicateOf: b.duplicateOf?.toHexString() ?? null,
    history: b.history
      .slice()
      .reverse()
      .map((h) => ({ at: h.at.toISOString(), by: h.byName, action: h.action })),
    createdAt: b.createdAt.toISOString(),
  };
}

/** Lines from before Module 07 carry only minutes and an amount; derive what's needed. */
function lineView(l: InvoiceLine): InvoiceLineDto {
  const quantity = l.quantity ?? (l.minutes ? Math.round((l.minutes / 60) * 10000) / 10000 : 1);
  const tax = l.tax ?? "GST-free";
  const subtotal = l.quantity !== undefined ? round2(quantity * l.rate) : l.amount;
  const gst = l.gst ?? (tax === "Taxable" ? round2(subtotal * 0.1) : 0);
  return {
    id: l.id,
    billableId: l.billableId?.toHexString() ?? null,
    date: l.date.toISOString(),
    description: l.description,
    discipline: l.discipline ?? "",
    itemCode: l.itemCode,
    quantity,
    unit: l.unit ?? (l.minutes ? "Hour" : "Each"),
    rate: l.rate,
    tax,
    subtotal,
    gst,
    total: round2(subtotal + gst),
    kind: l.kind,
    held: Boolean(l.held),
  };
}

export function invoiceTotals(inv: InvoiceDoc) {
  const lines = inv.lines.map(lineView);
  const subtotal = round2(lines.reduce((s, l) => s + l.subtotal, 0));
  const gst = round2(lines.reduce((s, l) => s + l.gst, 0));
  const total = round2(subtotal + gst);
  const paid = round2(inv.payments.reduce((s, p) => s + p.amount, 0));
  const credited = round2((inv.credits ?? []).reduce((s, c) => s + c.amount, 0));
  return { lines, subtotal, gst, total, paid, credited, balance: round2(total - paid - credited) };
}

export async function invoiceBlockers(inv: InvoiceDoc) {
  const db = await collections();
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!inv.lines.length) blockers.push("There are no lines on this invoice.");
  if (inv.lines.some((l) => l.held))
    blockers.push("A line is on hold. Resolve or remove it first.");
  if (/to confirm/i.test(inv.payer))
    blockers.push("The payer isn't confirmed. Fix the funding record first.");
  const m = /^(Plan manager|Self-managed): (.+)$/.exec(inv.payer);
  if (m) {
    const payer = await db.payers.findOne({ name: m[2] });
    if (!payer) blockers.push(`Payer "${m[2]}" isn't in the payer directory.`);
    else if (payer.status === "Inactive") blockers.push(`Payer ${payer.name} is inactive.`);
    else if (payer.status !== "Verified")
      blockers.push(`Verify payer ${payer.name} in Funding before issuing.`);
  }
  if ((inv.delivery ?? "Email") === "Email" && !inv.billTo?.email) {
    blockers.push(
      "Delivery is by email, but the bill-to email is missing. Add it or choose another delivery method.",
    );
  }
  if (inv.dueDate && inv.dueDate < todayKey() && !inv.issuedAt)
    blockers.push("The due date is before today's issue date.");
  if (!inv.billTo?.name) blockers.push("Add who the invoice is addressed to.");
  if (inv.lines.some((l) => !l.itemCode || l.itemCode === "To confirm")) {
    warnings.push("Some support item numbers are still to confirm.");
  }
  const ids = inv.lines.flatMap((l) => (l.billableId ? [l.billableId] : []));
  if (ids.length) {
    const bills = await db.billables.find({ _id: { $in: ids } }).toArray();
    for (const b of bills) {
      for (const f of b.flags.filter((x) => x.severity === "block"))
        blockers.push(`${b.ref}: ${f.label}`);
      for (const f of b.flags.filter((x) => x.severity === "warn"))
        warnings.push(`${b.ref}: ${f.label}`);
    }
  }
  return { blockers: [...new Set(blockers)], warnings: [...new Set(warnings)] };
}

export async function invoiceDto07(
  inv: InvoiceDoc,
  names: Map<string, string>,
  rules: ChargeRules,
): Promise<InvoiceDto07> {
  const t = invoiceTotals(inv);
  const db = await collections();
  const { blockers, warnings } = ["Draft", "Pending Approval", "Approved"].includes(inv.status)
    ? await invoiceBlockers(inv)
    : { blockers: [], warnings: [] };
  const open = ["Issued", "Part-Paid", "Disputed"].includes(inv.status);
  const overdue = open && Boolean(inv.dueDate) && inv.dueDate! < todayKey() && t.balance > 0;
  const agreement = inv.agreementId
    ? await db.agreements.findOne(
        { _id: inv.agreementId },
        { projection: { ref: 1, version: 1, start: 1, end: 1 } },
      )
    : null;
  const paymentRefs = new Map(
    (
      await db.payments
        .find(
          { _id: { $in: inv.payments.flatMap((p) => (p.paymentId ? [p.paymentId] : [])) } },
          { projection: { ref: 1 } },
        )
        .toArray()
    ).map((p) => [p._id.toHexString(), p.ref]),
  );
  return {
    id: inv._id.toHexString(),
    number: inv.number,
    version: inv.version ?? 1,
    clientId: inv.clientId.toHexString(),
    participant: names.get(inv.clientId.toHexString()) ?? "Participant",
    path: inv.path ?? inv.funding,
    payer: inv.payer,
    billTo: inv.billTo ?? {
      type: "Other",
      name: inv.payer,
      email: "",
      address: "",
      abn: "",
      reference: "",
    },
    status: inv.status,
    overdue,
    ageing: open ? ageingOf(inv.dueDate ?? null, todayKey(), t.balance) : null,
    issuedAt: iso(inv.issuedAt),
    dueDate: inv.dueDate ?? null,
    terms: inv.terms ?? "14 days",
    delivery: inv.delivery ?? "Email",
    note: inv.note ?? "",
    agreement: agreement
      ? {
          id: agreement._id.toHexString(),
          ref: `${agreement.ref} v${agreement.version}`,
          start: agreement.start,
          end: agreement.end,
        }
      : null,
    lines: t.lines,
    subtotal: t.subtotal,
    gst: t.gst,
    total: t.total,
    paid: t.paid,
    credited: t.credited,
    balance: t.balance,
    arithmetic: [
      ...t.lines.map(
        (l) =>
          `${l.quantity} ${l.unit.toLowerCase()} × ${aud(l.rate)} = ${aud(l.subtotal)}${l.gst ? ` + GST ${aud(l.gst)}` : ""} (${l.tax})`,
      ),
      `Subtotal ${aud(t.subtotal)} + GST ${aud(t.gst)} = total ${aud(t.total)} (rounded to the cent per line)`,
      `Balance = ${aud(t.total)} − payments ${aud(t.paid)} − credits ${aud(t.credited)} = ${aud(t.balance)}`,
    ],
    blockers,
    warnings,
    allocations: inv.payments.map((p) => ({
      paymentRef: p.paymentId
        ? (paymentRefs.get(p.paymentId.toHexString()) ?? p.reference)
        : p.reference || "Recorded payment",
      amount: p.amount,
      at: p.at.toISOString(),
      by: p.byName,
    })),
    credits: (inv.credits ?? []).map((c) => ({
      ref: c.ref,
      amount: c.amount,
      at: c.at.toISOString(),
      reason: c.reason,
    })),
    comms: (inv.comms ?? [])
      .slice()
      .reverse()
      .map((c) => ({
        at: c.at.toISOString(),
        by: c.byName,
        channel: c.channel,
        to: c.to,
        subject: c.subject,
      })),
    versions: (inv.versions ?? []).map((v) => ({
      version: v.version,
      at: v.at.toISOString(),
      by: v.byName,
      reason: v.reason,
      total: v.total,
    })),
    history: inv.history
      .slice()
      .reverse()
      .map((h) => ({ status: h.status, by: h.byName, note: h.note, at: h.at.toISOString() })),
    dispute: inv.dispute
      ? { reason: inv.dispute.reason, at: inv.dispute.at.toISOString(), by: inv.dispute.byName }
      : null,
    needsManager: t.total > rules.managerApprovalOver,
    createdAt: inv.createdAt.toISOString(),
    updatedAt: inv.updatedAt.toISOString(),
  };
}

export async function claimDto(c: ClaimDoc, names: Map<string, string>): Promise<ClaimDto> {
  const db = await collections();
  const lines = await db.billables.find({ _id: { $in: c.billableIds } }).toArray();
  const plans = await db.fundingPlans.find({ clientId: c.clientId }).toArray();
  const plan = currentPlan(plans);
  const checks: string[] = [];
  if (!plan?.ndisNumber) checks.push("Participant NDIS number missing (required claimant detail)");
  if (lines.some((l) => l.itemCode === "To confirm"))
    checks.push("Support item numbers to confirm before a real claim");
  if (lines.some((l) => !l.confirmation && l.source !== "Cancellation"))
    checks.push("Delivered-service evidence missing on a line");
  return {
    id: c._id.toHexString(),
    ref: c.ref,
    clientId: c.clientId.toHexString(),
    participant: names.get(c.clientId.toHexString()) ?? "Participant",
    ndisNumber: plan?.ndisNumber ? `•••••${plan.ndisNumber.slice(-4)}` : "Missing",
    status: c.status,
    lines: lines.map((l) => ({
      billableId: l._id.toHexString(),
      ref: l.ref,
      date: l.start.toISOString(),
      support: l.support,
      itemCode: l.itemCode,
      quantity: l.quantity,
      rate: l.rate,
      total: lineMoney(l.quantity, l.rate, l.tax).total,
    })),
    total: c.total,
    paid: c.paid,
    outcome: c.outcome
      ? { status: c.outcome.status, note: c.outcome.note, at: c.outcome.at.toISOString() }
      : null,
    checks,
    history: c.history
      .slice()
      .reverse()
      .map((h) => ({ at: h.at.toISOString(), by: h.byName, action: h.action })),
    createdAt: c.createdAt.toISOString(),
  };
}

/* ------------------------------------------------------------------ billable actions */

export const lineActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("confirm"),
    minutes: z.number().int().min(1).max(1440).optional(),
    note: z.string().trim().max(300).default(""),
  }),
  z.object({ type: z.literal("edit"), edit: lineEditSchema }),
  z.object({ type: z.literal("travel"), travel: travelSchema }),
  z.object({
    type: z.literal("rate-request"),
    rate: z.number().positive().max(100_000),
    reason: z.string().trim().min(5, "Give the reason").max(300),
  }),
  z.object({
    type: z.literal("rate-decision"),
    approve: z.boolean(),
    note: z.string().trim().min(3).max(300),
  }),
  z.object({
    type: z.literal("hold"),
    reason: z.enum(holdReasons),
    note: z.string().trim().min(3, "Add a note").max(300),
  }),
  z.object({ type: z.literal("release"), note: z.string().trim().min(3).max(300) }),
  z.object({
    type: z.literal("reject"),
    reason: z.string().trim().min(3, "Give the reason").max(300),
  }),
  z.object({ type: z.literal("recheck") }),
  z.object({ type: z.literal("reimport") }),
  z.object({
    type: z.literal("override"),
    kind: z.enum(["Missing agreement", "Funding query", "Tax review"]),
    reason: z.string().trim().min(5, "Give the reason").max(300),
  }),
]);
export type LineAction = z.infer<typeof lineActionSchema>;

export async function lineAction(user: UserDoc, id: ObjectId, action: LineAction) {
  const db = await collections();
  const b = await db.billables.findOne({ _id: id });
  if (!b) throw new UserFacingError("Billable line not found.", 404);
  const set: Partial<BillableDoc> = {};
  const log: FinanceEvent[] = [];
  const locked = b.status === "Invoiced" || b.status === "Claimed";
  const ownTherapist =
    user.role === "therapist" && user.therapistId && b.therapistId?.equals(user.therapistId);
  const rules = await chargeRules();
  const rule = rules.paths[b.path];

  if (locked && !["hold", "release"].includes(action.type)) {
    throw new UserFacingError(
      "This line is already invoiced or claimed. Use a credit note to correct it.",
      409,
    );
  }
  switch (action.type) {
    case "confirm": {
      if (!ownTherapist && !isOfficer(user))
        throw new UserFacingError("Only the treating therapist or Finance confirms delivery.", 409);
      const minutes = action.minutes ?? b.billableMinutes;
      set.confirmation = {
        byName: user.name,
        at: new Date(),
        how: user.role === "therapist" ? "Confirmed by the therapist" : "Confirmed by Finance",
      };
      if (minutes !== b.billableMinutes && b.source !== "Travel") {
        set.billableMinutes = minutes;
        set.quantity = quantityFor(b.unit, minutes, b.quantity);
      }
      log.push(
        ev(
          user,
          `Delivery confirmed${minutes !== b.billableMinutes ? `: ${b.billableMinutes} → ${minutes} min` : ""}${action.note ? `. ${action.note}` : ""}`,
        ),
      );
      break;
    }
    case "edit": {
      mustOfficer(user);
      const e = action.edit;
      const changes: string[] = [];
      if (e.minutes !== undefined && e.minutes !== b.billableMinutes) {
        changes.push(`minutes ${b.billableMinutes} → ${e.minutes}`);
        set.billableMinutes = e.minutes;
        set.quantity = quantityFor(b.unit, e.minutes, b.quantity);
      }
      if (e.quantity !== undefined && e.quantity !== b.quantity) {
        changes.push(`quantity ${b.quantity} → ${e.quantity}`);
        set.quantity = e.quantity;
      }
      if (e.tax && e.tax !== b.tax) {
        changes.push(`tax ${b.tax} → ${e.tax}`);
        set.tax = e.tax;
      }
      if (e.itemCode !== undefined && e.itemCode !== b.itemCode && e.itemCode) {
        changes.push(`item ${b.itemCode} → ${e.itemCode}`);
        set.itemCode = e.itemCode;
      }
      if (!changes.length) throw new UserFacingError("Nothing has changed.");
      log.push(ev(user, `Manual correction: ${changes.join("; ")}. Reason: ${e.reason}`));
      break;
    }
    case "travel": {
      if (!ownTherapist && !isOfficer(user))
        throw new UserFacingError("Only the treating therapist or Finance records travel.", 409);
      const t = action.travel;
      // AC-16: only categories the funding rule allows are accepted.
      const allowed =
        (t.category === "Therapist travel labour" && rule.travelLabour) ||
        (t.category === "Travel non-labour" && rule.travelNonLabour) ||
        (t.category === "Non-face-to-face" && rule.nonFaceToFace) ||
        (t.category === "Cancellation" && rule.cancellation) ||
        t.category === "Other";
      if (!allowed) {
        throw new UserFacingError(
          `${t.category} isn't chargeable for ${b.path} under charge rules v${rules.version}.`,
          409,
        );
      }
      if (b.location === "Telehealth" && t.category.startsWith("T")) {
        throw new UserFacingError("Travel isn't chargeable for a telehealth session.", 409);
      }
      if (b.source === "Travel") {
        set.travel = t;
        set.quantity = t.km || b.quantity;
        set.confirmation = {
          byName: user.name,
          at: new Date(),
          how: `Travel ${t.basis.toLowerCase()} basis: ${t.evidence}`,
        };
        log.push(
          ev(
            user,
            `Travel confirmed: ${t.km} km, ${t.minutes} min, costs ${aud(t.costs)} (${t.basis}). Evidence: ${t.evidence}`,
          ),
        );
      } else {
        // A new child line for travel labour or non-face-to-face work on this session.
        const labour =
          t.category === "Therapist travel labour" || t.category === "Non-face-to-face";
        const child: BillableDoc = {
          ...b,
          _id: new ObjectId(),
          ref: await nextRef(db.db, "billable", "BIL", 6),
          sourceKey: `${b.sourceKey}:${t.category.toLowerCase().replace(/\W+/g, "-")}`,
          source: t.category === "Non-face-to-face" ? "Non-face-to-face" : "Travel",
          parentId: b._id,
          deliveredMinutes: t.minutes,
          billableMinutes: t.minutes,
          unit: labour ? "Hour" : "Km",
          quantity: labour ? quantityFor("Hour", t.minutes) : t.km,
          rate: labour ? b.rate : 0.99,
          rateSource: labour
            ? `${b.rateSource} (same hourly rate)`
            : "Travel non-labour per km: confirm in Rates",
          travel: t,
          confirmation: {
            byName: user.name,
            at: new Date(),
            how: `${t.basis} basis: ${t.evidence}`,
          },
          status: "Captured",
          flags: [],
          hold: null,
          override: null,
          invoiceId: null,
          claimId: null,
          duplicateOf: null,
          history: [
            ev(user, `${t.category} added: ${t.minutes} min, ${t.km} km. Evidence: ${t.evidence}`),
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        if (
          await db.billables.findOne({ sourceKey: child.sourceKey, status: { $ne: "Rejected" } })
        ) {
          throw new UserFacingError(`${t.category} is already recorded for this session.`, 409);
        }
        await db.billables.insertOne(child);
        await refresh(child._id);
        log.push(ev(user, `${t.category} line ${child.ref} added`));
      }
      break;
    }
    case "rate-request": {
      mustOfficer(user);
      set.override = {
        rate: round2(action.rate),
        reason: action.reason,
        requestedBy: user.name,
        approvedBy: null,
        at: new Date(),
      };
      log.push(
        ev(user, `Rate override requested: ${aud(b.rate)} → ${aud(action.rate)}. ${action.reason}`),
      );
      await notify(await managerIds(), {
        title: `Rate override for ${b.ref}`,
        body: `${user.name} asked for ${aud(action.rate)}: ${action.reason}`,
        href: "/care/billing?tab=queue",
      });
      break;
    }
    case "rate-decision": {
      mustManager(user, "approve a rate override or above-limit price");
      if (b.override) {
        if (action.approve && b.override.requestedBy === user.name) {
          throw new UserFacingError("Someone other than the requester approves an override.", 409);
        }
        if (action.approve) {
          set.rate = b.override.rate;
          set.override = { ...b.override, approvedBy: user.name };
          set.rateSource = `Override approved by ${user.name}`;
        } else set.override = null;
      } else if (b.priceLimit !== null && b.rate > b.priceLimit) {
        // An agreed above-limit price, approved as is (AC-11).
        set.override = action.approve
          ? {
              rate: b.rate,
              reason: "Agreed price above the limit",
              requestedBy: "Charge rules",
              approvedBy: user.name,
              at: new Date(),
            }
          : null;
        if (!action.approve) set.status = "Held";
      } else throw new UserFacingError("There's no override to decide.", 409);
      log.push(ev(user, `${action.approve ? "Approved" : "Declined"} rate: ${action.note}`));
      break;
    }
    case "hold": {
      if (!isOfficer(user) && !(user.role === "admin"))
        throw new UserFacingError("Only staff can hold a line.", 409);
      set.hold = { reason: action.reason, note: action.note, byName: user.name, at: new Date() };
      if (!locked) set.status = "Held";
      log.push(ev(user, `Held: ${action.reason}. ${action.note}`));
      break;
    }
    case "release": {
      mustOfficer(user);
      if (b.duplicateOf) mustManager(user, "release a duplicate");
      set.hold = null;
      if (b.duplicateOf) set.duplicateOf = null;
      log.push(ev(user, `Released: ${action.note}`));
      break;
    }
    case "reject": {
      mustOfficer(user);
      set.status = "Rejected";
      set.hold = null;
      log.push(ev(user, `Rejected: ${action.reason}`));
      break;
    }
    case "recheck": {
      mustOfficer(user);
      // Section 13: re-derive payer, agreement and rate for pending charges only.
      const client = await db.clients.findOne({ _id: b.clientId });
      if (!client) break;
      const day = dayOf(b.start);
      const route = await routeFor(client, b.needId, day);
      const items = await db.priceItems.find().toArray();
      const rated = rateFor(route, items, b.support, b.discipline, day, rules.paths[route.path]);
      Object.assign(set, {
        path: route.path,
        payerRoute: route.payerRoute,
        agreementId: route.agreement?._id ?? null,
        agreementRef: route.agreement ? `${route.agreement.ref} v${route.agreement.version}` : null,
        budgetId: route.budgetId,
        ...(b.source === "Session" || b.source === "Assessment"
          ? {
              rate: rated.rate,
              rateSource: rated.source,
              priceLimit: rated.limit,
              priceItemId: rated.item?._id ?? null,
              itemCode: rated.item?.code || "To confirm",
              itemName: rated.item?.name ?? b.itemName,
            }
          : {}),
        tax: rules.paths[route.path].tax,
      });
      log.push(
        ev(
          user,
          `Rechecked against current funding: ${route.path}, ${route.payerRoute}, ${aud(rated.rate)} (${rated.source})`,
        ),
      );
      break;
    }
    case "reimport": {
      // Section 14, S07: the same source arriving twice is captured, then held as a duplicate.
      mustOfficer(user);
      if (!b.appointmentId) throw new UserFacingError("This line has no source appointment.", 409);
      const visit = await db.appointments.findOne({ _id: b.appointmentId });
      if (!visit) throw new UserFacingError("The source appointment wasn't found.", 404);
      await captureVisit(
        visit,
        b.source === "Cancellation" ? "cancellation" : "service",
        user.name,
      );
      log.push(ev(user, "Source imported again (duplicate check)"));
      break;
    }
    case "override": {
      mustManager(user, "override a billing check");
      set.overrides = [
        ...(b.overrides ?? []),
        { kind: action.kind, reason: action.reason, byName: user.name, at: new Date() },
      ];
      log.push(ev(user, `Override: ${action.kind}. ${action.reason}`));
      break;
    }
  }
  await db.billables.updateOne(
    { _id: id },
    { $set: { ...set, updatedAt: new Date() }, $push: { history: { $each: log } } },
  );
  await refresh(id);
  for (const l of log) await audit(user, `Finance ${b.ref}: ${l.action}`, b.clientId);
  await financeChanged();
  return { ok: true };
}

/* ------------------------------------------------------------------ prepare (workflow steps 4–5) */

export async function prepareLines(user: UserDoc, ids: ObjectId[]) {
  mustOfficer(user);
  const db = await collections();
  const lines = await db.billables.find({ _id: { $in: ids } }).toArray();
  const ready = lines.filter((l) => l.status === "Ready");
  if (!ready.length)
    throw new UserFacingError(
      "Choose lines that are Ready. Pending, held or rejected lines can't be billed.",
      409,
    );
  const rules = await chargeRules();
  const made: string[] = [];
  // Group by participant, funding path, payer and agreement: payer rules never merge (AC-05).
  const groups = new Map<string, BillableDoc[]>();
  for (const l of ready) {
    const key = `${l.clientId}|${l.path}|${l.payerRoute}|${l.agreementId ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  for (const group of groups.values()) {
    const first = group[0]!;
    const now = new Date();
    if (first.path === "Agency Managed") {
      const existing = await db.claims.findOne({ clientId: first.clientId, status: "Ready" });
      const total = round2(
        group.reduce((s, l) => s + lineMoney(l.quantity, l.rate, l.tax).total, 0),
      );
      let claimId: ObjectId;
      if (existing) {
        claimId = existing._id;
        await db.claims.updateOne(
          { _id: existing._id },
          {
            $push: {
              billableIds: { $each: group.map((g) => g._id) },
              history: ev(user, `${group.length} line(s) added`),
            },
            $inc: { total },
            $set: { updatedAt: now },
          },
        );
        made.push(existing.ref);
      } else {
        claimId = new ObjectId();
        const ref = await nextRef(db.db, "claim", "CLM", 5);
        await db.claims.insertOne({
          _id: claimId,
          ref,
          clientId: first.clientId,
          status: "Ready",
          billableIds: group.map((g) => g._id),
          total,
          paid: 0,
          outcome: null,
          history: [
            ev(
              user,
              `Claim-ready entry made from ${group.length} line(s). Agency claims are simulated.`,
            ),
          ],
          createdAt: now,
          updatedAt: now,
        });
        made.push(ref);
      }
      await db.billables.updateMany(
        { _id: { $in: group.map((g) => g._id) } },
        {
          $set: { status: "Claimed", claimId, updatedAt: now },
          $push: { history: ev(user, "Moved to the claim queue") },
        },
      );
      continue;
    }
    const client = await db.clients.findOne({ _id: first.clientId });
    const rule = rules.paths[first.path];
    const invLines: InvoiceLine[] = group.map((l) => {
      const m = lineMoney(l.quantity, l.rate, l.tax);
      return {
        id: l._id.toHexString(),
        kind: l.source === "Cancellation" ? "cancellation" : "service",
        visitId: l.appointmentId,
        date: l.start,
        // Service name, clinician and source only: no clinical narrative on an invoice (AC-32).
        description: `${l.support} · ${l.source}${l.source === "Travel" ? ` (${l.quantity} km)` : ""} · ${l.therapist}`,
        itemCode: l.itemCode,
        minutes: l.billableMinutes,
        rate: l.rate,
        amount: m.total,
        payerRoute: l.payerRoute,
        agreementId: l.agreementId,
        budgetId: l.budgetId,
        billableId: l._id,
        quantity: l.quantity,
        unit: l.unit,
        tax: l.tax,
        gst: m.gst,
        discipline: l.discipline,
        held: false,
      };
    });
    const open = await db.invoices.findOne({
      clientId: first.clientId,
      status: "Draft",
      payer: first.payerRoute,
      agreementId: first.agreementId ?? null,
    });
    let invoiceId: ObjectId;
    if (open) {
      invoiceId = open._id;
      await db.invoices.updateOne(
        { _id: open._id },
        {
          $push: {
            lines: { $each: invLines },
            history: {
              status: "Draft",
              byName: user.name,
              note: `${group.length} line(s) added`,
              at: now,
            },
          },
          $set: { updatedAt: now },
        },
      );
      made.push(open.number);
    } else {
      invoiceId = new ObjectId();
      const number = await nextRef(db.db, "invoice07", "INV", 6);
      const payer = first.payerRoute.split(": ").slice(1).join(": ");
      const payerDoc = payer ? await db.payers.findOne({ name: payer }) : null;
      const billTo =
        first.path === "Plan Managed" || first.path === "Self-Managed"
          ? {
              type: (first.path === "Plan Managed" ? "Plan Manager" : "Participant") as
                "Plan Manager" | "Participant",
              name: payerDoc?.name ?? payer,
              email: payerDoc?.email ?? "",
              address: "",
              abn: payerDoc?.abn ?? "",
              reference: "",
            }
          : {
              type: rule.billTo,
              name: payer || client?.fundingDetails?.payer || client?.name || "",
              email: client?.fundingDetails?.payerEmail || client?.email || "",
              address: "",
              abn: "",
              reference: "",
            };
      await db.invoices.insertOne({
        _id: invoiceId,
        number,
        clientId: first.clientId,
        funding: client?.funding ?? "Other",
        payer: first.payerRoute,
        status: "Draft",
        lines: invLines,
        payments: [],
        history: [
          {
            status: "Draft",
            byName: user.name,
            note: `Prepared from ${group.length} verified line(s)`,
            at: now,
          },
        ],
        issuedAt: null,
        createdAt: now,
        updatedAt: now,
        version: 1,
        path: first.path,
        dueDate: addDaysIso(todayKey(), termDays[rule.terms]),
        terms: rule.terms,
        delivery: payerDoc?.deliveryMethod === "Secure portal" ? "Secure portal" : "Email",
        billTo,
        note: "",
        agreementId: first.agreementId,
        credits: [],
        comms: [],
        versions: [],
        dispute: null,
      });
      made.push(number);
    }
    await db.billables.updateMany(
      { _id: { $in: group.map((g) => g._id) } },
      {
        $set: { status: "Invoiced", invoiceId, updatedAt: now },
        $push: { history: ev(user, "Added to a draft invoice") },
      },
    );
  }
  await audit(user, `Finance: prepared ${ready.length} line(s) into ${made.join(", ")}`, null);
  await financeChanged();
  return { made, skipped: lines.length - ready.length };
}

/* ------------------------------------------------------------------ invoice actions */

export const invoiceActionSchema07 = z.discriminatedUnion("type", [
  z.object({ type: z.literal("save"), draft: invoiceDraftSchema }),
  z.object({ type: z.literal("remove-line"), lineId: z.string().max(60) }),
  z.object({ type: z.literal("submit") }),
  z.object({ type: z.literal("approve"), note: z.string().trim().max(300).default("") }),
  z.object({ type: z.literal("return"), note: z.string().trim().min(3).max(300) }),
  z.object({ type: z.literal("issue") }),
  z.object({ type: z.literal("resend"), note: z.string().trim().max(200).default("") }),
  z.object({ type: z.literal("remind") }),
  z.object({ type: z.literal("download") }),
  z.object({
    type: z.literal("dispute"),
    reason: z.string().trim().min(5).max(500),
    lineIds: z.array(z.string().max(60)).max(50).default([]),
  }),
  z.object({ type: z.literal("resolve"), note: z.string().trim().min(3).max(300) }),
  z.object({ type: z.literal("void"), reason: z.string().trim().min(5).max(300) }),
]);
export type InvoiceAction07 = z.infer<typeof invoiceActionSchema07>;

/** Status after payments and credits change the balance. */
export async function settleInvoice(id: ObjectId, byName: string) {
  const db = await collections();
  const inv = await db.invoices.findOne({ _id: id });
  if (!inv || !["Issued", "Part-Paid", "Paid", "Disputed"].includes(inv.status)) return;
  const t = invoiceTotals(inv);
  let to = inv.status;
  if (t.balance <= 0) to = t.credited >= t.total ? "Credited" : "Paid";
  else if (inv.status !== "Disputed") to = t.paid + t.credited > 0 ? "Part-Paid" : "Issued";
  if (to !== inv.status) {
    await db.invoices.updateOne(
      { _id: id },
      {
        $set: { status: to, updatedAt: new Date() },
        $push: {
          history: { status: to, byName, note: `Balance ${aud(t.balance)}`, at: new Date() },
        },
      },
    );
  }
}

export async function invoiceAction07(user: UserDoc, id: ObjectId, action: InvoiceAction07) {
  mustOfficer(user);
  const db = await collections();
  const inv = await db.invoices.findOne({ _id: id });
  if (!inv) throw new UserFacingError("Invoice not found.", 404);
  const rules = await chargeRules();
  const now = new Date();
  const t = invoiceTotals(inv);
  const move = async (to: InvoiceDoc["status"], note: string, extra: Partial<InvoiceDoc> = {}) => {
    const r = await db.invoices.updateOne(
      { _id: id, status: inv.status },
      {
        $set: { ...extra, status: to, updatedAt: now },
        $push: { history: { status: to, byName: user.name, note, at: now } },
      },
    );
    if (r.modifiedCount !== 1)
      throw new UserFacingError("Someone else just changed this invoice. Refresh.", 409);
  };
  const comm = (channel: string, subject: string) => ({
    at: now,
    byName: user.name,
    channel,
    to: inv.billTo?.email || inv.billTo?.name || inv.payer,
    subject,
  });
  const editable = inv.status === "Draft";

  switch (action.type) {
    case "save": {
      if (!editable)
        throw new UserFacingError(
          "Only a draft can be edited. Issued invoices change through a credit note (AC-21).",
          409,
        );
      const d = action.draft;
      if (d.dueDate < todayKey())
        throw new UserFacingError("The due date can't be before the issue date.");
      await db.invoices.updateOne(
        { _id: id },
        {
          $set: {
            dueDate: d.dueDate,
            terms: d.terms,
            delivery: d.delivery,
            billTo: d.billTo,
            note: d.note,
            updatedAt: now,
          },
          $push: {
            history: { status: inv.status, byName: user.name, note: "Draft saved", at: now },
          },
        },
      );
      break;
    }
    case "remove-line": {
      if (!editable) throw new UserFacingError("Lines can only be removed from a draft.", 409);
      const line = inv.lines.find((l) => l.id === action.lineId);
      if (!line) throw new UserFacingError("Line not found.", 404);
      await db.invoices.updateOne(
        { _id: id },
        {
          $pull: { lines: { id: action.lineId } },
          $push: {
            history: {
              status: inv.status,
              byName: user.name,
              note: `Line removed: ${line.description}`,
              at: now,
            },
          },
          $set: { updatedAt: now },
        },
      );
      if (line.billableId) {
        await db.billables.updateOne(
          { _id: line.billableId },
          {
            $set: { status: "Ready", invoiceId: null },
            $push: { history: ev(user, `Removed from ${inv.number}, back in the queue`) },
          },
        );
        await refresh(line.billableId);
      }
      break;
    }
    case "submit": {
      if (inv.status !== "Draft") throw new UserFacingError("Only a draft goes for approval.", 409);
      if (!inv.lines.length) throw new UserFacingError("There's nothing to approve yet.", 409);
      await move(
        "Pending Approval",
        t.total > rules.managerApprovalOver
          ? `Over ${aud(rules.managerApprovalOver)}: Finance Manager approval`
          : "Sent for approval",
      );
      break;
    }
    case "approve": {
      if (inv.status !== "Pending Approval")
        throw new UserFacingError("This invoice isn't waiting for approval.", 409);
      if (t.total > rules.managerApprovalOver)
        mustManager(user, `approve an invoice over ${aud(rules.managerApprovalOver)}`);
      await move("Approved", action.note || "Approved");
      break;
    }
    case "return": {
      if (!["Pending Approval", "Approved"].includes(inv.status))
        throw new UserFacingError("Only a pending or approved invoice can be returned.", 409);
      await move("Draft", action.note);
      break;
    }
    case "issue": {
      if (inv.status !== "Approved")
        throw new UserFacingError("Approve the invoice before issuing it.", 409);
      const { blockers } = await invoiceBlockers(inv);
      // AC-35: blocking validations, in plain words.
      if (blockers.length)
        throw new UserFacingError(`Resolve before issuing: ${blockers.join(" ")}`, 409);
      await move("Issued", `Issued by ${inv.delivery ?? "Email"} (simulated delivery)`, {
        issuedAt: now,
        dueDate:
          inv.dueDate && inv.dueDate >= todayKey()
            ? inv.dueDate
            : addDaysIso(
                todayKey(),
                termDays[(inv.terms as keyof typeof termDays) ?? "14 days"] ?? 14,
              ),
        versions: [
          {
            version: 1,
            at: now,
            byName: user.name,
            reason: "Issued",
            total: t.total,
            lines: inv.lines,
          },
        ],
        comms: [
          ...(inv.comms ?? []),
          comm(
            inv.delivery ?? "Email",
            `Invoice ${inv.number} for ${aud(t.total)} (delivery simulated)`,
          ),
        ],
      });
      break;
    }
    case "resend":
    case "remind":
    case "download": {
      if (inv.status === "Draft" && action.type !== "download")
        throw new UserFacingError("Issue the invoice first.", 409);
      const subject =
        action.type === "remind"
          ? `Reminder: ${inv.number} has ${aud(t.balance)} outstanding`
          : action.type === "download"
            ? `Downloaded ${inv.number} v${inv.version ?? 1}`
            : `Invoice ${inv.number} re-sent${action.note ? `: ${action.note}` : ""}`;
      await db.invoices.updateOne(
        { _id: id },
        {
          $push: {
            comms: comm(
              action.type === "download" ? "Export/Download" : (inv.delivery ?? "Email"),
              subject,
            ),
          },
          $set: { updatedAt: now },
        },
      );
      break;
    }
    case "dispute": {
      if (!["Issued", "Part-Paid", "Paid"].includes(inv.status))
        throw new UserFacingError("Only an issued invoice can be disputed.", 409);
      const held = new Set(action.lineIds);
      await move("Disputed", action.reason, {
        dispute: { reason: action.reason, at: now, byName: user.name },
        lines: inv.lines.map((l) => (held.has(l.id) ? { ...l, held: true } : l)),
      });
      for (const l of inv.lines.filter((x) => held.has(x.id) && x.billableId)) {
        await db.billables.updateOne(
          { _id: l.billableId! },
          {
            $set: { hold: { reason: "Dispute", note: action.reason, byName: user.name, at: now } },
            $push: { history: ev(user, `Disputed on ${inv.number}: ${action.reason}`) },
          },
        );
      }
      await notify(await financeUserIds(), {
        title: `${inv.number} disputed`,
        body: action.reason,
        href: `/care/billing/${id.toHexString()}`,
      });
      break;
    }
    case "resolve": {
      if (inv.status !== "Disputed") throw new UserFacingError("This invoice isn't disputed.", 409);
      const to =
        t.balance <= 0
          ? t.credited >= t.total
            ? "Credited"
            : "Paid"
          : t.paid + t.credited > 0
            ? "Part-Paid"
            : "Issued";
      await move(to, `Dispute resolved: ${action.note}`, {
        dispute: null,
        lines: inv.lines.map((l) => ({ ...l, held: false })),
      });
      break;
    }
    case "void": {
      if (["Draft", "Pending Approval", "Approved"].includes(inv.status)) {
        await move("Voided", action.reason);
      } else if (inv.status === "Issued" && t.paid === 0 && t.credited === 0) {
        mustManager(user, "void an issued invoice");
        await move("Voided", `${action.reason} (issued invoice voided by a Finance Manager)`);
      } else {
        throw new UserFacingError(
          "An invoice with payments or credits is corrected with a credit note, not voided.",
          409,
        );
      }
      const linked = await db.billables
        .find({ invoiceId: id }, { projection: { _id: 1 } })
        .toArray();
      const ids = [
        ...inv.lines.flatMap((l) => (l.billableId ? [l.billableId] : [])),
        ...linked.map((x) => x._id),
      ];
      await db.billables.updateMany(
        { _id: { $in: ids } },
        {
          $set: { status: "Ready", invoiceId: null },
          $push: { history: ev(user, `${inv.number} voided: back in the queue`) },
        },
      );
      for (const bid of ids) await refresh(bid);
      break;
    }
  }
  await audit(user, `Finance ${inv.number}: ${action.type}`, inv.clientId);
  await financeChanged({ invoiceId: id.toHexString() });
  return { ok: true };
}

/* ------------------------------------------------------------------ claims (section 7) */

export const claimActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("prepare") }),
  z.object({ type: z.literal("submit") }),
  z.object({
    type: z.literal("outcome"),
    status: z.enum(["Accepted", "Rejected", "Partially Paid"]),
    note: z.string().trim().min(3, "Record the response").max(400),
  }),
  z.object({ type: z.literal("correct"), note: z.string().trim().min(3).max(300) }),
  z.object({ type: z.literal("close"), note: z.string().trim().min(3).max(300) }),
]);

export async function claimAction(
  user: UserDoc,
  id: ObjectId,
  action: z.infer<typeof claimActionSchema>,
) {
  mustOfficer(user);
  const db = await collections();
  const c = await db.claims.findOne({ _id: id });
  if (!c) throw new UserFacingError("Claim not found.", 404);
  const names = new Map<string, string>();
  const dto = await claimDto(c, names);
  const set: Partial<ClaimDoc> = {};
  let note = "";
  switch (action.type) {
    case "prepare":
      if (c.status !== "Ready")
        throw new UserFacingError("Only a ready claim can be prepared.", 409);
      if (dto.checks.some((x) => x.startsWith("Participant NDIS number"))) {
        throw new UserFacingError(
          "Add the participant's NDIS number in Funding before preparing the claim.",
          409,
        );
      }
      set.status = "Prepared";
      note = `Prepared. Checks: ${dto.checks.join("; ") || "all clear"}`;
      break;
    case "submit":
      if (c.status !== "Prepared") throw new UserFacingError("Prepare the claim first.", 409);
      set.status = "Submitted";
      note = "Submitted (simulation: nothing is sent to the NDIA)";
      break;
    case "outcome":
      if (c.status !== "Submitted")
        throw new UserFacingError("Record an outcome only for a submitted claim.", 409);
      set.status = action.status;
      set.outcome = { status: action.status, note: action.note, at: new Date() };
      note = `Simulated NDIA response: ${action.status}. ${action.note}`;
      if (action.status === "Rejected") {
        // AC-34: the finance owner is told, with the reason kept.
        await notify(await financeUserIds(), {
          title: `${c.ref} rejected`,
          body: action.note,
          href: "/care/billing?tab=claims",
        });
      }
      break;
    case "correct":
      if (c.status !== "Rejected")
        throw new UserFacingError("Only a rejected claim is corrected.", 409);
      set.status = "Prepared";
      note = `Corrected for resubmission: ${action.note}`;
      break;
    case "close":
      set.status = "Closed";
      note = `Closed: ${action.note}`;
      break;
  }
  await db.claims.updateOne(
    { _id: id },
    { $set: { ...set, updatedAt: new Date() }, $push: { history: ev(user, note) } },
  );
  await audit(user, `Finance ${c.ref}: ${note}`, c.clientId);
  await financeChanged();
  return { ok: true };
}

export async function settleClaim(id: ObjectId, byName: string) {
  const db = await collections();
  const c = await db.claims.findOne({ _id: id });
  if (!c) return;
  if (c.paid >= c.total - 0.004 && ["Accepted", "Partially Paid"].includes(c.status)) {
    await db.claims.updateOne(
      { _id: id },
      {
        $set: { status: "Closed", updatedAt: new Date() },
        $push: { history: ev(byName, "Remittance received in full: closed") },
      },
    );
  }
}

/* ------------------------------------------------------------------ backfill */

/**
 * Verified visits already on invoices from before Module 07 are linked as billable lines once, so
 * nothing is charged twice and the queue starts complete.
 */
export async function backfillBillables() {
  const db = await collections();
  // Consistency: a line on a voided invoice goes back to the queue.
  const voided = await db.invoices.find({ status: "Voided" }, { projection: { _id: 1 } }).toArray();
  const stranded = await db.billables
    .find(
      { invoiceId: { $in: voided.map((v) => v._id) }, status: "Invoiced" },
      { projection: { _id: 1 } },
    )
    .toArray();
  for (const b of stranded) {
    await db.billables.updateOne(
      { _id: b._id },
      {
        $set: { status: "Captured", invoiceId: null },
        $push: { history: ev("Consistency check", "Its invoice was voided: back in the queue") },
      },
    );
    await refresh(b._id);
  }
  if (await db.db.collection("settings").findOne({ _id: "billing-backfill" as never })) return;
  const visits = await db.appointments
    .find({
      status: "completed",
      checkOut: { $ne: null },
      "note.status": { $in: ["Final", "Amended", "Pending Signature"] },
    })
    .toArray();
  for (const v of visits) {
    if (await db.billables.findOne({ sourceKey: `appointment:${v._id.toHexString()}:service` }))
      continue;
    const id = await captureVisit(v, "service", "Module 07 backfill");
    if (id && v.invoiceId) {
      const inv = await db.invoices.findOne({ _id: v.invoiceId });
      await db.billables.updateOne(
        { _id: id },
        {
          $set: { status: "Invoiced", invoiceId: v.invoiceId, updatedAt: new Date() },
          $push: { history: ev("Module 07 backfill", `Already on ${inv?.number ?? "an invoice"}`) },
        },
      );
      await db.billables.updateMany(
        { parentId: id },
        {
          $set: { status: "Rejected" },
          $push: { history: ev("Module 07 backfill", "Travel not billed on the earlier invoice") },
        },
      );
    }
  }
  await db.db
    .collection("settings")
    .updateOne(
      { _id: "billing-backfill" as never },
      { $set: { at: new Date() } },
      { upsert: true },
    );
}
