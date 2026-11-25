"use client";

import {
  AlertTriangle,
  ArrowRight,
  Car,
  CheckCircle2,
  ClipboardList,
  FileText,
  Home,
  ListChecks,
  MapPin,
  UserPlus,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/modal";
import { Avatar } from "@/components/ui/premium";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Segmented } from "@/components/ui/segmented";
import { Tag, type TagTone } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { useNow, useResource } from "@/lib/live/client";
import { timeOfDay } from "@/lib/live/time";
import type { AppointmentDto, TherapistHomeDto } from "@/lib/live/types";
import type { WorkspaceDto, WsVisit } from "@/lib/live/workspace";
import { EmptyNote, ErrorNote, LiveBadge, Skeleton } from "./bits";
import { NoteSheet } from "./care-sheets";
import { KpiBand, dueIn } from "./ops-bits";
import { liveLabel } from "./visit-list";

const dayKey = (iso: string) => new Date(new Date(iso).getTime() + 36e6).toISOString().slice(0, 10);
const longDate = (iso: string) =>
  new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Australia/Brisbane",
  }).format(new Date(iso));
const greeting = (iso: string) => {
  const h = Number(
    new Intl.DateTimeFormat("en-AU", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Australia/Brisbane",
    }).format(new Date(iso)),
  );
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const visitHref = (id: string) => `/therapist/workspace?tab=visits&visit=${id}`;

type Kind = "alert" | "note" | "task" | "assessment" | "request";
type Filter = "all" | "note" | "task" | "alert";

type Todo = {
  key: string;
  kind: Kind;
  rank: number;
  title: string;
  meta: string;
  tag: string;
  tone: TagTone;
  action: string;
  href?: string;
  visit?: AppointmentDto;
};

const kindIcon: Record<Kind, typeof FileText> = {
  alert: AlertTriangle,
  note: FileText,
  task: ListChecks,
  assessment: ClipboardList,
  request: UserPlus,
};

/** How many to-dos show before "Show all": enough to work through, short enough to read. */
const SHOWN = 8;

/**
 * The therapist's starting page: the next visit, today's visits, and one list of what needs doing,
 * most urgent first, each with the one button that does it.
 */
