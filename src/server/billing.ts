import "server-only";
import type { ObjectId } from "mongodb";
import { collections } from "./db";
import { captureVisit, invoiceTotals } from "./finance";
import type { AppointmentDoc } from "./models";

/**
 * Lifecycle phase 11, now Module 07: a verified service (attended, checked out, note signed) or a
 * chargeable cancellation becomes a billable line in the finance queue. Finance reviews it and
 * prepares invoices or claims from there. No clinical narrative goes on a bill.
 */
export async function billVisit(visit: AppointmentDoc, kind: "service" | "cancellation") {
  await captureVisit(visit, kind);
}

/** Issued invoices for the patient app, without line narratives beyond the service name (AC-33). */
export async function patientInvoices(clientId: ObjectId) {
  const { invoices } = await collections();
  const rows = await invoices
    .find({ clientId, status: { $in: ["Issued", "Part-Paid", "Paid", "Disputed", "Credited"] } })
    .sort({ issuedAt: -1 })
    .limit(20)
    .toArray();
  return rows.map((inv) => {
    const t = invoiceTotals(inv);
    return {
      id: inv._id.toHexString(),
      number: inv.number,
      status: inv.status,
      payer: inv.billTo?.name ?? inv.payer,
      total: t.total,
      paid: round(t.paid + t.credited),
      issuedAt: inv.issuedAt?.toISOString() ?? null,
      lines: inv.lines.map((l) => ({
        date: l.date.toISOString(),
        description: l.description.split(" · ").slice(0, 2).join(" · "),
        amount: l.amount,
      })),
    };
  });
}

const round = (n: number) => Math.round(n * 100) / 100;
