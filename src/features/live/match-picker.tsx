"use client";

import { CalendarClock, CalendarOff, Send, Wand2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/premium";
import { api, useResource } from "@/lib/live/client";
import type { Discipline } from "@/lib/live/catalogue";
import { shortDate, slotLabel, timeOfDay } from "@/lib/live/time";
import type { MatchDto } from "@/lib/live/types";
import { cn } from "@/lib/cn";
import { CaseloadTag, EmptyNote, ErrorNote, Skeleton } from "./bits";

const reasonTone = {
  good: "bg-healthy-bg text-healthy",
  neutral: "bg-canvas text-ink-700",
  warn: "bg-monitor-bg text-monitor",
};

/** Ranked therapists for one therapy, with their open times. Picking a time sends the request. */
export function MatchPicker({
  clientId,
  needId,
  discipline,
  onSent,
}: {
  clientId: string;
  needId: string;
  discipline: Discipline;
  onSent: () => void;
}) {
  const url = `/api/care/clients/${clientId}/matches?need=${encodeURIComponent(needId)}`;
  const { data, error, loading, reload } = useResource<{ matches: MatchDto[] }>(
    url,
    (event) => event.type === "care",
  );
  const [showAll, setShowAll] = useState(false);
  const [choice, setChoice] = useState<{ therapist: MatchDto; start: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading && !data) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        <span className="sr-only">Finding therapists…</span>
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }
  const matches = data?.matches ?? [];
  if (!matches.length) {
    return <EmptyNote title={`No ${discipline.toLowerCase()} therapists are set up yet.`} />;
  }
  const shown = showAll ? matches : matches.slice(0, 3);

  async function autoAllocate() {
    setSending(true);
    setSendError(null);
    try {
      await api(`/api/care/clients/${clientId}/auto-allocate`, { body: { needId } });
      onSent();
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Couldn't allocate automatically.");
    } finally {
      setSending(false);
    }
  }

  async function send() {
    if (!choice) return;
    setSending(true);
    setSendError(null);
    try {
      await api(`/api/care/clients/${clientId}/requests`, {
        body: { needId, therapistId: choice.therapist.therapistId, start: choice.start },
      });
      setChoice(null);
      onSent();
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Couldn't send the request.");
      reload();
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-caption text-ink-500">
          Rules check registration, screening and scope first, then rank by region, free places,
          caseload health and how soon they can start. Choose a time to send the request.
        </p>
        <Button size="sm" disabled={sending} onClick={autoAllocate}>
          <Wand2 className="size-3.5" aria-hidden="true" />
          Auto-allocate (low-risk rule)
        </Button>
      </div>
      <ul className="flex flex-col gap-3">
        {shown.map((m, index) => (
          <li
            key={m.therapistId}
            className={cn(
              "rounded-control border p-4",
              choice?.therapist.therapistId === m.therapistId
                ? "border-accent bg-accent-tint"
                : "border-border",
              !m.eligible && "opacity-70",
            )}
          >
            <div className="flex flex-wrap items-start gap-3">
              <Avatar name={m.name} size={40} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-small font-semibold">
                  {m.name}
                  {!m.eligible && (
                    <span className="rounded-tag bg-over-bg px-1.5 py-0.5 text-label text-over">
                      Unavailable
                    </span>
                  )}
                  {index === 0 && m.eligible && (
                    <span className="rounded-tag bg-accent-fill px-1.5 py-0.5 text-label text-on-accent">
                      Best match
                    </span>
                  )}
                </p>
                <p className="text-caption text-ink-500">
                  {m.seniority} · {m.activeClients} of {m.capacity} patients · {m.sessionMinutes}{" "}
                  min sessions · <Link href={`/care/therapists/${m.therapistId}`}>Profile</Link>
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-700">
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="size-3.5 text-ink-500" aria-hidden="true" />
                    Works {m.availability.pattern}
                  </span>
                  {m.availability.away.map((a) => (
                    <span
                      key={`${a.from}-${a.to}`}
                      className="inline-flex items-center gap-1 text-monitor"
                    >
                      <CalendarOff className="size-3.5" aria-hidden="true" />
                      Away {shortDate(`${a.from}T00:00:00+10:00`)}
                      {a.to !== a.from && `–${shortDate(`${a.to}T00:00:00+10:00`)}`} (
                      {a.reason.toLowerCase()})
                    </span>
                  ))}
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {m.reasons.map((r) => (
                    <li
                      key={r.label}
                      className={cn(
                        "rounded-tag px-2 py-0.5 text-caption font-medium",
                        reasonTone[r.tone],
                      )}
                    >
                      {r.label}
                    </li>
                  ))}
                </ul>
              </div>
              <CaseloadTag status={m.status} />
            </div>
            {m.slots.length > 0 ? (
              <fieldset className="mt-3">
                <legend className="mb-1.5 text-caption font-semibold text-ink-700">
                  First visit times
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {m.slots.map((slot) => {
                    const picked =
                      choice?.therapist.therapistId === m.therapistId && choice.start === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        aria-pressed={picked}
                        onClick={() => setChoice(picked ? null : { therapist: m, start: slot })}
                        className={cn(
                          "cursor-pointer rounded-control border px-2.5 py-1.5 text-caption font-medium",
                          picked
                            ? "border-accent-fill bg-accent-fill text-on-accent"
                            : "border-border-strong bg-surface text-ink-900 hover:bg-canvas",
                        )}
                      >
                        <span className="block">{shortDate(slot)}</span>
                        <span className="block font-semibold">{timeOfDay(slot)}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : (
              <p className="mt-3 text-caption text-ink-500">
                {m.eligible
                  ? "No open times in the next two weeks."
                  : "Can't be assigned until the credential checks pass."}
              </p>
            )}
          </li>
        ))}
      </ul>
      {matches.length > 3 && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll(!showAll)}>
          {showAll ? "Show fewer" : `Show all ${matches.length} therapists`}
        </Button>
      )}
      {sendError && (
        <p role="alert" className="mt-3 rounded-control bg-over-bg px-3 py-2 text-small text-over">
          {sendError}
        </p>
      )}
      {choice && (
        <div className="sticky bottom-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-control border border-accent bg-raised px-4 py-3 shadow-overlay">
          <p className="text-small">
            Ask <strong>{choice.therapist.name}</strong> to take this patient, first visit{" "}
            <strong>{slotLabel(choice.start)}</strong>. The time is held until they reply.
          </p>
          <Button variant="primary" onClick={send} disabled={sending}>
            <Send className="size-4" aria-hidden="true" />
            {sending ? "Sending…" : "Send request"}
          </Button>
        </div>
      )}
    </div>
  );
}
