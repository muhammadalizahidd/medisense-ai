import "server-only";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { generateJson } from "@/lib/ai/engine";
import { AiError, rethrowDisabled } from "@/lib/ai/types";
import {
  type adjustmentInputSchema,
  type allocationSchema,
  aud,
  lineMoney,
  type paymentInputSchema,
  round2,
  type AdjustmentDto,
  type FinanceHubDto,
  type PaymentDto,
  type StatementLineDto,
} from "@/lib/live/finance";
import { collections } from "./db";
import {
  backfillBillables,
  billableDto,
  chargeRules,
  claimDto,
  dayOf,
  ev,
  financeChanged,
  financeUserIds,
  invoiceDto07,
  invoiceTotals,
  isManager,
  isOfficer,
  managerIds,
  mustManager,
  mustOfficer,
  nextRef,
  refresh,
  settleClaim,
  settleInvoice,
  todayKey,
} from "./finance";
import { UserFacingError } from "./http";
import { audit, notify } from "./live";
import type { AdjustmentDoc, BillableDoc, PaymentDoc, UserDoc } from "./models";

/* ------------------------------------------------------------------ payments (section 9) */

function paymentState(
  p: Pick<PaymentDoc, "amount" | "allocations" | "refunded" | "status" | "recon">,
) {
  const allocated = round2(p.allocations.reduce((s, a) => s + a.amount, 0));
  const unapplied = round2(p.amount - allocated - (p.refunded ?? 0));
  return { allocated, unapplied };
}
function nextStatus(p: PaymentDoc): PaymentDoc["status"] {
  if (p.status === "Reversed" || p.status === "Refund pending") return p.status;
  const { allocated, unapplied } = paymentState(p);
  if (p.recon === "Reconciled" && unapplied <= 0) return "Reconciled";
  if (allocated === 0) return "Unallocated";
  return unapplied > 0 ? "Partially allocated" : "Allocated";
}

export async function recordPayment(user: UserDoc, input: z.infer<typeof paymentInputSchema>) {
  mustOfficer(user);
  const db = await collections();
  if (input.receivedOn > todayKey())
    throw new UserFacingError("A payment can't be received in the future.");
  const dup = await db.payments.findOne({
    reference: input.reference,
    status: { $ne: "Reversed" },
  });
  const _id = new ObjectId();
  await db.payments.insertOne({
    _id,
    ref: await nextRef(db.db, "payment", "PAY", 4),
    ...input,
    amount: round2(input.amount),
    status: "Unallocated",
    allocations: [],
    recon: "Unmatched",
    refunded: 0,
    history: [
      ev(user, `Recorded ${aud(input.amount)} by ${input.method} (simulated: no money moved)`),
      ...(dup
        ? [ev("Duplicate check", `Reference also used on ${dup.ref}: check before allocating`)]
        : []),
    ],
    createdAt: new Date(),
  });
  await audit(user, `Finance: payment ${input.reference} ${aud(input.amount)} recorded`, null);
  await financeChanged();
  return { paymentId: _id.toHexString(), duplicate: Boolean(dup) };
}

/** AC-23, AC-24: partial and split allocation, never more than the payment or the balance. */
export async function allocatePayment(
  user: UserDoc,
  id: ObjectId,
  input: z.infer<typeof allocationSchema>,
) {
  mustOfficer(user);
  const db = await collections();
  const p = await db.payments.findOne({ _id: id });
  if (!p) throw new UserFacingError("Payment not found.", 404);
  if (p.status === "Reversed")
    throw new UserFacingError("A reversed payment can't be allocated.", 409);
  const { unapplied } = paymentState(p);
  const total = round2(input.allocations.reduce((s, a) => s + a.amount, 0));
  if (total > unapplied + 0.001) {
    throw new UserFacingError(
      `That allocates ${aud(total)}, but only ${aud(unapplied)} of this payment is unapplied.`,
    );
  }
  const now = new Date();
  for (const a of input.allocations) {
    const target = new ObjectId(a.id);
    if (a.target === "invoice") {
      const inv = await db.invoices.findOne({ _id: target });
      if (!inv) throw new UserFacingError("Invoice not found.", 404);
      if (!["Issued", "Part-Paid", "Disputed"].includes(inv.status)) {
        throw new UserFacingError(
          `${inv.number} is ${inv.status}: allocate only to issued invoices.`,
          409,
        );
      }
      const t = invoiceTotals(inv);
      if (round2(a.amount) > t.balance + 0.001) {
        throw new UserFacingError(
          `${inv.number} only has ${aud(t.balance)} outstanding. Leave the rest unapplied.`,
        );
      }
    } else {
      const c = await db.claims.findOne({ _id: target });
      if (!c) throw new UserFacingError("Claim not found.", 404);
      if (!["Accepted", "Partially Paid", "Submitted"].includes(c.status)) {
        throw new UserFacingError(
          `${c.ref} is ${c.status}: remittances apply to submitted or accepted claims.`,
          409,
        );
      }
      if (round2(a.amount) > round2(c.total - c.paid) + 0.001) {
        throw new UserFacingError(`${c.ref} only has ${aud(c.total - c.paid)} unpaid.`);
      }
    }
  }
  for (const a of input.allocations) {
    const target = new ObjectId(a.id);
    const amount = round2(a.amount);
    if (a.target === "invoice") {
      await db.invoices.updateOne(
        { _id: target },
        {
          $push: {
            payments: {
              amount,
              reference: p.reference,
              byName: user.name,
              at: now,
              paymentId: p._id,
            },
          },
          $set: { updatedAt: now },
        },
      );
      await settleInvoice(target, user.name);
    } else {
      await db.claims.updateOne(
        { _id: target },
        {
          $inc: { paid: amount },
          $push: { history: ev(user, `Remittance ${p.ref} ${aud(amount)} applied`) },
          $set: { updatedAt: now },
        },
      );
      await settleClaim(target, user.name);
    }
  }
  const allocations = [
    ...p.allocations,
    ...input.allocations.map((a) => ({
      target: a.target,
      id: new ObjectId(a.id),
      amount: round2(a.amount),
      at: now,
      byName: user.name,
    })),
  ];
  const next = { ...p, allocations };
  await db.payments.updateOne(
    { _id: id },
    {
      $set: { allocations, status: nextStatus(next) },
      $push: {
        history: ev(
          user,
          `Allocated ${aud(total)} across ${input.allocations.length} item(s); ${aud(paymentState(next).unapplied)} unapplied`,
        ),
      },
    },
  );
  await audit(user, `Finance: ${p.ref} allocated ${aud(total)}`, null);
  await financeChanged();
  return { ok: true };
}

