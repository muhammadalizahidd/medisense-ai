"use client";

import {
  AlertTriangle,
  BellRing,
  ClipboardCheck,
  FileInput,
  FileText,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { DonutChart } from "@/components/charts/donut-chart";
import { colour } from "@/components/charts/chart-kit";
import { ButtonLink } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/page";
import { AiMark } from "@/components/ai/marks";
import { caseNotes } from "@/data/case-note";
import { referrals } from "@/data/referrals";
import { cn } from "@/lib/cn";
import { useDemoStore } from "@/state/demo-store";
import { unownedFollowUps } from "@/state/story-selectors";
import { useBriefing } from "../ai-briefing";
import { LiveCarePanel } from "@/features/live/live-care-panel";
import { AssistantCard, MonthCalendar, Notifications, UpcomingSupervision } from "./blue-rail";
import {
  CaseloadOverview,
  ClientStatus,
  Hero,
  KpiCards,
  QuickActions,
  TodaysSchedule,
  useFigures,
} from "./overview-top";

export function Panel({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: { href: string; label: string };
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "flex min-w-0 flex-col rounded-card border border-border bg-surface p-5",
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="type-display text-section">{title}</h2>
        {action && (
          <Link href={action.href} className="text-caption font-medium whitespace-nowrap">
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** The live AI briefing that used to sit in the hero. */
function BriefingCard() {
  const { briefing, changed, lastSkip } = useBriefing();
  return (
    <section
      aria-label="AI briefing"
      className="ai-surface flex min-w-0 flex-col gap-4 rounded-card p-5 lg:flex-row lg:items-center"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="type-display text-section">Today&apos;s briefing</h2>
          <AiMark>AI briefing, recommendation only</AiMark>
        </div>
        {briefing.loading ? (
          <div aria-busy="true" className="mt-3">
            <span className="block h-3 w-11/12 animate-pulse rounded-full bg-border motion-reduce:animate-none" />
            <span className="mt-2 block h-3 w-3/4 animate-pulse rounded-full bg-border motion-reduce:animate-none" />
          </div>
        ) : (
          <p className="mt-2 text-small leading-6">{briefing.data}</p>
        )}
      </div>
      <div className="flex flex-none flex-wrap gap-2">
        {changed ? (
          <>
            <ButtonLink href="/before-after" variant="primary" size="sm">
              See before and after
            </ButtonLink>
            {lastSkip > 0 && (
              <ButtonLink href="/since-yesterday" size="sm">
                See what happened overnight
              </ButtonLink>
            )}
          </>
        ) : (
          <ButtonLink href="/caseloads/sarah-thompson" variant="primary" size="sm">
            See Sarah&apos;s workload
          </ButtonLink>
        )}
      </div>
    </section>
  );
}

function TeamStatus({ className }: { className?: string }) {
  const { live } = useFigures();
  const count = (status: string) => live.list.filter((c) => c.status === status).length;
  const utilisation = live.capacity ? Math.round((live.active / live.capacity) * 100) : 0;
  const highest = Math.max(...live.list.map((c) => c.utilisation));
  return (
    <Panel
      className={className}
      title="Team status"
      action={{ href: "/team-capacity", label: "View all" }}
    >
      <DonutChart
        label="Clinicians by caseload status"
        stacked
        size={132}
        centre={live.list.length}
        centreCaption="Clinicians"
        slices={[
          { id: "healthy", label: "Healthy", value: count("healthy"), colour: colour.healthy },
          { id: "monitor", label: "Watch", value: count("monitor"), colour: colour.monitor },
          { id: "at-risk", label: "At Risk", value: count("at-risk"), colour: colour.over },
        ]}
      />
      <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-border pt-4">
        <div>
          <dt className="text-caption text-ink-500">Team utilisation</dt>
          <dd className="type-display text-section">{utilisation}%</dd>
        </div>
        <div>
          <dt className="text-caption text-ink-500">Peak caseload</dt>
          <dd className="type-display text-section">{highest}%</dd>
        </div>
      </dl>
    </Panel>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-8 flex-none items-center justify-center rounded-full bg-accent-tint text-caption font-semibold text-accent"
    >
      {initials(name)}
    </span>
  );
}

function RecentNotes({ className }: { className?: string }) {
  const states = useDemoStore((s) => s.caseNotes);
  return (
    <Panel
      className={className}
      title="Recent AI notes"
      action={{ href: "/case-notes/mia-robinson", label: "View all" }}
    >
      <ul className="flex flex-1 flex-col justify-between gap-3">
        {caseNotes.slice(0, 4).map((n) => (
          <li key={n.id}>
            <Link
              href={`/case-notes/${n.id}`}
              className="flex gap-2.5 text-ink-900 hover:text-ink-900 hover:no-underline"
            >
              <Avatar name={n.client} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-small font-medium">{n.client}</span>
                <span className="line-clamp-2 text-caption text-ink-500">
                  {states[n.id]?.mode === "approved"
                    ? "Note approved."
                    : n.backlog.kind === "ai-draft"
                      ? "AI draft ready for approval."
                      : `Note ${n.backlog.days} days overdue.`}{" "}
                  {n.clinician}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function ReviewAlerts({ className }: { className?: string }) {
  const { live } = useFigures();
  const shown = [
    ...live.attention.filter((a) => a.priority === "High"),
    ...live.attention.filter((a) => a.priority === "Medium"),
  ].slice(0, 3);
  return (
    <Panel
      className={className}
      title="Patients to review"
      action={{ href: "/patients-requiring-attention", label: "View all" }}
    >
      <ul className="flex flex-1 flex-col gap-2">
        {shown.map((a) => {
          const high = a.priority === "High";
          return (
            <li
              key={a.id}
              className={cn(
                "flex gap-2 rounded-control px-2.5 py-2",
                high ? "bg-over-bg" : "bg-monitor-bg",
              )}
            >
              <AlertTriangle
                className={cn("mt-0.5 size-4 flex-none", high ? "text-over" : "text-monitor")}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span
                  className={cn(
                    "block text-caption font-semibold",
                    high ? "text-over" : "text-monitor",
                  )}
                >
                  {a.priority} priority
                </span>
                <span className="block truncate text-small font-medium">{a.name}</span>
                <span className="line-clamp-1 text-caption text-ink-700">{a.reason}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/** These come from rules, not AI, so the panel isn't labelled AI. */
function Reminders({ className }: { className?: string }) {
  const { live, story, tasks } = useFigures();
  const kpi = (label: string) => live.kpis.find((k) => k.label === label)?.value ?? "0";
  const escalated = tasks.filter((t) => !t.done && t.daysOverdue >= 3).length;
  const rows: { icon: LucideIcon; text: string; href: string; action: string }[] = [
    {
      icon: ClipboardCheck,
      text: `${unownedFollowUps(story)} follow-ups with no owner`,
      href: "/tasks",
      action: "Assign",
    },
    {
      icon: FileText,
      text: `${kpi("Notes due")} notes due`,
      href: "/case-notes/mia-robinson",
      action: "Review",
    },
    {
      icon: UserCheck,
      text: `${kpi("Supervision due")} supervision sessions due`,
      href: "/supervision/sarah-thompson",
      action: "View",
    },
    { icon: BellRing, text: `${escalated} tasks overdue`, href: "/tasks", action: "View" },
    {
      icon: FileInput,
      text: `${referrals.length} referrals in progress`,
      href: "/intake",
      action: "Open",
    },
  ];
  return (
    <Panel className={className} title="Automated reminders">
      <ul className="flex flex-1 flex-col justify-between gap-2.5">
        {rows.map((r) => (
          <li key={r.text} className="flex items-center gap-2 text-caption">
            <r.icon className="size-4 flex-none text-accent" strokeWidth={1.5} aria-hidden="true" />
            <span className="min-w-0 flex-1 leading-4">{r.text}</span>
            <Link href={r.href} className="flex-none font-medium">
              {r.action}
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const ROW = "grid gap-6 md:grid-cols-2 xl:grid-cols-12";
const THIRD = "xl:col-span-4";
const LAST_THIRD = "md:col-span-2 xl:col-span-4";

/** One 12-column grid with one 24 px gap, so every row lines up across the page. */
export function BlueOverview({ children }: { children: ReactNode }) {
  return (
    <PageContainer>
      <div className="flex flex-col gap-6">
        <Hero />
        <KpiCards />
        <QuickActions />
        <LiveCarePanel />
        <div className={ROW}>
          <TodaysSchedule className={THIRD} />
          <ClientStatus className={THIRD} />
          <CaseloadOverview className={LAST_THIRD} />
        </div>
        <BriefingCard />
        <div className={ROW}>
          <TeamStatus className="xl:col-span-4" />
          <ReviewAlerts className="xl:col-span-5" />
          <MonthCalendar className="md:col-span-2 xl:col-span-3" />
        </div>
        <div className={ROW}>
          <RecentNotes className={THIRD} />
          <Reminders className={THIRD} />
          <UpcomingSupervision className={LAST_THIRD} />
        </div>
        <div className={ROW}>
          <Notifications className="xl:col-span-5" />
          <AssistantCard className="md:col-span-2 xl:col-span-7" />
        </div>
      </div>

      <section aria-labelledby="team-detail" className="mt-12">
        <h2 id="team-detail" className="mb-5 type-display text-h1">
          Team detail
        </h2>
        {children}
      </section>
    </PageContainer>
  );
}
