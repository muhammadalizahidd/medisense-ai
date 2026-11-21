"use client";

import {
  CalendarClock,
  CalendarPlus,
  CalendarX2,
  type LucideIcon,
  RotateCcw,
  Send,
  UserRoundPlus,
  Video,
  House,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AiChip } from "@/components/ai/provenance";
import { IconBadge, type BadgeTone } from "@/features/mobile/phone-frame";
import { cn } from "@/lib/cn";
import type { Proposal, RunDto } from "@/lib/live/agent";
import type {
  AgentPatientDto,
  BookingAgentDto,
  BookingTask,
  ClinicianOptionDto,
  ParsedRequest,
  ProposeResult,
} from "@/lib/live/booking";
import { useResource } from "@/lib/live/client";
import { slotLabel } from "@/lib/live/time";
import { agentCall, ProposalCard } from "./agent-ui";

const ENDPOINT = "/api/agent/booking";

const taskLook: Record<BookingTask, { icon: LucideIcon; tone: BadgeTone }> = {
  assign: { icon: UserRoundPlus, tone: "teal" },
  book: { icon: CalendarPlus, tone: "blue" },
  reschedule: { icon: CalendarClock, tone: "violet" },
  cancel: { icon: CalendarX2, tone: "red" },
};

type Options = {
  needId: string;
  support: string;
  clinicians: ClinicianOptionDto[];
  visit: { id: string; ref: string; start: string } | null;
};

type Flow = {
  task: BookingTask | null;
  clientId: string | null;
  visitId: string | null;
  opts: Options | null;
  therapistId: string | null;
  start: string | null;
  telehealth: boolean;
  day: string | null;
  part: ParsedRequest["part"];
  result: ProposeResult | null;
  done: RunDto | null;
  said: string | null;
  understood: string | null;
  parsedByAi: boolean;
  error: string | null;
};

const fresh: Flow = {
  task: null,
  clientId: null,
  visitId: null,
  opts: null,
  therapistId: null,
  start: null,
  telehealth: false,
  day: null,
  part: null,
  result: null,
  done: null,
  said: null,
  understood: null,
  parsedByAi: false,
  error: null,
};

const weekday = (iso: string) =>
  new Intl.DateTimeFormat("en-AU", { weekday: "long", timeZone: "Australia/Brisbane" })
    .format(new Date(iso))
    .toLowerCase();
const hour = (iso: string) =>
  Number(
    new Intl.DateTimeFormat("en-AU", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Australia/Brisbane",
    }).format(new Date(iso)),
  );

function Agent({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 flex size-7 flex-none items-center justify-center rounded-full bg-accent-fill text-caption font-bold text-on-accent">
        M
      </span>
      <div className="min-w-0 flex-1 rounded-card rounded-tl-sm border border-border bg-surface p-3 text-small text-ink-900">
        {children}
      </div>
    </div>
  );
}

function Me({ children }: { children: ReactNode }) {
  return (
    <p className="ml-10 self-end rounded-card rounded-br-sm bg-accent-fill px-3 py-2 text-small font-semibold text-on-accent">
      {children}
    </p>
  );
}

function Chip({
  children,
  onClick,
  active,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full border px-3 py-1.5 text-caption font-semibold transition-colors duration-140 active:scale-[0.98]",
        active
          ? "border-accent-fill bg-accent-fill text-on-accent"
          : "border-border-strong bg-surface text-ink-700 hover:border-accent-fill hover:text-accent",
      )}
    >
      {children}
    </button>
  );
}

/**
 * The booking agent: a guided chat with fixed tasks for the signed-in person. Each step reads live
 * records, the times offered are real free slots, and the booking is a proposal they confirm.
 */
