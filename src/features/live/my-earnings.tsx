"use client";

import { Info } from "lucide-react";
import { useState } from "react";
import { colour } from "@/components/charts/chart-kit";
import { TrendChart } from "@/components/charts/trend-chart";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Tag, type TagTone } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { useResource } from "@/lib/live/client";
import {
  centsLabel,
  financialYearStart,
  monthStart,
  payMethodLabel,
  plusDays,
  type EarningStatus,
  type EarningsFigure,
  type MyEarningRowDto,
  type MyEarningsDto,
} from "@/lib/live/pay";
import { shortDate } from "@/lib/live/time";
import { EmptyNote, ErrorNote, Skeleton } from "./bits";
import { DateField } from "./form-bits";

const STATUS_TONE: Record<EarningStatus, TagTone> = {
  Earned: "healthy",
  Pending: "watch",
  "Not payable": "neutral",
  "Pay rate not set": "over",
};

type Range = "fy" | "month" | "12w" | "custom";
const dayText = (key: string) => shortDate(`${key}T00:00:00Z`);

/** A figure, or "Pay rate not set" when some visit in the period can't be priced. */
function Figure({
  label,
  figure,
  caption,
  compact,
}: {
  label: string;
  figure: EarningsFigure;
  caption: string;
  compact: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 bg-surface px-4 py-3.5">
      <span className="label-caps text-ink-500">{label}</span>
      <span
        className={cn(
          "type-display leading-none text-ink-900",
          compact ? "text-h2" : "text-h2 lg:text-h1",
        )}
      >
        {centsLabel(figure.cents)}
      </span>
      <span className={cn("text-caption", figure.missingRate ? "text-over" : "text-ink-500")}>
        {figure.missingRate ? "Pay rate not set for some visits" : caption}
      </span>
    </div>
  );
}

/**
 * A therapist's own earnings: their fee for each visit and their totals. Never what was charged,
 * who pays, or any invoice or claim. Shared by the web Earnings tab and the therapist app.
 */
