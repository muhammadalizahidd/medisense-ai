import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { supportInfo, type Support } from "@/lib/live/catalogue";
import {
  agreementInputSchema,
  agreementMoves,
  DEFAULT_CANCELLATION,
  lineEstimate,
  occurrences,
  rightsBlocks,
  round2,
  aud,
  type AgreementDto,
  type AgreementInput,
  type AgreementStatus,
  type FundingPolicy,
  type Management,
} from "@/lib/live/funding";
import { collections } from "./db";
import {
  canVerify,
  changed,
  currentPlan,
  fmtDay,
  fundingPolicy,
  itemFor,
  mustEdit,
  mustVerify,
  nextRef,
  todayKey,
  type LoadedFunding,
} from "./funding";
import { UserFacingError } from "./http";
import { adminIds, audit, notify } from "./live";
import type {
  AgreementDoc,
  AgreementLine,
  ClientDoc,
  FundingPlanDoc,
  PayerDoc,
  PriceItemDoc,
  UserDoc,
} from "./models";

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const LINK_DAYS = 30;

/* ------------------------------------------------------------------ pricing and routes */

function payerRoute(management: Management | null, payer: PayerDoc | null) {
  if (management === "Agency Managed") return "NDIA (agency managed): claim simulated";
  if (management === "Self-Managed") {
    return payer ? `Self-managed: ${payer.name}` : "Self-managed: payer to confirm";
  }
  if (management === "Plan Managed") {
    return payer ? `Plan manager: ${payer.name}` : "Plan manager to confirm";
  }
  return "Payer to confirm";
}

/** Snapshots the price edition, limit and payer route onto each line (AT-15, AT-33). */
function priceLines(
  lines: AgreementInput["lines"],
  plan: FundingPlanDoc | null,
  items: PriceItemDoc[],
  payers: PayerDoc[],
): AgreementLine[] {
  return lines.map((l) => {
    const item = items.find((i) => i._id === l.priceItemId) ?? null;
    const budget = plan?.budgets.find((b) => b.id === l.budgetId) ?? null;
    const payer = budget?.payerId
      ? (payers.find((p) => p._id.equals(budget.payerId!)) ?? null)
      : null;
    const limit = item ? (item.limits[plan?.geography ?? "National"] ?? null) : null;
    return {
      id: l.id || randomUUID(),
      needId: l.needId,
      support: l.support,
      kind: l.kind,
      scope: l.scope,
      deliverySetting: l.deliverySetting,
      unit: l.unit,
      quantity: l.quantity,
      frequency: l.frequency,
      unitPrice: round2(l.unitPrice),
      priceItemId: l.priceItemId,
      budgetId: l.budgetId,
      priceEdition: item?.edition ?? "No catalogue item",
      priceEffective: item?.effectiveFrom ?? "",
      priceLimit: limit,
      payerRoute: payerRoute(budget?.management ?? null, payer),
    };
  });
}

/** Why an agreement needs internal commercial review before issue (section 9 step 8, AT-35). */
function reviewReasons(
  a: Pick<AgreementDoc, "lines" | "start" | "end" | "type" | "previousId">,
  plan: FundingPlanDoc | null,
  policy: FundingPolicy,
  previous: AgreementDoc | null,
) {
  const reasons: string[] = [];
  for (const l of a.lines) {
    const budget = plan?.budgets.find((b) => b.id === l.budgetId);
    // Price limits apply to NDIA- and plan-managed supports, not self-managed ones (section 12).
    if (
      l.priceLimit !== null &&
      l.unitPrice > l.priceLimit &&
      budget?.management !== "Self-Managed"
    ) {
      reasons.push(`${l.support}: ${aud(l.unitPrice)} is above the ${aud(l.priceLimit)} limit`);
    }
  }
  const total = a.lines.reduce((s, l) => s + lineEstimate(l, a.start, a.end), 0);
  if (total > policy.reviewTotalOver) {
    reasons.push(
      `Estimated total ${aud(total)} is over the ${aud(policy.reviewTotalOver)} review threshold`,
    );
  }
  if (previous) {
    for (const l of a.lines) {
      const before = previous.lines.find(
        (p) => p.needId === l.needId && p.kind === l.kind && p.support === l.support,
      );
      if (before && before.unitPrice !== l.unitPrice) {
        reasons.push(
          `Price amendment on ${l.support}: ${aud(before.unitPrice)} → ${aud(l.unitPrice)}`,
        );
      }
    }
  }
  return reasons;
}

function warningsOf(
  a: AgreementDoc,
  plan: FundingPlanDoc | null,
  payers: PayerDoc[],
  items: PriceItemDoc[],
) {
  const out: string[] = [];
  if (plan?.end && a.end > plan.end) {
    out.push(`Ends ${fmtDay(a.end)}, after the NDIS plan ends ${fmtDay(plan.end)}.`);
  }
  for (const p of plan?.periods ?? []) {
    if (a.start <= p.end && a.end > p.end) {
      out.push(
        `Crosses the funding period ending ${fmtDay(p.end)}: check the next period's budget.`,
      );
    }
  }
  for (const l of a.lines) {
    const item = items.find((i) => i._id === l.priceItemId);
    if (!l.priceItemId) out.push(`${l.support} (${l.kind}): no support item linked.`);
    else if (item && !item.active)
      out.push(`${l.support}: support item "${item.name}" is inactive.`);
    else if (
      item &&
      l.kind === "Service" &&
      item.supports.length &&
      !item.supports.includes(l.support as Support)
    ) {
      out.push(`${l.support}: "${item.name}" may not suit this service.`);
    }
    if (!l.budgetId) out.push(`${l.support} (${l.kind}): no budget linked.`);
    const budget = plan?.budgets.find((b) => b.id === l.budgetId);
    const payer = budget?.payerId ? payers.find((p) => p._id.equals(budget.payerId!)) : null;
    if (payer?.status === "Inactive") out.push(`${l.support}: payer ${payer.name} is inactive.`);
    if (l.kind === "Travel" && budget && !budget.travelAllowed) {
      out.push(`${l.support}: travel isn't marked as allowed for "${budget.name}".`);
    }
  }
  if (!a.signatory.verified) out.push("Signatory authority not verified yet.");
  return [...new Set(out)];
}

