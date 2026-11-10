"use client";

import { BellRing, CalendarDays, MapPin, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Avatar } from "@/components/ui/premium";
import { Tag } from "@/components/ui/tag";
import { declineReasons } from "@/lib/live/catalogue";
import { api, useResource } from "@/lib/live/client";
import { relativeTime, slotLabel } from "@/lib/live/time";
import type { RequestDto, TherapistHomeDto } from "@/lib/live/types";
import { CaseloadTag, EmptyNote, ErrorNote, LiveBadge, Panel, Skeleton } from "./bits";
import { VisitList } from "./visit-list";

export function TherapistHome() {
  const { data, error, loading, reload } = useResource<TherapistHomeDto>(
    "/api/care/therapist",
    (event) => event.type === "care" || event.type === "notification",
  );

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-24" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  const { therapist, requests, clients, upcoming, toRecord } = data;

  return (
    <>
      <PageHeader
        eyebrow={`${therapist.discipline} · ${therapist.region}`}
        title={`Hello, ${therapist.name.split(" ")[0]}`}
        description={`${therapist.activeClients} of ${therapist.capacity} patients on your caseload.`}
        actions={
          <div className="flex items-center gap-3">
            <LiveBadge />
            <CaseloadTag status={therapist.status} />
          </div>
        }
      />
      <div className="grid gap-6 xl:grid-cols-12">
        <div className="flex flex-col gap-6 xl:col-span-8">
          <Panel
            title="New patient requests"
            action={requests.length > 0 && <Tag tone="monitor">{requests.length} waiting</Tag>}
          >
            {requests.length === 0 ? (
              <EmptyNote title="No new requests.">
                When the care team asks you to take a patient, it appears here straight away.
              </EmptyNote>
            ) : (
              <ul className="flex flex-col gap-3">
                {requests.map((r) => (
                  <RequestCard key={r.id} request={r} onDone={reload} />
                ))}
              </ul>
            )}
          </Panel>
          {toRecord.length > 0 && (
            <Panel
              title="Record what happened"
              action={<Tag tone="monitor">{toRecord.length} to record</Tag>}
            >
              <VisitList
                visits={toRecord}
                show="client"
                onChanged={reload}
                emptyText="All past visits are recorded."
              />
            </Panel>
          )}
          <Panel title="Coming up">
            <VisitList
              visits={upcoming.filter((v) => v.status === "booked")}
              show="client"
              onChanged={reload}
              emptyText="No booked visits yet. They appear when you accept a patient."
            />
          </Panel>
        </div>
        <div className="flex flex-col gap-6 xl:col-span-4">
          <Panel
            title="My new patients"
            action={
              <ButtonLink href="/messages" size="sm">
                All messages
              </ButtonLink>
            }
          >
            {clients.length === 0 ? (
              <EmptyNote title="No patients accepted here yet." />
            ) : (
              <ul className="divide-y divide-border">
                {clients.map((c) => (
                  <li
                    key={`${c.id}-${c.discipline}`}
                    className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <Avatar name={c.name} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-small font-semibold">{c.name}</span>
                      <span className="block text-caption text-ink-500">
                        {c.suburb} · {c.discipline}, {c.frequency.toLowerCase()}
                      </span>
                    </span>
                    {c.conversationId && (
                      <ButtonLink href={`/messages?c=${c.conversationId}`} size="sm">
                        <MessageCircle className="size-3.5" aria-hidden="true" />
                        Message
                      </ButtonLink>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

export function RequestCard({
  request: r,
  onDone,
  onAccepted,
}: {
  request: RequestDto;
  onDone: () => void;
  /** Where to go once accepted; the web opens Messages. */
  onAccepted?: (conversationId: string) => void;
}) {
  const router = useRouter();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState<(typeof declineReasons)[number]>(declineReasons[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function answer(body: { decision: "accept" } | { decision: "decline"; reason: string }) {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ conversationId: string | null }>(`/api/care/requests/${r.id}`, {
        body,
      });
      onDone();
      if (body.decision === "accept" && result.conversationId) {
        if (onAccepted) onAccepted(result.conversationId);
        else router.push(`/messages?c=${result.conversationId}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send your answer.");
      setBusy(false);
    }
  }

  return (
    <li className="rounded-control border border-accent bg-accent-tint p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-9 flex-none items-center justify-center rounded-full bg-accent-fill text-on-accent">
          <BellRing className="size-4.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-small font-semibold">
            {r.clientName}
            {r.age !== null && <span className="font-normal text-ink-700">, {r.age}</span>}
          </p>
          <p className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-700">
            <span>
              {r.discipline}, {r.frequency.toLowerCase()}
            </span>
            <span>{r.funding}</span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden="true" />
              {r.suburb}
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              First visit {slotLabel(r.firstVisit)}
            </span>
          </p>
          {r.notes && <p className="mt-2 text-small whitespace-pre-line text-ink-900">{r.notes}</p>}
          <p className="mt-2 text-caption text-ink-500">Sent {relativeTime(r.createdAt)}</p>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-small text-over">
          {error}
        </p>
      )}
      {declining ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-caption font-semibold text-ink-700">
            Reason
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as (typeof declineReasons)[number])}
              className="h-9 rounded-control border border-border-strong bg-surface-raised px-2 text-small"
            >
              {declineReasons.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <Button disabled={busy} onClick={() => answer({ decision: "decline", reason })}>
            {busy ? "Sending…" : "Decline patient"}
          </Button>
          <Button variant="ghost" onClick={() => setDeclining(false)}>
            Back
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" disabled={busy} onClick={() => answer({ decision: "accept" })}>
            {busy ? "Accepting…" : "Accept patient"}
          </Button>
          <Button disabled={busy} onClick={() => setDeclining(true)}>
            Decline
          </Button>
        </div>
      )}
    </li>
  );
}
