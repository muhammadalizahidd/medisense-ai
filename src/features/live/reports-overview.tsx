"use client";

import {
  Activity,
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  Baby,
  Building2,
  House,
  Layers,
  School,
  Trees,
  Video,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { BarList } from "@/components/charts/bar-list";
import { colour } from "@/components/charts/chart-kit";
import { DonutChart } from "@/components/charts/donut-chart";
import { StackedColumns } from "@/components/charts/stacked-columns";
import { Avatar } from "@/components/ui/premium";
import { cn } from "@/lib/cn";
import { useResource, useSession } from "@/lib/live/client";
import {
  systemOverviewUrl,
  type OverviewFigures,
  type SystemOverview,
  type SystemReportTable,
} from "@/lib/live/system-reports";
import { ErrorNote, Skeleton } from "./bits";
import { FilterBar, useSystemFilters } from "./system-reports";

const numberFmt = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 });
const series = [colour.series1, colour.series2, colour.series3, colour.series4, colour.stone];

const REPORTS = {
  types: "/care/reports/system/types",
  therapy: "/care/reports/system/therapy",
  patients: "/care/reports/system/patients",
  therapists: "/care/reports/system/therapists",
  visits: "/care/reports/system/visits",
} as const;

/**
 * The reports overview: what the system reports hold for one period, in figures and charts.
 * The filters are the same as on every report page and carry across to them.
 */