/* ------------------------------------------------------------------ DTO */

export async function agreementDtos(
  docs: AgreementDoc[],
  all: Pick<LoadedFunding, "plans" | "payers" | "priceItems" | "clients">,
): Promise<AgreementDto[]> {
  const today = todayKey();
  return docs.map((a) => {
    const plan = (a.planId && all.plans.find((p) => p._id.equals(a.planId!))) || null;
    const versions = docs
      .filter((d) => d.rootId.equals(a.rootId))
      .sort((x, y) => x.version - y.version)
      .map((d) => ({
        id: d._id.toHexString(),
        version: d.version,
        status: d.status,
        type: d.type,
      }));
    const status: AgreementStatus = a.status === "Signed" && a.end < today ? "Expired" : a.status;
    const lines = a.lines.map((l) => {
      const budget = plan?.budgets.find((b) => b.id === l.budgetId) ?? null;
      const item = all.priceItems.find((i) => i._id === l.priceItemId);
      return {
        ...l,
        occurrences: occurrences(l.frequency, a.start, a.end),
        estimate: lineEstimate(l, a.start, a.end),
        priceItem: item ? `${item.code ? `${item.code} · ` : ""}${item.name}` : "Not linked",
        overLimit: l.priceLimit !== null && l.unitPrice > l.priceLimit,
        budget: budget?.name ?? null,
        management: budget?.management ?? null,
      };
    });
    return {
      id: a._id.toHexString(),
      ref: a.ref,
      version: a.version,
      type: a.type,
      rootId: a.rootId.toHexString(),
      previousId: a.previousId?.toHexString() ?? null,
      clientId: a.clientId.toHexString(),
      participant: all.clients.get(a.clientId.toHexString())?.name ?? "Participant",
      planId: a.planId?.toHexString() ?? "",
      planRef: plan?.ref ?? null,
      status,
      provider: a.provider,
      start: a.start,
      end: a.end,
      signatory: a.signatory,
      lines,
      total: round2(lines.reduce((s, l) => s + l.estimate, 0)),
      cancellation: a.cancellation,
      rights: a.rights,
      communication: a.communication,
      communicationNote: a.communicationNote,
      sharing: a.sharing,
      review: {
        required: a.review.required,
        reasons: a.review.reasons,
        by: a.review.byName,
        at: a.review.at?.toISOString() ?? null,
        note: a.review.note,
      },
      acceptance: a.acceptance
        ? {
            name: a.acceptance.name,
            role: a.acceptance.role,
            at: a.acceptance.at.toISOString(),
            version: a.acceptance.version,
            method: a.acceptance.method,
          }
        : null,
      changeRequest: a.changeRequest
        ? { note: a.changeRequest.note, at: a.changeRequest.at.toISOString() }
        : null,
      declined: a.declined
        ? {
            reason: a.declined.reason,
            at: a.declined.at.toISOString(),
            outcome: a.declined.outcome,
          }
        : null,
      linkActive: Boolean(
        a.link && a.link.expiresAt > new Date() && ["Issued", "Viewed"].includes(a.status),
      ),
      linkExpires: a.link?.expiresAt.toISOString() ?? null,
      warnings: warningsOf(a, plan, all.payers, all.priceItems),
      // We assess SDA housing; we never provide SDA accommodation, where agreements are compulsory (AT-22).
      sdaAccommodation: false,
      events: a.events
        .slice()
        .reverse()
        .map((e) => ({ at: e.at.toISOString(), by: e.byName, action: e.action, note: e.note })),
      versions,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    };
  });
}

async function context(clientId: ObjectId) {
  const db = await collections();
  const [plans, payers, priceItems, client, agreements] = await Promise.all([
    db.fundingPlans.find({ clientId }).toArray(),
    db.payers.find().toArray(),
    db.priceItems.find().toArray(),
    db.clients.findOne({ _id: clientId }),
    db.agreements.find({ clientId }).toArray(),
  ]);
  if (!client) throw new UserFacingError("Participant not found.", 404);
  return {
    plans,
    payers,
    priceItems,
    client,
    agreements,
    clients: new Map([[clientId.toHexString(), client]]),
  };
}