/** A Finance Manager reverses a payment: allocations come off every invoice and claim. */
export async function reversePayment(user: UserDoc, id: ObjectId, reason: string) {
  mustManager(user, "reverse a payment");
  const db = await collections();
  const p = await db.payments.findOne({ _id: id });
  if (!p) throw new UserFacingError("Payment not found.", 404);
  if (p.status === "Reversed") throw new UserFacingError("Already reversed.", 409);
  for (const a of p.allocations) {
    if (a.target === "invoice") {
      await db.invoices.updateOne({ _id: a.id }, { $pull: { payments: { paymentId: p._id } } });
      const inv = await db.invoices.findOne({ _id: a.id });
      if (inv && ["Paid", "Part-Paid"].includes(inv.status)) {
        const t = invoiceTotals(inv);
        const to = t.paid + t.credited > 0 ? "Part-Paid" : "Issued";
        await db.invoices.updateOne(
          { _id: a.id },
          {
            $set: { status: to },
            $push: {
              history: {
                status: to,
                byName: user.name,
                note: `Payment ${p.ref} reversed`,
                at: new Date(),
              },
            },
          },
        );
      }
    } else {
      await db.claims.updateOne(
        { _id: a.id },
        { $inc: { paid: -a.amount }, $push: { history: ev(user, `Remittance ${p.ref} reversed`) } },
      );
    }
  }
  await db.payments.updateOne(
    { _id: id },
    {
      $set: { status: "Reversed", allocations: [] },
      $push: { history: ev(user, `Reversed: ${reason}`) },
    },
  );
  await audit(user, `Finance: ${p.ref} reversed: ${reason}`, null);
  await financeChanged();
}

/* ------------------------------------------------------------------ reconciliation (section 9) */

/** Mock statement import: one line per unmatched payment, plus two the books don't know yet. */
export async function importStatement(user: UserDoc) {
  mustOfficer(user);
  const db = await collections();
  const payments = await db.payments.find({ status: { $ne: "Reversed" } }).toArray();
  const lines = await db.statement.find().toArray();
  const known = new Set(lines.map((l) => l.reference));
  const now = new Date();
  const adds = payments
    .filter((p) => !known.has(p.reference))
    .map((p) => ({
      _id: new ObjectId(),
      date: p.receivedOn,
      amount: p.amount,
      reference: p.reference,
      description: `DIRECT CREDIT ${p.payer.toUpperCase().slice(0, 24)} ${p.reference}`,
      status: "Unmatched" as const,
      paymentId: null,
      reviewedBy: null,
      importedAt: now,
    }));
  // An unknown receipt the size of an open invoice balance (scenario S08), and a repeated reference.
  const open = await db.invoices
    .find({ status: { $in: ["Issued", "Part-Paid"] } })
    .limit(5)
    .toArray();
  const target = open.map((i) => ({ i, b: invoiceTotals(i).balance })).find((x) => x.b > 0);
  const stamp = String(Date.now()).slice(-5);
  if (target) {
    adds.push({
      _id: new ObjectId(),
      date: todayKey(),
      amount: target.b,
      reference: `DC${stamp}`,
      description: `DIRECT CREDIT ${target.i.number.replace("-", "")} PAYMENT`,
      status: "Unmatched",
      paymentId: null,
      reviewedBy: null,
      importedAt: now,
    });
  }
  if (adds.length) {
    adds.push({
      ...adds[0]!,
      _id: new ObjectId(),
      description: `${adds[0]!.description} (repeat)`,
    });
  }
  if (adds.length) await db.statement.insertMany(adds);
  await audit(user, `Finance: imported ${adds.length} mock statement line(s)`, null);
  await financeChanged();
  return { imported: adds.length };
}

