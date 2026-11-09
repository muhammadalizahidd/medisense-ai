"use client";

import { Car, CircleAlert, FileText, MapPin, Quote, Video } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Caption } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { caseNotes } from "@/data/case-note";
import { liveDirectory } from "@/data/records";
import type { Visit } from "@/data/story";
import type { Task } from "@/data/tasks";
import { useDemoStore } from "@/state/demo-store";

const SESSION = "/sessions/oliver-grant";

function Details({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-small">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-ink-500">{label}</dt>
          <dd className="font-medium text-ink-900">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 border-t border-border pt-5">
      <h3 className="mb-3 font-serif text-section font-medium text-ink-900">{title}</h3>
      {children}
    </section>
  );
}

function useClient(name: string) {
  const added = useDemoStore((s) => s.addedClients);
  const edits = useDemoStore((s) => s.clientEdits);
  return liveDirectory(added, edits).find((c) => c.name === name) ?? null;
}

const visitStatus = (visit: Visit, approved: boolean, nextDay: boolean) => {
  if (nextDay) return { tone: "neutral", label: "Scheduled" } as const;
  if (visit.state === "done") return { tone: "healthy", label: "Completed · note approved" } as const;
  if (visit.state === "just-finished")
    return approved
      ? ({ tone: "healthy", label: "Completed · note approved" } as const)
      : ({ tone: "monitor", label: "Completed · note due" } as const);
  if (visit.state === "next") return { tone: "available", label: "Next visit" } as const;
  return { tone: "neutral", label: "Scheduled" } as const;
};