export async function agreementDetail(id: ObjectId) {
  const db = await collections();
  const a = await db.agreements.findOne({ _id: id });
  if (!a) throw new UserFacingError("Agreement not found.", 404);
  const ctx = await context(a.clientId);
  const [dto] = await agreementDtos([a], { ...ctx, agreements: ctx.agreements } as never);
  const versions = (await agreementDtos(ctx.agreements, ctx as never)).find(
    (x) => x.id === dto!.id,
  )!.versions;
  const plan = (a.planId && ctx.plans.find((p) => p._id.equals(a.planId!))) || null;
  return {
    agreement: { ...dto!, versions },
    plans: ctx.plans.map((p) => ({
      id: p._id.toHexString(),
      ref: p.ref,
      end: p.end,
      geography: p.geography,
      budgets: p.budgets.map((b) => {
        const payer = b.payerId ? ctx.payers.find((x) => x._id.equals(b.payerId!)) : null;
        return {
          id: b.id,
          name: b.name,
          management: b.management,
          payer: b.management === "Agency Managed" ? "NDIA" : (payer?.name ?? "No payer"),
          travelAllowed: b.travelAllowed,
          priceItemId: b.priceItemId,
        };
      }),
    })),
    planId: plan?._id.toHexString() ?? "",
    priceItems: ctx.priceItems.map((i) => ({
      id: i._id,
      code: i.code,
      name: i.name,
      unit: i.unit,
      edition: i.edition,
      effectiveFrom: i.effectiveFrom,
      limit: i.limits[plan?.geography ?? "National"],
      active: i.active,
      supports: i.supports as string[],
    })),
    needs: ctx.client.needs.map((n) => ({
      id: n.id,
      support: n.support,
      frequency: n.frequency,
      location: n.location ?? "Home",
    })),
    contacts: (ctx.client.contacts ?? [])
      .filter((c) => c.state !== "Revoked")
      .map((c) => ({
        id: c.id,
        name: c.name,
        role: c.role,
        email: c.email,
        state: c.state,
        authority: c.authorityType,
        responsibilities: c.responsibilities,
      })),
    client: {
      id: ctx.client._id.toHexString(),
      name: ctx.client.name,
      mrn: ctx.client.mrn ?? null,
      email: ctx.client.email,
    },
    rightsBlocks,
  };
}

/* ------------------------------------------------------------------ create (step 7: prefill) */

const unitFor = (support: string) =>
  supportInfo(support as Support).kind === "assessment" ? ("Hour" as const) : ("Hour" as const);
const quantityFor = (support: string) =>
  supportInfo(support as Support).kind === "assessment" ? 6 : 1;
const frequencyFor = (f: string) =>
  f === "Weekly" || f === "Fortnightly" || f === "Monthly"
    ? f
    : f === "Assessment"
      ? "Once"
      : "As agreed";
const settingFor = (loc: string) =>
  (["Home", "School", "Telehealth", "Daycare", "Day Program", "Community"].includes(loc)
    ? loc
    : "Other") as AgreementLine["deliverySetting"];

function scopeFor(support: string) {
  const s: Record<string, string> = {
    "Functional Capacity Assessment":
      "Functional capacity assessment and written report. Assessment and report hours as agreed.",
    "SIL/ILO Housing Assessment":
      "Housing assessment for SIL/ILO: site visit(s) and written report.",
    "SDA Housing Assessment":
      "SDA housing assessment and report. This is an assessment, not provision of SDA accommodation.",
    "Home Mod Assessment":
      "Property visit and home modification report; drawings and later stages only if agreed.",
    "Assistive Technology Assessment":
      "AT assessment, trials and report. Consent is asked before contacting suppliers.",
    "Occupational Therapy":
      "Occupational therapy sessions; treatment and report components as agreed.",
    "Speech Therapy": "Speech therapy sessions; telehealth where suitable.",
    "Swallowing Assessment":
      "Swallowing assessment and report, subject to clinical competency and setting review.",
    "Speech/Language Assessment": "Speech and language assessment and report.",
    "Exercise Physiology": "Exercise physiology appointments.",
    Physiotherapy: "Physiotherapy appointments.",
    "Psychological Assessment":
      "Psychological assessment and report. Confidentiality applies to clinical content on invoices.",
    "Psychological Therapy":
      "Psychological therapy sessions. Invoices show the support only, never session content.",
    "Trauma Therapy": "Trauma-informed therapy sessions. Invoices show the support only.",
    Nursing: "Nursing care as described; no prescribing is implied.",
    Podiatry: "Podiatry appointments.",
  };
  return s[support] ?? "As agreed with the participant.";
}

export const createSchema = z.object({
  clientId: z.string().max(40),
  planId: z.string().max(40).default(""),
});

