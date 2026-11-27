"use client";

import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarCheck,
  CalendarX2,
  CircleCheck,
  ClipboardList,
  Clock,
  Gauge,
  Receipt,
  Download,
  FileText,
  ListChecks,
  type LucideIcon,
  Minus,
  TriangleAlert,
  UserPlus,
  UsersRound,
  Wallet,
  Workflow,
} from "lucide-react";
import { createElement, useState, type ReactNode } from "react";
import { BarList } from "@/components/charts/bar-list";
import { DonutChart } from "@/components/charts/donut-chart";
import { StackedColumns } from "@/components/charts/stacked-columns";
import { colour } from "@/components/charts/chart-kit";
import { TrendChart } from "@/components/charts/trend-chart";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Tag, type TagTone } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { reportById } from "@/lib/live/report-catalogue";
import type { InsightDto } from "@/lib/live/report-dto";
import {
  bucketLabel,
  bucketOf,
  bucketsIn,
  dayKey,
  delta,
  formatValue,
  inRange,
  isCancelled,
  isDelivered,
  appointmentModes,
  datePresets,
  presetRange,
  readableRange,
  domains,
  type DatePreset,
  type TimeGrain,
  type Domain,
  type MetricResult,
} from "@/lib/live/reports";
import { DateRangePicker } from "./date-range-picker";
import { AutomationTab } from "./reports-admin";
import {
  AppointmentsTab,
  CapacityTab,
  ClinicalTab,
  FinanceTab,
  ParticipantsTab,
  ReferralsTab,
  TelehealthTab,
} from "./reports-analytics";
import { ExportSheet, type Ctx } from "./reports-bits";
import { SectionProvider, useSection } from "./reports-section";

/* ------------------------------------------------------------------ the areas */

/** The report area a catalogue report belongs to, so areas follow the catalogue, not copies of it. */
const domainOf = (reportId: string): Domain => reportById.get(reportId)?.domain ?? domains[0];

export type AreaId =
  | "patients"
  | "intake"
  | "workforce"
  | "referrals"
  | "participants"
  | "capacity"
  | "visits"
  | "clinical"
  | "finance"
  | "automation";

export type Area = {
  id: AreaId;
  /** The tab's name. */
  label: string;
  title: string;
  /** The area opens for anyone who can read at least one of these. */
  domains: Domain[];
  tables: string[];
  /** The headline number on Overview, then a smaller one beneath it. */
  headline: [string, string];
  Tab: (props: { c: Ctx }) => ReactNode;
};

/** Scheduling and telehealth read as one area, with telehealth a section inside it. */
function VisitsTab({ c }: { c: Ctx }) {
  const s = useSection();
  const sched = c.hub.scope.domains.includes(domainOf("R07"));
  const tele = c.hub.scope.domains.includes(domainOf("R10"));
  if (s.kind === "summary" || s.kind === "measures") {
    return sched ? <AppointmentsTab c={c} /> : <TelehealthTab c={c} />;
  }
  return (
    <>
      {sched && <AppointmentsTab c={c} />}
      {tele && <TelehealthTab c={c} />}
    </>
  );
}

/** Each report family on its own. The pages group some of them (see AREAS). */
const BASE_AREAS: Area[] = [
  {
    id: "referrals",
    label: "Referrals",
    title: "Referrals and intake",
    domains: [domainOf("R01")],
    tables: ["R01", "R02", "R03"],
    headline: ["new-referrals", "missing-info"],
    Tab: ReferralsTab,
  },
  {
    id: "participants",
    label: "Patients",
    title: "Patients and services",
    domains: [domainOf("R04")],
    tables: ["R04", "R05"],
    headline: ["active-participants", "unassigned"],
    Tab: ParticipantsTab,
  },
  {
    id: "capacity",
    label: "Capacity",
    title: "Clinician capacity",
    domains: [domainOf("R06")],
    tables: ["R06"],
    headline: ["utilisation", "delivered-hours"],
    Tab: CapacityTab,
  },
  {
    id: "visits",
    label: "Visits",
    title: "Visits and appointments",
    domains: [domainOf("R07"), domainOf("R10")],
    tables: ["R07", "R08", "R09", "R10"],
    headline: ["delivered", "cancellation-rate"],
    Tab: VisitsTab,
  },
  {
    id: "clinical",
    label: "Assessments",
    title: "Assessments and treatment",
    domains: [domainOf("R11")],
    tables: ["R11", "R12", "R13"],
    headline: ["overdue-notes", "assessment-backlog"],
    Tab: ClinicalTab,
  },
  {
    id: "finance",
    label: "Funding and billing",
    title: "Funding and finance",
    domains: [domainOf("R14")],
    tables: ["R14", "R15", "R16", "R17"],
    headline: ["issued-revenue", "overdue-receivables"],
    Tab: FinanceTab,
  },
  {
    id: "automation",
    label: "Automation",
    title: "Automation and AI",
    // Insights come from every area, so anyone who can read any area sees them.
    domains: [...domains],
    tables: ["R18", "R19", "R20"],
    headline: ["ai-accepted", "tasks-overdue"],
    Tab: AutomationTab,
  },
];

