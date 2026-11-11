import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { z } from "zod";
import {
  CANCELLATION_CHARGE_SHARE,
  hourlyRates,
  invoiceMoves,
  money,
  type InvoiceDto,
  type InvoiceStatus,
} from "@/lib/live/clinical";
import { brisbaneDay, shortDate } from "@/lib/live/time";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { adminIds, audit, notify, publish } from "./live";
import type { AppointmentDoc, ClientDoc, InvoiceDoc, InvoiceLine, UserDoc } from "./models";

const round = (n: number) => Math.round(n * 100) / 100;
const totalOf = (lines: InvoiceLine[]) => round(lines.reduce((s, l) => s + l.amount, 0));
const paidOf = (inv: InvoiceDoc) => round(inv.payments.reduce((s, p) => s + p.amount, 0));

/** Item numbers depend on Medisense's service agreements; finance sets them at review. */
const ITEM_TO_CONFIRM = "To confirm";

function payerOf(client: ClientDoc) {
  return client.fundingDetails?.payer || `${client.funding} (payer to confirm)`;
}

async function nextNumber() {
  const { invoices } = await collections();
  const count = await invoices.countDocuments();
  return `INV-${String(count + 1001).padStart(6, "0")}`;
}

/** The client's open draft invoice for their payer, created when needed. */
async function draftFor(client: ClientDoc) {
  const { invoices } = await collections();
  const open = await invoices.findOne({ clientId: client._id, status: "Draft" });
  if (open) return open;
  const now = new Date();
  for (let attempt = 0; ; attempt += 1) {
    const doc: InvoiceDoc = {
      _id: new ObjectId(),
      number: await nextNumber(),
      clientId: client._id,
      funding: client.funding,
      payer: payerOf(client),
      status: "Draft",
      lines: [],
      payments: [],
      history: [{ status: "Draft", byName: "Service verification", note: "Opened", at: now }],
      issuedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await invoices.insertOne(doc);
      return doc;
    } catch (error) {
      if (attempt < 5 && (error as { code?: number }).code === 11000) continue;
      throw error;
    }
  }
}

/**
 * Lifecycle phase 11: a verified service (attended, checked out, note signed) or a chargeable
 * cancellation becomes a draft invoice line. No clinical narrative goes on an invoice.
 */
export async function billVisit(visit: AppointmentDoc, kind: "service" | "cancellation") {
  const db = await collections();
  if (visit.invoiceId) return;
  const client = await db.clients.findOne({ _id: visit.clientId });
  const therapist = await db.therapists.findOne({ _id: visit.therapistId });
  if (!client || !therapist) return;
  const scheduled = Math.round((visit.end.getTime() - visit.start.getTime()) / 60_000);
  const minutes = kind === "service" ? (visit.checkOut?.minutes ?? scheduled) : scheduled;
  const rate = hourlyRates[visit.discipline];
  const amount =
    round((rate * minutes) / 60) * (kind === "cancellation" ? CANCELLATION_CHARGE_SHARE : 1);
  const need = client.needs.find(
    (n) => n.discipline === visit.discipline && n.therapistId?.equals(visit.therapistId),
  );
  const line: InvoiceLine = {
    id: randomUUID(),
    kind,
    visitId: visit._id,
    date: visit.start,
    description:
      kind === "service"
        ? `${need?.support ?? visit.discipline} · ${therapist.name} · ${minutes} min`
        : `${visit.status === "no-show" ? "Did not attend" : "Late cancellation"} · ${visit.discipline} · ${therapist.name}`,
    itemCode: ITEM_TO_CONFIRM,
    minutes,
    rate,
    amount: round(amount),
  };
  const invoice = await draftFor(client);
  await db.invoices.updateOne(
    { _id: invoice._id },
    { $push: { lines: line }, $set: { updatedAt: new Date() } },
  );
  await db.appointments.updateOne({ _id: visit._id }, { $set: { invoiceId: invoice._id } });
  await publish(await adminIds(), "care", { invoiceId: invoice._id.toHexString() });
}

