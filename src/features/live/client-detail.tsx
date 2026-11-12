"use client";

import { ArrowLeft, FileText, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { api, useNow, useResource } from "@/lib/live/client";
import { ageLabel, relativeTime, shortDate, slotLabel } from "@/lib/live/time";
import type { AssignmentDto, ClientDetailDto, DocumentDto, NeedDto } from "@/lib/live/types";
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
import { DischargeSheet } from "./care-sheets";
import { ClinicalPanel } from "./clinical-panel";
import { MatchPicker } from "./match-picker";
import {
  CloseService,
  ConsentTab,
  ContactsTab,
  ProfileTab,
  StatusControl,
  useParticipant,
  type Act,
} from "./participant-profile";
import { PatientHistory } from "./patient-history";
import { VisitList } from "./visit-list";

export function ClientDetail({ clientId }: { clientId: string }) {
  const [discharging, setDischarging] = useState(false);
  const now = useNow() ?? 0;
  const { data, error, loading, reload } = useResource<{ client: ClientDetailDto }>(
    `/api/care/clients/${clientId}`,
    (event) =>
      event.type === "care" && (!event.payload.clientId || event.payload.clientId === clientId),
  );

  const participant = useParticipant(clientId, reload);
  const profile = participant.data?.profile;
  const c = data?.client;
  const tabs = [
    {
      id: "services",
      label: "Services and matching",
      count: c?.needs.filter((n) => n.status === "needs-therapist").length,
      alert: true,
    },
    {
      id: "visits",
      label: "Visits",
      count: c?.appointments.filter((v) => v.status === "booked").length,
    },
    {
      id: "profile",
      label: "Profile",
      count: profile?.completeness.missing.length,
      alert: true,
    },
    {
      id: "contacts",
      label: "Contacts",
      count: profile?.contacts.filter((x) => x.state === "Unverified" || x.state === "Expired")
        .length,
      alert: true,
    },
    { id: "consent", label: "Consent" },
    { id: "clinical", label: "Clinical progress" },
    { id: "details", label: "Documents and app", count: c?.documents.length },
    { id: "history", label: "History" },
  ] as const;
  const [tab, setTab] = useTab(tabs);

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
  const age = now ? ageLabel(client.dateOfBirth, new Date(now)) : null;

  return (
    <>
      <PageHeader
        eyebrow={
          <ButtonLink href="/care" variant="ghost" size="sm">
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Patient onboarding
          </ButtonLink>
        }
        title={client.name}
        description={`${client.mrn ? `${client.mrn} · ` : ""}${age ? `${age} · ` : ""}${client.suburb}, ${client.region} · ${client.funding}`}
        actions={
          <div className="flex items-center gap-3">
            <LiveBadge />
            {profile && (
              <StatusControl profile={profile} busy={participant.busy} act={participant.act} />
            )}
            {(!profile || client.stage !== profile.status) && <StageTag stage={client.stage} />}
            {!client.discharged && (
              <Button size="sm" variant="soft-danger" onClick={() => setDischarging(true)}>
                Discharge
              </Button>
            )}
          </div>
        }
      />
      {client.discharged && (
        <p
          role="status"
          className="mb-4 rounded-control border border-border bg-canvas px-4 py-3 text-small"
        >
          <strong>Discharged</strong> {shortDate(client.discharged.at)} by{" "}
          {client.discharged.byName}: {client.discharged.reason}. Their visit history, notes and
          feedback stay on record below.
          {client.discharged.outcomes && (
            <span className="mt-1 block whitespace-pre-line text-ink-700">
              Outcomes: {client.discharged.outcomes}
              {client.discharged.handover ? `\nHandover: ${client.discharged.handover}` : ""}
            </span>
          )}
        </p>
      )}
      {discharging && (
        <DischargeSheet
          clientId={client.id}
          name={client.name}
          upcoming={
            client.appointments.filter(
              (a) => a.status === "booked" && new Date(a.start).getTime() > now,
            ).length
          }
          onClose={() => setDischarging(false)}
          onDone={reload}
        />
      )}
      {client.precautions && (
        <section
          aria-label="Precautions"
          className="mb-4 flex items-center gap-2.5 rounded-control border border-over/30 bg-over-bg px-4 py-2 text-small"
        >
          <ShieldAlert className="size-4 flex-none text-over" aria-hidden="true" />
          <h2 className="flex-none font-bold text-over">Precaution</h2>
          <p className="min-w-0 truncate text-ink-900" title={client.precautions}>
            {client.precautions}
          </p>
          <span className="ml-auto hidden flex-none text-caption text-ink-500 md:inline">
            From clinical triage
          </span>
        </section>
      )}
      <Tabs label="Patient record" tabs={tabs} value={tab} onChange={setTab} />
      <TabPanel id="services" value={tab}>
        {client.needs.map((need) => (
          <NeedPanel
            key={need.id}
            clientId={client.id}
            need={need}
            assignments={client.assignments}
            onChange={reload}
            busy={participant.busy}
            act={participant.act}
          />
        ))}
      </TabPanel>
      {(["profile", "contacts", "consent"] as const).map((id) => (
        <TabPanel key={id} id={id} value={tab}>
          {!profile ? (
            participant.error ? (
              <ErrorNote message={participant.error} onRetry={participant.reload} />
            ) : (
              <Skeleton className="h-96" />
            )
          ) : id === "profile" ? (
            <ProfileTab
              profile={profile}
              client={client}
              busy={participant.busy}
              act={participant.act}
            />
          ) : id === "contacts" ? (
            <ContactsTab
              profile={profile}
              clientId={client.id}
              busy={participant.busy}
              act={participant.act}
            />
          ) : (
            <ConsentTab profile={profile} busy={participant.busy} act={participant.act} />
          )}
        </TabPanel>
      ))}
      <TabPanel id="visits" value={tab}>
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
      </TabPanel>
      <TabPanel id="clinical" value={tab}>
        <ClinicalPanel clientId={client.id} needs={client.needs} mode="admin" />
      </TabPanel>
      <TabPanel id="details" value={tab}>
        <div className="grid gap-6 lg:grid-cols-2">
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
              <dt className="text-ink-500">Emergency</dt>
              <dd>
                {client.emergencyContact
                  ? `${client.emergencyContact.name} (${client.emergencyContact.relationship}), ${client.emergencyContact.phone}`
                  : "Not given yet"}
              </dd>
            </dl>
            {client.notes && (
              <p className="mt-4 border-t border-border pt-3 text-small whitespace-pre-line text-ink-700">
                {client.notes}
              </p>
            )}
          </Panel>
          <div className="flex flex-col gap-6">
            <AppAccess
              clientId={client.id}
              account={client.account}
              name={client.name}
              mrn={client.mrn}
            />
            <Panel title="Documents">
              {client.documents.length === 0 ? (
                <p className="text-small text-ink-500">No documents on file.</p>
              ) : (
                <DocumentList documents={client.documents} />
              )}
              {client.referrals.length > 0 && (
                <p className="mt-3 border-t border-border pt-3 text-caption text-ink-500">
                  From referral{client.referrals.length > 1 ? "s" : ""}{" "}
                  {client.referrals.map((r, i) => (
                    <span key={r.id}>
                      {i > 0 && ", "}
                      <Link href={`/care/referrals/${r.id}`} className="font-semibold text-accent">
                        {r.reference}
                      </Link>
                    </span>
                  ))}
                </p>
              )}
            </Panel>
          </div>
        </div>
      </TabPanel>
      <TabPanel id="history" value={tab}>
        <PatientHistory client={client} profile={profile} />
      </TabPanel>
    </>
  );
}

function NeedPanel({
  clientId,
  need,
  assignments,
  onChange,
  busy: closing,
  act,
}: {
  clientId: string;
  need: NeedDto;
  assignments: AssignmentDto[];
  onChange: () => void;
  busy: boolean;
  act: Act;
}) {
  const mine = assignments.filter((a) => a.needId === need.id);
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
      title={`${need.support} · ${need.frequency}`}
      action={
        <div className="flex items-center gap-2">
          {need.status === "assigned" && <CloseService need={need} busy={closing} act={act} />}
          <Tag tone={needTone[need.status]}>{needLabel[need.status]}</Tag>
        </div>
      }
    >
      <p className="-mt-2 mb-4 text-caption text-ink-500">
        {need.discipline} · {need.location}
        {need.details ? ` · ${need.details}` : ""}
      </p>
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
        <MatchPicker
          clientId={clientId}
          needId={need.id}
          discipline={need.discipline}
          onSent={onChange}
        />
      )}
      {current?.status === "pending" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-watch-bg bg-watch-bg px-4 py-3">
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
          <strong>{slotLabel(current.firstVisit)}</strong>. The patient and therapist can now
          message each other.
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
  mrn,
}: {
  clientId: string;
  account: ClientDetailDto["account"];
  name: string;
  mrn: string | null;
}) {
  const [code, setCode] = useState<{ mrn: string; inviteExpires: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Panel
      title="Patient app"
      action={
        <Tag tone={account === "Active" ? "healthy" : account === "Invited" ? "monitor" : "over"}>
          {account}
        </Tag>
      }
    >
      {code ? (
        <div>
          <p className="text-small text-ink-700">App access is on. The patient signs in with:</p>
          <p className="my-2 font-mono text-section font-semibold tracking-wide">{code.mrn}</p>
          <p className="text-caption text-ink-500">
            Valid until {shortDate(code.inviteExpires)}. Any password they set before no longer
            works.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-small text-ink-700">
            {account === "Active"
              ? `${name.split(" ")[0]} has signed in to the app. If they've lost their phone, reset their access: they'll be signed out everywhere and sign in again with their MRN.`
              : `${account === "Invited" ? `${name.split(" ")[0]} signs in to the app with their MRN${mrn ? ` (${mrn})` : ""}.` : "App access by MRN has expired."} Renew it if they can't sign in.`}
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
                setError(e instanceof Error ? e.message : "Couldn't renew app access.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {account === "Active" ? "Reset app access" : "Renew app access"}
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

/** Stored documents; opening one is recorded in the audit trail. */
export function DocumentList({ documents }: { documents: DocumentDto[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {documents.map((d) => (
        <li key={d.id}>
          <a
            href={`/api/documents/${d.id}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-control border border-border px-3 py-2 hover:bg-canvas"
          >
            <FileText className="size-4 flex-none text-accent" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-small font-semibold">{d.name}</span>
              <span className="block text-caption text-ink-500">
                {d.kind} · {Math.max(1, Math.round(d.size / 1024))} KB · {d.uploadedBy}
                {d.status && d.status !== "Accepted" && ` · ${d.status.toLowerCase()}`}
                {(d.version ?? 1) > 1 && ` · version ${d.version}`}
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
