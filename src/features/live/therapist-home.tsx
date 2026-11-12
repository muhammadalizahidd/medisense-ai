"use client";

import { BellRing, CalendarDays, MapPin, MessageCircle, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Select } from "@/components/ui/select";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Avatar } from "@/components/ui/premium";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { declineReasons } from "@/lib/live/catalogue";
import { api, useResource } from "@/lib/live/client";
import { relativeTime, slotLabel } from "@/lib/live/time";
import type { RequestDto, TherapistHomeDto } from "@/lib/live/types";
import { CaseloadTag, EmptyNote, ErrorNote, LiveBadge, Panel, Skeleton } from "./bits";
import { DischargeSheet } from "./care-sheets";
import { VisitList } from "./visit-list";

export function TherapistHome() {
  const [discharging, setDischarging] = useState<TherapistHomeDto["clients"][number] | null>(null);
  const { data, error, loading, reload } = useResource<TherapistHomeDto>(
    "/api/care/therapist",
    (event) => event.type === "care" || event.type === "notification",
  );
  const counts = {
    today: (data?.toRecord.length ?? 0) + (data?.notesToWrite.length ?? 0),
    requests: data?.requests.length ?? 0,
    patients: data?.clients.filter((c) => !c.discharged).length ?? 0,
  };
  const tabs = [
    { id: "today", label: "Today", count: counts.today, alert: true },
    { id: "requests", label: "Requests", count: counts.requests, alert: true },
    { id: "patients", label: "My patients", count: counts.patients },
    { id: "recent", label: "Recent visits" },
  ] as const;
  const [tab, setTab] = useTab(tabs);

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-24" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  const { therapist, requests, clients, upcoming, toRecord, notesToWrite, recent } = data;
  const booked = upcoming.filter((v) => v.status === "booked");

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
      <Tabs label="My work" tabs={tabs} value={tab} onChange={setTab} />
      <TabPanel id="today" value={tab}>
        {toRecord.length === 0 && notesToWrite.length === 0 && requests.length === 0 && (
          <p className="rounded-card border border-healthy-bg bg-healthy-bg px-5 py-4 text-small">
            You&apos;re all caught up: no requests, visits to record or notes to sign.
          </p>
        )}
        {requests.length > 0 && (
          <button
            type="button"
            onClick={() => setTab("requests")}
            className="flex cursor-pointer items-center justify-between rounded-card border border-accent bg-accent-tint px-5 py-4 text-left text-small"
          >
            <span>
              <strong>
                {requests.length} new patient request{requests.length === 1 ? "" : "s"}
              </strong>{" "}
              waiting for your answer.
            </span>
            <span className="font-semibold text-accent">Open requests →</span>
          </button>
        )}
        {toRecord.length > 0 && (
          <Panel
            title="Visits to record"
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
        {notesToWrite.length > 0 && (
          <Panel
            title="Notes to write or sign"
            action={<Tag tone="monitor">{notesToWrite.length} to write</Tag>}
          >
            <VisitList
              visits={notesToWrite}
              show="client"
              onChanged={reload}
              emptyText="Every completed visit has its note."
            />
          </Panel>
        )}
        <Panel title="Coming up">
          <VisitList
            visits={booked}
            show="client"
            onChanged={reload}
            emptyText="No booked visits yet. They appear when you accept a patient."
          />
        </Panel>
      </TabPanel>
      <TabPanel id="requests" value={tab}>
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
      </TabPanel>
      <TabPanel id="patients" value={tab}>
        <Panel
          title="My patients"
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
                    <Link
                      href={`/therapist/patients/${c.id}`}
                      className="block text-small font-semibold text-ink-900"
                    >
                      {c.name}
                    </Link>
                    <span className="block text-caption text-ink-500">
                      {c.suburb} · {c.discipline}, {c.frequency.toLowerCase()}
                    </span>
                  </span>
                  <ButtonLink href={`/therapist/patients/${c.id}`} size="sm" variant="ghost">
                    Open record
                  </ButtonLink>
                  {c.conversationId && (
                    <ButtonLink href={`/messages?c=${c.conversationId}`} size="sm">
                      <MessageCircle className="size-3.5" aria-hidden="true" />
                      Message
                    </ButtonLink>
                  )}
                  {c.discharged ? (
                    <Tag tone="neutral">Discharged</Tag>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setDischarging(c)}>
                      Discharge
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </TabPanel>
      <TabPanel id="recent" value={tab}>
        <Panel title="Recent visits">
          <VisitList
            visits={recent}
            show="client"
            onChanged={reload}
            emptyText="Completed, missed and cancelled visits from the last two weeks appear here."
          />
        </Panel>
      </TabPanel>
      {discharging && (
        <DischargeSheet
          clientId={discharging.id}
          name={discharging.name}
          upcoming={
            upcoming.filter((v) => v.clientId === discharging.id && v.status === "booked").length
          }
          onClose={() => setDischarging(null)}
          onDone={reload}
        />
      )}
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
              {r.support}, {r.frequency.toLowerCase()}
              {r.details ? ` · ${r.details}` : ""}
            </span>
            <span>{r.funding}</span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden="true" />
              {r.location === "Home" ? r.suburb : `${r.location}, ${r.suburb}`}
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              First visit {slotLabel(r.firstVisit)}
            </span>
          </p>
          {r.precautions && (
            <p className="mt-2 flex gap-2 rounded-control border border-over bg-over-bg px-3 py-2 text-small text-ink-900">
              <ShieldAlert className="mt-0.5 size-4 flex-none text-over" aria-hidden="true" />
              <span>
                <strong className="font-bold text-over">Precaution: </strong>
                {r.precautions}
              </span>
            </p>
          )}
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
            <Select
              value={reason}
              onChange={(e) => setReason(e.target.value as (typeof declineReasons)[number])}
              className="w-60"
            >
              {declineReasons.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
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
