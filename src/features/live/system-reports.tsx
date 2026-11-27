"use client";

import {
  ArrowDown,
  ArrowUp,
  Baby,
  Building2,
  CalendarDays,
  CalendarRange,
  CalendarX2,
  ClipboardList,
  Gauge,
  House,
  Handshake,
  School,
  Trees,
  UserRound,
  Video,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Layers,
  LoaderCircle,
  Stethoscope,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { createElement, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { useResource, useSession } from "@/lib/live/client";
import {
  periodLabel,
  systemReportGroups,
  systemReports,
  systemReportUrl,
  type SystemReport,
  type SystemReportId,
  type SystemReportTable,
} from "@/lib/live/system-reports";
import { ErrorNote, Skeleton } from "./bits";
import { DateRangePicker } from "./date-range-picker";

const presets = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "quarter", label: "Last 3 months" },
  { id: "year", label: "This year" },
  { id: "all", label: "All time" },
] as const;
type Preset = (typeof presets)[number]["id"] | "custom";

type Group = (typeof systemReportGroups)[number];

const groupIcon: Record<Group, LucideIcon> = {
  "Appointment types": Layers,
  Patients: UsersRound,
  Therapists: Stethoscope,
  Visits: CalendarDays,
};

/**
 * Icons take the active theme's rail colour (navy in Navy rail), so the list matches the sidebar;
 * the chosen report's icon turns solid.
 */
const tone = {
  chip: "bg-sidebar/10 text-sidebar",
  chipActive: "bg-sidebar text-sidebar-ink",
  ink: "text-sidebar",
} as const;

const reportIcon: Record<SystemReportId, LucideIcon> = {
  "by-type": Layers,
  "type-home": House,
  "type-telehealth": Video,
  "type-school": School,
  "type-daycare": Baby,
  "type-day-program": Building2,
  "type-community": Trees,
  "by-patient": UserRound,
  patients: ClipboardList,
  "by-therapist": Stethoscope,
  "patient-therapist": Handshake,
  caseload: Gauge,
  visits: CalendarDays,
  missed: CalendarX2,
  "by-day": CalendarRange,
};

/** A row of pill buttons, one pressed: the navy pill marks the choice. */
function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "h-8 cursor-pointer rounded-full border px-3 text-small font-medium transition-colors duration-(--duration-fast) active:scale-[0.98]",
            value === o.id
              ? "border-transparent bg-accent-fill font-semibold text-on-accent"
              : "border-sidebar-border text-sidebar-ink hover:bg-sidebar-hover",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const PAGE = 50;

const iso = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

/** Today in Brisbane, as year, month (0-based), day and weekday (0 = Sunday). */
function brisbaneToday() {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane" })
    .format(new Date())
    .split("-")
    .map(Number);
  const year = y ?? 2026;
  const month = (m ?? 1) - 1;
  const day = d ?? 1;
  return { y: year, m: month, d: day, wd: new Date(Date.UTC(year, month, day)).getUTCDay() };
}

function rangeFor(preset: Exclude<Preset, "custom">) {
  const { y, m, d, wd } = brisbaneToday();
  switch (preset) {
    case "today":
      return { from: iso(y, m, d), to: iso(y, m, d) };
    case "week": {
      const monday = d - ((wd + 6) % 7);
      return { from: iso(y, m, monday), to: iso(y, m, monday + 6) };
    }
    case "month":
      return { from: iso(y, m, 1), to: iso(y, m + 1, 0) };
    case "last-month":
      return { from: iso(y, m - 1, 1), to: iso(y, m, 0) };
    case "quarter":
      return { from: iso(y, m - 3, d + 1), to: iso(y, m, d) };
    case "year":
      return { from: iso(y, 0, 1), to: iso(y, 11, 31) };
    case "all":
      return { from: "", to: "" };
  }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const numberFmt = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 });
const dayFmt = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
function show(value: string | number) {
  if (typeof value === "number") return numberFmt.format(value);
  if (DAY.test(value)) return dayFmt.format(new Date(`${value}T00:00:00Z`));
  return value || "—";
}

/**
 * System reports: every live record as a finished table, counted on the server. Pick a period
 * (a preset or your own dates) and a report, check the data on screen, then download it as a
 * branded PDF or as a CSV for Excel.
 */