/** One visit in the therapist's day: when and where, the client, open work and what to do next. */
export function VisitDetailSheet({
  visit,
  approved,
  nextDay,
  onClose,
}: {
  visit: Visit;
  approved: boolean;
  nextDay: boolean;
  onClose: () => void;
}) {
  const client = useClient(visit.client);
  const tasks = useDemoStore((s) => s.tasks).filter((t) => t.client === visit.client && !t.done);
  const notes = useDemoStore((s) => s.caseNotes);
  const lastNote = caseNotes.find((n) => n.client === visit.client);
  const status = visitStatus(visit, approved, nextDay);
  const noteDue = visit.state === "just-finished" && !approved && !nextDay;
  const isVideo = visit.kind === "Telehealth";

  return (
    <Sheet
      title={visit.client}
      description={
        <Tag tone={status.tone}>{status.label}</Tag>
      }
      onClose={onClose}
      footer={
        <>
          {noteDue && (
            <ButtonLink href={SESSION} variant="primary">
              Write note with AI
            </ButtonLink>
          )}
          {visit.state === "just-finished" && approved && !nextDay && (
            <ButtonLink href={`${SESSION}/prepared`} variant="primary">
              See what AI prepared
            </ButtonLink>
          )}
          {isVideo && visit.state !== "done" && (
            <ButtonLink href="/telehealth" variant={noteDue ? "secondary" : "primary"}>
              Open video call
            </ButtonLink>
          )}
          {client && <ButtonLink href={`/clients/${client.id}`}>Open client</ButtonLink>}
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <Details
        rows={[
          ["Time", `${visit.start} to ${visit.end}`],
          ["Service", visit.service],
          [
            "Type",
            <span key="t" className="inline-flex items-center gap-1.5">
              {isVideo ? (
                <Video className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <MapPin className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
              )}
              {isVideo ? "Telehealth" : `Home visit, ${visit.place}`}
            </span>,
          ],
          ...(visit.driveBefore > 0
            ? ([
                [
                  "Travel",
                  <span key="d" className="inline-flex items-center gap-1.5">
                    <Car className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                    {visit.driveBefore} min drive
                    {visit.leaveBy && !nextDay ? `, leave by ${visit.leaveBy}` : ""}
                  </span>,
                ],
              ] as [string, ReactNode][])
            : []),
        ]}
      />

      {visit.note && !nextDay && (
        <div className="mt-5 flex items-start gap-2.5 rounded-control bg-surface-sunken px-3.5 py-3 text-small text-ink-900">
          <Quote className="mt-0.5 size-3.5 flex-none text-ink-500" strokeWidth={1.75} aria-hidden="true" />
          {visit.note}
        </div>
      )}

      {client && (
        <Section title="Client">
          <Details
            rows={[
              ["Age", client.age === null ? "Not recorded" : `${client.age}`],
              ["Funding", client.funding],
              ["Region", client.region],
              ["Clinician", client.clinician],
              [
                "Plan review",
                client.planReviewDays < 0
                  ? `Overdue by ${-client.planReviewDays} days`
                  : `In ${client.planReviewDays} days`,
              ],
            ]}
          />
        </Section>
      )}

      <Section title="Open tasks">
        {tasks.length === 0 ? (
          <p className="text-small text-ink-500">No open tasks for {visit.client}.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-start gap-2.5 text-small">
                <CircleAlert
                  className={`mt-0.5 size-4 flex-none ${t.daysOverdue > 0 ? "text-over" : "text-ink-400"}`}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block font-semibold text-ink-900">{t.title}</span>
                  <Caption>
                    {t.owner} · {t.daysOverdue > 0 ? `${t.daysOverdue} days late` : `due ${t.due}`}
                  </Caption>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {lastNote && (
        <Section title="Latest case note">
          <Link
            href={`/case-notes/${lastNote.id}`}
            className="flex items-center justify-between gap-3 rounded-control border border-border px-3.5 py-3 hover:bg-canvas hover:no-underline"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <FileText className="size-4 flex-none text-ink-500" strokeWidth={1.5} aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-small font-semibold text-ink-900">
                  Session {lastNote.sessionDate}
                </span>
                <Caption>
                  {notes[lastNote.id]?.mode === "approved" ? "Approved" : "Not approved yet"}
                </Caption>
              </span>
            </span>
          </Link>
        </Section>
      )}
    </Sheet>
  );
}

const priorityTone = { High: "over", Medium: "available", Low: "neutral" } as const;

/** One task: what it is, who owns it, when it's due and where it came from. */
export function TaskDetailSheet({
  task,
  onDone,
  onClose,
}: {
  task: Task;
  onDone: () => void;
  onClose: () => void;
}) {
  const client = useClient(task.client);
  const due =
    task.daysOverdue > 0
      ? `${task.due}, ${task.daysOverdue} ${task.daysOverdue === 1 ? "day" : "days"} late`
      : task.daysOverdue === 0
        ? "Today"
        : task.due;

  return (
    <Sheet
      title={task.title}
      description={
        task.daysOverdue > 0 ? (
          <Tag tone="over">Overdue</Tag>
        ) : (
          <Tag tone="available">Open</Tag>
        )
      }
      onClose={onClose}
      footer={
        <>
          <Button
            variant="primary"
            onClick={() => {
              onDone();
              onClose();
            }}
          >
            Mark done
          </Button>
          {task.href && <ButtonLink href={task.href}>Go to the work</ButtonLink>}
          {client && <ButtonLink href={`/clients/${client.id}`}>Open client</ButtonLink>}
        </>
      }
    >
      <Details
        rows={[
          ["Client", task.client],
          ["Owner", task.owner],
          ["Due", due],
          [
            "Priority",
            <Tag key="p" tone={priorityTone[task.priority]}>
              {task.priority}
            </Tag>,
          ],
          ["Type", task.type],
          ["Created by", task.source],
        ]}
      />
      {task.sentence && (
        <Section title="From the approved note">
          <div className="flex items-start gap-2.5 rounded-control bg-surface-sunken px-3.5 py-3 text-small text-ink-900">
            <Quote className="mt-0.5 size-3.5 flex-none text-ink-500" strokeWidth={1.75} aria-hidden="true" />
            {task.sentence}
          </div>
        </Section>
      )}
    </Sheet>
  );
}
