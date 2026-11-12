"use client";

import { AlertTriangle, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { MetricBand } from "@/components/ui/metric-band";
import { PageHeader } from "@/components/ui/page";
import { Segmented } from "@/components/ui/segmented";
import { Tag, type TagTone } from "@/components/ui/tag";
import { useResource } from "@/lib/live/client";
import { money, type InvoiceDto, type InvoiceStatus } from "@/lib/live/clinical";
import { relativeTime } from "@/lib/live/time";
import { EmptyNote, ErrorNote, LiveBadge, Skeleton } from "./bits";

export const invoiceTone: Record<InvoiceStatus, TagTone> = {
  Draft: "monitor",
  "Ready for Review": "available",
  Approved: "live",
  Issued: "live",
  "Partially Paid": "monitor",
  Paid: "healthy",
  Disputed: "over",
  Adjusted: "available",
  Voided: "neutral",
};

type Filter = "all" | "draft" | "review" | "out" | "disputed" | "paid";
const filters: Record<Filter, (i: InvoiceDto) => boolean> = {
  all: () => true,
  draft: (i) => i.status === "Draft",
  review: (i) => i.status === "Ready for Review" || i.status === "Approved",
  out: (i) => ["Issued", "Partially Paid", "Adjusted"].includes(i.status),
  disputed: (i) => i.status === "Disputed",
  paid: (i) => i.status === "Paid" || i.status === "Voided",
};

/** Admin module A07: verified services become draft invoices; finance reviews, issues and reconciles. */
export function BillingBoard() {
  const { data, error, loading, reload } = useResource<{ invoices: InvoiceDto[] }>(
    "/api/care/billing",
    (e) => e.type === "care",
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const all = data?.invoices ?? [];
  const sum = (f: Filter, by: (i: InvoiceDto) => number) =>
    all.filter(filters[f]).reduce((s, i) => s + by(i), 0);
  const rows = all
    .filter(filters[filter])
    .filter((i) =>
      `${i.number} ${i.clientName} ${i.payer}`.toLowerCase().includes(query.trim().toLowerCase()),
    );

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Billing and invoices"
        description="A visit is billed once it's verified: checked in and out, with a signed note. Late cancellations and non-attendance are added as charges. No clinical notes appear on invoices."
        actions={<LiveBadge />}
      />
      <MetricBand
        label="Billing figures"
        metrics={[
          {
            label: "Draft",
            value: money(sum("draft", (i) => i.total)),
            caption: `${all.filter(filters.draft).length} invoices building`,
          },
          {
            label: "To review",
            value: all.filter(filters.review).length,
            tone: "monitor",
            flagged: all.some(filters.review),
          },
          {
            label: "Outstanding",
            value: money(sum("out", (i) => i.total - i.paid)),
            caption: "Issued, not yet paid",
          },
          {
            label: "Disputed",
            value: all.filter(filters.disputed).length,
            tone: "over",
            flagged: all.some(filters.disputed),
          },
          { label: "Paid", value: money(sum("paid", (i) => i.paid)) },
        ]}
      />
      <div className="mt-6 mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { id: "all", label: "All" },
            { id: "draft", label: "Draft" },
            { id: "review", label: "Review" },
            { id: "out", label: "Outstanding" },
            { id: "disputed", label: "Disputed" },
            { id: "paid", label: "Closed" },
          ]}
        />
        <label className="flex h-9 w-72 items-center gap-2 rounded-control border border-border bg-surface px-3 focus-within:shadow-focus">
          <Search className="size-4 text-ink-500" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search invoices"
            placeholder="Invoice, patient or payer"
            className="min-w-0 flex-1 bg-transparent text-small outline-none placeholder:text-ink-500"
          />
        </label>
      </div>
      {error && !data ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Skeleton className="h-40" />
      ) : rows.length === 0 ? (
        <EmptyNote title={all.length ? "No invoices here." : "No invoices yet."}>
          {all.length
            ? "Try another filter."
            : "They appear when a therapist signs the note for a checked-out visit."}
        </EmptyNote>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="table-stack w-full text-left text-small md:min-w-220">
            <thead className="border-b border-border text-caption text-ink-500">
              <tr>
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Payer</th>
                <th className="px-4 py-3 text-right font-medium">Lines</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-right font-medium">Owing</th>
                <th className="px-4 py-3 font-medium">Checks</th>
                <th className="px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((i) => (
                <tr key={i.id} className="hover:bg-canvas">
                  <td className="px-4 py-3">
                    <Link
                      href={`/care/billing/${i.id}`}
                      className="font-mono font-semibold text-ink-900"
                    >
                      {i.number}
                    </Link>
                    <span className="block text-caption text-ink-500">{i.clientName}</span>
                  </td>
                  <td className="px-4 py-3 text-ink-700">
                    {i.payer}
                    <span className="block text-caption text-ink-500">{i.funding}</span>
                  </td>
                  <td className="px-4 py-3 text-right">{i.lines.length}</td>
                  <td className="px-4 py-3 text-right font-semibold">{money(i.total)}</td>
                  <td className="px-4 py-3 text-right">{money(i.total - i.paid)}</td>
                  <td className="px-4 py-3">
                    {i.exceptions.length ? (
                      <Tag tone="monitor">
                        <AlertTriangle className="size-3" aria-hidden="true" />{" "}
                        {i.exceptions.length} to resolve
                      </Tag>
                    ) : (
                      <span className="text-caption text-ink-500">Clear</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-700">{relativeTime(i.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <Tag tone={invoiceTone[i.status]}>{i.status}</Tag>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