export function BookingAgent({
  compact = false,
  dock = false,
}: {
  compact?: boolean;
  /** In an app with a tab bar: the message box sits on its own bar just above it, as in chat apps. */
  dock?: boolean;
}) {
  const r = useResource<BookingAgentDto>(ENDPOINT);
  const d = r.data;
  const [f, setF] = useState<Flow>(fresh);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [f, busy]);

  const patient = d?.patients.find((p) => p.id === f.clientId) ?? null;
  const taskTitle = d?.tasks.find((t) => t.id === f.task)?.title ?? "";
  const isClient = d?.role === "client";

  async function loadOptions(next: Flow) {
    if (!next.task || !next.clientId) return;
    if (next.task !== "assign" && next.task !== "book" && !next.visitId && !isClient) return;
    setBusy(true);
    const o = await agentCall<Options>(ENDPOINT, {
      type: "options",
      task: next.task,
      clientId: next.clientId,
      ...(next.visitId ? { appointmentId: next.visitId } : {}),
    });
    setBusy(false);
    if (!o) {
      setF({ ...next, error: "I couldn't load that. Pick another option or start again." });
      return;
    }
    const only = o.clinicians.length === 1 ? (o.clinicians[0]?.therapistId ?? null) : null;
    const after = {
      ...next,
      opts: o,
      therapistId: next.task === "assign" ? null : only,
      error: null,
    };
    setF(after);
    if (next.task === "cancel") await proposeNow(after);
  }

  async function proposeNow(next: Flow) {
    if (!next.task || !next.clientId) return;
    setBusy(true);
    const res = await agentCall<ProposeResult>(ENDPOINT, {
      type: "propose",
      task: next.task,
      clientId: next.clientId,
      ...(next.opts?.needId ? { needId: next.opts.needId } : {}),
      ...(next.therapistId ? { therapistId: next.therapistId } : {}),
      ...(next.opts?.visit ? { appointmentId: next.opts.visit.id } : {}),
      ...(next.start ? { start: next.start } : {}),
      telehealth: next.telehealth,
      reason: next.said ?? undefined,
    });
    setBusy(false);
    setF({ ...next, result: res, error: res ? null : "That didn't work. Try another time." });
  }

  function chooseTask(task: BookingTask) {
    const own = isClient ? (d?.patients[0]?.id ?? null) : null;
    const next = { ...fresh, task, clientId: own };
    setF(next);
    if (own) void loadOptions(next);
  }

  function choosePatient(p: AgentPatientDto) {
    const next = {
      ...f,
      clientId: p.id,
      opts: null,
      visitId: null,
      therapistId: null,
      start: null,
    };
    setF(next);
    setSearch("");
    void loadOptions(next);
  }

  async function sendText(t: string) {
    if (!t.trim() || !d) return;
    setText("");
    setBusy(true);
    const out = await agentCall<{ parsed: ParsedRequest }>(ENDPOINT, { type: "parse", text: t });
    setBusy(false);
    const p = out?.parsed;
    if (!p?.task) {
      setF({
        ...fresh,
        said: t,
        error: "I can only help with the tasks below. Pick one to start.",
      });
      return;
    }
    const clientId = isClient ? (d.patients[0]?.id ?? null) : p.patientId;
    const visit =
      (p.task === "reschedule" || p.task === "cancel") && clientId && !isClient
        ? (d.visits.find((v) => v.clientId === clientId)?.id ?? null)
        : null;
    const who = d.patients.find((x) => x.id === clientId)?.name;
    const next: Flow = {
      ...fresh,
      task: p.task,
      clientId,
      visitId: visit,
      telehealth: p.telehealth,
      day: p.day,
      part: p.part,
      said: t,
      parsedByAi: p.ai,
      understood: [
        d.tasks.find((x) => x.id === p.task)?.title,
        who && !isClient ? `for ${who}` : null,
        p.day ? `on ${p.day}` : null,
        p.part,
        p.telehealth ? "by video" : null,
      ]
        .filter(Boolean)
        .join(" "),
    };
    setF(next);
    void loadOptions(next);
  }

  const visitsFor = d?.visits.filter((v) => v.clientId === f.clientId) ?? [];
  const pool =
    d?.patients.filter((p) =>
      f.task === "assign"
        ? p.needs.some((n) => n.status === "needs-therapist")
        : f.task === "book"
          ? p.needs.some((n) => n.therapist)
          : d.visits.some((v) => v.clientId === p.id),
    ) ?? [];
  const shownPatients = pool
    .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 8);
  const clinician = f.opts?.clinicians.find((c) => c.therapistId === f.therapistId) ?? null;
  const allSlots = clinician?.slots ?? [];
  const wanted = allSlots.filter(
    (s) =>
      (!f.day || f.day === "tomorrow" || weekday(s) === f.day) &&
      (!f.part || (f.part === "morning" ? hour(s) < 12 : hour(s) >= 12)),
  );
  const slots = wanted.length ? wanted : allSlots;

  if (!d) return <div className="h-48 animate-pulse rounded-card bg-sunken" />;

  return (
    <div className={cn("flex flex-col gap-3", compact ? "" : "pb-2")}>
      <Agent>
        <p>
          Hi {d.name.split(" ")[0]}. I&apos;m the Medisense booking agent. I can do these tasks for
          you, using real free times. Nothing is booked until you confirm.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {d.tasks.map((t) => {
            const look = taskLook[t.id];
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => chooseTask(t.id)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-card border p-2.5 text-left transition-colors duration-140 hover:border-accent-fill",
                  f.task === t.id ? "border-accent-fill bg-accent-tint" : "border-border bg-page",
                )}
              >
                <IconBadge icon={look.icon} tone={look.tone} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block text-small font-semibold text-ink-900">{t.title}</span>
                  <span className="block text-caption text-ink-500">{t.detail}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Agent>

      {!f.task && !f.said && (
        <>
          {d.visits.length > 0 && (
            <Agent>
              <p className="mb-2 font-semibold text-ink-900">Coming up</p>
              <ul className="flex flex-col gap-1.5">
                {d.visits.slice(0, 4).map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center gap-2.5 rounded-card border border-border bg-page p-2"
                  >
                    <span className="flex size-9 flex-none flex-col items-center justify-center rounded-control bg-accent-tint text-accent">
                      {v.modality === "Telehealth" ? (
                        <Video className="size-4" aria-hidden="true" />
                      ) : (
                        <House className="size-4" aria-hidden="true" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-small font-semibold text-ink-900">
                        {isClient ? v.therapist : v.patient}
                      </span>
                      <span className="block truncate text-caption text-ink-500">
                        {slotLabel(v.start)} ·{" "}
                        {v.modality === "Telehealth" ? "Video" : "Home visit"}
                      </span>
                    </span>
                    <span className="font-mono text-label text-ink-500">{v.ref}</span>
                  </li>
                ))}
              </ul>
            </Agent>
          )}
          <Agent>
            <p className="mb-2 font-semibold text-ink-900">Try saying</p>
            <div className="flex flex-wrap gap-1.5">
              {(isClient
                ? [
                    "Book a video visit on Tuesday morning",
                    "Move my next visit to Friday afternoon",
                    "Cancel my next visit",
                  ]
                : [
                    `Book ${d.patients[0]?.name.split(" ")[0] ?? "Harper"} on Tuesday morning`,
                    `Reschedule ${d.patients[1]?.name.split(" ")[0] ?? "Alex"}'s visit to Friday`,
                    `Book ${d.patients[2]?.name.split(" ")[0] ?? "Mason"} by video next week`,
                  ]
              ).map((s) => (
                <Chip key={s} onClick={() => void sendText(s)}>
                  {s}
                </Chip>
              ))}
            </div>
          </Agent>
        </>
      )}

      {f.said && <Me>{f.said}</Me>}
      {f.said && f.understood && (
        <Agent>
          {f.parsedByAi && (
            <div className="mb-1.5">
              <AiChip>AI understood</AiChip>
            </div>
          )}
          <p>
            Got it: <b>{f.understood}</b>.
          </p>
        </Agent>
      )}
      {!f.said && f.task && <Me>{taskTitle}</Me>}

      {f.task && !f.clientId && !isClient && (
        <Agent>
          <p>
            {f.task === "assign"
              ? "Which waiting patient?"
              : f.task === "book"
                ? "Which patient is the visit for?"
                : "Whose visit?"}
          </p>
          <input
            aria-label="Find a patient"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type a name"
            className="mt-2 h-9 w-full rounded-control border border-border-strong bg-surface px-3 text-small"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {shownPatients.map((p) => (
              <Chip key={p.id} onClick={() => choosePatient(p)}>
                {p.name}
              </Chip>
            ))}
            {!shownPatients.length && (
              <span className="text-caption text-ink-500">No patient matches.</span>
            )}
          </div>
        </Agent>
      )}
      {patient && !isClient && <Me>{patient.name}</Me>}

      {(f.task === "reschedule" || f.task === "cancel") &&
        f.clientId &&
        !isClient &&
        !f.visitId && (
          <Agent>
            <p>Which visit?</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {visitsFor.map((v) => (
                <Chip
                  key={v.id}
                  onClick={() => {
                    const next = { ...f, visitId: v.id };
                    setF(next);
                    void loadOptions(next);
                  }}
                >
                  {v.ref} · {slotLabel(v.start)}
                </Chip>
              ))}
            </div>
          </Agent>
        )}

      {f.opts && f.task === "assign" && (
        <Agent>
          <p>
            For <b>{f.opts.support}</b>, the top eligible therapists (registration, scope, region
            and capacity checked):
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {f.opts.clinicians.map((c, i) => (
              <button
                key={c.therapistId}
                type="button"
                onClick={() =>
                  setF({ ...f, therapistId: c.therapistId, start: null, result: null })
                }
                className={cn(
                  "cursor-pointer rounded-card border p-2.5 text-left transition-colors duration-140",
                  f.therapistId === c.therapistId
                    ? "border-accent-fill bg-accent-tint"
                    : "border-border bg-page hover:border-accent-fill",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-small font-semibold text-ink-900">
                    {i === 0 ? "Best match · " : ""}
                    {c.name}
                  </span>
                  {c.score !== null && (
                    <span className="rounded-tag bg-healthy-bg px-1.5 py-0.5 text-caption font-semibold text-healthy">
                      Score {c.score}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-caption text-ink-500">
                  {c.discipline} · {c.region} · {c.reasons.join(" · ")}
                </span>
              </button>
            ))}
            {!f.opts.clinicians.length && (
              <p className="text-caption text-over">
                No eligible therapist right now. This becomes a capacity exception for Operations.
              </p>
            )}
          </div>
        </Agent>
      )}

      {f.opts && f.task !== "cancel" && clinician && (
        <Agent>
          {f.task !== "assign" && (
            <p className="mb-1">
              {f.opts.visit ? (
                <>
                  Current time <b>{slotLabel(f.opts.visit.start)}</b>.{" "}
                </>
              ) : null}
              With <b>{clinician.name}</b> ({clinician.reasons[0]?.toLowerCase()}).
            </p>
          )}
          <p>
            {wanted.length || (!f.day && !f.part)
              ? "Real free times:"
              : `Nothing free ${[f.day, f.part]
                  .filter(Boolean)
                  .join(" ")
                  .replace(/^./, (x) => x.toUpperCase())}; the nearest free times:`}
          </p>
          {f.task === "book" && (
            <div role="radiogroup" aria-label="Visit type" className="mt-2 flex gap-1.5">
              <Chip
                active={!f.telehealth}
                onClick={() => setF({ ...f, telehealth: false, result: null })}
              >
                <House className="mr-1 inline size-3.5" aria-hidden="true" />
                In person
              </Chip>
              <Chip
                active={f.telehealth}
                onClick={() => setF({ ...f, telehealth: true, result: null })}
              >
                <Video className="mr-1 inline size-3.5" aria-hidden="true" />
                Telehealth
              </Chip>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {slots.map((s) => (
              <Chip
                key={s}
                active={f.start === s}
                onClick={() => {
                  const next = { ...f, start: s, result: null, done: null };
                  setF(next);
                  void proposeNow(next);
                }}
              >
                {slotLabel(s)}
              </Chip>
            ))}
            {!slots.length && (
              <span className="text-caption text-ink-500">
                No free time in the next two weeks. I can&apos;t invent one; the team will offer the
                waitlist.
              </span>
            )}
          </div>
        </Agent>
      )}
      {f.start && <Me>{slotLabel(f.start)}</Me>}

      {busy && (
        <p role="status" className="ml-10 animate-pulse text-caption text-ink-500">
          Checking live schedules…
        </p>
      )}
      {f.error && (
        <Agent>
          <p className="text-over">{f.error}</p>
        </Agent>
      )}

      {f.result && (
        <Agent>
          <p className="mb-2">{f.result.summary}</p>
          <ProposalCard
            key={f.result.proposal.runId}
            p={f.result.proposal as Proposal}
            endpoint="/api/agent"
            onDone={(run) => {
              setF((x) => ({ ...x, done: run }));
              r.reload();
            }}
          />
        </Agent>
      )}
      {f.done && (
        <Agent>
          <p>
            {f.done.status === "Completed"
              ? `Done. ${f.done.result}.`
              : f.done.status === "Declined"
                ? "Cancelled. Nothing was changed."
                : f.done.result}
          </p>
          <button
            type="button"
            onClick={() => setF(fresh)}
            className="mt-2 flex cursor-pointer items-center gap-1.5 text-caption font-semibold text-accent"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Do another task
          </button>
        </Agent>
      )}
      <div ref={end} className={dock ? "h-24 scroll-mb-40" : "scroll-mb-20"} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendText(text);
        }}
        className={cn(
          "flex items-center gap-2",
          dock
            ? "absolute inset-x-0 bottom-18 z-20 border-t border-border bg-page px-3 pt-2.5 pb-3 md:bottom-21"
            : "sticky bottom-0 bg-page pt-1",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5",
            dock &&
              "rounded-full border border-border-strong bg-surface p-1.5 pl-4 shadow-lift focus-within:border-accent-fill",
          )}
        >
          <input
            aria-label="Tell the booking agent"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              isClient
                ? "e.g. Book a video visit on Tuesday morning"
                : "e.g. Book Harper on Tuesday morning"
            }
            className={cn(
              "min-w-0 flex-1 text-small",
              dock
                ? "h-9 bg-transparent text-ink-900 outline-none placeholder:text-ink-500 focus-visible:shadow-none"
                : "h-10 rounded-full border border-border-strong bg-surface px-4",
            )}
          />
          {dock && <SendButton busy={busy} empty={!text.trim()} />}
        </div>
        {!dock && <SendButton busy={busy} empty={!text.trim()} />}
      </form>
    </div>
  );
}

function SendButton({ busy, empty }: { busy: boolean; empty: boolean }) {
  return (
    <button
      type="submit"
      aria-label="Send to the booking agent"
      disabled={busy || empty}
      className="flex size-9 flex-none cursor-pointer items-center justify-center rounded-full bg-accent-fill text-on-accent transition-transform duration-140 active:scale-95 disabled:opacity-40"
    >
      <Send className="size-4" aria-hidden="true" />
    </button>
  );
}
