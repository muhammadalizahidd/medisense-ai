"use client";

import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { MetricBand } from "@/components/ui/metric-band";
import { PageHeader } from "@/components/ui/page";
import { Segmented } from "@/components/ui/segmented";
import { Tag } from "@/components/ui/tag";
import { useNow, useResource } from "@/lib/live/client";
import { relativeTime } from "@/lib/live/time";
import type { ClientStage, ClientSummaryDto } from "@/lib/live/types";
import { EmptyNote, ErrorNote, LiveBadge, needTone, Skeleton, StageTag } from "./bits";

type Filter = "all" | ClientStage;

export function CareBoard() {
  const { data, error, loading, reload } = useResource<{ clients: ClientSummaryDto[] }>(
    "/api/care/clients",
    (event) => event.type === "care",
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const now = useNow();
  const weekAgo = now === null ? Infinity : now - 7 * 86_400_000;
  const clients = data?.clients ?? [];
  const count = (stage: ClientStage) => clients.filter((c) => c.stage === stage).length;
  const rows = clients
    .filter((c) => filter === "all" || c.stage === filter)
    .filter((c) =>
      `${c.name} ${c.suburb} ${c.needs.map((n) => n.support).join(" ")}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    );

  return (
    <>
      <PageHeader
        eyebrow="Patient onboarding"
        title="New patients and therapist matching"
        description="Accepted referrals become patients with one service request per support. Choose a therapist for each by availability and follow the request until it's accepted."
        actions={
          <div className="flex items-center gap-3">
            <LiveBadge />
            <ButtonLink href="/care/referrals" variant="primary">
              <Plus className="size-4" aria-hidden="true" />
              New referral
            </ButtonLink>
          </div>
        }
      />

      <MetricBand
        label="Onboarding figures"
        metrics={[
          {
            label: "Needs a therapist",
            value: count("Needs a therapist"),
            tone: "over",
            flagged: count("Needs a therapist") > 0,
          },
          {
            label: "Waiting for therapist",
            value: count("Waiting for therapist"),
            caption: "Requests sent, no reply yet",
          },
          { label: "Active", value: count("Active"), caption: "Every therapy has a therapist" },
          {
            label: "Added this week",
            value: clients.filter((c) => new Date(c.createdAt).getTime() > weekAgo).length,
          },
          { label: "All patients", value: clients.length },
        ]}
      />

      <div className="mt-6 mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { id: "all", label: "All" },
            { id: "Needs a therapist", label: "Needs a therapist" },
            { id: "Waiting for therapist", label: "Waiting" },
            { id: "Active", label: "Active" },
          ]}
        />
        <label className="flex h-9 w-72 items-center gap-2 rounded-control border border-border bg-surface px-3 focus-within:shadow-focus">
          <Search className="size-4 text-ink-500" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search patients"
            placeholder="Search name, suburb or therapy"
            className="min-w-0 flex-1 bg-transparent text-small outline-none placeholder:text-ink-500"
          />
        </label>
      </div>

      {error && !data ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyNote title={clients.length ? "No patients match." : "No patients yet."}>
          {clients.length ? (
            "Try another filter or search."
          ) : (
            <Link href="/care/referrals">Accept a referral to add the first patient</Link>
          )}
        </EmptyNote>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface surface-lift">
          <table className="w-full min-w-200 text-left text-small">
            <thead className="border-b border-border text-caption text-ink-500">
              <tr>
                <th className="px-4 py-3 font-medium">Patient</th>
                <th className="px-4 py-3 font-medium">Therapies</th>
                <th className="px-4 py-3 font-medium">Funding</th>
                <th className="px-4 py-3 font-medium">Added</th>
                <th className="px-4 py-3 font-medium">Stage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-canvas">
                  <td className="px-4 py-3">
                    <Link href={`/care/${c.id}`} className="font-semibold text-ink-900">
                      {c.name}
                    </Link>
                    <span className="block text-caption text-ink-500">
                      {c.suburb} · {c.region}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap gap-1.5">
                      {c.needs.map((n) => (
                        <Tag key={n.id} tone={needTone[n.status]}>
                          {n.support}
                          {n.therapistName ? ` · ${n.therapistName}` : ""}
                        </Tag>
                      ))}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-700">{c.funding}</td>
                  <td className="px-4 py-3 text-ink-700">{relativeTime(c.createdAt)}</td>
                  <td className="px-4 py-3">
                    <StageTag stage={c.stage} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
