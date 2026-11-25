"use client";

import type { ReactNode } from "react";
import { useAiEnabled } from "@/components/ai/ai-switch";
import { AlertTriangle, ArrowUpRight, FileSearch, Lock, ShieldAlert, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { AiChip, AiDraft, RuleMark } from "@/components/ai/provenance";
import { Button, ButtonLink } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Tag } from "@/components/ui/tag";
import { api } from "@/lib/live/client";
import type { FindingCategory, FindingDto, OpsHubDto, ReviewDto } from "@/lib/live/operations";
import type { MatchDto } from "@/lib/live/types";
import { cn } from "@/lib/cn";
import { EmptyNote, Skeleton } from "./bits";
import { FCard } from "./funding-bits";
import { ops, textArea, when } from "./ops-bits";

const groups: { id: string; label: string; cats: FindingCategory[] }[] = [
  { id: "missing", label: "Missing", cats: ["Missing"] },
  { id: "mismatch", label: "Possible mismatch", cats: ["Inconsistent"] },
  { id: "documents", label: "From documents", cats: ["Document Extraction"] },
  { id: "risk", label: "Risk for review", cats: ["Risk Flag"] },
  { id: "duplicate", label: "Duplicate candidate", cats: ["Duplicate Candidate"] },
  { id: "next", label: "Suggested next action", cats: ["Recommendation"] },
];

