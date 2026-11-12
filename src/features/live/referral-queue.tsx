"use client";

import { AlertTriangle, Copy, ExternalLink, FileQuestion, Plus, Search, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { MetricBand } from "@/components/ui/metric-band";
import { PageHeader } from "@/components/ui/page";
import { Segmented } from "@/components/ui/segmented";
import { Tag, type TagTone } from "@/components/ui/tag";
import { useResource } from "@/lib/live/client";
import { isFinal, type ReferralStatus } from "@/lib/live/referral";
import { relativeTime } from "@/lib/live/time";
import type { ReferralSummaryDto } from "@/lib/live/types";
import { EmptyNote, ErrorNote, LiveBadge, Skeleton } from "./bits";

export const referralTone: Record<ReferralStatus, TagTone> = {
  Submitted: "available",
  "Needs Information": "monitor",
  "Under Admin Review": "available",
  "Clinical Triage": "live",
  "Funding Review": "live",
  Waitlisted: "neutral",
  Accepted: "healthy",
  Declined: "over",
  Withdrawn: "neutral",
  Closed: "neutral",
};

export function ReferralStatusTag({ status }: { status: ReferralStatus }) {
  return <Tag tone={referralTone[status]}>{status}</Tag>;
}

type Filter = "open" | "intake" | "info" | "triage" | "funding" | "waitlist" | "done";

const filters: Record<Filter, (r: ReferralSummaryDto) => boolean> = {
  open: (r) => !isFinal(r.status) && r.status !== "Accepted",
  intake: (r) => r.status === "Under Admin Review" || r.status === "Submitted",
  info: (r) => r.status === "Needs Information",
  triage: (r) => r.status === "Clinical Triage",
  funding: (r) => r.status === "Funding Review",
  waitlist: (r) => r.status === "Waitlisted",
  done: (r) => isFinal(r.status) || r.status === "Accepted",
};

/** Admin module A02: every referral, from arrival to acceptance, with what needs doing next. */
export function ReferralQueue() {
  const { data, error, loading, reload } = useResource<{ referrals: ReferralSummaryDto[] }>(
    "/api/care/referrals",
    (event) => event.type === "care",
  );
  const [filter, setFilter] = useState<Filter>("open");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const all = data?.referrals ?? [];
  const count = (f: Filter) => all.filter(filters[f]).length;
  const rows = all
    .filter(filters[filter])
    .filter((r) =>
      `${r.reference} ${r.name} ${r.suburb} ${r.supports.join(" ")}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    );

  return (
    <>
      <PageHeader
        eyebrow="Patient onboarding"
        title="Referrals and intake"
        description="Every referral moves through the completeness check, intake review, clinical triage and funding before matching. Nothing is re-entered: accepting one creates the patient and their service requests."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <LiveBadge />
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(`${window.location.origin}/refer`);
                setCopied(true);
              }}
              className="on-light inline-flex h-9 cursor-pointer items-center gap-2 rounded-control border border-border-strong bg-surface px-3 text-small font-semibold text-ink-900 hover:bg-canvas"
            >
              <Copy className="size-3.5" aria-hidden="true" />
              {copied ? "Link copied" : "Copy public form link"}
            </button>
            <ButtonLink href="/refer" target="_blank" className="on-light">
              <ExternalLink className="size-3.5" aria-hidden="true" />
              Public form
            </ButtonLink>
            <ButtonLink href="/care/new" variant="primary">
              <Plus className="size-4" aria-hidden="true" />
              Enter a referral
            </ButtonLink>
          </div>
        }
      />

      <MetricBand
        label="Referral figures"
        metrics={[
          {
            label: "Intake review",
            value: count("intake"),
            tone: "over",
            flagged: count("intake") > 0,
            caption: "Waiting for intake",
          },
          { label: "Needs information", value: count("info"), caption: "Waiting on the submitter" },
          {
            label: "Clinical triage",
            value: count("triage"),
            tone: "monitor",
            flagged: count("triage") > 0,
            caption: "Clinical Lead decision",
          },
          {
            label: "Funding review",
            value: count("funding"),
            caption: "Funding, agreement, consent",
          },
          { label: "Waitlisted", value: count("waitlist") },
          {
            label: "Accepted",
            value: all.filter((r) => r.status === "Accepted").length,
            caption: "Now service requests",
          },
        ]}
      />

      <div className="mt-6 mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { id: "open", label: `Open (${count("open")})` },
            { id: "intake", label: "Intake review" },
            { id: "info", label: "Needs information" },
            { id: "triage", label: "Clinical triage" },
            { id: "funding", label: "Funding" },
            { id: "waitlist", label: "Waitlist" },
            { id: "done", label: "Closed" },
          ]}
        />
        <label className="flex h-9 w-72 items-center gap-2 rounded-control border border-border bg-surface px-3 focus-within:shadow-focus">
          <Search className="size-4 text-ink-500" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search referrals"
            placeholder="Reference, name, suburb or support"
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
        <EmptyNote title={all.length ? "No referrals here." : "No referrals yet."}>
          {all.length ? (
            "Try another filter or search."
          ) : (
            <Link href="/refer">Open the public referral form</Link>
          )}
        </EmptyNote>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-240 text-left text-small">
            <thead className="border-b border-border text-caption text-ink-500">
              <tr>
                <th className="px-4 py-3 font-medium">Referral</th>
                <th className="px-4 py-3 font-medium">Supports requested</th>
                <th className="px-4 py-3 font-medium">Funding</th>
                <th className="px-4 py-3 font-medium">Checks</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-canvas">
                  <td className="px-4 py-3">
                    <Link href={`/care/referrals/${r.id}`} className="font-semibold text-ink-900">
                      {r.name}
                    </Link>
                    <span className="block text-caption text-ink-500">
                      <span className="font-mono">{r.reference}</span> · {r.suburb} ·{" "}
                      {r.submittedBy === "staff"
                        ? "entered by staff"
                        : r.submitterRole.toLowerCase()}
                    </span>
                  </td>
                  <td className="max-w-80 px-4 py-3 text-ink-700">
                    {r.supports.slice(0, 3).join("; ")}
                    {r.supports.length > 3 && ` +${r.supports.length - 3} more`}
                  </td>
                  <td className="px-4 py-3 text-ink-700">{r.funding}</td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap gap-1.5">
                      {r.risk && (
                        <Tag tone="over">
                          <AlertTriangle className="size-3" aria-hidden="true" /> Risk review
                        </Tag>
                      )}
                      {r.duplicates > 0 && (
                        <Tag tone="monitor">
                          <Users className="size-3" aria-hidden="true" /> Possible duplicate
                        </Tag>
                      )}
                      {r.gaps > 0 && (
                        <Tag tone="neutral">
                          <FileQuestion className="size-3" aria-hidden="true" /> {r.gaps} to confirm
                        </Tag>
                      )}
                      {!r.risk && !r.duplicates && !r.gaps && (
                        <span className="text-caption text-ink-500">Complete</span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-700">
                    {r.owner ?? <span className="text-ink-500">Unassigned</span>}
                  </td>
                  <td className="px-4 py-3 text-ink-700">{relativeTime(r.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <ReferralStatusTag status={r.status} />
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
