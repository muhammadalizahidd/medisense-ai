"use client";

import { Lock, Search, X } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/ui/page";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { useNow, useResource } from "@/lib/live/client";
import {
  episodeStates,
  episodeTone,
  reportStates,
  reportTone,
  reportTypes,
  type EpisodeRow,
  type ReportRow,
} from "@/lib/live/progress";
import { cn } from "@/lib/cn";
import { ErrorNote, LiveBadge, Skeleton } from "./bits";
import { td, th } from "./funding-bits";
import { KpiBand, dayOnly, tableBox, tableHead } from "./ops-bits";

const tabs = [
  { id: "episodes", label: "Courses of care" },
  { id: "reports", label: "Report centre" },
  { id: "approvals", label: "Approval queue" },
] as const;

/** Module 16 screen: Progress overview, Report centre and Clinical approval queue. */
export function ProgressHub({
  base,
  embedded = false,
}: {
  base: "/therapist/progress" | "/care/progress";
  /** Inside another reports page: no page header, and its sections don't touch the address. */
  embedded?: boolean;
}) {
  const { data, error, loading, reload } = useResource<{
    episodes: EpisodeRow[];
    reports: ReportRow[];
    lead: boolean;
  }>("/api/care/progress", (e) => e.type === "care");
  const clock = useNow();
  const [urlTab, setUrlTab] = useTab(tabs);
  const [localTab, setLocalTab] = useState<(typeof tabs)[number]["id"]>("episodes");
  const [tab, setTab] = embedded ? [localTab, setLocalTab] : [urlTab, setUrlTab];
  const [state, setState] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [rstatus, setRstatus] = useState("");
  const [rtype, setRtype] = useState("");
  const [q, setQ] = useState("");
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data || clock === null) return <Skeleton className="h-[760px]" />;
  const { episodes, reports } = data;
  const disciplines = [...new Set(episodes.map((e) => e.discipline))].sort();
  const query = q.trim().toLowerCase();
  const match = (s: string) => !query || s.toLowerCase().includes(query);
  const eps = episodes
    .filter((e) => (!state || e.state === state) && (!discipline || e.discipline === discipline))
    .filter((e) => match(`${e.participant} ${e.participantId} ${e.service}`))
    .sort(
      (a, b) =>
        Number(b.reviewOverdue) - Number(a.reviewOverdue) ||
        (a.reviewDue ?? "9").localeCompare(b.reviewDue ?? "9"),
    );
  const reps = reports
    .filter(
      (r) =>
        (!rstatus || (rstatus === "Overdue" ? r.overdue : r.status === rstatus)) &&
        (!rtype || r.type === rtype),
    )
    .filter((r) => match(`${r.ref} ${r.participant} ${r.participantId} ${r.type}`));
  const approvals = reports.filter(
    (r) => r.status === "In Review" || r.status === "Changes Requested",
  );
  const open = reports.filter(
    (r) => !["Signed", "Released", "Superseded", "Withdrawn"].includes(r.status),
  );
  const goals = episodes.reduce((n, e) => n + e.goals, 0);
  const improving = episodes.reduce((n, e) => n + e.improving, 0);
  const search = (
    <label className="flex h-9 min-w-56 flex-1 items-center gap-2 rounded-control border border-border-strong bg-surface px-3 focus-within:shadow-focus">
      <Search className="size-4 text-ink-500" aria-hidden="true" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search progress"
        placeholder="Participant, MRN, service or RPT reference"
        className="min-w-0 flex-1 bg-transparent text-small outline-none placeholder:text-ink-500"
      />
      {q && (
        <button
          type="button"
          aria-label="Clear"
          onClick={() => setQ("")}
          className="cursor-pointer text-ink-500"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </label>
  );
  return (
    <>
      {!embedded && (
        <PageHeader
          eyebrow="Live care"
          title={
            base === "/therapist/progress" ? "My progress and reports" : "Progress and reports"
          }
          description="Outcomes against goals, reassessments, clinician-signed reports and discharge"
          actions={<LiveBadge />}
        />
      )}
      <KpiBand
        label="Progress figures"
        items={[
          {
            label: "Active courses of care",
            value: episodes.filter((e) =>
              ["Active Treatment", "Under Review", "Assessment Only"].includes(e.state),
            ).length,
            sub: "in treatment, review or assessment",
            onClick: () => {
              setTab("episodes");
              setState("");
            },
          },
          {
            label: "Reviews overdue",
            value: episodes.filter((e) => e.reviewOverdue).length,
            sub: "past the review date",
            tone: episodes.some((e) => e.reviewOverdue) ? "over" : undefined,
            onClick: () => setTab("episodes"),
          },
          {
            label: "Goals improving",
            value: `${improving}/${goals}`,
            sub: "from verified measures",
          },
          {
            label: "Reports due",
            value: open.length,
            sub: `${open.filter((r) => r.overdue).length} overdue`,
            tone: open.some((r) => r.overdue) ? "watch" : undefined,
            onClick: () => {
              setTab("reports");
              setRstatus("");
            },
          },
          {
            label: "Awaiting approval",
            value: approvals.filter((r) => r.status === "In Review").length,
            sub: "co-sign or review",
            onClick: () => setTab("approvals"),
          },
          {
            label: "Released",
            value: reports.filter((r) => r.status === "Released").length,
            sub: "to authorised recipients",
            onClick: () => {
              setTab("reports");
              setRstatus("Released");
            },
          },
        ]}
      />
      <div className="mt-2">
        {embedded ? (
          <div className="mb-4">
            <Segmented
              label="Clinical reports"
              value={tab}
              onChange={setTab}
              options={tabs.map((t) => ({
                id: t.id,
                label:
                  t.id === "approvals" && approvals.length
                    ? `${t.label} · ${approvals.length}`
                    : t.label,
              }))}
            />
          </div>
        ) : (
          <Tabs
            label="Progress"
            tabs={tabs.map((t) => ({
              ...t,
              count: t.id === "approvals" ? approvals.length || undefined : undefined,
            }))}
            value={tab}
            onChange={setTab}
          />
        )}
      </div>

      <TabPanel id="episodes" value={tab}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-lift">
            <div className="w-48">
              <Select
                aria-label="Course of care state"
                className="h-9"
                value={state}
                onChange={(e) => setState(e.target.value)}
              >
                <option value="">Any state</option>
                {episodeStates.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </div>
            <div className="w-52">
              <Select
                aria-label="Discipline"
                className="h-9"
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value)}
              >
                <option value="">Any discipline</option>
                {disciplines.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </div>
            {search}
          </div>
          <div className={tableBox}>
            <table className="w-full text-left text-small">
              <thead className={tableHead}>
                <tr>
                  <th className={th}>Participant</th>
                  <th className={th}>Service</th>
                  <th className={th}>Goals</th>
                  <th className={th}>Progress</th>
                  <th className={th}>Review</th>
                  <th className={th}>Latest report</th>
                  <th className={th}>Course of care</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {eps.map((e) => (
                  <tr key={e.id} className="hover:bg-canvas">
                    <td className={td}>
                      <a
                        href={`${base}/${encodeURIComponent(e.id)}`}
                        className="font-semibold text-ink-900 hover:text-accent hover:no-underline"
                      >
                        {e.participant}
                      </a>
                      <span className="flex items-center gap-1.5 font-mono text-caption text-ink-500">
                        {e.restricted && <Lock className="size-3" aria-label="Restricted" />}
                        {e.participantId}
                      </span>
                    </td>
                    <td className={td}>
                      <span className="block text-ink-900">{e.service}</span>
                      <span className="text-caption text-ink-500">{e.clinician}</span>
                    </td>
                    <td className={td}>
                      {e.goals} goal{e.goals === 1 ? "" : "s"}
                      <span className="block text-caption text-ink-500">{e.achieved} achieved</span>
                    </td>
                    <td
                      className={cn(
                        td,
                        e.progress === "Declining" ? "font-semibold text-over" : "text-ink-700",
                      )}
                    >
                      {e.progress}
                    </td>
                    <td
                      className={cn(
                        td,
                        "whitespace-nowrap",
                        e.reviewOverdue && "font-semibold text-over",
                      )}
                    >
                      {e.reviewDue
                        ? `${dayOnly(e.reviewDue)}${e.reviewOverdue ? " · overdue" : ""}`
                        : "—"}
                    </td>
                    <td className={cn(td, "text-ink-700")}>{e.reportStatus}</td>
                    <td className={td}>
                      <Tag tone={episodeTone[e.state]}>{e.state}</Tag>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2! px-1 text-caption text-ink-500">
            {eps.length} of {episodes.length} courses of care · scroll inside the table for more
          </p>
        </div>
      </TabPanel>

      <TabPanel id="reports" value={tab}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-lift">
            <div className="w-48">
              <Select
                aria-label="Report status"
                className="h-9"
                value={rstatus}
                onChange={(e) => setRstatus(e.target.value)}
              >
                <option value="">Any status</option>
                {[...reportStates, "Overdue"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </div>
            <div className="w-60">
              <Select
                aria-label="Report type"
                className="h-9"
                value={rtype}
                onChange={(e) => setRtype(e.target.value)}
              >
                <option value="">Any report type</option>
                {reportTypes.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </div>
            {search}
          </div>
          <ReportTable rows={reps} base={base} />
          <p className="mt-2! px-1 text-caption text-ink-500">
            {reps.length} of {reports.length} reports · scroll inside the table for more
          </p>
        </div>
      </TabPanel>

      <TabPanel id="approvals" value={tab}>
        <div className="flex flex-col gap-4">
          <p className="rounded-card border border-border bg-sunken px-4 py-3 text-small text-ink-700">
            {data.lead
              ? "Reports waiting for your co-signature, and reports returned to their authors. Open one to approve or request changes."
              : "Your reports with a reviewer, and any returned to you for changes."}
          </p>
          <ReportTable rows={approvals} base={base} />
        </div>
      </TabPanel>
    </>
  );
}

function ReportTable({ rows, base }: { rows: ReportRow[]; base: string }) {
  return (
    <div className={tableBox}>
      <table className="w-full text-left text-small">
        <thead className={tableHead}>
          <tr>
            <th className={th}>Report</th>
            <th className={th}>Participant</th>
            <th className={th}>Author</th>
            <th className={th}>Purpose</th>
            <th className={th}>Due</th>
            <th className={th}>Checks</th>
            <th className={th}>Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-canvas">
              <td className={td}>
                <a
                  href={`${base}/reports/${r.id}`}
                  className="font-semibold text-ink-900 hover:text-accent hover:no-underline"
                >
                  {r.type}
                </a>
                <span className="flex items-center gap-1.5 font-mono text-caption text-ink-500">
                  {r.restricted && <Lock className="size-3" aria-label="Restricted" />}
                  {r.ref}
                  {r.version > 1 ? ` · v${r.version}` : ""}
                </span>
              </td>
              <td className={td}>
                <span className="block text-ink-900">{r.participant}</span>
                <span className="font-mono text-caption text-ink-500">{r.participantId}</span>
              </td>
              <td className={td}>
                <span className="block">{r.author}</span>
                <span className="text-caption text-ink-500">{r.discipline}</span>
              </td>
              <td className={cn(td, "text-ink-700")}>{r.purpose}</td>
              <td className={cn(td, "whitespace-nowrap", r.overdue && "font-semibold text-over")}>
                {dayOnly(r.dueAt)}
                {r.overdue ? " · overdue" : ""}
              </td>
              <td className={td}>
                {r.gaps ? (
                  <Tag tone="watch">{r.gaps} to check</Tag>
                ) : (
                  <span className="text-ink-500">—</span>
                )}
              </td>
              <td className={td}>
                <Tag tone={reportTone[r.status]}>{r.status}</Tag>
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={7} className="px-5 py-12 text-center text-small text-ink-500">
                No reports here.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