export function ReviewTab({ hub, onDone }: { hub: OpsHubDto; onDone: () => void }) {
  const [id, setId] = useState(hub.reviews[0]?.referralId ?? "");
  const [filter, setFilter] = useState("");
  const review = hub.reviews.find((r) => r.referralId === id) ?? hub.reviews[0];
  if (!review)
    return (
      <EmptyNote title="No referrals waiting for review.">
        New referrals appear here with a completeness check already run.
      </EmptyNote>
    );
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <section
        aria-label="Referrals"
        className="overflow-hidden rounded-card border border-border bg-surface xl:col-span-4"
      >
        <header className="border-b border-border px-5 py-3.5">
          <h2 className="text-section font-semibold text-ink-900">Referrals in intake</h2>
          <p className="text-caption text-ink-500">
            Rules check first, then AI cross-checks. A person decides every item.
          </p>
        </header>
        <ul className="max-h-[600px] divide-y divide-border overflow-y-auto">
          {hub.reviews.map((r) => {
            const open = r.findings.filter(
              (f) => f.resolution === "Open" && f.severity !== "Informational",
            ).length;
            return (
              <li key={r.referralId}>
                <button
                  type="button"
                  onClick={() => setId(r.referralId)}
                  aria-current={r.referralId === review.referralId}
                  className={cn(
                    "flex w-full cursor-pointer items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-canvas",
                    r.referralId === review.referralId && "bg-accent-tint",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-small font-semibold text-ink-900">
                      {r.participant}
                    </span>
                    <span className="block truncate font-mono text-caption text-ink-500">
                      {r.reference}
                    </span>
                    <span className="block truncate text-caption text-ink-500">
                      {r.supports.join(" · ")}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    {r.ready ? (
                      <Tag tone="healthy">Checks pass</Tag>
                    ) : (
                      <Tag tone="watch">{open} to decide</Tag>
                    )}
                    {r.restricted && <Tag tone="outline">Clinical review</Tag>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <div className="flex flex-col gap-6 xl:col-span-8 [&>*:last-child]:flex-1">
        <ReviewDetail
          key={review.referralId}
          review={review}
          hub={hub}
          onDone={onDone}
          filter={filter}
          setFilter={setFilter}
        />
      </div>
    </div>
  );
}

function ReviewDetail({
  review: r,
  hub,
  onDone,
  filter,
  setFilter,
}: {
  review: ReviewDto;
  hub: OpsHubDto;
  onDone: () => void;
  filter: string;
  setFilter: (f: string) => void;
}) {
  const ai = useAiEnabled();
  const [busy, setBusy] = useState<"" | "validate" | "ai">("");
  const url = `/api/care/operations/reviews/${r.referralId}`;
  const shown = groups.filter((g) => !filter || g.id === filter);
  const summary = r.findings.find((f) => f.origin === "AI" && f.field === "summary");
  return (
    <>
      <FCard
        icon={FileSearch}
        title={`${r.participant} · ${r.reference}`}
        sub={`Submitted ${when(r.submittedAt)} · snapshot locked ${when(r.snapshotAt)} · ${r.status}`}
        action={
          <ButtonLink size="sm" variant="ghost" href={r.href}>
            Open referral <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </ButtonLink>
        }
      >
        <ol className="grid gap-3 sm:grid-cols-3">
          <li className="rounded-control border border-border-strong p-3">
            <div className="flex items-center justify-between">
              <span className="text-caption font-semibold text-ink-900">1. Completeness check</span>
              <RuleMark />
            </div>
            <p className="mt-1 text-caption text-ink-500">
              {r.validatorRan ? `Ran ${when(r.validatorRan)}` : "Not run"}
            </p>
            <Button
              className="mt-2"
              size="sm"
              loading={busy === "validate"}
              onClick={async () => {
                setBusy("validate");
                if (await ops(url, { type: "validate" }, "Completeness check re-run")) onDone();
                setBusy("");
              }}
            >
              Re-run check
            </Button>
          </li>
          <li data-ai-only className="rounded-control p-3 surface-draft">
            <div className="flex items-center justify-between">
              <span className="text-caption font-semibold text-ink-900">2. AI cross-check</span>
              <AiChip>AI · suggestions</AiChip>
            </div>
            <p className="mt-1 text-caption text-ink-500">
              {r.aiRan ? `Ran ${when(r.aiRan)}` : "Not run yet"} · reads the form and attached
              documents
            </p>
            <Button
              className="mt-2"
              size="sm"
              variant="soft"
              disabled={!r.validatorRan || !hub.settings.aiReviewEnabled}
              loading={busy === "ai"}
              onClick={async () => {
                setBusy("ai");
                if (
                  await ops(
                    url,
                    { type: "ai" },
                    "AI review ready",
                    "Every item needs your decision",
                  )
                )
                  onDone();
                setBusy("");
              }}
            >
              {r.aiRan ? "Run AI again" : "Run AI review"}
            </Button>
          </li>
          <li className="rounded-control border border-border p-3">
            <span className="text-caption font-semibold text-ink-900">
              {ai ? 3 : 2}. Ready for triage
            </span>
            {r.ready ? (
              <p className="mt-1 text-caption text-healthy">
                Operational checks pass. The referral can move to clinical triage or assignment.
              </p>
            ) : (
              <ul className="mt-1 list-disc pl-4 text-caption text-ink-700">
                {r.blockers.slice(0, 4).map((b) => (
                  <li key={b}>{b}</li>
                ))}
                {r.blockers.length > 4 && <li>{r.blockers.length - 4} more</li>}
              </ul>
            )}
          </li>
        </ol>
        {busy === "ai" && (
          <AiDraft className="mt-4" label="AI cross-check" suggestionsOnly generating />
        )}
        {summary && (
          <AiDraft
            className="mt-4"
            label="AI intake summary"
            suggestionsOnly
            meta={`Confidence ${summary.confidence ?? "not given"}`}
          >
            <p className="text-small text-ink-900">{summary.detail}</p>
          </AiDraft>
        )}
        <div
          className="mt-4 flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Filter findings"
        >
          <button
            type="button"
            onClick={() => setFilter("")}
            className={cn(
              "h-7 cursor-pointer rounded-tag px-2.5 text-caption font-semibold",
              !filter
                ? "bg-accent-fill text-on-accent"
                : "border border-border-strong text-ink-700",
            )}
          >
            All
          </button>
          {groups.map((g) => {
            const n = r.findings.filter(
              (f) => g.cats.includes(f.category) && f.field !== "summary",
            ).length;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setFilter(g.id)}
                className={cn(
                  "h-7 cursor-pointer rounded-tag px-2.5 text-caption font-semibold",
                  filter === g.id
                    ? "bg-accent-fill text-on-accent"
                    : "border border-border-strong text-ink-700",
                )}
              >
                {g.label} · {n}
              </button>
            );
          })}
          {r.documents.length > 0 && (
            <span className="ml-auto text-caption text-ink-500">
              Documents: {r.documents.map((d) => d.name).join(", ")}
            </span>
          )}
        </div>
      </FCard>
      {shown.map((g) => {
        const list = r.findings.filter((f) => g.cats.includes(f.category) && f.field !== "summary");
        if (!list.length) return null;
        return (
          <section key={g.id} aria-label={g.label} className="flex flex-col gap-3">
            <h3 className="text-section font-semibold text-ink-900">
              {g.label} <span className="font-normal text-ink-500">· {list.length}</span>
            </h3>
            {list.map((f) => (
              <FindingCard key={f.id} f={f} url={url} clinical={hub.can.clinical} onDone={onDone} />
            ))}
          </section>
        );
      })}
    </>
  );
}

function FindingCard({
  f,
  url,
  clinical,
  onDone,
}: {
  f: FindingDto;
  url: string;
  clinical: boolean;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<
    "" | "Correct" | "Reject" | "Defer" | "Escalate" | "Request Clarification"
  >("");
  const [value, setValue] = useState(f.suggested || f.original);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const ai = f.origin === "AI";
  const done = f.resolution !== "Open";
  const decide = async (decision: string) => {
    setBusy(true);
    const res = await ops(
      url,
      { type: "decide", finding: { findingId: f.id, decision, value, note } },
      `Recorded: ${decision}`,
      decision === "Reject" ? "The submitted value is unchanged" : undefined,
    );
    setBusy(false);
    if (res) {
      setMode("");
      onDone();
    }
  };
  const risk = f.category === "Risk Flag";
  return (
    <article
      className={cn(
        "rounded-card p-4",
        ai && !done ? "surface-draft" : "border border-border bg-surface",
        risk && !done && "border-over",
      )}
    >
      <header className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-small font-semibold text-ink-900">
            {risk && <ShieldAlert className="size-4 text-over" aria-hidden="true" />}
            {f.label}
          </p>
          <p className="text-caption text-ink-500">
            Field <span className="font-mono">{f.field}</span> · {f.severity}
          </p>
        </div>
        {ai ? <AiChip>AI suggestion</AiChip> : <RuleMark />}
        {f.confidence && (
          <Tag tone={f.confidence === "Low" ? "watch" : "outline"}>{f.confidence} confidence</Tag>
        )}
        <Tag
          tone={
            done
              ? f.resolution === "Rejected"
                ? "neutral"
                : f.resolution === "Deferred"
                  ? "watch"
                  : "healthy"
              : "available"
          }
        >
          {f.resolution}
        </Tag>
      </header>
      <p className="mt-2 text-small text-ink-700">{f.detail}</p>
      {ai && f.confidence === "Low" && (
        <p className="mt-2 flex items-center gap-1.5 text-caption font-semibold text-watch">
          <AlertTriangle className="size-3.5" aria-hidden="true" /> Low confidence: check the source
          before accepting. Confidence isn&apos;t the same as truth.
        </p>
      )}
      <dl className="mt-3 grid gap-2 rounded-control bg-sunken p-3 text-caption sm:grid-cols-3">
        <div>
          <dt className="font-semibold text-ink-500">Source</dt>
          <dd className="text-ink-900">{f.source}</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink-500">Evidence</dt>
          <dd className="text-ink-900">{f.evidence ? `“${f.evidence}”` : "None given"}</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink-500">Submitted value → suggested</dt>
          <dd className="text-ink-900">
            {f.original || "blank"}{" "}
            {f.suggested ? (
              <>
                → <strong>{f.suggested}</strong>
              </>
            ) : (
              ""
            )}
          </dd>
        </div>
      </dl>
      {f.decision ? (
        <p className="mt-3 flex items-center gap-1.5 text-caption text-ink-700">
          <Lock className="size-3.5 text-ink-500" aria-hidden="true" />
          {f.decision.decision} by {f.decision.by}, {when(f.decision.at)}
          {f.decision.value
            ? ` · verified value "${f.decision.value}" stored beside the submitted one`
            : ""}
          {f.decision.note ? ` · ${f.decision.note}` : ""}
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {risk && !clinical ? (
            <>
              <Button
                size="sm"
                variant="primary"
                loading={busy}
                onClick={() => setMode("Escalate")}
              >
                Route to Clinical Lead
              </Button>
              <span className="text-caption text-ink-500">
                A risk flag can&apos;t be accepted or cleared by intake or AI.
              </span>
            </>
          ) : (
            <>
              {f.suggested && f.category !== "Duplicate Candidate" && (
                <Button size="sm" variant="primary" loading={busy} onClick={() => decide("Accept")}>
                  Accept suggested correction
                </Button>
              )}
              {f.category !== "Duplicate Candidate" && !risk && (
                <Button size="sm" onClick={() => setMode("Correct")}>
                  Edit value
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setMode("Reject")}>
                Reject
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode("Request Clarification")}>
                Request information
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode("Escalate")}>
                Route to Clinical Lead
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode("Defer")}>
                Defer
              </Button>
              {f.category === "Duplicate Candidate" && (
                <span className="text-caption text-ink-500">
                  Never merged here: decide on the referral.
                </span>
              )}
            </>
          )}
        </div>
      )}
      {mode && (
        <div className="mt-3 flex flex-col gap-2 rounded-control border border-border p-3">
          {mode === "Correct" && (
            <label className="flex flex-col gap-1 text-caption font-semibold text-ink-700">
              Verified value
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-9 rounded-control border border-border-strong px-2 text-small font-normal"
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-caption font-semibold text-ink-700">
            {mode === "Defer"
              ? "Why defer? (required)"
              : mode === "Reject"
                ? "Why reject? (optional)"
                : "Note"}
            <textarea value={note} onChange={(e) => setNote(e.target.value)} className={textArea} />
          </label>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" loading={busy} onClick={() => decide(mode)}>
              {mode === "Request Clarification"
                ? "Draft secure request"
                : mode === "Escalate"
                  ? "Route to Clinical Lead"
                  : `Confirm ${mode.toLowerCase()}`}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("")}>
              Cancel
            </Button>
          </div>
          {mode === "Reject" && (
            <p className="text-caption text-ink-500">
              Rejecting leaves the submitted value exactly as it was.
            </p>
          )}
        </div>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ therapist matching (OP-07) */

export function MatchingTab({ hub, onDone }: { hub: OpsHubDto; onDone: () => void }) {
  const [sel, setSel] = useState(
    hub.matching[0] ? `${hub.matching[0].clientId}:${hub.matching[0].needId}` : "",
  );
  const c = hub.matching.find((m) => `${m.clientId}:${m.needId}` === sel) ?? hub.matching[0];
  if (!hub.can.scheduler && !hub.can.manager)
    return (
      <EmptyNote title="Matching is for Scheduling.">
        Ask a scheduler to choose the therapist.
      </EmptyNote>
    );
  if (!c)
    return (
      <EmptyNote title="No services are waiting for a therapist.">
        Accepted referrals appear here, one row per requested service.
      </EmptyNote>
    );
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <section
        aria-label="Waiting services"
        className="overflow-hidden rounded-card border border-border bg-surface xl:col-span-4"
      >
        <header className="border-b border-border px-5 py-3.5">
          <h2 className="text-section font-semibold text-ink-900">
            Ready to assign · {hub.matching.length}
          </h2>
          <p className="text-caption text-ink-500">
            Mode: {hub.assignmentMode}. Each requested service is tracked on its own.
          </p>
        </header>
        <ul className="max-h-[600px] divide-y divide-border overflow-y-auto">
          {hub.matching.map((m) => (
            <li key={`${m.clientId}:${m.needId}`}>
              <button
                type="button"
                onClick={() => setSel(`${m.clientId}:${m.needId}`)}
                className={cn(
                  "flex w-full cursor-pointer items-start gap-3 px-5 py-3 text-left hover:bg-canvas",
                  m === c && "bg-accent-tint",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-small font-semibold text-ink-900">
                    {m.participant}
                  </span>
                  <span className="block text-caption text-ink-500">
                    {m.support} · {m.location} · {m.region}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <span className="text-caption text-ink-500">{m.waitingDays} d waiting</span>
                  {m.blockers.length ? (
                    <Tag tone="watch">Person chooses</Tag>
                  ) : (
                    <Tag tone="outline">Auto eligible</Tag>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <div className="xl:col-span-8">
        <MatchDetail key={`${c.clientId}:${c.needId}`} c={c} hub={hub} onDone={onDone} />
      </div>
    </div>
  );
}

function MatchDetail({
  c,
  hub,
  onDone,
}: {
  c: OpsHubDto["matching"][number];
  hub: OpsHubDto;
  onDone: () => void;
}) {
  const [matches, setMatches] = useState<MatchDto[] | null>(null);
  const [error, setError] = useState("");
  const [pick, setPick] = useState<{ id: string; slot: string } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ matches: MatchDto[] }>(
      `/api/care/operations/matches?client=${c.clientId}&need=${encodeURIComponent(c.needId)}`,
    )
      .then((r) => setMatches(r.matches))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load matches"));
  }, [c.clientId, c.needId]);
  const eligible = matches?.filter((m) => m.eligible) ?? [];
  const blocked = matches?.filter((m) => !m.eligible) ?? [];
  const top = eligible.slice(0, 3).map((m) => m.therapistId);
  const needsReason = Boolean(pick && !top.includes(pick.id));
  const auto = hub.rules.find((r) => r.code === "AUT-07");
  return (
    <div className="flex flex-col gap-6">
      <FCard
        icon={Users}
        title={`${c.participant} · ${c.support}`}
        sub={`${c.discipline} · ${c.location} · ${c.region}`}
        action={
          <ButtonLink size="sm" variant="ghost" href={c.href}>
            Patient record <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </ButtonLink>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-control border border-border-strong p-3">
            <p className="flex items-center justify-between text-caption font-semibold text-ink-900">
              Hard eligibility gates <RuleMark />
            </p>
            <ul className="mt-1 text-caption text-ink-700">
              <li>
                Discipline and service competency · verified current credentials · authorised scope
              </li>
              <li>
                Location and coverage · no availability collision · case review complete · capacity
              </li>
            </ul>
            <p className="mt-2 text-caption text-ink-500">
              A clinician who fails a gate can&apos;t be assigned, whatever the score.
            </p>
          </div>
          <div className="rounded-control border border-border p-3">
            <p className="text-caption font-semibold text-ink-900">
              Auto assignment ({auto?.code} v{auto?.version ?? 1}, {auto?.runMode})
            </p>
            {c.blockers.length ? (
              <ul className="mt-1 list-disc pl-4 text-caption text-over">
                {c.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-caption text-ink-700">
                No risk, precaution or open review on file. Auto mode still checks the assignment
                mode and a time this week.
              </p>
            )}
            <Button
              className="mt-2"
              size="sm"
              disabled={c.blockers.length > 0}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                if (
                  await ops(
                    "/api/care/operations",
                    {
                      type: "assign",
                      assign: { clientId: c.clientId, needId: c.needId, mode: "auto" },
                    },
                    "Therapist asked",
                    "They accept or decline; the rule version is logged",
                  )
                )
                  onDone();
                setBusy(false);
              }}
            >
              Run auto assignment
            </Button>
          </div>
        </div>
      </FCard>
      {error && <p className="text-small text-over">{error}</p>}
      {!matches && !error && <Skeleton className="h-64" />}
      {matches && (
        <Shortlist>
          {eligible.length === 0 && (
            <p className="text-small text-ink-700">
              No eligible clinician. Widen the search in Scheduling or waitlist the service.
            </p>
          )}
          <ol className="flex flex-col gap-2">
            {eligible.slice(0, 6).map((m, i) => (
              <li
                key={m.therapistId}
                className={cn(
                  "rounded-control border bg-surface p-3",
                  pick?.id === m.therapistId ? "border-accent" : "border-border",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-caption text-ink-500">#{i + 1}</span>
                  <span className="text-small font-semibold text-ink-900">{m.name}</span>
                  <span className="text-caption text-ink-500">
                    {m.seniority} · {m.region} · {m.activeClients}/{m.capacity} patients
                  </span>
                  <Tag
                    tone={
                      m.status === "At Risk" ? "over" : m.status === "Watch" ? "watch" : "healthy"
                    }
                  >
                    {m.status}
                  </Tag>
                  <span className="ml-auto text-caption text-ink-500">score {m.score}</span>
                </div>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {m.reasons.map((r) => (
                    <li
                      key={r.label}
                      className={cn(
                        "rounded-tag px-2 py-0.5 text-caption",
                        r.tone === "good"
                          ? "bg-healthy-bg text-healthy"
                          : r.tone === "warn"
                            ? "bg-watch-bg text-watch"
                            : "bg-sunken text-ink-700",
                      )}
                    >
                      {r.label}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div className="w-64">
                    <Select
                      aria-label={`Time with ${m.name}`}
                      className="h-8"
                      value={pick?.id === m.therapistId ? pick.slot : ""}
                      onChange={(e) => setPick({ id: m.therapistId, slot: e.target.value })}
                    >
                      <option value="">
                        {m.slots.length ? "Choose a time" : "No times in 2 weeks"}
                      </option>
                      {m.slots.slice(0, 12).map((s) => (
                        <option key={s} value={s}>
                          {when(s)}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {pick?.slot && (
            <div className="mt-3 flex flex-col gap-2 rounded-control border border-border bg-surface p-3">
              {needsReason && (
                <label className="flex flex-col gap-1 text-caption font-semibold text-ink-700">
                  Why this clinician over the top three? (required)
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="h-9 rounded-control border border-border-strong px-2 text-small font-normal"
                  />
                </label>
              )}
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={needsReason && reason.length < 5}
                  loading={busy}
                  onClick={async () => {
                    setBusy(true);
                    if (
                      await ops(
                        "/api/care/operations",
                        {
                          type: "assign",
                          assign: {
                            clientId: c.clientId,
                            needId: c.needId,
                            mode: "approve",
                            therapistId: pick.id,
                            start: pick.slot,
                            reason,
                          },
                        },
                        "Request sent",
                        "The time is held until the therapist accepts",
                      )
                    )
                      onDone();
                    setBusy(false);
                  }}
                >
                  Approve and ask the therapist
                </Button>
                <span className="text-caption text-ink-500">
                  Approved by {hub.me.name}. Logged with the rule version.
                </span>
              </div>
            </div>
          )}
        </Shortlist>
      )}
      {blocked.length > 0 && (
        <FCard
          icon={Lock}
          title={`Not eligible · ${blocked.length}`}
          sub="Excluded by a hard gate; shown so the reason is visible"
          flush
        >
          <ul className="max-h-[600px] divide-y divide-border overflow-y-auto">
            {blocked.map((m) => (
              <li
                key={m.therapistId}
                className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-small"
              >
                <span className="font-semibold text-ink-900">{m.name}</span>
                <span className="text-caption text-over">
                  {m.reasons
                    .filter((r) => r.tone === "warn")
                    .map((r) => r.label)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </FCard>
      )}
    </div>
  );
}

/** Matching suggestions while the switch is on; a plain ranked list of eligible people without it. */
function Shortlist({ children }: { children: ReactNode }) {
  const ai = useAiEnabled();
  const meta = "Nothing is assigned until you approve";
  if (ai) {
    return (
      <AiDraft label="Ranked shortlist" suggestionsOnly meta={meta}>
        {children}
      </AiDraft>
    );
  }
  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <h3 className="text-section font-semibold text-ink-900">Ranked shortlist</h3>
      <p className="mb-3 text-caption text-ink-500">{meta}</p>
      {children}
    </section>
  );
}
