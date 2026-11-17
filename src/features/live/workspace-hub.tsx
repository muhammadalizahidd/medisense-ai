"use client";

import {
  AlertTriangle,
  CalendarClock,
  Car,
  ClipboardList,
  FileText,
  Home,
  MapPin,
  MessageSquare,
  School,
  ShieldAlert,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AiDraft, RuleMark } from "@/components/ai/provenance";
import { BarList } from "@/components/charts/bar-list";
import { colour } from "@/components/charts/chart-kit";
import { DonutChart } from "@/components/charts/donut-chart";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { SearchField } from "@/components/ui/search-field";
import { FilterBar, FilterField, Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { Tag, type TagTone } from "@/components/ui/tag";
import { api, useNow, useResource } from "@/lib/live/client";
import { shortDate, timeOfDay } from "@/lib/live/time";
import type { AppointmentDto } from "@/lib/live/types";
import {
  deliveryModes,
  docStatuses,
  wsAssessmentStatuses,
  wsPriorities,
  wsTaskStatuses,
  type WorkspaceDto,
  type WorkspacePrefs,
  type WsAlert,
  type WsBriefPoint,
  type WsVisit,
} from "@/lib/live/workspace";
import { EmptyNote, ErrorNote, LiveBadge, Panel, Skeleton } from "./bits";
import { NoteSheet } from "./care-sheets";
import { KpiBand, dayOnly, dueIn, tableBox, tableHead, when } from "./ops-bits";
import { liveLabel } from "./visit-list";
import { VisitSheet } from "./visit-sheet";
import {
  FollowUpSheet,
  MessageSheet,
  SafetySheet,
  StartCheckSheet,
  SupervisorSheet,
  wsAction,
} from "./workspace-sheets";

const tz = "Australia/Brisbane";
const dayKey = (iso: string) => new Date(new Date(iso).getTime() + 36e6).toISOString().slice(0, 10);
const addDay = (key: string, n: number) =>
  new Date(Date.parse(`${key}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const weekday = (key: string) => (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7;
const dayHeading = (key: string) =>
  new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${key}T00:00:00Z`));

const severityTone: Record<WsAlert["severity"], TagTone> = {
  High: "over",
  Medium: "watch",
  Review: "neutral",
};
const readinessTone: Record<string, TagTone> = {
  Ready: "healthy",
  "Not Applicable": "neutral",
  "Needs Contact": "watch",
  "Address Unconfirmed": "watch",
  "Safety Review Required": "over",
};
const docTone: Record<string, TagTone> = {
  "Not Started": "over",
  Draft: "watch",
  "Ready for Signature": "watch",
  Signed: "healthy",
  "Amendment Required": "over",
};
const asmTone: Record<string, TagTone> = {
  "Not Started": "neutral",
  "In Progress": "available",
  Paused: "watch",
  "Awaiting Review": "watch",
  Finalised: "healthy",
  Amended: "healthy",
  Cancelled: "neutral",
};
const priTone: Record<string, TagTone> = {
  Critical: "over",
  High: "over",
  Medium: "watch",
  Low: "neutral",
};
const statusOptions = [
  "All",
  "Requested",
  "Tentative",
  "Confirmed",
  "Checked In",
  "In Progress",
  "Completed",
  "Cancelled",
  "Rescheduled",
  "No Show",
  "Unable to Complete",
] as const;

/** The section 5 appointment status of a visit. */
function statusOf(v: WsVisit): (typeof statusOptions)[number] {
  if (v.status === "booked")
    return v.checkIn ? (v.session ? "In Progress" : "Checked In") : "Confirmed";
  if (v.status === "tentative") return "Requested";
  if (v.status === "completed") return "Completed";
  if (v.status === "cancelled" || v.status === "late-cancelled") return "Cancelled";
  if (v.status === "rescheduled") return "Rescheduled";
  if (v.status === "no-show") return "No Show";
  return "Unable to Complete";
}

function ModeIcon({ mode, className }: { mode: string; className: string }) {
  const props = { className, "aria-hidden": true } as const;
  if (mode === "Telehealth") return <Video {...props} />;
  if (mode === "School" || mode === "Daycare" || mode === "Day Program")
    return <School {...props} />;
  if (mode === "Home") return <Home {...props} />;
  return <MapPin {...props} />;
}

const tabs = [
  { id: "home", label: "Home" },
  { id: "schedule", label: "My schedule" },
  { id: "visits", label: "Visits and travel" },
  { id: "telehealth", label: "Telehealth lobby" },
  { id: "clients", label: "My patients" },
  { id: "tasks", label: "My tasks" },
  { id: "assessments", label: "Assessments" },
  { id: "documentation", label: "Documentation" },
  { id: "alerts", label: "Alerts" },
  { id: "settings", label: "Work settings" },
] as const;
type TabId = (typeof tabs)[number]["id"];

export function TherapistWorkspace() {
  const { data, error, loading, reload } = useResource<WorkspaceDto>(
    "/api/care/workspace",
    (e) => e.type === "care" || e.type === "notification",
  );
  const counts = useMemo(() => {
    if (!data) return null;
    const today = data.visits.filter(
      (v) => dayKey(v.start) === data.today && v.status !== "cancelled",
    );
    return {
      today: today.length,
      notes: data.notes.filter((n) => n.status !== "Signed").length,
      assessments: data.assessments.filter(
        (a) => a.status !== "Finalised" && a.status !== "Amended",
      ).length,
      tasks: data.tasks.filter(
        (t) => !t.delegated && t.status !== "Completed" && t.status !== "Cancelled",
      ).length,
      alerts: data.alerts.filter((a) => !a.acknowledged).length,
      telehealth: data.telehealth.length,
    };
  }, [data]);
  const tabDefs = tabs.map((t) => ({
    ...t,
    count:
      t.id === "documentation"
        ? counts?.notes
        : t.id === "assessments"
          ? counts?.assessments
          : t.id === "tasks"
            ? counts?.tasks
            : t.id === "alerts"
              ? counts?.alerts
              : t.id === "telehealth"
                ? counts?.telehealth
                : t.id === "visits"
                  ? counts?.today
                  : undefined,
    alert: t.id === "alerts" || t.id === "documentation",
  }));
  const [tab, setTab] = useTab(tabDefs);
  const [visitId, setVisitId] = useState<string | null>(null);
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("visit");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the address once after mount
    if (wanted) setVisitId(wanted);
  }, []);

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data || !counts) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-32" />
        <Skeleton className="h-24" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 lg:col-span-2" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }
  const openVisit = (id: string) => {
    setVisitId(id);
    setTab("visits");
  };
  const first = data.therapist.name.split(" ")[0];
  return (
    <>
      <PageHeader
        display
        eyebrow={`${data.therapist.discipline} · ${data.therapist.region}`}
        title={`Good ${greeting(data.now)}, ${first}`}
        description={`${counts.today} visit${counts.today === 1 ? "" : "s"} today · ${counts.notes} note${counts.notes === 1 ? "" : "s"} to finish · ${counts.alerts} alert${counts.alerts === 1 ? "" : "s"} to review.`}
        actions={<LiveBadge />}
      />
      <Tabs label="My workspace" tabs={tabDefs} value={tab} onChange={setTab} />
      <TabPanel id="home" value={tab}>
        <HomeTab ws={data} reload={reload} go={setTab} openVisit={openVisit} />
      </TabPanel>
      <TabPanel id="schedule" value={tab}>
        <ScheduleTab ws={data} openVisit={openVisit} />
      </TabPanel>
      <TabPanel id="visits" value={tab}>
        <VisitsTab ws={data} reload={reload} visitId={visitId} setVisitId={setVisitId} />
      </TabPanel>
      <TabPanel id="telehealth" value={tab}>
        <TelehealthTab ws={data} openVisit={openVisit} />
      </TabPanel>
      <TabPanel id="clients" value={tab}>
        <ClientsTab ws={data} />
      </TabPanel>
      <TabPanel id="tasks" value={tab}>
        <TasksTab ws={data} />
      </TabPanel>
      <TabPanel id="assessments" value={tab}>
        <AssessmentsTab ws={data} reload={reload} />
      </TabPanel>
      <TabPanel id="documentation" value={tab}>
        <DocumentationTab ws={data} reload={reload} />
      </TabPanel>
      <TabPanel id="alerts" value={tab}>
        <AlertsTab ws={data} reload={reload} />
      </TabPanel>
      <TabPanel id="settings" value={tab}>
        <SettingsTab ws={data} reload={reload} />
      </TabPanel>
    </>
  );
}

