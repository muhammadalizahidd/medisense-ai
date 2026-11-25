"use client";

import { AiOnly, AiText } from "@/components/ai/ai-switch";
import {
  Baby,
  Car,
  Clock3,
  FileText,
  Hammer,
  Home,
  PencilLine,
  Sparkles,
  UserCheck,
  Video,
} from "lucide-react";
import Link from "next/link";
import { Fragment, useState } from "react";
import { AiMark, TaskTag } from "@/components/ai/marks";
import { PenNib } from "@/components/ai/provenance";
import { Button, ButtonLink } from "@/components/ui/button";
import { Caption, Card } from "@/components/ui/card";
import { ScreenTitle } from "@/components/ui/page";
import { Avatar } from "@/components/ui/premium";
import { Tag } from "@/components/ui/tag";
import { caseNotes } from "@/data/case-note";
import { preparedDaySummary, sarahDay, sarahSupervisionSlot, type Visit } from "@/data/story";
import { formatTime, scheduleDays, TODAY, type ScheduleItem } from "@/data/schedule";
import { VisitSheet } from "@/features/schedule/visit-sheet";
import { TaskDetailSheet, VisitDetailSheet } from "./day-details";
import { cn } from "@/lib/cn";
import { useDemoStore } from "@/state/demo-store";
import { useStoryAi } from "@/state/use-story-ai";

const SESSION = "/sessions/oliver-grant";
/** The therapist signed in to the Therapist view. */
const ME = "sarah-thompson";

/** The kind of therapy, from the visit's service, with its own icon. */
function therapyType(service: string) {
  if (/paediatric/i.test(service)) return { label: "Paediatric OT", icon: Baby };
  if (/home mod/i.test(service)) return { label: "Home modifications", icon: Hammer };
  if (/handwriting|fine motor/i.test(service)) return { label: "Fine motor", icon: PencilLine };
  if (/program/i.test(service)) return { label: "Home program", icon: Sparkles };
  return { label: "Occupational therapy", icon: Sparkles };
}

function VisitRow({
  visit,
  approved,
  nextDay,
  last,
  onOpen,
}: {
  visit: Visit;
  approved: boolean;
  nextDay: boolean;
  last: boolean;
  onOpen: () => void;
}) {
  const current = visit.state === "just-finished" && !nextDay;
  const done = visit.state === "done" && !nextDay;
  const highlight = current && !approved;
  const type = therapyType(visit.service);
  const tele = visit.kind === "Telehealth";
  const status = done
    ? { label: "Approved", tone: "healthy" as const }
    : current
      ? {
          label: approved ? "Note approved" : "Just finished",
          tone: approved ? ("healthy" as const) : ("live" as const),
        }
      : visit.state === "next" && !nextDay
        ? { label: "Up next", tone: "available" as const }
        : { label: "Scheduled", tone: "neutral" as const };

  return (
    <div
      onClick={onOpen}
      className={cn(
        "group relative flex cursor-pointer gap-4 px-5 py-5 transition-colors duration-140 hover:bg-canvas",
        highlight && "bg-accent-tint hover:bg-accent-tint",
      )}
    >
      {/* Time and the day's timeline rail */}
      <div className="flex w-20 flex-none flex-col items-end text-right">
        <span
          className={cn(
            "type-display text-h2 leading-none text-ink-900 tabular-nums",
            done && "text-ink-500",
          )}
        >
          {visit.start}
        </span>
        <Caption className="mt-1 whitespace-nowrap">to {visit.end}</Caption>
      </div>
      <div className="relative flex w-3 flex-none justify-center" aria-hidden="true">
        <span className={cn("absolute top-0 w-px bg-border", last ? "h-4" : "-bottom-5")} />
        <span
          className={cn(
            "relative mt-1.5 size-3 rounded-full ring-4 ring-surface",
            done
              ? "bg-healthy-dot"
              : highlight
                ? "bg-accent-fill"
                : tele
                  ? "bg-available-dot"
                  : "bg-border-strong",
          )}
        />
      </div>

      {/* Patient card */}
      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-4">
        <Avatar
          name={visit.client}
          size={highlight ? 56 : 48}
          kind="patient"
          className={cn("flex-none", done && "opacity-60")}
        />
        <div className="min-w-60 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              aria-label={`Open visit details for ${visit.client}`}
              className={cn(
                "cursor-pointer text-left text-section font-semibold text-ink-900 hover:text-accent",
                highlight && "type-display text-h2 font-normal",
              )}
            >
              {visit.client}
            </button>
            <Tag tone={status.tone}>{status.label}</Tag>
          </div>
          <p className="mt-0.5 text-small text-ink-700">
            {visit.service} · {visit.place}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 rounded-tag bg-accent-tint px-2 py-0.5 text-caption font-semibold text-accent">
              <type.icon className="size-3.5" aria-hidden="true" />
              {type.label}
            </span>
            <span
              className={cn(
                "flex items-center gap-1 rounded-tag px-2 py-0.5 text-caption font-semibold",
                tele ? "bg-available-bg text-available" : "bg-sunken text-ink-700",
              )}
            >
              {tele ? (
                <Video className="size-3.5" aria-hidden="true" />
              ) : (
                <Home className="size-3.5" aria-hidden="true" />
              )}
              {tele ? "Telehealth meeting" : "Home visit"}
            </span>
          </div>
          {visit.note && !approved && !done && !nextDay && (
            <p
              className={cn(
                "mt-3 rounded-control border-l-2 px-3 py-2 text-small",
                current
                  ? "border-accent-fill bg-surface text-ink-900"
                  : "border-border-strong bg-sunken text-ink-700",
              )}
            >
              {visit.note}
            </p>
          )}
          {current && approved && (
            <div className="mt-2">
              <AiMark state="Approved">Note approved</AiMark>
            </div>
          )}
        </div>
        <div
          className="flex flex-none items-center gap-2 self-center"
          onClick={(e) => e.stopPropagation()}
        >
          {highlight && (
            <ButtonLink href={SESSION} variant="primary">
              <PenNib className="size-4" />
              <AiText on="Write note with AI" off="Write note" />
            </ButtonLink>
          )}
          {current && approved && (
            <AiOnly>
              <ButtonLink href={`${SESSION}/prepared`}>See what AI prepared</ButtonLink>
            </AiOnly>
          )}
          {tele && visit.state === "later" && !nextDay && (
            <ButtonLink href="/telehealth" size="sm" variant="primary">
              <Video className="size-3.5" aria-hidden="true" />
              Join video
            </ButtonLink>
          )}
        </div>
      </div>
    </div>
  );
}