export function ReportsOverview() {
  const { user } = useSession();
  const [filters, setFilters] = useSystemFilters();
  const allowed = Boolean(user?.permissions.includes("reports.detail.scheduling"));
  const { data, error, reload } = useResource<{ overview: SystemOverview }>(
    allowed ? systemOverviewUrl(filters) : null,
  );
  const o = data?.overview ?? null;
  const request = [
    filters.from,
    filters.to,
    filters.region,
    filters.discipline,
    filters.therapist,
    filters.status,
  ].join("|");
  const fresh = Boolean(o && o.request === request);
  // The filter choices come with each answer; the last ones stay while the next loads.
  const [options, setOptions] = useState<SystemReportTable["options"] | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- keep the latest filter options
    if (o) setOptions(o.options);
  }, [o]);

  if (!user) return <Skeleton className="h-160" />;
  if (!allowed) {
    return (
      <p className="rounded-card border border-dashed border-border-strong bg-surface p-8 text-center text-small text-ink-500">
        Your role doesn&apos;t include the reports overview. Ask a Super Admin for report access.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <h1 className="sr-only">Reports overview</h1>
      <FilterBar filters={filters} onChange={setFilters} options={options} />
      {error && !o ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : !o ? (
        <div className="flex flex-col gap-5" aria-busy="true">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      ) : (
        <div
          className={cn(
            "flex flex-col gap-5 transition-opacity duration-(--duration-base)",
            !fresh && "opacity-60",
          )}
          aria-busy={!fresh}
        >
          <Figures o={o} />
          <div className="grid items-stretch gap-5 xl:grid-cols-[2fr_1fr]">
            <Card
              title="Visits over time"
              hint={`Every visit in ${o.period.toLowerCase() === "all time" ? "all time" : o.period}, by ${o.grain.toLowerCase()} and outcome`}
              href={REPORTS.visits}
              open="Visit reports"
            >
              {o.trend.some((t) => t.completed + t.cancelled + t.dna + t.booked > 0) ? (
                <StackedColumns
                  label="Visits over time"
                  data={o.trend}
                  xKey="label"
                  height={260}
                  series={[
                    { key: "completed", label: "Completed", colour: colour.healthy },
                    { key: "booked", label: "Booked", colour: colour.available },
                    { key: "cancelled", label: "Cancelled", colour: colour.watch },
                    { key: "dna", label: "Did not attend", colour: colour.over },
                  ]}
                />
              ) : (
                <Empty />
              )}
            </Card>
            <Card
              title="Visit status"
              hint="How the period's visits ended up"
              href={REPORTS.visits}
              open="Visit reports"
            >
              {o.statuses.length ? (
                <DonutChart
                  label="Visit status"
                  stacked
                  slices={o.statuses.map((s, i) => ({
                    id: s.label,
                    label: s.label,
                    value: s.value,
                    colour: STATUS_COLOUR[s.label] ?? (series[i % series.length] as string),
                  }))}
                  centre={numberFmt.format(o.summary.current.visits)}
                  centreCaption="visits"
                />
              ) : (
                <Empty />
              )}
            </Card>
          </div>
          <div className="grid items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Card
              title="Appointment types"
              hint="Visits by where care happened"
              href={REPORTS.types}
              open="Appointment type reports"
            >
              {o.byType.some((t) => t.visits > 0) ? (
                <BarList
                  label="Visits by appointment type"
                  labelWidth={150}
                  data={o.byType
                    .filter((t) => t.visits > 0)
                    .map((t) => ({
                      id: t.label,
                      label: t.label,
                      value: t.visits,
                      colour: colour.series1,
                    }))}
                />
              ) : (
                <Empty />
              )}
            </Card>
            <Card
              title="Therapy services"
              hint="Visits by therapy"
              href={REPORTS.therapy}
              open="Therapy service reports"
            >
              {o.byTherapy.length ? (
                <BarList
                  label="Visits by therapy"
                  labelWidth={150}
                  data={o.byTherapy.map((t) => ({
                    id: t.label,
                    label: t.label,
                    value: t.visits,
                    colour: colour.series2,
                  }))}
                />
              ) : (
                <Empty />
              )}
            </Card>
            <Card
              title="Patients visited by funding"
              hint="Patients with a completed visit, by how they're funded"
              href={REPORTS.patients}
              open="Patient reports"
            >
              {o.funding.length ? (
                <DonutChart
                  label="Patients by funding"
                  stacked
                  slices={o.funding.map((f, i) => ({
                    id: f.label,
                    label: f.label,
                    value: f.patients,
                    colour: series[i % series.length] as string,
                  }))}
                  centre={numberFmt.format(o.summary.current.patients)}
                  centreCaption="patients"
                />
              ) : (
                <Empty />
              )}
            </Card>
          </div>
          <div className="grid items-stretch gap-5 xl:grid-cols-[3fr_2fr]">
            <Card
              title="Therapists by hours delivered"
              hint="The eight therapists who gave the most care in the period"
              href={REPORTS.therapists}
              open="Therapist reports"
            >
              {o.topTherapists.length ? <TopTherapists o={o} /> : <Empty />}
            </Card>
            <ReportLinks o={o} />
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_COLOUR: Record<string, string> = {
  Completed: colour.healthy,
  Booked: colour.available,
  Tentative: colour.series4,
  Cancelled: colour.watch,
  "Late cancellation": colour.series3,
  "Did not attend": colour.over,
  Incomplete: colour.stone,
};

/* ------------------------------------------------------------------ figures */

/** The headline cards: all visits, patients visited, then one card per appointment type. */
const FIGURES: {
  label: string;
  icon: LucideIcon;
  chip: string;
  value: (f: OverviewFigures) => number;
}[] = [
  {
    label: "Total visits",
    icon: CalendarDays,
    chip: "bg-accent-tint text-accent",
    value: (f) => f.visits,
  },
  {
    label: "Patients visited",
    icon: UsersRound,
    chip: "bg-available-bg text-available",
    value: (f) => f.patients,
  },
  ...(
    [
      ["Home visits", House],
      ["Telehealth", Video],
      ["School visits", School],
      ["Daycare visits", Baby],
      ["Day Program visits", Building2],
      ["Community visits", Trees],
    ] as const
  ).map(([label, icon]) => ({
    label,
    icon,
    chip: "bg-accent-tint text-accent",
    value: (f: OverviewFigures) => f.types[label] ?? 0,
  })),
];

function Figures({ o }: { o: SystemOverview }) {
  return (
    <section aria-label="Headline figures" className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {FIGURES.map((f) => {
        const now = f.value(o.summary.current);
        const before = o.summary.previous ? f.value(o.summary.previous) : null;
        const change = before ? ((now - before) / before) * 100 : null;
        const shown = change === null ? null : Math.round(change * 10) / 10;
        return (
          <div
            key={f.label}
            className="flex min-w-0 flex-col gap-2 rounded-card border border-border bg-surface p-3.5"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={cn("grid size-7 flex-none place-items-center rounded-control", f.chip)}
              >
                <f.icon className="size-4" aria-hidden="true" />
              </span>
              <span className="truncate text-caption font-semibold text-ink-700">{f.label}</span>
            </span>
            <span className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
              <span className="type-display text-h2 leading-none text-ink-900">
                {numberFmt.format(now)}
              </span>
              {shown !== null && shown !== 0 && (
                <span
                  title="Against the period just before, the same length"
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-caption font-semibold tabular-nums",
                    shown > 0 ? "bg-healthy-bg text-healthy" : "bg-over-bg text-over",
                  )}
                >
                  {shown > 0 ? (
                    <TrendingUp className="size-3" aria-hidden="true" />
                  ) : (
                    <TrendingDown className="size-3" aria-hidden="true" />
                  )}
                  {shown > 0 ? "+" : ""}
                  {numberFmt.format(shown)}%
                </span>
              )}
            </span>
          </div>
        );
      })}
    </section>
  );
}

/* ------------------------------------------------------------------ cards */

function Card({
  title,
  hint,
  href,
  open,
  children,
}: {
  title: string;
  hint: string;
  href: string;
  open: string;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-section font-semibold text-ink-900">{title}</h2>
          <p className="text-caption text-ink-500">{hint}</p>
        </div>
        <Link
          href={href}
          className="inline-flex flex-none items-center gap-1 text-caption font-semibold text-accent hover:underline"
        >
          {open}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </header>
      <div className="flex min-h-0 flex-1 flex-col justify-center">{children}</div>
    </section>
  );
}

function Empty() {
  return <p className="py-10 text-center text-small text-ink-500">Nothing in this period.</p>;
}

function TopTherapists({ o }: { o: SystemOverview }) {
  const top = Math.max(1, ...o.topTherapists.map((t) => t.hours));
  return (
    <ol className="flex flex-col divide-y divide-border">
      {o.topTherapists.map((t) => (
        <li key={t.name} className="flex items-center gap-3 py-2">
          <Avatar name={t.name} size={30} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-small font-semibold text-ink-900">{t.name}</span>
              <span className="flex-none text-small font-semibold text-ink-900 tabular-nums">
                {numberFmt.format(t.hours)} h
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken"
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-full bg-accent-fill"
                  style={{ width: `${(t.hours / top) * 100}%` }}
                />
              </div>
              <span className="w-40 flex-none truncate text-right text-caption text-ink-500">
                {t.discipline} · {t.visits} visits
              </span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Every report page, with the figure it leads with, one click away. */
function ReportLinks({ o }: { o: SystemOverview }) {
  const c = o.summary.current;
  const links: { href: string; title: string; line: string; icon: LucideIcon }[] = [
    {
      href: REPORTS.types,
      title: "Appointment type reports",
      line: `${o.byType.filter((t) => t.visits > 0).length} settings · ${numberFmt.format(c.visits)} visits`,
      icon: Layers,
    },
    {
      href: REPORTS.therapy,
      title: "Therapy service reports",
      line: `${o.byTherapy.length} therapies · ${numberFmt.format(c.hours)} hours`,
      icon: Activity,
    },
    {
      href: REPORTS.patients,
      title: "Patient reports",
      line: `${numberFmt.format(c.patients)} patients visited`,
      icon: UsersRound,
    },
    {
      href: REPORTS.therapists,
      title: "Therapist reports",
      line: `${numberFmt.format(c.therapists)} therapists delivered care`,
      icon: Stethoscope,
    },
    {
      href: REPORTS.visits,
      title: "Visit reports",
      line: `${numberFmt.format(c.cancelled + c.dna)} cancelled or did not attend`,
      icon: CalendarCheck2,
    },
  ];
  return (
    <section className="flex min-w-0 flex-col rounded-card border border-border bg-surface">
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-section font-semibold text-ink-900">Open a report</h2>
        <p className="text-caption text-ink-500">Full tables to search, sort and download</p>
      </header>
      <ul className="flex flex-1 flex-col divide-y divide-border">
        {links.map((l) => (
          <li key={l.href} className="flex-1">
            <Link
              href={l.href}
              className="flex h-full items-center gap-3 px-4 py-3 transition-colors duration-(--duration-fast) hover:bg-sunken"
            >
              <span className="grid size-9 flex-none place-items-center rounded-control bg-accent-tint text-accent">
                <l.icon className="size-4.5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-small font-semibold text-ink-900">{l.title}</span>
                <span className="block truncate text-caption text-ink-500">{l.line}</span>
              </span>
              <ArrowRight className="size-4 flex-none text-ink-400" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