/** Referrals and the patients they become, read as one flow. */
function IntakeTab({ c }: { c: Ctx }) {
  const has = (r: string) => c.hub.scope.domains.includes(domainOf(r));
  return (
    <>
      {has("R01") && <ReferralsTab c={c} />}
      {has("R04") && <ParticipantsTab c={c} />}
    </>
  );
}

const base = (id: AreaId) => {
  const a = BASE_AREAS.find((x) => x.id === id);
  if (!a) throw new Error(`Unknown area ${id}`);
  return a;
};

/** The organisation's report tabs, in the order work flows: intake, visits, clinical, people, money. */
export const AREAS: Area[] = [
  {
    id: "intake",
    label: "Intake and patients",
    title: "Referrals, intake and patients",
    domains: [domainOf("R01"), domainOf("R04")],
    tables: ["R01", "R02", "R03", "R04", "R05"],
    headline: ["new-referrals", "missing-info"],
    Tab: IntakeTab,
  },
  base("visits"),
  { ...base("clinical"), label: "Clinical work" },
  {
    ...base("capacity"),
    id: "workforce",
    label: "Workforce",
    title: "Workforce and capacity",
  },
  { ...base("finance"), label: "Billing and funding" },
  base("automation"),
];

/**
 * Tabs held back from the Reports page for now. Overview still counts and charts them; it just
 * doesn't link into them.
 */
export const HIDDEN_AREAS: ReadonlySet<AreaId> = new Set<AreaId>([
  "intake",
  "finance",
  "visits",
  "clinical",
  "workforce",
  "automation",
]);

/** Any area by id, grouped or not; therapist pages reuse the single families. */
export const areaById = (id: string) =>
  AREAS.find((a) => a.id === id) ?? BASE_AREAS.find((a) => a.id === id);

export const areaVisible = (a: Area, c: Pick<Ctx, "hub">) =>
  a.domains.some((d) => c.hub.scope.domains.includes(d));

/** The reports in an area this person's role may open. */
export const areaTables = (a: Area, c: Ctx) =>
  a.tables.filter((id) => {
    const def = reportById.get(id);
    return def && c.hub.scope.domains.includes(def.domain);
  });

/* ------------------------------------------------------------------ wording */

export const show = (r: MetricResult) =>
  r.value === null ? "N/A" : formatValue(r.value, r.def.unit);

/** How a number moved, in words: "Up 12% on the previous period". Empty when it can't be said. */
export function movement(r: MetricResult) {
  const d = delta(r);
  if (!d) return null;
  const size =
    r.def.unit === "AUD"
      ? formatValue(Math.abs(d.diff), "AUD")
      : r.def.unit === "%"
        ? `${Math.abs(d.diff)} points`
        : String(Math.abs(d.diff));
  return {
    up: d.diff > 0,
    flat: d.diff === 0,
    good: d.good,
    text: d.diff === 0 ? "No change" : `${d.diff > 0 ? "Up" : "Down"} ${size}`,
  };
}

