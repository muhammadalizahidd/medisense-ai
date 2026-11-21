"use client";

import {
  BookOpenCheck,
  CheckCircle2,
  CircleSlash,
  Copy,
  History,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AiChip } from "@/components/ai/provenance";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Tag, type TagTone } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { IconBadge } from "@/features/mobile/phone-frame";
import { cn } from "@/lib/cn";
import type { AgentReply, Proposal, RunDto, RunStatus, SourceDoc } from "@/lib/live/agent";
import { api } from "@/lib/live/client";
import { shortDate, timeOfDay } from "@/lib/live/time";

/*
 * The parts every assistant shares (spec v2.0 §2): the answer with its facts and records, the
 * cited source panel, the proposal card a person confirms or cancels, and the run history.
 */

export const runTone: Record<RunStatus, TagTone> = {
  Proposed: "watch",
  Completed: "healthy",
  Declined: "neutral",
  Failed: "over",
  Duplicate: "available",
};

const runIcon = {
  Proposed: ShieldCheck,
  Completed: CheckCircle2,
  Declined: CircleSlash,
  Failed: XCircle,
  Duplicate: Copy,
} as const;

/** Plain names for the tools, so people never see internal identifiers. */
export const toolLabel: Record<string, string> = {
  CreateTask: "Create a task",
  SendApprovedMessage: "Send an approved message",
  PortalChange: "Visit change request",
  PortalBooking: "Booking request",
  AcknowledgePlan: "Plan acknowledgement",
  MessageCareTeam: "Question to your clinician",
  CareTask: "Follow-up task",
  CorrectionRequest: "Record correction request",
};

/** Sends one agent action to an assistant's endpoint and reports failures honestly. */
export async function agentCall<T>(endpoint: string, body: unknown): Promise<T | null> {
  try {
    return await api<T>(endpoint, { body });
  } catch (e) {
    toast("The assistant couldn't finish", {
      tone: "error",
      detail: e instanceof Error ? e.message : "",
    });
    return null;
  }
}

/** What a cited source is: its passage, version, status, approval and owning module. */
function SourceDetail({ s }: { s: SourceDoc }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <IconBadge icon={BookOpenCheck} tone="green" />
        <div>
          <p className="text-section text-ink-900">{s.title}</p>
          <p className="text-small text-ink-500">
            Approved source · readable by {s.audience.join(", ")}
          </p>
        </div>
      </div>
      <blockquote className="rounded-card border border-border bg-sunken p-4 text-body text-ink-900">
        {s.snippet}
      </blockquote>
      <dl className="grid grid-cols-2 gap-3 text-small">
        {[
          ["Version", s.version],
          ["Status", s.status],
          ["Approved", s.approved],
          ["Module", s.module],
        ].map(([k, v]) => (
          <div key={k} className="rounded-card border border-border p-3">
            <dt className="label-caps text-ink-500">{k}</dt>
            <dd className="mt-0.5 font-semibold text-ink-900">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-small text-ink-500">
        Only approved, current versions are used. Drafts and superseded versions are never cited.
      </p>
    </div>
  );
}

/**
 * Cited approved sources. Each opens its detail: version, approval date and the cited passage.
 * Inside a sheet (the apps' chats) the detail opens in place, because a second sheet would sit
 * underneath the first.
 */
export function SourcePanel({
  sources,
  inline = false,
}: {
  sources: SourceDoc[];
  inline?: boolean;
}) {
  const [open, setOpen] = useState<SourceDoc | null>(null);
  if (!sources.length) return null;
  return (
    <div className="mt-3">
      <p className="label-caps text-ink-500">Approved sources</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {sources.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-expanded={inline ? open?.id === s.id : undefined}
            onClick={() => setOpen(inline && open?.id === s.id ? null : s)}
            className="flex items-center gap-1.5 rounded-tag border border-border-strong bg-surface px-2 py-1 text-caption font-medium text-ink-700 transition-colors duration-140 hover:bg-accent-tint hover:text-accent"
          >
            <BookOpenCheck className="size-3.5" aria-hidden="true" />
            {s.title} · {s.version}
          </button>
        ))}
      </div>
      {open && inline && (
        <div className="bubble-in mt-2 rounded-card border border-border bg-surface p-3">
          <SourceDetail s={open} />
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="mt-3 cursor-pointer text-caption font-semibold text-accent"
          >
            Hide source
          </button>
        </div>
      )}
      {open && !inline && (
        <Sheet
          title={open.title}
          description={`${open.version} · ${open.status} ${open.approved} · ${open.module}`}
          onClose={() => setOpen(null)}
        >
          <SourceDetail s={open} />
        </Sheet>
      )}
    </div>
  );
}