export async function createAgreement(user: UserDoc, clientId: ObjectId, planId: string) {
  mustEdit(user);
  const db = await collections();
  const ctx = await context(clientId);
  const policy = await fundingPolicy();
  const plan =
    (planId && ctx.plans.find((p) => p._id.toHexString() === planId)) ||
    currentPlan(ctx.plans) ||
    null;
  const today = todayKey();
  const end =
    plan?.end && plan.end > today
      ? plan.end
      : new Date(Date.now() + 180 * 86_400_000).toISOString().slice(0, 10);
  const lines: AgreementInput["lines"] = [];
  for (const n of ctx.client.needs.filter((x) => x.status !== "completed")) {
    const item = itemFor(ctx.priceItems, n.support);
    const budget =
      plan?.budgets.find((b) => b.priceItemId && b.priceItemId === item?._id) ??
      plan?.budgets.find(
        (b) => ctx.priceItems.find((i) => i._id === b.priceItemId)?.category === item?.category,
      ) ??
      plan?.budgets[0] ??
      null;
    lines.push({
      needId: n.id,
      support: n.support,
      kind: "Service",
      scope: scopeFor(n.support),
      deliverySetting: settingFor(n.location ?? "Home"),
      unit: unitFor(n.support),
      quantity: quantityFor(n.support),
      frequency: frequencyFor(n.frequency),
      unitPrice: item ? (item.limits[plan?.geography ?? "National"] ?? 0) : 0,
      priceItemId: item?._id ?? "",
      budgetId: budget?.id ?? "",
    });
    // In-person services get a separate, visible travel line when the budget allows it (AT-14).
    if ((n.location ?? "Home") !== "Telehealth" && budget?.travelAllowed) {
      const travel = ctx.priceItems.find((i) => i._id === "provider-travel");
      lines.push({
        needId: n.id,
        support: n.support,
        kind: "Travel",
        scope: "Provider travel to the visit: non-labour cost per kilometre, only when it applies.",
        deliverySetting: settingFor(n.location ?? "Home"),
        unit: "Kilometre",
        quantity: 20,
        frequency: frequencyFor(n.frequency),
        unitPrice: 0.99,
        priceItemId: travel?._id ?? "",
        budgetId: budget.id,
      });
    }
  }
  const signer = (ctx.client.contacts ?? []).find(
    (c) => c.state !== "Revoked" && c.responsibilities.includes("Consent/Signatory"),
  );
  const _id = new ObjectId();
  const now = new Date();
  const priced = priceLines(lines, plan, ctx.priceItems, ctx.payers);
  const doc: AgreementDoc = {
    _id,
    ref: await nextRef(db.db, "agreement", "SA", 5),
    version: 1,
    type: ctx.agreements.some((a) => a.status === "Signed") ? "Renewal" : "Initial",
    rootId: _id,
    previousId: null,
    clientId,
    planId: plan?._id ?? null,
    status: "Draft",
    provider: policy.providerEntity,
    start: today,
    end,
    signatory: signer
      ? {
          contactId: signer.id,
          name: signer.name,
          email: signer.email,
          authority: authorityOf(signer.role),
          verified: false,
          verifiedBy: null,
        }
      : {
          contactId: "",
          name: ctx.client.name,
          email: ctx.client.email,
          authority: "Participant (self)",
          verified: false,
          verifiedBy: null,
        },
    lines: priced,
    cancellation: DEFAULT_CANCELLATION,
    rights: rightsBlocks.map((r) => r.key),
    communication: ctx.client.profile?.interpreter ? ["Interpreter"] : [],
    communicationNote:
      ctx.client.profile?.language && ctx.client.profile.language !== "English"
        ? `Preferred language: ${ctx.client.profile.language}`
        : "",
    sharing: "Secure link",
    review: { required: false, reasons: [], byName: null, at: null, note: "" },
    link: null,
    acceptance: null,
    changeRequest: null,
    declined: null,
    events: [
      {
        at: now,
        byName: user.name,
        action: "Draft prepared",
        note: "Pre-filled from the service requests and the plan. Never signed automatically.",
      },
    ],
    createdBy: user.name,
    createdAt: now,
    updatedAt: now,
  };
  doc.review.reasons = reviewReasons(doc, plan, policy, null);
  doc.review.required = doc.review.reasons.length > 0;
  await db.agreements.insertOne(doc);
  await audit(user, `Funding: agreement ${doc.ref} drafted`, clientId);
  await changed(clientId);
  return { agreementId: _id.toHexString() };
}

function authorityOf(role: string) {
  if (role === "Participant") return "Participant (self)";
  if (role === "Parent" || role === "Guardian") return "Parent or guardian of a minor";
  if (role === "Nominee") return "Plan nominee";
  return "Other authorised representative";
}

/* ------------------------------------------------------------------ staff actions */

export const agreementActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("save"), agreement: agreementInputSchema }),
  z.object({
    type: z.literal("verify-signatory"),
    note: z.string().trim().min(5, "Record how the authority was checked").max(300),
  }),
  z.object({ type: z.literal("submit-review") }),
  z.object({
    type: z.literal("review"),
    decision: z.enum(["Approve", "Return"]),
    note: z.string().trim().min(3).max(500),
  }),
  z.object({ type: z.literal("issue") }),
  z.object({ type: z.literal("resend") }),
  z.object({ type: z.literal("cancel"), reason: z.string().trim().min(3).max(300) }),
  z.object({
    type: z.literal("amend"),
    reason: z.string().trim().min(3).max(300),
    kind: z.enum(["Amendment", "Renewal", "Replacement"]),
  }),
  z.object({ type: z.literal("download") }),
]);
export type AgreementAction = z.infer<typeof agreementActionSchema>;

async function loadAgreement(id: ObjectId) {
  const { agreements } = await collections();
  const a = await agreements.findOne({ _id: id });
  if (!a) throw new UserFacingError("Agreement not found.", 404);
  return a;
}

function move(a: AgreementDoc, to: AgreementStatus) {
  if (!agreementMoves[a.status].includes(to)) {
    throw new UserFacingError(
      `A ${a.status.toLowerCase()} agreement can't become ${to.toLowerCase()}.`,
      409,
    );
  }
}