/** One plain sentence about the area, written from its own numbers. */
function takeaway(id: AreaId, c: Ctx) {
  const n = (m: string) => show(c.run(m));
  const trend = (m: string) => {
    const d = movement(c.run(m));
    return d && !d.flat ? `, ${d.up ? "up" : "down"} on the previous period` : "";
  };
  switch (id) {
    case "patients":
      return `${n("caseload")} patients on the caseload, and ${n("patients-seen")} seen in the period. On the caseload but not seen: ${n("caseload-not-seen")}.`;
    case "intake":
      return `${n("new-referrals")} new referrals${trend("new-referrals")}, ${n("missing-info")} waiting on information. ${n("active-participants")} patients are active.`;
    case "workforce":
      return `Clinicians are at ${n("utilisation")} utilisation, with ${n("delivered-hours")} hours of care delivered.`;
    case "referrals":
      return `${n("new-referrals")} new referrals${trend("new-referrals")}. ${n("missing-info")} are waiting on information.`;
    case "participants":
      return `${n("active-participants")} patients are active. ${n("unassigned")} service requests have no therapist yet.`;
    case "capacity":
      return `Clinicians are at ${n("utilisation")} utilisation, with ${n("delivered-hours")} hours of care delivered.`;
    case "visits":
      return `${n("delivered")} sessions delivered${trend("delivered")}. ${n("cancellation-rate")} of bookings were cancelled.`;
    case "clinical":
      return `${n("assessment-backlog")} assessments are open and ${n("overdue-notes")} clinical notes are overdue.`;
    case "finance":
      return `${n("issued-revenue")} invoiced${trend("issued-revenue")}. ${n("overdue-receivables")} is overdue.`;
    case "automation": {
      const fresh = c.hub.insights.filter((i) => i.status === "New").length;
      return `${fresh} new ${fresh === 1 ? "insight" : "insights"} to review.`;
    }
  }
}

/* ------------------------------------------------------------------ an area page */

/** A view inside an area that isn't a catalogue report, such as a list of therapists. */
export type AreaView = { id: string; label: string; node: ReactNode };

/**
 * An area on the page: one sentence, then sub-tabs. "Overview" holds every measure and chart; each
 * report table has its own sub-tab. Nothing opens over the page.
 */
export function AreaPage({
  c,
  area,
  view,
  setView,
  extra = [],
  lead = [],
}: {
  c: Ctx;
  area: Area;
  view: string;
  setView: (v: string) => void;
  /** Views after the report tables. */
  extra?: AreaView[];
  /** Views before Overview, for an area whose main job is a list. */
  lead?: AreaView[];
}) {
  const tables = areaTables(area, c);
  // Telehealth's measures and its table read as one sub-tab when the area also holds scheduling.
  const tele =
    area.id === "visits" && c.hub.scope.domains.includes(domainOf("R07")) && tables.includes("R10");
  const label = (id: string) =>
    tele && id === "R10" ? "Telehealth" : (reportById.get(id)?.title ?? id);
  const options = [
    ...lead.map((v) => ({ id: v.id, label: v.label })),
    { id: "overview", label: "Overview" },
    ...tables.map((id) => ({ id, label: label(id) })),
    ...extra.map((v) => ({ id: v.id, label: v.label })),
  ];
  const current = options.some((o) => o.id === view) ? view : (options[0]?.id ?? "overview");
  const custom = [...lead, ...extra].find((v) => v.id === current);
  const isTable = tables.includes(current);
  // Someone else's reports are never exported from here: an export would use the viewer's scope.
  const reportId = c.readOnly ? null : isTable ? current : null;
  const [downloading, setDownloading] = useState(false);

  const body = custom ? (
    custom.node
  ) : isTable ? (
    <>
      {tele && current === "R10" && (
        <SectionProvider value={{ kind: "measures" }}>
          <TelehealthTab c={c} />
        </SectionProvider>
      )}
      <SectionProvider value={{ kind: "table", id: current }}>
        <area.Tab c={c} />
      </SectionProvider>
    </>
  ) : (
    <SectionProvider value={{ kind: "measures" }}>
      <area.Tab c={c} />
    </SectionProvider>
  );

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="max-w-2xl min-w-0">
            <h2 className="type-display text-h2 text-ink-900">{area.title}</h2>
            <p className="mt-1 text-body text-ink-700">{takeaway(area.id, c)}</p>
          </div>
          {reportId && (
            <Button onClick={() => setDownloading(true)}>
              <Download className="size-4" aria-hidden="true" />
              Download this report
            </Button>
          )}
        </div>
        {options.length > 1 && (
          <div className="max-w-full overflow-x-auto">
            <Segmented
              label={`${area.title} views`}
              value={current}
              onChange={setView}
              options={options}
            />
          </div>
        )}
      </header>
      <div className="flex flex-col gap-5">{body}</div>
      {downloading && reportId && (
        <ExportSheet c={c} reportId={reportId} onClose={() => setDownloading(false)} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ overview */

const SEVERITY: Record<InsightDto["severity"], TagTone> = {
  Info: "neutral",
  Review: "watch",
  "Urgent Operational": "over",
};

export function Tile({
  c,
  area,
  onOpen,
}: {
  c: Ctx;
  area: Pick<Area, "headline" | "label"> & { id?: AreaId };
  onOpen?: () => void;
}) {
  const main = c.run(area.headline[0]);
  const second = c.run(area.headline[1]);
  const move = movement(main);
  const Box = onOpen ? "button" : "div";
  return (
    <Box
      {...(onOpen ? { type: "button" as const, onClick: onOpen } : {})}
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-card border border-border bg-surface p-4 text-left",
        onOpen && "cursor-pointer transition-shadow duration-(--duration-fast) hover:shadow-lift",
      )}
    >
      <span className="flex items-center gap-2.5">
        {"id" in area && area.id && AREA_ICON[area.id] && (
          <span
            className={cn(
              "grid size-9 flex-none place-items-center rounded-control",
              AREA_TONE[area.id] ?? "bg-accent-tint text-accent",
            )}
          >
            {createElement(AREA_ICON[area.id] as LucideIcon, {
              className: "size-4.5",
              "aria-hidden": true,
            })}
          </span>
        )}
        <span className="text-small font-semibold text-ink-900">{main.def.label}</span>
      </span>
      <span
        className={cn(
          "type-display text-h1-compact text-ink-900",
          main.value === null && "text-ink-500",
        )}
      >
        {show(main)}
      </span>
      <span className="min-h-5 text-caption">
        {move ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-semibold",
              move.good === null ? "text-ink-500" : move.good ? "text-healthy" : "text-over",
            )}
          >
            {move.flat ? (
              <Minus className="size-3.5" aria-hidden="true" />
            ) : move.up ? (
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            ) : (
              <ArrowDownRight className="size-3.5" aria-hidden="true" />
            )}
            {move.text} on the previous period
          </span>
        ) : (
          <span className="text-ink-500">No comparison for this period</span>
        )}
      </span>
      <span className="mt-1 flex items-center justify-between gap-2 border-t border-border pt-2 text-caption text-ink-500">
        <span>
          {second.def.label}: <b className="font-semibold text-ink-900">{show(second)}</b>
        </span>
        <span className={cn("font-semibold", onOpen ? "text-accent" : "text-ink-500")}>
          {area.label}
        </span>
      </span>
    </Box>
  );
}

