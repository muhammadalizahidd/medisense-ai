"use client";

import {
  ArrowLeft,
  CalendarCheck,
  ClipboardList,
  FileText,
  HeartPulse,
  Home,
  MessageCircle,
  Phone,
  ShieldAlert,
  Target,
  TrendingUp,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { KpiLabel } from "@/components/ui/kpi-icon";
import { Avatar } from "@/components/ui/premium";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { Tag, type TagTone } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { useNow, useResource, useSession } from "@/lib/live/client";
import { episodeTone, reportTone, type EpisodeRow, type ReportRow } from "@/lib/live/progress";
import { ageLabel, relativeTime, shortDate, timeOfDay } from "@/lib/live/time";
import type { AppointmentDto, ClientDetailDto } from "@/lib/live/types";
import { EmptyNote, ErrorNote, LiveBadge, Panel, Skeleton, StageTag, Stars } from "./bits";
import { DischargeSheet } from "./care-sheets";
import { AssessmentsTab, DocumentList } from "./client-detail";
import { ClinicalPanel } from "./clinical-panel";
import { useConversations } from "./conversations";
import { PlansTab, usePatientWork } from "./patient-actions";
import { ServiceLimits } from "./therapist-funding";
import { VisitList } from "./visit-list";

const BNE = "Australia/Brisbane";
const DAY = 86_400_000;
const bne = (iso: string, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-AU", { timeZone: BNE, ...o }).format(new Date(iso));
const visitHref = (id: string) => `/therapist/workspace?tab=visits&visit=${id}`;
const OPEN_ASSESSMENT = ["Requested", "Ready", "In Progress", "Paused", "Pending Signature"];

/**
 * One patient, everything about their care in one place: who they are, when you last and next see
 * them, what's left to do, and their visits, assessments, plan and progress behind tabs.
 */
export function TherapistPatient({ clientId }: { clientId: string }) {
  const { data, error, loading, reload } = useResource<{ client: ClientDetailDto }>(
    `/api/care/patients/${clientId}`,
    (event) =>
      event.type === "care" && (!event.payload.clientId || event.payload.clientId === clientId),
  );
  const progress = useResource<{ episodes: EpisodeRow[]; reports: ReportRow[] }>(
    "/api/care/progress",
    (e) => e.type === "care",
  );
  const now = useNow() ?? 0;
  const router = useRouter();
  const chats = useConversations();
  const conversationId = chats.data?.conversations.find((c) => c.clientId === clientId)?.id ?? null;
  const [discharging, setDischarging] = useState(false);
  const me = useSession().user?.name;
  const work = usePatientWork(clientId);

  const p = data?.client;
  const visits = p?.appointments ?? [];
  const toClose = visits.filter(
    (v) =>
      (v.status === "booked" && new Date(v.start).getTime() < now && !v.checkIn) ||
      (v.status === "completed" &&
        (!v.note || v.note.status === "Draft" || v.note.status === "Pending Signature")),
  );
  const assessments = work.assessments.get(clientId) ?? [];
  const plans = work.plans.get(clientId) ?? [];
  const episodes = (progress.data?.episodes ?? []).filter(
    (e) => p?.mrn && e.participantId === p.mrn,
  );
  const reports = (progress.data?.reports ?? []).filter((r) => p?.mrn && r.participantId === p.mrn);
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "visits", label: "Visits and notes", count: toClose.length || undefined, alert: true },
    { id: "assessments", label: "Assessments", count: assessments.length || undefined },
    { id: "plans", label: "Plan", count: plans.length || undefined },
    { id: "progress", label: "Progress and reports", count: reports.length || undefined },
    { id: "clinical", label: "Clinical record" },
    { id: "details", label: "Profile" },
  ] as const;
  const [tab, setTab] = useTab(tabs);

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !p) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <Skeleton className="h-64" />
        <Skeleton className="h-12" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const upcoming = visits.filter(
    (v) => v.status === "booked" && new Date(v.start).getTime() >= now,
  );
  const past = visits
    .filter((v) => !(v.status === "booked" && new Date(v.start).getTime() >= now))
    .reverse();
  const lastSeen = past.find((v) => v.status === "completed") ?? null;
  const next = upcoming[0] ?? null;
  const ratings = visits.flatMap((v) => (v.feedback ? [v.feedback.rating] : []));
  const average = ratings.length ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null;

  /* What's left to do for this patient, each with the one place it gets done. */
  const todo: {
    key: string;
    icon: typeof FileText;
    title: string;
    meta: string;
    tone: TagTone;
    tag: string;
    go: () => void;
    action: string;
  }[] = [
    ...toClose.map((v) => ({
      key: `v-${v.id}`,
      icon: FileText,
      title:
        v.status === "booked"
          ? `Close off the visit on ${shortDate(v.start)}`
          : `Finish the note for ${shortDate(v.start)}`,
      meta:
        v.status === "booked"
          ? "Mark it attended, did not attend or cancelled"
          : `${v.note?.status ?? "Not started"} · ${relativeTime(v.start)}`,
      tone: "watch" as TagTone,
      tag: v.status === "booked" ? "Visit" : "Note",
      action: "Open",
      go: () => setTab("visits"),
    })),
    ...assessments
      .filter((a) => OPEN_ASSESSMENT.includes(a.status))
      .map((a) => ({
        key: `a-${a.id}`,
        icon: ClipboardList,
        title: `${a.purpose || "Assessment"}: ${a.support}`,
        meta: `${a.status} · ${a.progress}% done`,
        tone: "available" as TagTone,
        tag: "Assessment",
        action: "Continue",
        go: () => router.push(`/therapist/assessments/${a.id}`),
      })),
    ...plans
      .filter((pl) => pl.reviewOverdue)
      .map((pl) => ({
        key: `p-${pl.ref}`,
        icon: Target,
        title: `Review the plan for ${pl.support}`,
        meta: `Review was due ${shortDate(pl.reviewDate)}`,
        tone: "over" as TagTone,
        tag: "Plan",
        action: "Review",
        go: () => setTab("plans"),
      })),
  ];

  return (
    <>
      <Cover
        p={p}
        now={now}
        next={next}
        lastSeen={lastSeen}
        conversationId={conversationId}
        onDischarge={() => setDischarging(true)}
      />

      {p.discharged && (
        <p
          role="status"
          className="mb-6 rounded-card border border-border bg-canvas px-5 py-4 text-small"
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
            <strong className="block font-bold text-over">Precaution</strong>
            <span className="whitespace-pre-line text-ink-900">{p.precautions}</span>
          </span>
        </p>
      )}

      <Tabs label="Patient" tabs={tabs} value={tab} onChange={setTab} />

      <TabPanel id="overview" value={tab}>
        <div className="grid items-start gap-6 xl:grid-cols-12">
          <div className="flex min-w-0 flex-col gap-6 xl:col-span-8">
            <section
              aria-label="Needs doing"
              className="overflow-hidden rounded-card border border-border bg-surface"
            >
              <header className="flex items-baseline justify-between gap-3 border-b border-border px-5 py-4">
                <h2 className="text-section font-semibold text-ink-900">Needs doing</h2>
                <span className="text-caption text-ink-500">
                  {todo.length ? `${todo.length} open` : "Nothing open"}
                </span>
              </header>
              {todo.length === 0 ? (
                <p className="px-5 py-8 text-center text-small text-ink-500">
                  Everything for {p.name.split(" ")[0]} is up to date.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {todo.map((t) => (
                    <li key={t.key} className="flex items-center gap-3 px-5 py-3">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "flex size-8 flex-none items-center justify-center rounded-control",
                          t.tone === "over"
                            ? "bg-over-bg text-over"
                            : t.tone === "watch"
                              ? "bg-watch-bg text-watch"
                              : "bg-accent-tint text-accent",
                        )}
                      >
                        <t.icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-small font-semibold text-ink-900">
                          {t.title}
                        </span>
                        <span className="block truncate text-caption text-ink-500">{t.meta}</span>
                      </span>
                      <Tag tone={t.tone}>{t.tag}</Tag>
                      <Button size="sm" onClick={t.go}>
                        {t.action}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <Panel
              title="Coming up"
              action={
                upcoming.length > 3 ? (
                  <button
                    type="button"
                    onClick={() => setTab("visits")}
                    className="cursor-pointer text-small font-semibold text-accent"
                  >
                    All {upcoming.length} visits
                  </button>
                ) : undefined
              }
            >
              {upcoming.length === 0 ? (
                <p className="text-small text-ink-500">No upcoming visits booked.</p>
              ) : (
                <ul className="-my-1 flex flex-col divide-y divide-border">
                  {upcoming.slice(0, 3).map((v) => (
                    <UpcomingRow key={v.id} v={v} />
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <aside className="flex min-w-0 flex-col gap-6 xl:col-span-4" aria-label="At a glance">
            <section className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border">
              <Figure
                label="Attended"
                value={visits.filter((v) => v.status === "completed").length}
              />
              <Figure
                label="Did not attend"
                value={visits.filter((v) => v.status === "no-show").length}
                tone={visits.some((v) => v.status === "no-show") ? "over" : undefined}
              />
              <Figure
                label="Cancelled"
                value={
                  visits.filter((v) => v.status === "cancelled" || v.status === "late-cancelled")
                    .length
                }
              />
              <Figure
                label="Their rating"
                value={average ? average.toFixed(1) : "–"}
                caption={average ? <Stars value={average} /> : "Not rated yet"}
              />
            </section>

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
                        {n.frequency}, {n.location.toLowerCase()}
                        {n.therapistName ? ` with ${n.therapistName}` : ""}
                      </p>
                    </div>
                    <Tag tone={n.status === "assigned" ? "healthy" : "watch"}>
                      {n.status === "assigned" ? "Active" : n.status.replace("-", " ")}
                    </Tag>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Contact">
              <dl className="flex flex-col gap-3 text-small">
                <div>
                  <dt className="text-caption text-ink-500">Phone</dt>
                  <dd className="font-semibold text-ink-900">{p.phone ?? "Not given"}</dd>
                </div>
                <div>
                  <dt className="text-caption text-ink-500">Emergency contact</dt>
                  <dd className="flex items-center gap-2 font-semibold text-ink-900">
                    {p.emergencyContact ? (
                      <>
                        <Phone className="size-3.5 flex-none text-ink-500" aria-hidden="true" />
                        {p.emergencyContact.name} ({p.emergencyContact.relationship}),{" "}
                        {p.emergencyContact.phone}
                      </>
                    ) : (
                      "Not given yet"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-ink-500">Patient app</dt>
                  <dd className="font-semibold text-ink-900">{p.account}</dd>
                </div>
              </dl>
            </Panel>
          </aside>
        </div>
      </TabPanel>

      <TabPanel id="visits" value={tab}>
        <div className="flex flex-col gap-6">
          <Panel title="Coming up" action={<Tag tone="available">{upcoming.length} booked</Tag>}>
            <VisitList
              visits={upcoming}
              show="therapist"
              onChanged={reload}
              emptyText="No upcoming visits."
            />
          </Panel>
          <Panel
            title="Past visits and notes"
            action={<Tag tone="neutral">{past.length} past</Tag>}
          >
            <VisitList
              visits={past}
              show="therapist"
              onChanged={reload}
              emptyText="No past visits yet. Completed, missed and cancelled visits appear here with their notes."
            />
          </Panel>
        </div>
      </TabPanel>

      <TabPanel id="assessments" value={tab}>
        <AssessmentsTab rows={work.ready ? assessments : null} base="/therapist/assessments" />
      </TabPanel>

      <TabPanel id="plans" value={tab}>
        <PlansTab rows={work.ready ? plans : null} base="/therapist/plans" />
      </TabPanel>

      <TabPanel id="progress" value={tab}>
        <ProgressTab
          episodes={episodes}
          reports={reports}
          loading={!progress.data}
          error={progress.error}
          onRetry={progress.reload}
        />
      </TabPanel>

      <TabPanel id="clinical" value={tab}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface px-5 py-4">
            <p className="text-small text-ink-700">
              History, conditions, medicines, risks, consent and the access log live in the full
              clinical record.
            </p>
            <ButtonLink href={`/therapist/records/${p.id}`} size="sm">
              Open full clinical record
            </ButtonLink>
          </div>
          <ClinicalPanel clientId={p.id} needs={p.needs} mode="therapist" myName={me} />
        </div>
      </TabPanel>

      <TabPanel id="details" value={tab}>
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Panel title="Details">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-small">
              <dt className="text-ink-500">Phone</dt>
              <dd>{p.phone ?? "Not given"}</dd>
              <dt className="text-ink-500">Email</dt>
              <dd className="break-all">{p.email}</dd>
              <dt className="text-ink-500">Funding</dt>
              <dd>{p.funding}</dd>
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
          <ServiceLimits clientId={p.id} />
          <Panel title="Documents">
            {p.documents.length ? (
              <DocumentList documents={p.documents} />
            ) : (
              <p className="text-small text-ink-500">No documents on file.</p>
            )}
          </Panel>
          <Panel title="History">
            {p.activity.length === 0 ? (
              <p className="text-small text-ink-500">Nothing yet.</p>
            ) : (
              <ol className="relative flex flex-col gap-3 border-l border-border pl-4">
                {p.activity.slice(0, 12).map((a) => (
                  <li key={a.id} className="relative text-small">
                    <i
                      aria-hidden="true"
                      className="absolute top-1.5 -left-5.5 size-2.5 rounded-full border-2 border-surface bg-accent-fill"
                    />
                    <span className="block">{a.action}</span>
                    <span className="text-caption text-ink-500">
                      {a.actor}, {relativeTime(a.at)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
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

/**
 * The patient's cover: their portrait and name, and a line through their care from the last visit,
 * through today, to the next one. The timeline is the one thing on the page meant to stand out.
 */
function Cover({
  p,
  now,
  next,
  lastSeen,
  conversationId,
  onDischarge,
}: {
  p: ClientDetailDto;
  now: number;
  next: AppointmentDto | null;
  lastSeen: AppointmentDto | null;
  conversationId: string | null;
  onDischarge: () => void;
}) {
  const age = now ? ageLabel(p.dateOfBirth, new Date(now)) : null;
  const tele = next?.modality === "Telehealth";
  return (
    <section
      aria-label={p.name}
      className="mb-6 overflow-hidden rounded-card border border-border bg-surface"
    >
      <div className="flex flex-col gap-6 px-5 pt-5 pb-6 md:px-8 md:pt-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/therapist/patients"
            className="inline-flex items-center gap-1.5 text-small font-semibold text-ink-700 hover:text-ink-900 hover:no-underline"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Patients
          </Link>
          <LiveBadge />
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-center gap-5">
            <Avatar
              name={p.name}
              src={p.photoUrl}
              size={96}
              kind="patient"
              className="ring-4 ring-accent-tint"
            />
            <div className="min-w-0">
              <h1 className="type-display text-h1 leading-tight text-ink-900 md:text-[44px]">
                {p.name}
              </h1>
              <p className="mt-1.5 text-body text-ink-700">
                {[age, `${p.suburb}, ${p.region}`, p.funding].filter(Boolean).join("  ·  ")}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <StageTag stage={p.stage} />
                {p.mrn && (
                  <span className="rounded-tag border border-border-strong px-2 py-0.5 font-mono text-caption text-ink-700">
                    {p.mrn}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {next && (
              <ButtonLink href={visitHref(next.id)} variant="primary">
                {tele ? (
                  <Video className="size-4" aria-hidden="true" />
                ) : (
                  <CalendarCheck className="size-4" aria-hidden="true" />
                )}
                Open next visit
              </ButtonLink>
            )}
            {conversationId && (
              <ButtonLink href={`/messages?c=${conversationId}`}>
                <MessageCircle className="size-4" aria-hidden="true" />
                Message
              </ButtonLink>
            )}
            {!p.discharged && (
              <Button variant="ghost" onClick={onDischarge} className="text-over">
                Discharge
              </Button>
            )}
          </div>
        </div>
      </div>

      <CareLine now={now} lastSeen={lastSeen} next={next} />
    </section>
  );
}

/** Last visit, today, next visit on one line, so where this patient is in their care reads at once. */
function CareLine({
  now,
  lastSeen,
  next,
}: {
  now: number;
  lastSeen: AppointmentDto | null;
  next: AppointmentDto | null;
}) {
  const days = (iso: string) => Math.round(Math.abs(Date.parse(iso) - now) / DAY);
  const stops: {
    key: string;
    label: string;
    when: string;
    detail: string;
    on: boolean;
    icon?: ReactNode;
  }[] = [
    {
      key: "last",
      label: "Last seen",
      when: lastSeen
        ? bne(lastSeen.start, { weekday: "short", day: "numeric", month: "short" })
        : "Not yet",
      detail: lastSeen
        ? `${days(lastSeen.start) === 0 ? "Today" : `${days(lastSeen.start)} days ago`}${lastSeen.note?.status === "Final" ? ", note signed" : ", note open"}`
        : "No completed visits",
      on: Boolean(lastSeen),
    },
    {
      key: "today",
      label: "Today",
      when: now
        ? bne(new Date(now).toISOString(), { weekday: "short", day: "numeric", month: "short" })
        : "",
      detail: "",
      on: true,
    },
    {
      key: "next",
      label: "Next visit",
      when: next
        ? `${bne(next.start, { weekday: "short", day: "numeric", month: "short" })}, ${timeOfDay(next.start)}`
        : "Not booked",
      detail: next
        ? `${days(next.start) === 0 ? "Today" : days(next.start) === 1 ? "Tomorrow" : `In ${days(next.start)} days`}, ${next.modality === "Telehealth" ? "video visit" : "home visit"}`
        : "Book from the schedule",
      on: Boolean(next),
      icon: next ? (
        next.modality === "Telehealth" ? (
          <Video className="size-3.5" aria-hidden="true" />
        ) : (
          <Home className="size-3.5" aria-hidden="true" />
        )
      ) : null,
    },
  ];
  return (
    <ol
      aria-label="Care timeline"
      className="relative grid grid-cols-3 border-t border-border bg-sunken px-5 py-5 md:px-8"
    >
      <span
        aria-hidden="true"
        className="absolute top-[30px] right-[16.66%] left-[16.66%] h-px bg-border-strong"
      />
      {stops.map((s) => (
        <li key={s.key} className="relative flex flex-col items-center gap-1.5 text-center">
          <span
            aria-hidden="true"
            className={cn(
              "z-1 size-3 rounded-full border-2",
              s.key === "today"
                ? "border-accent bg-accent-fill ring-4 ring-accent-tint"
                : s.on
                  ? "border-accent bg-surface"
                  : "border-border-strong bg-surface",
            )}
          />
          <span className="mt-1 text-caption font-semibold text-ink-500">{s.label}</span>
          <span className="flex items-center gap-1.5 text-small font-semibold text-ink-900">
            {s.icon}
            {s.when}
          </span>
          {s.detail && <span className="text-caption text-ink-500">{s.detail}</span>}
        </li>
      ))}
    </ol>
  );
}

function Figure({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  tone?: "over";
}) {
  return (
    <div className="flex flex-col gap-1.5 bg-surface px-4 py-4">
      <KpiLabel label={label} tone={tone} />
      <span
        className={cn("type-display text-h2 leading-none", tone ? "text-over" : "text-ink-900")}
      >
        {value}
      </span>
      {caption && <span className="text-caption text-ink-500">{caption}</span>}
    </div>
  );
}

/** This patient's episodes of care and their reports, from the progress records. */
function ProgressTab({
  episodes,
  reports,
  loading,
  error,
  onRetry,
}: {
  episodes: EpisodeRow[];
  reports: ReportRow[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (error && loading) return <ErrorNote message={error} onRetry={onRetry} />;
  if (loading) return <Skeleton className="h-64" />;
  return (
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <Panel title="Goals and progress">
        {episodes.length === 0 ? (
          <EmptyNote title="No progress recorded yet.">
            Goals appear here once a treatment plan is in place.
          </EmptyNote>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {episodes.map((e) => {
              const pct = e.goals ? Math.round((e.achieved / e.goals) * 100) : 0;
              return (
                <li key={e.id} className="py-3 first:pt-0 last:pb-0">
                  <Link
                    href={`/therapist/progress/${encodeURIComponent(e.id)}`}
                    className="group flex flex-col gap-2 hover:no-underline"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-small font-semibold text-ink-900 group-hover:text-accent">
                        <TrendingUp className="size-4 text-accent" aria-hidden="true" />
                        {e.service}
                      </span>
                      <Tag
                        tone={episodeTone[e.state] === "outline" ? "outline" : episodeTone[e.state]}
                      >
                        {e.state}
                      </Tag>
                    </span>
                    <span
                      className="h-1.5 overflow-hidden rounded-full bg-sunken"
                      aria-hidden="true"
                    >
                      <span className="block h-full bg-accent-fill" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="flex flex-wrap justify-between gap-2 text-caption text-ink-500">
                      <span>
                        {e.achieved} of {e.goals} goal{e.goals === 1 ? "" : "s"} achieved,{" "}
                        {e.improving} improving
                      </span>
                      {e.reviewDue && (
                        <span className={e.reviewOverdue ? "font-semibold text-over" : undefined}>
                          Review {e.reviewOverdue ? "was due" : "due"} {shortDate(e.reviewDue)}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <Panel title="Reports">
        {reports.length === 0 ? (
          <EmptyNote title="No reports yet.">
            Progress and review reports for this patient appear here.
          </EmptyNote>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {reports.map((r) => (
              <li key={r.id} className="py-3 first:pt-0 last:pb-0">
                <Link
                  href={`/therapist/progress/reports/${r.id}`}
                  className="group flex items-center gap-3 hover:no-underline"
                >
                  <span className="flex size-9 flex-none items-center justify-center rounded-control bg-accent-tint text-accent">
                    <FileText className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-small font-semibold text-ink-900 group-hover:text-accent">
                      {r.type}
                    </span>
                    <span className="block text-caption text-ink-500">
                      Due {shortDate(r.dueAt)}
                      {r.overdue ? ", overdue" : ""}
                    </span>
                  </span>
                  <Tag tone={reportTone[r.status] === "outline" ? "outline" : reportTone[r.status]}>
                    {r.status}
                  </Tag>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/** One booked visit, quietly: its date, time and kind, and the one button that opens it. */
function UpcomingRow({ v }: { v: AppointmentDto }) {
  const tele = v.modality === "Telehealth";
  return (
    <li className="flex items-center gap-4 py-3">
      <span className="flex h-14 w-13 flex-none flex-col items-center justify-center rounded-control border border-border bg-surface">
        <span className="text-label font-semibold text-ink-500">
          {bne(v.start, { weekday: "short" })}
        </span>
        <span className="type-display text-h2 leading-none text-ink-900">
          {bne(v.start, { day: "numeric" })}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-small font-semibold text-ink-900">
          {timeOfDay(v.start)}, {bne(v.start, { month: "long" })}
        </span>
        <span className="flex items-center gap-1.5 text-caption text-ink-500">
          {tele ? (
            <Video className="size-3.5" aria-hidden="true" />
          ) : (
            <Home className="size-3.5" aria-hidden="true" />
          )}
          {tele ? "Video visit" : "Home visit"}, {v.discipline}
        </span>
      </span>
      <Tag tone={v.confirmedByPatient ? "healthy" : "neutral"}>
        {v.confirmedByPatient ? "Patient confirmed" : "Booked"}
      </Tag>
      <ButtonLink href={visitHref(v.id)} size="sm">
        Open
      </ButtonLink>
    </li>
  );
}
