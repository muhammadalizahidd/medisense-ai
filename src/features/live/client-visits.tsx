"use client";

import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { AppCard, AppHeader } from "@/features/mobile/phone-frame";
import { CANCELLATION_NOTICE_HOURS } from "@/lib/live/catalogue";
import { useNow, useResource } from "@/lib/live/client";
import { shortDate, timeOfDay } from "@/lib/live/time";
import type { AppointmentDto } from "@/lib/live/types";
import { ErrorNote, Skeleton, Stars } from "./bits";
import { visitNote, visitStatus } from "./visit-list";

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
            <h3 className="mb-2 text-small font-semibold">Coming up</h3>
            {upcoming.length === 0 ? (
              <AppCard>
                <p className="text-small text-ink-700">
                  No visits booked yet. They appear here once your therapist accepts.
                </p>
              </AppCard>
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
                </AppCard>
              ))
            )}
            <p className="mb-4 text-caption text-ink-500">
              Please give {CANCELLATION_NOTICE_HOURS} hours&apos; notice to cancel or change a
              visit.
            </p>
            {history.length > 0 && (
              <>
                <h3 className="mb-2 text-small font-semibold">Earlier and changed</h3>
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