export function TodayPage() {
  const { data, error, loading, reload } = useResource<WorkspaceDto>(
    "/api/care/workspace",
    (e) => e.type === "care" || e.type === "notification",
  );
  const home = useResource<TherapistHomeDto>(
    "/api/care/therapist",
    (e) => e.type === "care" || e.type === "notification",
  );
  const now = useNow() ?? (data ? Date.parse(data.now) : 0);
  const [filter, setFilter] = useState<Filter>("all");
  const [showAll, setShowAll] = useState(false);
  const [noteVisit, setNoteVisit] = useState<AppointmentDto | null>(null);

  const view = useMemo(() => {
    if (!data) return null;
    const todays = data.visits
      .filter((v) => dayKey(v.start) === data.today && v.status !== "cancelled")
      .sort((a, b) => a.start.localeCompare(b.start));
    const next =
      data.visits.find((v) => v.status === "booked" && new Date(v.end).getTime() > now) ?? null;
    const notes = data.notes.filter((n) => n.status !== "Signed");
    const tasks = data.tasks
      .filter((t) => !t.delegated && t.status !== "Completed" && t.status !== "Cancelled")
      .filter((t) => t.overdue || dayKey(t.dueAt) <= data.today);
    // Overdue tasks and late notes are already in the list as themselves; their alerts would repeat them.
    const alerts = data.alerts.filter(
      (a) => !a.acknowledged && a.kind !== "Overdue follow-up" && a.kind !== "Overdue notes",
    );
    const assessments = data.assessments.filter(
      (a) => a.status === "In Progress" || a.status === "Paused",
    );
    const requests = home.data?.requests.length ?? 0;

    const todos: Todo[] = [
      ...alerts.map((a) => ({
        key: `a-${a.key}`,
        kind: "alert" as const,
        rank: a.severity === "High" ? 0 : 5,
        title: a.title,
        meta: a.detail,
        tag: a.severity === "High" ? "Urgent" : "Check",
        tone: (a.severity === "High" ? "over" : "watch") as TagTone,
        action: "Review",
        href: a.href,
      })),
      ...(requests
        ? [
            {
              key: "requests",
              kind: "request" as const,
              rank: 1,
              title: `${plural(requests, "new patient request")} waiting for you`,
              meta: "Accept or decline so the patient isn't left waiting",
              tag: "New",
              tone: "available" as TagTone,
              action: "Review",
              href: "/therapist/patients",
            },
          ]
        : []),
      ...notes.map((n) => ({
        key: `n-${n.visitId}`,
        kind: "note" as const,
        rank: n.ageHours > 48 ? 2 : 4,
        title: `Note for ${n.clientName}`,
        meta: `Visit ${n.ageHours > 48 ? `${Math.round(n.ageHours / 24)} days` : `${n.ageHours} h`} ago · ${n.status}`,
        tag: n.ageHours > 48 ? "Late" : "Note",
        tone: (n.ageHours > 48 ? "over" : "watch") as TagTone,
        action: n.status === "Ready for Signature" ? "Sign" : "Finish note",
        visit: n.visit ?? undefined,
        href: n.visit ? undefined : "/therapist/documentation",
      })),
      ...tasks.map((t) => ({
        key: `t-${t.id}`,
        kind: "task" as const,
        rank: t.overdue ? 3 : 4,
        title: t.title,
        meta: `${t.participant ? `${t.participant} · ` : ""}${dueIn(t.dueAt, now)}`,
        tag: t.overdue ? "Overdue" : "Due today",
        tone: (t.overdue ? "over" : "watch") as TagTone,
        action: "Open",
        href: `/therapist/tasks/${t.id}`,
      })),
      ...assessments.map((a) => ({
        key: `s-${a.id}`,
        kind: "assessment" as const,
        rank: 6,
        title: `${a.kind} for ${a.clientName}`,
        meta: `${a.done} of ${a.total} sections done`,
        tag: "In progress",
        tone: "available" as TagTone,
        action: "Continue",
        href: `/therapist/assessments/${a.id}`,
      })),
    ].sort((a, b) => a.rank - b.rank);
    return { todays, next, notes, tasks, alerts, todos };
  }, [data, home.data, now]);

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data || !view) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <Skeleton className="h-36" />
        <Skeleton className="h-24" />
        <div className="grid gap-6 xl:grid-cols-12">
          <Skeleton className="h-96 xl:col-span-7" />
          <Skeleton className="h-96 xl:col-span-5" />
        </div>
      </div>
    );
  }

  const { todays, next, todos } = view;
  const shown = todos.filter((t) =>
    filter === "all"
      ? true
      : filter === "alert"
        ? t.kind === "alert" || t.kind === "request"
        : t.kind === filter,
  );
  const visible = shown.slice(0, SHOWN);
  const first = data.therapist.name.split(" ")[0];
  const pick = (f: Filter) => setFilter(filter === f ? "all" : f);

  return (
    <>
      <PageHeader
        display
        eyebrow={longDate(data.now)}
        title={`Good ${greeting(data.now)}, ${first}`}
        description={
          todos.length
            ? `${plural(todays.length, "visit")} today and ${plural(todos.length, "thing")} to do. The most urgent is at the top.`
            : `${plural(todays.length, "visit")} today and nothing else waiting. Nice work.`
        }
        actions={<LiveBadge />}
      />
      <div className="flex flex-col gap-6">
        <KpiBand
          label="Today at a glance"
          items={[
            {
              label: "Visits today",
              value: todays.length,
              sub: next ? `Next at ${timeOfDay(next.start)}` : "None left today",
              onClick: () => document.getElementById("todays-visits")?.scrollIntoView(),
            },
            {
              label: "Notes to finish",
              value: view.notes.length,
              sub: view.notes.length ? "Tap to see them" : "All signed",
              tone: view.notes.some((n) => n.ageHours > 48) ? "over" : undefined,
              onClick: () => pick("note"),
            },
            {
              label: "Tasks due",
              value: view.tasks.length,
              sub: view.tasks.some((t) => t.overdue)
                ? `${view.tasks.filter((t) => t.overdue).length} overdue`
                : "On track",
              tone: view.tasks.some((t) => t.overdue) ? "over" : undefined,
              onClick: () => pick("task"),
            },
            {
              label: "Alerts",
              value: view.alerts.length,
              sub: view.alerts.length ? "Need a look" : "All clear",
              tone: view.alerts.some((a) => a.severity === "High") ? "over" : undefined,
              onClick: () => pick("alert"),
            },
          ]}
        />

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
          <div className="flex min-w-0 flex-col gap-6 xl:col-span-7">
            <NextVisit visit={next} now={now} />
            <section
              id="todays-visits"
              aria-label="Today's visits"
              className="scroll-mt-24 overflow-hidden rounded-card border border-border bg-surface"
            >
              <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
                <h2 className="text-section font-semibold text-ink-900">Today&apos;s visits</h2>
                <Link href="/therapist/schedule" className="text-small font-semibold text-accent">
                  Open schedule
                </Link>
              </header>
              {todays.length === 0 ? (
                <div className="p-5">
                  <EmptyNote title="No visits today.">
                    Your schedule shows the week ahead.
                  </EmptyNote>
                </div>
              ) : (
                <ol className="divide-y divide-border">
                  {todays.map((v) => (
                    <VisitRow key={v.id} v={v} now={now} />
                  ))}
                </ol>
              )}
            </section>
          </div>

          <section
            aria-label="To do"
            className="flex min-w-0 flex-col overflow-hidden rounded-card border border-border bg-surface xl:col-span-5"
          >
            <header className="flex flex-col gap-3 border-b border-border px-5 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-section font-semibold text-ink-900">To do</h2>
                <span className="text-caption text-ink-500">Most urgent first</span>
              </div>
              <Segmented<Filter>
                label="Show"
                value={filter}
                onChange={setFilter}
                options={[
                  { id: "all", label: `All (${todos.length})` },
                  { id: "note", label: "Notes" },
                  { id: "task", label: "Tasks" },
                  { id: "alert", label: "Alerts" },
                ]}
              />
            </header>
            {shown.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                <CheckCircle2 className="size-8 text-healthy" aria-hidden="true" />
                <p className="text-body font-semibold text-ink-900">
                  Nothing here. You&apos;re up to date.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {visible.map((t) => (
                  <TodoRow key={t.key} t={t} onNote={setNoteVisit} />
                ))}
              </ul>
            )}
            {shown.length > SHOWN && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="flex cursor-pointer items-center justify-between border-t border-border px-5 py-3 text-left text-small font-semibold text-accent hover:bg-canvas"
              >
                See all {shown.length}
                <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            )}
          </section>
        </div>
      </div>
      {showAll && (
        <Modal
          title="To do"
          description={`${plural(todos.length, "thing")} waiting, most urgent first.`}
          size="lg"
          onClose={() => setShowAll(false)}
          toolbar={
            <Segmented<Filter>
              label="Show"
              value={filter}
              onChange={setFilter}
              options={[
                { id: "all", label: `All (${todos.length})` },
                { id: "note", label: `Notes (${todos.filter((t) => t.kind === "note").length})` },
                { id: "task", label: `Tasks (${todos.filter((t) => t.kind === "task").length})` },
                {
                  id: "alert",
                  label: `Alerts (${todos.filter((t) => t.kind === "alert" || t.kind === "request").length})`,
                },
              ]}
            />
          }
        >
          {shown.length === 0 ? (
            <p className="px-6 py-12 text-center text-small text-ink-500">Nothing here.</p>
          ) : (
            groupTodos(shown).map(([title, list]) => (
              <section key={title} aria-label={title}>
                <h3 className="sticky top-0 z-1 flex items-baseline justify-between border-b border-border bg-sunken px-6 py-2 text-small font-semibold text-ink-700">
                  {title}
                  <span className="text-caption font-medium text-ink-500">{list.length}</span>
                </h3>
                <ul className="divide-y divide-border [&>li]:px-6">
                  {list.map((t) => (
                    <TodoRow
                      key={t.key}
                      t={t}
                      onNote={(v) => {
                        setShowAll(false);
                        setNoteVisit(v);
                      }}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </Modal>
      )}
      {noteVisit && (
        <NoteSheet visit={noteVisit} onClose={() => setNoteVisit(null)} onSaved={reload} />
      )}
    </>
  );
}

/** The full list reads in sections, so fifty items scan as four short lists. */
function groupTodos(list: Todo[]) {
  const order: [string, Kind[]][] = [
    ["Alerts and requests", ["alert", "request"]],
    ["Notes", ["note"]],
    ["Tasks", ["task"]],
    ["Assessments", ["assessment"]],
  ];
  return order
    .map(([title, kinds]) => [title, list.filter((t) => kinds.includes(t.kind))] as const)
    .filter(([, rows]) => rows.length > 0);
}

function NextVisit({ visit, now }: { visit: WsVisit | null; now: number }) {
  if (!visit) {
    return (
      <section className="rounded-card border border-border bg-surface p-5">
        <p className="label-caps">Up next</p>
        <p className="mt-2 text-body text-ink-700">No more visits booked today.</p>
      </section>
    );
  }
  const started = new Date(visit.start).getTime() <= now;
  const tele = visit.mode === "Telehealth";
  return (
    <section
      aria-label="Up next"
      className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 sm:flex-row sm:items-center"
    >
      <Avatar name={visit.clientName} kind="patient" size={56} />
      <div className="min-w-0 flex-1">
        <p className="label-caps">{started ? "Happening now" : "Up next"}</p>
        <p className="mt-1 type-display text-h2 text-ink-900">
          {timeOfDay(visit.start)} · {visit.clientName}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-700">
          <span>{visit.purpose}</span>
          <span className="flex items-center gap-1">
            {tele ? (
              <Video className="size-3.5" aria-hidden="true" />
            ) : (
              <MapPin className="size-3.5" aria-hidden="true" />
            )}
            {tele ? "Telehealth" : visit.location}
          </span>
          {!tele && visit.travelMinutes ? (
            <span className="flex items-center gap-1">
              <Car className="size-3.5" aria-hidden="true" /> {visit.travelMinutes} min drive
            </span>
          ) : null}
        </p>
      </div>
      <ButtonLink variant="primary" href={visitHref(visit.id)}>
        {tele ? "Join video visit" : visit.checkIn ? "Continue visit" : "Start visit"}
        <ArrowRight className="size-4" aria-hidden="true" />
      </ButtonLink>
    </section>
  );
}

function VisitRow({ v, now }: { v: WsVisit; now: number }) {
  const done = new Date(v.end).getTime() < now && v.status !== "booked";
  const status = liveLabel(v);
  const tele = v.mode === "Telehealth";
  return (
    <li>
      <Link
        href={visitHref(v.id)}
        className={cn(
          "flex items-center gap-4 px-5 py-3.5 hover:bg-canvas hover:no-underline",
          done && "opacity-70",
        )}
      >
        <span className="w-18 flex-none text-small font-semibold text-ink-900">
          {timeOfDay(v.start)}
        </span>
        <Avatar name={v.clientName} kind="patient" size={36} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-small font-semibold text-ink-900">
            {v.clientName}
          </span>
          <span className="flex items-center gap-1 truncate text-caption text-ink-500">
            {tele ? (
              <Video className="size-3.5 flex-none" aria-hidden="true" />
            ) : (
              <Home className="size-3.5 flex-none" aria-hidden="true" />
            )}
            {v.purpose}
          </span>
        </span>
        <Tag tone={status.tone}>{status.label}</Tag>
      </Link>
    </li>
  );
}

function TodoRow({ t, onNote }: { t: Todo; onNote: (v: AppointmentDto) => void }) {
  const Icon = kindIcon[t.kind];
  let action: ReactNode;
  if (t.visit) {
    const visit = t.visit;
    action = (
      <Button size="sm" onClick={() => onNote(visit)}>
        {t.action}
      </Button>
    );
  } else {
    action = (
      <ButtonLink size="sm" href={t.href ?? "/therapist/today"}>
        {t.action}
      </ButtonLink>
    );
  }
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <span
        aria-hidden="true"
        className={cn(
          "flex size-8 flex-none items-center justify-center rounded-control",
          t.tone === "over"
            ? "bg-over-bg text-over"
            : t.tone === "watch"
              ? "bg-watch-bg text-watch"
              : "bg-accent-tint text-accent",
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-small font-semibold text-ink-900">{t.title}</span>
        </span>
        <span className="block truncate text-caption text-ink-500">{t.meta}</span>
      </span>
      <Tag tone={t.tone}>{t.tag}</Tag>
      {action}
    </li>
  );
}
