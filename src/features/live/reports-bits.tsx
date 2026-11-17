"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  Download,
  ExternalLink,
  Filter,
  Info,
  Minus,
  RotateCcw,
  Save,
  Search,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/live/client";
import { cn } from "@/lib/cn";
import { disciplines, regions, supports } from "@/lib/live/catalogue";
import {
  reportById,
  runReport,
  sortRows,
  type BuilderSpec,
  type Column,
  type ReportDef,
  type Row,
} from "@/lib/live/report-catalogue";
import {
  exportContents,
  exportFormats,
  type ExportContents,
  type ExportFormat,
  type ReportsHubDto,
} from "@/lib/live/report-dto";
import {
  appointmentModes,
  blankFilters,
  compareModes,
  datePresets,
  delta,
  filterSummary,
  formatValue,
  managementModes,
  presetRange,
  rangeError,
  runMetric,
  scoped,
  serviceSettings,
  shareScopes,
  timeGrains,
  type MetricResult,
  type ReportFacts,
  type ReportFilters,
  type ShareScope,
} from "@/lib/live/reports";

export const th = "px-3 py-2.5 text-left label-caps whitespace-nowrap text-ink-500";
export const td = "px-3 py-2.5 align-top text-small text-ink-900";

/* ------------------------------------------------------------------ context */

export type Ctx = {
  hub: ReportsHubDto;
  f: ReportFilters;
  facts: ReportFacts;
  names: Map<string, string>;
  run: (id: string) => MetricResult;
  reload: () => void;
  setF: (f: Partial<ReportFilters>) => void;
};

export function useReportCtx(
  hub: ReportsHubDto,
  f: ReportFilters,
  setF: Ctx["setF"],
  reload: () => void,
): Ctx {
  const names = useMemo(() => new Map(Object.entries(hub.names)), [hub.names]);
  const facts = useMemo(() => scoped(hub.facts, f, names), [hub.facts, f, names]);
  const ctx = useMemo(
    () => ({ today: hub.today, now: hub.now, earliest: hub.earliest }),
    [hub.today, hub.now, hub.earliest],
  );
  return { hub, f, facts, names, setF, reload, run: (id: string) => runMetric(id, facts, f, ctx) };
}

/* ------------------------------------------------------------------ filters (section 3) */

const KEY = "ms-report-filters";