/** Things finance must resolve before issuing (section 14, exceptions). */
function exceptionsOf(
  inv: InvoiceDoc,
  client: ClientDoc | null,
  visits: Map<string, AppointmentDoc>,
) {
  const out: string[] = [];
  if (client?.funding === "NDIS") {
    const end = client.fundingDetails?.planEndDate;
    if (!end) out.push("NDIS plan end date unknown: funding not verified.");
    else if (end < brisbaneDay(new Date()).toISOString().slice(0, 10)) {
      out.push(`NDIS plan ended ${shortDate(`${end}T00:00:00Z`)}: funding expired.`);
    }
  }
  if (inv.payer.includes("to confirm")) out.push("Payer to confirm.");
  for (const l of inv.lines) {
    const v = l.visitId ? visits.get(l.visitId.toHexString()) : undefined;
    if (l.kind === "service" && v && !v.checkOut) {
      out.push(`${shortDate(l.date.toISOString())}: no check-out recorded (missing attendance).`);
    }
  }
  if (inv.lines.some((l) => l.itemCode === ITEM_TO_CONFIRM && l.kind !== "adjustment")) {
    out.push("Support item numbers to confirm on each line.");
  }
  if (!inv.lines.length) out.push("No lines yet.");
  return out;
}

async function toDto(inv: InvoiceDoc): Promise<InvoiceDto> {
  const db = await collections();
  const client = await db.clients.findOne({ _id: inv.clientId });
  const visitIds = inv.lines.flatMap((l) => (l.visitId ? [l.visitId] : []));
  const visits = new Map(
    (await db.appointments.find({ _id: { $in: visitIds } }).toArray()).map((v) => [
      v._id.toHexString(),
      v,
    ]),
  );
  return {
    id: inv._id.toHexString(),
    number: inv.number,
    clientId: inv.clientId.toHexString(),
    clientName: client?.name ?? "Patient",
    funding: inv.funding,
    payer: inv.payer,
    status: inv.status,
    lines: inv.lines.map((l) => ({
      id: l.id,
      kind: l.kind,
      date: l.date.toISOString(),
      description: l.description,
      itemCode: l.itemCode,
      minutes: l.minutes,
      rate: l.rate,
      amount: l.amount,
    })),
    total: totalOf(inv.lines),
    paid: paidOf(inv),
    exceptions: ["Paid", "Voided"].includes(inv.status) ? [] : exceptionsOf(inv, client, visits),
    history: inv.history.map((h) => ({ ...h, at: h.at.toISOString() })),
    payments: inv.payments.map((p) => ({ ...p, at: p.at.toISOString() })),
    issuedAt: inv.issuedAt?.toISOString() ?? null,
    createdAt: inv.createdAt.toISOString(),
    updatedAt: inv.updatedAt.toISOString(),
  };
}

export async function listInvoices() {
  const { invoices } = await collections();
  const rows = await invoices.find().sort({ updatedAt: -1 }).limit(300).toArray();
  return Promise.all(rows.map(toDto));
}

export async function invoiceDetail(id: ObjectId) {
  const { invoices } = await collections();
  const inv = await invoices.findOne({ _id: id });
  if (!inv) throw new UserFacingError("Invoice not found.", 404);
  return toDto(inv);
}

/** Issued invoices for the patient app, without line narratives beyond the service name. */
export async function patientInvoices(clientId: ObjectId) {
  const { invoices } = await collections();
  const rows = await invoices
    .find({
      clientId,
      status: { $in: ["Issued", "Partially Paid", "Paid", "Disputed", "Adjusted"] },
    })
    .sort({ issuedAt: -1 })
    .limit(20)
    .toArray();
  return rows.map((inv) => ({
    id: inv._id.toHexString(),
    number: inv.number,
    status: inv.status,
    payer: inv.payer,
    total: totalOf(inv.lines),
    paid: paidOf(inv),
    issuedAt: inv.issuedAt?.toISOString() ?? null,
    lines: inv.lines.map((l) => ({
      date: l.date.toISOString(),
      description: l.description.split(" · ").slice(0, 2).join(" · "),
      amount: l.amount,
    })),
  }));
}

export const invoiceActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("move"),
    to: z.enum(["Ready for Review", "Approved", "Issued", "Draft"]),
    note: z.string().trim().max(500).default(""),
  }),
  z.object({
    type: z.literal("item-code"),
    lineId: z.string(),
    itemCode: z.string().trim().min(3, "Enter the support item number").max(40),
  }),
  z.object({
    type: z.literal("payment"),
    amount: z.number().positive().max(1_000_000),
    reference: z.string().trim().max(80),
  }),
  z.object({
    type: z.literal("dispute"),
    reason: z.string().trim().min(3, "Give the reason").max(500),
  }),
  z.object({
    type: z.literal("adjust"),
    amount: z.number().min(-1_000_000).max(1_000_000),
    description: z.string().trim().min(3, "Describe the adjustment").max(200),
  }),
  z.object({
    type: z.literal("void"),
    reason: z.string().trim().min(3, "Give the reason").max(500),
  }),
]);
export type InvoiceAction = z.infer<typeof invoiceActionSchema>;