export async function agreementAction(user: UserDoc, id: ObjectId, action: AgreementAction) {
  const db = await collections();
  const a = await loadAgreement(id);
  const ctx = await context(a.clientId);
  const policy = await fundingPolicy();
  const now = new Date();
  const set: Partial<AgreementDoc> = {};
  const events: AgreementDoc["events"] = [];
  const result: { link?: string; agreementId?: string } = {};

  switch (action.type) {
    case "save": {
      mustEdit(user);
      // AT-19: signed terms never change in place.
      if (a.status !== "Draft") {
        throw new UserFacingError(
          "Only a draft can be edited. Make an amendment to change issued or signed terms.",
          409,
        );
      }
      const input = action.agreement;
      const plan =
        (input.planId && ctx.plans.find((p) => p._id.toHexString() === input.planId)) || null;
      if (input.planId && !plan)
        throw new UserFacingError("Choose one of this participant's plans.");
      for (const l of input.lines) {
        if (l.budgetId && !plan?.budgets.some((b) => b.id === l.budgetId)) {
          throw new UserFacingError(`${l.support}: choose a budget from the selected plan.`);
        }
      }
      const lines = priceLines(input.lines, plan, ctx.priceItems, ctx.payers);
      const signatoryChanged =
        input.signatory.name !== a.signatory.name ||
        input.signatory.authority !== a.signatory.authority;
      const previous = a.previousId ? await db.agreements.findOne({ _id: a.previousId }) : null;
      const next = { ...a, ...input, lines, planId: plan?._id ?? null };
      const reasons = reviewReasons(next, plan, policy, previous);
      Object.assign(set, {
        start: input.start,
        end: input.end,
        planId: plan?._id ?? null,
        signatory: {
          ...input.signatory,
          verified: signatoryChanged ? false : a.signatory.verified,
          verifiedBy: signatoryChanged ? null : a.signatory.verifiedBy,
        },
        lines,
        cancellation: input.cancellation,
        rights: input.rights,
        communication: input.communication,
        communicationNote: input.communicationNote,
        sharing: input.sharing,
        // New review reasons undo an earlier approval.
        review: {
          required: reasons.length > 0,
          reasons,
          byName: reasons.join("|") === a.review.reasons.join("|") ? a.review.byName : null,
          at: reasons.join("|") === a.review.reasons.join("|") ? a.review.at : null,
          note: reasons.join("|") === a.review.reasons.join("|") ? a.review.note : "",
        },
      });
      events.push({
        at: now,
        byName: user.name,
        action: "Draft saved",
        note: `${lines.length} line${lines.length === 1 ? "" : "s"}, estimate ${aud(lines.reduce((s, l) => s + lineEstimate(l, input.start, input.end), 0))}${input.reason ? `. ${input.reason}` : ""}`,
      });
      break;
    }
    case "verify-signatory": {
      mustEdit(user);
      if (!["Draft", "Internal Review"].includes(a.status))
        throw new UserFacingError("The signatory is fixed once issued.", 409);
      set.signatory = { ...a.signatory, verified: true, verifiedBy: user.name };
      events.push({
        at: now,
        byName: user.name,
        action: "Signatory authority verified",
        note: `${a.signatory.name} as ${a.signatory.authority}. ${action.note}`,
      });
      break;
    }
    case "submit-review": {
      mustEdit(user);
      move(a, "Internal Review");
      if (!a.lines.length) throw new UserFacingError("Add at least one service line.");
      set.status = "Internal Review";
      events.push({
        at: now,
        byName: user.name,
        action: "Sent for internal review",
        note: a.review.reasons.join("; ") || "Commercial-policy review",
      });
      break;
    }
    case "review": {
      mustVerify(user, "approve an agreement in internal review");
      if (a.status !== "Internal Review")
        throw new UserFacingError("This agreement isn't in internal review.", 409);
      if (action.decision === "Approve" && a.createdBy === user.name && a.review.required) {
        throw new UserFacingError(
          "Someone other than the person who drafted it approves the review.",
          409,
        );
      }
      set.status = "Draft";
      set.review =
        action.decision === "Approve"
          ? { ...a.review, byName: user.name, at: now, note: action.note }
          : { ...a.review, byName: null, at: null, note: action.note };
      events.push({
        at: now,
        byName: user.name,
        action: action.decision === "Approve" ? "Internal review approved" : "Returned from review",
        note: action.note,
      });
      break;
    }
    case "issue": {
      mustEdit(user);
      move(a, "Issued");
      if (!a.lines.length)
        throw new UserFacingError("Add at least one service line before issuing.");
      if (a.lines.some((l) => l.unitPrice <= 0 && l.kind !== "Report")) {
        throw new UserFacingError("Every line needs a unit price before issuing.");
      }
      if (!a.signatory.verified) {
        throw new UserFacingError(
          "Verify the signatory's role and authority before issuing (AT-20).",
          409,
        );
      }
      if (a.review.required && !a.review.byName) {
        throw new UserFacingError(
          "This agreement needs internal review approval before it's issued.",
          409,
        );
      }
      const plan = (a.planId && ctx.plans.find((p) => p._id.equals(a.planId!))) || null;
      const inactive = a.lines
        .map((l) => plan?.budgets.find((b) => b.id === l.budgetId))
        .map((b) => (b?.payerId ? ctx.payers.find((p) => p._id.equals(b.payerId!)) : null))
        .find((p) => p?.status === "Inactive");
      if (inactive)
        throw new UserFacingError(
          `Payer ${inactive.name} is inactive. Replace it before issuing.`,
          409,
        );
      // AT-36: a missing or invalid email is a validation error; the draft stays unsent.
      if (a.sharing === "Authorised email") {
        if (!a.signatory.email || !z.string().email().safeParse(a.signatory.email).success) {
          throw new UserFacingError(
            "The signatory's email is missing or invalid. The draft is kept unsent; correct the email or share by secure link.",
          );
        }
      }
      const token = randomBytes(24).toString("base64url");
      set.status = "Issued";
      set.link = { hash: sha256(token), expiresAt: new Date(Date.now() + LINK_DAYS * 86_400_000) };
      // Line payer routes are fixed at issue (AT-27).
      set.lines = priceLines(a.lines, plan, ctx.priceItems, ctx.payers).map((l, i) => ({
        ...l,
        payerRoute: l.payerRoute || a.lines[i]!.payerRoute,
      }));
      events.push({
        at: now,
        byName: user.name,
        action: "Issued",
        note: `Secure link for ${a.signatory.name}, open for ${LINK_DAYS} days${a.sharing === "Authorised email" ? ` (email to ${a.signatory.email}: delivery simulated)` : ""}`,
      });
      result.link = `/agreement/${token}`;
      const patientUser = ctx.client.userId;
      if (patientUser) {
        await notify([patientUser], {
          title: "Your service agreement is ready",
          body: `${a.ref} is ready to review and accept.`,
          href: "/mobile/patient",
        });
      }
      break;
    }
    case "resend": {
      mustEdit(user);
      if (!["Issued", "Viewed"].includes(a.status))
        throw new UserFacingError("Only an issued agreement can be re-sent.", 409);
      const token = randomBytes(24).toString("base64url");
      set.link = { hash: sha256(token), expiresAt: new Date(Date.now() + LINK_DAYS * 86_400_000) };
      events.push({
        at: now,
        byName: user.name,
        action: "Reminder sent",
        note: "A new secure link replaces the old one. Consent is never assumed.",
      });
      result.link = `/agreement/${token}`;
      break;
    }
    case "cancel": {
      mustEdit(user);
      move(a, "Cancelled");
      set.status = "Cancelled";
      set.link = null;
      events.push({ at: now, byName: user.name, action: "Cancelled", note: action.reason });
      break;
    }
    case "amend": {
      mustEdit(user);
      // AT-19: a linked new version; the original stays intact until the new one is signed.
      if (
        !["Signed", "Declined", "Changes Requested", "Expired"].includes(a.status) &&
        !(a.status === "Signed")
      ) {
        throw new UserFacingError(
          "Amend a signed, declined, expired or change-requested agreement.",
          409,
        );
      }
      const open = await db.agreements.findOne({
        rootId: a.rootId,
        status: { $in: ["Draft", "Internal Review", "Issued", "Viewed"] },
      });
      if (open) throw new UserFacingError(`Version ${open.version} is already in progress.`, 409);
      const latest = await db.agreements
        .find({ rootId: a.rootId })
        .sort({ version: -1 })
        .limit(1)
        .next();
      const _id = new ObjectId();
      const newStart =
        action.kind === "Renewal" ? (a.end >= todayKey() ? a.end : todayKey()) : todayKey();
      const doc: AgreementDoc = {
        ...a,
        _id,
        version: (latest?.version ?? a.version) + 1,
        type: action.kind,
        previousId: a._id,
        status: "Draft",
        start:
          action.kind === "Amendment" ? (a.start > todayKey() ? a.start : todayKey()) : newStart,
        end:
          action.kind === "Renewal"
            ? new Date(Date.parse(newStart) + 180 * 86_400_000).toISOString().slice(0, 10)
            : a.end,
        signatory: { ...a.signatory, verified: false, verifiedBy: null },
        review: { required: false, reasons: [], byName: null, at: null, note: "" },
        link: null,
        acceptance: null,
        changeRequest: null,
        declined: null,
        events: [
          {
            at: now,
            byName: user.name,
            action: `${action.kind} drafted from v${a.version}`,
            note:
              action.reason +
              (a.changeRequest ? ` · Participant asked: ${a.changeRequest.note}` : ""),
          },
        ],
        createdBy: user.name,
        createdAt: now,
        updatedAt: now,
      };
      await db.agreements.insertOne(doc);
      events.push({
        at: now,
        byName: user.name,
        action: `${action.kind} v${doc.version} started`,
        note: action.reason,
      });
      // An unsigned version that was answered (changes asked, or declined) is replaced now; a
      // signed version stays in force until its successor is signed.
      if (a.status === "Changes Requested" || a.status === "Declined") {
        set.status = "Superseded";
        set.link = null;
        events.push({
          at: now,
          byName: user.name,
          action: "Superseded",
          note: `By version ${doc.version}`,
        });
      }
      result.agreementId = _id.toHexString();
      break;
    }
    case "download": {
      events.push({
        at: now,
        byName: user.name,
        action: "Downloaded",
        note: `Version ${a.version}${a.status === "Signed" ? " (signed, immutable)" : " (not final)"}`,
      });
      break;
    }
  }

  await db.agreements.updateOne(
    { _id: a._id },
    { $set: { ...set, updatedAt: now }, $push: { events: { $each: events } } },
  );
  for (const e of events)
    await audit(user, `Funding: ${a.ref} v${a.version}: ${e.action}`, a.clientId);
  await changed(a.clientId);
  return result;
}