/** Applied filters survive drilldown and back navigation in this tab (AT-46). */
export function useReportFilters(today: string) {
  const [f, set] = useState<ReportFilters>(() => blankFilters(today));
  useEffect(() => {
    const saved = sessionStorage.getItem(KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the applied filters once after mount
    if (saved) set({ ...blankFilters(today), ...(JSON.parse(saved) as Partial<ReportFilters>) });
  }, [today]);
  const update = (patch: Partial<ReportFilters>) =>
    set((cur) => {
      const next = { ...cur, ...patch };
      sessionStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  return [f, update] as const;
}

export function FilterBar({
  hub,
  f,
  setF,
}: {
  hub: ReportsHubDto;
  f: ReportFilters;
  setF: (p: Partial<ReportFilters>) => void;
}) {
  const [d, setD] = useState(f);
  const [more, setMore] = useState(false);
  const err = d.preset === "Custom" ? rangeError(d.from, d.to, hub.earliest, hub.today) : null;
  const dirty = JSON.stringify(d) !== JSON.stringify(f);
  const patch = (p: Partial<ReportFilters>) =>
    setD((cur) => ({
      ...cur,
      ...p,
      ...(p.preset && p.preset !== "Custom" ? presetRange(p.preset, hub.today) : {}),
    }));
  const therapists = useMemo(
    () => [...new Set(hub.facts.clinicians.map((c) => c.name))].sort(),
    [hub.facts.clinicians],
  );
  const sel = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    opts: readonly string[],
    all: string,
    width = "w-44",
  ) => (
    <div className={cn(width, "flex-none")}>
      <Select
        aria-label={label}
        className="h-9"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{all}</option>
        {opts.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </Select>
    </div>
  );
  const apply = () => {
    if (err) return;
    setF(d);
  };
  return (
    <section
      aria-label="Report filters"
      className="rounded-card border border-border bg-surface p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="ml-1 size-4 text-ink-500" aria-hidden="true" />
        <div className="w-40 flex-none">
          <Select
            aria-label="Date range"
            className="h-9"
            value={d.preset}
            onChange={(e) => patch({ preset: e.target.value as ReportFilters["preset"] })}
          >
            {datePresets.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </div>
        {d.preset === "Custom" ? (
          <>
            <input
              type="date"
              aria-label="From"
              value={d.from}
              onChange={(e) => patch({ from: e.target.value })}
              aria-invalid={Boolean(err)}
              className="h-9 rounded-control border border-border-strong bg-surface px-2 text-small aria-invalid:border-over"
            />
            <input
              type="date"
              aria-label="To"
              value={d.to}
              onChange={(e) => patch({ to: e.target.value })}
              aria-invalid={Boolean(err)}
              className="h-9 rounded-control border border-border-strong bg-surface px-2 text-small aria-invalid:border-over"
            />
          </>
        ) : (
          <span className="px-1 font-mono text-caption text-ink-500">
            {d.from} → {d.to}
          </span>
        )}
        <div className="w-56 flex-none">
          <Select
            aria-label="Compare with"
            className="h-9"
            value={d.compare}
            onChange={(e) => patch({ compare: e.target.value as ReportFilters["compare"] })}
          >
            {compareModes.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </div>
        {sel(
          "Service setting",
          d.setting,
          (v) => patch({ setting: v as ReportFilters["setting"] }),
          serviceSettings,
          "All permitted settings",
          "w-52",
        )}
        {sel(
          "Discipline",
          d.discipline,
          (v) => patch({ discipline: v }),
          disciplines,
          "All disciplines",
        )}
        <div className="relative w-48 flex-none">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-500"
            aria-hidden="true"
          />
          <input
            aria-label="Search references"
            placeholder="Reference or ID"
            value={d.search}
            onChange={(e) => patch({ search: e.target.value })}
            className="h-9 w-full rounded-control border border-border-strong bg-surface pr-2 pl-8 text-small"
          />
        </div>
        <Button size="sm" variant="ghost" onClick={() => setMore((m) => !m)} aria-expanded={more}>
          More filters{" "}
          <ChevronDown
            className={cn("size-3.5 transition-transform", more && "rotate-180")}
            aria-hidden="true"
          />
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setF(blankFilters(hub.today))}>
            <RotateCcw className="size-3.5" aria-hidden="true" /> Reset
          </Button>
          <Button size="sm" variant="primary" disabled={Boolean(err) || !dirty} onClick={apply}>
            Apply
          </Button>
        </div>
      </div>
      {more && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2">
          {sel(
            "Requested support",
            d.support,
            (v) => patch({ support: v }),
            supports,
            "All supports",
            "w-56",
          )}
          {sel(
            "Appointment mode",
            d.mode,
            (v) => patch({ mode: v as ReportFilters["mode"] }),
            appointmentModes,
            "All modes",
          )}
          {sel(
            "Team or region",
            d.region,
            (v) => patch({ region: v }),
            regions,
            "All permitted regions",
          )}
          {sel(
            "Therapist",
            d.therapist,
            (v) => patch({ therapist: v }),
            ["Unassigned", ...therapists],
            "All permitted therapists",
            "w-52",
          )}
          {sel(
            "Funding management",
            d.management,
            (v) => patch({ management: v as ReportFilters["management"] }),
            managementModes,
            "All funding",
            "w-48",
          )}
          <div className="w-36 flex-none">
            <Select
              aria-label="Group by"
              className="h-9"
              value={d.grain}
              onChange={(e) => patch({ grain: e.target.value as ReportFilters["grain"] })}
            >
              {timeGrains.map((g) => (
                <option key={g} value={g}>
                  Group by {g.toLowerCase()}
                </option>
              ))}
            </Select>
          </div>
        </div>
      )}
      {err && (
        <p role="alert" className="mt-2 text-caption font-medium text-over">
          {err} Apply is blocked until the dates are fixed.
        </p>
      )}
      {!err && dirty && (
        <p className="mt-2 text-caption text-ink-500">
          Changes aren&apos;t applied yet. Press Apply to update every figure.
        </p>
      )}
    </section>
  );
}

export function ScopeLine({ f, hub }: { f: ReportFilters; hub: ReportsHubDto }) {
  const time = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    hour: "numeric",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  }).format(new Date(hub.freshness));
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-500">
      {filterSummary(f).map((s) => (
        <span key={s} className="rounded-tag border border-border px-1.5 py-0.5">
          {s}
        </span>
      ))}
      <span>
        Australia/Brisbane business dates · data as of {time} · every card and report on this page
        uses these filters; snapshot measures read the state at the range end
      </span>
    </p>
  );
}

