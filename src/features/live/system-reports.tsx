"use client";

import {
  Activity,
  Apple,
  Bone,
  Brain,
  Dumbbell,
  Footprints,
  Hand,
  HeartHandshake,
  MessageCircle,
  Syringe,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Baby,
  Building2,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CalendarX2,
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleCheck,
  CircleDot,
  ClipboardList,
  Clock,
  Download,
  FileSpreadsheet,
  Gauge,
  Handshake,
  House,
  Layers,
  LoaderCircle,
  MapPin,
  RotateCcw,
  School,
  Stethoscope,
  Trees,
  TrendingDown,
  TrendingUp,
  UserRound,
  UsersRound,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/premium";
import { SearchField } from "@/components/ui/search-field";
import { Select } from "@/components/ui/select";
import { Tag, type TagTone } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { useResource, useSession } from "@/lib/live/client";
import {
  periodLabel,
  systemReports,
  systemReportUrl,
  visitStatusFilters,
  type SystemReport,
  type SystemReportFilters,
  type SystemReportId,
  type SystemReportTable,
  type systemReportGroups,
  type VisitSummary,
} from "@/lib/live/system-reports";
import { ErrorNote, Skeleton } from "./bits";
import { DateRangePicker } from "./date-range-picker";

type Group = (typeof systemReportGroups)[number];

/** What each report group's page is called and says under its title. */
const groupMeta: Record<Group, { title: string; line: string; icon: LucideIcon }> = {
  "Appointment types": {
    title: "Appointment Type Reports",
    line: "Visits, outcomes and time by where care happens: home, telehealth, school and more.",
    icon: Layers,
  },
  "Therapy types": {
    title: "Therapy Service Reports",
    line: "Visits, outcomes and time for each therapy: occupational therapy, physiotherapy, speech and more.",
    icon: Activity,
  },
  Patients: {
    title: "Patient Reports",
    line: "Each patient's visits, details, funding and the time given to them.",
    icon: UsersRound,
  },
  Therapists: {
    title: "Therapist Reports",
    line: "Each therapist's patients, visits, hours delivered and caseload.",
    icon: Stethoscope,
  },
  Visits: {
    title: "Visit Reports",
    line: "Every visit, every cancellation and each day's activity.",
    icon: CalendarDays,
  },
};

/** Short names for the tab row; the full title heads the report card. */
const tabLabel: Record<SystemReportId, string> = {
  "by-type": "Summary Report",
  "type-home": "Home Visit Report",
  "type-telehealth": "Telehealth Report",
  "type-school": "School Visit Report",
  "type-daycare": "Daycare Visit Report",
  "type-day-program": "Day Program Report",
  "type-community": "Community Visit Report",
  "by-therapy": "Summary Report",
  "therapy-ot": "Occupational Therapy Report",
  "therapy-physio": "Physiotherapy Report",
  "therapy-speech": "Speech Pathology Report",
  "therapy-ep": "Exercise Physiology Report",
  "therapy-psychology": "Psychology Report",
  "therapy-trauma": "Trauma Therapy Report",
  "therapy-dietetics": "Dietetics Report",
  "therapy-podiatry": "Podiatry Report",
  "therapy-nursing": "Nursing Report",
  "by-patient": "Patient Activity Report",
  patients: "Patient Register Report",
  "by-therapist": "Therapist Activity Report",
  "patient-therapist": "Therapist and Patient Hours Report",
  caseload: "Therapist Caseload Report",
  visits: "Visit Register Report",
  missed: "Cancellation and DNA Report",
  "by-day": "Daily Visit Activity Report",
};

const reportIcon: Record<SystemReportId, LucideIcon> = {
  "by-type": Layers,
  "type-home": House,
  "type-telehealth": Video,
  "type-school": School,
  "type-daycare": Baby,
  "type-day-program": Building2,
  "type-community": Trees,
  "by-therapy": Activity,
  "therapy-ot": Hand,
  "therapy-physio": Bone,
  "therapy-speech": MessageCircle,
  "therapy-ep": Dumbbell,
  "therapy-psychology": Brain,
  "therapy-trauma": HeartHandshake,
  "therapy-dietetics": Apple,
  "therapy-podiatry": Footprints,
  "therapy-nursing": Syringe,
  "by-patient": UserRound,
  patients: ClipboardList,
  "by-therapist": Stethoscope,
  "patient-therapist": Handshake,
  caseload: Gauge,
  visits: CalendarDays,
  missed: CalendarX2,
  "by-day": CalendarRange,
};

/** The icon beside each row of the appointment-type summary. */
const typeRowIcon: Record<string, LucideIcon> = {
  "Home visits": House,
  Telehealth: Video,
  "School visits": School,
  "Daycare visits": Baby,
  "Day Program visits": Building2,
  "Community visits": Trees,
  "Occupational Therapy": Hand,
  Physiotherapy: Bone,
  "Speech Pathology": MessageCircle,
  "Exercise Physiology": Dumbbell,
  Psychology: Brain,
  "Trauma Therapy": HeartHandshake,
  Dietetics: Apple,
  Podiatry: Footprints,
  Nursing: Syringe,
};

const statusTone: Record<string, TagTone> = {
  Completed: "healthy",
  Booked: "available",
  Tentative: "available",
  Cancelled: "watch",
  "Late cancellation": "watch",
  "Did not attend": "over",
  Incomplete: "over",
  Rescheduled: "neutral",
  Active: "healthy",
  Provisional: "available",
  Discharged: "neutral",
  Healthy: "healthy",
  Watch: "watch",
  "At Risk": "over",
};

/* ------------------------------------------------------------------ dates */

const iso = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

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

/** The quick periods in the date picker, worked out from today in Brisbane. */
function quickPeriods() {
  const { y, m, d, wd } = brisbaneToday();
  const monday = d - ((wd + 6) % 7);
  return [
    { label: "Today", range: { from: iso(y, m, d), to: iso(y, m, d) } },
    { label: "This week", range: { from: iso(y, m, monday), to: iso(y, m, monday + 6) } },
    { label: "This month", range: { from: iso(y, m, 1), to: iso(y, m + 1, 0) } },
    { label: "Last month", range: { from: iso(y, m - 1, 1), to: iso(y, m, 0) } },
    { label: "Last 3 months", range: { from: iso(y, m - 3, d + 1), to: iso(y, m, d) } },
    { label: "This year", range: { from: iso(y, 0, 1), to: iso(y, 11, 31) } },
    { label: "All time", range: { from: "", to: "" } },
  ];
}

function defaults(): SystemReportFilters {
  const { y, m } = brisbaneToday();
  return {
    from: iso(y, m, 1),
    to: iso(y, m + 1, 0),
    region: "",
    discipline: "",
    therapist: "",
    status: "",
  };
}

/* ------------------------------------------------------------------ formatting */

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

/** Filters survive moving between report pages in the same tab, so a period is set once. */
const STORE = "medisense-system-report-filters";

function useFilters() {
  const [filters, setFilters] = useState<SystemReportFilters>(defaults);
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORE) ?? "null") as Partial<
        Record<keyof SystemReportFilters, unknown>
      > | null;
      if (!saved) return;
      const base = defaults();
      const next = Object.fromEntries(
        Object.entries(base).map(([k, v]) => {
          const s = saved[k as keyof SystemReportFilters];
          return [k, typeof s === "string" ? s : v];
        }),
      ) as SystemReportFilters;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read the saved filters once after mount
      setFilters(next);
    } catch {
      // A damaged saved value just means starting from the defaults.
    }
  }, []);
  const update = useCallback((next: SystemReportFilters) => {
    setFilters(next);
    try {
      sessionStorage.setItem(STORE, JSON.stringify(next));
    } catch {
      // Private browsing can refuse storage; the filters still apply on this page.
    }
  }, []);
  return [filters, update] as const;
}