/* ------------------------------------------------------------------ participant side */

async function byToken(token: string) {
  const { agreements } = await collections();
  const a = await agreements.findOne({ "link.hash": sha256(token) });
  if (!a || !a.link || a.link.expiresAt < new Date()) {
    throw new UserFacingError(
      "This agreement link has expired or isn't valid. Ask Medisense for a new one.",
      404,
    );
  }
  return a;
}

/** What the signatory sees: readable terms only, no staff notes (AT-30). */
function publicDto(a: AgreementDoc, client: ClientDoc | null, plan: FundingPlanDoc | null) {
  return {
    ref: a.ref,
    version: a.version,
    type: a.type,
    status: a.status,
    participant: client?.name ?? "Participant",
    provider: a.provider,
    start: a.start,
    end: a.end,
    signatory: { name: a.signatory.name, authority: a.signatory.authority },
    lines: a.lines.map((l) => ({
      id: l.id,
      support: l.support,
      kind: l.kind,
      scope: l.scope,
      setting: l.deliverySetting,
      unit: l.unit,
      quantity: l.quantity,
      frequency: l.frequency,
      unitPrice: l.unitPrice,
      occurrences: occurrences(l.frequency, a.start, a.end),
      estimate: lineEstimate(l, a.start, a.end),
      paidBy: l.payerRoute.replace(": claim simulated", ""),
    })),
    total: round2(a.lines.reduce((s, l) => s + lineEstimate(l, a.start, a.end), 0)),
    cancellation: a.cancellation,
    rights: rightsBlocks.filter((r) => a.rights.includes(r.key)),
    communication: a.communication,
    communicationNote: a.communicationNote,
    planEnd: plan?.end ?? null,
    acceptance: a.acceptance
      ? { name: a.acceptance.name, role: a.acceptance.role, at: a.acceptance.at.toISOString() }
      : null,
    changeRequest: a.changeRequest
      ? { note: a.changeRequest.note, at: a.changeRequest.at.toISOString() }
      : null,
    declined: a.declined ? { at: a.declined.at.toISOString(), outcome: a.declined.outcome } : null,
  };
}
export type PublicAgreementDto = ReturnType<typeof publicDto>;

