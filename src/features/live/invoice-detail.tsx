"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Calculator,
  Check,
  FileText,
  History,
  Mail,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AiChip, AiIcon } from "@/components/ai/provenance";
import { Button, ButtonLink } from "@/components/ui/button";
import { Sheet as SheetLazy } from "@/components/ui/sheet";
import { PageHeader } from "@/components/ui/page";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { api, useResource } from "@/lib/live/client";
import {
  aud,
  billToTypes,
  deliveryChannels,
  paymentTerms,
  termDays,
  addDaysIso,
  type BillableDto,
  type InvoiceDraftInput,
  type InvoiceDto07,
} from "@/lib/live/finance";
import { cn } from "@/lib/cn";
import { ErrorNote, LiveBadge, Skeleton } from "./bits";
import { Choice, TextArea, TextField, Tick } from "./form-bits";
import { FCard } from "./funding-bits";
import {
  dayLabel,
  finance,
  invoiceShownStatus,
  invoiceTone07,
  lineTone,
  pathChip,
  td,
  th,
} from "./finance-bits";
import { AdjustmentSheet } from "./finance-ledger";

type Data = {
  invoice: InvoiceDto07;
  billables: BillableDto[];
  can: { officer: boolean; manager: boolean };
};

const tabs = [
  { id: "invoice", label: "Invoice" },
  { id: "money", label: "Payments and credits" },
  { id: "comms", label: "Communications" },
  { id: "history", label: "Versions and history" },
] as const;
const steps = ["Draft", "Pending Approval", "Approved", "Issued", "Paid"] as const;

export function InvoiceDetail({ id }: { id: string }) {
  const { data, error, reload } = useResource<Data>(
    `/api/care/billing/${id}`,
    (e) => e.type === "care",
  );
  const [tab, setTab] = useTab(tabs);
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-[640px]" />;
  return <Loaded key={data.invoice.updatedAt} d={data} tab={tab} setTab={setTab} reload={reload} />;
}

