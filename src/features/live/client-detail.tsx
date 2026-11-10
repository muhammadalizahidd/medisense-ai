"use client";

import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Tag } from "@/components/ui/tag";
import { api, useResource } from "@/lib/live/client";
import { ageFrom, relativeTime, shortDate, slotLabel } from "@/lib/live/time";
import type { AssignmentDto, ClientDetailDto, NeedDto } from "@/lib/live/types";
import {
  EmptyNote,
  ErrorNote,
  LiveBadge,
  needLabel,
  needTone,
  Panel,
  Skeleton,
  StageTag,
} from "./bits";
import { MatchPicker } from "./match-picker";
import { VisitList } from "./visit-list";

export function ClientDetail({ clientId }: { clientId: string }) {
  const { data, error, loading, reload } = useResource<{ client: ClientDetailDto }>(
    `/api/care/clients/${clientId}`,
    (event) =>
      event.type === "care" && (!event.payload.clientId || event.payload.clientId === clientId),
  );

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  const client = data.client;
  const age = ageFrom(client.dateOfBirth);

  return (
    <>
      <PageHeader
        eyebrow={
          <ButtonLink href="/care" variant="ghost" size="sm">
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Client onboarding
          </ButtonLink>
        }
        title={client.name}
        description={`${age !== null ? `${age} years · ` : ""}${client.suburb}, ${client.region} · ${client.funding}`}
        actions={
          <div className="flex items-center gap-3">
            <LiveBadge />
            <StageTag stage={client.stage} />
          </div>
        }
      />
      <div className="grid gap-6 xl:grid-cols-12">
        <div className="flex flex-col gap-6 xl:col-span-8">
          {client.needs.map((need) => (
            <NeedPanel
              key={need.discipline}
              clientId={client.id}
              need={need}
              assignments={client.assignments}
              onChange={reload}
            />
          ))}
          <Panel
            title="Visits"
            action={
              client.appointments.some((a) => a.cancellation?.chargeable) && (
                <Tag tone="over">
                  {client.appointments.filter((a) => a.cancellation?.chargeable).length} may be
                  charged
                </Tag>
              )
            }
          >
            <VisitList
              visits={client.appointments}
              show="therapist"
              onChanged={reload}
              emptyText="Visits appear here once a therapist accepts."
            />
          </Panel>
        </div>
        <div className="flex flex-col gap-6 xl:col-span-4">
          <Panel title="Details">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-small">
              <dt className="text-ink-500">Email</dt>
              <dd className="break-all">{client.email}</dd>
              <dt className="text-ink-500">Phone</dt>
              <dd>{client.phone ?? "Not given"}</dd>
              <dt className="text-ink-500">Born</dt>
              <dd>
                {client.dateOfBirth ? shortDate(`${client.dateOfBirth}T00:00:00Z`) : "Not given"}
              </dd>
              <dt className="text-ink-500">Funding</dt>
              <dd>{client.funding}</dd>
            </dl>
            {client.notes && (
              <p className="mt-4 border-t border-border pt-3 text-small whitespace-pre-line text-ink-700">
                {client.notes}
              </p>
            )}
          </Panel>
          <AppAccess clientId={client.id} account={client.account} name={client.name} />
          <Panel title="Activity">
            {client.activity.length === 0 ? (
              <p className="text-small text-ink-500">Nothing yet.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {client.activity.map((a) => (
                  <li key={a.id} className="text-small">
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
    </>
  );
}

function NeedPanel({
  clientId,
  need,
  assignments,
  onChange,
}: {
  clientId: string;
  need: NeedDto;
  assignments: AssignmentDto[];
  onChange: () => void;
}) {
  const mine = assignments.filter((a) => a.discipline === need.discipline);
  const current = mine.find((a) => a.status === "pending" || a.status === "accepted");
  const past = mine.filter((a) => a.status === "declined" || a.status === "withdrawn");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/care/requests/${id}`, { method: "DELETE" });
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't withdraw the request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title={`${need.discipline} · ${need.frequency}`}
      action={<Tag tone={needTone[need.status]}>{needLabel[need.status]}</Tag>}
    >
      {past.length > 0 && (
        <ul className="mb-4 flex flex-col gap-1.5">
          {past.map((a) => (
            <li
              key={a.id}
              className="rounded-control bg-canvas px-3 py-2 text-caption text-ink-700"
            >
              {a.status === "declined"
                ? `${a.therapistName} declined: ${a.declineReason ?? "no reason given"}`
                : `Request to ${a.therapistName} was withdrawn`}
              {" · "}
              {relativeTime(a.createdAt)}
            </li>
          ))}
        </ul>
      )}
      {need.status === "needs-therapist" && (
        <MatchPicker clientId={clientId} discipline={need.discipline} onSent={onChange} />
      )}
      {current?.status === "pending" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-monitor-bg bg-monitor-bg px-4 py-3">
          <p className="text-small">
            Waiting for <strong>{current.therapistName}</strong> to accept. First visit held for{" "}
            <strong>{slotLabel(current.firstVisit)}</strong>. Sent {relativeTime(current.createdAt)}
            .
          </p>
          <Button size="sm" disabled={busy} onClick={() => withdraw(current.id)}>
            {busy ? "Withdrawing…" : "Withdraw request"}
          </Button>
        </div>
      )}
      {current?.status === "accepted" && (
        <p className="rounded-control border border-healthy-bg bg-healthy-bg px-4 py-3 text-small">
          <strong>{current.therapistName}</strong> accepted. First visit{" "}
          <strong>{slotLabel(current.firstVisit)}</strong>. The client and therapist can now message
          each other.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-small text-over">
          {error}
        </p>
      )}
      {need.status !== "needs-therapist" && !current && <EmptyNote title="No request on record." />}
    </Panel>
  );
}

function AppAccess({
  clientId,
  account,
  name,
}: {
  clientId: string;
  account: ClientDetailDto["account"];
  name: string;
}) {
  const [code, setCode] = useState<{ inviteCode: string; inviteExpires: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Panel
      title="Client app"
      action={
        <Tag tone={account === "Active" ? "healthy" : account === "Invited" ? "monitor" : "over"}>
          {account}
        </Tag>
      }
    >
      {account === "Active" ? (
        <p className="text-small text-ink-700">{name.split(" ")[0]} has signed in to the app.</p>
      ) : code ? (
        <div>
          <p className="text-small text-ink-700">New invite code, shown only once:</p>
          <p className="my-2 font-mono text-h2 tracking-widest">{code.inviteCode}</p>
          <p className="text-caption text-ink-500">
            Valid until {shortDate(code.inviteExpires)}. Earlier codes no longer work.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-small text-ink-700">
            {account === "Invited"
              ? "Invite sent, not activated yet."
              : "The invite code has expired."}{" "}
            Create a new code if the client lost theirs.
          </p>
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                setCode(await api(`/api/care/clients/${clientId}/invite`, { method: "POST" }));
              } catch (e) {
                setError(e instanceof Error ? e.message : "Couldn't create a code.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Create new invite code
          </Button>
          {error && (
            <p role="alert" className="mt-2 text-small text-over">
              {error}
            </p>
          )}
        </>
      )}
    </Panel>
  );
}