export const reconActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("match"), paymentId: z.string().max(40) }),
  z.object({
    type: z.literal("create-payment"),
    payer: z.string().trim().min(2).max(160),
    method: z.enum(["Bank Transfer", "Card", "Cash", "Cheque", "NDIS Remittance", "Other"]),
  }),
  z.object({ type: z.literal("review"), note: z.string().trim().max(300).default("") }),
  z.object({ type: z.literal("reconcile") }),
  z.object({ type: z.literal("unmatch") }),
]);

/** AC-27: suggestions never reconcile by themselves; a person confirms each step. */
export async function reconAction(
  user: UserDoc,
  id: ObjectId,
  action: z.infer<typeof reconActionSchema>,
) {
  mustOfficer(user);
  const db = await collections();
  const line = await db.statement.findOne({ _id: id });
  if (!line) throw new UserFacingError("Statement line not found.", 404);
  let note = "";
  switch (action.type) {
    case "match": {
      const p = await db.payments.findOne({ _id: new ObjectId(action.paymentId) });
      if (!p) throw new UserFacingError("Payment not found.", 404);
      if (round2(p.amount) !== round2(line.amount)) {
        throw new UserFacingError(
          `Amounts differ: statement ${aud(line.amount)}, payment ${aud(p.amount)}. Check before matching.`,
          409,
        );
      }
      const taken = await db.statement.findOne({ paymentId: p._id, _id: { $ne: line._id } });
      if (taken)
        throw new UserFacingError(`${p.ref} is already matched to another statement line.`, 409);
      await db.statement.updateOne({ _id: id }, { $set: { status: "Matched", paymentId: p._id } });
      await db.payments.updateOne(
        { _id: p._id },
        {
          $set: { recon: "Matched" },
          $push: { history: ev(user, `Matched to statement line ${line.reference}`) },
        },
      );
      note = `matched to ${p.ref}`;
      break;
    }
    case "create-payment": {
      const res = await recordPaymentFromLine(user, line, action.payer, action.method);
      note = `payment ${res} created from the statement line`;
      break;
    }
    case "review":
      if (line.status !== "Matched")
        throw new UserFacingError("Match the line to a payment first.", 409);
      await db.statement.updateOne(
        { _id: id },
        { $set: { status: "Reviewed", reviewedBy: user.name } },
      );
      note = `reviewed${action.note ? `: ${action.note}` : ""}`;
      break;
    case "reconcile": {
      if (!["Matched", "Reviewed"].includes(line.status) || !line.paymentId) {
        throw new UserFacingError("Only a matched line can be reconciled.", 409);
      }
      await db.statement.updateOne(
        { _id: id },
        { $set: { status: "Reconciled", reviewedBy: line.reviewedBy ?? user.name } },
      );
      const p = await db.payments.findOne({ _id: line.paymentId });
      if (p) {
        const next = { ...p, recon: "Reconciled" as const };
        await db.payments.updateOne(
          { _id: p._id },
          {
            $set: { recon: "Reconciled", status: nextStatus(next) },
            $push: { history: ev(user, `Reconciled against the bank statement`) },
          },
        );
      }
      note = "reconciled";
      break;
    }
    case "unmatch":
      if (line.status === "Reconciled") mustManager(user, "undo a reconciliation");
      if (line.paymentId)
        await db.payments.updateOne(
          { _id: line.paymentId },
          {
            $set: { recon: "Unmatched" },
            $push: { history: ev(user, "Unmatched from the statement") },
          },
        );
      await db.statement.updateOne(
        { _id: id },
        { $set: { status: "Unmatched", paymentId: null, reviewedBy: null } },
      );
      note = "unmatched";
      break;
  }
  await audit(user, `Finance: statement ${line.reference} ${note}`, null);
  await financeChanged();
  return { ok: true };
}

async function recordPaymentFromLine(
  user: UserDoc,
  line: { _id: ObjectId; date: string; amount: number; reference: string },
  payer: string,
  method: string,
) {
  const db = await collections();
  const _id = new ObjectId();
  const ref = await nextRef(db.db, "payment", "PAY", 4);
  await db.payments.insertOne({
    _id,
    ref,
    payer,
    receivedOn: line.date,
    method,
    amount: line.amount,
    reference: line.reference,
    note: "Created from an unidentified bank statement line",
    status: "Unallocated",
    allocations: [],
    recon: "Matched",
    refunded: 0,
    history: [ev(user, `Created from statement line ${line.reference}; payer identified manually`)],
    createdAt: new Date(),
  });
  await db.statement.updateOne({ _id: line._id }, { $set: { status: "Matched", paymentId: _id } });
  return ref;
}

/* ------------------------------------------------------------------ adjustments (section 9) */