function Loaded({
  d,
  tab,
  setTab,
  reload,
}: {
  d: Data;
  tab: (typeof tabs)[number]["id"];
  setTab: (t: (typeof tabs)[number]["id"]) => void;
  reload: () => void;
}) {
  const inv = d.invoice;
  const draft = inv.status === "Draft";
  const [form, setForm] = useState<InvoiceDraftInput>({
    dueDate: inv.dueDate ?? new Date().toISOString().slice(0, 10),
    terms: inv.terms,
    delivery: inv.delivery as InvoiceDraftInput["delivery"],
    billTo: inv.billTo,
    note: inv.note,
  });
  const [dirty, setDirty] = useState(false);
  const [sheet, setSheet] = useState<null | "dispute" | "credit" | "void" | "return" | "resolve">(
    null,
  );
  const [aiDraft, setAiDraft] = useState<{ subject: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = invoiceShownStatus(inv);
  const act = async (body: unknown, ok: string, detail?: string) => {
    setBusy(true);
    const res = await finance(`/api/care/billing/${inv.id}`, body, ok, detail);
    setBusy(false);
    if (res) reload();
    return res;
  };
  const set = (patch: Partial<InvoiceDraftInput>) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
  };
  const stepIndex = ["Part-Paid", "Disputed"].includes(inv.status)
    ? 3
    : inv.status === "Credited"
      ? 4
      : steps.indexOf(inv.status as (typeof steps)[number]);

  async function draftMessage(purpose: "explanation" | "dispute" | "reminder") {
    setBusy(true);
    try {
      const res = await api<{ draft: { subject: string; message: string } }>(
        `/api/care/billing/${inv.id}`,
        { body: { type: "ai-draft", purpose } },
      );
      setAiDraft(res.draft);
      setTab("comms");
    } catch (e) {
      toast("AI draft unavailable", { tone: "error", detail: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <ButtonLink href="/care/billing?tab=invoices" variant="ghost" size="sm">
            <ArrowLeft className="size-3.5" aria-hidden="true" /> Billing
          </ButtonLink>
        }
        title={<span className="font-mono">{inv.number}</span>}
        actions={<LiveBadge />}
      />
      <section className="mb-5 overflow-hidden rounded-card border border-border bg-surface shadow-lift">
        <div className="flex flex-wrap items-center gap-5 px-6 py-5">
          <span className="flex size-12 items-center justify-center rounded-card bg-accent-tint text-accent">
            <FileText className="size-6" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="type-display text-h2 text-ink-900">
                {inv.billTo.name || inv.payer}
              </span>
              <Tag tone={invoiceTone07[shown] ?? "neutral"}>{shown}</Tag>
              <span
                className={cn(
                  "rounded-tag px-2 py-0.5 text-caption font-semibold",
                  pathChip(String(inv.path)),
                )}
              >
                {inv.path}
              </span>
              <span className="rounded-tag bg-sunken px-1.5 font-mono text-label text-ink-700">
                v{inv.version}
              </span>
            </p>
            <p className="mt-1 text-small text-ink-700">
              For{" "}
              <Link href={`/care/${inv.clientId}`} className="font-semibold">
                {inv.participant}
              </Link>
              {inv.issuedAt ? ` · issued ${dayLabel(inv.issuedAt)}` : " · not issued"} · due{" "}
              {dayLabel(inv.dueDate)}
              {inv.ageing && inv.ageing !== "Current" && (
                <span className="font-semibold text-over"> · {inv.ageing} overdue</span>
              )}
              {inv.agreement && ` · ${inv.agreement.ref}`}
            </p>
          </div>
          <dl className="grid grid-cols-4 gap-px overflow-hidden rounded-control border border-border bg-border text-right">
            {[
              ["Total", inv.total],
              ["Paid", inv.paid],
              ["Credited", inv.credited],
              ["Balance", inv.balance],
            ].map(([k, v]) => (
              <div key={k as string} className="bg-surface px-4 py-2">
                <dt className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
                  {k}
                </dt>
                <dd
                  className={cn(
                    "text-small font-semibold",
                    k === "Balance" && (v as number) > 0 && inv.overdue
                      ? "text-over"
                      : "text-ink-900",
                  )}
                >
                  {aud(v as number)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <ol className="flex border-t border-border">
          {steps.map((s, i) => {
            const done = i < stepIndex || ["Paid", "Credited"].includes(inv.status);
            const current = i === stepIndex && !["Paid", "Credited"].includes(inv.status);
            return (
              <li
                key={s}
                className={cn(
                  "flex flex-1 items-center gap-2 px-4 py-3 text-caption",
                  current
                    ? "bg-accent-tint font-semibold text-accent"
                    : done
                      ? "text-ink-900"
                      : "text-ink-400",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 flex-none items-center justify-center rounded-full text-label",
                    done
                      ? "bg-healthy-dot text-surface"
                      : current
                        ? "bg-accent-fill text-on-accent"
                        : "bg-sunken text-ink-500",
                  )}
                >
                  {done ? <Check className="size-3" /> : i + 1}
                </span>
                {s === "Issued" && ["Part-Paid", "Disputed"].includes(inv.status)
                  ? inv.status
                  : s === "Paid" && inv.status === "Credited"
                    ? "Credited"
                    : s}
              </li>
            );
          })}
        </ol>
        {inv.status === "Voided" && (
          <p className="border-t border-border bg-sunken px-6 py-2 text-small text-ink-700">
            Voided. Kept for the audit trail.
          </p>
        )}
        {inv.dispute && (
          <p className="flex items-center gap-2 border-t border-border bg-over-bg px-6 py-2.5 text-small text-ink-900">
            <ShieldAlert className="size-4 text-over" aria-hidden="true" /> Disputed by the payer:{" "}
            {inv.dispute.reason}
          </p>
        )}
      </section>

      <Tabs label="Invoice" tabs={tabs} value={tab} onChange={setTab} />

      <div className="grid items-stretch gap-6 xl:grid-cols-12">
        <div className="flex flex-col gap-6 xl:col-span-8 [&>*:last-child]:flex-1">
          <TabPanel id="invoice" value={tab}>
            <FCard
              icon={Calculator}
              title="Lines and arithmetic"
              sub="Totals are calculated, never typed (AC-13). Services by name only; no clinical notes."
              flush
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-small">
                  <thead className="border-b border-border text-caption text-ink-500">
                    <tr>
                      <th className={th}>Date</th>
                      <th className={th}>Service</th>
                      <th className={th}>Item</th>
                      <th className={cn(th, "text-right")}>Qty × rate</th>
                      <th className={th}>Tax</th>
                      <th className={cn(th, "text-right")}>Total</th>
                      {draft && d.can.officer && <th className={th} />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {inv.lines.map((l) => (
                      <tr key={l.id} className={cn(l.held && "bg-over-bg/40")}>
                        <td className={td}>{dayLabel(l.date)}</td>
                        <td className={td}>
                          {l.description}
                          {l.held && (
                            <span className="block text-caption font-semibold text-over">
                              On hold (dispute)
                            </span>
                          )}
                        </td>
                        <td className={cn(td, "font-mono text-caption")}>{l.itemCode}</td>
                        <td className={cn(td, "text-right")}>
                          {l.quantity} {l.unit.toLowerCase()} × {aud(l.rate)}
                          <span className="block text-caption text-ink-500">
                            = {aud(l.subtotal)}
                          </span>
                        </td>
                        <td className={td}>
                          {l.tax}
                          {l.gst > 0 && (
                            <span className="block text-caption text-ink-500">
                              GST {aud(l.gst)}
                            </span>
                          )}
                        </td>
                        <td className={cn(td, "text-right font-semibold")}>{aud(l.total)}</td>
                        {draft && d.can.officer && (
                          <td className={td}>
                            <Button
                              size="icon-sm"
                              variant="danger"
                              aria-label="Remove line back to the queue"
                              onClick={() =>
                                act(
                                  { type: "remove-line", lineId: l.id },
                                  "Line returned to the queue",
                                )
                              }
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="text-small">
                    <tr className="border-t border-border">
                      <td colSpan={5} className="px-4 py-2 text-right text-ink-500">
                        Subtotal
                      </td>
                      <td className="px-4 py-2 text-right">{aud(inv.subtotal)}</td>
                    </tr>
                    <tr>
                      <td colSpan={5} className="px-4 py-1 text-right text-ink-500">
                        GST
                      </td>
                      <td className="px-4 py-1 text-right">{aud(inv.gst)}</td>
                    </tr>
                    <tr className="border-t-2 border-border-strong">
                      <td colSpan={5} className="px-4 py-2 text-right font-semibold">
                        Total
                      </td>
                      <td className="px-4 py-2 text-right font-semibold">{aud(inv.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <details className="border-t border-border px-5 py-3">
                <summary className="cursor-pointer text-caption font-semibold text-accent">
                  Show the exact arithmetic
                </summary>
                <ul className="mt-2 flex flex-col gap-1 font-mono text-caption text-ink-700">
                  {inv.arithmetic.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </details>
            </FCard>
            <FCard
              icon={Mail}
              title="Bill to and terms"
              sub={
                draft
                  ? "Saved drafts keep every field (AC-20)"
                  : "Fixed once issued; corrections go through a credit note (AC-21)"
              }
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Choice
                    label="Bill-to party"
                    options={billToTypes}
                    value={form.billTo.type}
                    onChange={(x) => draft && set({ billTo: { ...form.billTo, type: x } })}
                  />
                </div>
                {draft ? (
                  <>
                    <TextField
                      label="Name"
                      value={form.billTo.name}
                      onChange={(x) => set({ billTo: { ...form.billTo, name: x } })}
                      required
                    />
                    <TextField
                      label="Email"
                      type="email"
                      value={form.billTo.email}
                      onChange={(x) => set({ billTo: { ...form.billTo, email: x } })}
                    />
                    <TextField
                      label="Billing address"
                      value={form.billTo.address}
                      onChange={(x) => set({ billTo: { ...form.billTo, address: x } })}
                    />
                    <TextField
                      label="ABN"
                      value={form.billTo.abn}
                      onChange={(x) => set({ billTo: { ...form.billTo, abn: x } })}
                    />
                    <TextField
                      label="Payer reference (claim or authorisation)"
                      value={form.billTo.reference}
                      onChange={(x) => set({ billTo: { ...form.billTo, reference: x } })}
                    />
                    <TextField
                      label="Due date"
                      type="date"
                      value={form.dueDate}
                      onChange={(x) => set({ dueDate: x })}
                    />
                    <Choice
                      label="Payment terms"
                      options={paymentTerms}
                      value={form.terms}
                      onChange={(x) =>
                        set({
                          terms: x,
                          ...(x !== "Custom"
                            ? {
                                dueDate: addDaysIso(
                                  new Date().toISOString().slice(0, 10),
                                  termDays[x],
                                ),
                              }
                            : {}),
                        })
                      }
                    />
                    <Choice
                      label="Delivery"
                      options={deliveryChannels}
                      value={form.delivery}
                      onChange={(x) => set({ delivery: x })}
                    />
                    <div className="md:col-span-2">
                      <TextArea
                        label="Note on the invoice"
                        value={form.note}
                        onChange={(x) => set({ note: x })}
                        rows={2}
                        hint="Never include clinical details"
                      />
                    </div>
                  </>
                ) : (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-small md:col-span-2">
                    <dt className="text-ink-500">Name</dt>
                    <dd>{inv.billTo.name}</dd>
                    <dt className="text-ink-500">Email</dt>
                    <dd>{inv.billTo.email || "—"}</dd>
                    <dt className="text-ink-500">Reference</dt>
                    <dd>{inv.billTo.reference || "—"}</dd>
                    <dt className="text-ink-500">Terms</dt>
                    <dd>
                      {inv.terms} · due {dayLabel(inv.dueDate)} · {inv.delivery}
                    </dd>
                  </dl>
                )}
              </div>
            </FCard>
            <SourceLines lines={d.billables} />
          </TabPanel>

          <TabPanel id="money" value={tab}>
            <FCard
              icon={Calculator}
              title="Payments and credits"
              sub="Balance = total − allocated payments − applied credits"
              flush
            >
              <ul className="divide-y divide-border">
                {inv.allocations.map((a, i) => (
                  <li key={`p${i}`} className="flex justify-between gap-3 px-5 py-3 text-small">
                    <span>
                      Payment <span className="font-mono">{a.paymentRef}</span>
                      <span className="block text-caption text-ink-500">
                        {dayLabel(a.at)} · {a.by}
                      </span>
                    </span>
                    <span className="font-semibold text-healthy">−{aud(a.amount)}</span>
                  </li>
                ))}
                {inv.credits.map((c) => (
                  <li key={c.ref} className="flex justify-between gap-3 px-5 py-3 text-small">
                    <span>
                      Credit <span className="font-mono">{c.ref}</span>
                      <span className="block text-caption text-ink-500">
                        {c.reason} · {dayLabel(c.at)}
                      </span>
                    </span>
                    <span className="font-semibold text-accent">−{aud(c.amount)}</span>
                  </li>
                ))}
                {!inv.allocations.length && !inv.credits.length && (
                  <li className="px-5 py-6 text-center text-small text-ink-500">
                    No payments or credits yet.
                  </li>
                )}
                <li className="flex justify-between bg-canvas px-5 py-3 text-small font-semibold">
                  <span>Balance</span>
                  <span>{aud(inv.balance)}</span>
                </li>
              </ul>
            </FCard>
          </TabPanel>

          <TabPanel id="comms" value={tab}>
            {aiDraft && (
              <section className="bubble-in rounded-card border border-dashed border-draft-rule bg-draft p-4">
                <div className="mb-2 flex items-center justify-between">
                  <AiChip>AI draft for you to edit</AiChip>
                  <button
                    type="button"
                    className="cursor-pointer text-caption font-semibold text-accent"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(`${aiDraft.subject}\n\n${aiDraft.message}`)
                        .then(() => toast("Copied", { tone: "success" }))
                    }
                  >
                    Copy
                  </button>
                </div>
                <p className="text-small font-semibold text-ink-900">{aiDraft.subject}</p>
                <p className="mt-1 text-small whitespace-pre-line text-ink-700">
                  {aiDraft.message}
                </p>
                <p className="mt-2 text-caption text-ink-500">
                  No clinical notes are used. A person checks and sends it.
                </p>
              </section>
            )}
            <FCard
              icon={Mail}
              title="Communication history"
              sub="Every send, reminder and download is kept (AC-37). Delivery is simulated."
              flush
            >
              <ul className="divide-y divide-border">
                {inv.comms.length === 0 && (
                  <li className="px-5 py-6 text-center text-small text-ink-500">
                    Nothing sent yet.
                  </li>
                )}
                {inv.comms.map((c, i) => (
                  <li key={`${c.at}-${i}`} className="px-5 py-3 text-small">
                    <span className="font-semibold text-ink-900">{c.subject}</span>
                    <span className="block text-caption text-ink-500">
                      {c.channel} to {c.to} · {c.by} ·{" "}
                      {new Date(c.at).toLocaleString("en-AU", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </FCard>
          </TabPanel>

          <TabPanel id="history" value={tab}>
            <FCard
              icon={History}
              title="Versions"
              sub="Each issued version is kept; credits make a new version"
              flush
            >
              <ul className="divide-y divide-border">
                {inv.versions.length === 0 && (
                  <li className="px-5 py-6 text-center text-small text-ink-500">
                    Versions start when the invoice is issued.
                  </li>
                )}
                {inv.versions.map((v) => (
                  <li key={v.version} className="flex justify-between gap-3 px-5 py-3 text-small">
                    <span>
                      <span className="font-mono font-semibold">v{v.version}</span> · {v.reason}
                      <span className="block text-caption text-ink-500">
                        {v.by} · {dayLabel(v.at)}
                      </span>
                    </span>
                    <span>{aud(v.total)}</span>
                  </li>
                ))}
              </ul>
            </FCard>
            <FCard icon={History} title="Status history" flush>
              <ol className="relative mx-5 my-4 border-l border-border pl-6">
                {inv.history.map((h, i) => (
                  <li key={`${h.at}-${i}`} className="relative py-2">
                    <span
                      aria-hidden="true"
                      className="absolute top-3.5 -left-[31px] size-2.5 rounded-full border-2 border-surface bg-accent-fill"
                    />
                    <p className="text-small font-semibold text-ink-900">{h.status}</p>
                    {h.note && <p className="text-caption text-ink-700">{h.note}</p>}
                    <p className="text-caption text-ink-500">
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
            </FCard>
          </TabPanel>
        </div>

        <aside className="flex flex-col gap-6 xl:sticky xl:top-[calc(var(--topbar-h)+4.5rem)] xl:col-span-4 xl:self-start">
          {(inv.blockers.length > 0 || inv.warnings.length > 0) && (
            <FCard
              icon={AlertTriangle}
              title={inv.blockers.length ? "Resolve before issuing" : "Warnings"}
            >
              <ul className="flex flex-col gap-2 text-small">
                {inv.blockers.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-ink-900">
                    <ShieldAlert className="mt-0.5 size-4 flex-none text-over" aria-hidden="true" />
                    {b}
                  </li>
                ))}
                {inv.warnings.map((w) => (
                  <li key={w} className="flex items-start gap-2 text-ink-700">
                    <AlertTriangle
                      className="mt-0.5 size-4 flex-none text-watch"
                      aria-hidden="true"
                    />
                    {w}
                  </li>
                ))}
              </ul>
            </FCard>
          )}
          {d.can.officer && (
            <FCard icon={Check} title="Actions">
              <div className="flex flex-col gap-2">
                {draft && (
                  <Button
                    variant={dirty ? "primary" : "secondary"}
                    disabled={busy || !dirty}
                    onClick={async () =>
                      (await act({ type: "save", draft: form }, "Draft saved")) && setDirty(false)
                    }
                  >
                    {dirty ? "Save draft" : "Draft saved"}
                  </Button>
                )}
                {draft && (
                  <Button
                    variant="soft"
                    disabled={busy || dirty}
                    onClick={() => act({ type: "submit" }, "Sent for approval")}
                  >
                    Send for approval
                  </Button>
                )}
                {inv.status === "Pending Approval" && (
                  <Button
                    variant="primary"
                    disabled={busy || (inv.needsManager && !d.can.manager)}
                    title={
                      inv.needsManager && !d.can.manager
                        ? "Over the manager-approval amount"
                        : undefined
                    }
                    onClick={() =>
                      act({ type: "approve", note: "Checked lines, payer and terms" }, "Approved")
                    }
                  >
                    Approve{inv.needsManager ? " (Finance Manager)" : ""}
                  </Button>
                )}
                {["Pending Approval", "Approved"].includes(inv.status) && (
                  <Button variant="secondary" onClick={() => setSheet("return")}>
                    Return to draft
                  </Button>
                )}
                {inv.status === "Approved" && (
                  <Button
                    variant="primary"
                    disabled={busy || inv.blockers.length > 0}
                    title={inv.blockers.length ? "Resolve the blockers first" : undefined}
                    onClick={() =>
                      act({ type: "issue" }, "Invoice issued", "Delivery is simulated.")
                    }
                  >
                    Issue invoice
                  </Button>
                )}
                {["Issued", "Part-Paid", "Disputed", "Paid", "Credited"].includes(inv.status) && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => act({ type: "resend", note: "" }, "Re-sent (simulated)")}
                  >
                    Resend
                  </Button>
                )}
                {inv.overdue && (
                  <Button
                    variant="soft"
                    disabled={busy}
                    onClick={() => act({ type: "remind" }, "Reminder sent (simulated)")}
                  >
                    Send overdue reminder
                  </Button>
                )}
                {["Issued", "Part-Paid", "Paid"].includes(inv.status) && (
                  <Button variant="soft-danger" onClick={() => setSheet("dispute")}>
                    Record dispute
                  </Button>
                )}
                {inv.status === "Disputed" && (
                  <Button variant="soft" onClick={() => setSheet("resolve")}>
                    Resolve dispute
                  </Button>
                )}
                {["Issued", "Part-Paid", "Paid", "Disputed"].includes(inv.status) && (
                  <Button variant="soft" onClick={() => setSheet("credit")}>
                    Request credit note
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await act(
                      { type: "download" },
                      "Download recorded",
                      "Use print to save a PDF.",
                    );
                    setTimeout(() => window.print(), 300);
                  }}
                >
                  Download or print
                </Button>
                {["Draft", "Pending Approval", "Approved", "Issued"].includes(inv.status) && (
                  <Button variant="soft-danger" size="sm" onClick={() => setSheet("void")}>
                    Void
                  </Button>
                )}
              </div>
            </FCard>
          )}
          {d.can.officer && inv.status !== "Draft" && (
            <FCard icon={Mail} title="Payer messages">
              <div className="flex flex-col gap-2">
                {(["explanation", "reminder", "dispute"] as const).map((p) => (
                  <Button
                    key={p}
                    variant="soft"
                    size="sm"
                    disabled={busy}
                    onClick={() => draftMessage(p)}
                  >
                    <AiIcon className="size-3.5" /> Draft{" "}
                    {p === "explanation"
                      ? "an invoice explanation"
                      : p === "reminder"
                        ? "a payment reminder"
                        : "a dispute response"}
                  </Button>
                ))}
              </div>
            </FCard>
          )}
        </aside>
      </div>

      {sheet === "credit" && (
        <AdjustmentSheet
          hub={{ invoices: [inv], payments: [], can: { ...d.can, view: true, therapist: false } }}
          invoiceId={inv.id}
          onClose={() => setSheet(null)}
          onDone={reload}
        />
      )}
      {sheet === "dispute" && <DisputeSheet inv={inv} onClose={() => setSheet(null)} act={act} />}
      {(sheet === "void" || sheet === "return" || sheet === "resolve") && (
        <NoteSheet
          title={
            sheet === "void"
              ? "Void this invoice"
              : sheet === "return"
                ? "Return to draft"
                : "Resolve the dispute"
          }
          cta={sheet === "void" ? "Void" : sheet === "return" ? "Return" : "Resolve"}
          onClose={() => setSheet(null)}
          onSubmit={async (note) => {
            const ok = await act(
              sheet === "void"
                ? { type: "void", reason: note }
                : sheet === "return"
                  ? { type: "return", note }
                  : { type: "resolve", note },
              sheet === "void" ? "Voided" : sheet === "return" ? "Returned" : "Dispute resolved",
            );
            if (ok) setSheet(null);
          }}
        />
      )}
    </>
  );
}

function SourceLines({ lines }: { lines: BillableDto[] }) {
  if (!lines.length) return null;
  return (
    <FCard
      icon={FileText}
      title="Source lines"
      sub="Each charge comes from one verified delivery record (AC-01)"
      flush
    >
      <ul className="divide-y divide-border">
        {lines.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-small">
            <span className="font-mono font-semibold">{l.ref}</span>
            <span className="flex-1 text-ink-700">
              {l.source} · {l.support} · {l.therapist} · {dayLabel(l.start)} ·{" "}
              {l.confirmation?.how ?? "not confirmed"}
            </span>
            <Tag tone={lineTone[l.status]}>{l.status}</Tag>
          </li>
        ))}
      </ul>
    </FCard>
  );
}

function DisputeSheet({
  inv,
  onClose,
  act,
}: {
  inv: InvoiceDto07;
  onClose: () => void;
  act: (b: unknown, ok: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState("");
  const [held, setHeld] = useState<string[]>([]);
  return (
    <SheetShell
      title={`Dispute on ${inv.number}`}
      onClose={onClose}
      cta="Record dispute"
      disabled={reason.trim().length < 5}
      onSubmit={async () => {
        if (await act({ type: "dispute", reason, lineIds: held }, "Dispute recorded")) onClose();
      }}
    >
      <TextArea
        label="What the payer disputes"
        value={reason}
        onChange={setReason}
        rows={3}
        required
      />
      <p className="text-caption font-semibold text-ink-700">Put these lines on hold</p>
      {inv.lines.map((l) => (
        <Tick
          key={l.id}
          checked={held.includes(l.id)}
          onChange={(x) => setHeld(x ? [...held, l.id] : held.filter((y) => y !== l.id))}
        >
          {l.description} · {aud(l.total)}
        </Tick>
      ))}
    </SheetShell>
  );
}

function NoteSheet({
  title,
  cta,
  onClose,
  onSubmit,
}: {
  title: string;
  cta: string;
  onClose: () => void;
  onSubmit: (n: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <SheetShell
      title={title}
      cta={cta}
      onClose={onClose}
      disabled={note.trim().length < 5}
      onSubmit={() => onSubmit(note)}
    >
      <TextArea label="Reason" value={note} onChange={setNote} rows={3} required />
    </SheetShell>
  );
}

function SheetShell({
  title,
  cta,
  onClose,
  onSubmit,
  disabled,
  children,
}: {
  title: string;
  cta: string;
  onClose: () => void;
  onSubmit: () => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <SheetLazy
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={disabled} onClick={onSubmit}>
            {cta}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">{children}</div>
    </SheetLazy>
  );
}