const isFinance = (u: UserDoc) =>
  Boolean(u.staffRoles?.some((r) => r === "Finance" || r === "Super Admin"));

/** Finance verification, issue, payment, dispute and adjustment (A07). Every step is audited. */
export async function invoiceAction(admin: UserDoc, id: ObjectId, action: InvoiceAction) {
  if (!isFinance(admin)) throw new UserFacingError("Only Finance can change invoices.", 409);
  const db = await collections();
  const inv = await db.invoices.findOne({ _id: id });
  if (!inv) throw new UserFacingError("Invoice not found.", 404);
  const now = new Date();
  const move = async (to: InvoiceStatus, note: string, extra: Partial<InvoiceDoc> = {}) => {
    if (!invoiceMoves[inv.status].includes(to)) {
      throw new UserFacingError(`An invoice that is ${inv.status} can't move to ${to}.`, 409);
    }
    const r = await db.invoices.updateOne(
      { _id: id, status: inv.status },
      {
        $set: { ...extra, status: to, updatedAt: now },
        $push: { history: { status: to, byName: admin.name, note, at: now } },
      },
    );
    if (r.modifiedCount !== 1)
      throw new UserFacingError("Someone else just changed this invoice. Refresh.", 409);
  };

  switch (action.type) {
    case "move": {
      if (action.to === "Issued") {
        const dto = await toDto(inv);
        const blocking = dto.exceptions.filter((e) => !e.startsWith("NDIS plan end date unknown"));
        if (blocking.length)
          throw new UserFacingError(`Resolve before issuing: ${blocking.join(" ")}`, 409);
      }
      if (action.to === "Ready for Review" && !inv.lines.length) {
        throw new UserFacingError("There's nothing to review yet.", 409);
      }
      await move(action.to, action.note, action.to === "Issued" ? { issuedAt: now } : {});
      if (action.to === "Issued") {
        // New services go on a fresh draft from now on.
        const client = await db.clients.findOne({ _id: inv.clientId });
        if (client) {
          await notify([client.userId], {
            title: `Invoice ${inv.number} issued`,
            body: `${money(totalOf(inv.lines))} to ${inv.payer}.`,
            href: "/mobile/patient",
          });
        }
      }
      break;
    }
    case "item-code": {
      if (!["Draft", "Ready for Review", "Disputed"].includes(inv.status)) {
        throw new UserFacingError("Item numbers can only change before approval.", 409);
      }
      await db.invoices.updateOne(
        { _id: id, "lines.id": action.lineId },
        { $set: { "lines.$.itemCode": action.itemCode, updatedAt: now } },
      );
      break;
    }
    case "payment": {
      const balance = round(totalOf(inv.lines) - paidOf(inv));
      if (action.amount > balance + 0.001)
        throw new UserFacingError(`That's more than the ${money(balance)} owing.`);
      const paidInFull = Math.abs(action.amount - balance) < 0.01;
      await db.invoices.updateOne(
        { _id: id },
        {
          $push: {
            payments: {
              amount: round(action.amount),
              reference: action.reference,
              byName: admin.name,
              at: now,
            },
          },
        },
      );
      await move(
        paidInFull ? "Paid" : "Partially Paid",
        `${money(action.amount)} received${action.reference ? ` (${action.reference})` : ""}`,
      );
      break;
    }
    case "dispute":
      await move("Disputed", action.reason);
      break;
    case "adjust": {
      if (inv.status !== "Disputed") throw new UserFacingError("Adjust a disputed invoice.", 409);
      const line: InvoiceLine = {
        id: randomUUID(),
        kind: "adjustment",
        visitId: null,
        date: now,
        description: action.description,
        itemCode: "Adjustment",
        minutes: 0,
        rate: 0,
        amount: round(action.amount),
      };
      await db.invoices.updateOne({ _id: id }, { $push: { lines: line } });
      await move("Adjusted", `${money(action.amount)}: ${action.description}`);
      break;
    }
    case "void": {
      await move("Voided", action.reason);
      // Voided services can be billed again on a new draft.
      await db.appointments.updateMany({ invoiceId: id }, { $set: { invoiceId: null } });
      break;
    }
  }
  await audit(
    admin,
    `Invoice ${inv.number}: ${action.type === "move" ? action.to : action.type}`,
    inv.clientId,
  );
  await publish(await adminIds(), "care", { invoiceId: id.toHexString() });
}