export function SystemReports() {
  const { user } = useSession();
  const allowed = useMemo(
    () => systemReports.filter((r) => Boolean(user?.permissions.includes(r.permission))),
    [user],
  );
  const [picked, setPicked] = useState<SystemReportId | null>(null);
  // The first report in the list's own order (appointment types first) opens by default.
  const first = systemReportGroups.map((g) => allowed.find((r) => r.group === g)).find(Boolean);
  const report = allowed.find((r) => r.id === picked) ?? first ?? null;
  const [preset, setPreset] = useState<Preset>("month");
  const [range, setRange] = useState(() => rangeFor("month"));
  const badRange = Boolean(range.from && range.to && range.from > range.to);

  const choosePreset = (p: Exclude<Preset, "custom">) => {
    setPreset(p);
    setRange(rangeFor(p));
  };

  if (!user) return <Skeleton className="h-160" />;
  return (
    <div className="flex flex-col gap-5">
      <section
        aria-label="Report period"
        className="flex flex-col gap-2.5 rounded-card bg-sidebar px-5 py-4 text-sidebar-ink"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 label-caps text-sidebar-muted">
              <CalendarDays className="size-4" aria-hidden="true" />
              Period
            </span>
            <Chips
              label="Quick periods"
              options={presets}
              value={preset}
              onChange={(p) => p !== "custom" && choosePreset(p)}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="label-caps text-sidebar-muted">Dates</span>
            <DateRangePicker
              value={range}
              onChange={(next) => {
                setPreset(next.from || next.to ? "custom" : "all");
                setRange(next);
              }}
            />
          </div>
        </div>
        {badRange ? (
          <p role="alert" className="text-small font-semibold text-sidebar-ink">
            The end date must be on or after the start date.
          </p>
        ) : (
          <p className="text-caption text-sidebar-muted">
            <span className="font-semibold text-sidebar-ink">
              {preset === "custom" ? "Your own dates" : presets.find((p) => p.id === preset)?.label}
              {" · "}
              {periodLabel(range.from, range.to)}
            </span>
            {" · "}Brisbane time. Patient list and caseload show everyone as of today.
          </p>
        )}
      </section>

      {allowed.length === 0 || !report ? (
        <p className="rounded-card border border-dashed border-border-strong bg-surface p-8 text-center text-small text-ink-500">
          Your role doesn&apos;t include any system reports. Ask a Super Admin for report access.
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          {/* On wide screens the list takes the preview's height and scrolls inside it, so the
              two cards always line up top and bottom. */}
          <div className="relative min-h-0 lg:min-h-96">
            <div className="lg:absolute lg:inset-0">
              <ReportPicker reports={allowed} current={report.id} onPick={setPicked} />
            </div>
          </div>
          <Preview
            key={report.id}
            report={report}
            from={range.from}
            to={range.to}
            blocked={badRange}
          />
        </div>
      )}
    </div>
  );
}