/* ------------------------------------------------------------------ KPI card (section 4) */

export function Kpi({
  r,
  onDrill,
  icon: Icon,
}: {
  r: MetricResult;
  onDrill?: () => void;
  icon?: LucideIcon;
}) {
  const d = delta(r);
  const [open, setOpen] = useState(false);
  return (
    <article className="flex min-w-0 flex-col rounded-card border border-border bg-surface p-4">
      <header className="flex items-start gap-2">
        {Icon && (
          <Icon
            className="mt-0.5 size-4 flex-none text-accent"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        )}
        <h3 className="min-w-0 flex-1 text-small font-semibold text-ink-900">{r.def.label}</h3>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`How ${r.def.label} is calculated`}
          className="cursor-pointer rounded-tag p-0.5 text-ink-500 hover:text-accent"
        >
          <Info className="size-3.5" aria-hidden="true" />
        </button>
      </header>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span
          className={cn("type-display text-h2 text-ink-900", r.value === null && "text-ink-500")}
        >
          {formatValue(r.value, r.def.unit)}
        </span>
        {r.value !== null && r.def.unit !== "AUD" && r.def.unit !== "%" && (
          <span className="text-caption text-ink-500">{r.def.unit}</span>
        )}
      </p>
      <div className="mt-1 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-caption">
        {d ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-semibold",
              d.good === null ? "text-ink-500" : d.good ? "text-healthy" : "text-over",
            )}
          >
            {d.diff > 0 ? (
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            ) : d.diff < 0 ? (
              <ArrowDownRight className="size-3.5" aria-hidden="true" />
            ) : (
              <Minus className="size-3.5" aria-hidden="true" />
            )}
            {d.diff > 0 ? "+" : ""}
            {r.def.unit === "AUD"
              ? formatValue(d.diff, "AUD")
              : r.def.unit === "%"
                ? `${d.diff} pts`
                : d.diff}{" "}
            vs previous ({formatValue(r.previous?.value ?? null, r.def.unit)})
          </span>
        ) : r.compareNote ? (
          <span className="text-ink-500">Comparison N/A · {r.compareNote}</span>
        ) : null}
        {r.sample !== undefined && (
          <span className="text-ink-500">
            n = {r.sample}
            {r.sample < 5 ? " · small sample" : ""}
          </span>
        )}
        {r.denominator !== undefined && r.def.unit === "%" && (
          <span className="text-ink-500">
            {r.numerator} of {r.denominator}
          </span>
        )}
        {!!r.incomplete && <Tag tone="watch">Data incomplete: {r.incomplete}</Tag>}
      </div>
      {r.value === null && r.note && <p className="mt-1 text-caption text-ink-500">{r.note}</p>}
      {open && (
        <div className="mt-3 rounded-control bg-sunken p-3 text-caption text-ink-700">
          <p>
            <b className="font-semibold">Definition.</b> {r.def.definition}
          </p>
          <p className="mt-1">
            <b className="font-semibold">Unit.</b> {r.def.unit} ·{" "}
            <b className="font-semibold">Date basis.</b> {r.def.basis}
          </p>
          <p className="mt-1">
            <b className="font-semibold">Limits.</b> {r.def.limit}
          </p>
          {r.def.unit === "AUD" && r.note && <p className="mt-1">{r.note}</p>}
        </div>
      )}
      <footer className="mt-auto flex items-center justify-between gap-2 pt-3">
        <span className="rounded-tag border border-border-strong px-1.5 text-label font-semibold tracking-wide text-ink-500 uppercase">
          {r.def.basis}
        </span>
        <span className="flex items-center gap-3">
          {onDrill && (
            <button
              type="button"
              onClick={onDrill}
              className="cursor-pointer text-caption font-semibold text-accent hover:underline"
            >
              Drill down
            </button>
          )}
          <Link
            href={r.def.drill.href}
            className="text-caption font-semibold text-accent hover:underline"
            title={`Open ${r.def.drill.module}`}
          >
            {r.def.drill.module}
          </Link>
        </span>
      </footer>
    </article>
  );
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

