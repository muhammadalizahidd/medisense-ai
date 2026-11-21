"use client";

import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { CalendarClock, History } from "lucide-react";
import { AppCard, AppEmpty, AppHeader, AppSection } from "@/features/mobile/phone-frame";
import { CANCELLATION_NOTICE_HOURS } from "@/lib/live/catalogue";
import { useState } from "react";
import { api, useNow, useResource } from "@/lib/live/client";
import { shortDate, timeOfDay } from "@/lib/live/time";
import type { AppointmentDto } from "@/lib/live/types";
import { ErrorNote, Skeleton, Stars } from "./bits";
import { visitNote, visitStatus } from "./visit-list";

/** Confirm attendance (P03) and, for a video visit, join it from the app. */
export function VisitActions({ visit, onDone }: { visit: AppointmentDto; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setFail(null);
    try {
      await fn();
    } catch (e) {
      setFail(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {visit.modality === "Telehealth" && <Tag tone="outline">Video visit</Tag>}
      {visit.confirmedByPatient ? (
        <Tag tone="healthy">You confirmed</Tag>
      ) : (
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await api(`/api/visits/${visit.id}/confirm`, { method: "POST" });
              onDone();
            })
          }
        >
          Confirm I&apos;ll be there
        </Button>
      )}
      {visit.modality === "Telehealth" && (
        <Button
          size="sm"
          variant="primary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const { link } = await api<{ link: string }>(`/api/visits/${visit.id}/join-link`, {
                method: "POST",
              });
              window.open(link, "_blank", "noopener");
            })
          }
        >
          Join video visit
        </Button>
      )}
      {fail && (
        <p role="alert" className="w-full text-caption text-over">
          {fail}
        </p>
      )}
    </div>
  );
}

/** The client's visits: upcoming ones can be cancelled or moved, past ones show what happened. */
export function ClientVisits({
  onCancel,
  onRate,
}: {
  onCancel: (visit: AppointmentDto) => void;
  onRate: (visit: AppointmentDto) => void;
}) {
  const { data, error, reload } = useResource<{ visits: AppointmentDto[] }>(
    "/api/visits",
    (e) => e.type === "care",
  );
  const visits = data?.visits ?? [];
  const now = useNow() ?? 0;
  const upcoming = visits.filter(
    (v) => v.status === "booked" && new Date(v.start).getTime() >= now,
  );
  const history = visits.filter((v) => !upcoming.includes(v)).reverse();

  return (
    <>
      <AppHeader eyebrow="Visits" title="Your visits" />
      <div className="p-4">
        {error && !data ? (
          <ErrorNote message={error} onRetry={reload} />
        ) : !data ? (
          <Skeleton className="h-24" />
        ) : (
          <>
            <AppSection title="Coming up" />
            {upcoming.length === 0 ? (
              <AppEmpty icon={CalendarClock} title="No upcoming visits">
                Your visits appear here once your therapist accepts and books them.
              </AppEmpty>
            ) : (
              upcoming.map((v) => (
                <AppCard key={v.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-small font-semibold">
                        {shortDate(v.start)} · {timeOfDay(v.start)}
                      </p>
                      <p className="text-caption text-ink-700">
                        {v.discipline} with {v.therapistName}
                      </p>
                      <p className="text-caption text-ink-500">{visitNote(v)}</p>
                    </div>
                    <Button size="sm" onClick={() => onCancel(v)}>
                      Cancel or change
                    </Button>
                  </div>
                  <VisitActions visit={v} onDone={reload} />
                </AppCard>
              ))
            )}
            <p className="mb-2 px-1 text-caption text-ink-500">
              Please give {CANCELLATION_NOTICE_HOURS} hours&apos; notice to cancel or change a
              visit.
            </p>
            {history.length === 0 ? (
              <>
                <AppSection title="Earlier and changed" />
                <AppEmpty icon={History} title="No past visits yet" compact>
                  Visits you&apos;ve had, and any that changed, will be listed here.
                </AppEmpty>
              </>
            ) : (
              <>
                <AppSection title="Earlier and changed" />
                {history.map((v) => (
                  <AppCard key={v.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-small font-semibold">
                          {shortDate(v.start)} · {timeOfDay(v.start)}
                        </p>
                        <p className="text-caption text-ink-700">{visitNote(v)}</p>
                      </div>
                      <Tag tone={visitStatus[v.status].tone}>{visitStatus[v.status].label}</Tag>
                    </div>
                    {v.note && (
                      <p className="mt-2 rounded-control bg-canvas px-3 py-2 text-small">
                        {v.note.forPatient}
                      </p>
                    )}
                    {v.feedback ? (
                      <p className="mt-2 flex items-center gap-2 text-caption text-ink-700">
                        Your rating <Stars value={v.feedback.rating} />
                      </p>
                    ) : (
                      v.status === "completed" && (
                        <Button size="sm" className="mt-2" onClick={() => onRate(v)}>
                          Rate this visit
                        </Button>
                      )
                    )}
                  </AppCard>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
