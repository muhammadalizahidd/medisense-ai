"use client";

import { Download, Wallet } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Tag, type TagTone } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { useResource } from "@/lib/live/client";
import {
  centsLabel,
  payMethodLabel,
  type EarningStatus,
  type FinanceEarningRowDto,
  type TherapistEarningsReportDto,
  type TherapistEarningsRowDto,
} from "@/lib/live/pay";
import { shortDate } from "@/lib/live/time";
import { EmptyNote, ErrorNote, Skeleton } from "./bits";
import { td, th, type Filters } from "./finance-bits";
import { FCard } from "./funding-bits";

const STATUS_TONE: Record<EarningStatus, TagTone> = {
  Earned: "healthy",
  Pending: "watch",
  "Not payable": "neutral",
  "Pay rate not set": "over",
};

const dayText = (key: string) => shortDate(`${key}T00:00:00Z`);
const percent = (p: number | null) => (p === null ? "—" : `${p.toFixed(1)}%`);

/** Billing reports: what each therapist was billed for, what they earned, and the margin. */
export function TherapistEarnings({ f }: { f: Filters }) {
  const base = new URLSearchParams({ from: f.from, to: f.to });
  if (f.service) base.set("service", f.service);
  // The finance filter bar names therapists; the report takes ids, so look the id up by name.
  const [names, setNames] = useState<TherapistEarningsReportDto["therapists"]>([]);
  const chosen = f.therapist ? names.find((t) => t.name === f.therapist) : undefined;
  if (chosen) base.set("therapist", chosen.id);
  const query = base.toString();
  const { data, error, loading, reload } = useResource<TherapistEarningsReportDto>(
    `/api/care/billing/earnings?${query}`,
    (e) => e.type === "care",
  );
  if (data && data.therapists !== names && data.therapists.length !== names.length)
    setNames(data.therapists);
  const [open, setOpen] = useState<TherapistEarningsRowDto | null>(null);
  const rows = (data?.rows ?? []).filter((r) => !f.therapist || r.therapist === f.therapist);
  const t = data?.totals;

  return (
    <FCard
      icon={Wallet}
      title="Therapist earnings"
      sub="Pay follows the work done. Billed is ex GST, before credits, without travel. Margin compares billed with the pay for those same billed visits; work not billed yet and pending pay are shown apart."
      flush
      action={
        <a
          href={`/api/care/billing/earnings/export?${query}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border-strong bg-surface px-3 text-small font-semibold text-ink-900 hover:bg-sunken"
        >
          <Download className="size-4" aria-hidden="true" /> Export CSV
        </a>
      }
    >
      {error && !data ? (
        <div className="p-4">
          <ErrorNote message={error} onRetry={reload} />
        </div>
      ) : loading && !data ? (
        <Skeleton className="m-4 h-60" />
      ) : rows.length === 0 ? (
        <div className="p-4">
          <EmptyNote title="No therapist visits in this period." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-small">
            <thead className="border-b border-border bg-sunken text-caption text-ink-500">
              <tr>
                <th className={th}>Therapist</th>
                <th className={th}>Pay method</th>
                <th className={cn(th, "text-right")}>Visits</th>
                <th className={cn(th, "text-right")}>Billed</th>
                <th className={cn(th, "text-right")}>Pay</th>
                <th className={cn(th, "text-right")}>Pending pay</th>
                <th className={cn(th, "text-right")}>Margin</th>
                <th className={cn(th, "text-right")}>Margin %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr
                  key={r.therapistId}
                  className="cursor-pointer hover:bg-sunken/60"
                  onClick={() => setOpen(r)}
                >
                  <td className={td}>
                    <button
                      type="button"
                      className="cursor-pointer text-left font-semibold text-accent"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpen(r);
                      }}
                    >
                      {r.therapist}
                    </button>
                    <span className="block text-caption text-ink-500">{r.discipline}</span>
                  </td>
                  <td className={td}>
                    {r.method ? (
                      <Tag tone="outline">{payMethodLabel[r.method]}</Tag>
                    ) : (
                      <Tag tone="over">Pay rate not set</Tag>
                    )}
                  </td>
                  <td className={cn(td, "text-right")}>{r.visits}</td>
                  <td className={cn(td, "text-right")}>
                    {centsLabel(r.billedCents)}
                    {r.unbilledVisits > 0 && (
                      <span className="block text-caption text-watch">
                        {r.unbilledVisits} not billed yet
                      </span>
                    )}
                  </td>
                  <td className={cn(td, "text-right font-semibold text-ink-900")}>
                    {centsLabel(r.payCents)}
                    {r.missingRate && (
                      <span className="block text-caption font-normal text-over">
                        Some visits unpriced
                      </span>
                    )}
                  </td>
                  <td className={cn(td, "text-right text-ink-500")}>
                    {centsLabel(r.pendingCents)}
                  </td>
                  <td className={cn(td, "text-right", r.marginCents < 0 && "text-over")}>
                    {centsLabel(r.marginCents)}
                  </td>
                  <td className={cn(td, "text-right")}>{percent(r.marginPercent)}</td>
                </tr>
              ))}
            </tbody>
            {t && !f.therapist && (
              <tfoot className="border-t border-border-strong bg-sunken font-semibold text-ink-900">
                <tr>
                  <td className={td} colSpan={2}>
                    Total
                  </td>
                  <td className={cn(td, "text-right")}>{t.visits}</td>
                  <td className={cn(td, "text-right")}>
                    {centsLabel(t.billedCents)}
                    {t.unbilledVisits > 0 && (
                      <span className="block text-caption font-normal text-watch">
                        {t.unbilledVisits} not billed yet
                      </span>
                    )}
                  </td>
                  <td className={cn(td, "text-right")}>{centsLabel(t.payCents)}</td>
                  <td className={cn(td, "text-right")}>{centsLabel(t.pendingCents)}</td>
                  <td className={cn(td, "text-right")}>{centsLabel(t.marginCents)}</td>
                  <td className={cn(td, "text-right")}>{percent(t.marginPercent)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {open && <VisitsSheet row={open} query={query} onClose={() => setOpen(null)} />}
    </FCard>
  );
}

function VisitsSheet({
  row,
  query,
  onClose,
}: {
  row: TherapistEarningsRowDto;
  query: string;
  onClose: () => void;
}) {
  const { data, error, loading, reload } = useResource<{ rows: FinanceEarningRowDto[] }>(
    `/api/care/billing/earnings/${row.therapistId}?${query}`,
  );
  return (
    <Sheet
      title={`${row.therapist}: visits and pay`}
      description={`${row.visits} visits · pay ${centsLabel(row.payCents)} · billed ${centsLabel(row.billedCents)} · margin ${percent(row.marginPercent)}`}
      onClose={onClose}
      footer={
        <div className="flex justify-end">
          <Button onClick={onClose}>Close</Button>
        </div>
      }
    >
      {error && !data ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Skeleton className="h-80" />
      ) : !data?.rows.length ? (
        <EmptyNote title="No visits in this period." />
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border">
          {data.rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 px-4 py-3">
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-semibold text-ink-900">{r.patient}</span>
                <span className="text-right">
                  <span className="font-semibold text-ink-900">
                    {r.feeCents === null ? "Not set" : centsLabel(r.feeCents)}
                  </span>
                  <span className="block text-caption text-ink-500">
                    {r.billed ? `billed ${centsLabel(r.billedCents)}` : "not billed yet"}
                  </span>
                </span>
              </span>
              <span className="text-caption text-ink-500">
                {dayText(r.date)} · {r.service} · {r.modality}
                {r.minutes ? ` · ${r.minutes} min` : ""}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <Tag tone={STATUS_TONE[r.status]}>{r.status}</Tag>
                {r.reason && r.status !== "Pay rate not set" && (
                  <span className="text-caption text-ink-500">{r.reason}</span>
                )}
                {r.estimate && (
                  <span className="text-caption text-ink-500">Fee is an estimate</span>
                )}
                {r.notes.map((n) => (
                  <span key={n} className="text-caption text-ink-500">
                    {n}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