export function MyEarnings({ compact = false }: { compact?: boolean }) {
  const [range, setRange] = useState<Range>("fy");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [service, setService] = useState("");
  const query = new URLSearchParams();
  const rangeOf = (today: string): [string, string] =>
    range === "month"
      ? [monthStart(today), today]
      : range === "12w"
        ? [plusDays(today, -83), today]
        : range === "custom" && from && to
          ? [from, to]
          : [financialYearStart(today), today];
  // The first load uses the financial year; the server's "today" then sets the window.
  const [seenToday, setSeenToday] = useState<string | null>(null);
  if (seenToday) {
    const [a, b] = rangeOf(seenToday);
    query.set("from", a);
    query.set("to", b);
  }
  if (service) query.set("service", service);
  const { data, error, loading, reload } = useResource<MyEarningsDto>(
    `/api/me/earnings${query.size ? `?${query}` : ""}`,
    (e) => e.type === "care",
  );
  if (data && seenToday !== data.today) setSeenToday(data.today);

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading && !data) return <Skeleton className="h-[560px]" />;
  if (!data) return null;
  const h = data.headline;
  const series = data.series.map((w) => ({
    week: dayText(w.week),
    Earned: w.cents / 100,
  }));

  return (
    <div className="flex flex-col gap-5">
      {!data.method && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-card border border-over bg-over-bg px-4 py-3 text-small text-over"
        >
          <Info className="mt-0.5 size-4 flex-none" aria-hidden="true" />
          Pay rate not set. Your office sets it in People and HR; your visits are listed below and
          their fees appear once it&rsquo;s set.
        </p>
      )}
      <section
        aria-label="Earnings figures"
        className={cn(
          "grid gap-px overflow-hidden rounded-card border border-border bg-border",
          compact ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4",
        )}
      >
        <Figure label="This week" figure={h.week} caption="Monday to today" compact={compact} />
        <Figure label="This month" figure={h.month} caption="Earned so far" compact={compact} />
        <Figure
          label="Financial year"
          figure={h.year}
          caption={`Since ${dayText(financialYearStart(data.today))}`}
          compact={compact}
        />
        <Figure
          label="Pending"
          figure={h.pending}
          caption={
            h.pending.visits
              ? `${h.pending.visits} ${h.pending.visits === 1 ? "visit" : "visits"} to confirm`
              : "Nothing waiting"
          }
          compact={compact}
        />
      </section>

      <section className="rounded-card border border-border bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-section font-semibold text-ink-900">Last 12 weeks</h2>
          <span className="text-caption text-ink-500">
            Earned per week{data.method ? ` · ${payMethodLabel[data.method]}` : ""}
          </span>
        </div>
        <TrendChart
          label="Earnings per week, last 12 weeks"
          data={series}
          xKey="week"
          height={compact ? 180 : 240}
          format={(v) => centsLabel(Math.round(v * 100))}
          axisFormat={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`)}
          series={[{ key: "Earned", label: "Earned", colour: colour.series1, kind: "area" }]}
        />
      </section>

      <section aria-label="Visits">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div className={compact ? "w-full" : "w-48"}>
            <Select
              aria-label="Date range"
              className="h-9"
              value={range}
              onChange={(e) => setRange(e.target.value as Range)}
            >
              <option value="fy">This financial year</option>
              <option value="month">This month</option>
              <option value="12w">Last 12 weeks</option>
              <option value="custom">Choose dates</option>
            </Select>
          </div>
          <div className={compact ? "w-full" : "w-56"}>
            <Select
              aria-label="Service"
              className="h-9"
              value={service}
              onChange={(e) => setService(e.target.value)}
            >
              <option value="">All services</option>
              {data.services.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
          {range === "custom" && (
            <div className={cn("grid gap-3", compact ? "w-full" : "grid-cols-2 sm:w-[440px]")}>
              <DateField label="From" required value={from} onChange={setFrom} />
              <DateField label="To" required value={to} onChange={setTo} />
            </div>
          )}
          {(service || range !== "fy") && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setRange("fy");
                setService("");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
        {data.rows.length === 0 ? (
          <EmptyNote title="No visits in this period." />
        ) : compact ? (
          <ul className="divide-y divide-border rounded-card border border-border bg-surface">
            {data.rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 px-4 py-3">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-ink-900">{r.patient}</span>
                  <Fee r={r} />
                </span>
                <span className="text-caption text-ink-500">
                  {dayText(r.date)} · {r.service} · {r.modality}
                  {r.minutes ? ` · ${r.minutes} min` : ""}
                </span>
                <Status r={r} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="overflow-x-auto rounded-card border border-border bg-surface">
            <table className="w-full text-left text-small">
              <thead className="border-b border-border bg-sunken text-caption text-ink-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Patient</th>
                  <th className="px-4 py-3 font-medium">Service</th>
                  <th className="px-4 py-3 font-medium">Mode</th>
                  <th className="px-4 py-3 text-right font-medium">Minutes</th>
                  <th className="px-4 py-3 text-right font-medium">Your fee</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-ink-700">{dayText(r.date)}</td>
                    <td className="px-4 py-3 font-medium text-ink-900">{r.patient}</td>
                    <td className="px-4 py-3 text-ink-700">{r.service}</td>
                    <td className="px-4 py-3 text-ink-700">{r.modality}</td>
                    <td className="px-4 py-3 text-right text-ink-700">{r.minutes || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <Fee r={r} />
                    </td>
                    <td className="px-4 py-3">
                      <Status r={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-caption text-ink-500">
          A fee counts as earned once the visit is completed and its note is signed. Pay follows the
          work you did; it doesn&rsquo;t change if an invoice is later credited.
        </p>
      </section>
    </div>
  );
}

function Fee({ r }: { r: MyEarningRowDto }) {
  if (r.feeCents === null)
    return <span className="text-caption font-semibold text-over">Not set</span>;
  return (
    <span className={cn("font-semibold", r.status === "Earned" ? "text-ink-900" : "text-ink-500")}>
      {centsLabel(r.feeCents)}
      {r.estimate && <span className="block text-caption font-normal text-ink-500">Estimate</span>}
    </span>
  );
}

function Status({ r }: { r: MyEarningRowDto }) {
  return (
    <span className="flex flex-col items-start gap-1">
      <Tag tone={STATUS_TONE[r.status]}>{r.status}</Tag>
      {r.reason && r.status !== "Pay rate not set" && (
        <span className="text-caption text-ink-500">{r.reason}</span>
      )}
      {r.notes.map((n) => (
        <span key={n} className="text-caption text-ink-500">
          {n}
        </span>
      ))}
    </span>
  );
}
