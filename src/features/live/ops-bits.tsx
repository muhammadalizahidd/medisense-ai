"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { KpiLabel } from "@/components/ui/kpi-icon";
import { toast } from "@/components/ui/toast";
import type { TagTone } from "@/components/ui/tag";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { api } from "@/lib/live/client";
import type {
  ApprovalStatus,
  MessageState,
  RuleStatus,
  RunDto,
  TaskPriority,
  TaskStatus,
} from "@/lib/live/operations";

export const taskTone: Record<TaskStatus, TagTone> = {
  New: "available",
  Assigned: "available",
  "In Progress": "available",
  "Waiting for Patient": "watch",
  "Waiting for Staff": "watch",
  "On Hold": "neutral",
  Completed: "healthy",
  Cancelled: "neutral",
  Escalated: "over",
};

export const priorityTone07: Record<TaskPriority, TagTone> = {
  Urgent: "over",
  High: "watch",
  Normal: "outline",
  Low: "outline",
};

export const ruleTone: Record<RuleStatus, TagTone> = {
  Active: "healthy",
  Draft: "watch",
  Paused: "neutral",
  Archived: "outline",
};

export const approvalTone: Record<ApprovalStatus, TagTone> = {
  Pending: "watch",
  Approved: "healthy",
  Rejected: "over",
  "Changes requested": "watch",
};

export const messageTone: Record<MessageState, TagTone> = {
  Draft: "outline",
  "Awaiting Approval": "watch",
  Queued: "available",
  Sent: "available",
  Delivered: "healthy",
  Failed: "over",
  Suppressed: "neutral",
};

export const outcomeTone: Record<RunDto["outcome"], TagTone> = {
  "Task created": "healthy",
  "Updated existing": "available",
  "Duplicate skipped": "outline",
  Suppressed: "neutral",
  Blocked: "watch",
  Error: "over",
  Suggested: "available",
  Simulated: "outline",
  "Message queued": "available",
  Escalated: "over",
  Closed: "healthy",
};

export function PriorityTag({ p }: { p: TaskPriority }) {
  return <Tag tone={priorityTone07[p]}>{p}</Tag>;
}

const tz = "Australia/Brisbane";
export const when = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("en-AU", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        timeZone: tz,
      }).format(new Date(iso))
    : "—";
export const dayOnly = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("en-AU", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: tz,
      }).format(new Date(iso))
    : "—";

/** "in 3 h", "2 d overdue": how far a due date is from now. */
export function dueIn(iso: string, now: number) {
  const ms = new Date(iso).getTime() - now;
  const abs = Math.abs(ms);
  const h = Math.round(abs / 3_600_000);
  const text =
    h < 1
      ? `${Math.max(1, Math.round(abs / 60_000))} min`
      : h < 48
        ? `${h} h`
        : `${Math.round(h / 24)} d`;
  return ms < 0 ? `${text} overdue` : `in ${text}`;
}

/** Posts an operations action with a toast either way. Returns null on failure. */
export async function ops<T = Record<string, unknown>>(
  url: string,
  body: unknown,
  ok: string,
  detail?: string,
) {
  try {
    const res = await api<T>(url, { body });
    toast(ok, { tone: "success", detail });
    return res;
  } catch (e) {
    toast("Couldn't do that", { tone: "error", detail: e instanceof Error ? e.message : "" });
    return null;
  }
}

/** Columns per figure count, so a short band fills the row instead of leaving a gap. */
const columns: Record<number, string> = {
  3: "sm:grid-cols-3",
  4: "xl:grid-cols-4",
  5: "sm:grid-cols-3 xl:grid-cols-5",
};

/** A KPI tile row: the same band as the finance overview, figures clickable into a filtered view. */
export function KpiBand({
  items,
  label,
}: {
  items: {
    label: string;
    value: ReactNode;
    sub: ReactNode;
    tone?: "over" | "watch";
    onClick?: () => void;
    icon?: LucideIcon;
  }[];
  label: string;
}) {
  return (
    <section
      aria-label={label}
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border shadow-lift",
        columns[items.length] ?? "sm:grid-cols-3 xl:grid-cols-6",
      )}
    >
      {items.map((k) => (
        <button
          key={k.label}
          type="button"
          onClick={k.onClick}
          disabled={!k.onClick}
          className="group flex cursor-pointer flex-col gap-1 bg-surface px-5 py-4 text-left transition-colors hover:bg-canvas disabled:cursor-default disabled:hover:bg-surface"
        >
          <KpiLabel label={k.label} icon={k.icon} tone={k.tone} />
          <span
            className={
              k.tone === "over"
                ? "type-display text-h2 leading-tight text-over"
                : k.tone === "watch"
                  ? "type-display text-h2 leading-tight text-watch"
                  : "type-display text-h2 leading-tight text-ink-900"
            }
          >
            {k.value}
          </span>
          <span className="text-caption text-ink-500">{k.sub}</span>
        </button>
      ))}
    </section>
  );
}

export function DemoNote({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-tag border border-dashed border-border-strong px-1.5 text-label font-semibold tracking-wide text-ink-500 uppercase">
      {children}
    </span>
  );
}

export const textArea =
  "min-h-20 w-full rounded-(--radius-field) border border-border-strong bg-surface px-3 py-2 text-small text-ink-900 outline-none placeholder:text-ink-400 focus:border-accent focus:shadow-focus disabled:bg-sunken disabled:text-ink-500";

/** Every operations table keeps one fixed height and scrolls inside, with the header pinned. */
export const tableBox =
  "h-[600px] overflow-auto rounded-card border border-border bg-surface shadow-lift";
export const tableHead =
  "sticky top-0 z-10 bg-sunken text-label tracking-[0.08em] text-ink-500 uppercase shadow-hairline";

/** The count line under a fixed-height table. */
export function TableFoot({ shown, total, noun }: { shown: number; total: number; noun: string }) {
  return (
    <p className="mt-2! px-1 text-caption text-ink-500">
      {shown === total ? `${total} ${noun}` : `${shown} of ${total} ${noun}`} · scroll inside the
      table for more
    </p>
  );
}
