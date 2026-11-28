"use client";

import { History, Search, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { RuleMark } from "@/components/ai/provenance";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MetricBand } from "@/components/ui/metric-band";
import { PageHeader } from "@/components/ui/page";
import { Avatar } from "@/components/ui/premium";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { TableFrame } from "@/components/ui/table-frame";
import { Tag, type TagTone } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { api, useResource } from "@/lib/live/client";
import {
  cancellationPayLabel,
  cancellationPays,
  centsLabel,
  payMethodLabel,
  payMethods,
  payRateInputSchema,
  type CancellationPay,
  type PayMethod,
  type PayRateDto,
  type PayRatesBoardDto,
  type PayRatesRowDto,
} from "@/lib/live/pay";
import { shortDate } from "@/lib/live/time";
import { EmptyNote, ErrorNote, LiveBadge, Skeleton } from "./bits";
import { Choice, DateField, TextArea, TextField } from "./form-bits";

const STATE_TONE: Record<PayRateDto["state"], TagTone> = {
  Current: "healthy",
  Upcoming: "available",
  Past: "neutral",
  Withdrawn: "neutral",
};

const dayText = (key: string) => shortDate(`${key}T00:00:00Z`);

/** "90" or "90.5" or "90.50" → 9050 cents; anything else is null. Parsed as text, never floats. */
function toCents(text: string): number | null {
  const m = text
    .trim()
    .replace(/^\$/, "")
    .replace(/,/g, "")
    .match(/^(\d{1,6})(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}
const fromCents = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2));

