"use client";

import { useAiEnabled } from "@/components/ai/ai-switch";
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  Copy,
  Globe2,
  History,
  Link2,
  MapPin,
  MonitorPlay,
  Send,
  ShieldAlert,
  UserRound,
  UserRoundPlus,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/premium";
import { MetricBand } from "@/components/ui/metric-band";
import { PageHeader } from "@/components/ui/page";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { Sheet } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { cancelReasons } from "@/lib/live/catalogue";
import { api, useNow, useResource } from "@/lib/live/client";
import {
  assignmentModes,
  bookingStatuses,
  TIMEZONE_LABEL,
  type AssignmentMode,
  type BookingStatus,
  type ScheduleBoardDto,
  type ScheduleEventDto,
} from "@/lib/live/scheduling";
import { relativeTime } from "@/lib/live/time";
import { cn } from "@/lib/cn";
import { BookingWizard } from "./booking-wizard";
import { BookVisitPanel } from "./quick-book";
import { ExceptionsPanel, RemindersPanel, ResourcesPanel } from "./schedule-panels";
import { EmptyNote, ErrorNote, LiveBadge, Skeleton } from "./bits";
import { TextArea, Tick } from "./form-bits";

/* ------------------------------------------------------------ Brisbane time */

const TZ = "Australia/Brisbane";
const OFFSET = 10 * 3_600_000;
const DAY = 86_400_000;
/** Midnight Brisbane, as a UTC timestamp. */
const dayStart = (ms: number) => Math.floor((ms + OFFSET) / DAY) * DAY - OFFSET;
const keyOf = (ms: number) => new Date(ms + OFFSET).toISOString().slice(0, 10);
const minutesOf = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + OFFSET);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
const weekdayOf = (ms: number) => ((new Date(ms + OFFSET).getUTCDay() + 6) % 7) + 1;
const fmt = (ms: number | string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-AU", { timeZone: TZ, ...opts }).format(new Date(ms));
const time = (iso: string) => fmt(iso, { hour: "numeric", minute: "2-digit" });

const START_HOUR = 8;
const END_HOUR = 18;

type View = "day" | "week" | "month";

/** Scheduling is four pages in the menu; each shows one of these. */
export type ScheduleSection = "calendar" | "resources" | "reminders" | "exceptions";

const SECTION_TITLE: Record<ScheduleSection, string> = {
  calendar: "Scheduling calendar",
  resources: "Resources and leave",
  reminders: "Reminders",
  exceptions: "Exceptions and audit",
};

/** How many clinicians a day or week view lists at a time. */
const PAGE_SIZE = 10;

const statusStyle: Record<BookingStatus, string> = {
  Held: "border-l-watch-dot bg-watch-bg text-ink-900",
  Confirmed: "border-l-accent-fill bg-accent-tint text-ink-900",
  "In Progress": "border-l-live-dot bg-healthy-bg text-ink-900",
  Completed: "border-l-healthy-dot bg-healthy-bg/70 text-ink-700",
  "Unable to Complete": "border-l-over-dot bg-over-bg text-ink-900",
  Cancelled: "border-l-border-strong bg-sunken text-ink-500 line-through",
  "No-show": "border-l-over-dot bg-over-bg text-ink-700",
  Rescheduled: "border-l-border-strong bg-sunken text-ink-500",
};
const statusTone: Record<
  BookingStatus,
  "watch" | "monitor" | "live" | "healthy" | "over" | "neutral"
> = {
  Held: "watch",
  Confirmed: "monitor",
  "In Progress": "live",
  Completed: "healthy",
  "Unable to Complete": "over",
  Cancelled: "neutral",
  "No-show": "over",
  Rescheduled: "neutral",
};

/* ------------------------------------------------------------------ board */

export function ScheduleBoard({ section = "calendar" }: { section?: ScheduleSection }) {
  const ai = useAiEnabled();
  const [view, setView] = useState<View>("day");
  const [anchor, setAnchor] = useState(() => dayStart(Date.now()));
  const [clinician, setClinician] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [mode, setMode] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<ScheduleEventDto | null>(null);
  const [booking, setBooking] = useState<ScheduleBoardDto["unscheduled"][number] | null>(null);
  const [moving, setMoving] = useState<{ e: ScheduleEventDto; start: string } | null>(null);
  const [quick, setQuick] = useState(false);
  // Old links named a tab (?tab=reminders); each tab is its own page now.
  useEffect(() => {
    if (section !== "calendar") return;
    const old = new URLSearchParams(window.location.search).get("tab");
    if (old === "resources" || old === "reminders" || old === "exceptions") {
      window.location.replace(`/care/schedule/${old}`);
    }
  }, [section]);

  // The period on screen, fetched with a margin so switching views keeps data.
  const range = useMemo(() => {
    if (view === "day") return { from: anchor, to: anchor + DAY, days: [anchor] };
    if (view === "week") {
      const monday = anchor - (weekdayOf(anchor) - 1) * DAY;
      return {
        from: monday,
        to: monday + 7 * DAY,
        days: [0, 1, 2, 3, 4].map((i) => monday + i * DAY),
      };
    }
    const first = dayStart(Date.parse(`${keyOf(anchor).slice(0, 8)}01T00:00:00+10:00`));
    const gridStart = first - (weekdayOf(first) - 1) * DAY;
    return {
      from: gridStart,
      to: gridStart + 42 * DAY,
      days: Array.from({ length: 42 }, (_, i) => gridStart + i * DAY),
    };
  }, [view, anchor]);

  const now = useNow() ?? anchor;
  const monday = keyOf(anchor - (weekdayOf(anchor) - 1) * DAY);
  const fetchFrom = Math.min(range.from, dayStart(now) - 7 * DAY);
  const fetchTo = Math.max(range.to, dayStart(now) + 8 * DAY);
  const { data, error, loading, reload } = useResource<{ board: ScheduleBoardDto }>(
    `/api/care/schedule?from=${new Date(fetchFrom).toISOString()}&to=${new Date(fetchTo).toISOString()}`,
    (e) => e.type === "care",
  );
  const board = data?.board;
  const events = (board?.events ?? []).filter(
    (e) =>
      (!clinician || e.therapistId === clinician) &&
      (!discipline || e.discipline === discipline) &&
      (!mode || e.modality === mode) &&
      (!status || e.status === status),
  );
  const inRange = events.filter((e) => {
    const s = new Date(e.start).getTime();
    return s >= range.from && s < range.to;
  });
  const exceptions = (board?.events ?? []).filter((e) =>
    e.flags.some(
      (f) =>
        f.kind === "conflict" || f.kind === "leave" || f.kind === "blocked" || f.kind === "change",
    ),
  );
  const filtering = Boolean(clinician || discipline || mode || status);

  function step(dir: -1 | 1) {
    if (view === "day") setAnchor((a) => a + dir * DAY);
    else if (view === "week") setAnchor((a) => a + dir * 7 * DAY);
    else {
      const d = new Date(anchor + OFFSET);
      d.setUTCMonth(d.getUTCMonth() + dir, 1);
      setAnchor(dayStart(d.getTime() - OFFSET));
    }
  }
  const label =
    view === "day"
      ? fmt(anchor, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : view === "week"
        ? `${fmt(range.days[0]!, { day: "numeric", month: "short" })} – ${fmt(range.days[4]!, { day: "numeric", month: "short", year: "numeric" })}`
        : fmt(anchor, { month: "long", year: "numeric" });

  async function changeMode(next: AssignmentMode) {
    try {
      await api("/api/care/schedule", { body: { mode: next } });
      toast(`Assignment mode: ${next}`, { tone: "success" });
      reload();
    } catch (e) {
      toast("Couldn't change the mode", {
        tone: "error",
        detail: e instanceof Error ? e.message : "",
      });
    }
  }

  const disciplines = [...new Set((board?.therapists ?? []).map((t) => t.discipline))].sort();

  return (
    <>
      <PageHeader
        eyebrow="Scheduling"
        title={SECTION_TITLE[section]}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="primary" onClick={() => setQuick(true)}>
              <UserRoundPlus className="size-4" aria-hidden="true" />
              Book a visit
            </Button>
            <LiveBadge />
            <span className="inline-flex items-center gap-1.5 text-caption text-ink-500">
              <Globe2 className="size-3.5" aria-hidden="true" /> {TIMEZONE_LABEL}
            </span>
            {board && (
              <div className="flex items-center gap-2">
                <span className="text-caption font-semibold text-ink-500">Assignment</span>
                <Segmented
                  label="Assignment mode"
                  value={board.mode}
                  onChange={changeMode}
                  options={assignmentModes
                    .filter((m) => ai || m !== "AI Assisted")
                    .map((m) => ({
                      id: m,
                      label: m === "Rules-Based Auto" ? "Auto" : m,
                    }))}
                />
              </div>
            )}
          </div>
        }
      />

      {board && (
        <MetricBand
          size="stat-sm"
          label="Scheduling figures"
          metrics={[
            { label: "Today", value: board.counts.today },
            { label: "Next 7 days", value: board.counts.week },
            {
              label: "To book",
              value: board.counts.unscheduled,
              tone: "over",
              flagged: board.counts.unscheduled > 0,
            },
            { label: "Awaiting clinician", value: board.counts.pending },
            {
              label: "Exceptions",
              value: board.counts.exceptions,
              tone: "over",
              flagged: board.counts.exceptions > 0,
            },
            {
              label: "Reminders failed",
              value: board.counts.remindersFailed,
              tone: "monitor",
              flagged: board.counts.remindersFailed > 0,
            },
          ]}
        />
      )}

      {quick && (
        <Sheet
          title="Book a visit"
          description="For an existing patient with their own clinician, or someone new from a name and phone."
          onClose={() => {
            setQuick(false);
            reload();
          }}
        >
          <BookVisitPanel onDone={() => reload()} />
        </Sheet>
      )}

      {section === "resources" && (
        <div className="mt-6">
          <ResourcesPanel monday={monday} onWeek={(dir) => setAnchor((a) => a + dir * 7 * DAY)} />
        </div>
      )}
      {section === "reminders" && (
        <div className="mt-6">
          {board ? (
            <RemindersPanel board={board} onChanged={reload} />
          ) : (
            <Skeleton className="h-96" />
          )}
        </div>
      )}
      {section === "exceptions" && (
        <div className="mt-6">
          {board ? (
            <ExceptionsPanel board={board} monday={monday} onOpen={setOpen} />
          ) : (
            <Skeleton className="h-96" />
          )}
        </div>
      )}
      {section === "calendar" && (
        <div className="mt-6 flex flex-col gap-4">
          {board?.restricted && (
            <p className="rounded-control bg-canvas px-4 py-2.5 text-small text-ink-700">
              Finance view: site, safety and clinical details are hidden. Times, people and outcomes
              only.
            </p>
          )}
          {/* The calendar takes the full width; the booking queues sit in a row beneath it. */}
          <div className="flex flex-col gap-6">
            <section className="min-w-0 rounded-card border border-border bg-surface shadow-lift">
              <div className="flex flex-col gap-3 border-b border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Segmented
                      label="Calendar view"
                      value={view}
                      onChange={setView}
                      options={[
                        { id: "day", label: "Day" },
                        { id: "week", label: "Week" },
                        { id: "month", label: "Month" },
                      ]}
                    />
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label="Previous"
                        onClick={() => step(-1)}
                        className="flex size-9 cursor-pointer items-center justify-center rounded-control border border-border-strong transition-all hover:border-accent hover:text-accent active:scale-95"
                      >
                        <ChevronLeft className="size-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setAnchor(dayStart(Date.now()))}
                        className="h-9 cursor-pointer rounded-control border border-border-strong px-3 text-small font-semibold transition-all hover:border-accent hover:text-accent active:scale-95"
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        aria-label="Next"
                        onClick={() => step(1)}
                        className="flex size-9 cursor-pointer items-center justify-center rounded-control border border-border-strong transition-all hover:border-accent hover:text-accent active:scale-95"
                      >
                        <ChevronRight className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <h2 className="type-display text-h2 text-ink-900">{label}</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <span className="mr-1 text-caption font-semibold tracking-wide text-ink-500 uppercase">
                    Filter
                  </span>
                  <div className="w-48 flex-none">
                    <Select
                      aria-label="Clinician"
                      className="h-9"
                      value={clinician}
                      onChange={(e) => setClinician(e.target.value)}
                    >
                      <option value="">Any clinician</option>
                      {(board?.therapists ?? []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="w-48 flex-none">
                    <Select
                      aria-label="Therapy type"
                      className="h-9"
                      value={discipline}
                      onChange={(e) => setDiscipline(e.target.value)}
                    >
                      <option value="">Any therapy type</option>
                      {disciplines.map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="w-40 flex-none">
                    <Select
                      aria-label="Visit mode"
                      className="h-9"
                      value={mode}
                      onChange={(e) => setMode(e.target.value)}
                    >
                      <option value="">In person or video</option>
                      <option value="In person">In person</option>
                      <option value="Telehealth">Telehealth</option>
                    </Select>
                  </div>
                  <div className="w-40 flex-none">
                    <Select
                      aria-label="Status"
                      className="h-9"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="">Any status</option>
                      {bookingStatuses.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </Select>
                  </div>
                  {filtering && (
                    <button
                      type="button"
                      onClick={() => {
                        setClinician("");
                        setDiscipline("");
                        setMode("");
                        setStatus("");
                      }}
                      className="h-9 cursor-pointer px-2 text-small font-semibold text-accent"
                    >
                      Clear filters
                    </button>
                  )}
                  <span className="ml-auto text-caption text-ink-500">
                    {inRange.length} in view
                  </span>
                </div>
              </div>
              {error && !data ? (
                <div className="p-6">
                  <ErrorNote message={error} onRetry={reload} />
                </div>
              ) : loading && !data ? (
                <div className="p-4">
                  <Skeleton className="h-[560px]" />
                </div>
              ) : view === "month" ? (
                <MonthGrid
                  days={range.days}
                  anchor={anchor}
                  events={events}
                  onOpen={setOpen}
                  onDay={(d) => {
                    setAnchor(d);
                    setView("day");
                  }}
                />
              ) : (
                <TeamTimeline
                  key={view}
                  days={view === "day" ? [range.days[0]!] : range.days}
                  events={events}
                  therapists={(board?.therapists ?? []).filter(
                    (t) =>
                      (!clinician || t.id === clinician) &&
                      (!discipline || t.discipline === discipline),
                  )}
                  onOpen={setOpen}
                  onMove={(e, start) => setMoving({ e, start })}
                />
              )}
            </section>

            <aside className="grid items-stretch gap-6 lg:grid-cols-3" aria-label="Booking queues">
              <RailCard title="To book" count={board?.unscheduled.length ?? 0} tone="over">
                {(board?.unscheduled ?? []).length === 0 ? (
                  <p className="px-4 py-6 text-center text-small text-ink-500">
                    Every accepted service has a clinician or a request.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {board!.unscheduled.map((u) => (
                      <li
                        key={u.needId}
                        className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-canvas"
                      >
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/care/${u.clientId}`}
                            className="text-small font-semibold text-ink-900"
                          >
                            {u.patient}
                          </Link>
                          <p className="text-caption text-ink-500">
                            {u.support} · {u.frequency} · {u.location}
                          </p>
                          <p className="mt-1 flex flex-wrap gap-1">
                            {u.risk && <Tag tone="over">Risk review</Tag>}
                            {u.funding !== "Verified" && (
                              <Tag tone="watch">
                                Funding {u.funding === "Exception" ? "exception" : "not reviewed"}
                              </Tag>
                            )}
                            {u.readiness && (
                              <Link
                                href={`/care/funding/${u.clientId}?tab=readiness`}
                                title={u.blockers?.join(" · ") || "All gates clear"}
                                className="hover:no-underline"
                              >
                                <Tag
                                  tone={
                                    u.readiness === "Ready"
                                      ? "healthy"
                                      : u.readiness === "Blocked"
                                        ? "over"
                                        : "watch"
                                  }
                                >
                                  {u.readiness === "Ready"
                                    ? "Booking ready"
                                    : `Booking ${u.readiness.toLowerCase()}`}
                                </Tag>
                              </Link>
                            )}
                          </p>
                        </div>
                        <Button size="sm" variant="primary" onClick={() => setBooking(u)}>
                          Book
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </RailCard>
              <RailCard title="Exceptions" count={exceptions.length} tone="over">
                {exceptions.length === 0 ? (
                  <p className="px-4 py-6 text-center text-small text-ink-500">
                    No clashes, leave conflicts or change requests.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {exceptions.slice(0, 12).map((e) => (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={() => setOpen(e)}
                          className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-canvas"
                        >
                          <AlertTriangle
                            className="mt-0.5 size-4 flex-none text-over"
                            aria-hidden="true"
                          />
                          <span className="min-w-0">
                            <span className="block text-small font-semibold text-ink-900">
                              {e.ref} · {e.patient}
                            </span>
                            <span className="block text-caption text-ink-700">
                              {
                                e.flags.find((f) => f.kind !== "risk" && f.kind !== "funding")
                                  ?.label
                              }
                            </span>
                            <span className="block text-caption text-ink-500">
                              {fmt(e.start, {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </RailCard>
              <RailCard title="Awaiting clinician" count={board?.pending.length ?? 0}>
                {(board?.pending ?? []).length === 0 ? (
                  <p className="px-4 py-6 text-center text-small text-ink-500">
                    No requests waiting.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {board!.pending.map((p, i) => (
                      <li key={i} className="px-4 py-3">
                        <p className="text-small font-semibold text-ink-900">{p.patient}</p>
                        <p className="text-caption text-ink-500">
                          {p.support} · asked {p.therapist} {relativeTime(p.since)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </RailCard>
            </aside>
          </div>
        </div>
      )}

      {moving && (
        <MoveSheet
          move={moving}
          onClose={() => setMoving(null)}
          onDone={() => {
            setMoving(null);
            reload();
          }}
        />
      )}
      {open && (
        <AppointmentSheet
          event={(board?.events ?? []).find((e) => e.id === open.id) ?? open}
          onClose={() => setOpen(null)}
          onChanged={reload}
        />
      )}
      {booking && (
        <BookingWizard
          item={booking}
          mode={board?.mode ?? (ai ? "AI Assisted" : "Manual")}
          onClose={() => setBooking(null)}
          onBooked={() => {
            setBooking(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function RailCard({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count: number;
  tone?: "over";
  children: React.ReactNode;
}) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-card border border-border bg-surface shadow-lift">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-small font-semibold text-ink-900">{title}</h3>
        <span
          className={cn(
            "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-label font-semibold",
            count && tone === "over" ? "bg-over-bg text-over" : "bg-sunken text-ink-700",
          )}
        >
          {count}
        </span>
      </header>
      <div className="max-h-80 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

function EventCard({
  e,
  onOpen,
  compact,
  movable,
}: {
  e: ScheduleEventDto;
  onOpen: (e: ScheduleEventDto) => void;
  compact?: boolean;
  movable?: boolean;
}) {
  const warn = e.flags.some(
    (f) =>
      f.kind === "conflict" || f.kind === "leave" || f.kind === "blocked" || f.kind === "change",
  );
  return (
    <button
      type="button"
      onClick={() => onOpen(e)}
      data-no-photo
      draggable={movable}
      onDragStart={(ev) => {
        ev.dataTransfer.setData("text/plain", e.id);
        ev.dataTransfer.effectAllowed = "move";
      }}
      title={`${e.ref} · ${e.patient} · ${e.support} · ${e.status}${movable ? " · drag to move" : ""}`}
      className={cn(
        movable && "active:cursor-grabbing",
        "group flex h-full w-full cursor-pointer flex-col justify-start overflow-hidden rounded-control border-l-[3px] px-2.5 py-1.5 text-left transition-all duration-(--duration-fast) hover:z-10 hover:-translate-y-px hover:shadow-lift focus-visible:z-10",
        statusStyle[e.status],
      )}
    >
      <span className="flex items-center gap-1.5">
        <span className="flex-none text-caption font-semibold text-ink-700 tabular-nums">
          {time(e.start)}
        </span>
        {e.modality === "Telehealth" && (
          <MonitorPlay className="size-3.5 flex-none text-ink-500" aria-label="Telehealth" />
        )}
        {warn && (
          <CircleAlert
            className="ml-auto size-3.5 flex-none text-over"
            aria-label="Has an exception"
          />
        )}
      </span>
      <span className="truncate text-small leading-tight font-semibold">{e.patient}</span>
      {!compact && (
        <span className="truncate text-caption leading-tight text-ink-500">
          {e.therapist.split(" ")[0]} · {e.support}
        </span>
      )}
    </button>
  );
}

function MonthGrid({
  days,
  anchor,
  events,
  onOpen,
  onDay,
}: {
  days: number[];
  anchor: number;
  events: ScheduleEventDto[];
  onOpen: (e: ScheduleEventDto) => void;
  onDay: (d: number) => void;
}) {
  const now = useNow() ?? 0;
  const month = keyOf(anchor).slice(0, 7);
  return (
    <div className="grid h-[600px] grid-cols-7 grid-rows-[auto_repeat(6,1fr)]">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
        <div
          key={d}
          className="border-b border-border px-3 py-2 text-caption font-semibold text-ink-500"
        >
          {d}
        </div>
      ))}
      {days.map((d) => {
        const key = keyOf(d);
        const list = events.filter((e) => keyOf(new Date(e.start).getTime()) === key);
        const today = key === keyOf(now);
        return (
          <div
            key={d}
            className={cn(
              "flex min-h-0 flex-col gap-1 border-b border-l border-border p-1.5 first:border-l-0",
              key.slice(0, 7) !== month && "bg-canvas/60",
            )}
          >
            <button
              type="button"
              onClick={() => onDay(d)}
              className={cn(
                "w-fit cursor-pointer rounded-full px-1.5 text-caption font-semibold transition-colors hover:bg-accent-tint hover:text-accent",
                today
                  ? "bg-accent-fill text-on-accent"
                  : key.slice(0, 7) === month
                    ? "text-ink-900"
                    : "text-ink-500",
              )}
            >
              {Number(key.slice(8))}
            </button>
            {list.slice(0, 3).map((e) => (
              <div key={e.id} className="h-6">
                <EventCard e={e} onOpen={onOpen} compact />
              </div>
            ))}
            {list.length > 3 && (
              <button
                type="button"
                onClick={() => onDay(d)}
                className="w-fit cursor-pointer px-1 text-label font-semibold text-accent hover:underline"
              >
                +{list.length - 3} more
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------ appointment detail */

const flagTone = {
  conflict: "over",
  leave: "over",
  blocked: "over",
  change: "watch",
  risk: "over",
  funding: "watch",
} as const;

function AppointmentSheet({
  event: e,
  onClose,
  onChanged,
}: {
  event: ScheduleEventDto;
  onClose: () => void;
  onChanged: () => void;
}) {
  const now = useNow() ?? 0;
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<"cancel" | "move" | "noshow" | null>(null);
  const [reason, setReason] = useState<(typeof cancelReasons)[number]>("Appointment clash");
  const [by, setBy] = useState<"medisense" | "client">("medisense");
  const [slots, setSlots] = useState<string[] | null>(null);
  const [attempts, setAttempts] = useState("");
  const [concern, setConcern] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [moveReason, setMoveReason] = useState<string>(moveReasons[0]);
  const upcoming =
    (e.rawStatus === "booked" || e.rawStatus === "tentative") && new Date(e.start).getTime() > now;
  const past = e.rawStatus === "booked" && new Date(e.start).getTime() <= now;

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      toast(done, { tone: "success" });
      onChanged();
      setPanel(null);
      return true;
    } catch (err) {
      toast("Couldn't do that", { tone: "error", detail: err instanceof Error ? err.message : "" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`${e.ref} · ${e.patient}`}
      description={`${e.purpose} · ${e.support}`}
      onRequestClose={onClose}
      meta={
        <span className="flex flex-wrap items-center gap-2">
          <Tag tone={statusTone[e.status]}>{e.status}</Tag>
          <Tag
            tone={
              e.confirmation === "Confirmed by participant"
                ? "healthy"
                : e.confirmation === "Change requested"
                  ? "watch"
                  : "outline"
            }
          >
            {e.confirmation}
          </Tag>
          {e.series && (
            <Tag tone="outline">
              Visit {e.series.index} of {e.series.total}
            </Tag>
          )}
        </span>
      }
    >
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <dl className="grid overflow-hidden rounded-card border border-border bg-surface md:grid-cols-3">
            {(
              [
                [
                  Clock,
                  `When · ${TIMEZONE_LABEL}`,
                  `${fmt(e.start, { weekday: "short", day: "numeric", month: "short" })}, ${time(e.start)}–${time(e.end)}`,
                ],
                [UserRound, "Clinician", `${e.therapist} · ${e.discipline}`],
                [
                  e.modality === "Telehealth" ? MonitorPlay : MapPin,
                  "Where",
                  e.modality === "Telehealth"
                    ? "Telehealth: no travel; recording off by default"
                    : [e.location, e.site?.siteName, e.site?.address].filter(Boolean).join(" · "),
                ],
              ] as const
            ).map(([Icon, label, value]) => (
              <div
                key={label}
                className="flex gap-3 border-b border-border px-4 py-3.5 last:border-0 md:border-r md:border-b-0"
              >
                <Icon className="mt-0.5 size-4 flex-none text-ink-500" aria-hidden="true" />
                <div className="min-w-0">
                  <dt className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
                    {label}
                  </dt>
                  <dd className="text-small text-ink-900">{value}</dd>
                </div>
              </div>
            ))}
          </dl>

          {e.modality === "Telehealth" && (
            <div className="flex gap-3 rounded-control border border-accent/30 bg-accent-tint/40 px-4 py-3 text-small text-ink-700">
              <MonitorPlay className="mt-0.5 size-4 flex-none text-accent" aria-hidden="true" />
              <span>
                <strong className="text-ink-900">Telehealth.</strong> The clinician confirms
                suitability and sends the one-time joining link from the video room. The waiting
                room checks who is joining; recording stays off until consent is documented, and the
                visit goes ahead unrecorded if it&apos;s declined.{" "}
                <Link href="/telehealth/recordings" className="font-semibold text-accent">
                  Recordings
                </Link>
              </span>
            </div>
          )}
          {e.site &&
            (e.site.accessNotes ||
              e.site.siteContact ||
              e.site.parking ||
              e.site.supportPerson) && (
              <div className="rounded-control bg-canvas px-4 py-3 text-small text-ink-700">
                {e.site.accessNotes && (
                  <p>
                    <strong className="text-ink-900">Access:</strong> {e.site.accessNotes}
                  </p>
                )}
                {e.site.parking && (
                  <p>
                    <strong className="text-ink-900">Parking:</strong> {e.site.parking}
                  </p>
                )}
                {e.site.pets && (
                  <p>
                    <strong className="text-ink-900">Pets/environment:</strong> {e.site.pets}
                  </p>
                )}
                {e.site.siteContact && (
                  <p>
                    <strong className="text-ink-900">Site contact:</strong> {e.site.siteContact}{" "}
                    {e.site.sitePhone}
                  </p>
                )}
                {e.site.supportPerson && (
                  <p>
                    <strong className="text-ink-900">Support person:</strong> {e.site.supportPerson}
                  </p>
                )}
              </div>
            )}

          {e.flags.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {e.flags.map((f, i) => (
                <li
                  key={i}
                  className={cn(
                    "flex items-start gap-2 rounded-control px-3 py-2 text-small",
                    flagTone[f.kind] === "over"
                      ? "bg-over-bg text-ink-900"
                      : "bg-watch-bg text-ink-900",
                  )}
                >
                  <ShieldAlert
                    className={cn(
                      "mt-0.5 size-4 flex-none",
                      flagTone[f.kind] === "over" ? "text-over" : "text-watch",
                    )}
                    aria-hidden="true"
                  />
                  {f.label}
                </li>
              ))}
            </ul>
          )}

          {(upcoming || past) && (
            <div className="flex flex-wrap gap-2">
              {upcoming && (
                <>
                  <Button
                    size="sm"
                    variant="soft"
                    onClick={async () => {
                      setPanel("move");
                      setSlots(null);
                      try {
                        const r = await api<{ slots: string[] }>(`/api/visits/${e.id}/times`);
                        setSlots(r.slots);
                      } catch {
                        setSlots([]);
                      }
                    }}
                  >
                    <CalendarClock className="size-3.5" aria-hidden="true" /> Reschedule
                  </Button>
                  <Button size="sm" variant="soft-danger" onClick={() => setPanel("cancel")}>
                    <X className="size-3.5" aria-hidden="true" /> Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const r = await api<{ link?: string }>(`/api/care/schedule/${e.id}`, {
                          body: { type: "patient-link" },
                        });
                        setLink(`${window.location.origin}${r.link}`);
                      }, "Participant link created")
                    }
                  >
                    <Link2 className="size-3.5" aria-hidden="true" /> Participant link
                  </Button>
                </>
              )}
              {past && (
                <Button size="sm" variant="soft-danger" onClick={() => setPanel("noshow")}>
                  Record did not attend
                </Button>
              )}
              <Link
                href={`/care/${e.clientId}`}
                className="inline-flex h-8 items-center rounded-control px-3 text-caption font-semibold text-accent hover:bg-accent-tint hover:no-underline"
              >
                Open patient →
              </Link>
            </div>
          )}

          {link && (
            <div className="flex items-center gap-2 rounded-control border border-border bg-canvas p-2">
              <code className="min-w-0 flex-1 truncate px-1 text-caption">{link}</code>
              <Button
                size="sm"
                onClick={() => {
                  void navigator.clipboard?.writeText(link);
                  toast("Link copied", { tone: "success" });
                }}
              >
                <Copy className="size-3.5" aria-hidden="true" /> Copy
              </Button>
            </div>
          )}

          {panel === "cancel" && (
            <div className="bubble-in flex flex-col gap-3 rounded-card border border-over/30 bg-over-bg/40 p-4">
              <p className="text-small font-semibold">Cancel {e.ref}</p>
              <Select
                aria-label="Reason"
                value={reason}
                onChange={(ev) => setReason(ev.target.value as typeof reason)}
              >
                {cancelReasons.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </Select>
              <Select
                aria-label="Who cancelled"
                value={by}
                onChange={(ev) => setBy(ev.target.value as typeof by)}
              >
                <option value="medisense">Medisense cancelled (never charged)</option>
                <option value="client">The participant cancelled (notice rules apply)</option>
              </Select>
              <p className="text-caption text-ink-700">
                It leaves the itinerary; the history stays on record.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  loading={busy}
                  onClick={() =>
                    run(
                      () => api(`/api/visits/${e.id}/cancel`, { body: { by, reason } }),
                      "Appointment cancelled",
                    )
                  }
                >
                  Confirm cancellation
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>
                  Keep it
                </Button>
              </div>
            </div>
          )}

          {panel === "move" && (
            <div className="bubble-in flex flex-col gap-3 rounded-card border border-accent/30 bg-accent-tint/40 p-4">
              <p className="text-small font-semibold">New time with {e.therapist}</p>
              <Select
                aria-label="Reason for the move"
                value={moveReason}
                onChange={(ev) => setMoveReason(ev.target.value)}
              >
                {moveReasons.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </Select>
              {slots === null ? (
                <Skeleton className="h-10" />
              ) : slots.length === 0 ? (
                <p className="text-small text-ink-700">
                  No free times in the next two weeks. Try another clinician from the patient
                  record.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {slots.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            api(`/api/care/schedule/${e.id}`, {
                              body: {
                                type: "move",
                                start: s,
                                expectedStart: e.start,
                                reason: moveReason || "Rescheduled by scheduling",
                              },
                            }),
                          "Moved: the original is kept in history",
                        )
                      }
                      className="h-9 cursor-pointer rounded-control border border-border-strong bg-surface px-3 text-caption font-semibold transition-all hover:-translate-y-px hover:border-accent hover:text-accent active:scale-95"
                    >
                      {fmt(s, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-caption text-ink-700">
                The old time is recorded as cancelled by Medisense (never charged) and the new visit
                replaces it.
              </p>
            </div>
          )}

          {panel === "noshow" && (
            <div className="bubble-in flex flex-col gap-3 rounded-card border border-over/30 bg-over-bg/40 p-4">
              <TextArea
                label="Attempts to reach them"
                required
                rows={2}
                value={attempts}
                onChange={setAttempts}
                placeholder="Called twice at 9:10 and 9:25, SMS sent, booking contact called"
              />
              <Tick checked={concern} onChange={setConcern}>
                There&apos;s a safety concern to follow up
              </Tick>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="soft-danger"
                  loading={busy}
                  disabled={attempts.trim().length < 3}
                  onClick={() =>
                    run(
                      () =>
                        api(`/api/care/schedule/${e.id}`, {
                          body: { type: "no-show", attempts, concern },
                        }),
                      "Recorded as did not attend",
                    )
                  }
                >
                  Record did not attend
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>
                  Back
                </Button>
              </div>
            </div>
          )}

          {e.changeRequests.some((r) => !r.resolved) && (
            <section>
              <h4 className="mb-2 text-label font-semibold tracking-[0.1em] text-ink-500 uppercase">
                Change requests
              </h4>
              {e.changeRequests.map((r, i) =>
                r.resolved ? null : (
                  <div
                    key={i}
                    className="mb-2 flex items-start justify-between gap-3 rounded-control bg-watch-bg px-3 py-2 text-small"
                  >
                    <span>
                      {r.note}
                      <span className="block text-caption text-ink-500">{relativeTime(r.at)}</span>
                    </span>
                    <Button
                      size="sm"
                      variant="soft"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            api(`/api/care/schedule/${e.id}`, {
                              body: { type: "resolve-change", index: i },
                            }),
                          "Marked resolved",
                        )
                      }
                    >
                      Resolve
                    </Button>
                  </div>
                ),
              )}
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-5" aria-label="Reminders and history">
          {e.reminders.length > 0 && (
            <section className="overflow-hidden rounded-card border border-border bg-surface">
              <h4 className="flex items-center gap-1.5 border-b border-border px-4 py-3 text-small font-semibold text-ink-900">
                <BellRing className="size-4 text-ink-500" aria-hidden="true" /> Reminders
                <span className="ml-auto text-caption font-normal text-ink-500">Simulated</span>
              </h4>
              <ul className="divide-y divide-border">
                {e.reminders.map((r) => (
                  <li key={r.trigger} className="flex items-center gap-3 px-4 py-2.5 text-small">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-ink-900">
                        {r.trigger} · {r.channel}
                      </span>
                      <span className="block text-caption text-ink-500">
                        {fmt(r.due, {
                          day: "numeric",
                          month: "short",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                        {r.note && ` · ${r.note}`}
                      </span>
                    </span>
                    <Tag
                      tone={
                        r.status === "Failed"
                          ? "over"
                          : r.status === "Queued"
                            ? "outline"
                            : r.status === "Suppressed"
                              ? "neutral"
                              : "healthy"
                      }
                    >
                      {r.status}
                    </Tag>
                    {r.status === "Failed" && (
                      <Button
                        size="sm"
                        variant="soft"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () =>
                              api(`/api/care/schedule/${e.id}`, {
                                body: { type: "resend", trigger: r.trigger },
                              }),
                            "Reminder resent",
                          )
                        }
                      >
                        <Send className="size-3.5" aria-hidden="true" /> Resend
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="overflow-hidden rounded-card border border-border bg-surface">
            <h4 className="flex items-center gap-1.5 border-b border-border px-4 py-3 text-small font-semibold text-ink-900">
              <History className="size-4 text-ink-500" aria-hidden="true" /> History
            </h4>
            <ol className="relative mx-4 my-4 ml-6 border-l border-border pl-5">
              {e.history.map((h, i) => (
                <li key={i} className="relative pb-3 last:pb-0">
                  <span
                    aria-hidden="true"
                    className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-surface bg-accent-fill"
                  />
                  <p className="text-small text-ink-900">{h.label}</p>
                  <p className="text-caption text-ink-500">
                    {h.by} ·{" "}
                    {fmt(h.at, {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </Dialog>
  );
}

const moveReasons = [
  "Requested by participant",
  "Clinician availability",
  "Clash with another visit",
  "Site access",
  "Other",
] as const;

function MoveSheet({
  move,
  onClose,
  onDone,
}: {
  move: { e: ScheduleEventDto; start: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState<string>(moveReasons[0]);
  const [busy, setBusy] = useState(false);
  const { e, start } = move;
  const when = (iso: string) =>
    fmt(iso, {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "numeric",
      minute: "2-digit",
    });
  return (
    <Sheet
      title={`Move ${e.ref}`}
      description={`${e.patient} · ${e.support} with ${e.therapist}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep the current time
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`/api/care/schedule/${e.id}`, {
                  body: { type: "move", start, expectedStart: e.start, reason },
                });
                toast("Visit moved", {
                  tone: "success",
                  detail:
                    "The participant and clinician were notified; the original is kept in history.",
                });
                onDone();
              } catch (err) {
                toast("Couldn't move it", {
                  tone: "error",
                  detail: err instanceof Error ? err.message : "",
                });
              } finally {
                setBusy(false);
              }
            }}
          >
            Move and notify
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ol className="relative ml-2 border-l-2 border-dashed border-border pl-5">
          <li className="relative pb-4">
            <span
              aria-hidden="true"
              className="absolute top-1 -left-[27px] size-3 rounded-full border-2 border-surface bg-border-strong"
            />
            <p className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">Now</p>
            <p className="text-small text-ink-500 line-through">{when(e.start)}</p>
          </li>
          <li className="relative">
            <span
              aria-hidden="true"
              className="absolute top-1 -left-[27px] size-3 rounded-full border-2 border-surface bg-accent-fill"
            />
            <p className="text-label font-semibold tracking-[0.08em] text-accent uppercase">
              New time
            </p>
            <p className="text-body font-semibold text-ink-900">{when(start)}</p>
            <p className="text-caption text-ink-500">{TIMEZONE_LABEL}</p>
          </li>
        </ol>
        <Select aria-label="Reason" value={reason} onChange={(ev) => setReason(ev.target.value)}>
          {moveReasons.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </Select>
        <p className="text-caption text-ink-500">
          The clinician&apos;s hours, leave, travel buffers and other visits are checked before
          anything changes. If someone else changed this visit meanwhile, nothing is overwritten.
        </p>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------ team timeline */

type TeamMember = ScheduleBoardDto["therapists"][number];

/** "6 h 30 min", "45 min". */
const span = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
};

/** A visit can be dragged to a new time while it's still ahead and not yet closed. */
const movable = (e: ScheduleEventDto, now: number) =>
  (e.rawStatus === "booked" || e.rawStatus === "tentative") && new Date(e.start).getTime() > now;

const listed = (e: ScheduleEventDto) => e.status !== "Cancelled" && e.status !== "Rescheduled";

/** The clinician column shared by the day and week views: photo, name, therapy and load. */
function ClinicianCell({
  name,
  therapy,
  load,
  leave,
  rostered,
  visits,
}: {
  name: string;
  therapy: string;
  load: number;
  leave: boolean;
  rostered: boolean;
  visits: number;
}) {
  return (
    <div className="flex items-center gap-3 border-r border-border bg-surface px-5 py-3">
      <Avatar name={name} kind="staff" size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-small font-semibold text-ink-900">{name}</p>
        <p className="truncate text-caption text-ink-500">{therapy}</p>
        {leave && !rostered ? (
          <p className="mt-1 text-caption font-semibold text-watch">On leave</p>
        ) : rostered ? (
          <div className="mt-1.5 flex items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
              <span
                className={cn(
                  "block h-full rounded-full",
                  load >= 90 ? "bg-over-dot" : load >= 60 ? "bg-watch-dot" : "bg-accent-fill",
                )}
                style={{ width: `${load}%` }}
              />
            </span>
            <span className="w-9 text-right text-caption font-semibold text-ink-700 tabular-nums">
              {load}%
            </span>
          </div>
        ) : visits ? (
          <p className="mt-1 text-caption font-semibold text-watch">Visit outside roster</p>
        ) : (
          <p className="mt-1 text-caption text-ink-500">Off roster</p>
        )}
      </div>
    </div>
  );
}

function Pager({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-2.5">
      <span className="text-caption text-ink-500">
        Showing {page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} of {total}{" "}
        clinicians
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous clinicians"
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
          className="flex size-8 cursor-pointer items-center justify-center rounded-control border border-border-strong transition-all hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        {Array.from({ length: pages }, (_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Clinicians page ${i + 1}`}
            aria-current={i === page ? "page" : undefined}
            onClick={() => onPage(i)}
            className={cn(
              "h-8 min-w-8 cursor-pointer rounded-control px-2 text-small font-semibold tabular-nums transition-colors",
              i === page
                ? "bg-accent-fill text-on-accent"
                : "border border-border-strong text-ink-700 hover:border-accent hover:text-accent",
            )}
          >
            {i + 1}
          </button>
        ))}
        <button
          type="button"
          aria-label="Next clinicians"
          disabled={page >= pages - 1}
          onClick={() => onPage(page + 1)}
          className="flex size-8 cursor-pointer items-center justify-center rounded-control border border-border-strong transition-all hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/**
 * The team on one screen, a row per clinician with their photo, therapy and load on the left.
 * One day reads as a timeline (rostered hours shaded, each visit a bar at its time); a week reads
 * as a day per column. Ten clinicians at a time, busiest first. A visit still ahead can be dragged
 * to another time (day) or day (week) on its own clinician's row.
 */
function TeamTimeline({
  days,
  events,
  therapists,
  onOpen,
  onMove,
}: {
  days: number[];
  events: ScheduleEventDto[];
  therapists: TeamMember[];
  onOpen: (e: ScheduleEventDto) => void;
  onMove: (e: ScheduleEventDto, start: string) => void;
}) {
  const now = useNow() ?? 0;
  const [showOff, setShowOff] = useState(false);
  const [page, setPage] = useState(0);
  const [over, setOver] = useState<string | null>(null);
  const week = days.length > 1;
  const first = START_HOUR * 60;
  const last = END_HOUR * 60;
  const pct = (min: number) =>
    ((Math.min(Math.max(min, first), last) - first) / (last - first)) * 100;
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
  const todayKey = keyOf(now);

  const rows = therapists.map((t) => {
    const perDay = days.map((d) => {
      const key = keyOf(d);
      const roster = t.weekly.find((w) => w.weekday === weekdayOf(d)) ?? null;
      const leave = t.timeOff.find((o) => o.from <= key && key <= o.to) ?? null;
      const visits = events
        .filter(
          (e) => e.therapistId === t.id && keyOf(new Date(e.start).getTime()) === key && listed(e),
        )
        .sort((a, b) => a.start.localeCompare(b.start));
      const clashes = new Set(
        visits.flatMap((a, i) =>
          visits.slice(i + 1).flatMap((b) => (b.start < a.end ? [a.id, b.id] : [])),
        ),
      );
      return { d, key, roster, leave, visits, clashes };
    });
    const booked = perDay.reduce(
      (m, c) => m + c.visits.reduce((x, e) => x + (minutesOf(e.end) - minutesOf(e.start)), 0),
      0,
    );
    const rostered = perDay.reduce(
      (m, c) => m + (c.roster && !c.leave ? c.roster.end - c.roster.start : 0),
      0,
    );
    const visits = perDay.reduce((n, c) => n + c.visits.length, 0);
    const clashes = perDay.reduce((n, c) => n + c.clashes.size, 0);
    const leave = perDay.some((c) => c.leave);
    return { t, perDay, booked, rostered, visits, clashes, leave };
  });
  const working = rows.filter((r) => r.rostered > 0 || r.visits > 0);
  const off = rows.filter((r) => !working.includes(r));
  const all = (showOff ? [...working, ...off] : working).sort(
    (a, b) => b.booked - a.booked || a.t.name.localeCompare(b.t.name),
  );
  const at = Math.min(page, Math.max(0, Math.ceil(all.length / PAGE_SIZE) - 1));
  const shown = all.slice(at * PAGE_SIZE, (at + 1) * PAGE_SIZE);
  const booked = working.reduce((m, r) => m + r.booked, 0);
  const rostered = working.reduce((m, r) => m + r.rostered, 0);
  const clashCount = working.reduce((m, r) => m + r.clashes, 0);
  const onLeave = rows.filter((r) => r.leave).length;
  const visitCount = working.reduce((n, r) => n + r.visits, 0);
  const nowMin = minutesOf(new Date(now).toISOString());

  const stats = [
    { label: "On duty", value: String(working.length), sub: `${onLeave} on leave` },
    {
      label: "Booked",
      value: span(booked),
      sub: rostered
        ? `${Math.round((booked / rostered) * 100)}% of rostered time · ${visitCount} visits`
        : `No rostered time · ${visitCount} visits`,
    },
    { label: "Free to book", value: span(Math.max(rostered - booked, 0)), sub: "Across the team" },
    {
      label: "Clashes",
      value: String(clashCount / 2),
      sub: clashCount ? "Double-booked visits" : week ? "None this week" : "None today",
      over: clashCount > 0,
    },
  ];

  /** Drops a dragged visit on its own clinician's row: a new time (day) or a new day (week). */
  const drop = (ev: React.DragEvent<HTMLElement>, therapistId: string, day: number) => {
    ev.preventDefault();
    setOver(null);
    const e = events.find((x) => x.id === ev.dataTransfer.getData("text/plain"));
    if (!e || e.therapistId !== therapistId) return;
    let minutes = minutesOf(e.start);
    if (!week) {
      const rect = ev.currentTarget.getBoundingClientRect();
      const raw = first + ((ev.clientX - rect.left) / rect.width) * (last - first);
      minutes = Math.min(last - 15, Math.max(first, Math.round(raw / 15) * 15));
    }
    const start = new Date(day + minutes * 60_000).toISOString();
    if (start !== new Date(e.start).toISOString()) onMove(e, start);
  };
  const dragProps = (e: ScheduleEventDto) =>
    movable(e, now)
      ? {
          draggable: true,
          onDragStart: (ev: React.DragEvent<HTMLElement>) => {
            ev.dataTransfer.setData("text/plain", e.id);
            ev.dataTransfer.effectAllowed = "move";
          },
        }
      : {};

  const cols = week ? "grid-cols-[240px_repeat(5,minmax(150px,1fr))]" : "grid-cols-[240px_1fr]";

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-2 gap-px border-b border-border bg-border lg:grid-cols-4">
        {stats.map((x) => (
          <div key={x.label} className="bg-surface px-5 py-3">
            <p className="text-caption font-semibold text-ink-500">{x.label}</p>
            <p
              className={cn(
                "type-display text-h2 leading-tight",
                x.over ? "text-over" : "text-ink-900",
              )}
            >
              {x.value}
            </p>
            <p className="text-caption text-ink-500">{x.sub}</p>
          </div>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="p-6">
          <EmptyNote
            title={week ? "Nobody is rostered this week." : "Nobody is rostered this day."}
          >
            Pick another {week ? "week" : "day"} or clear the filters.
          </EmptyNote>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className={week ? "min-w-[1000px]" : "min-w-[900px]"}>
            <div className={cn("sticky top-0 z-10 grid border-b border-border bg-surface", cols)}>
              <div className="px-5 py-2.5 text-caption font-semibold text-ink-500">
                {working.length} clinicians, busiest first
              </div>
              {week ? (
                days.map((d) => (
                  <div
                    key={d}
                    className={cn(
                      "border-l border-border px-3 py-2",
                      keyOf(d) === todayKey && "bg-accent-tint",
                    )}
                  >
                    <p
                      className={cn(
                        "text-small font-semibold",
                        keyOf(d) === todayKey ? "text-accent" : "text-ink-900",
                      )}
                    >
                      {fmt(d, { weekday: "short" })}
                    </p>
                    <p className="text-caption text-ink-500">
                      {fmt(d, { day: "numeric", month: "short" })}
                    </p>
                  </div>
                ))
              ) : (
                <div className="relative h-10">
                  {hours.map((h) => (
                    <span
                      key={h}
                      className="absolute top-3 -translate-x-1/2 text-caption whitespace-nowrap text-ink-500 tabular-nums first:translate-x-0 last:-translate-x-full"
                      style={{ left: `${pct(h * 60)}%` }}
                    >
                      {fmt(Date.UTC(2026, 0, 1, h - 10), { hour: "numeric" })}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <ul className="divide-y divide-border">
              {shown.map((r) => {
                const load = r.rostered
                  ? Math.min(100, Math.round((r.booked / r.rostered) * 100))
                  : 0;
                return (
                  <li key={r.t.id} className={cn("grid items-stretch", cols)}>
                    <ClinicianCell
                      name={r.t.name}
                      therapy={r.t.discipline}
                      load={load}
                      leave={r.leave}
                      rostered={r.rostered > 0}
                      visits={r.visits}
                    />
                    {week
                      ? r.perDay.map((c) => {
                          const cell = `${r.t.id}|${c.key}`;
                          return (
                            <div
                              key={c.key}
                              onDragOver={(ev) => {
                                ev.preventDefault();
                                setOver(cell);
                              }}
                              onDragLeave={() => setOver(null)}
                              onDrop={(ev) => drop(ev, r.t.id, c.d)}
                              className={cn(
                                "flex min-h-[76px] flex-col gap-1 border-l border-border p-1.5",
                                c.leave ? "bg-watch-bg" : c.roster ? "bg-surface" : "bg-sunken/60",
                                over === cell && "bg-accent-tint",
                              )}
                            >
                              {c.leave && (
                                <span className="rounded-control border border-dashed border-watch px-2 py-1 text-caption font-semibold text-watch">
                                  On leave
                                </span>
                              )}
                              {!c.leave && !c.roster && c.visits.length === 0 && (
                                <span className="px-1 py-1 text-caption text-ink-400">
                                  Off roster
                                </span>
                              )}
                              {c.visits.map((e) => (
                                <button
                                  key={e.id}
                                  type="button"
                                  data-no-photo
                                  onClick={() => onOpen(e)}
                                  {...dragProps(e)}
                                  title={`${time(e.start)}–${time(e.end)} · ${e.patient} · ${e.support} · ${e.status}`}
                                  className={cn(
                                    "flex w-full cursor-pointer items-center gap-1.5 overflow-hidden rounded-control border-l-[3px] px-2 py-1 text-left transition-all duration-(--duration-fast) hover:-translate-y-px hover:shadow-lift",
                                    statusStyle[e.status],
                                    c.clashes.has(e.id) && "ring-2 ring-over",
                                  )}
                                >
                                  <span className="flex-none text-label font-semibold text-ink-700 tabular-nums">
                                    {time(e.start)}
                                  </span>
                                  {e.modality === "Telehealth" && (
                                    <MonitorPlay
                                      className="size-3 flex-none text-ink-500"
                                      aria-label="Telehealth"
                                    />
                                  )}
                                  <span className="truncate text-caption font-semibold text-ink-900">
                                    {e.patient}
                                  </span>
                                </button>
                              ))}
                            </div>
                          );
                        })
                      : r.perDay.map((c) => (
                          <div
                            key={c.key}
                            onDragOver={(ev) => {
                              ev.preventDefault();
                              setOver(r.t.id);
                            }}
                            onDragLeave={() => setOver(null)}
                            onDrop={(ev) => drop(ev, r.t.id, c.d)}
                            className={cn(
                              "relative h-[68px] bg-sunken/60",
                              over === r.t.id && "bg-accent-tint",
                            )}
                          >
                            {hours.map((h) => (
                              <span
                                key={h}
                                aria-hidden="true"
                                className="absolute inset-y-0 w-px bg-border/70"
                                style={{ left: `${pct(h * 60)}%` }}
                              />
                            ))}
                            {/* Rostered hours sit on a white band; the rest of the day stays shaded. */}
                            {c.roster && !c.leave && (
                              <span
                                aria-hidden="true"
                                className="absolute inset-y-1.5 rounded-control border border-border bg-surface"
                                style={{
                                  left: `${pct(c.roster.start)}%`,
                                  width: `${pct(c.roster.end) - pct(c.roster.start)}%`,
                                }}
                              />
                            )}
                            {c.leave && (
                              <span className="absolute inset-1.5 flex items-center justify-center rounded-control border border-dashed border-watch bg-watch-bg text-caption font-semibold text-watch">
                                On leave{c.leave.reason ? `: ${c.leave.reason}` : ""}
                              </span>
                            )}
                            {c.key === todayKey && nowMin > first && nowMin < last && (
                              <span
                                aria-hidden="true"
                                className="absolute inset-y-0 z-10 w-0.5 bg-over-dot"
                                style={{ left: `${pct(nowMin)}%` }}
                              />
                            )}
                            {c.visits.map((e) => {
                              const s0 = minutesOf(e.start);
                              const s1 = minutesOf(e.end);
                              return (
                                <button
                                  key={e.id}
                                  type="button"
                                  data-no-photo
                                  onClick={() => onOpen(e)}
                                  {...dragProps(e)}
                                  title={`${time(e.start)}–${time(e.end)} · ${e.patient} · ${e.support} · ${e.status}${movable(e, now) ? " · drag to move" : ""}`}
                                  className={cn(
                                    "absolute top-3 bottom-3 z-[5] flex min-w-6 cursor-pointer flex-col justify-center overflow-hidden rounded-control border-l-[3px] px-2 text-left transition-all duration-(--duration-fast) hover:z-20 hover:-translate-y-px hover:shadow-lift",
                                    statusStyle[e.status],
                                    c.clashes.has(e.id) && "ring-2 ring-over",
                                  )}
                                  style={{
                                    left: `${pct(s0)}%`,
                                    width: `${Math.max(pct(s1) - pct(s0), 1.5)}%`,
                                  }}
                                >
                                  <span className="flex items-center gap-1 truncate text-caption font-semibold text-ink-900">
                                    {e.modality === "Telehealth" && (
                                      <MonitorPlay
                                        className="size-3 flex-none"
                                        aria-label="Telehealth"
                                      />
                                    )}
                                    <span className="truncate">{e.patient}</span>
                                  </span>
                                  <span className="truncate text-label text-ink-500 tabular-nums">
                                    {time(e.start)}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ))}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <Pager page={at} total={all.length} onPage={setPage} />
      {off.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setShowOff(!showOff);
            setPage(0);
          }}
          className="cursor-pointer border-t border-border px-5 py-3 text-left text-small font-semibold text-accent hover:bg-canvas"
        >
          {showOff ? "Hide" : "Show"} {off.length} off roster {week ? "this week" : "this day"}
        </button>
      )}
    </div>
  );
}
