"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/ui/page";
import { SearchField } from "@/components/ui/search-field";
import { Select } from "@/components/ui/select";
import { Tag } from "@/components/ui/tag";
import { useResource } from "@/lib/live/client";
import { cn } from "@/lib/cn";
import { ErrorNote, LiveBadge, Skeleton } from "./bits";
import { td, th } from "./reports-bits";

type Choice = {
  id: string;
  name: string;
  discipline: string;
  region: string;
  active: boolean;
  patients: number;
  sessions: number;
};

/** Choose a therapist to open their reports. The figures are for finding someone, not for ranking. */
export function TherapistPicker() {
  const { data, error, loading, reload } = useResource<{ therapists: Choice[] }>(
    "/api/care/reports/therapists",
    (e) => e.type === "care",
  );
  const [q, setQ] = useState("");
  const [discipline, setDiscipline] = useState("");
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-96" />;
  const all = data.therapists;
  const disciplines = [...new Set(all.map((t) => t.discipline))].sort();
  const shown = all.filter(
    (t) =>
      (!discipline || t.discipline === discipline) &&
      (!q.trim() ||
        `${t.name} ${t.discipline} ${t.region}`.toLowerCase().includes(q.trim().toLowerCase())),
  );
  return (
    <>
      <PageHeader
        eyebrow="Reports"
        title="Therapist reports"
        description="Choose a therapist to see their caseload, sessions, notes and progress. Opening someone's reports is recorded."
        actions={<LiveBadge />}
      />
      <div className="flex flex-wrap items-center gap-3">
        <SearchField
          label="Search therapists"
          placeholder="Search by name, discipline or region"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full sm:w-80"
        />
        <div className="w-52">
          <Select
            aria-label="Discipline"
            className="h-9"
            value={discipline}
            onChange={(e) => setDiscipline(e.target.value)}
          >
            <option value="">All disciplines</option>
            {disciplines.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </Select>
        </div>
        <p className="ml-auto text-caption text-ink-500">
          {shown.length} of {all.length} therapists
        </p>
      </div>
      <section className="mt-4 overflow-hidden rounded-card border border-border bg-surface">
        {shown.length ? (
          <div className="overflow-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead className="bg-sunken">
                <tr>
                  <th className={th}>Therapist</th>
                  <th className={th}>Discipline</th>
                  <th className={th}>Region</th>
                  <th className={cn(th, "text-right")}>Patients</th>
                  <th className={cn(th, "text-right")}>Sessions delivered</th>
                  <th className={th}>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <tr key={t.id} className="border-t border-border hover:bg-sunken">
                    <td className={td}>
                      <Link
                        href={`/care/reports/therapists/${t.id}`}
                        className="font-semibold text-accent hover:underline"
                      >
                        {t.name}
                      </Link>
                      {!t.active && (
                        <span className="ml-2 align-middle">
                          <Tag tone="neutral">Inactive</Tag>
                        </span>
                      )}
                    </td>
                    <td className={td}>{t.discipline}</td>
                    <td className={td}>{t.region}</td>
                    <td className={cn(td, "text-right tabular-nums")}>{t.patients}</td>
                    <td className={cn(td, "text-right tabular-nums")}>{t.sessions}</td>
                    <td className={cn(td, "w-10 text-right")}>
                      <ChevronRight className="inline size-4 text-ink-500" aria-hidden="true" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-10 text-center text-small text-ink-700">
            No therapists match. Clear the search or choose another discipline.
          </p>
        )}
      </section>
    </>
  );
}