export async function requestAdjustment(
  user: UserDoc,
  input: z.infer<typeof adjustmentInputSchema>,
) {
  mustOfficer(user);
  if (input.type === "Write-off") mustManager(user, "request a write-off");
  const db = await collections();
  const amount = round2(input.amount);
  let invoiceId: ObjectId | null = null;
  let paymentId: ObjectId | null = null;
  if (input.type === "Refund") {
    const p = input.paymentId
      ? await db.payments.findOne({ _id: new ObjectId(input.paymentId) })
      : null;
    if (!p) throw new UserFacingError("Choose the payment to refund from.", 404);
    const { unapplied } = paymentState(p);
    if (amount > unapplied + 0.001)
      throw new UserFacingError(`Only ${aud(unapplied)} of ${p.ref} is unapplied and refundable.`);
    paymentId = p._id;
  } else {
    const inv = input.invoiceId
      ? await db.invoices.findOne({ _id: new ObjectId(input.invoiceId) })
      : null;
    if (!inv) throw new UserFacingError("Choose the invoice.", 404);
    if (!["Issued", "Part-Paid", "Paid", "Disputed"].includes(inv.status)) {
      throw new UserFacingError(
        "Credits and write-offs apply to issued invoices. Edit a draft directly.",
        409,
      );
    }
    const t = invoiceTotals(inv);
    if (input.type === "Credit note" && amount > round2(t.total - t.credited) + 0.001) {
      throw new UserFacingError(
        `The credit can't exceed what's left to credit (${aud(t.total - t.credited)}).`,
      );
    }
    if (input.type === "Write-off" && amount > t.balance + 0.001) {
      throw new UserFacingError(`A write-off can't exceed the balance (${aud(t.balance)}).`);
    }
    invoiceId = inv._id;
  }
  const _id = new ObjectId();
  const prefix =
    input.type === "Credit note"
      ? "CR"
      : input.type === "Debit note"
        ? "DR"
        : input.type === "Write-off"
          ? "WO"
          : "RF";
  const ref = await nextRef(db.db, `adjustment-${prefix}`, prefix, 3);
  await db.adjustments.insertOne({
    _id,
    ref,
    type: input.type,
    status: "Requested",
    invoiceId,
    paymentId,
    lineIds: input.lineIds,
    amount,
    reason: input.reason,
    refundReason: input.refundReason ?? null,
    rebill: input.rebill,
    rebillInvoiceId: null,
    requestedBy: user.name,
    reviewedBy: null,
    decidedBy: null,
    history: [ev(user, `${input.type} of ${aud(amount)} requested: ${input.reason}`)],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await notify(await managerIds(), {
    title: `${ref} awaits approval`,
    body: `${input.type} ${aud(amount)}: ${input.reason}`,
    href: "/care/billing?tab=adjustments",
  });
  await audit(user, `Finance: ${ref} ${input.type} ${aud(amount)} requested`, null);
  await financeChanged();
  return { adjustmentId: _id.toHexString(), ref };
}

export const adjustmentActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("review"), note: z.string().trim().max(300).default("") }),
  z.object({
    type: z.literal("decide"),
    approve: z.boolean(),
    note: z.string().trim().min(3, "Add a note").max(300),
  }),
  z.object({ type: z.literal("apply") }),
]);