export async function publicAgreement(token: string) {
  const db = await collections();
  const a = await byToken(token);
  if (a.status === "Issued") {
    await db.agreements.updateOne(
      { _id: a._id },
      {
        $set: { status: "Viewed", updatedAt: new Date() },
        $push: {
          events: {
            at: new Date(),
            byName: a.signatory.name,
            action: "Viewed",
            note: "Opened the secure link",
          },
        },
      },
    );
    a.status = "Viewed";
    await changed(a.clientId);
  }
  const [client, plan] = await Promise.all([
    db.clients.findOne({ _id: a.clientId }),
    a.planId ? db.fundingPlans.findOne({ _id: a.planId }) : null,
  ]);
  return publicDto(a, client, plan);
}

export const publicActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("accept"),
    name: z.string().trim().min(2, "Type your full name").max(120),
    role: z.string().trim().min(2).max(80),
    confirmAuthority: z.literal(true, { message: "Confirm you're authorised to sign" }),
    confirmRead: z.literal(true, { message: "Confirm you've read the agreement" }),
  }),
  z.object({
    action: z.literal("change"),
    note: z.string().trim().min(5, "Tell us what you'd like changed").max(1000),
  }),
  z.object({ action: z.literal("decline"), reason: z.string().trim().max(1000).default("") }),
]);

export async function publicAgreementAction(
  token: string,
  input: z.infer<typeof publicActionSchema>,
) {
  const db = await collections();
  const a = await byToken(token);
  if (!["Issued", "Viewed"].includes(a.status)) {
    throw new UserFacingError("This agreement has already been answered.", 409);
  }
  const now = new Date();
  const policy = await fundingPolicy();
  const set: Partial<AgreementDoc> = {};
  let event: AgreementDoc["events"][number];
  switch (input.action) {
    case "accept": {
      if (input.name.trim().toLowerCase() !== a.signatory.name.trim().toLowerCase()) {
        throw new UserFacingError(
          `Type the signatory's name as recorded: ${a.signatory.name}. If someone else should sign, ask for a change.`,
        );
      }
      set.status = "Signed";
      set.acceptance = {
        name: input.name,
        role: input.role,
        at: now,
        version: a.version,
        method: "Typed-name acceptance through secure link (simulated e-signature)",
        consent: "Confirmed authority to sign and that the agreement was read",
      };
      set.link = null;
      event = {
        at: now,
        byName: input.name,
        action: "Accepted and signed",
        note: `Version ${a.version}, as ${input.role} (simulated e-signature)`,
      };
      // The earlier signed version is superseded only now (AT-19); its deliveries keep its terms.
      if (a.previousId) {
        await db.agreements.updateMany(
          {
            rootId: a.rootId,
            _id: { $ne: a._id },
            status: { $in: ["Signed", "Declined", "Changes Requested", "Expired"] },
          },
          {
            $set: { status: "Superseded", updatedAt: now },
            $push: {
              events: {
                at: now,
                byName: "Medisense",
                action: "Superseded",
                note: `By version ${a.version}`,
              },
            },
          },
        );
      }
      break;
    }
    case "change": {
      set.status = "Changes Requested";
      set.changeRequest = { note: input.note, at: now };
      set.link = null;
      event = { at: now, byName: a.signatory.name, action: "Changes requested", note: input.note };
      break;
    }
    case "decline": {
      // AT-21: handled by Medisense's policy, not a claim that services are legally impossible.
      const outcome =
        policy.declinePolicy === "Hold new bookings until resolved"
          ? "A written agreement isn't legally required for these supports. Under Medisense's policy, new bookings wait until we've talked with you."
          : "A written agreement isn't legally required for these supports. Under Medisense's policy, services can continue with a documented verbal agreement; we'll contact you.";
      set.status = "Declined";
      set.declined = { reason: input.reason, at: now, outcome };
      set.link = null;
      event = {
        at: now,
        byName: a.signatory.name,
        action: "Declined",
        note: input.reason || "No reason given",
      };
      break;
    }
  }
  await db.agreements.updateOne(
    { _id: a._id },
    { $set: { ...set, updatedAt: now }, $push: { events: event } },
  );
  await db.audit.insertOne({
    _id: new ObjectId(),
    actorId: a.clientId,
    actorName: event.byName,
    action: `Funding: ${a.ref} v${a.version}: ${event.action}`,
    clientId: a.clientId,
    at: now,
  });
  await notify(await adminIds(), {
    title: `${a.ref}: ${event.action.toLowerCase()}`,
    body: `${a.signatory.name} ${event.action.toLowerCase()} version ${a.version}.`,
    href: `/care/funding/agreements/${a._id.toHexString()}`,
  });
  await changed(a.clientId);
  const fresh = await db.agreements.findOne({ _id: a._id });
  return publicDto(fresh!, await db.clients.findOne({ _id: a.clientId }), null);
}