type Measure = "referrals" | "sessions" | "patients" | "revenue";

/** One chart for the organisation, with a switch for what it counts. */
export function Activity({ c }: { c: Ctx }) {
  const has = (d: Domain) => c.hub.scope.domains.includes(d);
  const options: { id: Measure; label: string }[] = [
    ...(has(domainOf("R01")) ? [{ id: "referrals" as const, label: "Referrals" }] : []),
    ...(has(domainOf("R07")) ? [{ id: "sessions" as const, label: "Sessions delivered" }] : []),
    ...(has(domainOf("R04")) ? [{ id: "patients" as const, label: "Patients seen" }] : []),
    ...(has(domainOf("R14")) ? [{ id: "revenue" as const, label: "Revenue invoiced" }] : []),
  ];
  const [pick, setPick] = useState<Measure | null>(null);
  const measure = options.find((o) => o.id === pick)?.id ?? options[0]?.id;
  if (!measure) return null;
  const end = c.f.to < c.hub.today ? c.f.to : c.hub.today;
  const data = bucketsIn(c.f.from, end, c.f.grain).map((b) => {
    const inBucket = (iso: string | null) =>
      Boolean(iso) &&
      inRange(iso as string, c.f.from, c.f.to) &&
      bucketOf(dayKey(iso as string), c.f.grain) === b;
    const value =
      measure === "referrals"
        ? c.facts.referrals.filter((r) => inBucket(r.submittedAt)).length
        : measure === "sessions"
          ? c.facts.appointments.filter((a) => isDelivered(a) && inBucket(a.start)).length
          : measure === "patients"
            ? new Set(
                c.facts.appointments
                  .filter((a) => isDelivered(a) && inBucket(a.start))
                  .map((a) => a.participantId),
              ).size
            : Math.round(
                c.facts.invoices
                  .filter((i) => inBucket(i.issuedAt))
                  .reduce((s, i) => s + i.gross - i.credits, 0),
              );
    return { x: bucketLabel(b, c.f.grain), value };
  });
  const label = options.find((o) => o.id === measure)?.label ?? "";
  return (
    <section className="flex min-w-0 flex-col rounded-card border border-border bg-surface p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-section font-semibold text-ink-900">Activity over time</h2>
          <p className="text-caption text-ink-500">By {c.f.grain.toLowerCase()}</p>
        </div>
        {options.length > 1 && (
          <Segmented label="Measure" value={measure} onChange={setPick} options={options} />
        )}
      </header>
      <div className="mt-3 flex min-h-60 flex-1 flex-col">
        <TrendChart
          label={label}
          data={data}
          xKey="x"
          series={[{ key: "value", label, colour: colour.series1, kind: "area" }]}
          height="fill"
        />
      </div>
    </section>
  );
}