/* ------------------------------------------------------------------ cards and tables */

export function Card({
  title,
  sub,
  icon: Icon,
  action,
  children,
  flush,
}: {
  title: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-card border border-border bg-surface">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        {Icon && (
          <span className="flex size-7 flex-none items-center justify-center rounded-control bg-accent-tint text-accent">
            <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-section font-semibold text-ink-900">{title}</h2>
          {sub && <p className="text-caption text-ink-500">{sub}</p>}
        </div>
        {action}
      </header>
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

const fmt = (v: Row[string], kind: Column["kind"]) => {
  if (v === null || v === undefined || v === "") return "—";
  if (kind === "money" && typeof v === "number") return formatValue(v, "AUD");
  if (kind === "pct" && typeof v === "number") return `${v.toFixed(1)}%`;
  if (kind === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v))
    return new Intl.DateTimeFormat("en-AU", {
      day: "numeric",
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    }).format(new Date(`${v.slice(0, 10)}T00:00:00Z`));
  return String(v);
};

/** A catalogue report (section 5): sortable, row limit, permission-checked, export and drilldown. */
export function ReportTable({
  c,
  id,
  extra,
  rows: given,
  statusOptions,
  rowAction,
}: {
  c: Ctx;
  id: string;
  extra?: ReactNode;
  rows?: Row[];
  statusOptions?: string[];
  rowAction?: { label: string; run: (r: Row) => void };
}) {
  const def = reportById.get(id) as ReportDef;
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [limit, setLimit] = useState(25);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const run = useMemo(
    () =>
      given
        ? { allowed: true as const, rows: given }
        : runReport(
            def,
            c.facts,
            c.f,
            { today: c.hub.today, now: c.hub.now },
            c.names,
            c.hub.scope,
          ),
    [def, c, given],
  );
  const rows = run.allowed ? (sort ? sortRows(run.rows, sort.key, sort.dir) : run.rows) : [];
  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-caption text-ink-500">{def.id}</span> {def.title}
        </span>
      }
      sub={`${def.grain} · unit: ${def.unit} · date basis: ${def.basis}`}
      flush
      action={
        <div className="flex flex-wrap items-center gap-2">
          {extra}
          {statusOptions && (
            <div className="w-40">
              <Select
                aria-label="Status"
                className="h-8"
                value={c.f.status}
                onChange={(e) => c.setF({ status: e.target.value })}
              >
                <option value="">All statuses</option>
                {statusOptions.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </div>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSaving(true)} disabled={!run.allowed}>
            <Save className="size-3.5" aria-hidden="true" /> Save view
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setExporting(true)}>
            <Download className="size-3.5" aria-hidden="true" /> Export
          </Button>
        </div>
      }
    >
      {!run.allowed ? (
        <p className="px-4 py-6 text-small text-ink-700">{run.reason}</p>
      ) : !rows.length ? (
        <div className="m-4 rounded-card border border-dashed border-border-strong px-6 py-8 text-center">
          <p className="text-small font-semibold text-ink-900">No matching records</p>
          <p className="mt-1 text-small text-ink-700">
            Nothing in this report matches the filters. Filters are kept; no sample rows are added.
          </p>
          <div className="mt-3">
            <Button size="sm" variant="secondary" onClick={() => c.setF(blankFilters(c.hub.today))}>
              Reset filters
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead className="sticky top-0 z-[1] bg-sunken">
                <tr>
                  {def.columns.map((col) => (
                    <th
                      key={col.key}
                      className={cn(
                        th,
                        ["number", "money", "pct"].includes(col.kind) && "text-right",
                      )}
                      aria-sort={
                        sort?.key === col.key
                          ? sort.dir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button
                        type="button"
                        className="cursor-pointer uppercase hover:text-ink-900"
                        onClick={() =>
                          setSort((s) => ({
                            key: col.key,
                            dir: s?.key === col.key && s.dir === "desc" ? "asc" : "desc",
                          }))
                        }
                      >
                        {col.label}
                        {sort?.key === col.key ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
                      </button>
                    </th>
                  ))}
                  <th className={th}>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((r, i) => (
                  <tr
                    key={String(r._key ?? "") + i}
                    className="border-t border-border hover:bg-canvas"
                  >
                    {def.columns.map((col, ci) => (
                      <td
                        key={col.key}
                        className={cn(
                          td,
                          ["number", "money", "pct"].includes(col.kind) &&
                            "text-right tabular-nums",
                          col.kind === "id" && "font-mono text-caption",
                        )}
                      >
                        {r._suppressed && ["number", "money", "pct"].includes(col.kind) ? (
                          <span className="text-caption text-ink-500">Suppressed</span>
                        ) : (
                          fmt(r[col.key] ?? null, col.kind)
                        )}
                        {r._suppressed && ci === 0 && (
                          <span className="ml-2 text-caption text-ink-500">
                            (fewer than 3 records)
                          </span>
                        )}
                      </td>
                    ))}
                    <td className={cn(td, "text-right whitespace-nowrap")}>
                      {rowAction && (
                        <button
                          type="button"
                          onClick={() => rowAction.run(r)}
                          className="mr-3 cursor-pointer text-caption font-semibold text-accent hover:underline"
                        >
                          {rowAction.label}
                        </button>
                      )}
                      {typeof r._href === "string" && (
                        <Link
                          href={r._href}
                          className="inline-flex items-center gap-1 text-caption font-semibold text-accent hover:underline"
                        >
                          Open <ExternalLink className="size-3" aria-hidden="true" />
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="flex flex-wrap items-center gap-3 border-t border-border bg-canvas px-4 py-2.5 text-caption text-ink-500">
            <span>
              Showing {Math.min(limit, rows.length)} of {rows.length} rows
            </span>
            <div className="w-28">
              <Select
                aria-label="Row limit"
                className="h-8"
                value={String(limit)}
                onChange={(e) => setLimit(Number(e.target.value))}
              >
                {[25, 50, 100, 250, 1000].map((n) => (
                  <option key={n} value={String(n)}>
                    {n === 1000 ? "All permitted" : `${n} rows`}
                  </option>
                ))}
              </Select>
            </div>
            <Link href={def.drill} className="ml-auto font-semibold text-accent hover:underline">
              Open owning module
            </Link>
          </footer>
        </>
      )}
      {exporting && <ExportSheet c={c} reportId={def.id} onClose={() => setExporting(false)} />}
      {saving && (
        <SaveViewSheet c={c} reportId={def.id} spec={null} onClose={() => setSaving(false)} />
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ export (section 7) */

export function ExportSheet({
  c,
  reportId,
  spec,
  viewId,
  onClose,
}: {
  c: Ctx;
  reportId: string | null;
  spec?: BuilderSpec | null;
  viewId?: string | null;
  onClose: () => void;
}) {
  const def = reportId ? reportById.get(reportId) : undefined;
  const domain = def?.domain ?? spec?.category ?? "";
  const detailOk = (c.hub.scope.detail as string[]).includes(domain);
  const allowed = exportContents.filter((x) =>
    x === "Permitted detail rows"
      ? detailOk && (!def || def.detail || spec)
      : x === "Aggregate with chart data"
        ? !def?.detail
        : true,
  );
  const [format, setFormat] = useState<ExportFormat>("CSV");
  const [contents, setContents] = useState<ExportContents>(
    allowed.includes("Permitted detail rows")
      ? "Permitted detail rows"
      : (allowed[allowed.length - 1] ?? "Summary only"),
  );
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; ref: string; duplicate: boolean } | null>(null);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api<{ id: string; ref: string; duplicate: boolean }>("/api/care/reports", {
        body: {
          type: "export",
          export: {
            reportId: spec ? null : reportId,
            viewId: viewId ?? null,
            spec: spec ?? null,
            filters: c.f,
            format,
            contents,
          },
        },
      });
      setDone(res);
      toast(res.duplicate ? `Same export as ${res.ref}` : `Export ${res.ref} ready`, {
        tone: "success",
        detail: res.duplicate
          ? "The identical request was already generated, so no second run was made."
          : "Logged in export history.",
      });
      c.reload();
    } catch (e) {
      toast("Couldn't export", { tone: "error", detail: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      title={`Export ${def ? `${def.id} ${def.title}` : spec?.name || "custom report"}`}
      description="Mock download from the prototype. It uses the filters on screen and only the fields your role can see."
      onClose={onClose}
      footer={
        done ? (
          <a
            href={`/api/care/reports/exports/${done.id}?format=${encodeURIComponent(format)}`}
            target={format === "PDF summary" ? "_blank" : undefined}
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-control border border-accent-fill bg-accent-fill px-4 text-small font-semibold text-on-accent hover:bg-accent-fill-hover"
          >
            <Download className="size-4" aria-hidden="true" /> Download {done.ref}
          </a>
        ) : (
          <Button variant="primary" onClick={go} disabled={busy}>
            {busy ? "Generating…" : "Generate export"}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Format">
          <div role="radiogroup" className="flex flex-wrap gap-2">
            {exportFormats.map((x) => (
              <button
                key={x}
                type="button"
                role="radio"
                aria-checked={format === x}
                onClick={() => setFormat(x)}
                className={cn(
                  "h-9 cursor-pointer rounded-control border px-3 text-small",
                  format === x
                    ? "border-accent bg-accent-tint font-semibold text-accent"
                    : "border-border-strong text-ink-700",
                )}
              >
                {x}
              </button>
            ))}
          </div>
        </Field>
        <Field
          label="Contents"
          hint={
            detailOk
              ? undefined
              : "Record detail is hidden: your role sees aggregate figures for this area."
          }
        >
          <div role="radiogroup" className="flex flex-col gap-2">
            {allowed.map((x) => (
              <button
                key={x}
                type="button"
                role="radio"
                aria-checked={contents === x}
                onClick={() => setContents(x)}
                className={cn(
                  "cursor-pointer rounded-control border px-3 py-2 text-left text-small",
                  contents === x
                    ? "border-accent bg-accent-tint font-semibold text-accent"
                    : "border-border-strong text-ink-700",
                )}
              >
                {x}
              </button>
            ))}
          </div>
        </Field>
        <div className="rounded-control bg-sunken p-3 text-caption text-ink-700">
          <p className="label-caps text-ink-500">Included with the file</p>
          <ul className="mt-1 list-disc pl-4">
            <li>Report ID and title, who generated it and when (Brisbane time)</li>
            <li>Filters: {filterSummary(c.f).join(" · ")}</li>
            <li>Unit, date basis and data freshness</li>
          </ul>
          <p className="mt-2">
            The export is a snapshot. The download link expires in 7 days, checks your rights each
            time it opens, and every download is audited.
          </p>
        </div>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ save view (section 6) */

export function SaveViewSheet({
  c,
  reportId,
  spec,
  onClose,
  existing,
}: {
  c: Ctx;
  reportId: string | null;
  spec: BuilderSpec | null;
  onClose: () => void;
  existing?: { id: string; name: string; description: string; scope: ShareScope };
}) {
  const def = reportId ? reportById.get(reportId) : undefined;
  const [name, setName] = useState(
    existing?.name ?? spec?.name ?? (def ? `${def.title} (${c.f.preset.toLowerCase()})` : ""),
  );
  const [description, setDescription] = useState(existing?.description ?? spec?.description ?? "");
  const [scope, setScope] = useState<ShareScope>(existing?.scope ?? "Private");
  const [overwrite, setOverwrite] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setError("");
    try {
      await api("/api/care/reports", {
        body: {
          type: "view",
          view: {
            id: existing?.id,
            name,
            description,
            scope,
            reportId,
            spec: spec ? { ...spec, name, description } : null,
            filters: c.f,
            overwrite,
          },
        },
      });
      toast("View saved", { tone: "success", detail: `${name} · ${scope}` });
      c.reload();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    }
  };
  return (
    <Sheet
      title={existing ? "Edit saved view" : "Save view"}
      description="Saves the report with the filters on screen."
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={save}>
          Save view
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <p
            role="alert"
            className="rounded-control border border-over bg-over-bg p-3 text-small text-over"
          >
            {error}
          </p>
        )}
        <Field label="Report name" hint="3 to 80 characters, unique among your views">
          <input
            className={inputClass}
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Description (optional)" hint={`${description.length}/500`}>
          <textarea
            className={cn(inputClass, "h-20 py-2")}
            value={description}
            maxLength={500}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field
          label="Who can see it"
          hint="Team and organisation sharing depend on your role. Private views are never listed for anyone else."
        >
          <div role="radiogroup" className="flex flex-wrap gap-2">
            {shareScopes.map((x) => {
              const ok = c.hub.scope.share.includes(x);
              return (
                <button
                  key={x}
                  type="button"
                  role="radio"
                  aria-checked={scope === x}
                  disabled={!ok}
                  onClick={() => setScope(x)}
                  className={cn(
                    "h-9 cursor-pointer rounded-control border px-3 text-small disabled:cursor-not-allowed disabled:opacity-50",
                    scope === x
                      ? "border-accent bg-accent-tint font-semibold text-accent"
                      : "border-border-strong text-ink-700",
                  )}
                >
                  {x}
                </button>
              );
            })}
          </div>
        </Field>
        <label className="flex items-center gap-2 text-small text-ink-700">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(e) => setOverwrite(e.target.checked)}
          />{" "}
          Overwrite my view with the same name
        </label>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ drilldown (AT-08, AT-46) */

export type Drill = {
  title: string;
  reportId: string;
  filter?: (r: Row) => boolean;
  href: string;
  module: string;
  /** A permission-safe list built on screen instead of a catalogue report. */
  rows?: Row[];
  columns?: Column[];
};

export function DrillSheet({ c, d, onClose }: { c: Ctx; d: Drill; onClose: () => void }) {
  const base = reportById.get(d.reportId) as ReportDef;
  const def = d.columns ? { ...base, columns: d.columns } : base;
  const run = d.rows
    ? { allowed: true as const, rows: d.rows }
    : runReport(def, c.facts, c.f, { today: c.hub.today, now: c.hub.now }, c.names, c.hub.scope);
  const rows = run.allowed ? run.rows.filter(d.filter ?? (() => true)) : [];
  const q = new URLSearchParams({
    from: c.f.from,
    to: c.f.to,
    ...(c.f.discipline ? { discipline: c.f.discipline } : {}),
    ...(c.f.support ? { support: c.f.support } : {}),
    source: "reports",
  });
  return (
    <Sheet
      title={d.title}
      description={`Same filters as the report: ${filterSummary(c.f).join(" · ")}`}
      onClose={onClose}
      footer={
        <Link
          href={`${d.href}${d.href.includes("?") ? "&" : "?"}${q}`}
          className="inline-flex h-10 items-center gap-2 rounded-control border border-border-strong px-4 text-small font-semibold text-ink-900 hover:bg-sunken"
        >
          Open in {d.module} <ExternalLink className="size-3.5" aria-hidden="true" />
        </Link>
      }
    >
      {!run.allowed ? (
        <p className="text-small text-ink-700">{run.reason}</p>
      ) : !rows.length ? (
        <p className="text-small text-ink-700">No records in this cohort.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {rows.slice(0, 200).map((r, i) => (
            <li key={i} className="flex items-start gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-small font-semibold text-ink-900">
                  {String(r[def.columns[0]?.key ?? ""] ?? "—")}
                </p>
                <p className="text-caption text-ink-500">
                  {def.columns
                    .slice(1, 5)
                    .map((col) => `${col.label}: ${fmt(r[col.key] ?? null, col.kind)}`)
                    .join(" · ")}
                </p>
              </div>
              {typeof r._href === "string" && (
                <Link
                  href={r._href}
                  className="text-caption font-semibold text-accent hover:underline"
                >
                  Open
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-caption text-ink-500">
        Back returns to Reports with the same filters and tab.
      </p>
    </Sheet>
  );
}

export function NA({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-control border border-dashed border-border-strong px-3 py-2 text-caption text-ink-500">
      {children}
    </p>
  );
}
