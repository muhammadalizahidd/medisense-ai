"use client";

import {
  Archive,
  BarChart3,
  CalendarClock,
  Download,
  FileClock,
  Lightbulb,
  ListChecks,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Send,
  Trash2,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AiDraft, RuleMark } from "@/components/ai/provenance";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { Tag, type TagTone } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/live/client";
import { cn } from "@/lib/cn";
import {
  distributionGroups,
  exportContents,
  exportFormats,
  frequencies,
  type ExportDto,
  type InsightDto,
  type ScheduleDto,
  type ScheduleInput,
  type ViewDto,
} from "@/lib/live/report-dto";
import { reportById, reports } from "@/lib/live/report-catalogue";
import { datePresets, type Domain } from "@/lib/live/reports";
import { Card, Kpi, KpiGrid, NA, ReportTable, td, th, type Ctx } from "./reports-bits";

const when = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("en-AU", {
        timeZone: "Australia/Brisbane",
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(iso))
    : "—";

async function act(url: string, body: unknown, ok: string, reload: () => void) {
  try {
    const res = await api<Record<string, unknown>>(url, { body });
    toast(ok, { tone: "success" });
    reload();
    return res;
  } catch (e) {
    toast("Couldn't do that", { tone: "error", detail: e instanceof Error ? e.message : "" });
    return null;
  }
}

export type Go = (tab: string) => void;

/* ------------------------------------------------------------------ home */

const categoryTabs: { domain: Domain; tab: string; title: string; metrics: string[] }[] = [
  {
    domain: "Referrals",
    tab: "referrals",
    title: "Referral and intake",
    metrics: ["new-referrals", "missing-info"],
  },
  {
    domain: "Participants",
    tab: "participants",
    title: "Participants and services",
    metrics: ["active-participants", "unassigned"],
  },
  {
    domain: "Staff",
    tab: "capacity",
    title: "Clinician capacity",
    metrics: ["utilisation", "delivered-hours"],
  },
  {
    domain: "Scheduling",
    tab: "appointments",
    title: "Appointments and visits",
    metrics: ["delivered", "cancellation-rate"],
  },
  {
    domain: "Clinical Operations",
    tab: "clinical",
    title: "Assessment and treatment",
    metrics: ["assessment-backlog", "overdue-notes"],
  },
  {
    domain: "Finance",
    tab: "finance",
    title: "Funding and finance",
    metrics: ["issued-revenue", "overdue-receivables"],
  },
  {
    domain: "Telehealth",
    tab: "telehealth",
    title: "Telehealth operations",
    metrics: ["telehealth-adoption", "tech-failure"],
  },
  {
    domain: "Automation",
    tab: "automation",
    title: "Automation and AI",
    metrics: ["ai-accepted", "tasks-overdue"],
  },
];

export function HomeTab({ c, go, openView }: { c: Ctx; go: Go; openView: (v: ViewDto) => void }) {
  const cats = categoryTabs.filter((x) => c.hub.scope.domains.includes(x.domain));
  const views = c.hub.views.filter((v) => v.status === "Active").slice(0, 6);
  return (
    <div className="flex flex-col gap-4">
      {c.hub.insights.filter((i) => i.status === "New").length > 0 && (
        <button
          type="button"
          onClick={() => go("automation")}
          className="flex cursor-pointer items-center gap-3 rounded-card border border-border bg-surface p-4 text-left hover:shadow-lift"
        >
          <Lightbulb className="size-5 text-accent" aria-hidden="true" />
          <span className="flex-1 text-small text-ink-900">
            <b className="font-semibold">
              {c.hub.insights.filter((i) => i.status === "New").length} new insights
            </b>{" "}
            raised by configured rules:{" "}
            {c.hub.insights
              .filter((i) => i.status === "New")
              .slice(0, 3)
              .map((i) => i.title.toLowerCase())
              .join("; ")}
            .
          </span>
          <RuleMark />
        </button>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cats.map((cat) => (
          <section
            key={cat.tab}
            className="flex flex-col rounded-card border border-border bg-surface p-4"
          >
            <h2 className="text-section font-semibold text-ink-900">{cat.title}</h2>
            <dl className="mt-3 flex flex-col gap-2">
              {cat.metrics.map((id) => {
                const r = c.run(id);
                return (
                  <div key={id} className="flex items-baseline justify-between gap-2">
                    <dt className="text-caption text-ink-500">{r.def.label}</dt>
                    <dd className="text-small font-semibold text-ink-900 tabular-nums">
                      {r.value === null
                        ? "N/A"
                        : Intl.NumberFormat(
                            "en-AU",
                            r.def.unit === "AUD"
                              ? { style: "currency", currency: "AUD", maximumFractionDigits: 0 }
                              : { maximumFractionDigits: 1 },
                          ).format(r.value) + (r.def.unit === "%" ? "%" : "")}
                    </dd>
                  </div>
                );
              })}
            </dl>
            <button
              type="button"
              onClick={() => go(cat.tab)}
              className="mt-auto cursor-pointer pt-3 text-left text-caption font-semibold text-accent hover:underline"
            >
              Open {cat.title.charAt(0).toLowerCase() + cat.title.slice(1).replace(/ ai$/i, " AI")}
            </button>
          </section>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card
          title="Saved views"
          sub="Yours and those shared with you"
          icon={BarChart3}
          flush
          action={
            <Button size="sm" variant="ghost" onClick={() => go("builder")}>
              All views
            </Button>
          }
        >
          {views.length ? (
            <ul className="divide-y divide-border">
              {views.map((v) => (
                <li key={v.id} className="flex items-center gap-2 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => openView(v)}
                    className="min-w-0 flex-1 cursor-pointer text-left"
                  >
                    <span className="block truncate text-small font-semibold text-ink-900">
                      {v.name}
                    </span>
                    <span className="text-caption text-ink-500">
                      {v.reportId ?? "Custom"} · {v.owner} · {v.scope}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-small text-ink-500">No saved views yet.</p>
          )}
        </Card>
        <Card
          title="Scheduled runs"
          sub="Next runs, Brisbane time"
          icon={CalendarClock}
          flush
          action={
            <Button size="sm" variant="ghost" onClick={() => go("schedules")}>
              Schedules
            </Button>
          }
        >
          {c.hub.schedules.length ? (
            <ul className="divide-y divide-border">
              {c.hub.schedules.slice(0, 5).map((s) => (
                <li key={s.id} className="flex items-center gap-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-small font-semibold text-ink-900">{s.name}</p>
                    <p className="text-caption text-ink-500">
                      {s.status === "Active"
                        ? `Next ${when(s.nextRun)}`
                        : (s.runs[0]?.detail ?? s.status)}
                    </p>
                  </div>
                  <Tag tone={scheduleTone[s.status]}>{s.status}</Tag>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-small text-ink-500">No schedules.</p>
          )}
        </Card>
        <Card
          title="Recent exports"
          sub="Snapshots you generated or received"
          icon={FileClock}
          flush
          action={
            <Button size="sm" variant="ghost" onClick={() => go("exports")}>
              History
            </Button>
          }
        >
          {c.hub.exports.length ? (
            <ul className="divide-y divide-border">
              {c.hub.exports.slice(0, 5).map((e) => (
                <li key={e.id} className="flex items-center gap-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-small font-semibold text-ink-900">{e.title}</p>
                    <p className="text-caption text-ink-500">
                      <span className="font-mono">{e.ref}</span> · {when(e.generatedAt)}
                    </p>
                  </div>
                  <Tag tone={exportTone(e.status)}>{e.status}</Tag>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-small text-ink-500">No exports yet.</p>
          )}
        </Card>
      </div>
      <Methodology c={c} />
      <Card
        title="Report catalogue"
        sub="Every report reads the records of the module that owns them"
        icon={ListChecks}
        flush
      >
        <table className="w-full">
          <thead className="bg-sunken">
            <tr>
              <th className={th}>Report</th>
              <th className={th}>Row grain</th>
              <th className={th}>Date basis</th>
              <th className={th}>Access</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => {
              const ok = c.hub.scope.domains.includes(r.domain);
              const detail = !r.detail || c.hub.scope.detail.includes(r.domain);
              return (
                <tr key={r.id} className="border-t border-border">
                  <td className={td}>
                    <span className="font-mono text-caption text-ink-500">{r.id}</span>{" "}
                    <span className="font-semibold">{r.title}</span>
                  </td>
                  <td className={cn(td, "text-ink-700")}>{r.grain}</td>
                  <td className={cn(td, "text-ink-700")}>{r.basis}</td>
                  <td className={td}>
                    {!ok ? (
                      <Tag tone="neutral">Not in your role</Tag>
                    ) : !detail ? (
                      <Tag tone="outline">Aggregate only</Tag>
                    ) : (
                      <Tag tone="healthy">Available</Tag>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ automation and AI (section 9) */

const sevTone: Record<InsightDto["severity"], TagTone> = {
  Info: "available",
  Review: "watch",
  "Urgent Operational": "over",
};
const insightTone: Record<InsightDto["status"], TagTone> = {
  New: "available",
  Reviewed: "watch",
  Acknowledged: "healthy",
  Dismissed: "neutral",
};

export function AutomationTab({ c }: { c: Ctx }) {
  const has = (d: Domain) => c.hub.scope.domains.includes(d);
  return (
    <div className="flex flex-col gap-4">
      {has("Automation") && (
        <KpiGrid>
          <Kpi r={c.run("ai-accepted")} />
          <Kpi r={c.run("tasks-overdue")} />
          <article className="rounded-card border border-border bg-surface p-4">
            <h3 className="text-small font-semibold text-ink-900">AI suggestions by decision</h3>
            <dl className="mt-2 grid grid-cols-2 gap-1 text-caption">
              {(["Accepted", "Rejected", "Deferred", "Pending"] as const).map((d) => (
                <div key={d} className="flex justify-between gap-2">
                  <dt className="text-ink-500">{d}</dt>
                  <dd className="font-semibold text-ink-900">
                    {c.facts.suggestions.filter((s) => s.decision === d).length}
                  </dd>
                </div>
              ))}
            </dl>
          </article>
          <article className="rounded-card border border-border bg-surface p-4">
            <h3 className="text-small font-semibold text-ink-900">Estimated time saved</h3>
            <p className="mt-2 type-display text-h2 text-ink-900">
              {Math.round(
                c.facts.suggestions
                  .filter((s) => s.decision === "Accepted")
                  .reduce((n, s) => n + s.minutesSaved, 0) / 6,
              ) / 10}
            </p>
            <p className="mt-1 text-caption text-ink-500">
              hours · estimate from accepted suggestions, not measured
            </p>
          </article>
        </KpiGrid>
      )}
      <Card
        title={
          <span className="flex items-center gap-2">
            Insights <RuleMark>Rule raised</RuleMark>
          </span>
        }
        sub="Configured rules raise these; a person reviews each one. Nothing is changed automatically."
        icon={Lightbulb}
        flush
      >
        {c.hub.insights.length ? (
          <ul className="divide-y divide-border">
            {c.hub.insights.map((i) => (
              <InsightRow key={i.id} i={i} c={c} />
            ))}
          </ul>
        ) : (
          <p className="p-4 text-small text-ink-500">
            No rule is above its threshold for your areas right now.
          </p>
        )}
      </Card>
      {c.hub.scope.label !== "Therapist (own caseload)" && <SettingsCard c={c} />}
      {has("Automation") && <ReportTable c={c} id="R18" />}
      {has("Automation") && <ReportTable c={c} id="R19" />}
      {has("Audit") && <ReportTable c={c} id="R20" />}
    </div>
  );
}

function InsightRow({ i, c }: { i: InsightDto; c: Ctx }) {
  const [why, setWhy] = useState(false);
  const [busy, setBusy] = useState("");
  const [dismiss, setDismiss] = useState(false);
  const [reason, setReason] = useState("");
  const url = `/api/care/reports/insights/${encodeURIComponent(i.id)}`;
  const run = async (type: string, ok: string, extra: Record<string, unknown> = {}) => {
    setBusy(type);
    await act(url, { type, ...extra }, ok, c.reload);
    setBusy("");
  };
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-small font-semibold text-ink-900">
            {i.title} <Tag tone={sevTone[i.severity]}>{i.severity}</Tag>{" "}
            <Tag tone={insightTone[i.status]}>{i.status}</Tag>
          </p>
          <p className="mt-0.5 text-caption text-ink-500">
            <span className="font-mono">{i.id}</span> · {i.category} · {i.period} · owner {i.owner}{" "}
            · {i.evidenceCount} records
            {i.taskRef && (
              <>
                {" · "}
                <Link
                  href={i.taskHref ?? "#"}
                  className="font-semibold text-accent hover:underline"
                >
                  {i.taskRef}
                </Link>
              </>
            )}
          </p>
          <p className="mt-1 text-small text-ink-700">{i.suggestion}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setWhy((w) => !w)} aria-expanded={why}>
            Why am I seeing this?
          </Button>
          {i.status === "New" && (
            <Button
              size="sm"
              variant="secondary"
              disabled={!!busy}
              onClick={() => run("review", "Marked reviewed")}
            >
              Mark reviewed
            </Button>
          )}
          {i.status !== "Acknowledged" && i.status !== "Dismissed" && (
            <Button
              size="sm"
              variant="secondary"
              disabled={!!busy}
              onClick={() => run("acknowledge", "Acknowledged")}
            >
              Acknowledge
            </Button>
          )}
          {!i.taskRef && (
            <Button
              size="sm"
              variant="soft"
              disabled={!!busy}
              onClick={() => run("task", "Task created in the work queue")}
            >
              <Send className="size-3.5" aria-hidden="true" /> Create task
            </Button>
          )}
          {i.status !== "Dismissed" && (
            <Button size="sm" variant="danger" onClick={() => setDismiss(true)}>
              Dismiss
            </Button>
          )}
        </div>
      </div>
      {why && (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="rounded-control bg-sunken p-3 text-caption text-ink-700">
            <p className="label-caps text-ink-500">Inputs</p>
            <ul className="mt-1">
              {i.evidence.map((e) => (
                <li key={e.label} className="flex justify-between gap-2">
                  <span>{e.label}</span> <b className="font-semibold text-ink-900">{e.value}</b>
                </li>
              ))}
            </ul>
            <p className="mt-2">
              <b className="font-semibold">Rule:</b> {i.rule} ·{" "}
              <b className="font-semibold">Threshold:</b> {i.threshold}
            </p>
            <p className="mt-1">
              <b className="font-semibold">Period:</b> {i.period} ·{" "}
              <b className="font-semibold">Source:</b> {i.source} · generated {when(i.generatedAt)}
            </p>
            {i.smallSample && (
              <p className="mt-2 font-semibold text-watch">
                Small sample: fewer than 5 records. Read with care.
              </p>
            )}
            <p className="mt-2">
              <Link href={i.href} className="font-semibold text-accent hover:underline">
                Open the underlying report
              </Link>
            </p>
            {i.history.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer font-semibold">
                  Audit trail ({i.history.length})
                </summary>
                <ul className="mt-1">
                  {i.history.map((h, n) => (
                    <li key={n}>
                      {when(h.at)} · {h.by}: {h.action}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          <AiDraft
            label="AI explanation"
            suggestionsOnly
            generating={busy === "explain"}
            meta={i.ai ? `Drafted ${when(i.ai.at)} for ${i.ai.by} · needs review` : undefined}
          >
            {i.ai ? (
              <p className="text-small text-ink-900">{i.ai.text}</p>
            ) : (
              <div className="flex flex-col items-start gap-2">
                <p className="text-caption text-ink-700">
                  AI can write a plain-English summary of these figures. It uses only the inputs on
                  the left; any number that doesn&apos;t match is rejected.
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!!busy}
                  onClick={() => run("explain", "AI explanation drafted")}
                >
                  Draft explanation with AI
                </Button>
              </div>
            )}
          </AiDraft>
        </div>
      )}
      {dismiss && (
        <Sheet
          title="Dismiss insight"
          description="It stays dismissed until new evidence arrives. The reason is kept in its audit trail."
          onClose={() => setDismiss(false)}
          footer={
            <Button
              variant="soft-danger"
              disabled={reason.trim().length < 3}
              onClick={async () => {
                await run("dismiss", "Insight dismissed", { reason });
                setDismiss(false);
              }}
            >
              Dismiss insight
            </Button>
          }
        >
          <Field label="Reason">
            <textarea
              className={cn(inputClass, "h-24 py-2")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </Sheet>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ schedules (section 7) */

const scheduleTone: Record<ScheduleDto["status"], TagTone> = {
  Draft: "neutral",
  Active: "healthy",
  Paused: "watch",
  Failed: "over",
  Archived: "outline",
};
const runTone = (o: string): TagTone =>
  o === "Delivered" ? "healthy" : o === "Failed" ? "over" : "watch";
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function SchedulesTab({ c }: { c: Ctx }) {
  const [edit, setEdit] = useState<ScheduleDto | "new" | null>(null);
  const can = c.hub.scope.schedule;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-4 text-small text-ink-700">
        <CalendarClock className="size-5 text-accent" aria-hidden="true" />
        <p className="min-w-0 flex-1">
          Schedules run in <b className="font-semibold">Australia/Brisbane time (AEST, UTC+10)</b>.
          Brisbane has no daylight saving, so a 7:00 am run stays 7:00 am all year; recipients in
          Sydney or Melbourne see it at 8:00 am from October to April. Each run re-checks every
          recipient&apos;s access that day.
        </p>
        {can ? (
          <Button variant="primary" onClick={() => setEdit("new")}>
            New schedule
          </Button>
        ) : (
          <span className="text-caption text-ink-500">
            Your role can export reports but not schedule them.
          </span>
        )}
      </div>
      {!c.hub.schedules.length ? (
        <NA>No scheduled reports yet.</NA>
      ) : (
        c.hub.schedules.map((s) => (
          <ScheduleCard key={s.id} s={s} c={c} onEdit={() => setEdit(s)} />
        ))
      )}
      {edit && (
        <ScheduleSheet c={c} s={edit === "new" ? null : edit} onClose={() => setEdit(null)} />
      )}
    </div>
  );
}

function ScheduleCard({ s, c, onEdit }: { s: ScheduleDto; c: Ctx; onEdit: () => void }) {
  const url = `/api/care/reports/schedules/${s.id}`;
  const def = reportById.get(s.reportId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const plan =
    s.frequency === "Weekly"
      ? `Weekly on ${weekdays[(s.weekday ?? 1) - 1]}`
      : s.frequency === "Monthly"
        ? `Monthly on ${s.monthDay === "Last business day" ? "the last business day" : `day ${s.monthDay}`}`
        : s.frequency === "One-time"
          ? `Once on ${s.oneTimeDate}`
          : "Daily";
  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          {s.name} <Tag tone={scheduleTone[s.status]}>{s.status}</Tag>
        </span>
      }
      sub={
        <>
          <span className="font-mono">{s.ref}</span> · {def ? `${def.id} ${def.title}` : s.reportId}{" "}
          · {plan} at {s.time} AEST · {s.preset} · {s.format}, {s.contents.toLowerCase()} ·{" "}
          {s.delivery} · owner {s.owner}
        </>
      }
      icon={CalendarClock}
      action={
        s.mine && (
          <div className="flex flex-wrap gap-1.5">
            {s.status === "Draft" && (
              <Button
                size="sm"
                variant="soft"
                onClick={() => act(url, { type: "activate" }, "Schedule active", c.reload)}
              >
                <Play className="size-3.5" aria-hidden="true" /> Activate
              </Button>
            )}
            {s.status === "Active" && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => act(url, { type: "pause" }, "Paused: no further runs", c.reload)}
              >
                <Pause className="size-3.5" aria-hidden="true" /> Pause
              </Button>
            )}
            {s.status === "Paused" && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => act(url, { type: "resume" }, "Resumed", c.reload)}
              >
                <Play className="size-3.5" aria-hidden="true" /> Resume
              </Button>
            )}
            {s.status === "Failed" && (
              <Button
                size="sm"
                variant="soft"
                onClick={() => act(url, { type: "retry" }, "Retried", c.reload)}
              >
                <RotateCcw className="size-3.5" aria-hidden="true" /> Retry
              </Button>
            )}
            {(s.status === "Active" || s.status === "Draft") && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => act(url, { type: "run" }, "Run finished", c.reload)}
              >
                Run now
              </Button>
            )}
            {s.status !== "Archived" && (
              <Button size="sm" variant="ghost" onClick={onEdit}>
                <Pencil className="size-3.5" aria-hidden="true" /> Edit
              </Button>
            )}
            {s.status !== "Archived" && s.status !== "Active" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => act(url, { type: "archive" }, "Archived", c.reload)}
              >
                <Archive className="size-3.5" aria-hidden="true" /> Archive
              </Button>
            )}
            {s.status !== "Active" && (
              <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-3.5" aria-hidden="true" /> Delete
              </Button>
            )}
          </div>
        )
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="text-small">
          <p className="label-caps text-ink-500">Recipients</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {s.recipients.map((r) => (
              <li key={r.kind + r.id}>
                <Tag tone="outline">{r.kind === "group" ? `Group: ${r.name}` : r.name}</Tag>
              </li>
            ))}
          </ul>
          <p className="mt-3 label-caps text-ink-500">Next run</p>
          <p className="mt-1 text-ink-900">
            {s.status === "Active"
              ? when(s.nextRun)
              : s.status === "Paused"
                ? "Paused: no further runs"
                : "Not scheduled"}
          </p>
        </div>
        <div>
          <p className="label-caps text-ink-500">Run history</p>
          {s.runs.length ? (
            <ul className="mt-1 divide-y divide-border">
              {s.runs.slice(0, 5).map((r) => (
                <li key={r.id} className="flex flex-wrap items-start gap-2 py-2 text-caption">
                  <Tag tone={runTone(r.outcome)}>{r.outcome}</Tag>
                  <span className="text-ink-500">
                    {when(r.at)} · attempt {r.attempt}
                  </span>
                  <span className="w-full text-ink-500">
                    {r.steps.map((x) => `${x.state} ${when(x.at).split(", ").pop()}`).join(" → ")}
                  </span>
                  <span className="w-full text-ink-700">{r.detail}</span>
                  {r.delivered.length > 0 && (
                    <span className="w-full text-ink-500">
                      Delivered to {r.delivered.join(", ")}
                    </span>
                  )}
                  {r.excluded.length > 0 && (
                    <span className="w-full text-watch">Excluded: {r.excluded.join("; ")}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-caption text-ink-500">Not run yet.</p>
          )}
        </div>
      </div>
      {confirmDelete && (
        <Sheet
          title="Delete schedule"
          description="This removes the schedule. Reports it already generated stay in export history."
          onClose={() => setConfirmDelete(false)}
          footer={
            <Button
              variant="soft-danger"
              onClick={async () => {
                await act(url, { type: "delete" }, "Schedule deleted", c.reload);
                setConfirmDelete(false);
              }}
            >
              Delete schedule
            </Button>
          }
        >
          <p className="text-small text-ink-700">Delete {s.name}?</p>
        </Sheet>
      )}
    </Card>
  );
}

function ScheduleSheet({ c, s, onClose }: { c: Ctx; s: ScheduleDto | null; onClose: () => void }) {
  const allowed = reports.filter((r) => c.hub.scope.domains.includes(r.domain));
  const [v, setV] = useState<ScheduleInput>({
    id: s?.id,
    name: s?.name ?? "",
    reportId: s?.reportId ?? allowed[0]?.id ?? "R01",
    preset: (s?.preset as ScheduleInput["preset"]) ?? "Last 7 Days",
    filters: s?.filters ?? {},
    frequency: (s?.frequency as ScheduleInput["frequency"]) ?? "Weekly",
    weekday: s?.weekday ?? 1,
    monthDay: s?.monthDay ?? 1,
    oneTimeDate: s?.oneTimeDate ?? c.hub.today,
    time: s?.time ?? "07:00",
    recipients: s?.recipients.map((r) => ({ kind: r.kind as "self", id: r.id, name: r.name })) ?? [
      { kind: "self", id: c.hub.me.id, name: c.hub.me.name },
    ],
    delivery: (s?.delivery as ScheduleInput["delivery"]) ?? "In-app",
    format: s?.format ?? "PDF summary",
    contents: s?.contents ?? "Summary only",
    activate: false,
  });
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const def = reportById.get(v.reportId);
  const p = (x: Partial<ScheduleInput>) => setV((cur) => ({ ...cur, ...x }));
  const save = async (activate: boolean) => {
    setError("");
    try {
      await api("/api/care/reports", { body: { type: "schedule", schedule: { ...v, activate } } });
      toast(activate ? "Schedule active" : "Schedule saved as draft", { tone: "success" });
      c.reload();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    }
  };
  const recipientPeople = c.hub.people.filter((x) => x.id !== c.hub.me.id);
  return (
    <Sheet
      title={s ? `Edit ${s.ref}` : "New scheduled report"}
      description="Recipients only receive what they're entitled to at the time of each run."
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => save(false)}>
            Save draft
          </Button>
          <Button variant="primary" onClick={() => save(true)}>
            Save and activate
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <p
            role="alert"
            className="rounded-control border border-over bg-over-bg p-3 text-small text-over"
          >
            {error}
          </p>
        )}
        <Field label="Schedule name">
          <input
            className={inputClass}
            value={v.name}
            onChange={(e) => p({ name: e.target.value })}
          />
        </Field>
        <Field label="Report">
          <Select value={v.reportId} onChange={(e) => p({ reportId: e.target.value })}>
            {allowed.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} {r.title}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date range (re-evaluated each run)">
            <Select
              value={v.preset}
              onChange={(e) => p({ preset: e.target.value as ScheduleInput["preset"] })}
            >
              {datePresets
                .filter((x) => x !== "Custom")
                .map((x) => (
                  <option key={x}>{x}</option>
                ))}
            </Select>
          </Field>
          <Field label="Frequency">
            <Select
              value={v.frequency}
              onChange={(e) => p({ frequency: e.target.value as ScheduleInput["frequency"] })}
            >
              {frequencies.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
          </Field>
          {v.frequency === "Weekly" && (
            <Field label="Day">
              <Select
                value={String(v.weekday ?? 1)}
                onChange={(e) => p({ weekday: Number(e.target.value) })}
              >
                {weekdays.map((d, i) => (
                  <option key={d} value={String(i + 1)}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {v.frequency === "Monthly" && (
            <Field label="Day of month" hint="1 to 28, or the last business day">
              <Select
                value={String(v.monthDay ?? 1)}
                onChange={(e) =>
                  p({
                    monthDay:
                      e.target.value === "Last business day"
                        ? "Last business day"
                        : Number(e.target.value),
                  })
                }
              >
                {[...Array.from({ length: 28 }, (_, i) => String(i + 1)), "Last business day"].map(
                  (d) => (
                    <option key={d}>{d}</option>
                  ),
                )}
              </Select>
            </Field>
          )}
          {v.frequency === "One-time" && (
            <Field label="Date">
              <input
                type="date"
                className={inputClass}
                value={v.oneTimeDate ?? ""}
                onChange={(e) => p({ oneTimeDate: e.target.value })}
              />
            </Field>
          )}
          <Field label="Time (HH:MM)" hint="Australia/Brisbane, AEST">
            <input
              className={inputClass}
              value={v.time}
              onChange={(e) => p({ time: e.target.value })}
              placeholder="07:00"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Format">
            <Select
              value={v.format}
              onChange={(e) => p({ format: e.target.value as ScheduleInput["format"] })}
            >
              {exportFormats.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
          </Field>
          <Field label="Contents">
            <Select
              value={v.contents}
              onChange={(e) => p({ contents: e.target.value as ScheduleInput["contents"] })}
            >
              {exportContents
                .filter((x) =>
                  x === "Permitted detail rows"
                    ? def?.detail && c.hub.scope.detail.includes(def.domain)
                    : x === "Aggregate with chart data"
                      ? !def?.detail
                      : true,
                )
                .map((x) => (
                  <option key={x}>{x}</option>
                ))}
            </Select>
          </Field>
          <Field label="Delivery">
            <Select
              value={v.delivery}
              onChange={(e) => p({ delivery: e.target.value as ScheduleInput["delivery"] })}
            >
              <option value="In-app">In-app notification</option>
              <option value="Email link">Email with secure link</option>
            </Select>
          </Field>
        </div>
        {v.delivery === "Email link" && (
          <p className="text-caption text-ink-500">
            Emails carry a secure link only, never the file. The link checks the person&apos;s
            rights when it opens.
          </p>
        )}
        <Field label="Recipients">
          <ul className="flex flex-wrap gap-1.5">
            {v.recipients.map((r, i) => (
              <li key={r.kind + r.id}>
                <button
                  type="button"
                  onClick={() => p({ recipients: v.recipients.filter((_, n) => n !== i) })}
                  className="cursor-pointer"
                  aria-label={`Remove ${r.name}`}
                >
                  <Tag tone="outline">{r.kind === "group" ? `Group: ${r.name}` : r.name} ×</Tag>
                </button>
              </li>
            ))}
          </ul>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Add an internal user">
            <Select
              value=""
              onChange={(e) => {
                const x = recipientPeople.find((y) => y.id === e.target.value);
                if (x && !v.recipients.some((r) => r.id === x.id))
                  p({ recipients: [...v.recipients, { kind: "user", id: x.id, name: x.name }] });
              }}
            >
              <option value="">Choose…</option>
              {recipientPeople.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} · {x.scopeLabel}
                  {def && !x.domains.includes(def.domain) ? " (no access: will be excluded)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Add a distribution group">
            <Select
              value=""
              onChange={(e) => {
                const g = distributionGroups.find((x) => x.id === e.target.value);
                if (g && !v.recipients.some((r) => r.id === g.id))
                  p({ recipients: [...v.recipients, { kind: "group", id: g.id, name: g.name }] });
              }}
            >
              <option value="">Choose…</option>
              {distributionGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field
          label="Or add by email"
          hint="Only approved internal users. External addresses are rejected."
        >
          <div className="flex gap-2">
            <input
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@medisense.test"
            />
            <Button
              variant="secondary"
              onClick={() => {
                if (email.trim()) {
                  p({
                    recipients: [
                      ...v.recipients,
                      { kind: "email", id: email.trim(), name: email.trim() },
                    ],
                  });
                  setEmail("");
                }
              }}
            >
              Add
            </Button>
          </div>
        </Field>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ export and audit history */

const exportTone = (s: string): TagTone =>
  s === "Ready" ? "healthy" : s === "Revoked" ? "over" : s === "Expired" ? "neutral" : "watch";

export function ExportsTab({ c }: { c: Ctx }) {
  const [revoke, setRevoke] = useState<ExportDto | null>(null);
  const [reason, setReason] = useState("");
  const downloads = useMemo(
    () =>
      c.hub.exports
        .flatMap((e) => e.downloads.map((d) => ({ ...d, ref: e.ref })))
        .sort((a, b) => b.at.localeCompare(a.at)),
    [c.hub.exports],
  );
  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Export history"
        sub="Snapshots: they keep their generated time and never change when records do"
        icon={FileClock}
        flush
      >
        {!c.hub.exports.length ? (
          <p className="p-4 text-small text-ink-500">No exports yet. Use Export on any report.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-sunken">
                <tr>
                  {[
                    "Export",
                    "Report",
                    "Owner",
                    "Generated",
                    "Filters",
                    "Format",
                    "Status",
                    "Downloads",
                    "",
                  ].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.hub.exports.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className={cn(td, "font-mono text-caption")}>{e.ref}</td>
                    <td className={td}>
                      <span className="font-semibold">{e.title}</span>
                      <span className="block text-caption text-ink-500">
                        {e.contents} · {e.rowCount} rows{e.scheduled ? " · scheduled" : ""}
                      </span>
                    </td>
                    <td className={td}>{e.owner}</td>
                    <td className={td}>{when(e.generatedAt)}</td>
                    <td className={cn(td, "max-w-[260px] text-caption text-ink-700")}>
                      {e.summary.join(" · ")}
                    </td>
                    <td className={td}>{e.format}</td>
                    <td className={td}>
                      <Tag tone={exportTone(e.status)}>{e.status}</Tag>
                      {e.revoked && (
                        <span className="mt-1 block text-caption text-ink-500">
                          by {e.revoked.by}: {e.revoked.reason}
                        </span>
                      )}
                    </td>
                    <td className={cn(td, "text-right tabular-nums")}>
                      {e.downloads.filter((d) => d.outcome === "Downloaded").length}
                    </td>
                    <td className={cn(td, "text-right")}>
                      <div className="flex justify-end gap-1.5">
                        {e.canOpen ? (
                          <a
                            href={`/api/care/reports/exports/${e.id}?format=${encodeURIComponent(e.format)}`}
                            target={e.format === "PDF summary" ? "_blank" : undefined}
                            rel="noreferrer"
                            className="inline-flex h-8 items-center gap-1 rounded-control border border-border-strong px-2.5 text-caption font-semibold text-ink-900 hover:bg-sunken"
                          >
                            <Download className="size-3.5" aria-hidden="true" /> Download
                          </a>
                        ) : (
                          <span className="text-caption text-ink-500">
                            {e.status === "Ready"
                              ? "Your access no longer covers this"
                              : "Can't be opened"}
                          </span>
                        )}
                        {e.status === "Ready" &&
                          (e.mine || c.hub.scope.share.includes("Organisation")) && (
                            <Button size="sm" variant="danger" onClick={() => setRevoke(e)}>
                              Revoke link
                            </Button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card
        title="Download audit"
        sub="Every open of an export link, including refused ones"
        icon={Workflow}
        flush
      >
        {downloads.length ? (
          <ul className="max-h-[360px] divide-y divide-border overflow-auto">
            {downloads.map((d, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 px-4 py-2 text-caption">
                <span className="font-mono text-ink-500">{d.ref}</span>
                <span className="text-ink-900">{d.by}</span>
                <span className="text-ink-500">
                  {when(d.at)} · {d.format}
                </span>
                <Tag tone={d.outcome === "Downloaded" ? "healthy" : "over"}>
                  {d.outcome === "Downloaded" ? "Downloaded" : `Refused: ${d.outcome}`}
                </Tag>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-4 text-small text-ink-500">No downloads yet.</p>
        )}
      </Card>
      {revoke && (
        <Sheet
          title={`Revoke ${revoke.ref}`}
          description="Anyone holding this link loses access straight away. The snapshot stays in history."
          onClose={() => setRevoke(null)}
          footer={
            <Button
              variant="soft-danger"
              disabled={reason.trim().length < 3}
              onClick={async () => {
                await act(
                  `/api/care/reports/exports/${revoke.id}`,
                  { reason },
                  "Link revoked",
                  c.reload,
                );
                setRevoke(null);
                setReason("");
              }}
            >
              Revoke link
            </Button>
          }
        >
          <Field label="Reason">
            <textarea
              className={cn(inputClass, "h-24 py-2")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </Sheet>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ settings and open decisions (section 15) */

const thresholdLabels: Record<string, string> = {
  referralSpike: "Referral spike: multiple of the prior 4-week average",
  referralSpikeMin: "Referral spike: minimum referrals in the week",
  capacityRatio: "Capacity warning: booked ÷ available hours above",
  documentationMin: "Documentation overdue: minimum documents",
  cancellationRate: "Cancellation trend: rate above (%)",
  cancellationMin: "Cancellation trend: minimum eligible visits",
  fundingCluster: "Funding cluster: minimum blocked allocations",
  telehealthFailure: "Telehealth issue: failure rate above (%)",
  telehealthMin: "Telehealth issue: minimum attempts",
  revenueVariance: "Collection anomaly: month-to-date variance above (%)",
  noteDueHours: "Session note due after the visit (hours)",
  reportDueDays: "Assessment report due after the request (days)",
};

function SettingsCard({ c }: { c: Ctx }) {
  const st = c.hub.settings;
  const [open, setOpen] = useState<"thresholds" | "deadlines" | null>(null);
  const [vals, setVals] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const canThresholds = c.hub.scope.share.includes("Organisation");
  const canDeadlines = c.hub.scope.clinicalDetail;
  const start = (kind: "thresholds" | "deadlines") => {
    setVals(kind === "thresholds" ? { ...st.thresholds } : { ...st.deadlines });
    setReason("");
    setError("");
    setOpen(kind);
  };
  const save = async () => {
    if (!open) return;
    setError("");
    try {
      await api("/api/care/reports", {
        body: { type: "settings", settings: { [open]: vals, reason } },
      });
      toast("Settings saved", { tone: "success", detail: "Recorded in the change history." });
      setOpen(null);
      c.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    }
  };
  const all: [string, number][] = [
    ...Object.entries(st.thresholds),
    ...Object.entries(st.deadlines),
  ];
  return (
    <Card
      title="Rules and deadlines"
      sub="Operational configuration with human review and a change history"
      icon={Workflow}
      action={
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            disabled={!canThresholds}
            onClick={() => start("thresholds")}
          >
            Edit alert thresholds
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!canDeadlines}
            onClick={() => start("deadlines")}
          >
            Edit clinical deadlines
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <dl className="grid gap-x-6 gap-y-1 text-caption sm:grid-cols-2 lg:col-span-2">
          {all.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 border-b border-border py-1">
              <dt className="text-ink-500">{thresholdLabels[k] ?? k}</dt>
              <dd className="font-semibold text-ink-900 tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <div>
          <p className="label-caps text-ink-500">Change history</p>
          {st.history.length ? (
            <ul className="mt-1 max-h-48 overflow-auto text-caption">
              {st.history.map((h, i) => (
                <li key={i} className="border-b border-border py-1">
                  <span className="text-ink-500">
                    {when(h.at)} · {h.by}
                  </span>
                  <span className="block text-ink-900">{h.what}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-caption text-ink-500">Baseline values; no changes yet.</p>
          )}
          {!canThresholds && (
            <p className="mt-2 text-caption text-ink-500">
              Thresholds are changed by a Director or Operations Manager.
            </p>
          )}
          {!canDeadlines && (
            <p className="mt-1 text-caption text-ink-500">
              Clinical deadlines are changed by clinical leadership.
            </p>
          )}
        </div>
      </div>
      {open && (
        <Sheet
          title={open === "thresholds" ? "Alert thresholds" : "Clinical deadlines"}
          description="Changes apply from the next report load and are kept in the change history."
          onClose={() => setOpen(null)}
          footer={
            <Button variant="primary" disabled={reason.trim().length < 3} onClick={save}>
              Save changes
            </Button>
          }
        >
          <div className="flex flex-col gap-3">
            {error && (
              <p
                role="alert"
                className="rounded-control border border-over bg-over-bg p-3 text-small text-over"
              >
                {error}
              </p>
            )}
            {Object.entries(vals).map(([k, v]) => (
              <Field key={k} label={thresholdLabels[k] ?? k}>
                <input
                  type="number"
                  step="any"
                  className={inputClass}
                  value={v}
                  onChange={(e) => setVals((cur) => ({ ...cur, [k]: Number(e.target.value) }))}
                />
              </Field>
            ))}
            <Field label="Reason for the change">
              <textarea
                className={cn(inputClass, "h-20 py-2")}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </div>
        </Sheet>
      )}
    </Card>
  );
}

const decisions: [string, string][] = [
  [
    "Timezone and work calendar",
    "Australia/Brisbane organisation-local dates (no daylight saving). Public holidays still to be verified.",
  ],
  [
    "Utilisation formula",
    "Delivered clinical time ÷ eligible rostered direct-care time. Leave and 15% non-clinical time are excluded; clinicians with no bookings in the period are not counted.",
  ],
  [
    "Clinical backlog deadlines",
    "Configurable rules (session notes and assessment reports), approved by clinical leadership. See Rules and deadlines.",
  ],
  [
    "Access and disclosure",
    "Psychology and trauma groups under 3 records are suppressed without clinical scope. Clinical Leads see detail within their supervisory scope.",
  ],
  [
    "Finance accounting",
    "Gross, credits and net invoiced are shown apart. Issued revenue counts on the issue date, cash on the receipt date; ageing is from the due date.",
  ],
  [
    "Report schedules",
    "Internal secured links only. Recipients are re-checked at every run; external addresses are rejected.",
  ],
  [
    "AI alert thresholds",
    "Operational configuration, edited with a reason and kept in the change history. Every insight is reviewed by a person.",
  ],
  [
    "Record retention",
    "Follows Medisense policy and applicable Australian law; no retention period is invented. Export links expire after 7 days.",
  ],
];

function Methodology({ c }: { c: Ctx }) {
  return (
    <Card
      title="Definitions and open decisions"
      sub={`Proposed baselines pending Medisense validation · viewing as ${c.hub.scope.label}`}
      icon={ListChecks}
      flush
    >
      <dl className="divide-y divide-border">
        {decisions.map(([k, v]) => (
          <div key={k} className="grid gap-1 px-4 py-2.5 text-small sm:grid-cols-[240px_1fr]">
            <dt className="font-semibold text-ink-900">{k}</dt>
            <dd className="text-ink-700">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