/** Each area's icon and tint on its Overview tile. */
const AREA_ICON: Partial<Record<AreaId, LucideIcon>> = {
  intake: UserPlus,
  visits: CalendarCheck,
  clinical: FileText,
  workforce: UsersRound,
  finance: Wallet,
  automation: Workflow,
};
const AREA_TONE: Partial<Record<AreaId, string>> = {
  intake: "bg-accent-tint text-accent",
  visits: "bg-available-bg text-available",
  clinical: "bg-watch-bg text-watch",
  workforce: "bg-healthy-bg text-healthy",
  finance: "bg-accent-tint text-accent",
  automation: "bg-sunken text-ink-700",
};

/** The headline figures across the whole system, two of each area, five to a row. */
const OVERVIEW_KPIS: { id: string; icon: LucideIcon; tone: string }[] = [
  { id: "new-referrals", icon: UserPlus, tone: "bg-accent-tint text-accent" },
  { id: "active-participants", icon: UsersRound, tone: "bg-accent-tint text-accent" },
  { id: "delivered", icon: CalendarCheck, tone: "bg-available-bg text-available" },
  { id: "cancellation-rate", icon: CalendarX2, tone: "bg-watch-bg text-watch" },
  { id: "overdue-notes", icon: FileText, tone: "bg-over-bg text-over" },
  { id: "assessment-backlog", icon: ClipboardList, tone: "bg-watch-bg text-watch" },
  { id: "utilisation", icon: Gauge, tone: "bg-healthy-bg text-healthy" },
  { id: "delivered-hours", icon: Clock, tone: "bg-healthy-bg text-healthy" },
  { id: "issued-revenue", icon: Wallet, tone: "bg-accent-tint text-accent" },
  { id: "overdue-receivables", icon: Receipt, tone: "bg-over-bg text-over" },
];

/** A compact headline figure: icon and name, the number, and how it moved. */
function Kpi({ r, icon: Icon, tone }: { r: MetricResult; icon: LucideIcon; tone: string }) {
  const move = movement(r);
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-card border border-border bg-surface p-3.5">
      <span className="flex min-w-0 items-center gap-2">
        <span className={cn("grid size-7 flex-none place-items-center rounded-control", tone)}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span className="truncate text-caption font-semibold text-ink-700">{r.def.label}</span>
      </span>
      <span className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <span className="type-display text-h2 leading-none text-ink-900">{show(r)}</span>
        {move && !move.flat && (
          <span
            title="Against the previous period"
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-caption font-semibold tabular-nums",
              move.good === null
                ? "bg-sunken text-ink-700"
                : move.good
                  ? "bg-healthy-bg text-healthy"
                  : "bg-over-bg text-over",
            )}
          >
            {move.up ? (
              <ArrowUpRight className="size-3" aria-hidden="true" />
            ) : (
              <ArrowDownRight className="size-3" aria-hidden="true" />
            )}
            {move.text.replace(/^(Up|Down) /, "")}
          </span>
        )}
      </span>
    </div>
  );
}

/** The periods offered on Overview itself; any other range is set from Filters. */
const QUICK: DatePreset[] = [
  "This Month",
  "Last Month",
  "Last 30 Days",
  "This Quarter",
  "Last Quarter",
];
const GRAINS: TimeGrain[] = ["Week", "Month"];