function greeting(iso: string) {
  const h = Number(
    new Intl.DateTimeFormat("en-AU", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(
      new Date(iso),
    ),
  );
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

/* ---------------------------------------------------------------------- home */

function HomeTab({
  ws,
  reload,
  go,
  openVisit,
}: {
  ws: WorkspaceDto;
  reload: () => void;
  go: (t: TabId) => void;
  openVisit: (id: string) => void;
}) {
  const now = useNow() ?? Date.parse(ws.now);
  const [showCancelled, setShowCancelled] = useState(ws.prefs.includeCancelled);
  const [message, setMessage] = useState(false);
  const [safety, setSafety] = useState(false);
  const [query, setQuery] = useState("");
  const todays = ws.visits.filter(
    (v) =>
      dayKey(v.start) === ws.today &&
      (showCancelled || (v.status !== "cancelled" && v.status !== "late-cancelled")),
  );
  // AT-05: the earliest confirmed visit that hasn't ended.
  const next = ws.visits.find((v) => v.status === "booked" && new Date(v.end).getTime() > now);
  const pendingNotes = ws.notes.filter((n) => n.status !== "Signed");
  const oldest = pendingNotes.reduce((m, n) => Math.max(m, n.ageHours), 0);
  const openTasks = ws.tasks.filter(
    (t) => !t.delegated && t.status !== "Completed" && t.status !== "Cancelled",
  );
  const dueToday = openTasks.filter((t) => dayKey(t.dueAt) === ws.today && !t.overdue);
  const overdue = openTasks.filter((t) => t.overdue);
  const inProgress = ws.assessments.filter(
    (a) => a.status === "In Progress" || a.status === "Not Started" || a.status === "Paused",
  );
  const highAlerts = ws.alerts.filter((a) => !a.acknowledged && a.severity === "High");

  /* The prioritised work list: safety first, then time-bound visits, notes, then follow-ups. */
  const work = [
    ...highAlerts.map((a) => ({
      key: a.key,
      rank: 0,
      title: a.title,
      meta: a.detail,
      tag: "Safety",
      tone: "over" as TagTone,
      href: a.href,
    })),
    ...todays
      .filter((v) => v.status === "booked" && new Date(v.end).getTime() > now)
      .map((v) => ({
        key: v.id,
        rank: 1,
        title: `${timeOfDay(v.start)} ${v.clientName}: ${v.purpose}`,
        meta: `${v.ref} · ${v.mode} · ${v.location}`,
        tag: "Visit",
        tone: "available" as TagTone,
        href: `?tab=visits&visit=${v.id}`,
      })),
    ...pendingNotes
      .filter((n) => n.ageHours > 24)
      .map((n) => ({
        key: n.visitId,
        rank: 2,
        title: `Note for ${n.clientName} (${n.status.toLowerCase()})`,
        meta: `${n.ref} · ${n.ageHours} h since the visit`,
        tag: "Note",
        tone: "watch" as TagTone,
        href: "?tab=documentation",
      })),
    ...overdue.map((t) => ({
      key: t.id,
      rank: 3,
      title: t.title,
      meta: `${t.ref} · ${dueIn(t.dueAt, now)}`,
      tag: "Follow-up",
      tone: "neutral" as TagTone,
      href: `/therapist/tasks/${t.id}`,
    })),
  ].sort((a, b) => a.rank - b.rank);

  const q = query.trim().toLowerCase();
  const results =
    q.length < 2
      ? []
      : [
          ...ws.clients
            .filter(
              (c) =>
                c.name.toLowerCase().includes(q) ||
                c.mrn.toLowerCase().includes(q) ||
                `ref-${c.mrn}`.toLowerCase().includes(q),
            )
            .map((c) => ({
              key: c.id,
              label: c.name,
              meta: `${c.mrn} · patient`,
              href: `/therapist/patients/${c.id}`,
            })),
          ...ws.visits
            .filter((v) => v.ref.toLowerCase().includes(q))
            .map((v) => ({
              key: v.id,
              label: `${v.ref} · ${v.clientName}`,
              meta: `${when(v.start)} · appointment`,
              href: `?tab=visits&visit=${v.id}`,
            })),
          ...ws.tasks
            .filter((t) => t.ref.toLowerCase().includes(q) || t.title.toLowerCase().includes(q))
            .map((t) => ({
              key: t.id,
              label: `${t.ref} · ${t.title}`,
              meta: `${t.status} · task`,
              href: `/therapist/tasks/${t.id}`,
            })),
        ].slice(0, 8);

  const cap = ws.capacity;
  return (
    <div className="flex flex-col gap-6">
      <KpiBand
        label="My day"
        items={[
          {
            label: "Visits today",
            value: todays.filter((v) => v.status !== "cancelled").length,
            sub: `${ws.telehealth.length} by telehealth`,
            onClick: () => go("schedule"),
          },
          {
            label: "Pending notes",
            value: pendingNotes.length,
            sub: pendingNotes.length ? `Oldest ${oldest} h` : "All signed",
            tone: oldest > 48 ? "over" : pendingNotes.length ? "watch" : undefined,
            onClick: () => go("documentation"),
          },
          {
            label: "Assessments open",
            value: inProgress.length,
            sub: "Form sections to complete",
            onClick: () => go("assessments"),
          },
          {
            label: "Tasks due",
            value: dueToday.length + overdue.length,
            sub: `${overdue.length} overdue`,
            tone: overdue.length ? "over" : undefined,
            onClick: () => go("tasks"),
          },
          {
            label: "My active patients",
            value: cap.activeClients,
            sub: `${cap.activeEpisodes} service episodes`,
            onClick: () => go("clients"),
          },
          {
            label: "Alerts",
            value: ws.alerts.filter((a) => !a.acknowledged).length,
            sub: `${highAlerts.length} high`,
            tone: highAlerts.length ? "over" : undefined,
            onClick: () => go("alerts"),
          },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <NextAppointment visit={next ?? null} openVisit={openVisit} />
          <Panel
            title="Today's visits"
            action={
              <label className="flex items-center gap-2 text-caption text-ink-500">
                Show cancelled
                <Switch
                  on={showCancelled}
                  label="Show cancelled visits"
                  onToggle={() => setShowCancelled((s) => !s)}
                />
              </label>
            }
          >
            {todays.length === 0 ? (
              <EmptyNote title="No visits today.">
                Your tasks and availability are below. New bookings appear here straight away.
              </EmptyNote>
            ) : (
              <VisitTable visits={todays} openVisit={openVisit} />
            )}
          </Panel>
          <Panel title="Prioritised work" action={<RuleMark>Rule · safety, then time</RuleMark>}>
            {work.length === 0 ? (
              <p className="text-small text-ink-500">Nothing waiting. You&apos;re all caught up.</p>
            ) : (
              <ol className="divide-y divide-border">
                {work.slice(0, 9).map((w) => (
                  <li
                    key={`${w.tag}-${w.key}`}
                    className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <Tag tone={w.tone}>{w.tag}</Tag>
                    <Link href={w.href} className="min-w-0 flex-1">
                      <span className="block truncate text-small font-semibold text-ink-900 hover:text-accent">
                        {w.title}
                      </span>
                      <span className="block truncate text-caption text-ink-500">{w.meta}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel title="Find in my records">
            <SearchField
              label="Search my records"
              placeholder="Name, MRN, REF-, APT- or TASK-"
              className="w-full"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {q.length >= 2 && (
              <ul className="mt-3 divide-y divide-border">
                {results.length === 0 && (
                  <li className="py-2 text-small text-ink-500">
                    Nothing on your caseload matches.
                  </li>
                )}
                {results.map((r) => (
                  <li key={r.key} className="py-2">
                    <Link
                      href={r.href}
                      className="block text-small font-semibold hover:text-accent"
                    >
                      {r.label}
                    </Link>
                    <span className="text-caption text-ink-500">{r.meta}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-caption text-ink-500">
              Searches only patients and work assigned to you.
            </p>
          </Panel>
          <Panel title="Quick actions">
            <div className="grid grid-cols-2 gap-2">
              {next && (
                <Button size="sm" variant="primary" onClick={() => openVisit(next.id)}>
                  {next.mode === "Telehealth" ? "Join telehealth" : "Start next visit"}
                </Button>
              )}
              <Button size="sm" onClick={() => go("assessments")}>
                Continue assessment
              </Button>
              <Button size="sm" onClick={() => go("documentation")}>
                Write or review note
              </Button>
              <Button size="sm" onClick={() => setMessage(true)}>
                Care-team message
              </Button>
              <ButtonLink size="sm" href="/profile?tab=availability">
                Change availability
              </ButtonLink>
              <Button size="sm" variant="danger" onClick={() => setSafety(true)}>
                Report safety issue
              </Button>
            </div>
          </Panel>
          {ws.prefs.showAi && <MorningBrief ws={ws} reload={reload} />}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
        <Panel title="Caseload and capacity" className="xl:col-span-2">
          <BarList
            label="This week's hours"
            unit="h"
            format={(v) => `${v} h`}
            data={[
              {
                id: "contact",
                label: "Patient contact",
                value: cap.contactHours,
                colour: colour.series1,
              },
              { id: "travel", label: "Travel", value: cap.travelHours, colour: colour.series2 },
              {
                id: "docs",
                label: "Planned notes time",
                value: cap.documentationHours,
                colour: colour.series3,
              },
              { id: "leave", label: "Leave", value: cap.leaveHours, colour: colour.stone },
              {
                id: "free",
                label: "Still available",
                value: cap.availableHours,
                colour: colour.healthy,
              },
            ]}
          />
          <p className="mt-3 text-caption text-ink-500">
            Rule: your working hours less booked contact, travel, 15 minutes of notes per visit and
            per unsigned note, and leave. A count of patients is not a measure of how complex they
            are.
          </p>
        </Panel>
        <Panel title="Supervision" action={<Tag tone="neutral">{ws.supervision.length}</Tag>}>
          {ws.supervision.length === 0 ? (
            <p className="text-small text-ink-500">No reviews requested.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {ws.supervision.slice(0, 5).map((s) => (
                <li key={s.id} className="text-small">
                  <Link
                    href={`/therapist/assessments/${s.id}`}
                    className="font-semibold hover:text-accent"
                  >
                    {s.clientName}
                  </Link>
                  <span className="block text-caption text-ink-500">
                    {s.support} ·{" "}
                    {s.status === "Commented"
                      ? `comment from ${s.reviewer}`
                      : `asked ${dayOnly(s.requestedAt)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Reports due" action={<Tag tone="neutral">{ws.reports.length}</Tag>}>
          {ws.reports.length === 0 ? (
            <p className="text-small text-ink-500">No reports due in the next three weeks.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {ws.reports.slice(0, 5).map((r) => (
                <li key={r.id} className="text-small">
                  <Link href={r.href} className="font-semibold hover:text-accent">
                    {r.kind}: {r.clientName}
                  </Link>
                  <span className="block text-caption text-ink-500">
                    Due {dayOnly(r.due)} · {r.requestedBy}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      {message && <MessageSheet ws={ws} clientId={null} onClose={() => setMessage(false)} />}
      {safety && <SafetySheet visit={null} onClose={() => setSafety(false)} onDone={reload} />}
    </div>
  );
}

function NextAppointment({
  visit,
  openVisit,
}: {
  visit: WsVisit | null;
  openVisit: (id: string) => void;
}) {
  if (!visit) {
    return (
      <section className="rounded-card border border-dashed border-border-strong bg-surface p-5 text-small text-ink-500">
        No confirmed visits coming up. Your tasks and availability are below.
      </section>
    );
  }
  return (
    <section
      aria-label="Next appointment"
      className="rounded-card border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-caption font-semibold text-ink-500">Next appointment · {visit.ref}</p>
          <p className="mt-1 type-display text-h2 text-ink-900">
            {timeOfDay(visit.start)} – {timeOfDay(visit.end)}
          </p>
          <p className="mt-1 text-body font-semibold">{visit.clientName}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-700">
            <span>{visit.purpose}</span>
            <span className="flex items-center gap-1">
              <ModeIcon mode={visit.mode} className="size-3.5" /> {visit.mode} · {visit.location}
            </span>
            {visit.travelMinutes && (
              <span className="flex items-center gap-1">
                <Car className="size-3.5" aria-hidden="true" /> {visit.travelMinutes} min travel
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Tag tone={liveLabel(visit).tone}>{liveLabel(visit).label}</Tag>
          <Button variant="primary" onClick={() => openVisit(visit.id)}>
            {visit.mode === "Telehealth"
              ? "Open telehealth"
              : visit.checkIn
                ? "Continue visit"
                : "Prepare and start"}
          </Button>
        </div>
      </div>
      {(visit.blockers.length > 0 || visit.safetyFlag || visit.conflictWith.length > 0) && (
        <ul className="mt-4 flex flex-col gap-1 border-t border-border pt-3 text-small">
          {visit.blockers.map((b) => (
            <li key={b.reason} className="flex items-center gap-2 text-over">
              <AlertTriangle className="size-4" aria-hidden="true" /> {b.reason}
            </li>
          ))}
          {visit.safetyFlag && (
            <li className="flex items-center gap-2 text-over">
              <ShieldAlert className="size-4" aria-hidden="true" /> Precaution on file: read it
              before you go.
            </li>
          )}
          {visit.conflictWith.length > 0 && (
            <li className="flex items-center gap-2 text-watch">
              <CalendarClock className="size-4" aria-hidden="true" /> Overlaps{" "}
              {visit.conflictWith.join(", ")}
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function VisitTable({ visits, openVisit }: { visits: WsVisit[]; openVisit: (id: string) => void }) {
  return (
    <div className="-mx-5 -my-5 overflow-x-auto">
      <table className="w-full text-small">
        <thead className={tableHead}>
          <tr>
            {["Time", "Patient", "Service", "Where", "Readiness", "Status"].map((h) => (
              <th key={h} className="px-4 py-2.5 text-left font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {visits.map((v) => {
            return (
              <tr
                key={v.id}
                className="cursor-pointer hover:bg-canvas"
                onClick={() => openVisit(v.id)}
              >
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <span className="font-semibold">{timeOfDay(v.start)}</span>
                  <span className="block font-mono text-caption text-ink-500">{v.ref}</span>
                  <span className="block text-caption text-ink-500">{shortDate(v.start)}</span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="font-semibold">{v.clientName}</span>
                  {v.conflictWith.length > 0 && (
                    <span className="block text-caption text-watch">
                      Overlaps {v.conflictWith.join(", ")}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {v.purpose}
                  <span className="block text-caption text-ink-500">{v.discipline}</span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-1">
                    <ModeIcon mode={v.mode} className="size-3.5 text-ink-500" /> {v.mode}
                  </span>
                  <span className="block max-w-48 truncate text-caption text-ink-500">
                    {v.location}
                  </span>
                  {v.travelMinutes && (
                    <span className="block text-caption text-ink-500">
                      {v.travelMinutes} min travel
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <Tag tone={readinessTone[v.readiness] ?? "neutral"}>{v.readiness}</Tag>
                </td>
                <td className="px-4 py-2.5">
                  <Tag tone={liveLabel(v).tone}>{liveLabel(v).label}</Tag>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MorningBrief({ ws, reload }: { ws: WorkspaceDto; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  const b = ws.brief;
  const fresh = b && dayKey(b.generatedAt) === ws.today;
  async function generate() {
    setBusy(true);
    await wsAction({ type: "brief" });
    setBusy(false);
    reload();
  }
  async function decide(
    list: "points" | "actions",
    index: number,
    decision: NonNullable<WsBriefPoint["decision"]>,
  ) {
    if (!b) return;
    await wsAction(
      { type: "review-suggestion", briefId: b.id, list, index, decision },
      `Marked ${decision.toLowerCase()}`,
    );
    reload();
  }
  return (
    <AiDraft
      label="AI morning brief"
      suggestionsOnly
      generating={busy}
      meta={b ? `Prepared ${when(b.generatedAt)}${fresh ? "" : " · out of date"}` : undefined}
    >
      {!b ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-small text-ink-700">
            AI reads today&apos;s visits, your open notes, assessments and tasks, and cites the
            record behind every point.
          </p>
          <Button size="sm" variant="primary" onClick={generate}>
            Prepare my brief
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-small text-ink-900">{b.summary}</p>
          <BriefList items={b.points} onDecide={(i, d) => decide("points", i, d)} />
          {b.actions.length > 0 && (
            <>
              <p className="text-caption font-semibold text-ink-700">Suggested next actions</p>
              <BriefList items={b.actions} onDecide={(i, d) => decide("actions", i, d)} />
            </>
          )}
          {b.limitations && (
            <p className="text-caption text-ink-500">Limitations: {b.limitations}</p>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-caption text-ink-500">
              Suggestions only. Your signed records are never changed.
            </span>
            <Button size="sm" variant="ghost" onClick={generate}>
              Refresh
            </Button>
          </div>
        </div>
      )}
    </AiDraft>
  );
}

function BriefList({
  items,
  onDecide,
}: {
  items: WsBriefPoint[];
  onDecide: (index: number, d: NonNullable<WsBriefPoint["decision"]>) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((p, i) => (
        <li
          key={`${p.source}-${i}`}
          className="rounded-control border border-border bg-surface p-2.5 text-small"
        >
          <p>{p.text}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {p.verified && p.href ? (
              <Link href={p.href} className="text-caption font-semibold text-accent">
                From {p.sourceLabel}
              </Link>
            ) : (
              <Tag tone="watch">Unverified: no matching record</Tag>
            )}
            <span className="ml-auto flex gap-1">
              {p.decision ? (
                <Tag
                  tone={
                    p.decision === "Accepted"
                      ? "healthy"
                      : p.decision === "Rejected"
                        ? "neutral"
                        : "watch"
                  }
                >
                  {p.decision}
                </Tag>
              ) : (
                <>
                  <Button size="sm" variant="ghost" onClick={() => onDecide(i, "Accepted")}>
                    Accept
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDecide(i, "Rejected")}>
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDecide(i, "Needs clarification")}
                  >
                    Unclear
                  </Button>
                </>
              )}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ schedule */

const ranges = ["Today", "Tomorrow", "This Week", "Next Week", "Custom"] as const;
const blockTone: Record<string, string> = {
  Visit: "border-l-accent bg-accent-tint",
  Telehealth: "border-l-available-dot bg-available-bg",
  Travel: "border-l-border-strong bg-sunken",
  Documentation: "border-l-watch-dot bg-watch-bg",
  Leave: "border-l-ink-400 bg-sunken",
};

function ScheduleTab({ ws, openVisit }: { ws: WorkspaceDto; openVisit: (id: string) => void }) {
  const [view, setView] = useState<WorkspacePrefs["defaultView"]>(ws.prefs.defaultView);
  const [range, setRange] = useState<(typeof ranges)[number]>(
    view === "Week" ? "This Week" : "Today",
  );
  const [from, setFrom] = useState(ws.today);
  const [to, setTo] = useState(addDay(ws.today, 6));
  const [mode, setMode] = useState("All");
  const [status, setStatus] = useState<(typeof statusOptions)[number]>("All");
  const [sort, setSort] = useState("Start Time");
  const [search, setSearch] = useState("");
  const monday = addDay(ws.today, -weekday(ws.today));
  const [start, end] =
    range === "Today"
      ? [ws.today, ws.today]
      : range === "Tomorrow"
        ? [addDay(ws.today, 1), addDay(ws.today, 1)]
        : range === "This Week"
          ? [monday, addDay(monday, 6)]
          : range === "Next Week"
            ? [addDay(monday, 7), addDay(monday, 13)]
            : [from, to];
  const q = search.trim().toLowerCase();
  const rows = ws.visits
    .filter((v) => {
      const d = dayKey(v.start);
      if (d < start || d > end) return false;
      if (mode !== "All" && v.mode !== mode) return false;
      const s = statusOf(v);
      // AT-14: cancelled visits only when asked for.
      if (status === "All" ? s === "Cancelled" : s !== status) return false;
      return !q || v.clientName.toLowerCase().includes(q) || v.ref.toLowerCase().includes(q);
    })
    .sort((a, b) =>
      sort === "Participant Name"
        ? a.clientName.localeCompare(b.clientName)
        : sort === "Service"
          ? a.purpose.localeCompare(b.purpose)
          : a.start.localeCompare(b.start),
    );
  const days: string[] = [];
  for (let d = start; d <= end && days.length < 14; d = addDay(d, 1)) days.push(d);
  const ids = new Set(rows.map((r) => r.id));
  const blocks = ws.blocks.filter(
    (b) => b.day >= start && b.day <= end && (b.visitId ? ids.has(b.visitId) : mode === "All"),
  );
  const conflicts = rows.filter((r) => r.conflictWith.length);
  return (
    <div className="flex flex-col gap-4">
      <FilterBar aside={`${rows.length} appointment${rows.length === 1 ? "" : "s"}`}>
        <Segmented
          label="View"
          value={view}
          onChange={(v) => {
            setView(v);
            if (v === "Week" && (range === "Today" || range === "Tomorrow")) setRange("This Week");
          }}
          options={[
            { id: "Day", label: "Day" },
            { id: "Week", label: "Week" },
            { id: "List", label: "List" },
          ]}
        />
        <FilterField label="Dates">
          <Select
            value={range}
            onChange={(e) => setRange(e.target.value as (typeof ranges)[number])}
            className="h-8 w-auto min-w-32"
          >
            {ranges.map((r) => (
              <option key={r} value={r}>
                {r === "Custom" ? "Custom date range" : r}
              </option>
            ))}
          </Select>
        </FilterField>
        {range === "Custom" && (
          <>
            <input
              type="date"
              aria-label="From"
              className="h-8 rounded-control border border-border-strong px-2 text-small"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <input
              type="date"
              aria-label="To"
              className="h-8 rounded-control border border-border-strong px-2 text-small"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </>
        )}
        <FilterField label="Mode">
          <Select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="h-8 w-auto min-w-28"
          >
            {["All", ...deliveryModes].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Status">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as (typeof statusOptions)[number])}
            className="h-8 w-auto min-w-32"
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s === "All" ? "All but cancelled" : s}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Sort">
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="h-8 w-auto min-w-32"
          >
            {["Start Time", "Participant Name", "Service"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </FilterField>
        <SearchField
          label="Search appointments"
          placeholder="Patient or APT-"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-48"
        />
      </FilterBar>
      {conflicts.length > 0 && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-card border border-watch bg-watch-bg px-4 py-3 text-small text-watch"
        >
          <CalendarClock className="size-4" aria-hidden="true" />
          {conflicts.length} appointment{conflicts.length === 1 ? " overlaps" : "s overlap"} another
          booking. Nothing was moved; the scheduling team resolves it.
        </p>
      )}
      {view === "List" ? (
        rows.length === 0 ? (
          <EmptyNote title="No appointments match these filters." />
        ) : (
          <section className="rounded-card border border-border bg-surface p-5">
            <VisitTable visits={rows} openVisit={openVisit} />
          </section>
        )
      ) : (
        <div
          className={view === "Week" ? "grid gap-3 md:grid-cols-4 xl:grid-cols-7" : "grid gap-3"}
        >
          {(view === "Day" ? days.slice(0, 1) : days).map((d) => {
            const list = blocks.filter((b) => b.day === d);
            return (
              <section
                key={d}
                className="min-h-40 rounded-card border border-border bg-surface p-3"
              >
                <h3
                  className={`mb-2 text-small font-semibold ${d === ws.today ? "text-accent" : "text-ink-900"}`}
                >
                  {dayHeading(d)}
                  {d === ws.today && " · today"}
                </h3>
                {list.length === 0 ? (
                  <p className="text-caption text-ink-500">Free</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {list.map((b, i) => (
                      <li key={`${b.kind}-${b.start}-${i}`}>
                        <button
                          type="button"
                          disabled={!b.visitId || b.kind === "Travel"}
                          onClick={() => b.visitId && openVisit(b.visitId)}
                          className={`w-full rounded-control border-l-[3px] px-2 py-1.5 text-left text-caption ${blockTone[b.kind]} enabled:cursor-pointer`}
                        >
                          <span className="block font-semibold text-ink-900">
                            {timeOfDay(b.start)} · {b.kind}
                          </span>
                          <span className="block truncate text-ink-700">{b.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
      <p className="text-caption text-ink-500">
        Times are Brisbane time. Travel, planned notes time and leave are shown so the week reads
        true; appointment changes are made by the scheduling team.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ visits, travel */

function VisitsTab({
  ws,
  reload,
  visitId,
  setVisitId,
}: {
  ws: WorkspaceDto;
  reload: () => void;
  visitId: string | null;
  setVisitId: (id: string) => void;
}) {
  const now = useNow() ?? Date.parse(ws.now);
  const router = useRouter();
  const list = ws.visits.filter(
    (v) => dayKey(v.start) >= addDay(ws.today, -1) && dayKey(v.start) <= addDay(ws.today, 7),
  );
  const v =
    ws.visits.find((x) => x.id === visitId) ??
    list.find((x) => x.status === "booked" && new Date(x.end).getTime() > now) ??
    list[0];
  const [sheet, setSheet] = useState<
    "check" | "visit" | "note" | "follow" | "safety" | "super" | null
  >(null);
  const [noteVisit, setNoteVisit] = useState<AppointmentDto | null>(null);
  const [busy, setBusy] = useState(false);
  if (!v)
    return (
      <EmptyNote title="No visits this week.">
        Visits appear here when they&apos;re booked.
      </EmptyNote>
    );
  const tele = v.mode === "Telehealth";
  const school = v.mode === "School" || v.mode === "Daycare" || v.mode === "Day Program";
  const sameDay = dayKey(v.start) === ws.today || new Date(v.start).getTime() < now;
  async function continueAssessment() {
    if (!v?.needId) return;
    setBusy(true);
    try {
      // AT-19: the server returns the open draft for this service instead of starting another.
      const res = await api<{ id: string }>("/api/clinical/assessments", {
        body: { clientId: v.clientId, needId: v.needId, kind: "Initial" },
      });
      router.push(`/therapist/assessments/${res.id}`);
    } catch {
      setBusy(false);
    }
  }
  const openDraft = ws.assessments.find(
    (a) =>
      a.clientId === v.clientId &&
      (a.status === "In Progress" || a.status === "Not Started" || a.status === "Paused"),
  );
  return (
    <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
      <section aria-label="Visits" className="rounded-card border border-border bg-surface">
        <ul className="max-h-[640px] divide-y divide-border overflow-auto">
          {list.map((x) => (
            <li key={x.id}>
              <button
                type="button"
                onClick={() => setVisitId(x.id)}
                className={`w-full cursor-pointer px-4 py-3 text-left ${x.id === v.id ? "bg-accent-tint" : "hover:bg-canvas"}`}
              >
                <span className="flex items-center justify-between gap-2 text-small font-semibold">
                  {x.clientName}
                  <span className="font-mono text-caption text-ink-500">{x.ref}</span>
                </span>
                <span className="block text-caption text-ink-500">
                  {when(x.start)} · {x.mode} · {liveLabel(x).label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-col gap-6">
        <section className="rounded-card border border-border bg-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-caption text-ink-500">{v.ref}</p>
              <h2 className="type-display text-h2 text-ink-900">{v.clientName}</h2>
              <p className="text-small text-ink-700">
                {v.purpose} · {v.discipline} · {when(v.start)} – {timeOfDay(v.end)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone={liveLabel(v).tone}>{liveLabel(v).label}</Tag>
              <Tag tone="outline">{v.mode}</Tag>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {v.status === "booked" &&
              (tele ? (
                <ButtonLink variant="primary" href={`/telehealth/room/${v.id}`}>
                  <Video className="size-4" aria-hidden="true" /> Host telehealth
                </ButtonLink>
              ) : (
                <Button
                  variant="primary"
                  disabled={!sameDay}
                  onClick={() => setSheet(v.checkIn ? "visit" : "check")}
                >
                  {v.checkIn
                    ? "Continue visit"
                    : v.mode === "Home"
                      ? "Start home visit"
                      : "Start visit"}
                </Button>
              ))}
            {v.needId && (v.purpose.includes("Assessment") || openDraft) && (
              <Button loading={busy} onClick={continueAssessment}>
                {openDraft
                  ? `Continue assessment (${openDraft.done}/${openDraft.total})`
                  : "Start assessment"}
              </Button>
            )}
            {v.status === "completed" && (
              <Button
                onClick={() => {
                  setNoteVisit(v);
                  setSheet("note");
                }}
              >
                {v.note?.status === "Final" || v.note?.status === "Amended"
                  ? "View note"
                  : "Write or review note"}
              </Button>
            )}
            <Button variant="ghost" onClick={() => setSheet("follow")}>
              Request follow-up
            </Button>
            <Button variant="ghost" onClick={() => setSheet("super")}>
              Supervisor review
            </Button>
            <ButtonLink variant="ghost" href={`/therapist/patients/${v.clientId}`}>
              Open patient
            </ButtonLink>
            <Button variant="danger" onClick={() => setSheet("safety")}>
              Report safety issue
            </Button>
          </div>
          {!sameDay && v.status === "booked" && !tele && (
            <p className="mt-2 text-caption text-ink-500">A visit can be started on its day.</p>
          )}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {tele ? (
            <Panel title="Telehealth readiness">
              <dl className="grid grid-cols-2 gap-3 text-small">
                <Fact label="Consent to telehealth" value={v.consent} />
                <Fact
                  label="Recording"
                  value={
                    v.recordingConsent === "Given"
                      ? "Consent given; off until you start it"
                      : "Not permitted"
                  }
                />
                <Fact label="Joining" value="Secure link from the lobby" />
                <Fact label="Identity and location" value="Confirm at the start of the call" />
              </dl>
              <p className="mt-3 text-caption text-ink-500">
                Recording is always off by default. Joining the waiting room doesn&apos;t give
                recording consent.
              </p>
            </Panel>
          ) : (
            <Panel title={school ? "School visit details" : "Address and access"}>
              <dl className="grid grid-cols-2 gap-3 text-small">
                <Fact label={school ? "School" : "Address"} value={v.location} />
                {school ? (
                  <>
                    <Fact label="School contact" value={v.site?.contact || "Not recorded"} />
                    <Fact label="Phone" value={v.site?.phone || "Not recorded"} />
                    <Fact label="Room" value={v.site?.room || "Not recorded"} />
                    <Fact
                      label="Permission / guardian authority"
                      value={v.site?.permission ? "Confirmed" : "Not confirmed"}
                      tone={v.site?.permission ? undefined : "over"}
                    />
                  </>
                ) : (
                  <Fact label="Support person" value={v.site?.contact || "None recorded"} />
                )}
                <Fact label="Access" value={v.site?.access || "No access notes"} />
                <Fact
                  label="Travel"
                  value={v.travelMinutes ? `${v.travelMinutes} min booked` : "Not booked"}
                />
              </dl>
            </Panel>
          )}
          <Panel title="Readiness checks" action={<RuleMark />}>
            <ul className="flex flex-col gap-2 text-small">
              <li className="flex items-center justify-between gap-2">
                Location <Tag tone={readinessTone[v.readiness] ?? "neutral"}>{v.readiness}</Tag>
              </li>
              <li className="flex items-center justify-between gap-2">
                Consent{" "}
                <Tag
                  tone={
                    v.consent === "Complete"
                      ? "healthy"
                      : v.consent === "Not Applicable"
                        ? "neutral"
                        : "over"
                  }
                >
                  {v.consent}
                </Tag>
              </li>
              <li className="flex items-center justify-between gap-2">
                Safety / access{" "}
                {v.safetyFlag ? (
                  <Link
                    href={`/therapist/patients/${v.clientId}`}
                    className="text-caption font-semibold text-over"
                  >
                    Precaution on file
                  </Link>
                ) : (
                  <Tag tone="neutral">None recorded</Tag>
                )}
              </li>
              <li className="flex items-center justify-between gap-2">
                Clinical note{" "}
                <Tag tone="neutral">
                  {v.note
                    ? v.note.status
                    : v.status === "completed"
                      ? "Not started"
                      : "After the visit"}
                </Tag>
              </li>
              {v.checkIn && (
                <li className="text-caption text-ink-500">
                  Arrived {timeOfDay(v.checkIn.at)} (booked {timeOfDay(v.start)})
                  {v.checkOut
                    ? ` · left ${timeOfDay(v.checkOut.at)}, ${v.checkOut.minutes} min`
                    : ""}
                </li>
              )}
            </ul>
            {v.blockers.map((b) => (
              <p
                key={b.reason}
                className="mt-3 rounded-control border border-over bg-over-bg p-2.5 text-caption text-over"
              >
                <strong>{b.reason}</strong> {b.remedy}
              </p>
            ))}
          </Panel>
        </div>
      </div>
      {sheet === "check" && (
        <StartCheckSheet
          visit={v}
          onClose={() => setSheet(null)}
          onStart={() => setSheet("visit")}
        />
      )}
      {sheet === "visit" && (
        <VisitSheet
          visit={v}
          onClose={() => setSheet(null)}
          onChanged={reload}
          onCheckedOut={(done) => {
            setNoteVisit(done);
            setSheet("note");
          }}
        />
      )}
      {sheet === "note" && noteVisit && (
        <NoteSheet visit={noteVisit} onClose={() => setSheet(null)} onSaved={reload} />
      )}
      {sheet === "follow" && (
        <FollowUpSheet visit={v} onClose={() => setSheet(null)} onDone={reload} />
      )}
      {sheet === "safety" && (
        <SafetySheet visit={v} onClose={() => setSheet(null)} onDone={reload} />
      )}
      {sheet === "super" && (
        <SupervisorSheet
          target={{
            visitId: v.id,
            assessmentId: openDraft?.id ?? null,
            label: `${v.clientName} · ${v.ref}`,
          }}
          supervisor={ws.therapist.supervisor}
          onClose={() => setSheet(null)}
          onDone={reload}
        />
      )}
    </div>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: "over" }) {
  return (
    <div>
      <dt className="text-caption text-ink-500">{label}</dt>
      <dd className={tone === "over" ? "font-semibold text-over" : "text-ink-900"}>{value}</dd>
    </div>
  );
}

/* --------------------------------------------------------------- telehealth */

function TelehealthTab({ ws, openVisit }: { ws: WorkspaceDto; openVisit: (id: string) => void }) {
  const upcoming = ws.visits.filter(
    (v) => v.mode === "Telehealth" && v.status === "booked" && dayKey(v.start) >= ws.today,
  );
  return (
    <div className="flex flex-col gap-6">
      <Panel title="Today's telehealth sessions">
        {ws.telehealth.length === 0 ? (
          <p className="text-small text-ink-500">No telehealth sessions today.</p>
        ) : (
          <ul className="divide-y divide-border">
            {ws.telehealth.map((t) => (
              <li
                key={t.visitId}
                className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <span className="w-20 text-small font-semibold">{timeOfDay(t.start)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-small font-semibold">{t.clientName}</span>
                  <span className="block font-mono text-caption text-ink-500">{t.ref}</span>
                </span>
                <Tag
                  tone={
                    t.readiness === "Ready" || t.readiness === "Waiting room open"
                      ? "healthy"
                      : "watch"
                  }
                >
                  {t.readiness}
                </Tag>
                <Tag tone="outline">Link {t.link.toLowerCase()}</Tag>
                <Tag tone={t.recording === "Consented" ? "outline" : "neutral"}>
                  Recording {t.recording === "Consented" ? "consented, off" : "not permitted"}
                </Tag>
                <ButtonLink size="sm" variant="primary" href={`/telehealth/room/${t.visitId}`}>
                  Open lobby
                </ButtonLink>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Coming up by telehealth">
          {upcoming.length === 0 ? (
            <p className="text-small text-ink-500">None booked.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {upcoming.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2 text-small">
                  <button
                    type="button"
                    className="cursor-pointer text-left font-semibold hover:text-accent"
                    onClick={() => openVisit(v.id)}
                  >
                    {v.clientName}
                  </button>
                  <span className="text-caption text-ink-500">{when(v.start)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Telehealth rules" action={<RuleMark>Policy</RuleMark>}>
          <ul className="flex list-disc flex-col gap-1.5 pl-4 text-small text-ink-700">
            <li>Only the assigned clinician can host a session.</li>
            <li>Recording is off by default and needs recorded consent before it can start.</li>
            <li>A patient joining the waiting room doesn&apos;t give recording consent.</li>
            <li>If consent is withdrawn, recording stops and the change is logged.</li>
            <li>
              If the connection drops: reconnect, switch to phone or rebook; the time delivered is
              recorded as it happened.
            </li>
            <li>A transcript or playback never replaces your signed note.</li>
          </ul>
          <ButtonLink size="sm" className="mt-3" href="/telehealth/recordings">
            Recordings I may access
          </ButtonLink>
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ patients */

function ClientsTab({ ws }: { ws: WorkspaceDto }) {
  const [q, setQ] = useState("");
  const [service, setService] = useState("All");
  const [sort, setSort] = useState("Participant Name");
  const [message, setMessage] = useState<string | null>(null);
  const services = [...new Set(ws.clients.flatMap((c) => c.episodes.map((e) => e.support)))];
  const s = q.trim().toLowerCase();
  const rows = ws.clients
    .filter(
      (c) =>
        (!s || c.name.toLowerCase().includes(s) || c.mrn.toLowerCase().includes(s)) &&
        (service === "All" || c.episodes.some((e) => e.support === service)),
    )
    .sort((a, b) =>
      sort === "Next Visit"
        ? (a.nextVisit ?? "9").localeCompare(b.nextVisit ?? "9")
        : a.name.localeCompare(b.name),
    );
  const byService = services.map((sv, i) => ({
    id: sv,
    label: sv,
    value: ws.clients.filter((c) => c.episodes.some((e) => e.support === sv)).length,
    colour:
      [colour.series1, colour.series2, colour.series3, colour.series4][i % 4] ?? colour.series1,
  }));
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-4">
        <FilterBar aside={`${rows.length} of ${ws.clients.length} patients`}>
          <SearchField
            label="Search my patients"
            placeholder="Name or MRN"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <FilterField label="Service">
            <Select
              value={service}
              onChange={(e) => setService(e.target.value)}
              className="h-8 w-auto min-w-40"
            >
              {["All", ...services].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Sort">
            <Select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="h-8 w-auto min-w-32"
            >
              {["Participant Name", "Next Visit"].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </Select>
          </FilterField>
        </FilterBar>
        <div className={tableBox}>
          <table className="w-full text-small">
            <thead className={tableHead}>
              <tr>
                {["Patient", "Service episodes", "Next visit", "Last visit", "Flags", ""].map(
                  (h) => (
                    <th key={h} className="px-4 py-2.5 text-left font-semibold">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((c) => (
                <tr key={c.id} className="align-top">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/therapist/patients/${c.id}`}
                      className="font-semibold hover:text-accent"
                    >
                      {c.name}
                    </Link>
                    <span className="block font-mono text-caption text-ink-500">{c.mrn}</span>
                    <span className="block text-caption text-ink-500">
                      {c.age} · {c.suburb}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {c.episodes.map((e) => (
                      <span key={e.needId} className="block">
                        {e.support}
                        <span className="text-caption text-ink-500">
                          {" "}
                          · {e.frequency} · {e.location}
                        </span>
                      </span>
                    ))}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {c.nextVisit ? when(c.nextVisit) : "—"}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {c.lastVisit ? dayOnly(c.lastVisit) : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {c.safetyFlag ? (
                      <Tag tone="over">Precaution</Tag>
                    ) : (
                      <span className="text-ink-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Button size="sm" variant="ghost" onClick={() => setMessage(c.id)}>
                      <MessageSquare className="size-3.5" aria-hidden="true" /> Message team
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="p-5 text-small text-ink-500">No patients match.</p>}
        </div>
        <p className="text-caption text-ink-500">
          Previews show service and visit details only. Clinical notes, risks and recordings open in
          the patient record you are authorised to see.
        </p>
      </div>
      <div className="flex flex-col gap-6">
        <Panel title="Patients by service">
          <DonutChart
            label="Patients by service"
            slices={byService}
            centre={ws.clients.length}
            centreCaption="patients"
            stacked
          />
          <p className="mt-2 text-caption text-ink-500">
            A patient with two services counts once in the total.
          </p>
        </Panel>
        <Panel title="Messages">
          <p className="text-small text-ink-700">
            Patient chats are in your inbox. Care-team messages go to permitted staff as secure
            tasks.
          </p>
          <div className="mt-3 flex gap-2">
            <ButtonLink size="sm" href="/messages">
              Open inbox
            </ButtonLink>
            <Button size="sm" onClick={() => setMessage("")}>
              New care-team message
            </Button>
          </div>
        </Panel>
      </div>
      {message !== null && (
        <MessageSheet ws={ws} clientId={message || null} onClose={() => setMessage(null)} />
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- tasks */

function TasksTab({ ws }: { ws: WorkspaceDto }) {
  const now = useNow() ?? Date.parse(ws.now);
  const [scope, setScope] = useState<"Mine" | "Delegated">("Mine");
  const [status, setStatus] = useState("Open work");
  const [priority, setPriority] = useState("All");
  const [sort, setSort] = useState("Due Date");
  const rows = ws.tasks
    .filter((t) => (scope === "Mine" ? !t.delegated : t.delegated))
    .filter((t) =>
      status === "Open work"
        ? t.status !== "Completed" && t.status !== "Cancelled"
        : status === "All" || t.status === status,
    )
    .filter((t) => priority === "All" || t.priority === priority)
    .sort((a, b) =>
      sort === "Priority"
        ? wsPriorities.indexOf(a.priority) - wsPriorities.indexOf(b.priority)
        : sort === "Last Activity"
          ? b.lastActivity.localeCompare(a.lastActivity)
          : a.dueAt.localeCompare(b.dueAt),
    );
  const mine = ws.tasks.filter((t) => !t.delegated);
  return (
    <div className="flex flex-col gap-4">
      <FilterBar aside={`${rows.length} task${rows.length === 1 ? "" : "s"}`}>
        <Segmented
          label="Whose"
          value={scope}
          onChange={setScope}
          options={[
            { id: "Mine", label: `Mine (${mine.length})` },
            { id: "Delegated", label: `Delegated (${ws.tasks.length - mine.length})` },
          ]}
        />
        <FilterField label="Status">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-8 w-auto min-w-32"
          >
            {["Open work", "All", ...wsTaskStatuses].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Priority">
          <Select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="h-8 w-auto min-w-28"
          >
            {["All", ...wsPriorities].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Sort">
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="h-8 w-auto min-w-32"
          >
            {["Due Date", "Priority", "Last Activity"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </FilterField>
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyNote title="No tasks match.">
          Tasks assigned to you by people or rules appear here.
        </EmptyNote>
      ) : (
        <div className={tableBox}>
          <table className="w-full text-small">
            <thead className={tableHead}>
              <tr>
                {["Task", "Type", "Priority", "Status", "Due", "Owner", "Last action"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/therapist/tasks/${t.id}`}
                      className="font-semibold hover:text-accent"
                    >
                      {t.title}
                    </Link>
                    <span className="block font-mono text-caption text-ink-500">{t.ref}</span>
                  </td>
                  <td className="px-4 py-2.5">{t.category}</td>
                  <td className="px-4 py-2.5">
                    <Tag tone={priTone[t.priority] ?? "neutral"}>{t.priority}</Tag>
                  </td>
                  <td className="px-4 py-2.5">
                    <Tag
                      tone={
                        t.status === "Completed"
                          ? "healthy"
                          : t.status === "Blocked"
                            ? "over"
                            : "neutral"
                      }
                    >
                      {t.status}
                    </Tag>
                  </td>
                  <td
                    className={`px-4 py-2.5 whitespace-nowrap ${t.overdue ? "font-semibold text-over" : ""}`}
                  >
                    {dayOnly(t.dueAt)}
                    <span className="block text-caption font-normal text-ink-500">
                      {t.status === "Completed" || t.status === "Cancelled"
                        ? "Closed"
                        : dueIn(t.dueAt, now)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{t.owner}</td>
                  <td className="px-4 py-2.5 text-caption text-ink-500">
                    {t.lastAction}
                    <span className="block">{when(t.lastActivity)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-caption text-ink-500">
        Overdue means the due time has passed and the task isn&apos;t completed or cancelled.
        Completing a task asks for the outcome on the task page, and records who and when.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- assessments */

function AssessmentsTab({ ws, reload }: { ws: WorkspaceDto; reload: () => void }) {
  const [status, setStatus] = useState("Open");
  const [review, setReview] = useState<{ id: string; label: string } | null>(null);
  const rows = ws.assessments.filter((a) =>
    status === "Open"
      ? !["Finalised", "Amended", "Cancelled"].includes(a.status)
      : status === "All" || a.status === status,
  );
  const counts = wsAssessmentStatuses
    .map((s, i) => ({
      id: s,
      label: s,
      value: ws.assessments.filter((a) => a.status === s).length,
      colour:
        [
          colour.stone,
          colour.series1,
          colour.watch,
          colour.series2,
          colour.healthy,
          colour.series3,
          colour.sand,
        ][i] ?? colour.stone,
    }))
    .filter((x) => x.value > 0);
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-4">
        <FilterBar aside={`${rows.length} assessment${rows.length === 1 ? "" : "s"}`}>
          <FilterField label="Status">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-8 w-auto min-w-36"
            >
              {["Open", "All", ...wsAssessmentStatuses].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </FilterField>
        </FilterBar>
        {rows.length === 0 ? (
          <EmptyNote title="No assessments here.">
            Start one from a visit in Visits and travel.
          </EmptyNote>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {rows.map((a) => {
              const pct = a.total ? Math.round((a.done / a.total) * 100) : 0;
              return (
                <li
                  key={a.id}
                  className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-small font-semibold">{a.clientName}</p>
                      <p className="text-caption text-ink-500">
                        {a.kind} · {a.support}
                      </p>
                    </div>
                    <Tag tone={asmTone[a.status] ?? "neutral"}>{a.status}</Tag>
                  </div>
                  <div>
                    <div className="flex justify-between text-caption text-ink-500">
                      <span>Form sections complete</span>
                      <span>
                        {a.done} of {a.total}
                      </span>
                    </div>
                    <div
                      className="mt-1 h-1.5 overflow-hidden rounded-tag bg-sunken"
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Form completion"
                    >
                      <div className="h-full bg-accent-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-caption">
                    <Fact label="Started" value={dayOnly(a.startedAt)} />
                    <Fact label="Last saved" value={when(a.lastSavedAt)} />
                    <Fact label="Last section done" value={a.lastSection ?? "None yet"} />
                    <Fact
                      label="Next visit"
                      value={a.nextVisit ? when(a.nextVisit) : "None booked"}
                    />
                  </dl>
                  {a.missing.length > 0 && (
                    <ul className="list-disc pl-4 text-caption text-ink-700">
                      {a.missing.slice(0, 3).map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                      {a.missing.length > 3 && <li>and {a.missing.length - 3} more</li>}
                    </ul>
                  )}
                  <div className="mt-auto flex gap-2">
                    <ButtonLink size="sm" variant="primary" href={`/therapist/assessments/${a.id}`}>
                      {a.status === "Finalised" ? "Open" : "Continue draft"}
                    </ButtonLink>
                    {a.status !== "Finalised" && a.status !== "Awaiting Review" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setReview({ id: a.id, label: `${a.clientName} · ${a.support}` })
                        }
                      >
                        Supervisor review
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="flex flex-col gap-6">
        <Panel title="By status">
          {counts.length ? (
            <DonutChart
              label="Assessments by status"
              slices={counts}
              centre={ws.assessments.length}
              centreCaption="assessments"
              stacked
            />
          ) : (
            <p className="text-small text-ink-500">No assessments yet.</p>
          )}
        </Panel>
        <Panel title="How progress is counted" action={<RuleMark />}>
          <p className="text-small text-ink-700">
            Progress counts completed form sections only, never clinical improvement. A section is
            done when it has findings, or is marked Not applicable or Unable to assess with a
            reason. An assessment-only service closes after the report; no treatment plan is created
            for you.
          </p>
        </Panel>
      </div>
      {review && (
        <SupervisorSheet
          target={{ visitId: null, assessmentId: review.id, label: review.label }}
          supervisor={ws.therapist.supervisor}
          onClose={() => setReview(null)}
          onDone={reload}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------- documentation */

function DocumentationTab({ ws, reload }: { ws: WorkspaceDto; reload: () => void }) {
  const [status, setStatus] = useState("Outstanding");
  const [open, setOpen] = useState<AppointmentDto | null>(null);
  const rows = ws.notes.filter((n) =>
    status === "Outstanding" ? n.status !== "Signed" : status === "All" || n.status === status,
  );
  const by = docStatuses.map((s, i) => ({
    id: s,
    label: s,
    value: ws.notes.filter((n) => n.status === s).length,
    colour:
      [colour.over, colour.watch, colour.series2, colour.healthy, colour.series4][i] ??
      colour.stone,
  }));
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-4">
        <FilterBar aside={`${rows.length} item${rows.length === 1 ? "" : "s"} · last 30 days`}>
          <FilterField label="Status">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-8 w-auto min-w-40"
            >
              {["Outstanding", "All", ...docStatuses].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </FilterField>
        </FilterBar>
        {rows.length === 0 ? (
          <EmptyNote title="Nothing outstanding.">
            Every completed visit has a signed note.
          </EmptyNote>
        ) : (
          <div className={tableBox}>
            <table className="w-full text-small">
              <thead className={tableHead}>
                <tr>
                  {["Visit", "Patient", "Status", "Age", ""].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((n) => (
                  <tr key={`${n.ref}-${n.visitId}`}>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-caption">{n.ref}</span>
                      <span className="block text-caption text-ink-500">{when(n.visitAt)}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      {n.clientName}
                      <span className="block text-caption text-ink-500">{n.discipline}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex flex-wrap items-center gap-1">
                        <Tag tone={docTone[n.status] ?? "neutral"}>{n.status}</Tag>
                        {n.aiDrafted && n.status !== "Signed" && <Tag tone="outline">AI draft</Tag>}
                      </span>
                    </td>
                    <td
                      className={`px-4 py-2.5 ${n.status !== "Signed" && n.ageHours > 48 ? "font-semibold text-over" : ""}`}
                    >
                      {n.ageHours < 48 ? `${n.ageHours} h` : `${Math.round(n.ageHours / 24)} d`}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {n.visit ? (
                        <Button
                          size="sm"
                          variant={n.status === "Signed" ? "ghost" : "primary"}
                          onClick={() => setOpen(n.visit)}
                        >
                          {n.status === "Signed"
                            ? "View or amend"
                            : n.status === "Not Started"
                              ? "Write note"
                              : "Review and sign"}
                        </Button>
                      ) : (
                        <ButtonLink size="sm" href={`/therapist/assessments/${n.visitId}`}>
                          Open amendment
                        </ButtonLink>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-6">
        <Panel title="Notes by status">
          <BarList label="Notes by status" data={by} />
        </Panel>
        <Panel title="Signing rules" action={<RuleMark>Policy</RuleMark>}>
          <ul className="flex list-disc flex-col gap-1.5 pl-4 text-small text-ink-700">
            <li>Notes are due within 48 hours of the visit.</li>
            <li>Nothing is signed for you, and AI drafts are never final until you sign.</li>
            <li>A signed note can&apos;t be edited; an amendment keeps the original.</li>
          </ul>
        </Panel>
      </div>
      {open && <NoteSheet visit={open} onClose={() => setOpen(null)} onSaved={reload} />}
    </div>
  );
}

/* -------------------------------------------------------------------- alerts */

function AlertsTab({ ws, reload }: { ws: WorkspaceDto; reload: () => void }) {
  const [show, setShow] = useState<"Open" | "All">("Open");
  const [kind, setKind] = useState("All");
  const rows = ws.alerts
    .filter((a) => (show === "Open" ? !a.acknowledged : true))
    .filter((a) => kind === "All" || a.kind === kind)
    .sort(
      (a, b) =>
        ["High", "Medium", "Review"].indexOf(a.severity) -
        ["High", "Medium", "Review"].indexOf(b.severity),
    );
  const kinds = [...new Set(ws.alerts.map((a) => a.kind))];
  async function ack(key: string) {
    await wsAction({ type: "acknowledge", key }, "Alert acknowledged");
    reload();
  }
  return (
    <div className="flex flex-col gap-4">
      <FilterBar aside={<RuleMark>Rules from clinical policy</RuleMark>}>
        <Segmented
          label="Show"
          value={show}
          onChange={setShow}
          options={[
            { id: "Open", label: "To review" },
            { id: "All", label: "All" },
          ]}
        />
        <FilterField label="Type">
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="h-8 w-auto min-w-40"
          >
            {["All", ...kinds].map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </Select>
        </FilterField>
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyNote title="No alerts to review." />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((a) => (
            <li
              key={a.key}
              className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface px-4 py-3"
            >
              <Tag tone={severityTone[a.severity]}>{a.severity}</Tag>
              <span className="min-w-0 flex-1">
                <span className="block text-small font-semibold">{a.title}</span>
                <span className="block text-caption text-ink-500">
                  {a.kind} · {a.detail}
                </span>
              </span>
              <ButtonLink size="sm" variant="ghost" href={a.href}>
                Open
              </ButtonLink>
              {a.acknowledged ? (
                <span className="text-caption text-ink-500">
                  Acknowledged {when(a.acknowledged.at)}
                </span>
              ) : (
                <Button size="sm" onClick={() => ack(a.key)}>
                  Acknowledge
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-caption text-ink-500">
        Alerts are raised by rules, never by AI, and acknowledging one doesn&apos;t resolve the
        underlying issue. Risk is always escalated to a person.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ settings */

function SettingsTab({ ws, reload }: { ws: WorkspaceDto; reload: () => void }) {
  const [p, setP] = useState<WorkspacePrefs>(ws.prefs);
  const [busy, setBusy] = useState(false);
  const flip = (k: keyof WorkspacePrefs["notify"]) =>
    setP({ ...p, notify: { ...p.notify, [k]: !p.notify[k] } });
  async function save() {
    setBusy(true);
    await wsAction({ type: "prefs", prefs: p }, "Work settings saved");
    setBusy(false);
    reload();
  }
  const row = (label: string, help: string, on: boolean, toggle: () => void) => (
    <li className="flex items-center justify-between gap-4 py-3">
      <span>
        <span className="block text-small font-semibold">{label}</span>
        <span className="block text-caption text-ink-500">{help}</span>
      </span>
      <Switch on={on} label={label} onToggle={toggle} />
    </li>
  );
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="My workspace">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-small font-semibold">Schedule opens in</span>
          <Segmented
            label="Default schedule view"
            value={p.defaultView}
            onChange={(v) => setP({ ...p, defaultView: v })}
            options={[
              { id: "Day", label: "Day" },
              { id: "Week", label: "Week" },
              { id: "List", label: "List" },
            ]}
          />
        </div>
        <ul className="divide-y divide-border">
          {row("Show AI suggestions", "The AI morning brief, with its sources.", p.showAi, () =>
            setP({ ...p, showAi: !p.showAi }),
          )}
          {row(
            "Include cancelled visits",
            "Show cancelled visits in today's list by default.",
            p.includeCancelled,
            () => setP({ ...p, includeCancelled: !p.includeCancelled }),
          )}
          {row("Larger text", "Applies to your own screens.", p.largeText, () =>
            setP({ ...p, largeText: !p.largeText }),
          )}
        </ul>
      </Panel>
      <Panel title="Notifications">
        <ul className="divide-y divide-border">
          {row("Appointment changes", "Cancellations and moves.", p.notify.appointmentChanges, () =>
            flip("appointmentChanges"),
          )}
          {row("Assessments due", "Drafts waiting on you.", p.notify.assessmentsDue, () =>
            flip("assessmentsDue"),
          )}
          {row("Supervisor comments", "Reviews you asked for.", p.notify.supervisorComments, () =>
            flip("supervisorComments"),
          )}
          {row("Tasks assigned", "New work from people or rules.", p.notify.taskAssigned, () =>
            flip("taskAssigned"),
          )}
          {row(
            "Hide patient names on my devices",
            "Lock-screen notices never show clinical detail either way.",
            p.hideNamesOnDevice,
            () => setP({ ...p, hideNamesOnDevice: !p.hideNamesOnDevice }),
          )}
        </ul>
      </Panel>
      <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
        <Button variant="primary" loading={busy} onClick={save}>
          Save settings
        </Button>
        <ButtonLink href="/profile?tab=availability">
          <FileText className="size-4" aria-hidden="true" /> Change my availability
        </ButtonLink>
        <span className="text-caption text-ink-500">
          <ClipboardList className="mr-1 inline size-3.5" aria-hidden="true" />
          These are personal settings. Clinical policy, escalation rules and consent requirements
          are set by Medisense and can&apos;t be changed here.
        </span>
      </div>
    </div>
  );
}