export async function adjustmentAction(
  user: UserDoc,
  id: ObjectId,
  action: z.infer<typeof adjustmentActionSchema>,
) {
  mustOfficer(user);
  const db = await collections();
  const a = await db.adjustments.findOne({ _id: id });
  if (!a) throw new UserFacingError("Adjustment not found.", 404);
  const now = new Date();
  const set: Partial<AdjustmentDoc> = {};
  let note = "";
  switch (action.type) {
    case "review":
      if (a.status !== "Requested")
        throw new UserFacingError("Only a requested adjustment is reviewed.", 409);
      set.status = "Reviewed";
      set.reviewedBy = user.name;
      note = `Reviewed${action.note ? `: ${action.note}` : ""}`;
      break;
    case "decide":
      // AC-31: Finance Officers prepare; Finance Managers approve.
      mustManager(user, "approve credits, write-offs and refunds");
      if (!["Requested", "Reviewed"].includes(a.status))
        throw new UserFacingError("This adjustment is already decided.", 409);
      if (action.approve && a.requestedBy === user.name) {
        throw new UserFacingError("Someone other than the requester approves an adjustment.", 409);
      }
      set.status = action.approve ? "Approved" : "Rejected";
      set.decidedBy = user.name;
      note = `${action.approve ? "Approved" : "Rejected"}: ${action.note}`;
      break;
    case "apply": {
      if (a.status !== "Approved")
        throw new UserFacingError("Only an approved adjustment is applied.", 409);
      set.status = "Applied";
      if (a.type === "Credit note" || a.type === "Write-off") {
        const inv = await db.invoices.findOne({ _id: a.invoiceId! });
        if (!inv) throw new UserFacingError("Invoice not found.", 404);
        const t = invoiceTotals(inv);
        const version = (inv.version ?? 1) + 1;
        // AC-22, AC-37: a linked credit; the issued version is kept, never edited.
        await db.invoices.updateOne(
          { _id: inv._id },
          {
            $set: { version, updatedAt: now },
            $push: {
              credits: {
                adjustmentId: a._id,
                ref: a.ref,
                amount: a.amount,
                at: now,
                reason: `${a.type}: ${a.reason}`,
              },
              versions: {
                version,
                at: now,
                byName: user.name,
                reason: `${a.ref} ${a.type} ${aud(a.amount)}`,
                total: t.total,
                lines: inv.lines,
              },
              history: {
                status: inv.status,
                byName: user.name,
                note: `${a.ref} applied: ${aud(a.amount)} ${a.type.toLowerCase()}`,
                at: now,
              },
            },
          },
        );
        await settleInvoice(inv._id, user.name);
        if (a.type === "Credit note" && a.rebill && a.lineIds.length) {
          // A corrected copy of each credited line goes back to the queue, linked to this credit.
          const ids = inv.lines
            .filter((l) => a.lineIds.includes(l.id) && l.billableId)
            .map((l) => l.billableId!);
          const originals = await db.billables.find({ _id: { $in: ids } }).toArray();
          for (const o of originals) {
            const copy: BillableDoc = {
              ...o,
              _id: new ObjectId(),
              ref: await nextRef(db.db, "billable", "BIL", 6),
              sourceKey: `${o.sourceKey}:rebill:${a.ref}`,
              status: "Pending verification",
              hold: null,
              invoiceId: null,
              claimId: null,
              duplicateOf: null,
              history: [
                ev(
                  user,
                  `Rebill copy of ${o.ref} after ${a.ref}: correct it, then prepare a new invoice`,
                ),
              ],
              createdAt: now,
              updatedAt: now,
            };
            await db.billables.insertOne(copy);
            await db.billables.updateOne(
              { _id: o._id },
              {
                $set: { hold: null },
                $push: { history: ev(user, `Credited by ${a.ref}; rebill copy ${copy.ref}`) },
              },
            );
            await refresh(copy._id);
          }
        }
        note = `Applied to ${inv.number}`;
      } else if (a.type === "Refund") {
        const p = await db.payments.findOne({ _id: a.paymentId! });
        if (!p) throw new UserFacingError("Payment not found.", 404);
        await db.payments.updateOne(
          { _id: p._id },
          {
            $inc: { refunded: a.amount },
            $set: { status: "Refund pending" },
            $push: {
              history: ev(
                user,
                `${a.ref} refund ${aud(a.amount)} approved: recorded as pending (simulated; no money moved)`,
              ),
            },
          },
        );
        note = `Refund of ${aud(a.amount)} recorded against ${p.ref} (simulated)`;
      } else if (a.type === "Debit note") {
        const inv = a.invoiceId ? await db.invoices.findOne({ _id: a.invoiceId }) : null;
        const source = inv?.lines.find((l) => l.billableId)?.billableId;
        const base = source ? await db.billables.findOne({ _id: source }) : null;
        if (!base)
          throw new UserFacingError("A debit note needs an invoice with a billable line.", 409);
        const debit: BillableDoc = {
          ...base,
          _id: new ObjectId(),
          ref: await nextRef(db.db, "billable", "BIL", 6),
          sourceKey: `${base.sourceKey}:debit:${a.ref}`,
          source: "Other",
          unit: "Each",
          quantity: 1,
          rate: a.amount,
          rateSource: `Debit note ${a.ref}`,
          priceLimit: null,
          status: "Pending verification",
          invoiceId: null,
          claimId: null,
          duplicateOf: null,
          history: [ev(user, `Debit ${aud(a.amount)} from ${a.ref}: ${a.reason}`)],
          createdAt: now,
          updatedAt: now,
        };
        await db.billables.insertOne(debit);
        await refresh(debit._id);
        note = `Debit line ${debit.ref} added to the queue`;
      }
      break;
    }
  }
  await db.adjustments.updateOne(
    { _id: id },
    { $set: { ...set, updatedAt: now }, $push: { history: ev(user, note) } },
  );
  await audit(user, `Finance: ${a.ref} ${note}`, null);
  await financeChanged();
  return { ok: true };
}

/* ------------------------------------------------------------------ hub read model */

