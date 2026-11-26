"use client";

import { Lock, Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Select } from "@/components/ui/select";
import { Tag } from "@/components/ui/tag";
import { useResource, useSession } from "@/lib/live/client";
import { planStates, stateTone, type PlanRow } from "@/lib/live/tplan";
import { cn } from "@/lib/cn";
import { ErrorNote, LiveBadge, Skeleton } from "./bits";
import { th, td } from "./funding-bits";
import { KpiBand, dayOnly, ops, tableBox, tableHead } from "./ops-bits";

/** Module 13 screen 4.1: My Treatment Plans. */
export function PlanList({ base }: { base: "/therapist/plans" | "/care/plans" }) {
  const { data, error, loading, reload } = useResource<{ rows: PlanRow[] }>(
    "/api/care/plans",
    (e) => e.type === "care",
  );
  const me = useSession().user;
  const router = useRouter();
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [busy, setBusy] = useState("");
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-[640px]" />;
  const all = data.rows;
  const disciplines = [...new Set(all.map((r) => r.discipline))].sort();
  const query = q.trim().toLowerCase();
  const rows = all
    .filter((r) => (!state || r.state === state) && (!discipline || r.discipline === discipline))
    .filter(
      (r) =>
        !query ||
        `${r.ref} ${r.participant} ${r.participantId} ${r.support}`.toLowerCase().includes(query),
    )
    .sort(
      (a, b) =>
        Number(b.reviewOverdue) - Number(a.reviewOverdue) ||
        (a.reviewDate || "9").localeCompare(b.reviewDate || "9"),
    );
  const active = all.filter((r) => r.state === "Active");
  const goals = all.reduce((s, r) => s + r.goals, 0);
  const achieved = all.reduce((s, r) => s + r.achieved, 0);
  const create = async (r: PlanRow) => {
    setBusy(r.needId);
    const res = await ops<{ id: string }>(
      "/api/care/plans",
      { clientId: r.clientId, needId: r.needId },
      "Plan created",
      "Linked to the latest signed assessment",
    );
    setBusy("");
    if (res?.id) router.push(`${base}/${res.id}`);
  };
  return (
    <>
      <PageHeader
        eyebrow="Live care"
        title="Treatment plans"
        description="Goals, interventions and reviews for every course of care"
        actions={<LiveBadge />}
      />
      <KpiBand
        label="Plan figures"
        items={[
          {
            label: "Active plans",
            value: active.length,
            sub: "signed and in delivery",
            onClick: () => setState("Active"),
          },
          {
            label: "Not started",
            value: all.filter((r) => r.state === "Not Started").length,
            sub: "courses of care waiting for a plan",
            tone: "watch",
            onClick: () => setState("Not Started"),
          },
          {
            label: "Drafts",
            value: all.filter((r) => ["Draft", "Ready for Approval"].includes(r.state)).length,
            sub: "draft or ready to sign",
            onClick: () => setState("Draft"),
          },
          {
            label: "Co-sign review",
            value: all.filter((r) => r.state === "Pending Review").length,
            sub: "Clinical Lead",
            onClick: () => setState("Pending Review"),
          },
          {
            label: "Reviews overdue",
            value: all.filter((r) => r.reviewOverdue).length,
            sub: "past the review date",
            tone: all.some((r) => r.reviewOverdue) ? "over" : undefined,
            onClick: () => setState("Active"),
          },
          {
            label: "Goals achieved",
            value: `${achieved}/${goals}`,
            sub: "confirmed by the clinician",
          },
        ]}
      />
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-lift">
        <div className="w-52">
          <Select
            aria-label="State"
            className="h-9"
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            <option value="">All states</option>
            {planStates.map((s) => (
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
            <option value="">All disciplines</option>
            {disciplines.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
        <label className="flex h-9 min-w-56 flex-1 items-center gap-2 rounded-control border border-border-strong bg-surface px-3 focus-within:shadow-focus">
          <Search className="size-4 text-ink-500" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search plans"
            placeholder="TP reference, participant, MRN or service"
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
              <th className={th}>Plan</th>
              <th className={th}>Participant</th>
              <th className={th}>Clinician</th>
              <th className={th}>Goals</th>
              <th className={th}>Review</th>
              <th className={th}>State</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={`${r.id ?? r.needId}`} className="hover:bg-canvas">
                <td className={td}>
                  {r.id ? (
                    <a
                      href={`${base}/${r.id}`}
                      className="font-semibold text-ink-900 hover:text-accent hover:no-underline"
                    >
                      {r.support}
                    </a>
                  ) : (
                    <span className="font-semibold text-ink-900">{r.support}</span>
                  )}
                  <span className="flex items-center gap-1.5 font-mono text-caption text-ink-500">
                    {r.restricted && <Lock className="size-3" aria-label="Restricted discipline" />}
                    {r.ref}
                    {r.version > 1 ? ` · v${r.version}` : ""}
                  </span>
                </td>
                <td className={td}>
                  <span className="block text-ink-900">{r.participant}</span>
                  <span className="font-mono text-caption text-ink-500">{r.participantId}</span>
                </td>
                <td className={td}>
                  <span className="block">{r.clinician || "—"}</span>
                  <span className="text-caption text-ink-500">{r.discipline}</span>
                </td>
                <td className={td}>
                  {r.goals ? (
                    <>
                      {r.goals} goal{r.goals === 1 ? "" : "s"}
                      <span className="block text-caption text-ink-500">
                        {r.achieved} achieved{r.shared ? " · shared with participant" : ""}
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-500">—</span>
                  )}
                </td>
                <td
                  className={cn(
                    td,
                    "whitespace-nowrap",
                    r.reviewOverdue && "font-semibold text-over",
                  )}
                >
                  {r.reviewDate
                    ? `${dayOnly(r.reviewDate)}${r.reviewOverdue ? " · overdue" : ""}`
                    : "—"}
                </td>
                <td className={td}>
                  {r.state === "Not Started" && me?.role === "therapist" ? (
                    <Button
                      size="sm"
                      variant="primary"
                      loading={busy === r.needId}
                      onClick={() => create(r)}
                    >
                      <Plus className="size-3.5" aria-hidden="true" /> Create plan
                    </Button>
                  ) : (
                    <Tag tone={stateTone[r.state]}>{r.state}</Tag>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2! px-1 text-caption text-ink-500">
        {rows.length} of {all.length} plans and courses of care · scroll inside the table for more
      </p>
    </>
  );
}
