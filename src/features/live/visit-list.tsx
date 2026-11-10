"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Tag, type TagTone } from "@/components/ui/tag";
import { api } from "@/lib/live/client";
import { shortDate, timeOfDay } from "@/lib/live/time";
import type { AppointmentDto, VisitStatus } from "@/lib/live/types";
import { Stars } from "./bits";
import { CancelVisitPanel } from "./cancel-visit";
import { NoteSheet } from "./care-sheets";

export const visitStatus: Record<VisitStatus, { label: string; tone: TagTone }> = {
  tentative: { label: "Held", tone: "monitor" },
  booked: { label: "Booked", tone: "available" },
  completed: { label: "Completed", tone: "healthy" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  "late-cancelled": { label: "Late cancellation", tone: "over" },
  "no-show": { label: "No-show", tone: "over" },
};

/** What a visit says about itself: series position and, if called off, why and with what notice. */
export function visitNote(v: AppointmentDto) {
  if (v.cancellation) {
    const c = v.cancellation;
    if (v.status === "no-show") return "Patient wasn't there. May be charged.";
    return `${c.reason}. ${c.by === "client" ? "Patient" : "Medisense"} cancelled with ${c.noticeHours} hours' notice${c.chargeable ? ", may be charged" : ""}.`;
  }
  return v.series ? `Visit ${v.series.index} of ${v.series.total}` : "One-off visit";
}

/** Visits for the care team: cancel or change upcoming ones, record what happened to past ones. */
export function VisitList({
  visits,
  show,
  onChanged,
  emptyText,
}: {
  visits: AppointmentDto[];
  show: "client" | "therapist";
  onChanged: () => void;
  emptyText: string;
}) {
  const [cancelling, setCancelling] = useState<AppointmentDto | null>(null);
  const [noting, setNoting] = useState<AppointmentDto | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  async function record(visit: AppointmentDto, outcome: "completed" | "no-show") {
    setBusy(visit.id);
    setError(null);
    try {
      await api(`/api/visits/${visit.id}/outcome`, { body: { outcome } });
      onChanged();
      // A completed visit goes straight on to its note, while it's fresh.
      if (outcome === "completed") setNoting({ ...visit, status: "completed" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't record that.");
    } finally {
      setBusy(null);
    }
  }

  if (!visits.length) return <p className="text-small text-ink-500">{emptyText}</p>;

  return (
    <>
      {error && (
        <p role="alert" className="mb-3 text-small text-over">
          {error}
        </p>
      )}
      <ol className="divide-y divide-border">
        {visits.map((v) => {
          const past = new Date(v.start).getTime() < now;
          const status = visitStatus[v.status];
          return (
            <li
              key={v.id}
              className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <span className="w-24 flex-none">
                <span className="block text-small font-semibold">{timeOfDay(v.start)}</span>
                <span className="block text-caption text-ink-500">{shortDate(v.start)}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-small">
                  {show === "client" ? v.clientName : `${v.discipline} · ${v.therapistName}`}
                </span>
                <span className="block text-caption text-ink-500">{visitNote(v)}</span>
                {v.note && (
                  <span className="mt-1 block text-caption text-ink-700">
                    <strong className="font-semibold">Note:</strong>{" "}
                    {v.note.text ?? v.note.forPatient}
                  </span>
                )}
                {v.feedback && (
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-caption text-ink-700">
                    <Stars value={v.feedback.rating} />
                    {v.feedback.comment && <span>“{v.feedback.comment}”</span>}
                  </span>
                )}
              </span>
              <Tag tone={status.tone}>{status.label}</Tag>
              {v.status === "booked" && !past && (
                <Button size="sm" onClick={() => setCancelling(v)}>
                  Cancel or change
                </Button>
              )}
              {v.status === "booked" && past && (
                <span className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy === v.id}
                    onClick={() => record(v, "completed")}
                  >
                    Completed
                  </Button>
                  <Button size="sm" disabled={busy === v.id} onClick={() => record(v, "no-show")}>
                    No-show
                  </Button>
                </span>
              )}
              {v.status === "completed" && (
                <Button
                  size="sm"
                  variant={v.note ? "secondary" : "primary"}
                  onClick={() => setNoting(v)}
                >
                  {v.note ? "Edit note" : "Write note"}
                </Button>
              )}
            </li>
          );
        })}
      </ol>
      {noting && <NoteSheet visit={noting} onClose={() => setNoting(null)} onSaved={onChanged} />}
      {cancelling && (
        <Sheet
          title="Cancel or change a visit"
          description="The patient, therapist and care team are told straight away."
          onClose={() => setCancelling(null)}
        >
          <CancelVisitPanel
            visit={cancelling}
            staff
            onClose={() => setCancelling(null)}
            onChanged={onChanged}
          />
        </Sheet>
      )}
    </>
  );
}
