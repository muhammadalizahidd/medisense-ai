"use client";

import { Lock, Search, X } from "lucide-react";
import { useState } from "react";
import { BarList } from "@/components/charts/bar-list";
import { colour } from "@/components/charts/chart-kit";
import { DonutChart } from "@/components/charts/donut-chart";
import { PageHeader } from "@/components/ui/page";
import { Select } from "@/components/ui/select";
import { Tag } from "@/components/ui/tag";
import { useNow, useResource } from "@/lib/live/client";
import { modes, statuses, statusTone, type AssessRow } from "@/lib/live/assess";
import { cn } from "@/lib/cn";
import { ErrorNote, LiveBadge, Skeleton } from "./bits";
import { FCard, th, td } from "./funding-bits";
import { KpiBand, dayOnly, tableBox, tableHead } from "./ops-bits";

const statusColour: Record<string, string> = {
  Requested: colour.stone,
  Ready: colour.series4,
  "In Progress": colour.series1,
  Paused: colour.watch,
  "Pending Review": colour.series2,
  "Pending Signature": colour.series3,
  Finalised: colour.healthy,
  Amended: colour.healthy,
  Cancelled: colour.sand,
};

/** Module 12: the assessment queue. Therapists see their own; leads and admin see status. */
export function AssessQueue({ base }: { base: "/therapist/assessments" | "/care/assessments" }) {
  const { data, error, loading, reload } = useResource<{ rows: AssessRow[] }>(
    "/api/care/assessments",
    (e) => e.type === "care",
  );
  const now = useNow() ?? 0;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [mode, setMode] = useState("");
  const [clinician, setClinician] = useState("");
  const [sort, setSort] = useState<"due" | "updated" | "progress">("due");
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-[640px]" />;
  const all = data.rows;
  const disciplines = [...new Set(all.map((r) => r.discipline))].sort();
  const clinicians = [...new Set(all.map((r) => r.clinician))].sort();
  const query = q.trim().toLowerCase();
  const rows = all
    .filter(
      (r) =>
        (!status || r.status === status) &&
        (!discipline || r.discipline === discipline) &&
        (!mode || r.mode === mode) &&
        (!clinician || r.clinician === clinician),
    )
    .filter(
      (r) =>
        !query ||
        `${r.ref} ${r.participant} ${r.participantId} ${r.support}`.toLowerCase().includes(query),
    )
    .sort((a, b) =>
      sort === "due"
        ? (a.due ?? "9").localeCompare(b.due ?? "9")
        : sort === "updated"
          ? b.updatedAt.localeCompare(a.updatedAt)
          : a.progress - b.progress,
    );
  const open = all.filter((r) => !["Finalised", "Amended", "Cancelled"].includes(r.status));
  const counts = statuses
    .map((s) => ({
      id: s,
      label: s,
      value: all.filter((r) => r.status === s).length,
      colour: statusColour[s] ?? colour.stone,
    }))
    .filter((s) => s.value);
  const byDiscipline = disciplines.map((d) => ({
    id: d,
    label: d,
    value: open.filter((r) => r.discipline === d).length,
    colour: colour.series1,
  }));
  return (
    <>
      <PageHeader
        eyebrow="Live care"
        title="Assessments"
        description="Every assessment episode, from request to signed report"
        actions={<LiveBadge />}
      />
      <KpiBand
        label="Assessment figures"
        items={[
          {
            label: "Open",
            value: open.length,
            sub: "requested to pending signature",
            onClick: () => setStatus(""),
          },
          {
            label: "In progress",
            value: all.filter((r) => r.status === "In Progress").length,
            sub: "capturing findings",
            onClick: () => setStatus("In Progress"),
          },
          {
            label: "Paused",
            value: all.filter((r) => r.status === "Paused").length,
            sub: "continuation needed",
            tone: "watch",
            onClick: () => setStatus("Paused"),
          },
          {
            label: "To sign",
            value: all.filter((r) => r.status === "Pending Signature").length,
            sub: "ready for signature",
            onClick: () => setStatus("Pending Signature"),
          },
          {
            label: "Co-sign review",
            value: all.filter((r) => r.status === "Pending Review").length,
            sub: "Clinical Lead",
            tone: "watch",
            onClick: () => setStatus("Pending Review"),
          },
          {
            label: "Due this week",
            value: open.filter((r) => r.due && now && Date.parse(r.due) - now < 7 * 86_400_000)
              .length,
            sub: "by review date",
            onClick: () => setSort("due"),
          },
        ]}
      />
      <div className="grid items-stretch gap-6 xl:grid-cols-12">
        <FCard
          icon={Search}
          title="Status mix"
          sub="All assessments you can see"
          className="xl:col-span-5"
        >
          <DonutChart
            label="Assessments by status"
            stacked
            size={150}
            slices={counts}
            centre={all.length}
            centreCaption="assessments"
            selected={status || null}
            onSelect={(id) => setStatus(id ?? "")}
          />
        </FCard>
        <FCard
          icon={Search}
          title="Open by discipline"
          sub="Click a bar to filter"
          className="xl:col-span-7"
        >
          <BarList
            label="Open assessments by discipline"
            data={byDiscipline}
            labelWidth={170}
            selected={discipline || null}
            onSelect={(id) => setDiscipline(id ?? "")}
          />
        </FCard>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-lift">
        <div className="w-48">
          <Select
            aria-label="Status"
            className="h-9"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
        <div className="w-48">
          <Select
            aria-label="Discipline"
            className="h-9"
            value={discipline}
            onChange={(e) => setDiscipline(e.target.value)}
          >
            <option value="">All disciplines</option>
            {disciplines.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select
            aria-label="Location"
            className="h-9"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="">Any location</option>
            {modes.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
        {clinicians.length > 1 && (
          <div className="w-48">
            <Select
              aria-label="Clinician"
              className="h-9"
              value={clinician}
              onChange={(e) => setClinician(e.target.value)}
            >
              <option value="">All clinicians</option>
              {clinicians.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </div>
        )}
        <div className="w-40">
          <Select
            aria-label="Sort"
            className="h-9"
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
          >
            <option value="due">Due soonest</option>
            <option value="updated">Recently updated</option>
            <option value="progress">Least complete</option>
          </Select>
        </div>
        <label className="flex h-9 min-w-56 flex-1 items-center gap-2 rounded-control border border-border-strong bg-surface px-3 focus-within:shadow-focus">
          <Search className="size-4 text-ink-500" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search assessments"
            placeholder="ASM reference, case code, participant or MRN"
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
      </div>
      <div className={tableBox}>
        <table className="w-full text-left text-small">
          <thead className={tableHead}>
            <tr>
              <th className={th}>Assessment</th>
              <th className={th}>Participant</th>
              <th className={th}>Clinician</th>
              <th className={th}>Purpose · location</th>
              <th className={th}>Progress</th>
              <th className={th}>Due</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-canvas">
                <td className={td}>
                  <a
                    href={`${base}/${r.id}`}
                    className="font-semibold text-ink-900 hover:text-accent hover:no-underline"
                  >
                    {r.support}
                  </a>
                  <span className="flex items-center gap-1.5 font-mono text-caption text-ink-500">
                    {r.restricted && <Lock className="size-3" aria-label="Restricted discipline" />}
                    {r.ref}
                  </span>
                </td>
                <td className={td}>
                  <span className="block text-ink-900">{r.participant}</span>
                  <span className="font-mono text-caption text-ink-500">{r.participantId}</span>
                </td>
                <td className={td}>
                  <span className="block text-ink-900">{r.clinician}</span>
                  <span className="text-caption text-ink-500">{r.discipline}</span>
                </td>
                <td className={td}>
                  {r.purpose}
                  <span className="block text-caption text-ink-500">
                    {r.mode} · {r.visits} visit{r.visits === 1 ? "" : "s"}
                  </span>
                </td>
                <td className={cn(td, "w-40")}>
                  <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
                    <div
                      className="h-full rounded-full bg-accent-fill"
                      style={{ width: `${r.progress}%` }}
                    />
                  </div>
                  <span className="text-caption text-ink-500">{r.progress}% of sections</span>
                </td>
                <td className={cn(td, "whitespace-nowrap")}>{r.due ? dayOnly(r.due) : "—"}</td>
                <td className={td}>
                  <Tag tone={statusTone[r.status]}>{r.status}</Tag>
                  {r.outcome && (
                    <span className="mt-1 block text-caption text-ink-500">{r.outcome}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2! px-1 text-caption text-ink-500">
        {rows.length} of {all.length} assessments · scroll inside the table for more
      </p>
    </>
  );
}
