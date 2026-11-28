"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  Layers,
  Users,
  Download,
  Filter,
  Search,
  X,
} from "lucide-react";
import { KpiLabel } from "@/components/ui/kpi-icon";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Select } from "@/components/ui/select";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { useResource } from "@/lib/live/client";
import {
  ageingBuckets,
  aud,
  datePresets,
  fundingPaths,
  invoiceStatuses07,
  reportGroupings,
  round2,
  type FinanceHubDto,
} from "@/lib/live/finance";
import { cn } from "@/lib/cn";
import { ErrorNote, LiveBadge, Skeleton } from "./bits";
import { TherapistEarnings } from "./finance-earnings";
import { FCard } from "./funding-bits";
import {
  dayLabel,
  filterInvoices,
  filterLines,
  pathChip,
  td,
  th,
  useFinanceFilters,
  type Filters,
} from "./finance-bits";
import {
  AdjustmentsTab,
  ClaimsTab,
  InvoicesTab,
  PaymentsTab,
  ReconTab,
  RulesTab,
} from "./finance-ledger";
import { QueueTab } from "./finance-queue";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "queue", label: "Billable queue" },
  { id: "invoices", label: "Invoices" },
  { id: "claims", label: "Claims" },
  { id: "payments", label: "Payments" },
  { id: "reconciliation", label: "Reconciliation" },
  { id: "adjustments", label: "Credits and adjustments" },
  { id: "rules", label: "Rates and rules" },
  { id: "reports", label: "Reports" },
] as const;
export type FinanceTab = (typeof tabs)[number]["id"];

/** Module 07: billing and financial management. Claims and payments are simulated (AC-39). */
export function FinanceHub() {
  const { data, error, loading, reload } = useResource<{ hub: FinanceHubDto }>(
    "/api/care/billing",
    (e) => e.type === "care",
  );
  const [tab, setTab] = useTab(tabs);
  const today = data?.hub.today ?? new Date().toISOString().slice(0, 10);
  const [f, setF] = useFinanceFilters(today);
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-[640px]" />;
  const hub = data.hub;
  const count = (id: FinanceTab) => {
    if (id === "queue")
      return hub.billables.filter((b) =>
        ["Pending verification", "Ready", "Held", "Captured"].includes(b.status),
      ).length;
    if (id === "claims") return hub.claims.filter((c) => !["Closed"].includes(c.status)).length;
    if (id === "reconciliation")
      return hub.statement.filter((s) => s.status === "Unmatched" || s.status === "Suggested")
        .length;
    if (id === "adjustments")
      return hub.adjustments.filter((a) => ["Requested", "Reviewed", "Approved"].includes(a.status))
        .length;
    if (id === "payments")
      return hub.payments.filter((p) => p.unapplied > 0 && p.status !== "Reversed").length;
    return 0;
  };
  const tabList = tabs.map((t) => ({
    ...t,
    count: count(t.id) || undefined,
    alert: ["queue", "reconciliation", "adjustments"].includes(t.id),
  }));
  const go = (t: FinanceTab, patch: Partial<Filters> = {}) => {
    setF(patch);
    setTab(t);
  };

  return (
    <>
      <PageHeader
        eyebrow="Live care"
        title="Billing and finance"
        actions={
          <div className="flex items-center gap-3">
            <span className="hidden text-caption text-ink-500 lg:inline">
              {hub.can.manager
                ? "Finance Manager"
                : hub.can.officer
                  ? "Finance Officer"
                  : "View only"}{" "}
              · claims and payments are simulated
            </span>
            <LiveBadge />
          </div>
        }
      />
      <FilterBar hub={hub} f={f} setF={setF} />
      <div className="mt-4">
        <Tabs label="Finance" tabs={tabList} value={tab} onChange={(t: FinanceTab) => setTab(t)} />
      </div>
      <TabPanel id="overview" value={tab}>
        <Overview hub={hub} f={f} go={go} />
      </TabPanel>
      <TabPanel id="queue" value={tab}>
        <QueueTab hub={hub} f={f} onDone={reload} />
      </TabPanel>
      <TabPanel id="invoices" value={tab}>
        <InvoicesTab hub={hub} f={f} />
      </TabPanel>
      <TabPanel id="claims" value={tab}>
        <ClaimsTab hub={hub} onDone={reload} />
      </TabPanel>
      <TabPanel id="payments" value={tab}>
        <PaymentsTab hub={hub} onDone={reload} />
      </TabPanel>
      <TabPanel id="reconciliation" value={tab}>
        <ReconTab hub={hub} onDone={reload} />
      </TabPanel>
      <TabPanel id="adjustments" value={tab}>
        <AdjustmentsTab hub={hub} onDone={reload} />
      </TabPanel>
      <TabPanel id="rules" value={tab}>
        <RulesTab hub={hub} onDone={reload} />
      </TabPanel>
      <TabPanel id="reports" value={tab}>
        <Reports hub={hub} f={f} />
      </TabPanel>
    </>
  );
}

