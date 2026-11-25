"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  Download,
  FileClock,
  Minus,
} from "lucide-react";
import { useState, type ReactNode } from "react";
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
  isDelivered,
  domains,
  type Domain,
  type MetricResult,
} from "@/lib/live/reports";
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

const when = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("en-AU", {
        timeZone: "Australia/Brisbane",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(iso))
    : "—";

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
  area: Pick<Area, "headline" | "label">;
  onOpen: () => void;
}) {
  const main = c.run(area.headline[0]);
  const second = c.run(area.headline[1]);
  const move = movement(main);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-w-0 cursor-pointer flex-col gap-1 rounded-card border border-border bg-surface p-4 text-left transition-shadow duration-(--duration-fast) hover:shadow-lift"
    >
      <span className="text-small font-semibold text-ink-900">{main.def.label}</span>
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
        <span className="font-semibold text-accent">{area.label}</span>
      </span>
    </button>
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
    <section className="min-w-0 rounded-card border border-border bg-surface p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-section font-semibold text-ink-900">Activity over time</h2>
          <p className="text-caption text-ink-500">By {c.f.grain.toLowerCase()}</p>
        </div>
        {options.length > 1 && (
          <Segmented label="Measure" value={measure} onChange={setPick} options={options} />
        )}
      </header>
      <div className="mt-3">
        <TrendChart
          label={label}
          data={data}
          xKey="x"
          series={[{ key: "value", label, colour: colour.series1, kind: "area" }]}
          height={240}
        />
      </div>
    </section>
  );
}

/** The default page: where the organisation stands, what needs a look, and what was made lately. */
export function Overview({
  c,
  openArea,
  openSchedules,
  openDownloads,
}: {
  c: Ctx;
  openArea: (id: AreaId) => void;
  openSchedules: () => void;
  openDownloads: () => void;
}) {
  const areas = AREAS.filter((a) => a.id !== "automation" && areaVisible(a, c)).slice(0, 6);
  const attention = c.hub.insights.filter((i) => i.status === "New");
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {areas.map((a) => (
          <Tile key={a.id} c={c} area={a} onOpen={() => openArea(a.id)} />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        <Activity c={c} />
        <section className="min-w-0 rounded-card border border-border bg-surface">
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="text-section font-semibold text-ink-900">Needs attention</h2>
            <span className="text-caption text-ink-500 tabular-nums">{attention.length} new</span>
          </header>
          {attention.length ? (
            <ul className="divide-y divide-border">
              {attention.slice(0, 5).map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    onClick={() => openArea("automation")}
                    className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left hover:bg-sunken"
                  >
                    <span className="min-w-0 flex-1 text-small text-ink-900">{i.title}</span>
                    <Tag tone={SEVERITY[i.severity]}>{i.severity}</Tag>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-small text-ink-500">
              Nothing needs a look right now. Rules check again whenever the data changes.
            </p>
          )}
          {attention.length > 0 && (
            <button
              type="button"
              onClick={() => openArea("automation")}
              className="w-full cursor-pointer border-t border-border px-4 py-2.5 text-left text-caption font-semibold text-accent hover:bg-sunken"
            >
              See all insights
            </button>
          )}
        </section>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <section className="min-w-0 rounded-card border border-border bg-surface">
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="text-section font-semibold text-ink-900">Recent downloads</h2>
            <Button size="sm" variant="ghost" onClick={openDownloads}>
              See all
            </Button>
          </header>
          {c.hub.exports.length ? (
            <ul className="divide-y divide-border">
              {c.hub.exports.slice(0, 3).map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                  <FileClock className="size-4 flex-none text-ink-500" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-small text-ink-900">{e.title}</span>
                  <span className="text-caption text-ink-500">{when(e.generatedAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-small text-ink-500">
              Nothing downloaded yet. Open any report and choose Download.
            </p>
          )}
        </section>
        <section className="min-w-0 rounded-card border border-border bg-surface">
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="text-section font-semibold text-ink-900">Scheduled reports</h2>
            <Button size="sm" variant="ghost" onClick={openSchedules}>
              Manage
            </Button>
          </header>
          {c.hub.schedules.length ? (
            <ul className="divide-y divide-border">
              {c.hub.schedules.slice(0, 3).map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <CalendarClock className="size-4 flex-none text-ink-500" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-small text-ink-900">{s.name}</span>
                  <span className="text-caption text-ink-500">
                    {s.status === "Failed" ? "Failed" : `Next ${when(s.nextRun)}`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-small text-ink-500">
              No scheduled reports. Set one up to have a report sent to you on a timetable.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