/** The open report, kept in the address (?report=…) so a refresh or a shared link reopens it. */
function useReportParam(list: SystemReport[]) {
  const [id, setId] = useState<string>("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the address once after mount
    setId(new URLSearchParams(window.location.search).get("report") ?? "");
  }, []);
  const set = useCallback((next: SystemReportId) => {
    setId(next);
    const url = new URL(window.location.href);
    url.searchParams.set("report", next);
    window.history.replaceState(window.history.state, "", url);
  }, []);
  return [list.find((r) => r.id === id) ?? list[0] ?? null, set] as const;
}

/* ------------------------------------------------------------------ page */

/**
 * One group of system reports (appointment types, patients, therapists or visits) on its own
 * page, opened from the Reports menu. Filters on top, one tab per report, the headline figures
 * against the period before, then the full table to search, sort and download.
 */
export function SystemReportsPage({ group }: { group: Group }) {
  const { user } = useSession();
  const reports = useMemo(
    () =>
      systemReports.filter(
        (r) => r.group === group && Boolean(user?.permissions.includes(r.permission)),
      ),
    [group, user],
  );
  const [report, setReport] = useReportParam(reports);
  const [filters, setFilters] = useFilters();
  const meta = groupMeta[group];
  const url = report ? systemReportUrl(report.id, filters, "json") : null;
  const { data, error, reload } = useResource<{ table: SystemReportTable }>(url);
  const table = data?.table ?? null;
  const request = report
    ? [
        report.id,
        filters.from,
        filters.to,
        filters.region,
        filters.discipline,
        filters.therapist,
        filters.status,
      ].join("|")
    : "";
  const fresh = Boolean(table && table.request === request);
  // Options come with each answer; the last ones stay while the next loads.
  const [options, setOptions] = useState<SystemReportTable["options"] | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- keep the latest filter options
    if (table) setOptions(table.options);
  }, [table]);

  if (!user) return <Skeleton className="h-160" />;
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid size-13 flex-none place-items-center rounded-card bg-accent-fill text-on-accent">
            <ChartColumn className="size-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="label-caps text-ink-500">System reports</p>
            <h1 className="type-display text-h2 leading-tight text-ink-900">{meta.title}</h1>
            <p className="mt-0.5 text-small text-ink-700">{meta.line}</p>
          </div>
        </div>
        <p className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-caption font-medium text-ink-700">
          <span className="size-2 rounded-full bg-live-dot" aria-hidden="true" />
          Live records · Brisbane time
        </p>
      </header>

      <FilterBar filters={filters} onChange={setFilters} options={options} />

      {reports.length === 0 || !report ? (
        <p className="rounded-card border border-dashed border-border-strong bg-surface p-8 text-center text-small text-ink-500">
          Your role doesn&apos;t include these reports. Ask a Super Admin for report access.
        </p>
      ) : (
        <>
          {reports.length > 1 && (
            <ReportTabs reports={reports} current={report.id} onPick={setReport} />
          )}
          {error && !table ? (
            <ErrorNote message={error} onRetry={reload} />
          ) : !table ? (
            <div className="flex flex-col gap-5" aria-busy="true">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
              <Skeleton className="h-120" />
            </div>
          ) : (
            <div
              className={cn(
                "flex flex-col gap-5 transition-opacity duration-(--duration-base)",
                !fresh && "opacity-60",
              )}
              aria-busy={!fresh}
            >
              <Kpis
                summary={table.summary}
                // Counting only missed visits, fewer is the good direction.
                missedOnly={["cancelled", "dna", "incomplete"].includes(filters.status)}
              />
              <ReportCard
                key={`${table.request}`}
                report={report}
                table={table}
                filters={filters}
                updating={!fresh}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ filters */

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-caption font-semibold text-ink-700">
        {label}
      </label>
      {children}
    </div>
  );
}

/** A dropdown with an icon in front, the same height as the date field. */
function IconSelect({
  id,
  icon: Icon,
  value,
  onChange,
  children,
}: {
  id: string;
  icon: LucideIcon;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <Icon
        className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-ink-500"
        aria-hidden="true"
      />
      <Select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 bg-surface pl-9 font-medium"
      >
        {children}
      </Select>
    </div>
  );
}

function FilterBar({
  filters,
  onChange,
  options,
}: {
  filters: SystemReportFilters;
  onChange: (next: SystemReportFilters) => void;
  options: SystemReportTable["options"] | null;
}) {
  const periods = useMemo(() => quickPeriods(), []);
  const set = (patch: Partial<SystemReportFilters>) => onChange({ ...filters, ...patch });
  const base = defaults();
  const changed = (Object.keys(base) as (keyof SystemReportFilters)[]).some(
    (k) => filters[k] !== base[k],
  );
  return (
    <section
      aria-label="Report filters"
      className="grid grid-cols-1 items-end gap-4 rounded-card border border-border bg-surface p-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.35fr)_repeat(4,minmax(0,1fr))_auto]"
    >
      <Field label="Date range" htmlFor="sr-dates">
        <DateRangePicker
          id="sr-dates"
          variant="field"
          presets={periods}
          value={{ from: filters.from, to: filters.to }}
          onChange={(r) => set(r)}
        />
      </Field>
      <Field label="Branch" htmlFor="sr-region">
        <IconSelect
          id="sr-region"
          icon={MapPin}
          value={filters.region}
          onChange={(region) => set({ region })}
        >
          <option value="">All branches</option>
          {options?.regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </IconSelect>
      </Field>
      <Field label="Therapy type" htmlFor="sr-discipline">
        <IconSelect
          id="sr-discipline"
          icon={Layers}
          value={filters.discipline}
          onChange={(discipline) => set({ discipline })}
        >
          <option value="">All therapy types</option>
          {options?.disciplines.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </IconSelect>
      </Field>
      <Field label="Therapist" htmlFor="sr-therapist">
        <IconSelect
          id="sr-therapist"
          icon={UserRound}
          value={filters.therapist}
          onChange={(therapist) => set({ therapist })}
        >
          <option value="">All therapists</option>
          {options?.therapists.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </IconSelect>
      </Field>
      <Field label="Status" htmlFor="sr-status">
        <IconSelect
          id="sr-status"
          icon={CircleDot}
          value={filters.status}
          onChange={(status) => set({ status })}
        >
          <option value="">All statuses</option>
          {visitStatusFilters.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </IconSelect>
      </Field>
      <Button className="h-10" onClick={() => onChange(defaults())} disabled={!changed}>
        <RotateCcw className="size-4" aria-hidden="true" />
        Reset
      </Button>
    </section>
  );
}

/* ------------------------------------------------------------------ tabs */

function ReportTabs({
  reports,
  current,
  onPick,
}: {
  reports: SystemReport[];
  current: SystemReportId;
  onPick: (id: SystemReportId) => void;
}) {
  return (
    <nav
      aria-label="Reports"
      className="flex flex-wrap gap-1 rounded-card border border-border bg-surface p-1.5"
    >
      {reports.map((r) => {
        const Icon = reportIcon[r.id];
        const on = r.id === current;
        return (
          <button
            key={r.id}
            type="button"
            aria-current={on ? "page" : undefined}
            onClick={() => onPick(r.id)}
            className={cn(
              "relative flex h-11 flex-none cursor-pointer items-center gap-2 rounded-control px-4 text-small whitespace-nowrap transition-colors duration-(--duration-fast)",
              on
                ? "bg-accent-tint font-semibold text-accent"
                : "font-medium text-ink-700 hover:bg-sunken hover:text-ink-900",
            )}
          >
            <Icon className="size-4.5 flex-none" aria-hidden="true" />
            {tabLabel[r.id]}
            {on && (
              <span
                aria-hidden="true"
                className="absolute inset-x-3 bottom-0 h-0.75 rounded-full bg-accent-fill"
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------------ headline figures */

const kpis: {
  key: keyof VisitSummary;
  label: string;
  icon: LucideIcon;
  chip: string;
  /** For cancellations a rise is bad news. */
  upIsGood: boolean;
}[] = [
  {
    key: "visits",
    label: "Total visits",
    icon: CalendarDays,
    chip: "bg-accent-tint text-accent",
    upIsGood: true,
  },
  {
    key: "completed",
    label: "Completed",
    icon: CircleCheck,
    chip: "bg-healthy-bg text-healthy",
    upIsGood: true,
  },
  {
    key: "cancelled",
    label: "Cancelled",
    icon: CalendarX2,
    chip: "bg-over-bg text-over",
    upIsGood: false,
  },
  {
    key: "booked",
    label: "Booked",
    icon: CalendarClock,
    chip: "bg-available-bg text-available",
    upIsGood: true,
  },
  {
    key: "hours",
    label: "Hours delivered",
    icon: Clock,
    chip: "bg-watch-bg text-watch",
    upIsGood: true,
  },
];

function Kpis({
  summary,
  missedOnly,
}: {
  summary: SystemReportTable["summary"];
  missedOnly: boolean;
}) {
  return (
    <section aria-label="Headline figures" className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      {kpis.map((k) => {
        const now = summary.current[k.key];
        const before = summary.previous?.[k.key];
        const change =
          before === undefined || before === 0 ? null : ((now - before) / before) * 100;
        const upIsGood = k.key === "visits" && missedOnly ? false : k.upIsGood;
        const good = change !== null && change >= 0 === upIsGood;
        return (
          <div
            key={k.key}
            className="flex items-center gap-4 rounded-card border border-border bg-surface p-4"
          >
            <span className={cn("grid size-12 flex-none place-items-center rounded-card", k.chip)}>
              <k.icon className="size-5.5" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-small font-medium text-ink-700">{k.label}</span>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="type-display text-h2 leading-none text-ink-900">
                  {numberFmt.format(now)}
                </span>
                {change !== null && Math.round(change * 10) !== 0 && (
                  <span
                    title="Against the period just before, the same length"
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold tabular-nums",
                      good ? "bg-healthy-bg text-healthy" : "bg-over-bg text-over",
                    )}
                  >
                    {change > 0 ? (
                      <TrendingUp className="size-3.5" aria-hidden="true" />
                    ) : (
                      <TrendingDown className="size-3.5" aria-hidden="true" />
                    )}
                    {change > 0 ? "+" : ""}
                    {numberFmt.format(change)}%
                  </span>
                )}
              </div>
              {summary.previous && (
                <span className="text-caption text-ink-500">
                  vs {numberFmt.format(before ?? 0)} the period before
                </span>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

/* ------------------------------------------------------------------ report table */

const PAGE_SIZES = [10, 25, 50, 100];

function ReportCard({
  report,
  table,
  filters,
  updating,
}: {
  report: SystemReport;
  table: SystemReportTable;
  filters: SystemReportFilters;
  updating: boolean;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);
  const [busy, setBusy] = useState<"pdf" | "csv" | null>(null);

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

  const pages = Math.max(1, Math.ceil(rows.length / size));
  const at = Math.min(page, pages - 1);
  const shown = rows.slice(at * size, at * size + size);
  const toggle = (col: number) => {
    setPage(0);
    setSort((s) => (s?.col === col ? (s.dir === 1 ? { col, dir: -1 } : null) : { col, dir: 1 }));
  };

  const download = async (format: "pdf" | "csv") => {
    setBusy(format);
    try {
      const res = await fetch(systemReportUrl(report.id, filters, format));
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
        detail: `${format === "pdf" ? "PDF" : "Excel"} · ${periodLabel(filters.from, filters.to)}`,
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

  const Icon = reportIcon[report.id];
  const first = rows.length ? at * size + 1 : 0;
  const last = Math.min(rows.length, (at + 1) * size);
  // Up to five page numbers around the current one.
  const start = Math.max(0, Math.min(at - 2, pages - 5));
  const numbers = Array.from({ length: Math.min(5, pages) }, (_, i) => start + i);

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-card border border-border bg-surface p-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 flex-none place-items-center rounded-control bg-accent-tint text-accent">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-section font-semibold text-ink-900">{report.title}</h2>
            <p className="mt-0.5 text-small text-ink-700">{report.description}</p>
            <p className="mt-1 text-caption text-ink-500">
              {table.period} · {table.filters}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void download("pdf")} disabled={busy !== null || updating}>
            {busy === "pdf" ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="size-4" aria-hidden="true" />
            )}
            {busy === "pdf" ? "Preparing PDF" : "Download PDF"}
          </Button>
          <Button onClick={() => void download("csv")} disabled={busy !== null || updating}>
            {busy === "csv" ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileSpreadsheet className="size-4" aria-hidden="true" />
            )}
            Export Excel
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchField
          label={`Search ${report.title}`}
          placeholder="Search this report…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          className="w-96 max-w-full"
        />
        <p className="flex items-center gap-2 text-caption text-ink-500" aria-live="polite">
          {updating && <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />}
          {updating ? "Updating…" : `${numberFmt.format(table.rows.length)} rows`}
        </p>
      </div>

      {table.rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border-strong p-10 text-center">
          <CalendarCheck2 className="size-6 text-ink-400" aria-hidden="true" />
          <p className="text-small text-ink-700">
            Nothing matches these filters. Try a longer period or reset the filters.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-control border border-border">
          <table className="w-full border-collapse text-small">
            <thead>
              <tr className="bg-accent-tint">
                {table.columns.map((c, i) => (
                  <th
                    key={c.label}
                    scope="col"
                    aria-sort={
                      sort?.col === i ? (sort.dir === 1 ? "ascending" : "descending") : undefined
                    }
                    className={cn(
                      "px-4 py-3 whitespace-nowrap",
                      c.numeric ? "text-right" : "text-left",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(i)}
                      className={cn(
                        "inline-flex cursor-pointer items-center gap-1.5 text-caption font-semibold text-ink-900 hover:text-accent",
                        c.numeric && "flex-row-reverse",
                      )}
                    >
                      {c.label}
                      {sort?.col === i ? (
                        sort.dir === 1 ? (
                          <ArrowUp className="size-3.5 text-accent" aria-hidden="true" />
                        ) : (
                          <ArrowDown className="size-3.5 text-accent" aria-hidden="true" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3.5 text-ink-400" aria-hidden="true" />
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, ri) => (
                <tr
                  key={`${at}-${ri}`}
                  className="border-t border-border transition-colors duration-(--duration-fast) hover:bg-sunken"
                >
                  {r.map((v, i) => (
                    <td
                      key={i}
                      className={cn(
                        "px-4 py-2.5 whitespace-nowrap text-ink-900",
                        table.columns[i]?.numeric && "text-right tabular-nums",
                        table.columns[i]?.strong ? "font-semibold" : i === 0 && "font-medium",
                      )}
                    >
                      <Cell
                        label={table.columns[i]?.label ?? ""}
                        percent={table.columns[i]?.percent}
                        value={v}
                        first={i === 0}
                      />
                    </td>
                  ))}
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td
                    colSpan={table.columns.length}
                    className="p-6 text-center text-small text-ink-500"
                  >
                    No rows match the search.
                  </td>
                </tr>
              )}
            </tbody>
            {table.footer && !query && (
              <tfoot>
                <tr className="border-t-2 border-accent bg-accent-tint">
                  {table.footer.map((v, i) => (
                    <td
                      key={i}
                      className={cn(
                        "px-4 py-3 font-semibold whitespace-nowrap text-ink-900",
                        table.columns[i]?.numeric && "text-right tabular-nums",
                      )}
                    >
                      {i === 0 ? (
                        "Total"
                      ) : table.columns[i]?.percent && typeof v === "number" ? (
                        <Rate value={v} />
                      ) : v === "" ? (
                        ""
                      ) : (
                        show(v)
                      )}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {table.rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-small text-ink-700">
            Showing {numberFmt.format(first)} to {numberFmt.format(last)} of{" "}
            {numberFmt.format(rows.length)} entries
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 text-small text-ink-700">
              Rows per page
              <Select
                aria-label="Rows per page"
                value={size}
                onChange={(e) => {
                  setSize(Number(e.target.value));
                  setPage(0);
                }}
                className="w-20"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </span>
            <nav aria-label="Pages" className="flex items-center gap-1">
              <PageButton label="First page" disabled={at === 0} onClick={() => setPage(0)}>
                <ChevronsLeft className="size-4" aria-hidden="true" />
              </PageButton>
              <PageButton label="Previous page" disabled={at === 0} onClick={() => setPage(at - 1)}>
                <ChevronLeft className="size-4" aria-hidden="true" />
              </PageButton>
              {numbers.map((n) => (
                <PageButton
                  key={n}
                  label={`Page ${n + 1}`}
                  current={n === at}
                  onClick={() => setPage(n)}
                >
                  {n + 1}
                </PageButton>
              ))}
              <PageButton
                label="Next page"
                disabled={at >= pages - 1}
                onClick={() => setPage(at + 1)}
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </PageButton>
              <PageButton
                label="Last page"
                disabled={at >= pages - 1}
                onClick={() => setPage(pages - 1)}
              >
                <ChevronsRight className="size-4" aria-hidden="true" />
              </PageButton>
            </nav>
          </div>
        </div>
      )}
      <p className="text-caption text-ink-500">
        The PDF and Excel files hold every row for these filters, with the total. Each download is
        recorded in the audit trail.
      </p>
    </section>
  );
}

function PageButton({
  label,
  disabled,
  current,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  current?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={current ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid h-9 min-w-9 cursor-pointer place-items-center rounded-control border px-2 text-small font-semibold tabular-nums transition-colors duration-(--duration-fast) disabled:cursor-not-allowed disabled:opacity-40",
        current
          ? "border-transparent bg-accent-fill text-on-accent"
          : "border-border text-ink-700 hover:bg-sunken hover:text-ink-900",
      )}
    >
      {children}
    </button>
  );
}

/** A completion rate as a tinted pill: green from 80%, amber from 60%, red below. */
function Rate({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-caption font-semibold tabular-nums",
        value >= 80
          ? "bg-healthy-bg text-healthy"
          : value >= 60
            ? "bg-watch-bg text-watch"
            : "bg-over-bg text-over",
      )}
    >
      {numberFmt.format(value)}%
    </span>
  );
}

function Cell({
  label,
  percent,
  value,
  first,
}: {
  label: string;
  percent?: boolean;
  value: string | number;
  first: boolean;
}) {
  if (percent) return typeof value === "number" ? <Rate value={value} /> : "—";
  if (label === "Status" && typeof value === "string" && value) {
    return <Tag tone={statusTone[value] ?? "neutral"}>{value}</Tag>;
  }
  if (label === "Therapist" && typeof value === "string" && value) {
    return (
      <span className="inline-flex items-center gap-2">
        <Avatar name={value} size={24} />
        {value}
      </span>
    );
  }
  const RowIcon = first && typeof value === "string" ? typeRowIcon[value] : undefined;
  if (RowIcon) {
    return (
      <span className="inline-flex items-center gap-2.5">
        <span className="grid size-7 place-items-center rounded-control bg-accent-tint text-accent">
          <RowIcon className="size-4" aria-hidden="true" />
        </span>
        {value}
      </span>
    );
  }
  return show(value);
}