/* ------------------------------------------------------------------ filters */

function FilterBar({
  hub,
  f,
  setF,
}: {
  hub: FinanceHubDto;
  f: Filters;
  setF: (p: Partial<Filters>) => void;
}) {
  const active = Boolean(
    f.service ||
    f.payer ||
    f.therapist ||
    f.status ||
    f.search ||
    f.preset !== "This Financial Year",
  );
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-lift">
      <Filter className="ml-1 size-4 text-ink-500" aria-hidden="true" />
      <div className="w-44 flex-none">
        <Select
          aria-label="Date range"
          className="h-9"
          value={f.preset}
          onChange={(e) => setF({ preset: e.target.value as Filters["preset"] })}
        >
          {datePresets.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </Select>
      </div>
      {f.preset === "Custom" && (
        <>
          <input
            type="date"
            aria-label="From"
            value={f.from}
            onChange={(e) => setF({ from: e.target.value })}
            className="h-9 rounded-control border border-border-strong px-2 text-small"
          />
          <input
            type="date"
            aria-label="To"
            value={f.to}
            onChange={(e) => setF({ to: e.target.value })}
            className="h-9 rounded-control border border-border-strong px-2 text-small"
          />
        </>
      )}
      <div className="w-48 flex-none">
        <Select
          aria-label="Service"
          className="h-9"
          value={f.service}
          onChange={(e) => setF({ service: e.target.value })}
        >
          <option value="">All services</option>
          {hub.services.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      </div>
      <div className="w-44 flex-none">
        <Select
          aria-label="Payer"
          className="h-9"
          value={f.payer}
          onChange={(e) => setF({ payer: e.target.value })}
        >
          <option value="">All payers</option>
          {fundingPaths.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </Select>
      </div>
      <div className="w-44 flex-none">
        <Select
          aria-label="Therapist"
          className="h-9"
          value={f.therapist}
          onChange={(e) => setF({ therapist: e.target.value })}
        >
          <option value="">All therapists</option>
          {hub.clinicians.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      </div>
      <div className="w-44 flex-none">
        <Select
          aria-label="Invoice status"
          className="h-9"
          value={f.status}
          onChange={(e) => setF({ status: e.target.value })}
        >
          <option value="">All statuses</option>
          {[...invoiceStatuses07, "Overdue"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      </div>
      <label className="flex h-9 min-w-56 flex-1 items-center gap-2 rounded-control border border-border-strong bg-surface px-3 focus-within:shadow-focus">
        <Search className="size-4 text-ink-500" aria-hidden="true" />
        <input
          value={f.search}
          onChange={(e) => setF({ search: e.target.value })}
          aria-label="Search finance"
          placeholder="Search number, participant, payer"
          className="min-w-0 flex-1 bg-transparent text-small outline-none placeholder:text-ink-500"
        />
      </label>
      {active && (
        <button
          type="button"
          onClick={() =>
            setF({
              preset: "This Financial Year",
              service: "",
              payer: "",
              therapist: "",
              status: "",
              search: "",
            })
          }
          className="inline-flex h-9 cursor-pointer items-center gap-1 px-2 text-small font-semibold text-accent"
        >
          <X className="size-3.5" aria-hidden="true" /> Clear
        </button>
      )}
      <span className="w-full text-caption text-ink-500">
        {dayLabel(f.from)} to {dayLabel(f.to)}. Figures below use only the records these filters
        show.
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ overview */

function Overview({
  hub,
  f,
  go,
}: {
  hub: FinanceHubDto;
  f: Filters;
  go: (t: FinanceTab, p?: Partial<Filters>) => void;
}) {
  const invoices = filterInvoices(hub.invoices, { ...f, status: "" }, hub);
  const lines = filterLines(hub.billables, f);
  const open = invoices.filter(
    (i) => ["Issued", "Part-Paid", "Disputed"].includes(i.status) && i.balance > 0,
  );
  const overdue = open.filter((i) => i.overdue);
  const unbilled = lines.filter((l) =>
    ["Pending verification", "Ready", "Captured"].includes(l.status),
  );
  const issued = invoices.filter((i) => i.issuedAt && i.status !== "Voided");
  const revenue = round2(issued.reduce((s, i) => s + i.total, 0));
  const claimExceptions = hub.claims.filter(
    (c) => c.status === "Rejected" || (c.status !== "Closed" && c.checks.length > 0),
  );
  const unapplied = hub.payments.filter((p) => p.unapplied > 0 && p.status !== "Reversed");
  const unmatched = hub.statement.filter(
    (s) => s.status === "Unmatched" || s.status === "Suggested",
  );
  const mix = new Map<string, number>();
  for (const i of issued) mix.set(String(i.path), (mix.get(String(i.path)) ?? 0) + i.total);
  const mixTotal = [...mix.values()].reduce((s, v) => s + v, 0) || 1;

  // Six months of invoiced (by issue month) and collected (by payment month).
  const months = Array.from({ length: 6 }, (_, k) => {
    const d = new Date(`${hub.today.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - (5 - k));
    return d.toISOString().slice(0, 7);
  });
  const trend = months.map((m) => ({
    month: m,
    invoiced: round2(
      issued.filter((i) => i.issuedAt?.slice(0, 7) === m).reduce((s, i) => s + i.total, 0),
    ),
    collected: round2(
      hub.payments
        .filter((p) => p.status !== "Reversed" && p.receivedOn.slice(0, 7) === m)
        .reduce((s, p) => s + p.allocated, 0),
    ),
  }));
  const peak = Math.max(1, ...trend.flatMap((t) => [t.invoiced, t.collected]));
  const pipeline = [
    {
      label: "Pending verification",
      n: lines.filter((l) => l.status === "Pending verification" || l.status === "Captured").length,
      tab: "queue" as const,
    },
    {
      label: "Ready to bill",
      n: lines.filter((l) => l.status === "Ready").length,
      tab: "queue" as const,
    },
    { label: "Held", n: lines.filter((l) => l.status === "Held").length, tab: "queue" as const },
    {
      label: "Draft or awaiting approval",
      n: invoices.filter((i) => ["Draft", "Pending Approval", "Approved"].includes(i.status))
        .length,
      tab: "invoices" as const,
    },
    { label: "Issued and open", n: open.length, tab: "invoices" as const },
    {
      label: "Paid or credited",
      n: invoices.filter((i) => ["Paid", "Credited"].includes(i.status)).length,
      tab: "invoices" as const,
    },
    {
      label: "Claims in progress",
      n: hub.claims.filter((c) => c.status !== "Closed").length,
      tab: "claims" as const,
    },
  ];
  const pipePeak = Math.max(1, ...pipeline.map((p) => p.n));
  const ageing = ageingBuckets.map((b) => {
    const inv = open.filter((i) => i.ageing === b);
    return { bucket: b, n: inv.length, amount: round2(inv.reduce((s, i) => s + i.balance, 0)) };
  });
  const ageTotal = ageing.reduce((s, a) => s + a.amount, 0) || 1;
  const byParticipant = new Map<string, { name: string; balance: number; count: number }>();
  for (const i of open) {
    const cur = byParticipant.get(i.clientId) ?? { name: i.participant, balance: 0, count: 0 };
    cur.balance = round2(cur.balance + i.balance);
    cur.count += 1;
    byParticipant.set(i.clientId, cur);
  }
  const top = [...byParticipant.values()].sort((a, b) => b.balance - a.balance).slice(0, 6);
  const activity = [
    ...hub.invoices.flatMap((i) =>
      i.history.slice(0, 2).map((h) => ({
        at: h.at,
        text: `${i.number} ${h.status.toLowerCase()}`,
        sub: `${i.participant} · ${aud(i.total)} · ${h.by}`,
      })),
    ),
    ...hub.payments.map((p) => ({
      at: `${p.receivedOn}T12:00:00+10:00`,
      text: `${p.ref} received ${aud(p.amount)}`,
      sub: `${p.payer} · ${p.method} · ${p.status}`,
    })),
    ...hub.claims.map((c) => ({
      at: c.history[0]?.at ?? c.createdAt,
      text: `${c.ref} ${c.status.toLowerCase()}`,
      sub: `${c.participant} · ${aud(c.total)} (simulated claim)`,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 9);

  const kpis = [
    {
      label: "Outstanding",
      value: aud(open.reduce((s, i) => s + i.balance, 0)),
      sub: `${open.length} open invoice${open.length === 1 ? "" : "s"}`,
      onClick: () => go("invoices", { status: "" }),
    },
    {
      label: "Overdue",
      value: aud(overdue.reduce((s, i) => s + i.balance, 0)),
      sub: `${overdue.length} past the due date`,
      tone: overdue.length ? "over" : undefined,
      onClick: () => go("invoices", { status: "Overdue" }),
    },
    {
      label: "Claim exceptions",
      value: String(claimExceptions.length),
      sub: "rejected or missing details",
      tone: claimExceptions.length ? "watch" : undefined,
      onClick: () => go("claims"),
    },
    {
      label: "Unbilled services",
      value: aud(unbilled.reduce((s, l) => s + l.amounts.total, 0)),
      sub: `${unbilled.length} line${unbilled.length === 1 ? "" : "s"} not invoiced or claimed`,
      onClick: () => go("queue"),
    },
    {
      label: "Awaiting matching",
      value: aud(unapplied.reduce((s, p) => s + p.unapplied, 0)),
      sub: `${unapplied.length} payment(s), ${unmatched.length} bank line(s)`,
      onClick: () => go(unmatched.length ? "reconciliation" : "payments"),
    },
    {
      label: "Invoiced revenue",
      value: aud(revenue),
      sub: `${issued.length} issued in range · basis: issued invoices`,
      onClick: () => go("reports"),
    },
  ] as const;
  const panel = "flex h-[380px] flex-col";

  return (
    <>
      <section
        className="grid gap-px overflow-hidden rounded-card border border-border bg-border shadow-lift sm:grid-cols-2 xl:grid-cols-6"
        aria-label="Finance figures"
      >
        {kpis.map((k) => (
          <button
            key={k.label}
            type="button"
            onClick={k.onClick}
            className="group flex cursor-pointer flex-col gap-1 bg-surface px-5 py-4 text-left transition-colors hover:bg-canvas"
          >
            <span className="flex items-center justify-between gap-2">
              <KpiLabel
                label={k.label}
                tone={"tone" in k && (k.tone === "over" || k.tone === "watch") ? k.tone : undefined}
              />
              <ArrowUpRight
                className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden="true"
              />
            </span>
            <span
              className={cn(
                "type-display text-h2 leading-tight",
                "tone" in k && k.tone === "over"
                  ? "text-over"
                  : "tone" in k && k.tone === "watch"
                    ? "text-watch"
                    : "text-ink-900",
              )}
            >
              {k.value}
            </span>
            <span className="text-caption text-ink-500">{k.sub}</span>
          </button>
        ))}
      </section>

      <div className="grid items-stretch gap-6 xl:grid-cols-12">
        <FCard
          icon={BarChart3}
          title="Invoiced and collected"
          sub="Last six months · issued invoices and allocated payments"
          className={cn("xl:col-span-8", panel)}
          flush
        >
          <div className="flex h-[300px] flex-col px-5 pt-4 pb-3">
            <div className="flex items-center gap-4 text-caption text-ink-700">
              <span className="inline-flex items-center gap-1.5">
                <i className="size-2.5 rounded-[3px] bg-accent-fill" aria-hidden="true" /> Invoiced
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="size-2.5 rounded-[3px] bg-available-dot" aria-hidden="true" />{" "}
                Collected
              </span>
            </div>
            <div className="mt-3 grid min-h-0 flex-1 grid-cols-6 items-end gap-4 border-b border-border">
              {trend.map((t) => (
                <div key={t.month} className="group flex h-full items-end justify-center gap-1.5">
                  <div
                    className="w-5 rounded-t-[4px] bg-accent-fill transition-all duration-500 group-hover:opacity-90"
                    style={{ height: `${Math.max(2, (t.invoiced / peak) * 100)}%` }}
                    title={`Invoiced ${aud(t.invoiced)}`}
                  />
                  <div
                    className="w-5 rounded-t-[4px] bg-available-dot transition-all duration-500 group-hover:opacity-90"
                    style={{ height: `${Math.max(2, (t.collected / peak) * 100)}%` }}
                    title={`Collected ${aud(t.collected)}`}
                  />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-6 gap-4 pt-2 text-center">
              {trend.map((t) => (
                <div key={t.month}>
                  <p className="text-caption font-semibold text-ink-900">
                    {new Date(`${t.month}-01T00:00:00Z`).toLocaleDateString("en-AU", {
                      month: "short",
                      timeZone: "UTC",
                    })}
                  </p>
                  <p className="text-label text-ink-500">{aud(t.invoiced)}</p>
                </div>
              ))}
            </div>
          </div>
        </FCard>

        <FCard
          icon={CircleDollarSign}
          title="Payer mix"
          sub="Issued invoices in range, by funding path"
          className={cn("xl:col-span-4", panel)}
        >
          {mix.size === 0 ? (
            <p className="py-6 text-center text-small text-ink-500">
              No issued invoices in this range.
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {[...mix.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([path, v]) => (
                  <li key={path}>
                    <p className="mb-1 flex items-center justify-between text-small">
                      <span
                        className={cn(
                          "rounded-tag px-2 py-0.5 text-caption font-semibold",
                          pathChip(path),
                        )}
                      >
                        {path}
                      </span>
                      <span className="font-semibold text-ink-900">
                        {aud(v)}{" "}
                        <span className="font-normal text-ink-500">
                          · {Math.round((v / mixTotal) * 100)}%
                        </span>
                      </span>
                    </p>
                    <div className="h-2 overflow-hidden rounded-full bg-sunken">
                      <div
                        className="h-full rounded-full bg-accent-fill transition-all duration-500"
                        style={{ width: `${(v / mixTotal) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </FCard>

        <FCard
          icon={AlertTriangle}
          title="Needs attention"
          sub="Exceptions and notifications"
          className={cn("xl:col-span-5", panel)}
          flush
        >
          {hub.alerts.length === 0 ? (
            <p className="px-5 py-8 text-center text-small text-ink-500">
              Nothing needs attention.
            </p>
          ) : (
            <ul className="h-[300px] divide-y divide-border overflow-auto">
              {hub.alerts.map((a) => (
                <li key={a.key}>
                  <a
                    href={a.href}
                    className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-canvas hover:no-underline"
                  >
                    <span
                      className={cn(
                        "mt-1.5 size-2.5 flex-none rounded-full",
                        a.severity === "high"
                          ? "bg-over-dot"
                          : a.severity === "medium"
                            ? "bg-watch-dot"
                            : "bg-ink-400",
                      )}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-small font-semibold text-ink-900">{a.title}</span>
                      <span className="block truncate text-caption text-ink-500">{a.detail}</span>
                    </span>
                    <ArrowUpRight className="mt-1 size-4 text-accent" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </FCard>

        <FCard
          icon={Layers}
          title="Billing pipeline"
          sub="From delivered service to paid"
          className={cn("xl:col-span-4", panel)}
        >
          <ul className="flex flex-col gap-2.5">
            {pipeline.map((p) => (
              <li key={p.label}>
                <button
                  type="button"
                  onClick={() => go(p.tab)}
                  className="group w-full cursor-pointer text-left"
                >
                  <span className="mb-1 flex items-center justify-between text-caption">
                    <span className="text-ink-700 group-hover:text-accent">{p.label}</span>
                    <span className="font-semibold text-ink-900">{p.n}</span>
                  </span>
                  <span className="block h-1.5 overflow-hidden rounded-full bg-sunken">
                    <span
                      className="block h-full rounded-full bg-accent-fill transition-all duration-500"
                      style={{ width: `${(p.n / pipePeak) * 100}%` }}
                    />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </FCard>

        <FCard
          icon={CalendarClock}
          title="Ageing"
          sub="Open balances by days past due"
          className={cn("xl:col-span-3", panel)}
        >
          <ul className="flex flex-col gap-3">
            {ageing.map((a) => (
              <li key={a.bucket}>
                <p className="mb-1 flex items-center justify-between text-caption">
                  <span className="text-ink-700">{a.bucket}</span>
                  <span
                    className={cn(
                      "font-semibold",
                      a.bucket !== "Current" && a.amount > 0 ? "text-over" : "text-ink-900",
                    )}
                  >
                    {aud(a.amount)}
                  </span>
                </p>
                <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      a.bucket === "Current"
                        ? "bg-healthy-dot"
                        : a.bucket === "1–30 days"
                          ? "bg-watch-dot"
                          : "bg-over-dot",
                    )}
                    style={{ width: `${(a.amount / ageTotal) * 100}%` }}
                  />
                </div>
                <p className="mt-0.5 text-label text-ink-500">
                  {a.n} invoice{a.n === 1 ? "" : "s"}
                </p>
              </li>
            ))}
          </ul>
        </FCard>

        <FCard
          icon={Clock3}
          title="Recent activity"
          sub="Invoices, payments and claims"
          className={cn("xl:col-span-7", panel)}
          flush
        >
          <ol className="relative mx-5 my-3 h-[290px] overflow-auto border-l border-border pl-5">
            {activity.map((a, i) => (
              <li key={`${a.at}-${i}`} className="bubble-in relative py-1.5">
                <span
                  aria-hidden="true"
                  className="absolute top-3 -left-[25px] size-2 rounded-full border-2 border-surface bg-accent-fill"
                />
                <p className="text-small font-semibold text-ink-900">{a.text}</p>
                <p className="text-caption text-ink-500">
                  {a.sub} ·{" "}
                  {new Date(a.at).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                    timeZone: "Australia/Brisbane",
                  })}
                </p>
              </li>
            ))}
          </ol>
        </FCard>

        <FCard
          icon={Users}
          title="Largest open balances"
          sub="By participant"
          className={cn("xl:col-span-5", panel)}
          flush
        >
          {top.length === 0 ? (
            <p className="px-5 py-8 text-center text-small text-ink-500">No open balances.</p>
          ) : (
            <ul className="divide-y divide-border">
              {top.map((t) => (
                <li key={t.name} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex size-8 flex-none items-center justify-center rounded-full bg-accent-tint text-caption font-semibold text-accent">
                    {t.name
                      .split(" ")
                      .map((x) => x[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-small font-semibold text-ink-900">
                      {t.name}
                    </span>
                    <span className="text-caption text-ink-500">
                      {t.count} open invoice{t.count === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="text-small font-semibold text-ink-900">{aud(t.balance)}</span>
                </li>
              ))}
            </ul>
          )}
        </FCard>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ reports */

function Reports({ hub, f }: { hub: FinanceHubDto; f: Filters }) {
  const [group, setGroup] = useState<(typeof reportGroupings)[number]>("Payer");
  const invoices = filterInvoices(hub.invoices, { ...f, status: "" }, hub).filter(
    (i) => i.issuedAt && i.status !== "Voided",
  );
  const lines = filterLines(hub.billables, f);
  const keyOf = useMemo(
    () =>
      (l: {
        date: string;
        path: string;
        discipline: string;
        therapist: string;
        service: string;
        location: string;
      }) =>
        group === "Month"
          ? l.date.slice(0, 7)
          : group === "Payer"
            ? l.path
            : group === "Discipline"
              ? l.discipline
              : group === "Therapist"
                ? l.therapist
                : group === "Service"
                  ? l.service
                  : l.location,
    [group],
  );
  const rows = new Map<
    string,
    {
      invoiced: number;
      collected: number;
      outstanding: number;
      unbilled: number;
      credits: number;
      lines: number;
    }
  >();
  const add = (
    k: string,
    patch: Partial<{
      invoiced: number;
      collected: number;
      outstanding: number;
      unbilled: number;
      credits: number;
      lines: number;
    }>,
  ) => {
    const cur = rows.get(k) ?? {
      invoiced: 0,
      collected: 0,
      outstanding: 0,
      unbilled: 0,
      credits: 0,
      lines: 0,
    };
    for (const [kk, v] of Object.entries(patch)) cur[kk as keyof typeof cur] += v ?? 0;
    rows.set(k, cur);
  };
  for (const i of invoices) {
    const bills = hub.billables.filter((b) => b.invoice?.id === i.id);
    for (const l of i.lines) {
      const b = bills.find((x) => x.id === l.billableId);
      const share = i.total ? l.total / i.total : 0;
      const k = keyOf({
        date: l.date,
        path: String(i.path),
        discipline: l.discipline || b?.discipline || "Other",
        therapist: b?.therapist ?? l.description.split(" · ").at(-1) ?? "Other",
        service: l.description.split(" · ")[0] ?? "Other",
        location: b?.location ?? "Other",
      });
      add(k, {
        invoiced: l.total,
        collected: i.paid * share,
        outstanding: i.balance * share,
        credits: i.credited * share,
        lines: 1,
      });
    }
  }
  for (const l of lines.filter((x) =>
    ["Pending verification", "Ready", "Captured"].includes(x.status),
  )) {
    add(
      keyOf({
        date: l.start,
        path: l.path,
        discipline: l.discipline,
        therapist: l.therapist,
        service: l.support,
        location: l.location,
      }),
      { unbilled: l.amounts.total },
    );
  }
  const list = [...rows.entries()].sort((a, b) => b[1].invoiced - a[1].invoiced);
  const totals = list.reduce(
    (s, [, v]) => ({
      invoiced: s.invoiced + v.invoiced,
      collected: s.collected + v.collected,
      outstanding: s.outstanding + v.outstanding,
      unbilled: s.unbilled + v.unbilled,
      credits: s.credits + v.credits,
    }),
    { invoiced: 0, collected: 0, outstanding: 0, unbilled: 0, credits: 0 },
  );
  const ageing = ageingBuckets.map((b) => {
    const inv = invoices.filter((i) => i.ageing === b);
    return { bucket: b, count: inv.length, amount: round2(inv.reduce((s, i) => s + i.balance, 0)) };
  });
  const rate = totals.invoiced ? Math.round((totals.collected / totals.invoiced) * 1000) / 10 : 0;

  function exportCsv() {
    const head = [group, "Invoiced", "Collected", "Outstanding", "Credits", "Unbilled"];
    const body = list.map(([k, v]) =>
      [k, v.invoiced, v.collected, v.outstanding, v.credits, v.unbilled]
        .map((x) => (typeof x === "number" ? round2(x).toFixed(2) : `"${x}"`))
        .join(","),
    );
    const blob = new Blob([[head.join(","), ...body].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `finance-${group.toLowerCase()}-${f.from}-${f.to}.csv`;
    a.click();
  }

  return (
    <>
      <div className="grid gap-px overflow-hidden rounded-card border border-border bg-border shadow-lift sm:grid-cols-5">
        {[
          ["Invoiced", aud(totals.invoiced)],
          ["Collected", aud(totals.collected)],
          ["Collection rate", `${rate}%`],
          ["Outstanding", aud(totals.outstanding)],
          ["Unbilled", aud(totals.unbilled)],
        ].map(([k, v]) => (
          <div key={k} className="bg-surface px-5 py-4">
            <KpiLabel label={String(k)} />
            <p className="mt-1 type-display text-h2 text-ink-900">{v}</p>
          </div>
        ))}
      </div>
      <FCard
        icon={BarChart3}
        title={`By ${group.toLowerCase()}`}
        sub="Basis: issued invoices by service date, with payments and credits shared across their lines. Unbilled = captured, pending or ready lines not yet invoiced or claimed (held and rejected lines excluded), the same rule as the overview."
        flush
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-control border border-border-strong p-0.5">
              {reportGroupings.map((g) => (
                <button
                  key={g}
                  type="button"
                  aria-pressed={group === g}
                  onClick={() => setGroup(g)}
                  className={cn(
                    "h-7 cursor-pointer rounded-[6px] px-2.5 text-caption font-semibold",
                    group === g ? "bg-accent-fill text-on-accent" : "text-ink-700 hover:bg-canvas",
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
            <Button size="sm" variant="soft" onClick={exportCsv}>
              <Download className="size-3.5" aria-hidden="true" /> CSV
            </Button>
          </div>
        }
      >
        <table className="w-full text-left text-small">
          <thead className="border-b border-border text-caption text-ink-500">
            <tr>
              <th className={th}>{group}</th>
              <th className={cn(th, "text-right")}>Invoiced</th>
              <th className={cn(th, "text-right")}>Collected</th>
              <th className={cn(th, "text-right")}>Outstanding</th>
              <th className={cn(th, "text-right")}>Credits</th>
              <th className={cn(th, "text-right")}>Unbilled</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-500">
                  No records for these filters.
                </td>
              </tr>
            ) : (
              list.map(([k, v]) => (
                <tr key={k}>
                  <td className={cn(td, "font-semibold text-ink-900")}>{k}</td>
                  <td className={cn(td, "text-right")}>{aud(v.invoiced)}</td>
                  <td className={cn(td, "text-right")}>{aud(v.collected)}</td>
                  <td className={cn(td, "text-right")}>{aud(v.outstanding)}</td>
                  <td className={cn(td, "text-right")}>{aud(v.credits)}</td>
                  <td className={cn(td, "text-right")}>{aud(v.unbilled)}</td>
                </tr>
              ))
            )}
          </tbody>
          {list.length > 0 && (
            <tfoot className="border-t-2 border-border-strong font-semibold">
              <tr>
                <td className={td}>Total</td>
                <td className={cn(td, "text-right")}>{aud(totals.invoiced)}</td>
                <td className={cn(td, "text-right")}>{aud(totals.collected)}</td>
                <td className={cn(td, "text-right")}>{aud(totals.outstanding)}</td>
                <td className={cn(td, "text-right")}>{aud(totals.credits)}</td>
                <td className={cn(td, "text-right")}>{aud(totals.unbilled)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </FCard>
      <FCard
        icon={AlertTriangle}
        title="Ageing"
        sub="Open balances by days past the due date. A credit balance is never overdue debt."
        flush
      >
        <div className="grid gap-px bg-border sm:grid-cols-5">
          {ageing.map((a) => (
            <div key={a.bucket} className="bg-surface px-5 py-4">
              <p className="text-caption text-ink-500">{a.bucket}</p>
              <p
                className={cn(
                  "text-body font-semibold",
                  a.bucket !== "Current" && a.amount > 0 ? "text-over" : "text-ink-900",
                )}
              >
                {aud(a.amount)}
              </p>
              <p className="text-caption text-ink-500">
                {a.count} invoice{a.count === 1 ? "" : "s"}
              </p>
            </div>
          ))}
        </div>
      </FCard>
      <TherapistEarnings f={f} />
      <p className="text-caption text-ink-500">
        <Tag tone="outline">Note</Tag> Therapist utilisation is a scheduling metric (Modules 04 and
        05), not a revenue proxy.
      </p>
    </>
  );
}
