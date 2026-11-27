"use client";

import {
  AlertTriangle,
  BellRing,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  Eye,
  History,
  Mail,
  MessageSquare,
  Plus,
  Send,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field, Sheet } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { api, useResource } from "@/lib/live/client";
import {
  TIMEZONE_LABEL,
  type ScheduleBoardDto,
  type ScheduleEventDto,
} from "@/lib/live/scheduling";
import { relativeTime } from "@/lib/live/time";
import { cn } from "@/lib/cn";
import { ErrorNote, Skeleton } from "./bits";
import { TextField } from "./form-bits";

const TZ = "Australia/Brisbane";
const fmt = (v: string | number, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-AU", { timeZone: TZ, ...o }).format(new Date(v));
const hours = (m: number) => Math.round((m / 60) * 10) / 10;

type ResourceRow = {
  id: string;
  name: string;
  discipline: string;
  region: string;
  status: string;
  days: {
    date: string;
    working: number;
    leave: string | null;
    booked: number;
    existing: number;
    visits: number;
  }[];
};
type AuditRow = { id: string; action: string; actor: string; at: string };

/* --------------------------------------------------------- resources & leave */

export function ResourcesPanel({
  monday,
  onWeek,
}: {
  monday: string;
  onWeek: (dir: -1 | 1) => void;
}) {
  const { data, error, reload } = useResource<{ resources: ResourceRow[]; audit: AuditRow[] }>(
    `/api/care/schedule/resources?week=${monday}`,
    (e) => e.type === "care",
  );
  const [leaveFor, setLeaveFor] = useState<ResourceRow | null>(null);
  const [discipline, setDiscipline] = useState("");
  const rows = (data?.resources ?? []).filter((r) => !discipline || r.discipline === discipline);
  const days = data?.resources[0]?.days ?? [];

  return (
    <section className="rounded-card border border-border bg-surface shadow-lift">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => onWeek(-1)}
            className="flex size-9 cursor-pointer items-center justify-center rounded-control border border-border-strong transition-all hover:border-accent hover:text-accent active:scale-95"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next week"
            onClick={() => onWeek(1)}
            className="flex size-9 cursor-pointer items-center justify-center rounded-control border border-border-strong transition-all hover:border-accent hover:text-accent active:scale-95"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
          <h3 className="ml-2 type-display text-h2 text-ink-900">
            Week of {fmt(`${monday}T00:00:00+10:00`, { day: "numeric", month: "long" })}
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-52">
            <Select
              aria-label="Therapy type"
              className="h-9"
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value)}
            >
              <option value="">Any therapy type</option>
              {[...new Set((data?.resources ?? []).map((r) => r.discipline))].sort().map((d) => (
                <option key={d}>{d}</option>
              ))}
            </Select>
          </div>
          <span className="flex items-center gap-3 text-caption text-ink-500">
            <span className="flex items-center gap-1">
              <i className="size-2.5 rounded-full bg-accent-fill" /> Booked here
            </span>
            <span className="flex items-center gap-1">
              <i className="size-2.5 rounded-full bg-ink-500/40" /> Existing caseload
            </span>
            <span className="flex items-center gap-1">
              <i className="size-2.5 rounded-full bg-watch-dot" /> Leave
            </span>
          </span>
        </div>
      </header>
      {error && !data ? (
        <div className="p-6">
          <ErrorNote message={error} onRetry={reload} />
        </div>
      ) : !data ? (
        <div className="p-4">
          <Skeleton className="h-96" />
        </div>
      ) : (
        <div className="max-h-[620px] overflow-auto">
          <table className="w-full min-w-[960px] text-left text-small">
            <thead className="sticky top-0 z-[1] bg-surface shadow-[inset_0_-1px_0_var(--color-border)]">
              <tr className="text-caption text-ink-500">
                <th className="px-4 py-2.5 font-semibold">Clinician</th>
                {days.map((d) => (
                  <th key={d.date} className="px-3 py-2.5 font-semibold">
                    {fmt(`${d.date}T00:00:00+10:00`, { weekday: "short", day: "numeric" })}
                  </th>
                ))}
                <th className="px-4 py-2.5 font-semibold">Week</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const work = r.days.reduce((n, d) => n + (d.leave ? 0 : d.working), 0);
                const used = r.days.reduce((n, d) => n + d.booked + d.existing, 0);
                const pct = work ? Math.round((used / work) * 100) : 0;
                return (
                  <tr key={r.id} className="transition-colors hover:bg-canvas">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink-900">{r.name}</p>
                      <p className="text-caption text-ink-500">
                        {r.discipline} · {r.region}
                      </p>
                      {r.status !== "Active" && <Tag tone="watch">{r.status}</Tag>}
                    </td>
                    {r.days.map((d) => {
                      const total = d.working || 1;
                      return (
                        <td key={d.date} className="px-3 py-3 align-top">
                          {d.working === 0 ? (
                            <span className="text-caption text-ink-500">Off roster</span>
                          ) : d.leave ? (
                            <span className="inline-flex items-center gap-1 rounded-tag bg-watch-bg px-2 py-1 text-label font-semibold text-watch">
                              <CalendarOff className="size-3" aria-hidden="true" /> {d.leave}
                            </span>
                          ) : (
                            <div
                              title={`${hours(d.booked)} h booked here, ${hours(d.existing)} h existing caseload of ${hours(d.working)} h`}
                            >
                              <div className="flex h-2 overflow-hidden rounded-full bg-sunken">
                                <span
                                  className="bg-accent-fill"
                                  style={{ width: `${(d.booked / total) * 100}%` }}
                                />
                                <span
                                  className="bg-ink-500/40"
                                  style={{ width: `${(d.existing / total) * 100}%` }}
                                />
                              </div>
                              <p className="mt-1 text-caption text-ink-700">
                                {hours(Math.max(0, d.working - d.booked - d.existing))} h free
                                {d.visits > 0 && (
                                  <span className="text-ink-500"> · {d.visits} booked</span>
                                )}
                              </p>
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3">
                      <Tag tone={pct > 95 ? "over" : pct > 80 ? "watch" : "healthy"}>
                        {pct}% used
                      </Tag>
                      <p className="mt-1 text-caption text-ink-500">{hours(work)} h working</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="soft" onClick={() => setLeaveFor(r)}>
                        <Plus className="size-3.5" aria-hidden="true" /> Leave
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-border px-4 py-2.5 text-caption text-ink-500">
        Existing caseload comes from the practice system and is estimated per day; travel buffers
        aren&apos;t shown here. Times {TIMEZONE_LABEL}.
      </p>
      {leaveFor && (
        <LeaveSheet
          row={leaveFor}
          onClose={() => setLeaveFor(null)}
          onDone={() => {
            setLeaveFor(null);
            reload();
          }}
        />
      )}
    </section>
  );
}

function LeaveSheet({
  row,
  onClose,
  onDone,
}: {
  row: ResourceRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [from, setFrom] = useState(() => new Date(Date.now() + 36e6).toISOString().slice(0, 10));
  const [to, setTo] = useState(from);
  const [reason, setReason] = useState("Annual leave");
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      title={`Leave for ${row.name}`}
      description="Approved leave removes their free times. Visits already booked on those days are flagged for reassignment; nothing is moved or told to the participant until scheduling acts."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={to < from}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api<{ affected: number }>("/api/care/schedule/resources", {
                  body: { therapistId: row.id, from, to, reason },
                });
                toast("Leave recorded", {
                  tone: r.affected ? "warning" : "success",
                  detail: r.affected
                    ? `${r.affected} booked visits need reassignment: see Exceptions.`
                    : "No booked visits were affected.",
                });
                onDone();
              } catch (e) {
                toast("Couldn't record leave", {
                  tone: "error",
                  detail: e instanceof Error ? e.message : "",
                });
              } finally {
                setBusy(false);
              }
            }}
          >
            Record leave
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="From" type="date" value={from} onChange={setFrom} />
          <TextField label="To" type="date" value={to} onChange={setTo} />
        </div>
        <Field label="Leave type">
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            {["Annual leave", "Sick leave", "Training", "Unpaid leave", "Other"].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <p className="text-caption text-ink-500">
          The detail stays private: schedulers see the leave type only.
        </p>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------- reminders */

const templates: Record<string, (e: ScheduleEventDto) => string> = {
  "Booking confirmed": (e) =>
    `Hi ${e.patient.split(" ")[0]}, your ${e.support.toLowerCase()} visit with ${e.therapist.split(" ")[0]} is booked for ${fmt(e.start, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })} (${TIMEZONE_LABEL}). Reply or use your appointment link to confirm or change it.`,
  "48 hours before": (e) =>
    `Reminder: ${e.therapist.split(" ")[0]} visits ${fmt(e.start, { weekday: "long", hour: "numeric", minute: "2-digit" })}. Need to change? Please give 48 hours' notice.`,
  "24 hours before": (e) =>
    `Your Medisense visit is tomorrow at ${fmt(e.start, { hour: "numeric", minute: "2-digit" })}${e.modality === "Telehealth" ? ". Your joining link will arrive before the visit." : "."}`,
  "2 hours before": (e) =>
    `${e.therapist.split(" ")[0]} will ${e.modality === "Telehealth" ? "start your video visit" : "arrive"} at ${fmt(e.start, { hour: "numeric", minute: "2-digit" })}.`,
};

export function RemindersPanel({
  board,
  onChanged,
}: {
  board: ScheduleBoardDto;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [preview, setPreview] = useState<{ e: ScheduleEventDto; trigger: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const rows = board.events
    .flatMap((e) => e.reminders.map((r) => ({ e, r })))
    .filter(({ r }) => (!status || r.status === status) && (!channel || r.channel === channel))
    .sort((a, b) =>
      a.r.status === "Queued" && b.r.status !== "Queued"
        ? -1
        : b.r.status === "Queued" && a.r.status !== "Queued"
          ? 1
          : b.r.due.localeCompare(a.r.due),
    );
  const counts = (s: string) =>
    board.events.reduce((n, e) => n + e.reminders.filter((r) => r.status === s).length, 0);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <section className="rounded-card border border-border bg-surface shadow-lift">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
          <div className="flex flex-wrap gap-2">
            {["Queued", "Sent", "Delivered", "Failed", "Suppressed"].map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={status === s}
                onClick={() => setStatus(status === s ? "" : s)}
                className={cn(
                  "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-caption font-semibold transition-all active:scale-95",
                  status === s
                    ? "border-accent-fill bg-accent-fill text-on-accent"
                    : "border-border-strong bg-surface text-ink-700 hover:-translate-y-px hover:border-accent hover:text-accent",
                )}
              >
                {s}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-label",
                    status === s ? "bg-on-accent/20" : "bg-sunken text-ink-500",
                  )}
                >
                  {counts(s)}
                </span>
              </button>
            ))}
          </div>
          <div className="w-40">
            <Select
              aria-label="Channel"
              className="h-9"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              <option value="">Any channel</option>
              <option>SMS</option>
              <option>Email</option>
              <option>Other</option>
            </Select>
          </div>
        </header>
        <div className="max-h-[560px] overflow-auto">
          {rows.length === 0 ? (
            <p className="px-6 py-14 text-center text-small text-ink-500">No reminders match.</p>
          ) : (
            <table className="w-full text-left text-small">
              <thead className="sticky top-0 bg-surface text-caption text-ink-500 shadow-[inset_0_-1px_0_var(--color-border)]">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Due</th>
                  <th className="px-4 py-2.5 font-semibold">Appointment</th>
                  <th className="px-4 py-2.5 font-semibold">Reminder</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(({ e, r }) => (
                  <tr key={`${e.id}-${r.trigger}`} className="transition-colors hover:bg-canvas">
                    <td className="px-4 py-2.5 whitespace-nowrap text-ink-700">
                      {fmt(r.due, {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-caption font-semibold">{e.ref}</span>{" "}
                      <span className="text-ink-700">· {e.patient}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        {r.channel === "SMS" ? (
                          <MessageSquare className="size-3.5 text-ink-500" aria-hidden="true" />
                        ) : (
                          <Mail className="size-3.5 text-ink-500" aria-hidden="true" />
                        )}
                        {r.trigger}
                      </span>
                      {r.note && <span className="block text-caption text-ink-500">{r.note}</span>}
                    </td>
                    <td className="px-4 py-2.5">
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
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        aria-label="Preview message"
                        onClick={() => setPreview({ e, trigger: r.trigger })}
                        className="mr-1 inline-flex size-8 cursor-pointer items-center justify-center rounded-control text-ink-500 transition-colors hover:bg-accent-tint hover:text-accent"
                      >
                        <Eye className="size-4" aria-hidden="true" />
                      </button>
                      {r.status === "Failed" && (
                        <Button
                          size="sm"
                          variant="soft"
                          loading={busy === `${e.id}-${r.trigger}`}
                          onClick={async () => {
                            setBusy(`${e.id}-${r.trigger}`);
                            try {
                              await api(`/api/care/schedule/${e.id}`, {
                                body: { type: "resend", trigger: r.trigger },
                              });
                              toast("Reminder resent (simulated)", { tone: "success" });
                              onChanged();
                            } catch (err) {
                              toast("Couldn't resend", {
                                tone: "error",
                                detail: err instanceof Error ? err.message : "",
                              });
                            } finally {
                              setBusy(null);
                            }
                          }}
                        >
                          <Send className="size-3.5" aria-hidden="true" /> Resend
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
      <section className="h-fit rounded-card border border-border bg-surface shadow-lift">
        <header className="flex items-center gap-2 border-b border-border px-5 py-3.5">
          <BellRing className="size-4 text-accent" aria-hidden="true" />
          <h3 className="text-section font-semibold">
            {preview ? "Message preview" : "Approved templates"}
          </h3>
        </header>
        {preview ? (
          <div className="flex flex-col gap-3 p-5">
            <p className="text-caption text-ink-500">
              {preview.trigger} · {preview.e.ref} · {preview.e.patient}
            </p>
            <div className="rounded-card rounded-tl-[4px] bg-accent-tint px-4 py-3 text-small text-ink-900">
              {templates[preview.trigger]?.(preview.e)}
            </div>
            <p className="text-caption text-ink-500">
              No diagnosis or clinical detail goes in a reminder. Nothing is sent from the demo.
            </p>
            <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
              Back to templates
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {Object.keys(templates).map((t) => (
              <li key={t} className="px-5 py-3">
                <p className="text-small font-semibold text-ink-900">{t}</p>
                <p className="text-caption text-ink-500">
                  Safe summary: day, time, clinician first name, how to confirm or change.
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ---------------------------------------------------- exceptions & audit */

const kindLabel = {
  conflict: "Clashes",
  leave: "Clinician on leave",
  blocked: "Clinician blocked",
  change: "Change requested",
  risk: "Risk precaution",
  funding: "Funding not verified",
} as const;

export function ExceptionsPanel({
  board,
  monday,
  onOpen,
}: {
  board: ScheduleBoardDto;
  monday: string;
  onOpen: (e: ScheduleEventDto) => void;
}) {
  const [kind, setKind] = useState<keyof typeof kindLabel | "">("");
  const audit = useResource<{ resources: unknown[]; audit: AuditRow[] }>(
    `/api/care/schedule/resources?week=${monday}`,
    (e) => e.type === "care",
  );
  const live = board.events.filter(
    (e) => e.status === "Held" || e.status === "Confirmed" || e.status === "In Progress",
  );
  const flagged = live.filter(
    (e) => e.flags.some((f) => !kind || f.kind === kind) && e.flags.length > 0,
  );
  const count = (k: keyof typeof kindLabel) =>
    live.filter((e) => e.flags.some((f) => f.kind === k)).length;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
      <section className="rounded-card border border-border bg-surface shadow-lift">
        <header className="flex flex-wrap gap-2 border-b border-border p-3">
          <button
            type="button"
            aria-pressed={kind === ""}
            onClick={() => setKind("")}
            className={cn(
              "h-8 cursor-pointer rounded-full border px-3 text-caption font-semibold transition-all active:scale-95",
              kind === ""
                ? "border-accent-fill bg-accent-fill text-on-accent"
                : "border-border-strong text-ink-700 hover:border-accent hover:text-accent",
            )}
          >
            Everything
          </button>
          {(Object.keys(kindLabel) as (keyof typeof kindLabel)[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-caption font-semibold transition-all active:scale-95",
                kind === k
                  ? "border-accent-fill bg-accent-fill text-on-accent"
                  : "border-border-strong text-ink-700 hover:-translate-y-px hover:border-accent hover:text-accent",
              )}
            >
              {kindLabel[k]}
              <span
                className={cn(
                  "rounded-full px-1.5 text-label",
                  kind === k ? "bg-on-accent/20" : "bg-sunken text-ink-500",
                )}
              >
                {count(k)}
              </span>
            </button>
          ))}
        </header>
        {flagged.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-healthy-bg text-healthy ring-8 ring-healthy-bg/40">
              <AlertTriangle className="size-5" aria-hidden="true" />
            </span>
            <p className="text-body font-semibold">Nothing to resolve</p>
            <p className="mt-1 text-small text-ink-500">
              Upcoming visits have no clashes, leave conflicts or open requests.
            </p>
          </div>
        ) : (
          <ul className="max-h-[600px] divide-y divide-border overflow-auto">
            {flagged.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onOpen(e)}
                  className="group flex w-full cursor-pointer items-start gap-4 px-5 py-3.5 text-left transition-colors hover:bg-canvas"
                >
                  <span className="w-28 flex-none">
                    <span className="block font-mono text-caption font-semibold text-ink-900">
                      {e.ref}
                    </span>
                    <span className="block text-caption text-ink-500">
                      {fmt(e.start, { weekday: "short", day: "numeric", month: "short" })}
                    </span>
                    <span className="block text-caption text-ink-500">
                      {fmt(e.start, { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-small font-semibold text-ink-900">
                      {e.patient} · {e.support}
                    </span>
                    <span className="block text-caption text-ink-500">{e.therapist}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {e.flags
                        .filter((f) => !kind || f.kind === kind)
                        .map((f, i) => (
                          <span
                            key={i}
                            className={cn(
                              "rounded-tag px-2 py-0.5 text-label font-semibold",
                              f.kind === "funding" || f.kind === "change"
                                ? "bg-watch-bg text-watch"
                                : "bg-over-bg text-over",
                            )}
                          >
                            {f.label}
                          </span>
                        ))}
                    </span>
                  </span>
                  <span className="text-caption font-semibold text-accent opacity-0 transition-opacity group-hover:opacity-100">
                    Resolve →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="h-fit rounded-card border border-border bg-surface shadow-lift">
        <header className="flex items-center gap-2 border-b border-border px-5 py-3.5">
          <History className="size-4 text-accent" aria-hidden="true" />
          <h3 className="text-section font-semibold">Scheduling audit</h3>
        </header>
        {!audit.data ? (
          <div className="p-4">
            <Skeleton className="h-64" />
          </div>
        ) : audit.data.audit.length === 0 ? (
          <p className="px-5 py-8 text-center text-small text-ink-500">
            No scheduling actions recorded yet.
          </p>
        ) : (
          <div className="max-h-[540px] overflow-auto px-5 py-4">
            <ol className="relative ml-2 border-l border-border pl-6">
              {audit.data.audit.map((a) => (
                <li key={a.id} className="relative py-2">
                  <span
                    aria-hidden="true"
                    className="absolute top-3.5 -left-[31px] size-2.5 rounded-full border-2 border-surface bg-accent-fill"
                  />
                  <p className="text-small text-ink-900">{a.action}</p>
                  <p className="text-caption text-ink-500">
                    {a.actor} · {relativeTime(a.at)}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
    </div>
  );
}