/** The patient app: the participant's own issued and signed agreements (AT-30). */
export async function myAgreements(clientId: ObjectId) {
  const { agreements } = await collections();
  const docs = await agreements
    .find({
      clientId,
      status: {
        $in: [
          "Issued",
          "Viewed",
          "Signed",
          "Changes Requested",
          "Declined",
          "Expired",
          "Superseded",
        ],
      },
    })
    .sort({ createdAt: -1 })
    .toArray();
  return docs.map((a) => ({
    id: a._id.toHexString(),
    ref: a.ref,
    version: a.version,
    status: a.status,
    start: a.start,
    end: a.end,
    services: [...new Set(a.lines.filter((l) => l.kind === "Service").map((l) => l.support))],
    total: round2(a.lines.reduce((s, l) => s + lineEstimate(l, a.start, a.end), 0)),
    signedAt: a.acceptance?.at.toISOString() ?? null,
    canRespond: a.status === "Issued" || a.status === "Viewed",
  }));
}

/** Opens a fresh secure link for the participant's own agreement from the app. */
export async function openMyAgreement(clientId: ObjectId, id: ObjectId) {
  const db = await collections();
  const a = await db.agreements.findOne({ _id: id, clientId });
  if (!a) throw new UserFacingError("Agreement not found.", 404);
  if (
    ![
      "Issued",
      "Viewed",
      "Signed",
      "Changes Requested",
      "Declined",
      "Expired",
      "Superseded",
    ].includes(a.status)
  ) {
    throw new UserFacingError("This agreement isn't ready for you yet.", 409);
  }
  const token = randomBytes(24).toString("base64url");
  await db.agreements.updateOne(
    { _id: a._id },
    {
      $set: { link: { hash: sha256(token), expiresAt: new Date(Date.now() + 86_400_000) } },
      $push: {
        events: {
          at: new Date(),
          byName: "Patient app",
          action: "Opened in the patient app",
          note: "",
        },
      },
    },
  );
  return { link: `/agreement/${token}` };
}

/** AT-29: what a therapist may see: service constraints only, no payer, budget or prices. */
export async function therapistConstraints(user: UserDoc, clientId: ObjectId) {
  const db = await collections();
  const client = await db.clients.findOne({ _id: clientId });
  if (!client || !user.therapistId) throw new UserFacingError("Patient not found.", 404);
  const mine = client.needs.filter((n) => n.therapistId?.equals(user.therapistId!));
  if (!mine.length)
    throw new UserFacingError("Only the treating clinician sees these limits.", 404);
  const [agreements, plans] = await Promise.all([
    db.agreements.find({ clientId, status: { $nin: ["Cancelled", "Superseded"] } }).toArray(),
    db.fundingPlans.find({ clientId, status: { $ne: "Superseded" } }).toArray(),
  ]);
  const plan = currentPlan(plans);
  return {
    planEnd: plan?.end ?? null,
    lines: mine.map((n) => {
      const a = agreements
        .filter((x) => x.lines.some((l) => l.needId === n.id))
        .sort(
          (x, y) =>
            Number(y.status === "Signed") - Number(x.status === "Signed") || y.version - x.version,
        )[0];
      const service = a?.lines.find((l) => l.needId === n.id && l.kind === "Service");
      return {
        support: n.support,
        agreement: a ? `${a.ref} v${a.version}` : null,
        status: a?.status ?? "No agreement yet",
        end: a?.end ?? null,
        unit: service?.unit ?? null,
        quantity: service?.quantity ?? null,
        frequency: service?.frequency ?? null,
        setting: service?.deliverySetting ?? null,
        scope: service?.scope ?? null,
        travel: Boolean(a?.lines.some((l) => l.needId === n.id && l.kind === "Travel")),
        nonFaceToFace: Boolean(
          a?.lines.some(
            (l) => l.needId === n.id && (l.kind === "Non-face-to-face" || l.kind === "Report"),
          ),
        ),
      };
    }),
  };
}

export { canVerify };