/** People and HR, pay rates: how each therapist is paid, from which date, and every change. */
export function PayRates({
  embedded = false,
}: {
  /** Inside People and HR, which brings its own title. */
  embedded?: boolean;
} = {}) {
  const { data, error, loading, reload } = useResource<PayRatesBoardDto>(
    "/api/care/hr/pay",
    (e) => e.type === "care",
  );
  const [method, setMethod] = useState<"" | PayMethod | "none">("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const missing = rows.filter((r) => !r.current);
  const shown = rows.filter(
    (r) =>
      (!method || (method === "none" ? !r.current : r.current?.method === method)) &&
      (!q || r.name.toLowerCase().includes(q.trim().toLowerCase())),
  );
  const count = (m: PayMethod) => rows.filter((r) => r.current?.method === m).length;
  const selected = rows.find((r) => r.therapistId === open) ?? null;

  return (
    <>
      {!embedded && (
        <PageHeader
          eyebrow="People and HR"
          title="Pay rates"
          description="How each therapist is paid, from which date, and every change that was made."
          actions={<LiveBadge />}
        />
      )}
      {error && !data ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-96" />
        </div>
      ) : data ? (
        <div className="flex flex-col gap-5">
          {missing.length > 0 && (
            <section
              role="status"
              className="flex flex-wrap items-center gap-3 rounded-card border border-over bg-over-bg px-5 py-3.5 text-small text-over"
            >
              <RuleMark>Rule</RuleMark>
              <span className="flex-1 font-semibold">
                {missing.length === 1
                  ? "1 therapist has no pay rate."
                  : `${missing.length} therapists have no pay rate.`}{" "}
                <span className="font-normal">
                  Their earnings show &ldquo;Pay rate not set&rdquo; until one is added.
                </span>
              </span>
              <Button size="sm" onClick={() => setMethod("none")}>
                Show them
              </Button>
            </section>
          )}
          <MetricBand
            size="stat-sm"
            label="Pay methods"
            metrics={[
              { label: "Therapists", value: rows.length, caption: "Active clinicians" },
              {
                label: "Per appointment",
                value: count("per-appointment"),
                caption: "Fixed fee per visit",
              },
              { label: "Hourly", value: count("hourly"), caption: "From approved timesheets" },
              {
                label: "Revenue share",
                value: count("revenue-share"),
                caption: "Share of what was billed",
              },
              {
                label: "No pay rate",
                value: missing.length,
                caption: "Earnings can't be shown",
                tone: "over",
                flagged: missing.length > 0,
              },
            ]}
          />
          <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3">
            <span className="mr-1 label-caps text-ink-500">Filter</span>
            <div className="w-48 flex-none">
              <Select
                aria-label="Pay method"
                className="h-9"
                value={method}
                onChange={(e) => setMethod(e.target.value as typeof method)}
              >
                <option value="">Any pay method</option>
                {payMethods.map((m) => (
                  <option key={m} value={m}>
                    {payMethodLabel[m]}
                  </option>
                ))}
                <option value="none">No pay rate</option>
              </Select>
            </div>
            <span className="ml-auto text-caption text-ink-500">
              {data.canManage
                ? "You can set pay rates. Every change is audited."
                : "View only. A Finance Manager or the Super Admin sets pay rates."}
            </span>
            <label className="flex h-9 w-64 max-w-full items-center gap-2 rounded-control border border-border-strong bg-surface px-3 focus-within:shadow-focus">
              <Search className="size-4 text-ink-500" aria-hidden="true" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Find a therapist"
                aria-label="Find a therapist"
                className="min-w-0 flex-1 bg-transparent text-small outline-none placeholder:text-ink-500"
              />
            </label>
          </div>
          {shown.length === 0 ? (
            <EmptyNote title="No therapist matches these filters." />
          ) : (
            <TableFrame>
              <table className="table-stack w-full text-left text-small md:min-w-240">
                <thead className="sticky top-0 border-b border-border bg-sunken text-caption text-ink-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Therapist</th>
                    <th className="px-4 py-3 font-medium">Pay method</th>
                    <th className="px-4 py-3 font-medium">Current rate</th>
                    <th className="px-4 py-3 font-medium">Late cancellation and Did not attend</th>
                    <th className="px-4 py-3 font-medium">From</th>
                    <th className="px-4 py-3 font-medium">Next change</th>
                    <th className="px-4 py-3 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {shown.map((r) => (
                    <tr key={r.therapistId} className="hover:bg-sunken/60">
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-3">
                          <Avatar name={r.name} size={32} kind="staff" src={r.photo} />
                          <span>
                            <span className="block font-semibold text-ink-900">{r.name}</span>
                            <span className="text-caption text-ink-500">{r.discipline}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3" data-label="Pay method">
                        {r.current ? (
                          <Tag tone="outline">{payMethodLabel[r.current.method]}</Tag>
                        ) : (
                          <Tag tone="over">Pay rate not set</Tag>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-900" data-label="Current rate">
                        {r.current?.summary ?? "—"}
                        {r.unpaidVisits > 0 && (
                          <span className="block text-caption text-over">
                            {r.unpaidVisits} recent {r.unpaidVisits === 1 ? "visit" : "visits"}{" "}
                            without a rate
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-700" data-label="Cancellations">
                        {r.current ? cancellationPayLabel[r.current.cancellation] : "—"}
                      </td>
                      <td className="px-4 py-3 text-ink-700" data-label="From">
                        {r.current ? dayText(r.current.effectiveFrom) : "—"}
                      </td>
                      <td className="px-4 py-3 text-ink-700" data-label="Next change">
                        {r.upcoming ? (
                          <span>
                            {r.upcoming.summary}
                            <span className="block text-caption text-ink-500">
                              from {dayText(r.upcoming.effectiveFrom)}
                            </span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" onClick={() => setOpen(r.therapistId)}>
                          {data.canManage ? (r.current ? "Change" : "Set rate") : "History"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableFrame>
          )}
        </div>
      ) : null}
      {selected && data && (
        <RateSheet
          row={selected}
          today={data.today}
          canManage={data.canManage}
          onClose={() => setOpen(null)}
          onSaved={reload}
        />
      )}
    </>
  );
}

function RateSheet({
  row,
  today,
  canManage,
  onClose,
  onSaved,
}: {
  row: PayRatesRowDto;
  today: string;
  canManage: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const start = row.upcoming ?? row.current;
  const first = row.history.every((h) => h.state === "Withdrawn");
  const [method, setMethod] = useState<PayMethod>(start?.method ?? "per-appointment");
  const [inPerson, setInPerson] = useState(fromCents(start?.inPersonCents ?? null));
  const [telehealth, setTelehealth] = useState(fromCents(start?.telehealthCents ?? null));
  const [hourly, setHourly] = useState(fromCents(start?.hourlyCents ?? null));
  const [share, setShare] = useState(start?.sharePercent?.toString() ?? "");
  const [cancellation, setCancellation] = useState<CancellationPay>(start?.cancellation ?? "half");
  const [from, setFrom] = useState(today);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [withdraw, setWithdraw] = useState<PayRateDto | null>(null);

  const methodOptions = payMethods.map((m) => payMethodLabel[m]);
  const cancelOptions = cancellationPays.map((c) => cancellationPayLabel[c]);

  const build = () => {
    const common = { cancellation, effectiveFrom: from, note };
    if (method === "per-appointment")
      return {
        method,
        inPersonCents: toCents(inPerson) ?? Number.NaN,
        telehealthCents: toCents(telehealth) ?? Number.NaN,
        ...common,
      };
    if (method === "hourly")
      return { method, hourlyCents: toCents(hourly) ?? Number.NaN, ...common };
    return { method, sharePercent: share.trim() ? Number(share) : Number.NaN, ...common };
  };
  const preview = () => {
    const r = build();
    if (r.method === "per-appointment" && Number.isFinite(r.inPersonCents))
      return `A completed in-person visit pays ${centsLabel(r.inPersonCents)}; telehealth ${Number.isFinite(r.telehealthCents) ? centsLabel(r.telehealthCents) : "—"}.`;
    if (r.method === "hourly" && Number.isFinite(r.hourlyCents))
      return `A 60-minute visit pays ${centsLabel(r.hourlyCents)}, a 45-minute visit ${centsLabel(Math.round((r.hourlyCents * 45) / 60))}.`;
    if (r.method === "revenue-share" && Number.isFinite(r.sharePercent))
      return `A visit billed at $193.99 pays ${centsLabel(Math.round(19399 * r.sharePercent) / 100)}.`;
    return "Enter the amounts to see what a visit pays.";
  };

  const save = async () => {
    const parsed = payRateInputSchema.safeParse(build());
    const next: Record<string, string> = {};
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        next[String(issue.path[0] ?? "form")] ??= issue.message;
    if (!from) next.effectiveFrom = "Choose a start date";
    else if (!first && from < today) next.effectiveFrom = "A new rate starts today or later";
    setErrors(next);
    if (!parsed.success || Object.keys(next).length) return;
    setBusy(true);
    try {
      await api("/api/care/hr/pay", {
        body: {
          type: "set",
          therapistId: row.therapistId,
          basedOnSeq: row.latestSeq,
          rate: parsed.data,
        },
      });
      toast(`Pay rate saved for ${row.name}`, { detail: `From ${dayText(from)}` });
      onSaved();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save the pay rate.", { tone: "error" });
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const doWithdraw = async (r: PayRateDto) => {
    setBusy(true);
    try {
      await api("/api/care/hr/pay", { body: { type: "withdraw", rateId: r.id } });
      toast("Upcoming rate withdrawn");
      onSaved();
      setWithdraw(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't withdraw the rate.", { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={canManage ? `Pay rate: ${row.name}` : `Pay history: ${row.name}`}
      description={`${row.discipline}. Past visits always keep the rate that applied on the day.`}
      onClose={onClose}
      footer={
        canManage ? (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save rate"}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-6">
        {canManage && (
          <section className="flex flex-col gap-4" aria-label="New rate">
            {Object.keys(errors).length > 0 && (
              <p role="alert" className="rounded-control bg-over-bg px-3 py-2 text-small text-over">
                Check the highlighted fields.
              </p>
            )}
            <Choice
              label="Pay method"
              options={methodOptions}
              value={payMethodLabel[method]}
              onChange={(label) =>
                setMethod(payMethods.find((m) => payMethodLabel[m] === label) ?? "per-appointment")
              }
            />
            {method === "per-appointment" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="In-person fee ($)"
                  required
                  value={inPerson}
                  onChange={setInPerson}
                  placeholder="90.00"
                  error={errors.inPersonCents}
                />
                <TextField
                  label="Telehealth fee ($)"
                  required
                  value={telehealth}
                  onChange={setTelehealth}
                  placeholder="75.00"
                  error={errors.telehealthCents}
                />
              </div>
            )}
            {method === "hourly" && (
              <TextField
                label="Hourly rate ($)"
                required
                value={hourly}
                onChange={setHourly}
                placeholder="55.00"
                hint="Paid on the visit's minutes, once the week's timesheet is approved."
                error={errors.hourlyCents}
              />
            )}
            {method === "revenue-share" && (
              <TextField
                label="Share of what was billed (%)"
                required
                value={share}
                onChange={setShare}
                placeholder="60"
                hint="Of the visit's billed amount, excluding GST and travel."
                error={errors.sharePercent}
              />
            )}
            <Choice
              label="Late cancellation and Did not attend"
              options={cancelOptions}
              value={cancellationPayLabel[cancellation]}
              onChange={(label) =>
                setCancellation(
                  cancellationPays.find((c) => cancellationPayLabel[c] === label) ?? "half",
                )
              }
              hint="What the therapist receives when a patient cancels late or doesn't attend."
            />
            <DateField
              label="Effective from"
              required
              value={from}
              onChange={setFrom}
              error={errors.effectiveFrom}
              hint={
                first
                  ? "A first rate can start in the past, so earlier visits are paid."
                  : "Today or later. Visits before this date keep their old rate."
              }
            />
            <TextArea
              label="Reason for the change"
              value={note}
              onChange={setNote}
              rows={2}
              maxLength={300}
            />
            <p className="flex items-start gap-2 rounded-control bg-sunken px-3 py-2.5 text-small text-ink-700">
              <Wallet className="mt-0.5 size-4 flex-none text-ink-500" aria-hidden="true" />
              {preview()}
            </p>
          </section>
        )}
        <section aria-label="Rate history">
          <h3 className="mb-2 flex items-center gap-2 text-section font-semibold text-ink-900">
            <History className="size-4 text-ink-500" aria-hidden="true" /> History
          </h3>
          {row.history.length === 0 ? (
            <EmptyNote title="No pay rate has been set yet." />
          ) : (
            <ol className="divide-y divide-border rounded-card border border-border">
              {row.history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink-900">
                      {payMethodLabel[h.method]} · {h.summary}
                    </p>
                    <p className="text-caption text-ink-500">
                      From {dayText(h.effectiveFrom)} · cancellations{" "}
                      {cancellationPayLabel[h.cancellation].toLowerCase()} · set by{" "}
                      {h.createdByName}, {shortDate(h.createdAt)}
                      {h.withdrawnAt ? ` · withdrawn ${shortDate(h.withdrawnAt)}` : ""}
                    </p>
                    {h.note && <p className="mt-1 text-small text-ink-700">{h.note}</p>}
                  </div>
                  <Tag tone={STATE_TONE[h.state]}>{h.state}</Tag>
                  {canManage && h.state === "Upcoming" && (
                    <Button size="sm" variant="soft-danger" onClick={() => setWithdraw(h)}>
                      Withdraw
                    </Button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
      {withdraw && (
        <ConfirmDialog
          title="Withdraw this upcoming rate?"
          confirmLabel="Withdraw rate"
          danger
          busy={busy}
          onConfirm={() => doWithdraw(withdraw)}
          onClose={() => setWithdraw(null)}
        >
          {withdraw.summary}, due to start {dayText(withdraw.effectiveFrom)}, won&rsquo;t apply. It
          stays in the history as withdrawn.
        </ConfirmDialog>
      )}
    </Sheet>
  );
}