/** A state-changing action shown before it runs: tool, record, before and after, checks, approver. */
export function ProposalCard({
  p,
  endpoint,
  onDone,
}: {
  p: Proposal;
  endpoint: string;
  onDone?: (run: RunDto) => void;
}) {
  const [state, setState] = useState<Proposal>(p);
  const [busy, setBusy] = useState<"confirm" | "decline" | "retry" | null>(null);
  const [result, setResult] = useState<string>("result" in p ? String(p.result) : "");
  const blocked = state.preconditions.filter((c) => !c.ok);
  const Icon = runIcon[state.status];

  async function go(kind: "confirm" | "decline" | "retry") {
    setBusy(kind);
    const body =
      kind === "decline"
        ? { type: "decline", runId: state.runId, reason: "Cancelled by a person" }
        : { type: kind, runId: state.runId };
    const r = await agentCall<{ run: RunDto }>(endpoint, body);
    setBusy(null);
    if (!r) return;
    setState(r.run);
    setResult(r.run.result);
    if (r.run.status === "Completed") toast("Done", { tone: "success", detail: r.run.result });
    onDone?.(r.run);
  }

  return (
    <div
      className={cn(
        "rounded-card border bg-surface p-4",
        state.status === "Proposed" ? "border-accent" : "border-border",
      )}
    >
      <div className="flex items-start gap-3">
        <IconBadge
          icon={Icon}
          tone={
            state.status === "Completed"
              ? "green"
              : state.status === "Failed"
                ? "red"
                : state.status === "Proposed"
                  ? "amber"
                  : "indigo"
          }
          size={36}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-section text-ink-900">{state.title}</p>
            <Tag tone={runTone[state.status]}>
              {state.status === "Proposed" ? "Needs your confirmation" : state.status}
            </Tag>
          </div>
          <p className="mt-0.5 text-caption text-ink-500">
            {toolLabel[state.tool] ?? "Action"} · approver {state.approver} · record{" "}
            {state.record.href ? (
              <Link href={state.record.href} className="text-accent hover:underline">
                {state.record.label}
              </Link>
            ) : (
              state.record.label
            )}
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-control bg-sunken p-2.5">
          <p className="label-caps text-ink-500">Before</p>
          <p className="mt-0.5 text-small text-ink-900">{state.before}</p>
        </div>
        <div className="rounded-control border border-border-strong p-2.5">
          <p className="label-caps text-ink-500">After</p>
          <p className="mt-0.5 text-small text-ink-900">{state.after}</p>
        </div>
      </div>
      <ul className="mt-3 flex flex-col gap-1">
        {state.preconditions.map((c) => (
          <li key={c.label} className="flex items-center gap-2 text-small">
            {c.ok ? (
              <CheckCircle2 className="size-4 text-healthy" aria-hidden="true" />
            ) : (
              <TriangleAlert className="size-4 text-over" aria-hidden="true" />
            )}
            <span className={c.ok ? "text-ink-700" : "font-semibold text-over"}>{c.label}</span>
          </li>
        ))}
      </ul>
      {result && (
        <p
          role="status"
          className={cn(
            "mt-3 rounded-control px-2.5 py-2 text-small",
            state.status === "Failed" ? "bg-over-bg text-over" : "bg-healthy-bg text-healthy",
          )}
        >
          {result}
        </p>
      )}
      {state.status === "Proposed" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            loading={busy === "confirm"}
            disabled={blocked.length > 0}
            onClick={() => go("confirm")}
          >
            Confirm
          </Button>
          <Button
            variant="ghost"
            size="sm"
            loading={busy === "decline"}
            onClick={() => go("decline")}
          >
            Cancel
          </Button>
          {blocked.length > 0 && (
            <span className="text-caption text-over">
              Blocked until: {blocked.map((b) => b.label).join("; ")}
            </span>
          )}
        </div>
      )}
      {state.status === "Failed" && (
        <div className="mt-3">
          <Button
            variant="secondary"
            size="sm"
            loading={busy === "retry"}
            onClick={() => go("retry")}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}

const outcomeTone: Record<AgentReply["outcome"], TagTone> = {
  Answered: "healthy",
  "Need more information": "watch",
  "No authorised source": "neutral",
  Failed: "over",
};

/** One assistant answer: the AI explanation, the facts it rests on, records, sources, proposals. */
export function AgentAnswer({
  reply,
  endpoint,
  onRun,
}: {
  reply: AgentReply;
  endpoint: string;
  onRun?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-card border border-dashed border-draft-rule bg-draft p-4">
        <div className="flex flex-wrap items-center gap-2">
          {reply.ai ? (
            <AiChip>AI answer · from live records</AiChip>
          ) : (
            <span className="label-caps text-ink-500">From live records · AI unavailable</span>
          )}
          <Tag tone={outcomeTone[reply.outcome]}>{reply.outcome}</Tag>
          {reply.feature && (
            <span className="text-caption text-ink-500">
              <span className="font-mono">{reply.feature.no}</span> · {reply.feature.title}
            </span>
          )}
        </div>
        <p className="mt-2 text-body text-ink-900">{reply.answer}</p>
        {reply.facts.length > 0 && (
          <ul className="mt-3 flex flex-col divide-y divide-border rounded-control border border-border bg-surface">
            {reply.facts.map((f) => {
              const m = /^\[([^\]]+)\]\s*(.*)$/.exec(f);
              return (
                <li key={f} className="flex gap-2 px-3 py-1.5 text-small">
                  {m ? (
                    <>
                      <span className="flex-none font-semibold text-ink-900">{m[1]}</span>
                      <span className="text-ink-700">{m[2]}</span>
                    </>
                  ) : (
                    <span className="text-ink-700">{f}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {reply.records.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {reply.records.map((r) => (
              <Link
                key={r.label + r.href}
                href={r.href}
                className="rounded-tag bg-accent-tint px-2 py-1 text-caption font-semibold text-accent hover:underline"
              >
                Open {r.label}
              </Link>
            ))}
          </div>
        )}
        <SourcePanel sources={reply.sources} />
      </div>
      {reply.proposals.map((p) => (
        <ProposalCard key={p.runId} p={p} endpoint={endpoint} onDone={onRun} />
      ))}
    </div>
  );
}

/** Every agent run with its real outcome, newest first. */
export function RunHistory({
  runs,
  endpoint,
  onRun,
}: {
  runs: RunDto[];
  endpoint: string;
  onRun?: () => void;
}) {
  const [filter, setFilter] = useState<RunStatus | "All">("All");
  const [all, setAll] = useState(false);
  const shown = filter === "All" ? runs : runs.filter((r) => r.status === filter);
  const counts = runs.reduce<Record<string, number>>(
    (m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }),
    {},
  );
  return (
    <div className="rounded-card border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <IconBadge icon={History} tone="ink" size={32} />
        <div className="flex-1">
          <p className="text-section text-ink-900">Run history</p>
          <p className="text-caption text-ink-500">
            Every proposal and its real outcome. Repeats never run twice.
          </p>
        </div>
        <div role="radiogroup" aria-label="Filter runs" className="flex flex-wrap gap-1">
          {(["All", "Proposed", "Completed", "Declined", "Failed", "Duplicate"] as const).map(
            (k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={filter === k}
                onClick={() => setFilter(k)}
                className={cn(
                  "rounded-tag px-2 py-1 text-caption font-semibold transition-colors duration-140",
                  filter === k ? "bg-accent-tint text-accent" : "text-ink-500 hover:bg-sunken",
                )}
              >
                {k}
                {k !== "All" && counts[k] ? ` ${counts[k]}` : ""}
              </button>
            ),
          )}
        </div>
      </div>
      {!shown.length ? (
        <p className="px-4 py-6 text-center text-small text-ink-500">No runs yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {shown.slice(0, all ? shown.length : 8).map((r) => (
            <RunRow key={r.runId} r={r} endpoint={endpoint} onRun={onRun} />
          ))}
          {shown.length > 8 && (
            <li>
              <button
                type="button"
                onClick={() => setAll((x) => !x)}
                className="w-full px-4 py-2.5 text-caption font-semibold text-accent hover:bg-sunken"
              >
                {all ? "Show fewer" : `Show all ${shown.length} runs`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function RunRow({ r, endpoint, onRun }: { r: RunDto; endpoint: string; onRun?: () => void }) {
  const [open, setOpen] = useState(false);
  const Icon = runIcon[r.status];
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-140 hover:bg-sunken"
      >
        <Icon className="size-4 flex-none text-ink-500" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-small font-semibold text-ink-900">{r.title}</span>
          <span className="block truncate text-caption text-ink-500">
            <span className="font-mono">{r.feature}</span> · {r.requestedBy} · {shortDate(r.at)}{" "}
            {timeOfDay(r.at)}
          </span>
        </span>
        <Tag tone={runTone[r.status]}>{r.status}</Tag>
      </button>
      {open && (
        <Sheet
          title={r.title}
          description={`${r.feature} · ${toolLabel[r.tool] ?? "Action"}`}
          onClose={() => setOpen(false)}
        >
          <div className="flex flex-col gap-3">
            <ProposalCard
              p={r}
              endpoint={endpoint}
              onDone={() => {
                onRun?.();
              }}
            />
            <dl className="grid grid-cols-2 gap-2 text-small">
              {[
                ["Requested by", `${r.requestedBy} (${r.role})`],
                ["Requested", `${shortDate(r.at)} ${timeOfDay(r.at)}`],
                ["Decided by", r.decidedBy ?? "Not yet"],
                [
                  "Decided",
                  r.decidedAt ? `${shortDate(r.decidedAt)} ${timeOfDay(r.decidedAt)}` : "Not yet",
                ],
              ].map(([k, v]) => (
                <div key={k} className="rounded-card border border-border p-2.5">
                  <dt className="label-caps text-ink-500">{k}</dt>
                  <dd className="mt-0.5 text-ink-900">{v}</dd>
                </div>
              ))}
            </dl>
            {r.result && (
              <p className="rounded-control bg-sunken p-2.5 text-small text-ink-700">
                Result: {r.result}
              </p>
            )}
          </div>
        </Sheet>
      )}
    </li>
  );
}
