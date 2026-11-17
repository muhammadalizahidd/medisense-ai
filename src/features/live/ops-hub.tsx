"use client";

import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Gauge,
  History,
  Play,
  Settings2,
  TrendingUp,
  Workflow,
} from "lucide-react";
import { useState } from "react";
import { BarList } from "@/components/charts/bar-list";
import { colour } from "@/components/charts/chart-kit";
import { DonutChart } from "@/components/charts/donut-chart";
import { Sparkline } from "@/components/charts/sparkline";
import { StackedColumns } from "@/components/charts/stacked-columns";
import { TrendChart } from "@/components/charts/trend-chart";
import { RuleMark } from "@/components/ai/provenance";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Ring } from "@/components/ui/premium";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { useNow, useResource } from "@/lib/live/client";
import {
  isClosed,
  isOpen,
  rate,
  taskCategories,
  teams,
  type OpsHubDto,
  type OpsSettings,
  type QueueTab,
  type TaskDto,
} from "@/lib/live/operations";
import { cn } from "@/lib/cn";
import { ErrorNote, LiveBadge, Skeleton } from "./bits";
import { FCard } from "./funding-bits";
import { ApprovalsTab, NotificationsTab } from "./ops-comms";
import { DemoNote, ops, taskTone, when } from "./ops-bits";
import { QueueTabView } from "./ops-queue";
import { MatchingTab, ReviewTab } from "./ops-review";
import { RunLogTab, RulesTab } from "./ops-rules";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "queue", label: "Work queue" },
  { id: "review", label: "AI referral review" },
  { id: "matching", label: "Therapist matching" },
  { id: "approvals", label: "Approvals" },
  { id: "notifications", label: "Notifications" },
  { id: "rules", label: "Rules" },
  { id: "log", label: "Run log" },
  { id: "reports", label: "Reports" },
  { id: "settings", label: "Settings" },
] as const;
export type OpsTab = (typeof tabs)[number]["id"];

/** Module 08: one operational command centre. Rules route work; AI suggests; people decide. */
export function OperationsHub() {
  const { data, error, loading, reload } = useResource<{ hub: OpsHubDto }>(
    "/api/care/operations",
    (e) => e.type === "care",
  );
  const [tab, setTab] = useTab(tabs);
  const [queueTab, setQueueTab] = useState<QueueTab>("All");
  const [running, setRunning] = useState(false);
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) return <HubSkeleton />;
  const hub = data.hub;
  const open = hub.tasks.filter((t) => isOpen(t.status));
  const count = (id: OpsTab) => {
    if (id === "queue") return open.length;
    if (id === "review") return hub.reviews.filter((r) => !r.ready).length;
    if (id === "matching") return hub.matching.length;
    if (id === "approvals") return hub.approvals.filter((a) => a.canDecide).length;
    if (id === "notifications")
      return hub.messages.filter((m) => m.state === "Failed" || m.state === "Awaiting Approval")
        .length;
    if (id === "log") return hub.runs.filter((r) => r.outcome === "Error" && !r.resolved).length;
    return 0;
  };
  const tabList = tabs.map((t) => ({
    ...t,
    count: count(t.id) || undefined,
    alert: ["approvals", "notifications", "log"].includes(t.id),
  }));
  const goQueue = (q: QueueTab) => {
    setQueueTab(q);
    setTab("queue");
  };

  return (
    <>
      <PageHeader
        eyebrow="Live care"
        title="Operations"
        description={
          <span>{hub.can.roleLabel} · rules route the work, AI only suggests, people decide</span>
        }
        actions={
          <div className="flex items-center gap-3">
            <DemoNote>Messages and deliveries simulated</DemoNote>
            <Button
              size="sm"
              loading={running}
              onClick={async () => {
                setRunning(true);
                const res = await ops<{ changes: number }>(
                  "/api/care/operations",
                  { type: "run-now" },
                  "Rules checked",
                );
                setRunning(false);
                if (res) reload();
              }}
            >
              <Play className="size-3.5" aria-hidden="true" /> Run rules now
            </Button>
            <LiveBadge />
          </div>
        }
      />
      <Tabs label="Operations" tabs={tabList} value={tab} onChange={(t: OpsTab) => setTab(t)} />
      <TabPanel id="overview" value={tab}>
        <Overview hub={hub} goQueue={goQueue} go={setTab} />
      </TabPanel>
      <TabPanel id="queue" value={tab}>
        <QueueTabView hub={hub} tab={queueTab} setTab={setQueueTab} onDone={reload} />
      </TabPanel>
      <TabPanel id="review" value={tab}>
        <ReviewTab hub={hub} onDone={reload} />
      </TabPanel>
      <TabPanel id="matching" value={tab}>
        <MatchingTab hub={hub} onDone={reload} />
      </TabPanel>
      <TabPanel id="approvals" value={tab}>
        <ApprovalsTab hub={hub} onDone={reload} />
      </TabPanel>
      <TabPanel id="notifications" value={tab}>
        <NotificationsTab hub={hub} onDone={reload} />
      </TabPanel>
      <TabPanel id="rules" value={tab}>
        <RulesTab hub={hub} />
      </TabPanel>
      <TabPanel id="log" value={tab}>
        <RunLogTab hub={hub} onDone={reload} />
      </TabPanel>
      <TabPanel id="reports" value={tab}>
        <Reports hub={hub} />
      </TabPanel>
      <TabPanel id="settings" value={tab}>
        <SettingsTab hub={hub} onDone={reload} />
      </TabPanel>
    </>
  );
}

function HubSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-11" />
      <Skeleton className="h-24" />
      <div className="grid gap-6 xl:grid-cols-12">
        <Skeleton className="h-80 xl:col-span-7" />
        <Skeleton className="h-80 xl:col-span-5" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ overview (OP-01) */

function Overview({
  hub,
  goQueue,
  go,
}: {
  hub: OpsHubDto;
  goQueue: (q: QueueTab) => void;
  go: (t: OpsTab) => void;
}) {
  const now = useNow() ?? Date.parse(hub.now);
  const [team, setTeam] = useState("");
  const [category, setCategory] = useState("");
  const [range, setRange] = useState<14 | 30>(30);
  const tasks = hub.tasks.filter(
    (t) => (!team || t.team === team) && (!category || t.category === category),
  );
  const open = tasks.filter((t) => isOpen(t.status));
  const dueToday = open.filter((t) => t.dueToday);
  const overdue = open.filter((t) => t.overdue);
  const atRisk = open.filter(
    (t) =>
      !t.overdue &&
      new Date(t.dueAt).getTime() - now < 4 * 3_600_000 &&
      !["Waiting for Patient", "On Hold"].includes(t.status),
  );
  const escalated = open.filter((t) => t.status === "Escalated");
  const pendingApprovals = hub.approvals.filter(
    (a) => a.status === "Pending" || a.status === "Changes requested",
  );
  const day = 86_400_000;
  const dayKey = (ms: number) => new Date(ms + 10 * 3_600_000).toISOString().slice(0, 10);
  const days = Array.from({ length: range }, (_, i) => dayKey(now - (range - 1 - i) * day));
  const label = (k: string) =>
    new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" }).format(
      new Date(`${k}T00:00:00`),
    );
  const series = days.map((k) => ({
    day: label(k),
    Created: tasks.filter((t) => dayKey(Date.parse(t.createdAt)) === k).length,
    Closed: tasks.filter((t) => (t.resolution ? dayKey(Date.parse(t.resolution.at)) === k : false))
      .length,
  }));
  const last14 = series.slice(-14);
  const spark = (f: (d: (typeof series)[number]) => number) => last14.map(f);
  const closedRecent = tasks.filter(
    (t) => t.resolution && Date.parse(t.resolution.at) > now - range * day,
  );
  const onTime = closedRecent.filter(
    (t) => t.resolution && Date.parse(t.resolution.at) <= Date.parse(t.dueAt),
  );
  const slaPct = closedRecent.length ? Math.round((onTime.length / closedRecent.length) * 100) : 0;
  const runs = hub.runs.filter((r) => Date.parse(r.at) > now - range * day);
  const outcomes = new Map<string, number>();
  for (const r of runs) outcomes.set(r.outcome, (outcomes.get(r.outcome) ?? 0) + 1);
  const outcomeColours: Record<string, string> = {
    "Task created": colour.series1,
    "Updated existing": colour.series2,
    Closed: colour.healthy,
    "Message queued": colour.series3,
    Escalated: colour.over,
    "Duplicate skipped": colour.series4,
    Suppressed: colour.stone,
    Simulated: colour.sand,
    Blocked: colour.watch,
    Error: colour.over,
  };
  const automated = runs.filter((r) =>
    ["Task created", "Updated existing", "Closed", "Message queued", "Escalated"].includes(
      r.outcome,
    ),
  ).length;
  const byTeam = teams.map((t) => {
    const mine = open.filter((x) => x.team === t);
    const done = closedRecent.filter((x) => x.team === t);
    const ok = done.filter(
      (x) => x.resolution && Date.parse(x.resolution.at) <= Date.parse(x.dueAt),
    ).length;
    return {
      team: t,
      open: mine.length,
      sla: done.length ? Math.round((ok / done.length) * 100) : null,
      closed: done.length,
      onTrack: mine.filter(
        (x) =>
          !x.overdue &&
          x.status !== "Escalated" &&
          !["Waiting for Patient", "Waiting for Staff", "On Hold"].includes(x.status),
      ).length,
      waiting: mine.filter((x) =>
        ["Waiting for Patient", "Waiting for Staff", "On Hold"].includes(x.status),
      ).length,
      late: mine.filter((x) => x.overdue || x.status === "Escalated").length,
    };
  });
  const attention = [
    ...escalated,
    ...overdue.filter((t) => t.status !== "Escalated"),
    ...atRisk,
  ].slice(0, 30);
  const activity = [
    ...hub.runs.slice(0, 40).map((r) => ({
      at: r.at,
      who: `${r.ruleCode} · Automation`,
      what: r.detail || r.outcome,
      tone: r.outcome === "Error" || r.outcome === "Escalated" ? "over" : "rule",
    })),
    ...hub.tasks
      .flatMap((t) =>
        t.history
          .filter((h) => h.by !== "Automation")
          .map((h) => ({ at: h.at, who: h.by, what: `${t.ref} · ${h.action}`, tone: "person" })),
      )
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 40),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 50);
  const tiles = [
    {
      label: "Open tasks",
      value: open.length,
      sub: `${open.filter((t) => t.source === "Rule").length} from rules`,
      values: spark((d) => d.Created),
      onClick: () => goQueue("All"),
    },
    {
      label: "Due today",
      value: dueToday.length,
      sub: "Brisbane time",
      values: spark((d) => d.Created),
      onClick: () => goQueue("Due Today"),
    },
    {
      label: "Overdue",
      value: overdue.length,
      sub: "past due, business hours",
      tone: overdue.length ? ("over" as const) : undefined,
      values: spark((d) => Math.max(0, d.Created - d.Closed)),
      onClick: () => goQueue("Overdue"),
    },
    {
      label: "At risk",
      value: atRisk.length,
      sub: "due within 4 hours",
      tone: atRisk.length ? ("watch" as const) : undefined,
      values: spark((d) => d.Created),
      onClick: () => goQueue("All"),
    },
    {
      label: "Escalated",
      value: escalated.length,
      sub: "named escalation owner",
      tone: escalated.length ? ("over" as const) : undefined,
      values: spark((d) => d.Closed),
      onClick: () => goQueue("Escalated"),
    },
    {
      label: "Awaiting approval",
      value: pendingApprovals.length,
      sub: `${hub.approvals.filter((a) => a.canDecide).length} you can decide`,
      values: spark((d) => d.Closed),
      onClick: () => go("approvals"),
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-lift">
        <div className="w-44">
          <Select
            aria-label="Team"
            className="h-9"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
          >
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </div>
        <div className="w-52">
          <Select
            aria-label="Category"
            className="h-9"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {taskCategories.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </div>
        <div
          className="flex rounded-control border border-border-strong p-0.5"
          role="group"
          aria-label="Period"
        >
          {([14, 30] as const).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              onClick={() => setRange(r)}
              className={cn(
                "h-8 cursor-pointer rounded-control px-3 text-caption font-semibold",
                range === r ? "bg-accent-fill text-on-accent" : "text-ink-700 hover:bg-canvas",
              )}
            >
              {r} days
            </button>
          ))}
        </div>
        <span className="ml-auto text-caption text-ink-500">
          Rules last checked {when(hub.lastScan)} ·{" "}
          {hub.hiddenRestricted
            ? `${hub.hiddenRestricted} clinically restricted task(s) not shown to your role`
            : "all tasks visible to your role"}
        </span>
      </div>

      <section
        aria-label="Operations pulse"
        className="grid overflow-hidden rounded-card border border-border bg-surface shadow-lift xl:grid-cols-12"
      >
        <div className="flex items-center gap-6 border-b border-border p-6 xl:col-span-4 xl:border-r xl:border-b-0">
          <Ring
            percent={slaPct}
            size={128}
            stroke={11}
            label={`${slaPct}% of tasks closed on time`}
          >
            <span className="type-display text-h2 text-ink-900">
              {closedRecent.length ? `${slaPct}%` : "N/A"}
            </span>
            <span className="text-caption text-ink-500">on time</span>
          </Ring>
          <div className="min-w-0">
            <p className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
              Operations pulse
            </p>
            <p className="mt-1 type-display text-h1 leading-none text-ink-900">{open.length}</p>
            <p className="mt-1 text-small text-ink-700">
              open tasks across {new Set(open.map((t) => t.team)).size} teams
            </p>
            <p className="mt-3 text-caption text-ink-500">
              {onTime.length} of {closedRecent.length} closed within SLA in {range} days ·{" "}
              {automated} automated actions ·{" "}
              {runs.filter((r) => r.outcome === "Duplicate skipped").length} duplicates prevented
            </p>
          </div>
        </div>
        <div className="grid gap-px bg-border sm:grid-cols-3 xl:col-span-8">
          {tiles.map((k) => (
            <button
              key={k.label}
              type="button"
              onClick={k.onClick}
              className="group flex cursor-pointer flex-col bg-surface px-5 pt-4 pb-2 text-left transition-colors hover:bg-canvas"
            >
              <span className="flex items-center justify-between text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
                {k.label}
                <ArrowUpRight
                  className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100"
                  aria-hidden="true"
                />
              </span>
              <span
                className={cn(
                  "type-display text-h2 leading-tight",
                  k.tone === "over"
                    ? "text-over"
                    : k.tone === "watch"
                      ? "text-watch"
                      : "text-ink-900",
                )}
              >
                {k.value}
              </span>
              <span className="text-caption text-ink-500">{k.sub}</span>
              <Sparkline
                values={k.values}
                labels={last14.map((d) => d.day)}
                colour={k.tone === "over" ? colour.over : colour.accent}
                height={34}
              />
            </button>
          ))}
        </div>
      </section>

      <div className="grid items-stretch gap-6 xl:grid-cols-12">
        <FCard
          icon={TrendingUp}
          title="Throughput"
          sub={`Tasks created and closed per day, last ${range} days`}
          className="xl:col-span-8"
        >
          <TrendChart
            label="Tasks created and closed per day"
            data={series}
            xKey="day"
            height={380}
            series={[
              { key: "Created", label: "Created", colour: colour.series1, kind: "area" },
              { key: "Closed", label: "Closed", colour: colour.healthy, kind: "line" },
            ]}
          />
        </FCard>
        <FCard
          icon={Activity}
          title="Automation outcomes"
          sub={`${runs.length} rule runs in ${range} days`}
          className="xl:col-span-4"
        >
          {runs.length === 0 ? (
            <p className="py-6 text-center text-small text-ink-500">No rule runs yet.</p>
          ) : (
            <DonutChart
              label="Automation outcomes"
              stacked
              size={150}
              slices={[...outcomes.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => ({
                  id: k,
                  label: k,
                  value: v,
                  colour: outcomeColours[k] ?? colour.stone,
                }))}
              centre={runs.length}
              centreCaption="runs"
            />
          )}
        </FCard>

        <FCard
          icon={Gauge}
          title="SLA by team"
          sub={`Closed on time in ${range} days, and open work now · click a team to filter`}
          className="xl:col-span-12"
        >
          <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
            {byTeam.map((t) => (
              <button
                key={t.team}
                type="button"
                aria-pressed={team === t.team}
                onClick={() => setTeam(team === t.team ? "" : t.team)}
                className={cn(
                  "flex cursor-pointer items-center gap-4 rounded-card border p-4 text-left transition-colors hover:bg-canvas",
                  team === t.team ? "border-accent bg-accent-tint" : "border-border",
                )}
              >
                <Ring
                  percent={t.sla ?? 0}
                  size={72}
                  stroke={7}
                  label={`${t.team} SLA ${t.sla ?? "N/A"}`}
                >
                  <span className="text-small font-semibold text-ink-900">
                    {t.sla === null ? "N/A" : `${t.sla}%`}
                  </span>
                </Ring>
                <span className="min-w-0">
                  <span className="block text-small font-semibold text-ink-900">{t.team}</span>
                  <span className="block text-caption text-ink-500">
                    {t.open} open · {t.closed} closed
                  </span>
                  {t.late > 0 && (
                    <span className="block text-caption font-semibold text-over">
                      {t.late} overdue or escalated
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </FCard>

        <FCard
          icon={AlertTriangle}
          title="Needs attention"
          sub="Escalated, overdue and at-risk work, most urgent first"
          className="xl:col-span-7"
          flush
        >
          {attention.length === 0 ? (
            <p className="flex h-[420px] items-center justify-center text-small text-ink-500">
              Nothing is overdue or escalated.
            </p>
          ) : (
            <ul className="h-[420px] divide-y divide-border overflow-y-auto">
              {attention.map((t) => (
                <li key={t.id}>
                  <a
                    href={`/care/operations/tasks/${t.id}`}
                    className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-canvas hover:no-underline"
                  >
                    <span
                      className={cn(
                        "mt-1.5 size-2.5 flex-none rounded-full",
                        t.status === "Escalated"
                          ? "bg-over-dot"
                          : t.overdue
                            ? "bg-watch-dot"
                            : "bg-available-dot",
                      )}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-small font-semibold text-ink-900">
                        {t.title}
                      </span>
                      <span className="block truncate text-caption text-ink-500">
                        <span className="font-mono">{t.ref}</span> · {t.team} ·{" "}
                        {t.assigneeName ?? "Unassigned"}
                        {t.escalation
                          ? ` · escalated to ${t.escalation.owner}`
                          : ` · due ${when(t.dueAt)}`}
                      </span>
                    </span>
                    <Tag tone={taskTone[t.status]}>{t.status}</Tag>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </FCard>
        <FCard
          icon={Gauge}
          title="Open work by team"
          sub="On track, waiting on someone, or past its SLA"
          className="xl:col-span-5"
        >
          <StackedColumns
            label="Open tasks by team"
            data={byTeam.map((t) => ({
              team: t.team,
              "On track": t.onTrack,
              Waiting: t.waiting,
              "Overdue or escalated": t.late,
            }))}
            xKey="team"
            height={360}
            series={[
              { key: "On track", label: "On track", colour: colour.series1 },
              { key: "Waiting", label: "Waiting", colour: colour.series3 },
              { key: "Overdue or escalated", label: "Overdue or escalated", colour: colour.over },
            ]}
          />
        </FCard>

        <FCard
          icon={History}
          title="Live activity"
          sub="What rules and people did, newest first"
          className="xl:col-span-7"
          flush
        >
          <ol className="h-[420px] divide-y divide-border overflow-y-auto">
            {activity.map((a, i) => (
              <li key={i} className="flex items-start gap-3 px-5 py-2.5">
                {a.tone === "person" ? (
                  <span className="mt-0.5 flex size-6 flex-none items-center justify-center rounded-full bg-accent-tint text-label font-semibold text-accent">
                    {a.who
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                      .slice(0, 2)}
                  </span>
                ) : (
                  <span
                    className={cn(
                      "mt-0.5 flex size-6 flex-none items-center justify-center rounded-control border",
                      a.tone === "over"
                        ? "border-over text-over"
                        : "border-border-strong text-ink-700",
                    )}
                  >
                    <Workflow className="size-3.5" aria-hidden="true" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-small text-ink-900">{a.what}</span>
                  <span className="text-caption text-ink-500">
                    {a.who} · {when(a.at)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </FCard>
        <FCard
          icon={Workflow}
          title="Rules"
          sub="Automations and how often they ran"
          className="xl:col-span-5"
          flush
          action={<RuleMark>Automation</RuleMark>}
        >
          <ul className="h-[420px] divide-y divide-border overflow-y-auto">
            {hub.rules.map((r) => (
              <li key={r.id}>
                <a
                  href={`/care/operations/rules/${r.id}`}
                  className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-canvas hover:no-underline"
                >
                  <span className="w-14 flex-none font-mono text-caption text-ink-500">
                    {r.code}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-small text-ink-900">{r.name}</span>
                  <span className="text-caption text-ink-500">{r.runs} runs</span>
                  <Tag
                    tone={
                      r.status === "Active"
                        ? "healthy"
                        : r.status === "Paused"
                          ? "neutral"
                          : "watch"
                    }
                  >
                    {r.status}
                  </Tag>
                </a>
              </li>
            ))}
          </ul>
        </FCard>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ reports (OP-12, section 15) */

const periods = ["Last 7 days", "Last 30 days", "All time"] as const;

function Reports({ hub }: { hub: OpsHubDto }) {
  const [period, setPeriod] = useState<(typeof periods)[number]>("Last 30 days");
  const [team, setTeam] = useState("");
  const now = Date.parse(hub.now);
  const since =
    period === "Last 7 days"
      ? now - 7 * 86_400_000
      : period === "Last 30 days"
        ? now - 30 * 86_400_000
        : 0;
  const tasks = hub.tasks.filter(
    (t) => Date.parse(t.createdAt) >= since && (!team || t.team === team),
  );
  const runs = hub.runs.filter((r) => Date.parse(r.at) >= since);
  const messages = hub.messages.filter((m) => Date.parse(m.createdAt) >= since);
  const open = tasks.filter((t) => isOpen(t.status));
  const firstAction = tasks
    .map((t) => {
      const h = t.history.find(
        (x, i) => i > 0 && x.by !== "Automation" && !x.action.startsWith("Created"),
      );
      return h ? (Date.parse(h.at) - Date.parse(t.createdAt)) / 3_600_000 : null;
    })
    .filter((x): x is number => x !== null);
  const avgFirst = firstAction.length
    ? Math.round((firstAction.reduce((a, b) => a + b, 0) / firstAction.length) * 10) / 10
    : null;
  const reviews = hub.reviews;
  const eligibleAdmin = tasks.filter(
    (t) =>
      t.source === "Rule" &&
      isClosed(t.status) &&
      ["Referral", "Scheduling", "Telehealth", "Documentation"].includes(t.category),
  );
  const autoResolved = eligibleAdmin.filter((t) =>
    t.history.slice(1).every((h) => h.by === "Automation" || h.by === "Completeness check"),
  );
  const suggestions = hub.runs.filter((r) => r.ruleCode === "AUT-06" || r.ruleCode === "AUT-07");
  const approved = suggestions.filter(
    (r) =>
      r.input.startsWith("Suggestion approved") ||
      (r.ruleCode === "AUT-07" && r.outcome === "Task created"),
  );
  const queued = messages.filter(
    (m) => !["Draft", "Awaiting Approval", "Suppressed"].includes(m.state),
  );
  const failed = messages.filter((m) => m.state === "Failed");
  const ruleErrors = runs.filter(
    (r) => r.outcome === "Error" || r.outcome === "Blocked" || r.outcome === "Duplicate skipped",
  );
  const metrics = [
    {
      label: "Open tasks",
      value: String(open.length),
      def: "Not Completed or Cancelled at snapshot",
    },
    {
      label: "Overdue tasks",
      value: String(open.filter((t) => t.overdue).length),
      def: "Open tasks past their due time",
    },
    {
      label: "First action time",
      value: avgFirst === null ? "N/A" : `${avgFirst} h`,
      def: `Creation to first human or allowed action · ${firstAction.length} task(s)`,
    },
    {
      label: "Referral completeness",
      value: rate(
        reviews.filter(
          (r) => !r.findings.some((f) => f.category === "Missing" && f.resolution === "Open"),
        ).length,
        reviews.length,
      ).label,
      def: `Validated referrals / open referrals · ${rate(reviews.filter((r) => !r.findings.some((f) => f.category === "Missing" && f.resolution === "Open")).length, reviews.length).of}`,
    },
    {
      label: "Automated task creation",
      value: String(runs.filter((r) => r.outcome === "Task created").length),
      def: "Valid task creations from active rules",
    },
    {
      label: "Auto-resolution rate",
      value: rate(autoResolved.length, eligibleAdmin.length).label,
      def: `Closed without manual edits / eligible admin tasks · ${rate(autoResolved.length, eligibleAdmin.length).of}`,
    },
    {
      label: "Assignment approval rate",
      value: rate(approved.length, suggestions.length).label,
      def: `Approved suggestions / suggestions reviewed · ${rate(approved.length, suggestions.length).of}`,
    },
    {
      label: "Escalation rate",
      value: rate(
        tasks.filter((t) => t.status === "Escalated" || t.escalation).length,
        tasks.length,
      ).label,
      def: `Escalated / all tasks · ${rate(tasks.filter((t) => t.status === "Escalated" || t.escalation).length, tasks.length).of}`,
    },
    {
      label: "Notification failure rate",
      value: rate(failed.length, queued.length).label,
      def: `Failed simulated sends / queued sends · ${rate(failed.length, queued.length).of}`,
    },
    {
      label: "Rule error count",
      value: String(ruleErrors.length),
      def: "Errors, blocked actions and loop prevention",
    },
  ];
  const byUser = new Map<string, { open: number; overdue: number }>();
  for (const t of open) {
    const k = t.assigneeName ?? "Unassigned";
    const v = byUser.get(k) ?? { open: 0, overdue: 0 };
    v.open += 1;
    if (t.overdue) v.overdue += 1;
    byUser.set(k, v);
  }
  const categoryCounts = new Map<string, number>();
  for (const t of tasks) categoryCounts.set(t.category, (categoryCounts.get(t.category) ?? 0) + 1);
  const byCategory = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]);
  const byRule = new Map<string, number>();
  for (const r of runs)
    if (r.outcome === "Task created") byRule.set(r.ruleCode, (byRule.get(r.ruleCode) ?? 0) + 1);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-lift">
        <div className="w-44">
          <Select
            aria-label="Reporting period"
            className="h-9"
            value={period}
            onChange={(e) => setPeriod(e.target.value as (typeof periods)[number])}
          >
            {periods.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <Select
            aria-label="Team"
            className="h-9"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
          >
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </div>
        <span className="ml-auto flex items-center gap-2 text-caption text-ink-500">
          <DemoNote>Demo data</DemoNote> Percentages show their denominator; N/A where there is
          nothing to divide by.
        </span>
      </div>
      <section
        aria-label="Measures"
        className="grid gap-px overflow-hidden rounded-card border border-border bg-border shadow-lift sm:grid-cols-2 xl:grid-cols-5"
      >
        {metrics.map((m) => (
          <div key={m.label} className="flex flex-col gap-1 bg-surface px-5 py-4">
            <span className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
              {m.label}
            </span>
            <span className="type-display text-h2 leading-tight text-ink-900">{m.value}</span>
            <span className="text-caption text-ink-500">{m.def}</span>
          </div>
        ))}
      </section>
      <div className="grid items-stretch gap-6 xl:grid-cols-12">
        <FCard
          icon={Gauge}
          title="Workload distribution"
          sub="Open tasks per person, overdue in red"
          className="xl:col-span-6"
        >
          <BarList
            label="Open tasks per person"
            data={[...byUser.entries()]
              .sort((a, b) => b[1].open - a[1].open)
              .slice(0, 12)
              .map(([k, v]) => ({
                id: k,
                label: k,
                value: v.open,
                colour: v.overdue ? colour.over : colour.series1,
                detail: `${v.overdue} overdue`,
              }))}
            labelWidth={150}
          />
        </FCard>
        <FCard
          icon={Activity}
          title="Exception volume"
          sub="Tasks created in the period, by category"
          className="xl:col-span-6"
        >
          <BarList
            label="Tasks by category"
            data={byCategory.map(([k, v]) => ({
              id: k,
              label: k,
              value: v,
              colour: colour.series2,
            }))}
            labelWidth={150}
          />
        </FCard>
        <FCard
          icon={Workflow}
          title="Throughput by rule"
          sub="Tasks created per rule and version"
          className="xl:col-span-12"
        >
          <BarList
            label="Tasks created per rule"
            data={hub.rules
              .filter((r) => byRule.get(r.code))
              .map((r) => ({
                id: r.code,
                label: `${r.code} ${r.name}`,
                value: byRule.get(r.code) ?? 0,
                colour: colour.series3,
                detail: `version ${r.version}`,
              }))}
            labelWidth={260}
          />
        </FCard>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ settings (OP-11) */

function SettingsTab({ hub, onDone }: { hub: OpsHubDto; onDone: () => void }) {
  const [s, setS] = useState<OpsSettings>(hub.settings);
  const [busy, setBusy] = useState(false);
  const can = hub.can.manager;
  const num = (k: keyof OpsSettings, label: string, hint: string, min = 1) => (
    <label className="flex flex-col gap-1">
      <span className="text-caption font-semibold text-ink-700">{label}</span>
      <input
        type="number"
        min={min}
        disabled={!can}
        value={String(s[k])}
        onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })}
        className="h-10 rounded-(--radius-field) border border-border-strong bg-surface px-3 text-small disabled:bg-sunken"
      />
      <span className="text-caption text-ink-500">{hint}</span>
    </label>
  );
  const time = (k: "workdayStart" | "workdayEnd" | "quietStart" | "quietEnd", label: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-caption font-semibold text-ink-700">{label}</span>
      <input
        type="time"
        disabled={!can}
        value={s[k]}
        onChange={(e) => setS({ ...s, [k]: e.target.value })}
        className="h-10 rounded-(--radius-field) border border-border-strong bg-surface px-3 text-small disabled:bg-sunken"
      />
    </label>
  );
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <FCard
        icon={Settings2}
        title="Working hours and automation"
        sub={
          can
            ? "Changes apply to the next rule run and are audited"
            : "View only: the Director or an Operations Manager changes these"
        }
        className="xl:col-span-8"
        footer={
          can && (
            <>
              <Button
                variant="primary"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  const { timezone, updatedAt, updatedBy, ...rest } = s;
                  void timezone;
                  void updatedAt;
                  void updatedBy;
                  if (
                    await ops(
                      "/api/care/operations",
                      { type: "settings", settings: rest },
                      "Settings saved",
                    )
                  )
                    onDone();
                  setBusy(false);
                }}
              >
                Save settings
              </Button>
              <span className="text-caption text-ink-500">
                {hub.settings.updatedBy
                  ? `Last changed by ${hub.settings.updatedBy}, ${when(hub.settings.updatedAt)}`
                  : "Default settings"}
              </span>
            </>
          )
        }
      >
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {time("workdayStart", "Business day starts")}
          {time("workdayEnd", "Business day ends")}
          {time("quietStart", "Quiet hours start")}
          {time("quietEnd", "Quiet hours end")}
          {num("planWarningDays", "Plan expiry warning (days)", "AUT-04")}
          {num("noteThresholdHours", "Unsigned note prompt (hours)", "AUT-11")}
          {num(
            "noteEscalateHours",
            "Unsigned note escalation (hours)",
            "AUT-11 supervisor policy",
            2,
          )}
          {num("assessmentOverdueDays", "Assessment review deadline (days)", "AUT-12")}
          {num(
            "reminderCapPerDay",
            "Reminders per person per day",
            "Frequency cap, urgent excepted",
          )}
          {num(
            "retentionDays",
            "Log retention (days)",
            "Placeholder until policy is confirmed",
            30,
          )}
        </div>
        <div className="mt-5 flex items-center justify-between gap-4 rounded-control border border-border px-4 py-3">
          <span>
            <span className="block text-small font-semibold text-ink-900">AI referral review</span>
            <span className="block text-caption text-ink-500">
              Extraction and cross-checks with evidence. Findings are suggestions; a person decides
              each one.
            </span>
          </span>
          <Switch
            on={s.aiReviewEnabled}
            disabled={!can}
            onToggle={() => setS({ ...s, aiReviewEnabled: !s.aiReviewEnabled })}
            label="AI referral review"
          />
        </div>
        <p className="mt-4 text-caption text-ink-500">
          Timezone: Australia/Brisbane (no daylight saving). Therapist assignment mode is{" "}
          {hub.assignmentMode}; change it in Scheduling.
        </p>
      </FCard>
      <FCard
        icon={Workflow}
        title="Workflow permissions"
        sub="Who can do what in operations"
        className="xl:col-span-4"
        flush
      >
        <ul className="divide-y divide-border text-small">
          {[
            [
              "Director, Operations Manager",
              "Settings, rules, activation approvals, travel exceptions, reopen",
            ],
            ["Intake Admin", "Referral tasks, information requests, hand off to triage"],
            ["Scheduler", "Booking tasks, shortlist approval, reminders"],
            ["Clinical Lead", "Restricted reviews, risk decisions, recording questions"],
            ["Finance", "Funding and billing tasks; no clinical notes"],
            ["Therapist", "Own tasks: acknowledge, complete, ask admin"],
            ["Automation", "Allowed actions only; never clinical decisions"],
          ].map(([r, a]) => (
            <li key={r} className="px-5 py-3">
              <p className="font-semibold text-ink-900">{r}</p>
              <p className="text-caption text-ink-500">{a}</p>
            </li>
          ))}
        </ul>
      </FCard>
    </div>
  );
}

export type { TaskDto };
