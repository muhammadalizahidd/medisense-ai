"use client";

import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CalendarPlus,
  ClipboardCheck,
  FileCheck2,
  Layers,
  MapPin,
  ChartColumn,
  CirclePlay,
  UserPlus,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Changed } from "@/components/ai/marks";
import {
  TooltipCard,
  axisProps,
  colour,
  cursorBand,
  gridProps,
} from "@/components/charts/chart-kit";
import { DonutChart } from "@/components/charts/donut-chart";
import { Sparkline } from "@/components/charts/sparkline";
import { allScope, clinicianById } from "@/data/clinicians";
import { currentUser, organisation, summarise } from "@/data/organisation";
import {
  formatTime,
  liveSchedule,
  NOW,
  scheduleDays,
  TODAY as TODAY_COLUMN,
  type ScheduleItem,
} from "@/data/schedule";
import { weeks } from "@/data/weeks";
import { BookVisitSheet } from "@/features/schedule/book-visit";
import { longDate } from "@/lib/clock";
import { cn } from "@/lib/cn";
import { useDemoStore } from "@/state/demo-store";
import { adjustClinician } from "@/state/story-selectors";
import { Panel } from "./blue-overview";

export function useFigures() {
  const notes = useDemoStore((s) => s.caseNotes);
  const tasks = useDemoStore((s) => s.tasks);
  const story = useDemoStore((s) => s.story);
  const live = summarise(allScope, adjustClinician({ caseNotes: notes, tasks, story }));
  const base = summarise(allScope);
  return { live, base, story, tasks };
}

/** Every visit on the live schedule (accepted suggestions, bookings and changes included). */
function useVisits() {
  const suggestions = useDemoStore((s) => s.suggestions);
  const accepted = Object.entries(suggestions)
    .filter(([, v]) => v === "accepted")
    .map(([id]) => id);
  const bookings = useDemoStore((s) => s.bookings);
  const changes = useDemoStore((s) => s.visitChanges);
  return liveSchedule(accepted, bookings, changes).filter(
    (i) => i.type === "Home visit" || i.type === "Telehealth",
  );
}

/* ------------------------------------------------------------------ hero */