function suggestionsFor(
  line: { amount: number; reference: string; date: string; description: string },
  payments: PaymentDoc[],
  invoices: { id: string; number: string; balance: number; payer: string }[],
) {
  const out: StatementLineDto["suggestions"] = [];
  for (const p of payments.filter((x) => x.status !== "Reversed")) {
    let score = 0;
    const why: string[] = [];
    if (round2(p.amount) === round2(line.amount)) {
      score += 50;
      why.push("same amount");
    }
    if (p.reference && line.reference && p.reference === line.reference) {
      score += 40;
      why.push("same reference");
    }
    const days = Math.abs(Date.parse(p.receivedOn) - Date.parse(line.date)) / 86_400_000;
    if (days <= 3) {
      score += 10;
      why.push("within 3 days");
    }
    const firstWord = p.payer.split(/\s+/)[0]?.toUpperCase() ?? "";
    if (firstWord.length > 2 && line.description.toUpperCase().includes(firstWord)) {
      score += 10;
      why.push("payer name in description");
    }
    if (score >= 50)
      out.push({
        kind: "payment",
        id: p._id.toHexString(),
        label: `${p.ref} · ${p.payer} · ${aud(p.amount)}`,
        score: Math.min(score, 100),
        why,
      });
  }
  for (const i of invoices) {
    let score = 0;
    const why: string[] = [];
    if (round2(i.balance) === round2(line.amount)) {
      score += 45;
      why.push("equals the open balance");
    }
    if (line.description.replace(/\W/g, "").includes(i.number.replace(/\W/g, ""))) {
      score += 40;
      why.push("invoice number in description");
    }
    if (score >= 45)
      out.push({
        kind: "invoice",
        id: i.id,
        label: `${i.number} · ${i.payer} · balance ${aud(i.balance)}`,
        score: Math.min(score, 100),
        why,
      });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

export async function financeHub(user: UserDoc): Promise<FinanceHubDto> {
  if (!isOfficer(user) && user.role !== "admin")
    throw new UserFacingError("Finance is for staff.", 409);
  await backfillBillables();
  await (await import("./finance-demo")).seedFinanceDemo();
  const db = await collections();
  const rules = await chargeRules();
  const [billables, invoices, claims, payments, statement, adjustments, clients, items] =
    await Promise.all([
      db.billables.find().sort({ start: -1 }).limit(800).toArray(),
      db.invoices.find().sort({ updatedAt: -1 }).limit(400).toArray(),
      db.claims.find().sort({ updatedAt: -1 }).toArray(),
      db.payments.find().sort({ createdAt: -1 }).toArray(),
      db.statement.find().sort({ importedAt: -1, date: -1 }).toArray(),
      db.adjustments.find().sort({ createdAt: -1 }).toArray(),
      db.clients.find({}, { projection: { name: 1 } }).toArray(),
      db.priceItems.find().toArray(),
    ]);
  const names = new Map(clients.map((c) => [c._id.toHexString(), c.name]));
  const invNumbers = new Map(invoices.map((i) => [i._id.toHexString(), i.number]));
  const claimRefs = new Map(claims.map((c) => [c._id.toHexString(), c.ref]));
  const invDtos = await Promise.all(invoices.map((i) => invoiceDto07(i, names, rules)));
  const claimDtos = await Promise.all(claims.map((c) => claimDto(c, names)));
  const openInvoices = invDtos.filter(
    (i) => ["Issued", "Part-Paid", "Disputed"].includes(i.status) && i.balance > 0,
  );
  const refCount = new Map<string, number>();
  for (const p of payments.filter((x) => x.status !== "Reversed"))
    refCount.set(p.reference, (refCount.get(p.reference) ?? 0) + 1);
  const lineRefCount = new Map<string, number>();
  for (const l of statement)
    lineRefCount.set(
      `${l.reference}|${l.amount}`,
      (lineRefCount.get(`${l.reference}|${l.amount}`) ?? 0) + 1,
    );

  const paymentDtos: PaymentDto[] = payments.map((p) => {
    const { allocated, unapplied } = paymentState(p);
    return {
      id: p._id.toHexString(),
      ref: p.ref,
      payer: p.payer,
      receivedOn: p.receivedOn,
      method: p.method,
      amount: p.amount,
      reference: p.reference,
      note: p.note,
      status: p.status,
      allocated,
      unapplied,
      allocations: p.allocations.map((a) => ({
        target: a.target,
        id: a.id.toHexString(),
        label:
          a.target === "invoice"
            ? (invNumbers.get(a.id.toHexString()) ?? "Invoice")
            : (claimRefs.get(a.id.toHexString()) ?? "Claim"),
        amount: a.amount,
        at: a.at.toISOString(),
        by: a.byName,
      })),
      duplicateRef: (refCount.get(p.reference) ?? 0) > 1,
      recon: p.recon,
      history: p.history
        .slice()
        .reverse()
        .map((h) => ({ at: h.at.toISOString(), by: h.byName, action: h.action })),
    };
  });
  const statementDtos: StatementLineDto[] = statement.map((l) => {
    const pay = l.paymentId ? payments.find((p) => p._id.equals(l.paymentId!)) : null;
    return {
      id: l._id.toHexString(),
      date: l.date,
      amount: l.amount,
      reference: l.reference,
      description: l.description,
      status:
        l.status === "Unmatched" && suggestionsFor(l, payments, openInvoices).length
          ? "Suggested"
          : l.status,
      paymentId: l.paymentId?.toHexString() ?? null,
      paymentRef: pay?.ref ?? null,
      suggestions:
        l.status === "Unmatched"
          ? suggestionsFor(
              l,
              payments.filter((p) => !statement.some((s) => s.paymentId?.equals(p._id))),
              openInvoices,
            )
          : [],
      duplicate: (lineRefCount.get(`${l.reference}|${l.amount}`) ?? 0) > 1,
      reviewedBy: l.reviewedBy,
    };
  });
  const adjustmentDtos: AdjustmentDto[] = adjustments.map((a) => ({
    id: a._id.toHexString(),
    ref: a.ref,
    type: a.type,
    status: a.status,
    invoice: a.invoiceId
      ? {
          id: a.invoiceId.toHexString(),
          number: invNumbers.get(a.invoiceId.toHexString()) ?? "Invoice",
        }
      : null,
    payment: a.paymentId
      ? {
          id: a.paymentId.toHexString(),
          ref: payments.find((p) => p._id.equals(a.paymentId!))?.ref ?? "Payment",
        }
      : null,
    amount: a.amount,
    reason: a.reason,
    refundReason: a.refundReason,
    rebill: a.rebill,
    rebillInvoice: null,
    requestedBy: a.requestedBy,
    reviewedBy: a.reviewedBy,
    decidedBy: a.decidedBy,
    history: a.history
      .slice()
      .reverse()
      .map((h) => ({ at: h.at.toISOString(), by: h.byName, action: h.action })),
    createdAt: a.createdAt.toISOString(),
  }));

  const today = todayKey();
  const alerts: FinanceHubDto["alerts"] = [];
  const stale = billables.filter(
    (b) =>
      ["Pending verification", "Ready", "Captured"].includes(b.status) &&
      (Date.parse(today) - Date.parse(dayOf(b.start))) / 86_400_000 > rules.unbilledDays,
  );
  if (stale.length)
    alerts.push({
      key: "unbilled",
      severity: "medium",
      title: `${stale.length} verified service(s) unbilled for over ${rules.unbilledDays} days`,
      detail: stale
        .slice(0, 3)
        .map((s) => `${s.ref} ${names.get(s.clientId.toHexString())}`)
        .join(", "),
      href: "/care/billing?tab=queue",
    });
  const overdue = invDtos.filter((i) => i.overdue);
  if (overdue.length)
    alerts.push({
      key: "overdue",
      severity: "high",
      title: `${overdue.length} overdue invoice(s): ${aud(overdue.reduce((s, i) => s + i.balance, 0))}`,
      detail: overdue
        .slice(0, 3)
        .map((i) => i.number)
        .join(", "),
      href: "/care/billing?tab=invoices",
    });
  const rejected = claimDtos.filter((c) => c.status === "Rejected");
  if (rejected.length)
    alerts.push({
      key: "rejected",
      severity: "high",
      title: `${rejected.length} rejected claim(s) to correct`,
      detail: rejected.map((c) => `${c.ref}: ${c.outcome?.note ?? ""}`).join("; "),
      href: "/care/billing?tab=claims",
    });
  const disputes = invDtos.filter((i) => i.status === "Disputed");
  if (disputes.length)
    alerts.push({
      key: "disputes",
      severity: "high",
      title: `${disputes.length} unresolved dispute(s)`,
      detail: disputes.map((i) => `${i.number}: ${i.dispute?.reason ?? ""}`).join("; "),
      href: "/care/billing?tab=invoices",
    });
  const unallocated = paymentDtos.filter((p) => p.unapplied > 0 && p.status !== "Reversed");
  if (unallocated.length)
    alerts.push({
      key: "unallocated",
      severity: "medium",
      title: `${unallocated.length} payment(s) with unapplied money`,
      detail: unallocated.map((p) => `${p.ref} ${aud(p.unapplied)}`).join(", "),
      href: "/care/billing?tab=payments",
    });
  const unmatched = statementDtos.filter(
    (l) => l.status === "Unmatched" || l.status === "Suggested",
  );
  if (unmatched.length)
    alerts.push({
      key: "unmatched",
      severity: "medium",
      title: `${unmatched.length} unidentified bank line(s)`,
      detail: "Match each to a payment before reconciling.",
      href: "/care/billing?tab=reconciliation",
    });
  const pendingAdj = adjustmentDtos.filter((a) => ["Requested", "Reviewed"].includes(a.status));
  if (pendingAdj.length)
    alerts.push({
      key: "adjustments",
      severity: "low",
      title: `${pendingAdj.length} adjustment(s) awaiting a Finance Manager`,
      detail: pendingAdj.map((a) => `${a.ref} ${aud(a.amount)}`).join(", "),
      href: "/care/billing?tab=adjustments",
    });
  const mismatch = billables.filter(
    (b) =>
      b.flags.some((f) => f.kind === "Funding query" && f.severity === "block") &&
      !["Invoiced", "Claimed", "Rejected"].includes(b.status),
  );
  if (mismatch.length)
    alerts.push({
      key: "funding",
      severity: "high",
      title: `${mismatch.length} charge(s) with a funding or price mismatch`,
      detail: "Held for review; no automatic correction.",
      href: "/care/billing?tab=queue",
    });

  return {
    today,
    billables: billables.map((b) => billableDto(b, names, invNumbers, claimRefs)),
    invoices: invDtos,
    claims: claimDtos,
    payments: paymentDtos,
    statement: statementDtos,
    adjustments: adjustmentDtos,
    rules,
    priceItems: items.map((i) => ({
      id: i._id,
      code: i.code,
      name: i.name,
      unit: i.unit,
      limit: i.limits.National,
      edition: i.edition,
      effectiveFrom: i.effectiveFrom,
      effectiveTo: i.effectiveTo,
      active: i.active,
    })),
    clinicians: [...new Set(billables.map((b) => b.therapist))].sort(),
    services: [...new Set(billables.map((b) => b.support))].sort(),
    can: { officer: isOfficer(user), manager: isManager(user), view: true, therapist: false },
    alerts,
  };
}

/** A therapist's own delivered lines: confirm the time and travel; no rates or claims (section 2). */
export async function myBillables(user: UserDoc) {
  const db = await collections();
  if (!user.therapistId)
    throw new UserFacingError("Only clinicians confirm delivered services.", 409);
  const rows = await db.billables
    .find({
      therapistId: user.therapistId,
      status: { $in: ["Captured", "Pending verification", "Ready", "Held"] },
    })
    .sort({ start: -1 })
    .limit(60)
    .toArray();
  const clients = await db.clients
    .find({ _id: { $in: rows.map((r) => r.clientId) } }, { projection: { name: 1 } })
    .toArray();
  return rows.map((b) => ({
    id: b._id.toHexString(),
    ref: b.ref,
    participant: clients.find((c) => c._id.equals(b.clientId))?.name ?? "Participant",
    support: b.support,
    source: b.source,
    start: b.start.toISOString(),
    deliveredMinutes: b.deliveredMinutes,
    billableMinutes: b.billableMinutes,
    location: b.location,
    confirmed: Boolean(b.confirmation),
    travel: b.travel,
    needsTravel: b.source === "Travel" && !b.travel,
    status: b.status,
    // Non-sensitive billing confirmation only: never rates, payers or claim details.
    issue: b.flags.find((f) => f.kind === "Missing service confirmation")?.label ?? null,
  }));
}

/* ------------------------------------------------------------------ AI (section 12, AC-38) */

export async function aiFinanceReview(user: UserDoc, ids: string[]) {
  mustOfficer(user);
  const db = await collections();
  const lines = await db.billables
    .find({ _id: { $in: ids.filter((i) => ObjectId.isValid(i)).map((i) => new ObjectId(i)) } })
    .limit(25)
    .toArray();
  if (!lines.length) throw new UserFacingError("Choose lines to review.");
  try {
    const out = await generateJson("finance-review", {
      system:
        "You review draft billing lines for an Australian allied health provider before a finance officer acts. For each line, flag likely mistakes (missing times, missing support item, funding path or payer mismatch, rate above the recorded limit, service date beyond the plan, unusual travel, repeated cancellation charges, possible duplicates) and suggest the next step. Use only the data given; cite the field you relied on; give a confidence from 0 to 1. Never approve, finalise, submit or change anything; never mention clinical details. These are suggestions for a person.",
      user: JSON.stringify(
        lines.map((l) => ({
          ref: l.ref,
          source: l.source,
          support: l.support,
          date: dayOf(l.start),
          deliveredMinutes: l.deliveredMinutes,
          billableMinutes: l.billableMinutes,
          location: l.location,
          path: l.path,
          payerRoute: l.payerRoute,
          agreement: l.agreementRef,
          itemCode: l.itemCode,
          unit: l.unit,
          quantity: l.quantity,
          rate: l.rate,
          rateSource: l.rateSource,
          priceLimit: l.priceLimit,
          tax: l.tax,
          confirmed: Boolean(l.confirmation),
          ruleFlags: l.flags.map((f) => f.label),
        })),
      ),
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["summary", "items"],
        properties: {
          summary: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["ref", "issue", "evidence", "suggestion", "confidence"],
              properties: {
                ref: { type: "string" },
                issue: { type: "string" },
                evidence: { type: "string" },
                suggestion: { type: "string" },
                confidence: { type: "number" },
              },
            },
          },
        },
      },
      schemaName: "finance_review",
      maxTokens: 1400,
    });
    return JSON.parse(out.text) as {
      summary: string;
      items: {
        ref: string;
        issue: string;
        evidence: string;
        suggestion: string;
        confidence: number;
      }[];
    };
  } catch (error) {
    rethrowDisabled(error);
    if (error instanceof AiError)
      throw new UserFacingError(`AI isn't available: ${error.message}`, 409);
    throw new UserFacingError("The AI answer couldn't be read. Try again.", 409);
  }
}

