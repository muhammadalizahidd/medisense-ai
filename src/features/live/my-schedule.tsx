"use client";

import {
  BellRing,
  Car,
  CircleAlert,
  ClipboardCheck,
  Clock,
  FileSignature,
  MapPin,
  MonitorPlay,
  PlayCircle,
  ShieldAlert,
} from "lucide-react";
import { KpiLabel } from "@/components/ui/kpi-icon";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { api, useNow, useResource } from "@/lib/live/client";
import { TIMEZONE_LABEL, type ScheduleEventDto } from "@/lib/live/scheduling";
import type { AppointmentDto } from "@/lib/live/types";
import { cn } from "@/lib/cn";
import { NoteSheet } from "./care-sheets";
import { ErrorNote, LiveBadge, Skeleton } from "./bits";
import { TextArea } from "./form-bits";
import { VisitSheet } from "./visit-sheet";

const TZ = "Australia/Brisbane";
const fmt = (v: string | number, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-AU", { timeZone: TZ, ...o }).format(new Date(v));
const time = (iso: string) => fmt(iso, { hour: "numeric", minute: "2-digit" });
const dayKey = (v: string | number) =>
  new Date(new Date(v).getTime() + 36e6).toISOString().slice(0, 10);
const BUFFER = 15;

/**
 * S05-06: the clinician's own agenda, travel between visits, and what each visit needs. `after`
 * shows below it once the agenda has loaded, so nothing else appears first on an empty page.
 */
export function MySchedule({ after }: { after?: ReactNode }) {
  const schedule = useResource<{ events: ScheduleEventDto[]; pending: number }>(
    "/api/care/schedule/mine",
    (e) => e.type === "care",
  );
  const visits = useResource<{ visits: AppointmentDto[] }>("/api/visits", (e) => e.type === "care");
  const now = useNow() ?? 0;
  const [range, setRange] = useState<"today" | "week">("week");
  const [visiting, setVisiting] = useState<AppointmentDto | null>(null);
  const [noting, setNoting] = useState<AppointmentDto | null>(null);
  const [asking, setAsking] = useState<ScheduleEventDto | null>(null);
  const reload = () => {
    schedule.reload();
    visits.reload();
  };

  if (schedule.error && !schedule.data)
    return <ErrorNote message={schedule.error} onRetry={schedule.reload} />;
  if (!schedule.data) return <ScheduleSkeleton />;

  const today = dayKey(now);
  const horizon = dayKey(now + (range === "today" ? 0 : 6) * 86_400_000);
  const live = schedule.data.events.filter(
    (e) => e.status !== "Cancelled" && e.status !== "Rescheduled",
  );
  const upcoming = live
    .filter((e) => dayKey(e.start) >= today && dayKey(e.start) <= horizon)
    .sort((a, b) => a.start.localeCompare(b.start));
  const byDay = new Map<string, ScheduleEventDto[]>();
  for (const e of upcoming) byDay.set(dayKey(e.start), [...(byDay.get(dayKey(e.start)) ?? []), e]);
  const all = visits.data?.visits ?? [];
  const toWrite = all.filter(
    (v) =>
      v.status === "completed" &&
      (!v.note || v.note.status === "Draft" || v.note.status === "Pending Signature"),
  );
  const todays = live.filter((e) => dayKey(e.start) === today);
  const next = live
    .filter((e) => new Date(e.start).getTime() > now)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  const travel = todays.filter((e) => e.modality === "In person").length * BUFFER * 2;
  const tiles = [
    {
      label: "Visits today",
      value: String(todays.length),
      sub: todays.length
        ? `${time(todays[0]!.start)} to ${time(todays.at(-1)!.end)}`
        : "Nothing booked",
    },
    {
      label: "Next visit",
      value: next ? time(next.start) : "None",
      sub: next
        ? `${fmt(next.start, { weekday: "short", day: "numeric", month: "short" })} · ${next.patient}`
        : "No upcoming visits",
    },
    { label: "Travel today", value: `${travel} min`, sub: "Planned buffers, not route data" },
    {
      label: "Notes to finish",
      value: String(toWrite.length),
      sub: toWrite.length ? "Sign within 24 hours" : "All signed",
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Live care"
        title="My schedule"
        actions={
          <div className="flex items-center gap-3">
            <LiveBadge />
            <span className="text-caption text-ink-500">{TIMEZONE_LABEL}</span>
            <Segmented
              label="Show"
              value={range}
              onChange={setRange}
              options={[
                { id: "today", label: "Today" },
                { id: "week", label: "Next 7 days" },
              ]}
            />
          </div>
        }
      />
      <section className="mb-4 grid gap-px overflow-hidden rounded-card border border-border bg-border shadow-lift sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="bg-surface px-5 py-4 transition-colors hover:bg-canvas">
            <KpiLabel label={t.label} />
            <p className="mt-1 type-display text-h2 text-ink-900">{t.value}</p>
            <p className="truncate text-caption text-ink-500">{t.sub}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <section className="rounded-card border border-border bg-surface shadow-lift">
          {byDay.size === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-accent-tint text-accent ring-8 ring-accent-tint/40">
                <Clock className="size-5" aria-hidden="true" />
              </span>
              <p className="text-body font-semibold">
                No visits {range === "today" ? "today" : "in the next 7 days"}
              </p>
              <p className="mt-1 text-small text-ink-500">
                New patients appear here once you accept their request.
              </p>
            </div>
          ) : (
            [...byDay.entries()].map(([day, list]) => (
              <div key={day}>
                <p className="sticky top-(--topbar-h) z-[1] flex items-center justify-between border-b border-border bg-surface/95 px-5 py-2.5 backdrop-blur">
                  <span className="text-small font-semibold text-ink-900">
                    {day === today
                      ? "Today"
                      : fmt(`${day}T00:00:00+10:00`, {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        })}
                  </span>
                  <span className="text-caption text-ink-500">
                    {list.length} visit{list.length === 1 ? "" : "s"}
                  </span>
                </p>
                <ol className="px-5 py-3">
                  {list.map((e, i) => {
                    const v = all.find((x) => x.id === e.id);
                    const startable = e.rawStatus === "booked" && dayKey(e.start) === today;
                    const risk = e.flags.find((f) => f.kind === "risk");
                    return (
                      <li key={e.id}>
                        {i > 0 &&
                          e.modality === "In person" &&
                          list[i - 1]!.modality === "In person" && (
                            <p className="flex items-center gap-2 py-1.5 pl-[92px] text-caption text-ink-500">
                              <Car className="size-3.5" aria-hidden="true" /> {BUFFER} min travel
                              buffer before
                            </p>
                          )}
                        <article className="group flex gap-4 rounded-card border border-border p-4 transition-all duration-(--duration-fast) hover:-translate-y-px hover:border-accent/40 hover:shadow-lift">
                          <div className="w-[72px] flex-none border-r border-border pr-4 text-right">
                            <p className="text-small font-semibold text-ink-900">{time(e.start)}</p>
                            <p className="text-caption text-ink-500">{time(e.end)}</p>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-body font-semibold text-ink-900">{e.patient}</p>
                              <Tag
                                tone={
                                  e.status === "Held"
                                    ? "watch"
                                    : e.status === "Completed"
                                      ? "healthy"
                                      : "monitor"
                                }
                              >
                                {e.status === "Held" ? "Awaiting your acceptance" : e.status}
                              </Tag>
                              <span className="font-mono text-label text-ink-500">{e.ref}</span>
                            </div>
                            <p className="mt-0.5 text-small text-ink-700">
                              {e.purpose} · {e.support}
                              {e.series && ` · visit ${e.series.index} of ${e.series.total}`}
                            </p>
                            <p className="mt-1 flex items-center gap-1.5 text-caption text-ink-500">
                              {e.modality === "Telehealth" ? (
                                <MonitorPlay className="size-3.5" aria-hidden="true" />
                              ) : (
                                <MapPin className="size-3.5" aria-hidden="true" />
                              )}
                              {e.modality === "Telehealth"
                                ? "Telehealth: send the joining link from the video room"
                                : [e.site?.address || e.location, e.site?.siteName]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </p>
                            {risk && (
                              <p className="mt-2 flex items-start gap-2 rounded-control bg-over-bg px-3 py-2 text-small text-ink-900">
                                <ShieldAlert
                                  className="mt-0.5 size-4 flex-none text-over"
                                  aria-hidden="true"
                                />{" "}
                                {risk.label}
                              </p>
                            )}
                            <ul className="mt-2 flex flex-wrap gap-1.5">
                              {[
                                { label: "Review the pre-visit summary", ok: true },
                                e.modality === "Telehealth"
                                  ? {
                                      label: "Suitability and consent; recording off",
                                      ok: Boolean(e.site?.consentPlan),
                                    }
                                  : {
                                      label: e.site?.accessNotes
                                        ? "Access notes on file"
                                        : "No access notes yet",
                                      ok: Boolean(e.site?.accessNotes),
                                    },
                                ...(e.location === "School" || e.location === "Daycare"
                                  ? [{ label: "Site permission", ok: Boolean(e.site?.permission) }]
                                  : []),
                                {
                                  label: e.confirmation,
                                  ok: e.confirmation === "Confirmed by participant",
                                },
                              ].map((c) => (
                                <li
                                  key={c.label}
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-tag px-2 py-0.5 text-label font-semibold",
                                    c.ok ? "bg-healthy-bg text-healthy" : "bg-watch-bg text-watch",
                                  )}
                                >
                                  {c.ok ? (
                                    <ClipboardCheck className="size-3" aria-hidden="true" />
                                  ) : (
                                    <CircleAlert className="size-3" aria-hidden="true" />
                                  )}
                                  {c.label}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="flex flex-none flex-col items-end gap-2">
                            {e.status === "Held" ? (
                              <Link
                                href="/therapist"
                                className="inline-flex h-8 items-center rounded-control bg-accent-fill px-3 text-caption font-semibold text-on-accent hover:no-underline"
                              >
                                Accept or decline
                              </Link>
                            ) : (
                              startable &&
                              v && (
                                <Button size="sm" variant="primary" onClick={() => setVisiting(v)}>
                                  <PlayCircle className="size-3.5" aria-hidden="true" />{" "}
                                  {e.status === "In Progress" ? "Continue visit" : "Start visit"}
                                </Button>
                              )
                            )}
                            {(e.rawStatus === "booked" || e.rawStatus === "tentative") &&
                              new Date(e.start).getTime() > now && (
                                <Button size="sm" variant="soft" onClick={() => setAsking(e)}>
                                  Request a change
                                </Button>
                              )}
                            <Link
                              href={`/therapist/patients/${e.clientId}`}
                              className="text-caption font-semibold text-accent"
                            >
                              Open patient →
                            </Link>
                          </div>
                        </article>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <section className="overflow-hidden rounded-card border border-border bg-surface shadow-lift">
            <header className="flex items-center gap-2 border-b border-border px-4 py-3">
              <BellRing className="size-4 text-accent" aria-hidden="true" />
              <h3 className="text-small font-semibold">New patient requests</h3>
              <span
                className={cn(
                  "ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-label font-semibold",
                  schedule.data.pending ? "bg-over-bg text-over" : "bg-sunken text-ink-700",
                )}
              >
                {schedule.data.pending}
              </span>
            </header>
            <p className="px-4 py-3 text-small text-ink-700">
              {schedule.data.pending
                ? "A first visit is held for each. Accept to book the series."
                : "Nothing waiting for you."}
            </p>
            {schedule.data.pending > 0 && (
              <div className="px-4 pb-4">
                <Link href="/therapist" className="text-small font-semibold text-accent">
                  Review requests →
                </Link>
              </div>
            )}
          </section>
          <section className="overflow-hidden rounded-card border border-border bg-surface shadow-lift">
            <header className="flex items-center gap-2 border-b border-border px-4 py-3">
              <FileSignature className="size-4 text-accent" aria-hidden="true" />
              <h3 className="text-small font-semibold">Notes to finish</h3>
              <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-sunken px-1.5 text-label font-semibold text-ink-700">
                {toWrite.length}
              </span>
            </header>
            {toWrite.length === 0 ? (
              <p className="px-4 py-3 text-small text-ink-500">
                Every completed visit has a signed note.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {toWrite.slice(0, 8).map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => setNoting(v)}
                      className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-canvas"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-small font-semibold text-ink-900">
                          {v.clientName}
                        </span>
                        <span className="block text-caption text-ink-500">
                          {fmt(v.start, {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </span>
                      <Tag tone="watch">{v.note ? v.note.status : "Not started"}</Tag>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {visiting && (
        <VisitSheet
          visit={visiting}
          onClose={() => setVisiting(null)}
          onChanged={reload}
          onCheckedOut={(v) => {
            setVisiting(null);
            setNoting(v);
          }}
        />
      )}
      {noting && <NoteSheet visit={noting} onClose={() => setNoting(null)} onSaved={reload} />}
      {asking && (
        <ChangeSheet
          e={asking}
          onClose={() => setAsking(null)}
          onDone={() => {
            setAsking(null);
            reload();
          }}
        />
      )}
      {after}
    </>
  );
}

/** The schedule's own shape while it loads: title, four figures, the day's visits and the side panels. */
function ScheduleSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">Loading your schedule</span>
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-10 w-52" />
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-3 bg-surface px-5 py-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-3 w-36" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-4 rounded-card border border-border p-4">
              <Skeleton className="h-10 w-16" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-64" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-9 w-28" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-28" />
          <Skeleton className="h-64" />
        </div>
      </div>
    </div>
  );
}

function ChangeSheet({
  e,
  onClose,
  onDone,
}: {
  e: ScheduleEventDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      title={`Request a change to ${e.ref}`}
      description={`${e.patient} · ${fmt(e.start, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={note.trim().length < 5}
            onClick={async () => {
              setBusy(true);
              try {
                await api("/api/care/schedule/mine", { body: { appointmentId: e.id, note } });
                toast("Sent to scheduling", {
                  tone: "success",
                  detail: "The visit stays as booked until they change it.",
                });
                onDone();
              } catch (err) {
                toast("Couldn't send", {
                  tone: "error",
                  detail: err instanceof Error ? err.message : "",
                });
              } finally {
                setBusy(false);
              }
            }}
          >
            Send to scheduling
          </Button>
        </>
      }
    >
      <TextArea
        label="What needs to change?"
        required
        rows={3}
        value={note}
        onChange={setNote}
        placeholder="For example, I'm at a school assessment until 11; could this move to the afternoon?"
      />
    </Sheet>
  );
}
