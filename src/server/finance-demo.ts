import "server-only";
import { ObjectId } from "mongodb";
import { supportInfo } from "@/lib/live/catalogue";
import { addDaysIso, lineMoney, round2, type FundingPath } from "@/lib/live/finance";
import { collections } from "./db";
import { ev, nextRef, routeFor, todayKey } from "./finance";
import type {
  AdjustmentDoc,
  BillableDoc,
  ClaimDoc,
  ClientDoc,
  InvoiceDoc,
  InvoiceLine,
  PaymentDoc,
  StatementLineDoc,
} from "./models";

/**
 * Demo finance history (Jul–Nov) so every finance screen has realistic records to work with.
 * Runs once. Every record carries demo: true so it can be removed in one query later. Clinical
 * records are never touched: these charges have no appointment behind them.
 */
const SEEDED = "finance-demo-seeded";
const BY = "Demo history";

const brisbane = (day: string, hour = 10) =>
  new Date(`${day}T${String(hour).padStart(2, "0")}:00:00+10:00`);

export async function seedFinanceDemo() {
  const db = await collections();
  const flags = db.db.collection<{ _id: string; at: Date }>("settings");
  if (await flags.findOne({ _id: SEEDED })) return;
  await flags.insertOne({ _id: SEEDED, at: new Date() });

  const clients = (
    await db.clients
      .find({ discharged: { $in: [null, undefined] } })
      .limit(6)
      .toArray()
  ).filter((c) => c.needs.length);
  const therapists = await db.therapists
    .find({}, { projection: { name: 1, discipline: 1 } })
    .toArray();
  const today = todayKey();
  const months = ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11"];
  let seq = 0;

  for (const [ci, client] of clients.entries()) {
    const need = client.needs[0]!;
    const route = await routeFor(client, need.id, today);
    const path: FundingPath =
      route.path === "Other" && client.funding === "NDIS" ? "Plan Managed" : route.path;
    const payerRoute = /to confirm/.test(route.payerRoute)
      ? path === "Self-Managed"
        ? `Self-managed: ${client.name} (family)`
        : path === "Private"
          ? `Private: ${client.name}`
          : route.payerRoute
      : route.payerRoute;
    const therapist =
      therapists.find((t) => need.therapistId && t._id.equals(need.therapistId)) ??
      therapists.find((t) => t.discipline === need.discipline) ??
      therapists[0]!;
    const rate =
      need.discipline === "Exercise Physiology"
        ? 166.99
        : need.discipline === "Psychology"
          ? 232.99
          : 193.99;
    const source =
      supportInfo(need.support).kind === "assessment"
        ? ("Assessment" as const)
        : ("Session" as const);

    for (const [mi, month] of months.entries()) {
      // Three or four visits a month, 45 to 90 minutes, on weekdays.
      const days = [4, 12, 19, 26]
        .slice(0, 3 + ((ci + mi) % 2))
        .map((d) => `${month}-${String(d + (ci % 3)).padStart(2, "0")}`);
      const isCurrent = month === months[months.length - 1];
      const lines: BillableDoc[] = [];
      for (const [di, day] of days.entries()) {
        if (day > today) continue;
        seq += 1;
        const minutes = [60, 45, 90, 60][(seq + ci) % 4]!;
        const quantity = Math.round((minutes / 60) * 10000) / 10000;
        const start = brisbane(day, 9 + ((di + ci) % 6));
        lines.push({
          _id: new ObjectId(),
          ref: await nextRef(db.db, "billable", "BIL", 6),
          sourceKey: `demo:${client._id.toHexString()}:${day}:${di}`,
          source,
          appointmentId: null,
          parentId: null,
          clientId: client._id,
          needId: need.id,
          support: need.support,
          discipline: need.discipline,
          therapistId: therapist._id,
          therapist: therapist.name,
          start,
          end: new Date(start.getTime() + minutes * 60_000),
          deliveredMinutes: minutes,
          billableMinutes: minutes,
          location: need.location ?? "Home",
          path,
          payerRoute,
          agreementId: null,
          agreementRef: null,
          budgetId: route.budgetId,
          priceItemId: null,
          itemCode: "To confirm",
          itemName: `${need.discipline} (catalogue item)`,
          unit: "Hour",
          quantity,
          rate,
          rateSource: "Catalogue: NDIS Pricing Arrangements 2026–27 (sample values)",
          priceLimit: path === "Plan Managed" || path === "Agency Managed" ? rate : null,
          tax: "GST-free",
          confirmation: {
            byName: therapist.name,
            at: new Date(start.getTime() + minutes * 60_000),
            how: "Checked out with a signed note",
          },
          travel: null,
          status: "Captured",
          flags: [],
          hold: null,
          override: null,
          invoiceId: null,
          claimId: null,
          duplicateOf: null,
          history: [ev(BY, "Captured from a delivered session")],
          createdAt: start,
          updatedAt: start,
          demo: true,
        });
      }
      if (!lines.length) continue;

      // November stays in the queue in mixed states; earlier months are billed.
      if (isCurrent) {
        lines.forEach((l, i) => {
          if (i === 0 && ci % 2 === 0) {
            l.status = "Pending verification";
            l.confirmation = null;
            l.flags = [
              {
                kind: "Missing service confirmation",
                label: "Service delivery not confirmed (check-out and signed note)",
                severity: "block",
              },
            ];
          } else if (i === 1 && ci === 1) {
            l.status = "Held";
            l.hold = {
              reason: "Funding question",
              note: "Checking the plan dates with the support coordinator",
              byName: "Jo Marsh",
              at: new Date(),
            };
          } else l.status = "Ready";
        });
        await db.billables.insertMany(lines);
        continue;
      }

      if (path === "Agency Managed") {
        const total = round2(
          lines.reduce((s, l) => s + lineMoney(l.quantity, l.rate, l.tax).total, 0),
        );
        const status: ClaimDoc["status"] = mi <= 1 ? "Closed" : mi === 2 ? "Accepted" : "Rejected";
        const claim: ClaimDoc = {
          _id: new ObjectId(),
          ref: await nextRef(db.db, "claim", "CLM", 5),
          clientId: client._id,
          status,
          billableIds: lines.map((l) => l._id),
          total,
          paid: status === "Closed" ? total : 0,
          outcome:
            status === "Rejected"
              ? {
                  status,
                  note: "Support item not in the plan budget (simulated)",
                  at: brisbane(addDaysIso(`${month}-28`, 5)),
                }
              : {
                  status: "Accepted",
                  note: "Accepted in simulated batch",
                  at: brisbane(addDaysIso(`${month}-28`, 4)),
                },
          history: [
            ev(BY, "Prepared"),
            ev(BY, "Submitted (simulated)"),
            ev(
              BY,
              status === "Rejected"
                ? "Simulated NDIA response: Rejected"
                : "Simulated NDIA response: Accepted",
            ),
            ...(status === "Closed" ? [ev(BY, "Remittance received in full: closed")] : []),
          ],
          createdAt: brisbane(`${month}-28`),
          updatedAt: brisbane(`${month}-28`),
          demo: true,
        };
        lines.forEach((l) => {
          l.status = "Claimed";
          l.claimId = claim._id;
        });
        await db.billables.insertMany(lines);
        await db.claims.insertOne(claim);
        if (status === "Closed") {
          await db.payments.insertOne(
            payment(
              await nextRef(db.db, "payment", "PAY", 4),
              "NDIA",
              addDaysIso(`${month}-28`, 9),
              "NDIS Remittance",
              total,
              `NDIA-RMT-${month.replace("-", "")}${ci}`,
              [{ target: "claim", id: claim._id, amount: total }],
              "Reconciled",
            ),
          );
        }
        continue;
      }

      const invId = new ObjectId();
      const issued = addDaysIso(`${month}-28`, 1 + (ci % 3));
      const terms = path === "Insurer" ? 30 : path === "Private" ? 7 : 14;
      const due = addDaysIso(issued, terms);
      const invLines: InvoiceLine[] = lines.map((l) => {
        const m = lineMoney(l.quantity, l.rate, l.tax);
        return {
          id: l._id.toHexString(),
          kind: "service",
          visitId: null,
          date: l.start,
          description: `${l.support} · ${l.source} · ${l.therapist}`,
          itemCode: l.itemCode,
          minutes: l.billableMinutes,
          rate: l.rate,
          amount: m.total,
          payerRoute: l.payerRoute,
          agreementId: null,
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
      const total = round2(invLines.reduce((s, l) => s + l.amount, 0));
      // Older months are paid; September is mixed; October is open, some overdue.
      const plan: "paid" | "part" | "open" | "disputed" =
        mi <= 1
          ? ci === 2 && mi === 1
            ? "part"
            : "paid"
          : mi === 2
            ? ci === 1
              ? "disputed"
              : ci === 2
                ? "open"
                : "paid"
            : ci % 2
              ? "part"
              : "open";
      const paidAmount = plan === "paid" ? total : plan === "part" ? round2(total * 0.6) : 0;
      const status: InvoiceDoc["status"] =
        plan === "paid"
          ? "Paid"
          : plan === "part"
            ? "Part-Paid"
            : plan === "disputed"
              ? "Disputed"
              : "Issued";
      const payerName = payerRoute.split(": ").slice(1).join(": ") || client.name;
      const payerDoc = await db.payers.findOne({ name: payerName });
      const payRef = await nextRef(db.db, "payment", "PAY", 4);
      const paymentId = new ObjectId();
      const inv: InvoiceDoc = {
        _id: invId,
        number: await nextRef(db.db, "invoice07", "INV", 6),
        clientId: client._id,
        funding: client.funding,
        payer: payerRoute,
        status,
        lines: invLines,
        payments: paidAmount
          ? [
              {
                amount: paidAmount,
                reference: `${payerName.split(" ")[0]!.toUpperCase()}-${month.replace("-", "")}${ci}`,
                byName: "Jo Marsh",
                at: brisbane(addDaysIso(issued, 9)),
                paymentId,
              },
            ]
          : [],
        history: [
          {
            status: "Draft",
            byName: BY,
            note: `Prepared from ${lines.length} verified line(s)`,
            at: brisbane(`${month}-28`),
          },
          {
            status: "Pending Approval",
            byName: "Jo Marsh",
            note: "Sent for approval",
            at: brisbane(issued, 9),
          },
          { status: "Approved", byName: "Jo Marsh", note: "Checked", at: brisbane(issued, 10) },
          {
            status: "Issued",
            byName: "Jo Marsh",
            note: "Issued by Email (simulated delivery)",
            at: brisbane(issued, 11),
          },
          ...(paidAmount
            ? [
                {
                  status: status === "Paid" ? ("Paid" as const) : ("Part-Paid" as const),
                  byName: "Jo Marsh",
                  note: `Payment ${payRef}`,
                  at: brisbane(addDaysIso(issued, 9)),
                },
              ]
            : []),
          ...(plan === "disputed"
            ? [
                {
                  status: "Disputed" as const,
                  byName: "Jo Marsh",
                  note: "Payer queries the session length on one visit",
                  at: brisbane(addDaysIso(issued, 6)),
                },
              ]
            : []),
        ],
        issuedAt: brisbane(issued, 11),
        createdAt: brisbane(`${month}-28`),
        updatedAt: brisbane(addDaysIso(issued, 9)),
        version: 1,
        path,
        dueDate: due,
        terms: terms === 30 ? "30 days" : terms === 7 ? "7 days" : "14 days",
        delivery: "Email",
        billTo: {
          type:
            path === "Plan Managed"
              ? "Plan Manager"
              : path === "Insurer"
                ? "Insurer"
                : path === "Private"
                  ? "Private payer"
                  : "Participant",
          name: payerName,
          email: payerDoc?.email || client.fundingDetails?.payerEmail || client.email || "",
          address: "",
          abn: payerDoc?.abn ?? "",
          reference: path === "Insurer" ? `WC-${55800 + seq}` : "",
        },
        note: "",
        agreementId: null,
        credits: [],
        comms: [
          {
            at: brisbane(issued, 11),
            byName: "Jo Marsh",
            channel: "Email",
            to: payerDoc?.email || payerName,
            subject: `Invoice for ${total.toFixed(2)} (delivery simulated)`,
          },
        ],
        versions: [
          {
            version: 1,
            at: brisbane(issued, 11),
            byName: "Jo Marsh",
            reason: "Issued",
            total,
            lines: invLines,
          },
        ],
        dispute:
          plan === "disputed"
            ? {
                reason: "Payer queries the session length on one visit",
                at: brisbane(addDaysIso(issued, 6)),
                byName: "Jo Marsh",
              }
            : null,
        demo: true,
      };
      lines.forEach((l) => {
        l.status = "Invoiced";
        l.invoiceId = invId;
      });
      await db.billables.insertMany(lines);
      await db.invoices.insertOne(inv);
      if (paidAmount) {
        await db.payments.insertOne({
          ...payment(
            payRef,
            payerName,
            addDaysIso(issued, 9),
            "Bank Transfer",
            paidAmount,
            inv.payments[0]!.reference,
            [{ target: "invoice", id: invId, amount: paidAmount }],
            mi <= 1 ? "Reconciled" : "Matched",
          ),
          _id: paymentId,
        });
      }
      // A credit applied on an older invoice, and one waiting for a Finance Manager.
      if (mi === 0 && ci === 0)
        await adjustment(
          invId,
          "Credit note",
          45.5,
          "Rounding on a shortened visit: credited",
          "Applied",
        );
      if (mi === 3 && ci === 0)
        await adjustment(
          invId,
          "Credit note",
          96.99,
          "Half of one session disputed by the plan manager",
          "Requested",
        );
      if (mi === 2 && ci === 2)
        await adjustment(
          invId,
          "Write-off",
          25,
          "Small balance after a partial insurer payment",
          "Reviewed",
        );
    }
  }

  // Bank lines: recent receipts waiting to be matched, and one nobody recognises yet.
  const recent = await db.payments.find({ demo: true, recon: "Matched" }).limit(4).toArray();
  const lines: StatementLineDoc[] = recent.map((p) => ({
    _id: new ObjectId(),
    date: p.receivedOn,
    amount: p.amount,
    reference: p.reference,
    description: `DIRECT CREDIT ${p.payer.toUpperCase().slice(0, 24)} ${p.reference}`,
    status: "Unmatched",
    paymentId: null,
    reviewedBy: null,
    importedAt: new Date(),
    demo: true,
  }));
  lines.push({
    _id: new ObjectId(),
    date: addDaysIso(today, -2),
    amount: 388,
    reference: "TFR 88213",
    description: "TRANSFER FROM J SAMPLE FAMILY ACCT",
    status: "Unmatched",
    paymentId: null,
    reviewedBy: null,
    importedAt: new Date(),
    demo: true,
  });
  if (lines.length) await db.statement.insertMany(lines);
  // One receipt with money left over, to allocate.
  await db.payments.insertOne(
    payment(
      await nextRef(db.db, "payment", "PAY", 4),
      "Example Plan Partners",
      addDaysIso(today, -3),
      "Bank Transfer",
      500,
      "EPP-BULK-1103",
      [],
      "Unmatched",
    ),
  );

  async function adjustment(
    invoiceId: ObjectId,
    type: AdjustmentDoc["type"],
    amount: number,
    reason: string,
    status: AdjustmentDoc["status"],
  ) {
    const prefix = type === "Credit note" ? "CR" : "WO";
    const ref = await nextRef(db.db, `adjustment-${prefix}`, prefix, 3);
    const _id = new ObjectId();
    await db.adjustments.insertOne({
      _id,
      ref,
      type,
      status,
      invoiceId,
      paymentId: null,
      lineIds: [],
      amount,
      reason,
      refundReason: null,
      rebill: false,
      rebillInvoiceId: null,
      requestedBy: "Jo Marsh",
      reviewedBy: status === "Requested" ? null : "Jo Marsh",
      decidedBy: status === "Applied" ? "Morgan Blake" : null,
      history: [
        ev("Jo Marsh", `${type} of ${amount.toFixed(2)} requested: ${reason}`),
        ...(status !== "Requested" ? [ev("Jo Marsh", "Reviewed")] : []),
        ...(status === "Applied"
          ? [ev("Morgan Blake", "Approved"), ev("Jo Marsh", "Applied")]
          : []),
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      demo: true,
    });
    if (status === "Applied") {
      await db.invoices.updateOne(
        { _id: invoiceId },
        {
          $push: {
            credits: {
              adjustmentId: _id,
              ref,
              amount,
              at: new Date(),
              reason: `${type}: ${reason}`,
            },
          },
        },
      );
    }
  }
}

function payment(
  ref: string,
  payer: string,
  receivedOn: string,
  method: string,
  amount: number,
  reference: string,
  allocs: { target: "invoice" | "claim"; id: ObjectId; amount: number }[],
  recon: PaymentDoc["recon"],
): PaymentDoc {
  const allocated = allocs.reduce((s, a) => s + a.amount, 0);
  return {
    _id: new ObjectId(),
    ref,
    payer,
    receivedOn,
    method,
    amount,
    reference,
    note: "",
    status:
      recon === "Reconciled" && allocated >= amount
        ? "Reconciled"
        : allocated === 0
          ? "Unallocated"
          : allocated < amount
            ? "Partially allocated"
            : "Allocated",
    allocations: allocs.map((a) => ({
      ...a,
      at: new Date(`${receivedOn}T12:00:00+10:00`),
      byName: "Jo Marsh",
    })),
    recon,
    refunded: 0,
    history: [
      ev(BY, `Recorded ${amount.toFixed(2)} by ${method}`),
      ...(allocs.length ? [ev("Jo Marsh", "Allocated")] : []),
    ],
    createdAt: new Date(`${receivedOn}T12:00:00+10:00`),
    demo: true,
  };
}

export type { ClientDoc };
