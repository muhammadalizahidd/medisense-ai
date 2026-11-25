"use client";

import { ArrowUpRight, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { Tag, type TagTone } from "@/components/ui/tag";
import { useNow } from "@/lib/live/client";
import { isOpen, type OpsHubDto, type TaskDto } from "@/lib/live/operations";
import { cn } from "@/lib/cn";
import { EmptyNote } from "./bits";
import { ApprovalSheet, MessageSheet } from "./ops-comms";
import { approvalTone, messageTone, taskTone, when } from "./ops-bits";
import { TaskPreview } from "./ops-queue";
import { MatchSheet, ReviewSheet } from "./ops-review";

export const inboxKinds = ["all", "approvals", "review", "matching", "messages", "tasks"] as const;
export type InboxKind = (typeof inboxKinds)[number];

type Item = {
  key: string;
  kind: Exclude<InboxKind, "all">;
  title: string;
  meta: string;
  ref: string;
  status: { tone: TagTone; label: string };
  action: string;
  /** 0 is the most urgent; ties fall back to the due time. */
  rank: number;
  due: string | null;
  restricted: boolean;
};

const kindLabel: Record<Exclude<InboxKind, "all">, string> = {
  approvals: "Approval",
  review: "Referral review",
  matching: "Therapist matching",
  messages: "Message",
  tasks: "Task",
};

/** Every decision waiting on this person, from all queues, in one list ordered by urgency. */
export function inboxItems(hub: OpsHubDto, now: number): Item[] {
  const items: Item[] = [];
  for (const a of hub.approvals) {
    if (!a.canDecide) continue;
    items.push({
      key: `approvals:${a.id}`,
      kind: "approvals",
      title: a.title,
      meta: `${a.workflow} · raised by ${a.initiator}`,
      ref: a.ref,
      status: a.overdue
        ? { tone: "over", label: "Past SLA" }
        : { tone: approvalTone[a.status], label: a.status },
      action: "Decide",
      rank: a.overdue ? 0 : 2,
      due: a.dueAt,
      restricted: a.restricted,
    });
  }
  for (const r of hub.reviews) {
    if (r.ready) continue;
    const open = r.findings.filter(
      (f) => f.resolution === "Open" && f.severity !== "Informational",
    ).length;
    items.push({
      key: `review:${r.referralId}`,
      kind: "review",
      title: `${r.participant} · ${r.supports.join(", ")}`,
      meta: r.blockers[0] ?? "Findings to decide before triage",
      ref: r.reference,
      status: { tone: "watch", label: `${open} to decide` },
      action: "Review",
      rank: 2,
      due: null,
      restricted: r.restricted,
    });
  }
  if (hub.can.scheduler || hub.can.manager) {
    for (const m of hub.matching) {
      items.push({
        key: `matching:${m.clientId}:${m.needId}`,
        kind: "matching",
        title: `${m.participant} · ${m.support}`,
        meta: `${m.discipline} · ${m.location} · ${m.region}`,
        ref: `${m.waitingDays} d waiting`,
        status: m.blockers.length
          ? { tone: "watch", label: "Person chooses" }
          : { tone: "available", label: "Auto eligible" },
        action: "Assign",
        rank: m.waitingDays > 7 ? 1 : 2,
        due: null,
        restricted: false,
      });
    }
  }
  for (const m of hub.messages) {
    if (m.state !== "Failed" && m.state !== "Awaiting Approval") continue;
    items.push({
      key: `messages:${m.id}`,
      kind: "messages",
      title: `${m.category} to ${m.recipient}`,
      meta: m.state === "Failed" ? m.reason || "Delivery failed" : `${m.channel} · ${m.template}`,
      ref: m.ref,
      status: { tone: messageTone[m.state], label: m.state },
      action: m.state === "Failed" ? "Retry" : "Approve",
      rank: m.state === "Failed" ? 0 : 2,
      due: null,
      restricted: false,
    });
  }
  for (const t of hub.tasks) {
    if (!isOpen(t.status)) continue;
    const atRisk =
      !t.overdue &&
      Date.parse(t.dueAt) - now < 4 * 3_600_000 &&
      !["Waiting for Patient", "On Hold"].includes(t.status);
    const escalated = t.status === "Escalated";
    if (!escalated && !t.overdue && !atRisk) continue;
    items.push({
      key: `tasks:${t.id}`,
      kind: "tasks",
      title: t.title,
      meta: `${t.team} · ${t.assigneeName ?? "Unassigned"}${
        t.escalation ? ` · escalated to ${t.escalation.owner}` : ""
      }`,
      ref: t.ref,
      status: escalated
        ? { tone: taskTone[t.status], label: "Escalated" }
        : t.overdue
          ? { tone: "over", label: "Overdue" }
          : { tone: "watch", label: "Due within 4 h" },
      action: "Open",
      rank: escalated ? 0 : t.overdue ? 1 : 3,
      due: t.dueAt,
      restricted: t.visibility === "Clinical Restricted",
    });
  }
  return items.sort(
    (a, b) =>
      a.rank - b.rank ||
      (a.due ?? "9999").localeCompare(b.due ?? "9999") ||
      a.key.localeCompare(b.key),
  );
}

export function NeedsYou({
  hub,
  kind,
  setKind,
  onDone,
  goWork,
}: {
  hub: OpsHubDto;
  kind: InboxKind;
  setKind: (k: InboxKind) => void;
  onDone: () => void;
  goWork: () => void;
}) {
  const now = useNow() ?? Date.parse(hub.now);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const all = inboxItems(hub, now);
  const shown = all.filter((i) => kind === "all" || i.kind === kind);
  const count = (k: InboxKind) =>
    k === "all" ? all.length : all.filter((i) => i.kind === k).length;
  const openTasks = hub.tasks.filter((t) => isOpen(t.status));
  const decisions = all.filter((i) => i.kind !== "tasks").length;
  const overdue = openTasks.filter((t) => t.overdue).length;
  const dueToday = openTasks.filter((t) => t.dueToday).length;
  const onTrack = openTasks.length - all.filter((i) => i.kind === "tasks").length;

  // A decision made in a sheet can remove its row; close the sheet once the record is gone.
  const opened = openKey ? find(hub, openKey) : null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the record left the hub
    if (openKey && !opened) setOpenKey(null);
  }, [openKey, opened]);

  const figures = [
    {
      label: "Needs a decision",
      value: decisions,
      tone: decisions ? "text-ink-900" : "text-ink-500",
    },
    { label: "Overdue tasks", value: overdue, tone: overdue ? "text-over" : "text-ink-500" },
    { label: "Due today", value: dueToday, tone: "text-ink-900" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <section
        aria-label="Today"
        className="flex flex-wrap items-stretch gap-px overflow-hidden rounded-card border border-border bg-border"
      >
        {figures.map((f) => (
          <div key={f.label} className="flex min-w-40 flex-1 flex-col bg-surface px-5 py-4">
            <span className="label-caps text-ink-500">{f.label}</span>
            <span className={cn("type-display text-h2 leading-tight", f.tone)}>{f.value}</span>
          </div>
        ))}
        <div className="flex min-w-60 flex-[2] flex-col justify-center bg-surface px-5 py-4 text-caption text-ink-500">
          <span>
            {onTrack} open task{onTrack === 1 ? "" : "s"} on track ·{" "}
            <button
              type="button"
              onClick={goWork}
              className="cursor-pointer font-semibold text-accent hover:underline"
            >
              see all work
            </button>
          </span>
          <span>Rules last checked {when(hub.lastScan)}</span>
          {hub.hiddenRestricted > 0 && (
            <span>{hub.hiddenRestricted} clinically restricted task(s) not shown to your role</span>
          )}
        </div>
      </section>

      <Segmented
        label="Show"
        value={kind}
        onChange={setKind}
        options={inboxKinds
          .filter((k) => k !== "matching" || hub.can.scheduler || hub.can.manager)
          .map((k) => ({
            id: k,
            label: `${k === "all" ? "All" : k === "tasks" ? "Late tasks" : `${kindLabel[k]}s`} · ${count(k)}`,
          }))}
      />

      {shown.length === 0 ? (
        <EmptyNote title="Nothing needs you right now.">
          {onTrack} open task{onTrack === 1 ? " is" : "s are"} on track. New approvals, referral
          findings and failed messages appear here.
        </EmptyNote>
      ) : (
        <ul
          aria-label="Waiting for you"
          className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface"
        >
          {shown.map((i) => (
            <li key={i.key}>
              <button
                type="button"
                onClick={() => setOpenKey(i.key)}
                className="group flex w-full cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-left transition-colors hover:bg-canvas"
              >
                <span className="w-36 flex-none">
                  <Tag tone="outline">{kindLabel[i.kind]}</Tag>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-small font-semibold text-ink-900">
                    {i.restricted && (
                      <Lock className="mr-1 inline size-3.5 text-ink-500" aria-label="Restricted" />
                    )}
                    {i.title}
                  </span>
                  <span className="block truncate text-caption text-ink-500">
                    <span className="font-mono">{i.ref}</span> · {i.meta}
                  </span>
                </span>
                <span className="w-32 flex-none text-right text-caption text-ink-500">
                  {i.due ? `due ${when(i.due)}` : ""}
                </span>
                <span className="flex w-36 flex-none justify-end">
                  <Tag tone={i.status.tone}>{i.status.label}</Tag>
                </span>
                <span className="inline-flex h-8 w-24 flex-none items-center justify-end gap-1 text-small font-semibold text-accent">
                  {i.action}
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {opened?.kind === "approvals" && (
        <ApprovalSheet a={opened.a} onClose={() => setOpenKey(null)} onDone={onDone} />
      )}
      {opened?.kind === "messages" && (
        <MessageSheet m={opened.m} onClose={() => setOpenKey(null)} onDone={onDone} />
      )}
      {opened?.kind === "review" && (
        <ReviewSheet review={opened.r} hub={hub} onClose={() => setOpenKey(null)} onDone={onDone} />
      )}
      {opened?.kind === "matching" && (
        <MatchSheet c={opened.c} hub={hub} onClose={() => setOpenKey(null)} onDone={onDone} />
      )}
      {opened?.kind === "tasks" && <TaskPreview task={opened.t} onClose={() => setOpenKey(null)} />}
      {shown.length > 0 && (
        <p className="text-caption text-ink-500">
          Most urgent first: escalated, past SLA and failed items, then overdue, then the rest.
          Rules route the work; every decision here is yours and is recorded with your name.
        </p>
      )}
    </div>
  );
}

type Opened =
  | { kind: "approvals"; a: OpsHubDto["approvals"][number] }
  | { kind: "messages"; m: OpsHubDto["messages"][number] }
  | { kind: "review"; r: OpsHubDto["reviews"][number] }
  | { kind: "matching"; c: OpsHubDto["matching"][number] }
  | { kind: "tasks"; t: TaskDto };

/** Looks the record up in the latest hub, so a sheet always shows current data. */
function find(hub: OpsHubDto, key: string): Opened | null {
  const [kind, ...rest] = key.split(":");
  const id = rest.join(":");
  if (kind === "approvals") {
    const a = hub.approvals.find((x) => x.id === id);
    return a ? { kind, a } : null;
  }
  if (kind === "messages") {
    const m = hub.messages.find((x) => x.id === id);
    return m ? { kind, m } : null;
  }
  if (kind === "review") {
    const r = hub.reviews.find((x) => x.referralId === id);
    return r ? { kind, r } : null;
  }
  if (kind === "matching") {
    const c = hub.matching.find((x) => `${x.clientId}:${x.needId}` === id);
    return c ? { kind, c } : null;
  }
  if (kind === "tasks") {
    const t = hub.tasks.find((x) => x.id === id);
    return t ? { kind, t } : null;
  }
  return null;
}