export function SarahDay() {
  const stage = useDemoStore((s) => s.story.stage);
  const dayOffset = useDemoStore((s) => s.story.dayOffset);
  const notes = useDemoStore((s) => s.caseNotes);
  const allTasks = useDemoStore((s) => s.tasks);
  const completeTask = useDemoStore((s) => s.completeTask);
  const bookings = useDemoStore((s) => s.bookings);
  const visitChanges = useDemoStore((s) => s.visitChanges);
  const [openVisit, setOpenVisit] = useState<ScheduleItem | null>(null);
  const [dayVisit, setDayVisit] = useState<Visit | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  // Visits booked into Sarah's diary from Schedule, a client record or + New.
  const myBookings = bookings
    .filter((b) => b.clinicianId === ME && b.day >= TODAY)
    .map((b) => ({ ...b, status: visitChanges[b.id] ?? b.status }))
    .filter((b) => b.status !== "cancelled")
    .sort((a, b) => a.day - b.day || a.start - b.start);
  const approved = stage === "approved";
  const nextDay = dayOffset > 0;

  const backlog = caseNotes.filter(
    (c) => c.id !== "oliver-grant" && notes[c.id]?.mode !== "approved",
  );
  const tasks = allTasks.filter((t) => t.owner === "Sarah Thompson" && !t.done);
  const openTask = tasks.find((t) => t.id === openTaskId) ?? null;
  const overdueNotes = backlog.filter((c) => c.backlog.kind === "overdue").length;

  const summary = useStoryAi<string>(
    `day:${approved}:${dayOffset}:${tasks.length}`,
    {
      kind: "day",
      facts: {
        visitsToday: sarahDay.length,
        drivingMinutes: 50,
        justFinishedVisit: !approved && !nextDay ? "Oliver Grant" : null,
        oliverNoteApproved: approved,
        minutesUntilLeavingForNextVisit: approved && !nextDay ? 20 : null,
        nextVisit: "Isla Murphy, Aspley",
        olderNotesToWrite: overdueNotes,
        overdueTasks: tasks.filter((t) => t.daysOverdue > 0).length,
      },
    },
    approved ? preparedDaySummary.done : preparedDaySummary.start,
  );

  return (
    <>
      <ScreenTitle
        display
        title="Good morning, Sarah."
        description={
          <span data-ai-only>
            <span className="mr-1.5 inline-flex items-center gap-1 align-text-bottom text-caption font-semibold text-ink-700">
              <PenNib className="size-3.5 text-ink-700" />
              AI day summary
            </span>
            {summary.data ?? "Reading your day…"}
          </span>
        }
      />

      <section
        aria-label="Today at a glance"
        data-no-photo
        className="mb-6 grid gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-2 xl:grid-cols-5"
      >
        <div className="flex items-center gap-3 bg-surface px-5 py-4">
          <Avatar name="Sarah Thompson" size={48} kind="staff" />
          <div>
            <p className="text-section text-ink-900">Sarah Thompson</p>
            <Caption>Occupational Therapist · Brisbane North</Caption>
          </div>
        </div>
        {[
          {
            icon: Home,
            label: "Visits today",
            value: String(sarahDay.length),
            sub: `${sarahDay.filter((v) => v.kind === "Home visit").length} home · ${sarahDay.filter((v) => v.kind === "Telehealth").length} telehealth`,
          },
          {
            icon: Car,
            label: "Driving",
            value: `${sarahDay.reduce((s, v) => s + v.driveBefore, 0)} min`,
            sub: "between home visits",
          },
          {
            icon: FileText,
            label: "Notes to write",
            value: String(backlog.length + (approved ? 0 : 1)),
            sub: `${overdueNotes} overdue`,
          },
          {
            icon: Clock3,
            label: "Open tasks",
            value: String(tasks.length),
            sub: `${tasks.filter((t) => t.daysOverdue > 0).length} late`,
          },
        ].map((k) => (
          <div key={k.label} className="flex items-center gap-3 bg-surface px-5 py-4">
            <span className="flex size-10 flex-none items-center justify-center rounded-control bg-accent-tint text-accent">
              <k.icon className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="label-caps text-ink-500">{k.label}</p>
              <p className="type-display text-h2 leading-tight text-ink-900">{k.value}</p>
              <Caption>{k.sub}</Caption>
            </div>
          </div>
        ))}
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-12">
        <Card aria-labelledby="today" className="overflow-hidden xl:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <h2 id="today" className="text-section font-semibold text-ink-900">
              Today&apos;s visits
            </h2>
            <div className="flex items-center gap-3 text-caption text-ink-500">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-healthy-dot" aria-hidden="true" /> Done
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-accent-fill" aria-hidden="true" /> Now
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-available-dot" aria-hidden="true" /> Video
              </span>
            </div>
          </div>
          {sarahDay.map((v, i) => (
            <Fragment key={v.id}>
              {v.driveBefore > 0 ? (
                <div className="flex items-center gap-4 bg-sunken px-5 py-2">
                  <span className="w-20 flex-none" />
                  <span className="flex w-3 flex-none justify-center" aria-hidden="true">
                    <span className="h-5 w-px border-l border-dashed border-border-strong" />
                  </span>
                  <span className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-caption font-medium text-ink-700">
                    <Car className="size-3.5 text-ink-500" strokeWidth={1.5} aria-hidden="true" />
                    {v.driveBefore} min drive
                    {v.leaveBy && !nextDay && (
                      <span className="font-semibold text-watch">· leave by {v.leaveBy}</span>
                    )}
                  </span>
                </div>
              ) : (
                i > 0 && <div className="border-t border-border" />
              )}
              <VisitRow
                visit={v}
                approved={approved}
                nextDay={nextDay}
                last={i === sarahDay.length - 1}
                onOpen={() => setDayVisit(v)}
              />
            </Fragment>
          ))}
        </Card>

        <div className="flex flex-col gap-6 xl:col-span-4">
          {myBookings.length > 0 && (
            <Card aria-labelledby="new-bookings" className="overflow-hidden">
              <div className="px-5 pt-4.5 pb-3">
                <h2 id="new-bookings" className="text-section font-semibold text-ink-900">
                  New bookings
                </h2>
                <Caption>Booked into your diary by the team</Caption>
              </div>
              {myBookings.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setOpenVisit(b)}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 border-t border-border px-5 py-3 text-left hover:bg-canvas"
                >
                  <span className="min-w-0">
                    <span className="block text-small font-semibold text-ink-900">{b.title}</span>
                    <Caption>
                      {b.day === TODAY ? "Today" : (scheduleDays[b.day]?.label ?? "")},{" "}
                      {formatTime(b.start)} · {b.type}
                    </Caption>
                  </span>
                  {b.status === "completed" ? (
                    <Tag tone="healthy">Completed</Tag>
                  ) : b.day === TODAY ? (
                    <Tag tone="live">Finish visit</Tag>
                  ) : (
                    <Tag tone="neutral">Scheduled</Tag>
                  )}
                </button>
              ))}
            </Card>
          )}

          <Card aria-labelledby="notes-due" className="overflow-hidden">
            <h2 id="notes-due" className="px-5 pt-4.5 pb-3 text-section font-semibold text-ink-900">
              Notes to write
            </h2>
            {!approved && (
              <Link
                href={SESSION}
                className="flex items-center justify-between gap-3 border-t border-border px-5 py-3 hover:bg-canvas hover:no-underline"
              >
                <span className="min-w-0">
                  <span className="block text-small font-semibold text-ink-900">Oliver Grant</span>
                  <Caption>Today&apos;s visit</Caption>
                </span>
                <TaskTag status="Due today" />
              </Link>
            )}
            {backlog.map((c) => (
              <Link
                key={c.id}
                href={`/case-notes/${c.id}`}
                className="flex items-center justify-between gap-3 border-t border-border px-5 py-3 hover:bg-canvas hover:no-underline"
              >
                <span className="min-w-0">
                  <span className="block text-small font-semibold text-ink-900">{c.client}</span>
                  <Caption>
                    Session {c.sessionDate}
                    {c.backlog.kind === "overdue" && `, ${c.backlog.days} days late`}
                  </Caption>
                </span>
                {c.backlog.kind === "overdue" ? (
                  <TaskTag status="Overdue" />
                ) : (
                  <Tag tone="live">AI draft ready</Tag>
                )}
              </Link>
            ))}
            {approved && backlog.length === 0 && (
              <p className="border-t border-border px-5 py-4 text-small text-ink-700">
                You&apos;re up to date.
              </p>
            )}
          </Card>

          <Card aria-labelledby="my-tasks" className="overflow-hidden">
            <h2 id="my-tasks" className="px-5 pt-4.5 pb-3 text-section font-semibold text-ink-900">
              My tasks
            </h2>
            {tasks.length === 0 && (
              <p className="border-t border-border px-5 py-4 text-small text-ink-700">
                Nothing open. Tasks you confirm from a note will appear here.
              </p>
            )}
            {tasks.map((t) => (
              <div
                key={t.id}
                onClick={() => setOpenTaskId(t.id)}
                className="flex cursor-pointer items-center justify-between gap-3 border-t border-border px-5 py-3 transition-colors hover:bg-canvas"
              >
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenTaskId(t.id);
                    }}
                    className="cursor-pointer text-left text-small font-semibold text-ink-900 hover:text-accent"
                  >
                    {t.title}
                  </button>
                  <Caption>
                    {t.client},{" "}
                    {t.daysOverdue > 0
                      ? `${t.daysOverdue} ${t.daysOverdue === 1 ? "day" : "days"} late`
                      : t.daysOverdue === 0
                        ? "due today"
                        : `due ${t.due}`}
                  </Caption>
                </div>
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    completeTask(t.id);
                  }}
                >
                  Mark done
                </Button>
              </div>
            ))}
          </Card>

          <Card aria-labelledby="next-supervision" className="px-5 pt-4.5 pb-4.5">
            <h2 id="next-supervision" className="text-section font-semibold text-ink-900">
              Next supervision
            </h2>
            <p className="mt-2 flex items-start gap-2 text-small">
              <UserCheck
                className="mt-0.5 size-4 flex-none text-ink-500"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span>{sarahSupervisionSlot}</span>
            </p>
            <Caption className="mt-2">
              Grace has an AI brief ready. You&apos;ll see it once she approves it.
            </Caption>
          </Card>
        </div>
      </div>
      {openVisit && <VisitSheet visit={openVisit} onClose={() => setOpenVisit(null)} />}
      {dayVisit && (
        <VisitDetailSheet
          visit={dayVisit}
          approved={approved}
          nextDay={nextDay}
          onClose={() => setDayVisit(null)}
        />
      )}
      {openTask && (
        <TaskDetailSheet
          task={openTask}
          onDone={() => completeTask(openTask.id)}
          onClose={() => setOpenTaskId(null)}
        />
      )}
    </>
  );
}