function ReportPicker({
  reports,
  current,
  onPick,
}: {
  reports: SystemReport[];
  current: SystemReportId;
  onPick: (id: SystemReportId) => void;
}) {
  const [folded, setFolded] = useState<string[]>([]);
  const toggle = (group: string) =>
    setFolded((f) => (f.includes(group) ? f.filter((g) => g !== group) : [...f, group]));
  return (
    <nav
      aria-label="Reports"
      className="flex h-full flex-col gap-2 overflow-y-auto rounded-card border border-border bg-surface p-3"
    >
      {systemReportGroups.map((group) => {
        const list = reports.filter((r) => r.group === group);
        if (!list.length) return null;
        const Icon = groupIcon[group];
        const shut = folded.includes(group) && !list.some((r) => r.id === current);
        const id = `reports-${group.toLowerCase().replace(/\s+/g, "-")}`;
        return (
          <div key={group} className="flex flex-col gap-1">
            <button
              type="button"
              aria-expanded={!shut}
              aria-controls={id}
              onClick={() => toggle(group)}
              className="flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-control px-2 text-left label-caps text-ink-700 hover:bg-sunken hover:text-ink-900"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Icon className={cn("size-4 flex-none", tone.ink)} aria-hidden="true" />
                <span className="truncate">
                  {group === "Appointment types" ? group : `By ${group.toLowerCase()}`}
                </span>
              </span>
              <span className="flex flex-none items-center gap-1.5">
                <span className="rounded-full bg-sunken px-1.5 text-caption font-semibold tracking-normal text-ink-700 normal-case tabular-nums">
                  {list.length}
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 transition-transform duration-(--duration-fast) motion-reduce:transition-none",
                    shut && "-rotate-90",
                  )}
                  aria-hidden="true"
                />
              </span>
            </button>
            <div id={id} hidden={shut} className="flex flex-col gap-1">
              {list.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  aria-current={r.id === current ? "true" : undefined}
                  onClick={() => onPick(r.id)}
                  className={cn(
                    "relative flex cursor-pointer items-start gap-3 rounded-control px-3 py-2.5 text-left transition-colors duration-(--duration-fast)",
                    r.id === current ? "bg-accent-tint" : "hover:bg-sunken",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-8 flex-none place-items-center rounded-control",
                      r.id === current ? tone.chipActive : tone.chip,
                    )}
                  >
                    {createElement(reportIcon[r.id], { className: "size-4", strokeWidth: 2 })}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    {r.id === current && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-2 left-0 w-0.75 rounded-full bg-accent-fill"
                      />
                    )}
                    <span
                      className={cn(
                        "text-small font-semibold",
                        r.id === current ? "text-accent" : "text-ink-900",
                      )}
                    >
                      {r.title}
                    </span>
                    <span className="line-clamp-2 text-caption text-ink-500">{r.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function Preview({
  report,
  from,
  to,
  blocked,
}: {
  report: SystemReport;
  from: string;
  to: string;
  blocked: boolean;
}) {
  const url = blocked ? null : systemReportUrl(report.id, from, to, "json");
  const { data, error, reload } = useResource<{ table: SystemReportTable }>(url);
  const table = data?.table ?? null;
  // The last answer stays on screen while the next period loads, dimmed, so nothing jumps.
  const current = Boolean(table && table.period === periodLabel(from, to));
  const [busy, setBusy] = useState<"pdf" | "csv" | null>(null);

  const download = async (format: "pdf" | "csv") => {
    if (blocked) return;
    setBusy(format);
    try {
      const res = await fetch(systemReportUrl(report.id, from, to, format));
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        toast("The report couldn't be downloaded", {
          tone: "error",
          detail: body?.error ?? "Try again.",
        });
        return;
      }
      const name =
        /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ??
        `${report.id}.${format}`;
      const href = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      a.click();
      URL.revokeObjectURL(href);
      toast(`${report.title} downloaded`, {
        detail: `${format === "pdf" ? "PDF" : "Excel (CSV)"} · ${periodLabel(from, to)}`,
      });
    } catch {
      toast("The report couldn't be downloaded", {
        tone: "error",
        detail: "Check the connection and try again.",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-card border border-border bg-surface p-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="label-caps text-ink-500">
            {report.group === "Appointment types"
              ? "Appointment types"
              : `By ${report.group.toLowerCase()}`}
          </p>
          <h3 className="mt-0.5 text-section font-semibold text-ink-900">{report.title}</h3>
          <p className="mt-0.5 text-small text-ink-700">{report.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            onClick={() => void download("pdf")}
            disabled={busy !== null || blocked}
          >
            {busy === "pdf" ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileText className="size-4" aria-hidden="true" />
            )}
            {busy === "pdf" ? "Preparing PDF" : "Download PDF"}
          </Button>
          <Button onClick={() => void download("csv")} disabled={busy !== null || blocked}>
            {busy === "csv" ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileSpreadsheet className="size-4" aria-hidden="true" />
            )}
            Excel (CSV)
          </Button>
        </div>
      </header>

      {error && !table ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : !table ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-105" />
        </div>
      ) : (
        <div
          className={cn(
            "flex flex-col gap-4 transition-opacity duration-(--duration-base)",
            current ? "" : "opacity-60",
          )}
          aria-busy={!current}
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {table.totals.slice(0, 4).map((t, i) => (
              <div
                key={t.label}
                className={cn(
                  "flex flex-col gap-1 rounded-control px-4 py-3",
                  i === 0 ? "bg-sidebar text-sidebar-ink" : "bg-sunken",
                )}
              >
                <span
                  className={cn(
                    "text-caption font-medium",
                    i === 0 ? "text-sidebar-muted" : "text-ink-500",
                  )}
                >
                  {t.label}
                </span>
                <span
                  className={cn(
                    "text-h2 font-semibold tabular-nums",
                    i === 0 ? "text-sidebar-ink" : "text-ink-900",
                  )}
                >
                  {t.value}
                </span>
              </div>
            ))}
          </div>
          <DataTable
            key={`${table.id}|${table.period}|${table.type}`}
            table={table}
            updating={!current}
          />
        </div>
      )}
    </section>
  );
}

function DataTable({ table, updating }: { table: SystemReportTable; updating: boolean }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const found = q
      ? table.rows.filter((r) => r.some((v) => String(v).toLowerCase().includes(q)))
      : table.rows;
    if (!sort) return found;
    return [...found].sort((a, b) => {
      const x = a[sort.col] ?? "";
      const y = b[sort.col] ?? "";
      const order =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), "en-AU", { numeric: true });
      return order * sort.dir;
    });
  }, [table.rows, query, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const at = Math.min(page, pages - 1);
  const shown = rows.slice(at * PAGE, at * PAGE + PAGE);
  const toggle = (col: number) => {
    setPage(0);
    setSort((s) => (s?.col === col ? (s.dir === 1 ? { col, dir: -1 } : null) : { col, dir: 1 }));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchField
          label={`Search ${table.title}`}
          placeholder="Search the rows"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          className="w-72 max-w-full"
        />
        <p className="flex items-center gap-2 text-caption text-ink-500" aria-live="polite">
          {updating && <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />}
          {updating
            ? "Updating for the new period"
            : `${numberFmt.format(rows.length)} of ${numberFmt.format(table.rows.length)} rows · ${table.period}`}
        </p>
      </div>
      {table.rows.length === 0 ? (
        <p className="rounded-card border border-dashed border-border-strong p-8 text-center text-small text-ink-500">
          No records in this period. Try a longer period or All time.
        </p>
      ) : (
        <div className="max-h-140 overflow-auto rounded-control border border-border">
          <table className="w-full border-collapse text-small">
            <thead className="sticky top-0 z-10">
              <tr>
                {table.columns.map((c, i) => (
                  <th
                    key={c.label}
                    scope="col"
                    aria-sort={
                      sort?.col === i ? (sort.dir === 1 ? "ascending" : "descending") : undefined
                    }
                    className={cn(
                      "bg-sidebar px-3 py-2.5 whitespace-nowrap",
                      c.numeric ? "text-right" : "text-left",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(i)}
                      className={cn(
                        "inline-flex cursor-pointer items-center gap-1 label-caps text-sidebar-ink hover:text-sidebar-ink",
                        c.numeric && "flex-row-reverse",
                      )}
                    >
                      {c.label}
                      {sort?.col === i ? (
                        sort.dir === 1 ? (
                          <ArrowUp className="size-3" aria-hidden="true" />
                        ) : (
                          <ArrowDown className="size-3" aria-hidden="true" />
                        )
                      ) : null}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, ri) => (
                <tr
                  key={`${at}-${ri}`}
                  className="border-t border-border even:bg-sunken hover:bg-accent-tint"
                >
                  {r.map((v, i) => (
                    <td
                      key={i}
                      className={cn(
                        "px-3 py-2 whitespace-nowrap text-ink-900",
                        table.columns[i]?.numeric && "text-right tabular-nums",
                        table.columns[i]?.strong ? "font-semibold" : i === 0 && "font-medium",
                      )}
                    >
                      {show(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && (
            <p className="p-6 text-center text-small text-ink-500">No rows match the search.</p>
          )}
        </div>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <span className="text-caption text-ink-500">
            Page {at + 1} of {pages}
          </span>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Previous page"
            disabled={at === 0}
            onClick={() => setPage(at - 1)}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Next page"
            disabled={at >= pages - 1}
            onClick={() => setPage(at + 1)}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      )}
      <p className="flex items-center gap-1.5 text-caption text-ink-500">
        <Download className="size-3.5" aria-hidden="true" />
        The PDF and Excel files hold every row shown here, for the same period. Each download is
        recorded in the audit trail.
      </p>
    </div>
  );
}
