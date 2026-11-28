"use client";

import { Lock, Search, ShieldAlert, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { useNow, useResource, useSession } from "@/lib/live/client";
import { accessLabel, completenessTone, type RecordListItem } from "@/lib/live/records";
import { cn } from "@/lib/cn";
import { ErrorNote, LiveBadge, Skeleton } from "./bits";
import { th, td } from "./funding-bits";
import { KpiBand, ops, tableBox, tableHead, textArea, when } from "./ops-bits";

/** Module 11 CR-01: My clients and clinical record search, permission-aware. */
export function RecordList({
  base,
  embedded = false,
}: {
  base: "/therapist/records" | "/care/records";
  /** Inside a combined page, which brings its own title. */
  embedded?: boolean;
}) {
  const { data, error, loading, reload } = useResource<{ records: RecordListItem[] }>(
    "/api/care/records",
    (e) => e.type === "care",
  );
  const me = useSession().user;
  const now = useNow() ?? 0;
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [discipline, setDiscipline] = useState("");
  const [status, setStatus] = useState("");
  const [requesting, setRequesting] = useState<RecordListItem | null>(null);
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-[640px]" />;
  const therapist = me?.role === "therapist";
  const all = data.records;
  const disciplines = [...new Set(all.flatMap((r) => r.episodes.map((e) => e.discipline)))].sort();
  const query = q.trim().toLowerCase();
  const rows = all.filter((r) => {
    if (therapist && scope === "mine" && r.access === "none") return false;
    if (discipline && !r.episodes.some((e) => e.discipline === discipline)) return false;
    if (status && !r.episodes.some((e) => e.status === status)) return false;
    // Search never reveals restricted detail: only name and ID match a record you can't open (AC-34).
    if (
      query &&
      !(r.name.toLowerCase().includes(query) || r.participantId.toLowerCase().includes(query))
    )
      return false;
    return true;
  });
  const open = all.filter((r) => r.access !== "none");
  return (
    <>
      {!embedded && (
        <PageHeader
          eyebrow="Live care"
          title="Clinical records"
          description={
            therapist
              ? "Your assigned participants, with history, risks, consent and the full clinical timeline"
              : "Clinical records, shown at the level your role allows"
          }
          actions={<LiveBadge />}
        />
      )}
      <KpiBand
        label="Record figures"
        items={[
          {
            label: therapist ? "My participants" : "Records",
            value: open.length,
            sub: therapist ? "assigned or consultation access" : "you can open",
          },
          {
            label: "Active courses of care",
            value: open.reduce(
              (s, r) => s + r.episodes.filter((e) => e.status === "Active").length,
              0,
            ),
            sub: "across disciplines",
          },
          {
            label: "History to review",
            value: open.filter((r) => r.completeness !== "Verified").length,
            sub: "missing or needs review",
            tone: "watch",
          },
          {
            label: "High risk",
            value: open.filter((r) => r.highRisk).length,
            sub: "high or critical, open",
            tone: open.some((r) => r.highRisk) ? "over" : undefined,
          },
          {
            label: "Drafts to sign",
            value: open.reduce((s, r) => s + r.unsigned, 0),
            sub: "clinical entries",
          },
          {
            label: "Next 7 days",
            value: open.filter(
              (r) => r.nextAppointment && Date.parse(r.nextAppointment) - now < 7 * 86_400_000,
            ).length,
            sub: "participants with a visit",
          },
        ]}
      />
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-lift">
        {therapist && (
          <div
            className="flex rounded-control border border-border-strong p-0.5"
            role="group"
            aria-label="Scope"
          >
            {(["mine", "all"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={scope === s}
                onClick={() => setScope(s)}
                className={cn(
                  "h-8 cursor-pointer rounded-control px-3 text-caption font-semibold",
                  scope === s ? "bg-accent-fill text-on-accent" : "text-ink-700 hover:bg-canvas",
                )}
              >
                {s === "mine" ? "My clients" : "Search all"}
              </button>
            ))}
          </div>
        )}
        <div className="w-48">
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
        <div className="w-48">
          <Select
            aria-label="Course of care status"
            className="h-9"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Any course of care status</option>
            {["Awaiting assessment", "Active", "On hold", "Discharged", "Closed"].map((d) => (
              <option key={d}>{d}</option>
            ))}
          </Select>
        </div>
        <label className="flex h-9 min-w-64 flex-1 items-center gap-2 rounded-control border border-border-strong bg-surface px-3 focus-within:shadow-focus">
          <Search className="size-4 text-ink-500" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search records"
            placeholder="Name or participant ID (MRN)"
            className="min-w-0 flex-1 bg-transparent text-small outline-none placeholder:text-ink-500"
          />
          {q && (
            <button
              type="button"
              aria-label="Clear search"
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
              <th className={th}>Participant</th>
              <th className={th}>Courses of care</th>
              <th className={th}>Next visit</th>
              <th className={th}>Risks</th>
              <th className={th}>History</th>
              <th className={th}>Access</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.clientId} className="hover:bg-canvas">
                <td className={td}>
                  {r.access === "none" ? (
                    <span className="flex items-center gap-2 font-semibold text-ink-700">
                      <Lock className="size-3.5 text-ink-500" aria-hidden="true" />
                      {r.name}
                    </span>
                  ) : (
                    <a
                      href={`${base}/${r.clientId}`}
                      className="font-semibold text-ink-900 hover:text-accent hover:no-underline"
                    >
                      {r.name}
                    </a>
                  )}
                  <span className="block text-caption text-ink-500">
                    <span className="font-mono">{r.participantId}</span>
                    {r.age ? ` · ${r.age}` : ""} · {r.suburb}
                  </span>
                </td>
                <td className={td}>
                  <span className="flex flex-wrap gap-1.5">
                    {r.episodes.map((e, i) => (
                      <span
                        key={i}
                        className={cn(
                          "rounded-tag border px-2 py-0.5 text-caption",
                          e.mine
                            ? "border-accent bg-accent-tint text-accent"
                            : "border-border-strong text-ink-700",
                        )}
                      >
                        {e.support} · {e.status}
                      </span>
                    ))}
                  </span>
                </td>
                <td className={cn(td, "whitespace-nowrap")}>
                  {r.nextAppointment ? (
                    when(r.nextAppointment)
                  ) : (
                    <span className="text-ink-500">—</span>
                  )}
                </td>
                <td className={td}>
                  {r.access === "none" ? (
                    <span className="text-ink-500">—</span>
                  ) : r.openRisks ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-caption font-semibold",
                        r.highRisk ? "text-over" : "text-watch",
                      )}
                    >
                      <ShieldAlert className="size-3.5" aria-hidden="true" />
                      {r.openRisks} open
                    </span>
                  ) : (
                    <span className="text-caption text-ink-500">None recorded</span>
                  )}
                </td>
                <td className={td}>
                  {r.access === "none" ? (
                    <span className="text-ink-500">—</span>
                  ) : (
                    <Tag tone={completenessTone[r.completeness]}>{r.completeness}</Tag>
                  )}
                </td>
                <td className={td}>
                  {r.access === "none" ? (
                    <Button size="sm" onClick={() => setRequesting(r)}>
                      Request access
                    </Button>
                  ) : (
                    <span className="text-caption whitespace-nowrap text-ink-700">
                      {(accessLabel[r.access].split(/[:(]/)[0] ?? "").trim()}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2! px-1 text-caption text-ink-500">
        {rows.length} of {all.length} records · locked rows show the name only; nothing clinical is
        revealed without access
      </p>
      {requesting && (
        <RequestAccess item={requesting} onClose={() => setRequesting(null)} onDone={reload} />
      )}
    </>
  );
}

function RequestAccess({
  item,
  onClose,
  onDone,
}: {
  item: RecordListItem;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      title="Request access"
      description={`${item.name} · ${item.participantId}`}
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          disabled={reason.trim().length < 10}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await ops(
              `/api/care/records/${item.clientId}`,
              { type: "request-access", reason },
              "Access requested",
              "The Clinical Lead decides; access is time-limited and logged",
            );
            setBusy(false);
            if (ok) {
              onDone();
              onClose();
            }
          }}
        >
          Send request
        </Button>
      }
    >
      <p className="text-small text-ink-700">
        You aren&apos;t assigned to this participant. A Clinical Lead reviews your reason and can
        grant consultation access for 7 days. Every view is logged.
      </p>
      <label className="mt-4 flex flex-col gap-1 text-caption font-semibold text-ink-700">
        Why do you need access?
        <textarea
          className={textArea}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Joint visit planned with the treating OT next Tuesday"
        />
      </label>
    </Sheet>
  );
}