export function Hero() {
  const dayOffset = useDemoStore((s) => s.story.dayOffset);
  const [place] = organisation.location.split(" · ");
  const first = currentUser.name.split(" ")[0];

  return (
    <section
      aria-label="Welcome"
      className="flex flex-wrap items-end justify-between gap-6 rounded-card border border-border bg-surface px-5 py-6 md:px-8 md:py-7"
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 label-caps">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
            {longDate(dayOffset)} · {formatTime(NOW)}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
            {place}
          </span>
        </p>
        <h1 className="mt-2 type-display text-h1 text-ink-900 md:text-display">
          Good morning, {first}
        </h1>
        <p className="mt-2 text-body text-ink-700 md:text-[15px]">
          Here&apos;s what&apos;s happening across your service today.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- KPI cards */

function IconBubble({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-11 flex-none items-center justify-center rounded-full bg-accent-tint text-accent"
    >
      <Icon className="size-5.5" strokeWidth={1.75} />
    </span>
  );
}

/** Percentage change, coloured by whether the move is good news rather than its direction. */
function Delta({
  now,
  before,
  upIsGood,
  since,
}: {
  now: number;
  before: number;
  upIsGood: boolean;
  since: string;
}) {
  const change = before ? Math.round(((now - before) / before) * 100) : 0;
  const good = change === 0 || change > 0 === upIsGood;
  const Arrow = change < 0 ? ArrowDown : ArrowUp;
  return (
    <span className="flex items-center gap-1 text-caption text-ink-500">
      <span
        className={cn(
          "flex items-center gap-0.5 font-semibold",
          good ? "text-healthy" : "text-over",
        )}
      >
        {change !== 0 && <Arrow className="size-3.5" strokeWidth={2.25} aria-hidden="true" />}
        {change > 0 ? "+" : change < 0 ? "−" : "±"}
        {Math.abs(change)}%
      </span>
      from {since}
    </span>
  );
}

function KpiCard({
  href,
  icon,
  title,
  value,
  footer,
  visual,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  value: ReactNode;
  footer: ReactNode;
  visual: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex min-w-0 flex-col rounded-card border border-border bg-surface p-5 text-ink-900 hover:border-border-strong hover:text-ink-900 hover:no-underline"
    >
      <span className="flex items-center gap-3">
        <IconBubble icon={icon} />
        <span className="text-small font-semibold text-ink-900">{title}</span>
      </span>
      <span className="mt-3 flex items-end gap-3">
        <span className="min-w-0 flex-1">
          <span className="block type-display text-[34px] leading-10 font-semibold">{value}</span>
          <span className="mt-1.5 block">{footer}</span>
        </span>
        <span className="w-[46%] max-w-32 flex-none">{visual}</span>
      </span>
    </Link>
  );
}

export function KpiCards() {
  const { live, base } = useFigures();
  const visits = useVisits().filter((v) => v.status !== "cancelled");
  const today = visits.filter((v) => v.day === TODAY_COLUMN).length;
  const yesterday = visits.filter((v) => v.day === TODAY_COLUMN - 1).length;
  const perDay = scheduleDays.map((d) => visits.filter((v) => v.day === d.id).length);
  const last = (s: number[]) => s[s.length - 1] ?? 0;
  const prev = (s: number[]) => s[s.length - 2] ?? 0;
  const kpi = (label: string) => live.kpis.find((k) => k.label === label);
  const was = (label: string) => base.kpis.find((k) => k.label === label)?.value;
  const notesNow = Number(kpi("Notes due")?.value ?? 0);
  const utilisation = live.capacity ? Math.round((live.active / live.capacity) * 100) : 0;
  const spark = (values: number[], labels: readonly string[], unit: string) => (
    <Sparkline values={values} labels={labels} colour={colour.series1} height={44} unit={unit} />
  );
  const changed = (label: string) => {
    const k = kpi(label);
    const w = was(label);
    return <Changed value={k?.value ?? "0"} was={w !== k?.value ? w : undefined} />;
  };

  return (
    <section
      aria-label="Key figures"
      className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4"
    >
      <KpiCard
        href="/patients"
        icon={UsersRound}
        title="Active patients"
        value={changed("Active patients")}
        footer={
          <Delta
            now={last(live.series.active)}
            before={prev(live.series.active)}
            upIsGood
            since="last week"
          />
        }
        visual={spark(live.series.active, weeks, "active patients")}
      />
      <KpiCard
        href="/schedule"
        icon={CalendarDays}
        title="Today's appointments"
        value={today}
        footer={<Delta now={today} before={yesterday} upIsGood since="yesterday" />}
        visual={spark(
          perDay,
          scheduleDays.map((d) => d.label),
          "visits",
        )}
      />
      <KpiCard
        href="/case-notes/mia-robinson"
        icon={ClipboardCheck}
        title="Notes due"
        value={changed("Notes due")}
        footer={
          <Delta
            now={notesNow}
            before={prev(live.series.notesDue)}
            upIsGood={false}
            since="last week"
          />
        }
        visual={spark([...live.series.notesDue.slice(0, -1), notesNow], weeks, "notes due")}
      />
      <Link
        href="/team-capacity"
        className="flex min-w-0 flex-col rounded-card border border-border bg-surface p-5 text-ink-900 hover:border-border-strong hover:text-ink-900 hover:no-underline"
      >
        <span className="flex items-center gap-3">
          <IconBubble icon={Users} />
          <span className="text-small font-semibold">Team capacity</span>
        </span>
        <span className="mt-3 block type-display text-[34px] leading-10 font-semibold">
          {utilisation}%
        </span>
        <span
          role="img"
          aria-label={`${live.active} of ${live.capacity} places in use`}
          className="mt-3 block h-2.5 overflow-hidden rounded-full bg-canvas"
        >
          <i
            className="block h-full rounded-full bg-linear-to-r from-accent-fill to-accent-fill-pressed"
            style={{ width: `${Math.min(utilisation, 100)}%` }}
          />
        </span>
        <span className="mt-2 block text-caption text-ink-500">
          {live.active} of {live.capacity} places in use
        </span>
      </Link>
    </section>
  );
}

/* --------------------------------------------------------- quick actions */

type Action = { label: string; icon: LucideIcon } & (
  { href: string; sheet?: never } | { sheet: "visit"; href?: never }
);

const actions: Action[] = [
  { label: "New patient", icon: UserPlus, href: "/care/new" },
  { label: "Book appointment", icon: CalendarPlus, sheet: "visit" },
  { label: "Add clinical note", icon: FileCheck2, href: "/case-notes/mia-robinson" },
  { label: "Create care plan", icon: Layers, href: "/patients" },
  { label: "Log session", icon: CirclePlay, href: "/sessions/oliver-grant" },
  { label: "Generate report", icon: ChartColumn, href: "/reports" },
];

const actionTile =
  "flex min-w-0 cursor-pointer flex-col items-center justify-center gap-2.5 rounded-card border border-border bg-surface px-3 py-5 text-small font-semibold text-ink-900 hover:border-border-strong hover:text-accent hover:no-underline";

export function QuickActions() {
  const router = useRouter();
  const [sheet, setSheet] = useState<"visit" | null>(null);

  return (
    <nav
      aria-label="Quick actions"
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6"
    >
      {actions.map((a) => {
        const body = (
          <>
            <a.icon className="size-7 text-accent" strokeWidth={1.5} aria-hidden="true" />
            <span className="text-center">{a.label}</span>
          </>
        );
        return a.href ? (
          <Link key={a.label} href={a.href} className={actionTile}>
            {body}
          </Link>
        ) : (
          <button
            key={a.label}
            type="button"
            onClick={() => setSheet(a.sheet ?? null)}
            className={actionTile}
          >
            {body}
          </button>
        );
      })}
      {sheet === "visit" && (
        <BookVisitSheet onClose={() => setSheet(null)} onBooked={() => router.push("/schedule")} />
      )}
    </nav>
  );
}

/* ------------------------------------------------------- today's schedule */

function statusOf(item: ScheduleItem) {
  if (item.status === "cancelled") return { label: "Cancelled", pill: "bg-over-bg text-over" };
  if (item.status === "completed")
    return { label: "Completed", pill: "bg-healthy-bg text-healthy" };
  if (item.start <= NOW && NOW < item.start + item.duration)
    return { label: "In progress", pill: "bg-available-bg text-available" };
  return { label: "Scheduled", pill: "bg-canvas text-ink-700" };
}

/** One visit per start time first, then the rest, so a short list shows the shape of the day. */
function spread(visits: ScheduleItem[], count: number) {
  const seen = new Set<number>();
  const first = visits.filter((v) => {
    if (seen.has(v.start)) return false;
    seen.add(v.start);
    return true;
  });
  const rest = visits.filter((v) => !first.includes(v));
  return [...first, ...rest].slice(0, count).sort((a, b) => a.start - b.start);
}

export function TodaysSchedule({ className }: { className?: string }) {
  const visits = useVisits()
    .filter((v) => v.day === TODAY_COLUMN && v.status !== "cancelled")
    .sort((a, b) => a.start - b.start);
  const from = Math.max(
    0,
    visits.findIndex((v) => v.start >= NOW - 60),
  );

  return (
    <Panel
      className={className}
      title="Today's schedule"
      action={{ href: "/schedule", label: "View all" }}
    >
      <ul className="flex-1 divide-y divide-border">
        {spread(visits.slice(from), 5).map((item) => {
          const status = statusOf(item);
          return (
            <li key={item.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="w-16 flex-none text-small whitespace-nowrap text-ink-700">
                {formatTime(item.start)}
              </span>
              <i aria-hidden="true" className="h-8 w-0.5 flex-none rounded-full bg-accent-fill" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-small font-semibold">{item.title}</span>
                <span className="block truncate text-caption text-ink-500">
                  {item.type} · {clinicianById(item.clinicianId)?.name}
                </span>
              </span>
              <span
                className={cn(
                  "flex-none rounded-tag px-2 py-0.5 text-caption font-medium whitespace-nowrap",
                  status.pill,
                )}
              >
                {status.label}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* ---------------------------------------------------------- client status */

export function ClientStatus({ className }: { className?: string }) {
  const { live } = useFigures();
  const atRisk = live.attention.filter((a) => a.priority === "High").length;
  const monitor = live.attention.length - atRisk;
  return (
    <Panel
      className={className}
      title="Patient status"
      action={{ href: "/patients-requiring-attention", label: "View all" }}
    >
      <div className="flex flex-1 items-center">
        <DonutChart
          label="Active patients by status"
          size={150}
          centre={live.active}
          centreCaption="Patients"
          slices={[
            {
              id: "active",
              label: "Active care",
              value: live.active - live.attention.length,
              colour: "var(--color-accent-fill)",
            },
            {
              id: "monitor",
              label: "Watch",
              value: monitor,
              colour: "color-mix(in srgb, var(--color-accent-fill) 55%, white)",
            },
            {
              id: "at-risk",
              label: "At Risk",
              value: atRisk,
              colour: "color-mix(in srgb, var(--color-accent-fill) 28%, white)",
            },
          ]}
        />
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------- caseload overview */

export function CaseloadOverview({ className }: { className?: string }) {
  const visits = useVisits().filter((v) => v.status !== "cancelled");
  const data = scheduleDays.map((d) => ({
    day: d.short,
    label: d.label,
    visits: visits.filter((v) => v.day === d.id).length,
    today: d.id === TODAY_COLUMN,
  }));

  return (
    <Panel
      className={className}
      title="Caseload overview"
      action={{ href: "/schedule", label: "View all" }}
    >
      <p className="-mt-2 mb-2 text-caption text-ink-500">Visits booked per day across the team</p>
      <figure aria-label="Visits booked per day" className="m-0 min-h-52 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -18 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="day" {...axisProps} />
            <YAxis allowDecimals={false} {...axisProps} />
            <Tooltip
              cursor={cursorBand}
              wrapperStyle={{ zIndex: 20 }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as (typeof data)[number] | undefined;
                if (!active || !row) return null;
                return (
                  <TooltipCard
                    title={row.today ? `${row.label} · today` : row.label}
                    rows={[
                      {
                        key: "v",
                        label: "Visits",
                        value: row.visits,
                        colour: "var(--color-accent-fill)",
                      },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="visits" radius={[6, 6, 0, 0]} maxBarSize={34} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell
                  key={d.day}
                  fill={
                    d.today
                      ? "var(--color-accent-fill)"
                      : `color-mix(in srgb, var(--color-accent-fill) ${72 - i * 8}%, white)`
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </figure>
    </Panel>
  );
}
