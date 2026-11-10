"use client";

import { ArrowLeft, MessageCircle } from "lucide-react";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { MetricBand } from "@/components/ui/metric-band";
import { PageHeader } from "@/components/ui/page";
import { useNow, useResource } from "@/lib/live/client";
import { ageLabel, relativeTime, shortDate } from "@/lib/live/time";
import type { ClientDetailDto } from "@/lib/live/types";
import { ErrorNote, LiveBadge, Panel, Skeleton, StageTag, Stars } from "./bits";
import { DischargeSheet } from "./care-sheets";
import { useConversations } from "./conversations";
import { VisitList } from "./visit-list";

/**
 * A therapist's view of one of their patients: details, every visit with its note and rating,
 * and everything that has happened, in order.
 */
export function TherapistPatient({ clientId }: { clientId: string }) {
  const { data, error, loading, reload } = useResource<{ client: ClientDetailDto }>(
    `/api/care/patients/${clientId}`,
    (event) =>
      event.type === "care" && (!event.payload.clientId || event.payload.clientId === clientId),
  );
  const now = useNow() ?? 0;
  const chats = useConversations();
  const conversationId = chats.data?.conversations.find((c) => c.clientId === clientId)?.id ?? null;
  const [discharging, setDischarging] = useState(false);

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-96" />;
  const p = data.client;
  const age = now ? ageLabel(p.dateOfBirth, new Date(now)) : null;
  const visits = p.appointments;
  const upcoming = visits.filter(
    (v) => v.status === "booked" && new Date(v.start).getTime() >= now,
  );
  const history = visits
    .filter((v) => !(v.status === "booked" && new Date(v.start).getTime() >= now))
    .reverse();
  const ratings = visits.flatMap((v) => (v.feedback ? [v.feedback.rating] : []));
  const average = ratings.length ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null;

  return (
    <>
      <PageHeader
        eyebrow={
          <ButtonLink href="/therapist" variant="ghost" size="sm">
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            My patients
          </ButtonLink>
        }
        title={p.name}
        description={`${age ? `${age} · ` : ""}${p.suburb}, ${p.region} · ${p.funding}`}
        actions={
          <div className="flex items-center gap-3">
            <LiveBadge />
            <StageTag stage={p.stage} />
            {conversationId && (
              <ButtonLink href={`/messages?c=${conversationId}`} size="sm">
                <MessageCircle className="size-3.5" aria-hidden="true" />
                Message
              </ButtonLink>
            )}
            {!p.discharged && (
              <Button size="sm" onClick={() => setDischarging(true)}>
                Discharge
              </Button>
            )}
          </div>
        }
      />
      {p.discharged && (
        <p
          role="status"
          className="mb-6 rounded-control border border-border bg-canvas px-4 py-3 text-small"
        >
          <strong>Discharged</strong> {shortDate(p.discharged.at)} by {p.discharged.byName}:{" "}
          {p.discharged.reason}.
        </p>
      )}
      <div className="mb-6">
        <MetricBand
          label="Visit figures"
          metrics={[
            { label: "Upcoming", value: upcoming.length },
            { label: "Completed", value: visits.filter((v) => v.status === "completed").length },
            {
              label: "No-shows",
              value: visits.filter((v) => v.status === "no-show").length,
              tone: visits.some((v) => v.status === "no-show") ? "over" : undefined,
            },
            {
              label: "Cancelled",
              value: visits.filter((v) => v.status === "cancelled" || v.status === "late-cancelled")
                .length,
              caption: `${visits.filter((v) => v.status === "late-cancelled").length} late`,
            },
            {
              label: "Their rating",
              value: average ? average.toFixed(1) : "–",
              caption: average ? <Stars value={average} /> : "Not rated yet",
            },
          ]}
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-12">
        <div className="flex flex-col gap-6 xl:col-span-8">
          <Panel title="Coming up">
            <VisitList
              visits={upcoming}
              show="therapist"
              onChanged={reload}
              emptyText="No upcoming visits."
            />
          </Panel>
          <Panel title="Visit history">
            <VisitList
              visits={history}
              show="therapist"
              onChanged={reload}
              emptyText="No past visits yet. Completed, missed and cancelled visits appear here with their notes."
            />
          </Panel>
        </div>
        <div className="flex flex-col gap-6 xl:col-span-4">
          <Panel title="Details">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-small">
              <dt className="text-ink-500">Phone</dt>
              <dd>{p.phone ?? "Not given"}</dd>
              <dt className="text-ink-500">Email</dt>
              <dd className="break-all">{p.email}</dd>
              <dt className="text-ink-500">Emergency</dt>
              <dd>
                {p.emergencyContact
                  ? `${p.emergencyContact.name} (${p.emergencyContact.relationship}), ${p.emergencyContact.phone}`
                  : "Not given yet"}
              </dd>
              <dt className="text-ink-500">Therapy</dt>
              <dd>
                {p.needs.map((n) => `${n.discipline}, ${n.frequency.toLowerCase()}`).join("; ")}
              </dd>
            </dl>
            {p.notes && (
              <p className="mt-4 border-t border-border pt-3 text-small whitespace-pre-line text-ink-700">
                {p.notes}
              </p>
            )}
          </Panel>
          <Panel title="History">
            {p.activity.length === 0 ? (
              <p className="text-small text-ink-500">Nothing yet.</p>
            ) : (
              <ol className="relative flex flex-col gap-3 border-l border-border pl-4">
                {p.activity.map((a) => (
                  <li key={a.id} className="relative text-small">
                    <i
                      aria-hidden="true"
                      className="absolute top-1.5 -left-5.5 size-2.5 rounded-full border-2 border-surface bg-accent-fill"
                    />
                    <span className="block">{a.action}</span>
                    <span className="text-caption text-ink-500">
                      {a.actor} · {relativeTime(a.at)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>
      {discharging && (
        <DischargeSheet
          clientId={p.id}
          name={p.name}
          upcoming={upcoming.length}
          onClose={() => setDischarging(false)}
          onDone={reload}
        />
      )}
    </>
  );
}