function PeriodBar({ c }: { c: Ctx }) {
  const pick = (p: DatePreset) => c.setF({ preset: p, ...presetRange(p, c.hub.today) });
  const fresh = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(c.hub.freshness));
  return (
    <section
      aria-label="Report period"
      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 flex-none place-items-center rounded-control bg-accent-tint text-accent">
          <CalendarCheck className="size-4.5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-small font-semibold text-ink-900">
            {c.f.preset === "Custom" ? "Custom dates" : c.f.preset} ·{" "}
            {readableRange(c.f.from, c.f.to)}
          </p>
          <p className="text-caption text-ink-500">
            {c.f.compare === "No comparison"
              ? "No comparison"
              : `Compared with the ${c.f.compare.toLowerCase()}`}{" "}
            · Brisbane time · data as of {fresh}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Period" className="flex flex-wrap gap-1">
          {QUICK.filter((p) => datePresets.includes(p)).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={c.f.preset === p}
              onClick={() => pick(p)}
              className={cn(
                "h-8 cursor-pointer rounded-full px-3 text-small font-medium transition-colors duration-(--duration-fast) active:scale-[0.98]",
                c.f.preset === p
                  ? "bg-accent-fill font-semibold text-on-accent"
                  : "text-ink-700 hover:bg-sunken hover:text-ink-900",
              )}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="w-60">
          <DateRangePicker
            variant="field"
            value={{ from: c.f.from, to: c.f.to }}
            onChange={(r) => {
              if (r.from && r.to) c.setF({ preset: "Custom", from: r.from, to: r.to });
            }}
          />
        </div>
        <Segmented
          label="Chart grouping"
          value={GRAINS.includes(c.f.grain) ? c.f.grain : "Week"}
          onChange={(g) => c.setF({ grain: g })}
          options={GRAINS.map((g) => ({ id: g, label: `By ${g.toLowerCase()}` }))}
        />
      </div>
    </section>
  );
}