/** Payer messages without clinical notes (AC-32): explanation, dispute response or reminder. */
export async function aiInvoiceDraft(
  user: UserDoc,
  invoiceId: ObjectId,
  purpose: "explanation" | "dispute" | "reminder",
) {
  mustOfficer(user);
  const db = await collections();
  const inv = await db.invoices.findOne({ _id: invoiceId });
  if (!inv) throw new UserFacingError("Invoice not found.", 404);
  const t = invoiceTotals(inv);
  try {
    const out = await generateJson("finance-draft", {
      system:
        "You draft short, professional messages from an Australian allied health provider's finance team to a payer (plan manager, participant, insurer). Use only the invoice facts given. Never include diagnoses, session notes, goals or any clinical detail; refer to services by name and date only. Don't promise outcomes or admit liability. A finance officer edits and sends it.",
      user: JSON.stringify({
        purpose,
        invoice: inv.number,
        payer: inv.billTo?.name ?? inv.payer,
        dueDate: inv.dueDate,
        total: t.total,
        paid: t.paid,
        credited: t.credited,
        balance: t.balance,
        dispute: inv.dispute?.reason ?? null,
        lines: t.lines.map((l) => ({
          date: l.date.slice(0, 10),
          service: l.description.split(" · ").slice(0, 2).join(" · "),
          quantity: l.quantity,
          unit: l.unit,
          rate: l.rate,
          total: l.total,
        })),
      }),
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["subject", "message"],
        properties: { subject: { type: "string" }, message: { type: "string" } },
      },
      schemaName: "finance_draft",
      maxTokens: 700,
    });
    return JSON.parse(out.text) as { subject: string; message: string };
  } catch (error) {
    rethrowDisabled(error);
    if (error instanceof AiError)
      throw new UserFacingError(`AI isn't available: ${error.message}`, 409);
    throw new UserFacingError("The AI answer couldn't be read. Try again.", 409);
  }
}

export { lineMoney, financeUserIds };
