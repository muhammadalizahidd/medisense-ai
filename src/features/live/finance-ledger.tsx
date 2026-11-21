"use client";

import { ArrowUpRight, FileWarning, Plus, Scale, Settings2, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { RuleMark } from "@/components/ai/provenance";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { TableFrame } from "@/components/ui/table-frame";
import { Tag } from "@/components/ui/tag";
import {
  adjustmentTypes,
  aud,
  fundingPaths,
  paymentMethods,
  refundReasons,
  round2,
  taxTreatments,
  type AdjustmentType,
  type ChargeRules,
  type ClaimDto,
  type FinanceHubDto,
  type FundingPath,
  type PathRule,
  type PaymentDto,
  type StatementLineDto,
} from "@/lib/live/finance";
import { cn } from "@/lib/cn";
import { EmptyNote } from "./bits";
import { Choice, TextArea, TextField, Tick } from "./form-bits";
import { FCard } from "./funding-bits";
import {
  adjustmentTone,
  claimTone,
  dayLabel,
  filterInvoices,
  finance,
  invoiceShownStatus,
  invoiceTone07,
  pathChip,
  paymentTone,
  reconTone,
  td,
  th,
  type Filters,
} from "./finance-bits";

/* ------------------------------------------------------------------ invoices */

export function InvoicesTab({ hub, f }: { hub: FinanceHubDto; f: Filters }) {
  const rows = filterInvoices(hub.invoices, f, hub);
  return (
    <TableFrame>
      {rows.length === 0 ? (
        <div className="flex h-full items-center justify-center p-6">
          <EmptyNote title="No invoices match.">
            Prepare Ready lines from the billable queue to make draft invoices.
          </EmptyNote>
        </div>
      ) : (
        <table className="w-full min-w-[1100px] text-left text-small">
          <thead className="border-b border-border text-caption text-ink-500">
            <tr>
              <th className={th}>Invoice</th>
              <th className={th}>Participant</th>
              <th className={th}>Bill to</th>
              <th className={th}>Issued and due</th>
              <th className={cn(th, "text-right")}>Total</th>
              <th className={cn(th, "text-right")}>Balance</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((i) => (
              <tr key={i.id} className="group">
                <td className={td}>
                  <Link
                    href={`/care/billing/${i.id}`}
                    className="font-mono font-semibold text-ink-900"
                  >
                    {i.number}
                  </Link>
                  <span className="block text-caption text-ink-500">
                    v{i.version} · {i.lines.length} line{i.lines.length === 1 ? "" : "s"}
                  </span>
                </td>
                <td className={td}>{i.participant}</td>
                <td className={td}>
                  <span
                    className={cn(
                      "rounded-tag px-2 py-0.5 text-caption font-semibold",
                      pathChip(String(i.path)),
                    )}
                  >
                    {i.path}
                  </span>
                  <span className="mt-1 block max-w-60 truncate text-caption text-ink-500">
                    {i.billTo.name || i.payer}
                  </span>
                </td>
                <td className={td}>
                  {i.issuedAt ? dayLabel(i.issuedAt) : "Not issued"}
                  <span
                    className={cn(
                      "block text-caption",
                      i.overdue ? "font-semibold text-over" : "text-ink-500",
                    )}
                  >
                    Due {dayLabel(i.dueDate)}
                    {i.ageing && i.ageing !== "Current" ? ` · ${i.ageing}` : ""}
                  </span>
                </td>
                <td className={cn(td, "text-right font-semibold text-ink-900")}>{aud(i.total)}</td>
                <td className={cn(td, "text-right")}>
                  {aud(i.balance)}
                  {(i.paid > 0 || i.credited > 0) && (
                    <span className="block text-caption text-ink-500">
                      paid {aud(i.paid)}
                      {i.credited ? ` · credit ${aud(i.credited)}` : ""}
                    </span>
                  )}
                </td>
                <td className={td}>
                  <Tag tone={invoiceTone07[invoiceShownStatus(i)] ?? "neutral"}>
                    {invoiceShownStatus(i)}
                  </Tag>
                  {i.blockers.length > 0 &&
                    ["Draft", "Pending Approval", "Approved"].includes(i.status) && (
                      <span className="mt-1 block text-caption text-over">
                        {i.blockers.length} to resolve
                      </span>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TableFrame>
  );
}

/* ------------------------------------------------------------------ claims */

export function ClaimsTab({ hub, onDone }: { hub: FinanceHubDto; onDone: () => void }) {
  const [open, setOpen] = useState<ClaimDto | null>(null);
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-watch-bg bg-watch-bg px-4 py-3 text-small text-ink-900">
        <FileWarning className="size-4 flex-none text-watch" aria-hidden="true" />
        Agency-managed supports are claimed from the NDIA, tracked here separately from invoices.
        Submissions and outcomes are simulated: nothing is sent to the NDIA and no real payment is
        requested.
      </div>
      <TableFrame>
        {hub.claims.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyNote title="No claims yet.">
              Ready agency-managed lines become claim-ready entries when prepared.
            </EmptyNote>
          </div>
        ) : (
          <table className="w-full min-w-[960px] text-left text-small">
            <thead className="border-b border-border text-caption text-ink-500">
              <tr>
                <th className={th}>Claim</th>
                <th className={th}>Participant</th>
                <th className={th}>Lines</th>
                <th className={cn(th, "text-right")}>Total</th>
                <th className={cn(th, "text-right")}>Remitted</th>
                <th className={th}>Checks</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {hub.claims.map((c) => (
                <tr key={c.id} className="cursor-pointer" onClick={() => setOpen(c)}>
                  <td className={cn(td, "font-mono font-semibold text-ink-900")}>{c.ref}</td>
                  <td className={td}>
                    {c.participant}
                    <span className="block font-mono text-caption text-ink-500">
                      NDIS {c.ndisNumber}
                    </span>
                  </td>
                  <td className={td}>
                    {c.lines.map((l) => `${l.support} ${dayLabel(l.date)}`).join("; ")}
                  </td>
                  <td className={cn(td, "text-right font-semibold")}>{aud(c.total)}</td>
                  <td className={cn(td, "text-right")}>{aud(c.paid)}</td>
                  <td className={td}>
                    {c.checks.length ? (
                      <span className="text-caption text-watch">{c.checks.length} to check</span>
                    ) : (
                      <span className="text-caption text-healthy">Clear</span>
                    )}
                  </td>
                  <td className={td}>
                    <Tag tone={claimTone[c.status]}>{c.status}</Tag>
                    {c.outcome && (
                      <span className="mt-1 block max-w-48 truncate text-caption text-ink-500">
                        {c.outcome.note}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableFrame>
      {open && <ClaimSheet c={open} hub={hub} onClose={() => setOpen(null)} onDone={onDone} />}
    </>
  );
}

function ClaimSheet({
  c,
  hub,
  onClose,
  onDone,
}: {
  c: ClaimDto;
  hub: FinanceHubDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const [outcome, setOutcome] = useState<"Accepted" | "Rejected" | "Partially Paid">("Accepted");
  const [note, setNote] = useState("");
  const act = async (body: unknown, ok: string) => {
    if (await finance(`/api/care/billing/claims/${c.id}`, body, ok)) {
      onDone();
      onClose();
    }
  };
  return (
    <Sheet
      title={`${c.ref} · ${c.participant}`}
      description={`${aud(c.total)} · ${c.status}`}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <ul className="divide-y divide-border rounded-control border border-border">
          {c.lines.map((l) => (
            <li key={l.billableId} className="flex justify-between gap-3 px-3 py-2 text-small">
              <span>
                <span className="font-mono">{l.ref}</span> · {l.support} · {dayLabel(l.date)}
                <span className="block text-caption text-ink-500">
                  {l.itemCode} · {l.quantity} × {aud(l.rate)}
                </span>
              </span>
              <span className="font-semibold">{aud(l.total)}</span>
            </li>
          ))}
        </ul>
        {c.checks.length > 0 && (
          <div className="rounded-control bg-watch-bg px-3 py-2 text-small text-ink-900">
            <p className="mb-1 flex items-center gap-2 font-semibold">
              Claim checks <RuleMark />
            </p>
            {c.checks.map((x) => (
              <p key={x}>· {x}</p>
            ))}
          </div>
        )}
        {hub.can.officer && (
          <div className="flex flex-col gap-3 rounded-card border border-border p-4">
            {c.status === "Ready" && (
              <Button variant="primary" onClick={() => act({ type: "prepare" }, "Claim prepared")}>
                Prepare claim
              </Button>
            )}
            {c.status === "Prepared" && (
              <Button
                variant="primary"
                onClick={() => act({ type: "submit" }, "Submitted (simulated)")}
              >
                Submit (simulation)
              </Button>
            )}
            {c.status === "Submitted" && (
              <>
                <Choice
                  label="Simulated NDIA response"
                  options={["Accepted", "Rejected", "Partially Paid"] as const}
                  value={outcome}
                  onChange={setOutcome}
                />
                <TextArea
                  label="Response details"
                  value={note}
                  onChange={setNote}
                  rows={2}
                  placeholder={
                    outcome === "Rejected"
                      ? "For example: support item not in the plan budget"
                      : "For example: accepted in batch 1123"
                  }
                  required
                />
                <Button
                  variant="primary"
                  disabled={note.trim().length < 3}
                  onClick={() =>
                    act({ type: "outcome", status: outcome, note }, `Outcome recorded: ${outcome}`)
                  }
                >
                  Record outcome
                </Button>
              </>
            )}
            {c.status === "Rejected" && (
              <>
                <p className="rounded-control bg-over-bg px-3 py-2 text-small text-ink-900">
                  Rejected: {c.outcome?.note}
                </p>
                <TextArea
                  label="What was corrected"
                  value={note}
                  onChange={setNote}
                  rows={2}
                  required
                />
                <Button
                  variant="primary"
                  disabled={note.trim().length < 3}
                  onClick={() => act({ type: "correct", note }, "Corrected for resubmission")}
                >
                  Correct and prepare again
                </Button>
              </>
            )}
            {["Accepted", "Partially Paid"].includes(c.status) && (
              <p className="text-small text-ink-700">
                Record the NDIA remittance in Payments (method: NDIS Remittance) and allocate it to{" "}
                {c.ref}.
              </p>
            )}
            {c.status !== "Closed" && (
              <Button
                variant="soft-danger"
                size="sm"
                disabled={note.trim().length < 3}
                onClick={() => act({ type: "close", note }, "Claim closed")}
              >
                Close claim (uses the note above)
              </Button>
            )}
          </div>
        )}
        <History items={c.history} />
      </div>
    </Sheet>
  );
}

function History({ items }: { items: { at: string; by: string; action: string }[] }) {
  return (
    <div>
      <p className="mb-1.5 text-caption font-semibold text-ink-700">History</p>
      <ol className="relative ml-1 border-l border-border pl-4">
        {items.map((h, i) => (
          <li key={`${h.at}-${i}`} className="relative pb-2">
            <span
              className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-accent-fill"
              aria-hidden="true"
            />
            <p className="text-caption text-ink-900">{h.action}</p>
            <p className="text-label text-ink-500">
              {h.by} ·{" "}
              {new Date(h.at).toLocaleString("en-AU", {
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ payments */

export function PaymentsTab({ hub, onDone }: { hub: FinanceHubDto; onDone: () => void }) {
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<PaymentDto | null>(null);
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 shadow-lift">
        <span className="flex-1 text-small text-ink-700">
          Receipts are recorded and allocated here. This prototype never collects or moves real
          money.
        </span>
        {hub.can.officer && (
          <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" aria-hidden="true" /> Record payment
          </Button>
        )}
      </div>
      <TableFrame>
        {hub.payments.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyNote title="No payments yet.">
              Record a remittance or bank receipt, then allocate it to invoices or claims.
            </EmptyNote>
          </div>
        ) : (
          <table className="w-full min-w-[1000px] text-left text-small">
            <thead className="border-b border-border text-caption text-ink-500">
              <tr>
                <th className={th}>Payment</th>
                <th className={th}>Payer</th>
                <th className={th}>Reference</th>
                <th className={cn(th, "text-right")}>Amount</th>
                <th className={cn(th, "text-right")}>Unapplied</th>
                <th className={th}>Allocated to</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {hub.payments.map((p) => (
                <tr key={p.id} className="cursor-pointer" onClick={() => setOpen(p)}>
                  <td className={td}>
                    <span className="font-mono font-semibold text-ink-900">{p.ref}</span>
                    <span className="block text-caption text-ink-500">
                      {dayLabel(p.receivedOn)} · {p.method}
                    </span>
                  </td>
                  <td className={td}>{p.payer}</td>
                  <td className={td}>
                    <span className="font-mono">{p.reference}</span>
                    {p.duplicateRef && (
                      <span className="block text-caption font-semibold text-over">
                        Duplicate reference
                      </span>
                    )}
                  </td>
                  <td className={cn(td, "text-right font-semibold")}>{aud(p.amount)}</td>
                  <td
                    className={cn(
                      td,
                      "text-right",
                      p.unapplied > 0 ? "font-semibold text-watch" : "text-ink-500",
                    )}
                  >
                    {aud(p.unapplied)}
                  </td>
                  <td className={td}>
                    {p.allocations.map((a) => `${a.label} ${aud(a.amount)}`).join(", ") ||
                      "Not allocated"}
                  </td>
                  <td className={td}>
                    <Tag tone={paymentTone[p.status]}>{p.status}</Tag>
                    <span className="mt-1 block text-caption text-ink-500">Bank: {p.recon}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableFrame>
      {adding && <PaymentSheet onClose={() => setAdding(false)} onDone={onDone} />}
      {open && <AllocateSheet p={open} hub={hub} onClose={() => setOpen(null)} onDone={onDone} />}
    </>
  );
}

function PaymentSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState({
    payer: "",
    receivedOn: new Date().toISOString().slice(0, 10),
    method: "Bank Transfer" as (typeof paymentMethods)[number],
    amount: "",
    reference: "",
    note: "",
  });
  const amount = Number(v.amount);
  return (
    <Sheet
      title="Record payment"
      description="A receipt the bank or payer reports. Simulation only."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!(amount > 0) || v.payer.trim().length < 2 || v.reference.trim().length < 2}
            onClick={async () => {
              const res = await finance(
                "/api/care/billing",
                { type: "payment", payment: { ...v, amount: round2(amount) } },
                "Payment recorded",
              );
              if (res) {
                if (res.duplicate)
                  toast("That reference was used before", "Check it isn't the same receipt twice.");
                onDone();
                onClose();
              }
            }}
          >
            Record
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label="Payer"
          value={v.payer}
          onChange={(x) => setV({ ...v, payer: x })}
          required
          placeholder="Plan manager, participant, insurer or NDIA"
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Received on"
            type="date"
            value={v.receivedOn}
            onChange={(x) => setV({ ...v, receivedOn: x })}
            required
          />
          <TextField
            label="Amount (AUD)"
            value={v.amount}
            onChange={(x) => setV({ ...v, amount: x })}
            required
          />
        </div>
        <Choice
          label="Method"
          options={paymentMethods}
          value={v.method}
          onChange={(x) => setV({ ...v, method: x })}
        />
        <TextField
          label="Remittance or bank reference"
          value={v.reference}
          onChange={(x) => setV({ ...v, reference: x })}
          required
        />
        <TextArea label="Note" value={v.note} onChange={(x) => setV({ ...v, note: x })} rows={2} />
      </div>
    </Sheet>
  );
}

function toast(message: string, detail: string) {
  void import("@/components/ui/toast").then((m) => m.toast(message, { tone: "warning", detail }));
}

function AllocateSheet({
  p,
  hub,
  onClose,
  onDone,
}: {
  p: PaymentDto;
  hub: FinanceHubDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const targets = [
    ...hub.invoices
      .filter((i) => ["Issued", "Part-Paid", "Disputed"].includes(i.status) && i.balance > 0)
      .map((i) => ({
        target: "invoice" as const,
        id: i.id,
        label: `${i.number} · ${i.participant} · ${i.billTo.name || i.payer}`,
        balance: i.balance,
      })),
    ...hub.claims
      .filter(
        (c) =>
          ["Submitted", "Accepted", "Partially Paid"].includes(c.status) && c.total - c.paid > 0,
      )
      .map((c) => ({
        target: "claim" as const,
        id: c.id,
        label: `${c.ref} · ${c.participant} (NDIA claim)`,
        balance: round2(c.total - c.paid),
      })),
  ];
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [refund, setRefund] = useState(false);
  const [reason, setReason] = useState("");
  const [refundReason, setRefundReason] = useState<(typeof refundReasons)[number]>("Overpayment");
  const [reverseWhy, setReverseWhy] = useState("");
  const sum = round2(Object.values(amounts).reduce((s, x) => s + (Number(x) || 0), 0));
  const over = sum > p.unapplied + 0.001;
  const lineOver = targets.some((t) => (Number(amounts[t.id]) || 0) > t.balance + 0.001);
  // Suggested matches: same payer name or exact balance (rules, not AI).
  const suggested = new Set(
    targets
      .filter(
        (t) =>
          t.balance === p.unapplied ||
          t.label.toLowerCase().includes(p.payer.toLowerCase().split(" ")[0] ?? ""),
      )
      .map((t) => t.id),
  );
  return (
    <Sheet
      title={`${p.ref} · ${aud(p.amount)}`}
      description={`${p.payer} · ${p.reference} · ${aud(p.unapplied)} unapplied`}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        {p.duplicateRef && (
          <p className="rounded-control bg-over-bg px-3 py-2 text-small text-ink-900">
            This reference appears on another payment. Confirm it isn&apos;t the same money twice.
          </p>
        )}
        {hub.can.officer && p.unapplied > 0 && p.status !== "Reversed" && (
          <div className="flex flex-col gap-2 rounded-card border border-border p-4">
            <p className="flex items-center gap-2 text-caption font-semibold text-ink-700">
              Allocate to open invoices and claims <RuleMark>Suggested match</RuleMark>
            </p>
            {targets.length === 0 && (
              <p className="text-small text-ink-500">
                Nothing open to allocate to. Leave it unapplied or request a refund.
              </p>
            )}
            {targets.map((t) => (
              <div
                key={t.id}
                className={cn(
                  "grid grid-cols-[1fr_8rem] items-center gap-3 rounded-control px-2 py-1.5",
                  suggested.has(t.id) && "bg-accent-tint/50",
                )}
              >
                <span className="text-small">
                  {t.label}
                  <span className="block text-caption text-ink-500">
                    Balance {aud(t.balance)}
                    {suggested.has(t.id) ? " · suggested: same payer or amount" : ""}
                  </span>
                </span>
                <input
                  aria-label={`Amount for ${t.label}`}
                  value={amounts[t.id] ?? ""}
                  placeholder="0.00"
                  onChange={(e) => setAmounts({ ...amounts, [t.id]: e.target.value })}
                  className="h-9 rounded-control border border-border-strong px-2 text-right text-small"
                />
              </div>
            ))}
            <p
              className={cn(
                "text-small",
                over || lineOver ? "font-semibold text-over" : "text-ink-700",
              )}
            >
              Allocating {aud(sum)} of {aud(p.unapplied)} unapplied →{" "}
              {aud(Math.max(0, round2(p.unapplied - sum)))} left unapplied
              {over && ". That's more than the payment."}
              {lineOver && ". One amount is more than that balance."}
            </p>
            <Button
              variant="primary"
              disabled={!sum || over || lineOver}
              onClick={async () => {
                const allocations = targets
                  .filter((t) => Number(amounts[t.id]) > 0)
                  .map((t) => ({
                    target: t.target,
                    id: t.id,
                    amount: round2(Number(amounts[t.id])),
                  }));
                if (
                  await finance(
                    `/api/care/billing/payments/${p.id}`,
                    { type: "allocate", allocations },
                    "Allocated",
                  )
                ) {
                  onDone();
                  onClose();
                }
              }}
            >
              Allocate {aud(sum)}
            </Button>
          </div>
        )}
        {hub.can.officer && p.unapplied > 0 && p.status !== "Reversed" && (
          <div className="flex flex-col gap-2 rounded-card border border-border p-4">
            <Tick checked={refund} onChange={setRefund}>
              Request a refund of the unapplied {aud(p.unapplied)} (Finance Manager approves;
              simulated)
            </Tick>
            {refund && (
              <>
                <Choice
                  label="Refund reason"
                  options={refundReasons}
                  value={refundReason}
                  onChange={setRefundReason}
                />
                <TextArea label="Details" value={reason} onChange={setReason} rows={2} required />
                <Button
                  variant="soft"
                  disabled={reason.trim().length < 5}
                  onClick={async () => {
                    if (
                      await finance(
                        "/api/care/billing",
                        {
                          type: "adjustment",
                          adjustment: {
                            type: "Refund",
                            paymentId: p.id,
                            amount: p.unapplied,
                            reason,
                            refundReason,
                            lineIds: [],
                            invoiceId: "",
                            rebill: false,
                          },
                        },
                        "Refund requested",
                      )
                    ) {
                      onDone();
                      onClose();
                    }
                  }}
                >
                  Request refund
                </Button>
              </>
            )}
          </div>
        )}
        {hub.can.manager && p.status !== "Reversed" && (
          <div className="flex flex-col gap-2 rounded-card border border-over-bg p-4">
            <TextArea
              label="Reason to reverse (Finance Manager)"
              value={reverseWhy}
              onChange={setReverseWhy}
              rows={2}
            />
            <Button
              variant="soft-danger"
              size="sm"
              disabled={reverseWhy.trim().length < 5}
              onClick={async () => {
                if (
                  await finance(
                    `/api/care/billing/payments/${p.id}`,
                    { type: "reverse", reason: reverseWhy },
                    "Payment reversed",
                  )
                ) {
                  onDone();
                  onClose();
                }
              }}
            >
              Reverse payment
            </Button>
          </div>
        )}
        <History items={p.history} />
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ reconciliation */

export function ReconTab({ hub, onDone }: { hub: FinanceHubDto; onDone: () => void }) {
  const [open, setOpen] = useState<StatementLineDto | null>(null);
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 shadow-lift">
        <Scale className="size-4 text-accent" aria-hidden="true" />
        <span className="flex-1 text-small text-ink-700">
          Suggestions use amount, reference, payer and date. Nothing reconciles until a person
          confirms it (AC-27).
        </span>
        {hub.can.officer && (
          <Button
            size="sm"
            variant="primary"
            onClick={async () =>
              (await finance(
                "/api/care/billing",
                { type: "import-statement" },
                "Mock statement imported",
              )) && onDone()
            }
          >
            <Upload className="size-3.5" aria-hidden="true" /> Import mock statement
          </Button>
        )}
      </div>
      <TableFrame>
        {hub.statement.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyNote title="No statement lines.">
              Import a mock bank statement to start matching.
            </EmptyNote>
          </div>
        ) : (
          <table className="w-full min-w-[980px] text-left text-small">
            <thead className="border-b border-border text-caption text-ink-500">
              <tr>
                <th className={th}>Date</th>
                <th className={th}>Bank description</th>
                <th className={cn(th, "text-right")}>Amount</th>
                <th className={th}>Best suggestion</th>
                <th className={th}>Matched payment</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {hub.statement.map((l) => (
                <tr key={l.id} className="cursor-pointer" onClick={() => setOpen(l)}>
                  <td className={td}>{dayLabel(l.date)}</td>
                  <td className={td}>
                    {l.description}
                    <span className="block font-mono text-caption text-ink-500">{l.reference}</span>
                    {l.duplicate && (
                      <span className="block text-caption font-semibold text-over">
                        Possible duplicate line
                      </span>
                    )}
                  </td>
                  <td className={cn(td, "text-right font-semibold")}>{aud(l.amount)}</td>
                  <td className={td}>
                    {l.suggestions[0] ? (
                      <span className="text-caption">
                        {l.suggestions[0].label}{" "}
                        <span className="text-ink-500">
                          ({l.suggestions[0].score}%: {l.suggestions[0].why.join(", ")})
                        </span>
                      </span>
                    ) : (
                      <span className="text-caption text-ink-500">None</span>
                    )}
                  </td>
                  <td className={td}>{l.paymentRef ?? "—"}</td>
                  <td className={td}>
                    <Tag tone={reconTone[l.status]}>{l.status}</Tag>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableFrame>
      {open && <ReconSheet l={open} hub={hub} onClose={() => setOpen(null)} onDone={onDone} />}
    </>
  );
}

function ReconSheet({
  l,
  hub,
  onClose,
  onDone,
}: {
  l: StatementLineDto;
  hub: FinanceHubDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const [payer, setPayer] = useState("");
  const [method, setMethod] = useState<(typeof paymentMethods)[number]>("Bank Transfer");
  const act = async (body: unknown, ok: string) => {
    if (await finance(`/api/care/billing/statement/${l.id}`, body, ok)) {
      onDone();
      onClose();
    }
  };
  const candidates = hub.payments.filter((p) => p.status !== "Reversed" && p.recon === "Unmatched");
  return (
    <Sheet
      title={`Bank line ${aud(l.amount)}`}
      description={`${dayLabel(l.date)} · ${l.description}`}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <Tag tone={reconTone[l.status]}>{l.status}</Tag>
        {hub.can.officer && (l.status === "Unmatched" || l.status === "Suggested") && (
          <>
            <div className="flex flex-col gap-2 rounded-card border border-border p-4">
              <p className="flex items-center gap-2 text-caption font-semibold text-ink-700">
                Match to a recorded payment <RuleMark>Suggestion</RuleMark>
              </p>
              {l.suggestions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded-control bg-accent-tint/50 px-3 py-2 text-small"
                >
                  <span>
                    {s.label}
                    <span className="block text-caption text-ink-500">
                      {s.score}% · {s.why.join(", ")}
                    </span>
                  </span>
                  {s.kind === "payment" ? (
                    <Button
                      size="sm"
                      variant="soft"
                      onClick={() => act({ type: "match", paymentId: s.id }, "Matched")}
                    >
                      Match
                    </Button>
                  ) : (
                    <span className="text-caption text-ink-500">Record a payment first</span>
                  )}
                </div>
              ))}
              {candidates.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 px-1 py-1 text-small"
                >
                  <span>
                    {p.ref} · {p.payer} · {aud(p.amount)} · {p.reference}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => act({ type: "match", paymentId: p.id }, "Matched")}
                  >
                    Match
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2 rounded-card border border-border p-4">
              <p className="text-caption font-semibold text-ink-700">
                Unidentified receipt: record it as a payment
              </p>
              <TextField label="Payer (verified manually)" value={payer} onChange={setPayer} />
              <Choice label="Method" options={paymentMethods} value={method} onChange={setMethod} />
              <Button
                variant="soft"
                disabled={payer.trim().length < 2}
                onClick={() =>
                  act({ type: "create-payment", payer, method }, "Payment created and matched")
                }
              >
                Create payment from this line
              </Button>
            </div>
          </>
        )}
        {hub.can.officer && l.status === "Matched" && (
          <Button variant="soft" onClick={() => act({ type: "review", note: "" }, "Reviewed")}>
            Mark reviewed
          </Button>
        )}
        {hub.can.officer && (l.status === "Matched" || l.status === "Reviewed") && (
          <Button variant="primary" onClick={() => act({ type: "reconcile" }, "Reconciled")}>
            Confirm reconciliation
          </Button>
        )}
        {hub.can.officer && l.paymentId && (
          <Button
            variant="soft-danger"
            size="sm"
            onClick={() => act({ type: "unmatch" }, "Unmatched")}
          >
            Unmatch
          </Button>
        )}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ adjustments */

export function AdjustmentsTab({ hub, onDone }: { hub: FinanceHubDto; onDone: () => void }) {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 shadow-lift">
        <span className="flex-1 text-small text-ink-700">
          Credits, debits, write-offs and refunds: an officer requests, a Finance Manager approves,
          then it&apos;s applied and linked. Issued invoices are never deleted or edited.
        </span>
        {hub.can.officer && (
          <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" aria-hidden="true" /> New adjustment
          </Button>
        )}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {hub.adjustments.length === 0 && (
          <div className="flex min-h-48 items-center justify-center rounded-card border border-border bg-surface p-6 xl:col-span-2">
            <EmptyNote title="No adjustments yet." />
          </div>
        )}
        {hub.adjustments.map((a) => (
          <section
            key={a.id}
            className="bubble-in overflow-hidden rounded-card border border-border bg-surface shadow-lift"
          >
            <header className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
              <span className="font-mono text-small font-semibold text-ink-900">{a.ref}</span>
              <Tag tone="outline">{a.type}</Tag>
              <span className="text-small font-semibold">{aud(a.amount)}</span>
              <span className="ml-auto">
                <Tag tone={adjustmentTone[a.status]}>{a.status}</Tag>
              </span>
            </header>
            <div className="px-5 py-3 text-small text-ink-700">
              <p>{a.reason}</p>
              <p className="mt-1 text-caption text-ink-500">
                {a.invoice && (
                  <Link href={`/care/billing/${a.invoice.id}`} className="font-semibold">
                    {a.invoice.number}
                  </Link>
                )}
                {a.payment && <span>{a.payment.ref}</span>} · requested by {a.requestedBy}
                {a.reviewedBy && ` · reviewed by ${a.reviewedBy}`}
                {a.decidedBy && ` · decided by ${a.decidedBy}`}
                {a.rebill && " · rebill"}
              </p>
            </div>
            {hub.can.officer && ["Requested", "Reviewed", "Approved"].includes(a.status) && (
              <footer className="flex flex-wrap gap-2 border-t border-border bg-canvas px-5 py-3">
                {a.status === "Requested" && (
                  <Button
                    size="sm"
                    variant="soft"
                    onClick={async () =>
                      (await finance(
                        `/api/care/billing/adjustments/${a.id}`,
                        { type: "review", note: "" },
                        "Reviewed",
                      )) && onDone()
                    }
                  >
                    Mark reviewed
                  </Button>
                )}
                {["Requested", "Reviewed"].includes(a.status) && hub.can.manager && (
                  <>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={async () =>
                        (await finance(
                          `/api/care/billing/adjustments/${a.id}`,
                          { type: "decide", approve: true, note: "Approved after review" },
                          "Approved",
                        )) && onDone()
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="soft-danger"
                      onClick={async () =>
                        (await finance(
                          `/api/care/billing/adjustments/${a.id}`,
                          { type: "decide", approve: false, note: "Not supported by the evidence" },
                          "Rejected",
                        )) && onDone()
                      }
                    >
                      Reject
                    </Button>
                  </>
                )}
                {["Requested", "Reviewed"].includes(a.status) && !hub.can.manager && (
                  <span className="text-caption text-ink-500">Waiting for a Finance Manager</span>
                )}
                {a.status === "Approved" && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={async () =>
                      (await finance(
                        `/api/care/billing/adjustments/${a.id}`,
                        { type: "apply" },
                        "Applied",
                      )) && onDone()
                    }
                  >
                    Apply
                  </Button>
                )}
              </footer>
            )}
          </section>
        ))}
      </div>
      {adding && <AdjustmentSheet hub={hub} onClose={() => setAdding(false)} onDone={onDone} />}
    </>
  );
}

export function AdjustmentSheet({
  hub,
  onClose,
  onDone,
  invoiceId = "",
  presetType = "Credit note",
}: {
  hub: Pick<FinanceHubDto, "invoices" | "payments" | "can">;
  onClose: () => void;
  onDone: () => void;
  invoiceId?: string;
  presetType?: AdjustmentType;
}) {
  const [type, setType] = useState<AdjustmentType>(presetType);
  const [inv, setInv] = useState(invoiceId);
  const [lines, setLines] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [rebill, setRebill] = useState(false);
  const invoice = hub.invoices.find((i) => i.id === inv);
  const issued = hub.invoices.filter((i) =>
    ["Issued", "Part-Paid", "Paid", "Disputed"].includes(i.status),
  );
  const types = adjustmentTypes.filter(
    (t) => t !== "Refund" && (t !== "Write-off" || hub.can.manager),
  );
  return (
    <Sheet
      title="New adjustment"
      description="Linked to the original invoice; a Finance Manager approves it"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!inv || !(Number(amount) > 0) || reason.trim().length < 5}
            onClick={async () => {
              if (
                await finance(
                  "/api/care/billing",
                  {
                    type: "adjustment",
                    adjustment: {
                      type,
                      invoiceId: inv,
                      paymentId: "",
                      lineIds: lines,
                      amount: round2(Number(amount)),
                      reason,
                      rebill,
                    },
                  },
                  `${type} requested`,
                  "A Finance Manager approves it before it's applied.",
                )
              ) {
                onDone();
                onClose();
              }
            }}
          >
            Request
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Choice label="Type" options={types} value={type} onChange={setType} />
        <div className="flex flex-col gap-1">
          <span className="text-caption font-semibold text-ink-700">Invoice</span>
          <Select aria-label="Invoice" value={inv} onChange={(e) => setInv(e.target.value)}>
            <option value="">Choose an issued invoice</option>
            {issued.map((i) => (
              <option key={i.id} value={i.id}>
                {i.number} · {i.participant} · balance {aud(i.balance)}
              </option>
            ))}
          </Select>
        </div>
        {invoice && (
          <div>
            <p className="mb-1.5 text-caption font-semibold text-ink-700">Lines affected</p>
            <div className="flex flex-col gap-1.5">
              {invoice.lines.map((l) => (
                <Tick
                  key={l.id}
                  checked={lines.includes(l.id)}
                  onChange={(x) => {
                    const next = x ? [...lines, l.id] : lines.filter((y) => y !== l.id);
                    setLines(next);
                    if (type === "Credit note")
                      setAmount(
                        String(
                          round2(
                            invoice.lines
                              .filter((y) => next.includes(y.id))
                              .reduce((s, y) => s + y.total, 0),
                          ),
                        ),
                      );
                  }}
                >
                  {dayLabel(l.date)} · {l.description} · {aud(l.total)}
                </Tick>
              ))}
            </div>
          </div>
        )}
        <TextField label="Amount (AUD)" value={amount} onChange={setAmount} required />
        <TextArea label="Reason" value={reason} onChange={setReason} rows={3} required />
        {type === "Credit note" && (
          <Tick checked={rebill} onChange={setRebill}>
            Rebill: put a corrected copy of the credited lines back in the queue
          </Tick>
        )}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ rates and rules */

const ruleFields: { key: keyof PathRule; label: string }[] = [
  { key: "travelLabour", label: "Travel labour" },
  { key: "travelNonLabour", label: "Travel non-labour" },
  { key: "nonFaceToFace", label: "Non-face-to-face" },
  { key: "reportWriting", label: "Report writing" },
  { key: "cancellation", label: "Cancellation" },
  { key: "priceLimitsApply", label: "Price limits apply" },
];

export function RulesTab({ hub, onDone }: { hub: FinanceHubDto; onDone: () => void }) {
  const [rules, setRules] = useState<ChargeRules>(hub.rules);
  const [dirty, setDirty] = useState(false);
  const edit = hub.can.manager;
  const setPath = (p: FundingPath, patch: Partial<PathRule>) => {
    setRules({ ...rules, paths: { ...rules.paths, [p]: { ...rules.paths[p], ...patch } } });
    setDirty(true);
  };
  return (
    <>
      <FCard
        icon={Settings2}
        title={`Charge rules v${hub.rules.version}`}
        sub={`Effective ${dayLabel(hub.rules.effectiveFrom)} · ${hub.rules.updatedBy}. Sample values: Medisense confirms its real rules. New versions apply to new charges only; issued invoices never recalculate.`}
        flush
        action={
          edit ? (
            <Button
              size="sm"
              variant="primary"
              disabled={!dirty}
              onClick={async () => {
                if (
                  await finance(
                    "/api/care/billing",
                    {
                      type: "rules",
                      rules: {
                        effectiveFrom: rules.effectiveFrom,
                        paths: rules.paths,
                        unbilledDays: rules.unbilledDays,
                        managerApprovalOver: rules.managerApprovalOver,
                        writeOffLimit: rules.writeOffLimit,
                      },
                    },
                    "Rules saved as a new version",
                  )
                ) {
                  setDirty(false);
                  onDone();
                }
              }}
            >
              Save as v{hub.rules.version + 1}
            </Button>
          ) : (
            <span className="text-caption text-ink-500">Finance Manager edits</span>
          )
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-small">
            <thead className="border-b border-border text-caption text-ink-500">
              <tr>
                <th className={th}>Funding path</th>
                {ruleFields.map((r) => (
                  <th key={r.key} className={cn(th, "text-center")}>
                    {r.label}
                  </th>
                ))}
                <th className={th}>Notice (h)</th>
                <th className={th}>Cancel %</th>
                <th className={th}>Tax</th>
                <th className={th}>Terms</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {fundingPaths.map((p) => {
                const r = rules.paths[p];
                return (
                  <tr key={p}>
                    <td className={td}>
                      <span
                        className={cn(
                          "rounded-tag px-2 py-0.5 text-caption font-semibold",
                          pathChip(p),
                        )}
                      >
                        {p}
                      </span>
                    </td>
                    {ruleFields.map((f) => (
                      <td key={f.key} className={cn(td, "text-center")}>
                        <input
                          type="checkbox"
                          aria-label={`${p} ${f.label}`}
                          disabled={!edit}
                          checked={Boolean(r[f.key])}
                          onChange={(e) =>
                            setPath(p, { [f.key]: e.target.checked } as Partial<PathRule>)
                          }
                        />
                      </td>
                    ))}
                    <td className={td}>
                      <input
                        aria-label={`${p} notice`}
                        disabled={!edit}
                        value={r.cancellationNoticeHours}
                        onChange={(e) =>
                          setPath(p, { cancellationNoticeHours: Number(e.target.value) || 0 })
                        }
                        className="h-8 w-16 rounded-control border border-border-strong px-2 text-small"
                      />
                    </td>
                    <td className={td}>
                      <input
                        aria-label={`${p} share`}
                        disabled={!edit}
                        value={r.cancellationShare}
                        onChange={(e) =>
                          setPath(p, {
                            cancellationShare: Math.min(100, Number(e.target.value) || 0),
                          })
                        }
                        className="h-8 w-16 rounded-control border border-border-strong px-2 text-small"
                      />
                    </td>
                    <td className={td}>
                      <select
                        aria-label={`${p} tax`}
                        disabled={!edit}
                        value={r.tax}
                        onChange={(e) => setPath(p, { tax: e.target.value as PathRule["tax"] })}
                        className="h-8 rounded-control border border-border-strong bg-surface px-1 text-caption"
                      >
                        {taxTreatments.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </td>
                    <td className={td}>
                      <select
                        aria-label={`${p} terms`}
                        disabled={!edit}
                        value={r.terms}
                        onChange={(e) => setPath(p, { terms: e.target.value as PathRule["terms"] })}
                        className="h-8 rounded-control border border-border-strong bg-surface px-1 text-caption"
                      >
                        {["Due on receipt", "7 days", "14 days", "30 days"].map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="grid gap-4 border-t border-border p-5 md:grid-cols-4">
          <TextField
            label="Effective from"
            type="date"
            value={rules.effectiveFrom}
            onChange={(x) => (setRules({ ...rules, effectiveFrom: x }), setDirty(true))}
          />
          <TextField
            label="Unbilled alert after (days)"
            value={String(rules.unbilledDays)}
            onChange={(x) => (setRules({ ...rules, unbilledDays: Number(x) || 1 }), setDirty(true))}
          />
          <TextField
            label="Manager approval over (AUD)"
            value={String(rules.managerApprovalOver)}
            onChange={(x) => (
              setRules({ ...rules, managerApprovalOver: Number(x) || 0 }),
              setDirty(true)
            )}
          />
          <TextField
            label="Write-off limit (AUD)"
            value={String(rules.writeOffLimit)}
            onChange={(x) => (
              setRules({ ...rules, writeOffLimit: Number(x) || 0 }),
              setDirty(true)
            )}
          />
        </div>
      </FCard>
      <FCard
        icon={ArrowUpRight}
        title="Effective-dated rates"
        sub="Support items and price limits come from the Funding price catalogue (Module 06). A service uses the edition in force on its date."
        flush
        action={
          <Link
            href="/care/funding?tab=catalogue"
            className="text-caption font-semibold text-accent"
          >
            Open the catalogue
          </Link>
        }
      >
        <table className="w-full text-left text-small">
          <thead className="border-b border-border text-caption text-ink-500">
            <tr>
              <th className={th}>Support item</th>
              <th className={th}>Unit</th>
              <th className={cn(th, "text-right")}>National limit</th>
              <th className={th}>Effective</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {hub.priceItems.map((i) => (
              <tr key={i.id}>
                <td className={td}>
                  {i.name}
                  <span className="block font-mono text-caption text-ink-500">
                    {i.code || "Item number to confirm"}
                  </span>
                </td>
                <td className={td}>{i.unit}</td>
                <td className={cn(td, "text-right")}>{aud(i.limit)}</td>
                <td className={td}>
                  {dayLabel(i.effectiveFrom)}
                  {i.effectiveTo ? ` to ${dayLabel(i.effectiveTo)}` : " onwards"}
                  <span className="block text-caption text-ink-500">{i.edition}</span>
                </td>
                <td className={td}>
                  <Tag tone={i.active ? "healthy" : "neutral"}>
                    {i.active ? "Active" : "Historical"}
                  </Tag>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </FCard>
    </>
  );
}