/** One area's chart on Overview, with the way into its tab. */
function ChartCard({
  title,
  hint,
  open,
  onOpen,
  children,
}: {
  title: string;
  hint: string;
  open: string;
  onOpen?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-section font-semibold text-ink-900">{title}</h2>
          <p className="text-caption text-ink-500">{hint}</p>
        </div>
        {onOpen && (
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex flex-none cursor-pointer items-center gap-1 text-caption font-semibold text-accent hover:underline"
          >
            {open}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </header>
      <div className="flex min-h-0 flex-1 flex-col justify-center">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-small text-ink-500">{children}</p>;
}

const series = [colour.series1, colour.series2, colour.series3, colour.series4, colour.stone];
const aud = (v: number) => formatValue(v, "AUD");

/** Every chart on Overview, each from the same filtered records and dates as the cards. */
function AreaCharts({ c, opener }: { c: Ctx; opener: (id: AreaId) => (() => void) | undefined }) {
  const has = (r: string) => c.hub.scope.domains.includes(domainOf(r));
  const { from, to, grain } = c.f;
  const end = to < c.hub.today ? to : c.hub.today;
  const buckets = bucketsIn(from, end, grain);
  const within = (iso: string | null) => inRange(iso, from, to);
  const bucketed = (iso: string | null, b: string) =>
    Boolean(iso) && within(iso) && bucketOf(dayKey(iso as string), grain) === b;
  const visits = c.facts.appointments.filter((a) => within(a.start));
  const cards: ReactNode[] = [];

  if (has("R07")) {
    const outcomes = buckets.map((b) => {
      const inB = visits.filter((a) => bucketOf(dayKey(a.start), grain) === b);
      return {
        x: bucketLabel(b, grain),
        completed: inB.filter((a) => a.status === "completed").length,
        cancelled: inB.filter(isCancelled).length,
        dna: inB.filter((a) => a.status === "no-show").length,
      };
    });
    cards.push(
      <ChartCard
        key="outcomes"
        title="Visit outcomes"
        hint={`Completed, cancelled and did not attend, by ${grain.toLowerCase()}`}
        open="Visits"
        onOpen={opener("visits")}
      >
        {outcomes.some((o) => o.completed + o.cancelled + o.dna > 0) ? (
          <StackedColumns
            label="Visit outcomes"
            data={outcomes}
            xKey="x"
            height={230}
            series={[
              { key: "completed", label: "Completed", colour: colour.healthy },
              { key: "cancelled", label: "Cancelled", colour: colour.watch },
              { key: "dna", label: "Did not attend", colour: colour.over },
            ]}
          />
        ) : (
          <Empty>No visits in this period.</Empty>
        )}
      </ChartCard>,
    );
    const modes = appointmentModes
      .map((m) => [m, visits.filter((a) => a.mode === m && !isCancelled(a)).length] as const)
      .filter(([, v]) => v > 0);
    cards.push(
      <ChartCard
        key="modes"
        title="Where care happened"
        hint="Visits by setting, cancellations left out"
        open="Visits"
        onOpen={opener("visits")}
      >
        {modes.length ? (
          <DonutChart
            label="Visits by setting"
            slices={modes.map(([k, v], i) => ({
              id: k,
              label: k,
              value: v,
              colour: series[i % series.length] as string,
            }))}
            centre={modes.reduce((s, [, v]) => s + v, 0)}
            centreCaption="visits"
          />
        ) : (
          <Empty>No visits in this period.</Empty>
        )}
      </ChartCard>,
    );
  }

  if (has("R01")) {
    const byStatus = new Map<string, number>();
    for (const r of c.facts.referrals) {
      if (within(r.submittedAt)) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
    }
    const rows = [...byStatus].sort((a, b) => b[1] - a[1]).slice(0, 7);
    cards.push(
      <ChartCard
        key="referrals"
        title="Referrals by stage"
        hint="Referrals received in the period, where each one is now"
        open="Intake and patients"
        onOpen={opener("intake")}
      >
        {rows.length ? (
          <BarList
            label="Referrals by stage"
            labelWidth={150}
            data={rows.map(([k, v]) => ({ id: k, label: k, value: v, colour: colour.series1 }))}
          />
        ) : (
          <Empty>No referrals received in this period.</Empty>
        )}
      </ChartCard>,
    );
  }

  if (has("R11")) {
    const done = visits.filter((a) => a.status === "completed");
    const notes = [
      ["Signed", done.filter((a) => a.noteStatus === "Final" || a.noteStatus === "Amended")],
      ["Awaiting signature", done.filter((a) => a.noteStatus === "Pending Signature")],
      ["Draft", done.filter((a) => a.noteStatus === "Draft")],
      ["Not written", done.filter((a) => a.noteStatus === "None")],
    ] as const;
    const tones = [colour.healthy, colour.available, colour.watch, colour.over];
    cards.push(
      <ChartCard
        key="notes"
        title="Clinical notes"
        hint="Notes for the visits completed in the period"
        open="Clinical work"
        onOpen={opener("clinical")}
      >
        {done.length ? (
          <DonutChart
            label="Clinical notes"
            slices={notes
              .map(([k, list], i) => ({
                id: k,
                label: k,
                value: list.length,
                colour: tones[i] as string,
              }))
              .filter((s) => s.value > 0)}
            centre={done.length}
            centreCaption="visits"
          />
        ) : (
          <Empty>No completed visits in this period.</Empty>
        )}
      </ChartCard>,
    );
  }

  if (has("R06")) {
    const hours = new Map<string, number>();
    for (const a of visits) {
      if (!isDelivered(a)) continue;
      const m = a.deliveredMinutes ?? a.scheduledMinutes;
      hours.set(a.discipline, (hours.get(a.discipline) ?? 0) + m / 60);
    }
    const rows = [...hours].sort((a, b) => b[1] - a[1]).slice(0, 7);
    cards.push(
      <ChartCard
        key="hours"
        title="Hours delivered by therapy"
        hint="Verified clinical hours in the period"
        open="Workforce"
        onOpen={opener("workforce")}
      >
        {rows.length ? (
          <BarList
            label="Hours delivered by therapy"
            labelWidth={150}
            format={(v) => `${Math.round(v * 10) / 10} h`}
            data={rows.map(([k, v]) => ({
              id: k,
              label: k,
              value: Math.round(v * 10) / 10,
              colour: colour.series2,
            }))}
          />
        ) : (
          <Empty>No hours delivered in this period.</Empty>
        )}
      </ChartCard>,
    );
  }

  if (has("R14")) {
    const money = buckets.map((b) => ({
      x: bucketLabel(b, grain),
      invoiced: Math.round(
        c.facts.invoices
          .filter((i) => bucketed(i.issuedAt, b))
          .reduce((s, i) => s + i.gross - i.credits, 0),
      ),
      received: Math.round(
        c.facts.payments.filter((p) => bucketed(p.receivedOn, b)).reduce((s, p) => s + p.amount, 0),
      ),
    }));
    cards.push(
      <ChartCard
        key="money"
        title="Invoiced and received"
        hint={`Money invoiced and payments received, by ${grain.toLowerCase()}`}
        open="Billing and funding"
        onOpen={opener("finance")}
      >
        <TrendChart
          label="Invoiced and received"
          data={money}
          xKey="x"
          height={230}
          format={aud}
          series={[
            { key: "invoiced", label: "Invoiced", colour: colour.series1, kind: "area" },
            { key: "received", label: "Received", colour: colour.healthy, kind: "line" },
          ]}
        />
      </ChartCard>,
    );
  }

  if (!cards.length) return null;
  return (
    <div
      className={cn(
        "grid gap-5",
        cards.length === 1
          ? ""
          : cards.length % 3 === 0
            ? "md:grid-cols-2 xl:grid-cols-3"
            : "md:grid-cols-2",
      )}
    >
      {cards}
    </div>
  );
}

/** What needs someone now: new insights, then the open work behind them. */
function NeedsAttention({
  c,
  opener,
}: {
  c: Ctx;
  opener: (id: AreaId) => (() => void) | undefined;
}) {
  const attention = c.hub.insights.filter((i) => i.status === "New");
  const work = (
    [
      ["tasks-overdue", "automation"],
      ["missing-info", "intake"],
      ["unassigned", "intake"],
      ["funding-exceptions", "finance"],
    ] as const
  )
    .map(([id, area]) => ({ r: c.run(id), area }))
    .filter((w) => w.r.value !== null);
  return (
    <section className="flex min-w-0 flex-col rounded-card border border-border bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-section font-semibold text-ink-900">
          <TriangleAlert className="size-4 text-over" aria-hidden="true" />
          Needs attention
        </h2>
        <span className="rounded-full bg-over-bg px-2 py-0.5 text-caption font-semibold text-over tabular-nums">
          {attention.length} new
        </span>
      </header>
      {attention.length ? (
        <ul className="divide-y divide-border">
          {attention.slice(0, 4).map((i) => (
            <li key={i.id}>
              <div className="flex w-full items-start gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 text-small text-ink-900">{i.title}</span>
                <Tag tone={SEVERITY[i.severity]}>{i.severity}</Tag>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 px-4 py-4 text-small text-ink-500">
          <CircleCheck className="size-4 text-healthy" aria-hidden="true" />
          Nothing new needs a look.
        </p>
      )}
      {work.length > 0 && (
        <div className="mt-auto border-t border-border p-4">
          <p className="mb-2 flex items-center gap-1.5 label-caps text-ink-500">
            <ListChecks className="size-3.5" aria-hidden="true" />
            Open work
          </p>
          <div className="grid grid-cols-2 gap-2">
            {work.map(({ r, area }) => {
              const go = opener(area);
              const Box = go ? "button" : "div";
              return (
                <Box
                  key={r.def.id}
                  {...(go ? { type: "button" as const, onClick: go } : {})}
                  className={cn(
                    "flex flex-col gap-0.5 rounded-control bg-sunken px-3 py-2 text-left",
                    go &&
                      "cursor-pointer transition-colors duration-(--duration-fast) hover:bg-accent-tint",
                  )}
                >
                  <span className="text-h2 leading-none font-semibold text-ink-900 tabular-nums">
                    {show(r)}
                  </span>
                  <span className="text-caption text-ink-700">{r.def.label}</span>
                </Box>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * The default page: a summary of every tab. One period bar sets the dates for everything below:
 * a tile per tab, the activity trend with what needs attention, then one chart per area.
 */
export function Overview({
  c,
  openArea,
}: {
  c: Ctx;
  openArea: (id: AreaId) => void;
  openSchedules?: () => void;
  openDownloads?: () => void;
}) {
  // Hidden tabs keep their numbers here, without a link into them.
  const opener = (id: AreaId) => (HIDDEN_AREAS.has(id) ? undefined : () => openArea(id));
  const kpis = OVERVIEW_KPIS.map((k) => ({ ...k, r: c.run(k.id) })).filter(
    (k) => k.r.value !== null,
  );
  return (
    <div className="flex flex-col gap-5">
      <PeriodBar c={c} />
      <section
        aria-label="Headline figures"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
      >
        {kpis.map((k) => (
          <Kpi key={k.id} r={k.r} icon={k.icon} tone={k.tone} />
        ))}
      </section>
      <div className="grid items-stretch gap-5 xl:grid-cols-[2fr_1fr]">
        <Activity c={c} />
        <NeedsAttention c={c} opener={opener} />
      </div>
      <AreaCharts c={c} opener={opener} />
    </div>
  );
}
