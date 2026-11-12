"use client";

import { Car, UserCheck, Video } from "lucide-react";
import Link from "next/link";
import { Fragment, useState } from "react";
import { AiMark, TaskTag } from "@/components/ai/marks";
import { PenNib } from "@/components/ai/provenance";
import { Button, ButtonLink } from "@/components/ui/button";
import { Caption, Card } from "@/components/ui/card";
import { ScreenTitle } from "@/components/ui/page";
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

function VisitRow({
  visit,
  approved,
  nextDay,
  onOpen,
}: {
  visit: Visit;
  approved: boolean;
  nextDay: boolean;
  onOpen: () => void;
}) {
  const current = visit.state === "just-finished" && !nextDay;
  const done = visit.state === "done" && !nextDay;
  const highlight = current && !approved;

  return (
    <div
      onClick={onOpen}
      className={cn(
        "relative grid cursor-pointer grid-cols-[76px_minmax(0,1fr)] gap-x-4 px-5 py-4 transition-colors hover:bg-canvas md:grid-cols-[96px_minmax(0,1fr)_auto] md:items-center",
        highlight && "bg-accent-tint shadow-rule-accent md:py-6",
      )}
    >
      <div>
        <div className={cn("type-display text-h2 leading-6 font-normal", done && "text-ink-500")}>
          {visit.start}
        </div>
        <Caption>to {visit.end}</Caption>
      </div>
      <div className="min-w-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          aria-label={`Open visit details for ${visit.client}`}
          className={cn(
            "cursor-pointer text-left font-semibold text-ink-900 hover:text-accent",
            highlight && "type-display text-h2 font-medium",
          )}
        >
          {visit.client}
        </button>
        <div className="flex flex-wrap items-center gap-x-1.5 text-small text-ink-700">
          {visit.kind === "Telehealth" && (
            <Video className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          )}
          {visit.service}, {visit.place}
        </div>
        {visit.note && !approved && !done && !nextDay && (
          <p className={cn("mt-1 text-small", current ? "text-ink-900" : "text-ink-500")}>
            {visit.note}
          </p>
        )}
        {current && approved && (
          <div className="mt-1.5">
            <AiMark state="Approved">Note approved</AiMark>
          </div>
        )}
      </div>
      <div
        className="col-start-2 mt-3 md:col-start-auto md:mt-0"
        onClick={(e) => e.stopPropagation()}
      >
        {highlight && (
          <ButtonLink href={SESSION} variant="primary">
            Write note with AI
          </ButtonLink>
        )}
        {current && approved && (
          <ButtonLink href={`${SESSION}/prepared`}>See what AI prepared</ButtonLink>
        )}
        {done && <Tag tone="healthy">Approved</Tag>}
        {visit.state === "next" && !nextDay && <Tag tone="neutral">Scheduled</Tag>}
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
          <span>
            <span className="mr-1.5 inline-flex items-center gap-1 align-text-bottom text-caption font-semibold text-ink-700">
              <PenNib className="size-3.5 text-ink-700" />
              AI day summary
            </span>
            {summary.data ?? "Reading your day…"}
          </span>
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-12">
        <Card aria-labelledby="today" className="overflow-hidden xl:col-span-8">
          <h2 id="today" className="sr-only">
            Today&apos;s visits
          </h2>
          {sarahDay.map((v, i) => (
            <Fragment key={v.id}>
              {v.driveBefore > 0 ? (
                <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-x-4 border-y border-border bg-sunken px-5 py-1.5 md:grid-cols-[96px_minmax(0,1fr)]">
                  <span />
                  <span className="flex items-center gap-1.5 text-caption font-medium text-ink-500">
                    <Car className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                    {v.driveBefore} min drive
                    {v.leaveBy && !nextDay && `, leave by ${v.leaveBy}`}
                  </span>
                </div>
              ) : (
                i > 0 && <div className="border-t border-border" />
              )}
              <VisitRow
                visit={v}
                approved={approved}
                nextDay={nextDay}
                onOpen={() => setDayVisit(v)}
              />
            </Fragment>
          ))}
        </Card>

        <div className="flex flex-col gap-6 xl:col-span-4">
          {myBookings.length > 0 && (
            <Card aria-labelledby="new-bookings" className="overflow-hidden">
              <div className="px-5 pt-4.5 pb-3">
                <h2 id="new-bookings" className="type-display text-h2">
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
            <h2 id="notes-due" className="px-5 pt-4.5 pb-3 type-display text-h2">
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
            <h2 id="my-tasks" className="px-5 pt-4.5 pb-3 type-display text-h2">
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
            <h2 id="next-supervision" className="type-display text-h2">
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
