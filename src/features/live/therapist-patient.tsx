"use client";

import {
  ArrowLeft,
  CalendarClock,
  HeartPulse,
  Home,
  MessageCircle,
  Phone,
  ShieldAlert,
  Video,
} from "lucide-react";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { MetricBand } from "@/components/ui/metric-band";
import { Avatar } from "@/components/ui/premium";
import { Tag } from "@/components/ui/tag";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { AssessmentsTab } from "./client-detail";
import { PlansTab, usePatientWork } from "./patient-actions";
import { PageHeader } from "@/components/ui/page";
import { useNow, useResource, useSession } from "@/lib/live/client";
import { ageLabel, relativeTime, shortDate, timeOfDay } from "@/lib/live/time";
import type { AppointmentDto, ClientDetailDto } from "@/lib/live/types";
import { ErrorNote, LiveBadge, Panel, Skeleton, StageTag, Stars } from "./bits";
import { DischargeSheet } from "./care-sheets";
import { ClinicalPanel } from "./clinical-panel";
import { DocumentList } from "./client-detail";
import { useConversations } from "./conversations";
import { ServiceLimits } from "./therapist-funding";
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
  const me = useSession().user?.name;
  const nowMs = now;
  const todo = (data?.client.appointments ?? []).filter(
    (v) =>
      (v.status === "booked" && new Date(v.start).getTime() < nowMs && !v.checkIn) ||
      (v.status === "completed" &&
        (!v.note || v.note.status === "Draft" || v.note.status === "Pending Signature")),
  ).length;
  const work = usePatientWork(clientId);
  const tabs = [
    { id: "details", label: "Profile and documents", count: data?.client.documents.length },
    { id: "visits", label: "Follow-ups", count: todo, alert: true },
    { id: "assessments", label: "Assessments", count: work.assessments.get(clientId)?.length },
    { id: "plans", label: "Treatment plans", count: work.plans.get(clientId)?.length },
    { id: "clinical", label: "Clinical work" },
    { id: "history", label: "History" },
  ] as const;
  const [tab, setTab] = useTab(tabs);

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
          {p.discharged.outcomes && (
            <span className="mt-1 block whitespace-pre-line text-ink-700">
              Outcomes: {p.discharged.outcomes}
            </span>
          )}
        </p>
      )}
      {p.precautions && (
        <p
          role="note"
          className="mb-6 flex gap-3 rounded-card border border-over bg-over-bg px-5 py-4 text-small"
        >
          <ShieldAlert className="mt-0.5 size-5 flex-none text-over" aria-hidden="true" />
          <span>
            <strong className="block font-bold text-over">Precaution · from clinical triage</strong>
            <span className="whitespace-pre-line">{p.precautions}</span>
          </span>
        </p>
      )}
      <div className="mb-6">
        <MetricBand
          label="Visit figures"
          metrics={[
            { label: "Upcoming", value: upcoming.length },
            { label: "Attended", value: visits.filter((v) => v.status === "completed").length },
            {
              label: "Did not attend",
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
      <Tabs label="Patient record" tabs={tabs} value={tab} onChange={setTab} />
      <TabPanel id="visits" value={tab}>
        <div className="grid items-start gap-6 xl:grid-cols-12">
          <div className="flex flex-col gap-6 xl:col-span-8">
            <Panel title="Coming up" action={<Tag tone="available">{upcoming.length} booked</Tag>}>
              <VisitList
                visits={upcoming}
                show="therapist"
                onChanged={reload}
                emptyText="No upcoming visits."
              />
            </Panel>
            <Panel title="Visit history" action={<Tag tone="neutral">{history.length} past</Tag>}>
              <VisitList
                visits={history}
                show="therapist"
                onChanged={reload}
                emptyText="No past visits yet. Completed, missed and cancelled visits appear here with their notes."
              />
            </Panel>
          </div>
          <PatientRail p={p} now={now} upcoming={upcoming} />
        </div>
      </TabPanel>
      <TabPanel id="assessments" value={tab}>
        <AssessmentsTab
          rows={work.ready ? (work.assessments.get(clientId) ?? []) : null}
          base="/therapist/assessments"
        />
      </TabPanel>
      <TabPanel id="plans" value={tab}>
        <PlansTab
          rows={work.ready ? (work.plans.get(clientId) ?? []) : null}
          base="/therapist/plans"
        />
      </TabPanel>
      <TabPanel id="clinical" value={tab}>
        <ClinicalPanel clientId={p.id} needs={p.needs} mode="therapist" myName={me} />
      </TabPanel>
      <TabPanel id="details" value={tab}>
        <div className="grid gap-6 lg:grid-cols-2">
          <ServiceLimits clientId={p.id} />
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
                {p.needs
                  .map(
                    (n) =>
                      `${n.support}, ${n.frequency.toLowerCase()} (${n.location.toLowerCase()})`,
                  )
                  .join("; ")}
              </dd>
            </dl>
            {p.notes && (
              <p className="mt-4 border-t border-border pt-3 text-small whitespace-pre-line text-ink-700">
                {p.notes}
              </p>
            )}
          </Panel>
          <Panel title="Documents">
            {p.documents.length ? (
              <DocumentList documents={p.documents} />
            ) : (
              <p className="text-small text-ink-500">No documents on file.</p>
            )}
          </Panel>
        </div>
      </TabPanel>
      <TabPanel id="history" value={tab}>
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
      </TabPanel>
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

const BNE = "Australia/Brisbane";

/** The right-hand rail: who the patient is, their services and what's next, at a glance. */
function PatientRail({
  p,
  now,
  upcoming,
}: {
  p: ClientDetailDto;
  now: number;
  upcoming: AppointmentDto[];
}) {
  const next = upcoming[0] ?? null;
  const days =
    next && now ? Math.max(0, Math.round((Date.parse(next.start) - now) / 86_400_000)) : null;
  const tele = p.appointments.filter((v) => v.modality === "Telehealth").length;
  const inPerson = p.appointments.length - tele;
  const share = p.appointments.length ? Math.round((inPerson / p.appointments.length) * 100) : 0;
  return (
    <aside className="flex flex-col gap-6 xl:col-span-4" aria-label="Patient at a glance">
      <section className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="flex items-center gap-4 border-b border-border bg-accent-tint px-5 py-5">
          <Avatar name={p.name} src={p.photoUrl} size={64} kind="patient" />
          <div className="min-w-0">
            <p className="truncate type-display text-h2 text-ink-900">{p.name}</p>
            <p className="text-small text-ink-700">
              {p.suburb} · {p.region}
            </p>
            {p.mrn && <p className="mt-0.5 font-mono text-caption text-ink-500">{p.mrn}</p>}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-px bg-border text-small">
          {[
            ["Funding", p.funding],
            ["Stage", p.stage],
            ["Phone", p.phone ?? "Not given"],
            ["App account", p.account],
          ].map(([k, v]) => (
            <div key={k} className="bg-surface px-5 py-3">
              <dt className="label-caps text-ink-500">{k}</dt>
              <dd className="mt-0.5 truncate font-semibold text-ink-900">{v}</dd>
            </div>
          ))}
        </dl>
        {p.emergencyContact && (
          <p className="flex items-center gap-2 border-t border-border px-5 py-3 text-small text-ink-700">
            <Phone className="size-4 flex-none text-ink-500" aria-hidden="true" />
            Emergency: {p.emergencyContact.name} ({p.emergencyContact.relationship}),{" "}
            {p.emergencyContact.phone}
          </p>
        )}
      </section>

      <Panel title="Next visit">
        {next ? (
          <div className="flex items-center gap-4">
            <span className="flex size-16 flex-none flex-col items-center justify-center rounded-card bg-accent-fill text-on-accent">
              <span className="text-label uppercase">
                {new Date(next.start).toLocaleDateString("en-AU", {
                  weekday: "short",
                  timeZone: BNE,
                })}
              </span>
              <span className="type-display text-h2 leading-none">
                {new Date(next.start).toLocaleDateString("en-AU", {
                  day: "numeric",
                  timeZone: BNE,
                })}
              </span>
            </span>
            <div className="min-w-0">
              <p className="text-section text-ink-900">
                {timeOfDay(next.start)} · {next.discipline}
              </p>
              <p className="flex items-center gap-1.5 text-small text-ink-700">
                {next.modality === "Telehealth" ? (
                  <Video className="size-3.5" aria-hidden="true" />
                ) : (
                  <Home className="size-3.5" aria-hidden="true" />
                )}
                {next.modality === "Telehealth" ? "Video visit" : "Home visit"}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-caption text-ink-500">
                <CalendarClock className="size-3.5" aria-hidden="true" />
                {days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`} ·{" "}
                {upcoming.length} booked in total
              </p>
            </div>
          </div>
        ) : (
          <p className="text-small text-ink-500">Nothing booked yet.</p>
        )}
      </Panel>

      <Panel title="Services">
        <ul className="flex flex-col gap-3">
          {p.needs.map((n) => (
            <li key={n.id} className="flex items-start gap-3">
              <span className="flex size-9 flex-none items-center justify-center rounded-control bg-accent-tint text-accent">
                <HeartPulse className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-small font-semibold text-ink-900">{n.support}</p>
                <p className="text-caption text-ink-500">
                  {n.frequency} · {n.location} · {n.therapistName ?? "No therapist yet"}
                </p>
              </div>
              <Tag tone={n.status === "assigned" ? "healthy" : "watch"}>
                {n.status === "assigned" ? "Active" : n.status.replace("-", " ")}
              </Tag>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Visit mix">
        <div className="flex items-baseline justify-between text-small">
          <span className="flex items-center gap-1.5 text-ink-700">
            <Home className="size-3.5" aria-hidden="true" /> In person
          </span>
          <span className="font-semibold text-ink-900">{inPerson}</span>
        </div>
        <div
          className="my-2 flex h-2 overflow-hidden rounded-full bg-available-bg"
          aria-hidden="true"
        >
          <div className="h-full bg-accent-fill" style={{ width: `${share}%` }} />
        </div>
        <div className="flex items-baseline justify-between text-small">
          <span className="flex items-center gap-1.5 text-ink-700">
            <Video className="size-3.5" aria-hidden="true" /> Telehealth
          </span>
          <span className="font-semibold text-ink-900">{tele}</span>
        </div>
        <p className="mt-3 text-caption text-ink-500">
          {p.appointments.length} visits on record · {p.documents.length} document
          {p.documents.length === 1 ? "" : "s"} on file
        </p>
      </Panel>
    </aside>
  );
}
