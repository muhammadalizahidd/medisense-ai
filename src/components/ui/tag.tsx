import type { ReactNode } from "react";
import type { CaseloadStatus, Priority } from "@/data/types";
import { cn } from "@/lib/cn";

/**
 * Status tones are tinted with a dot: one primary status per row or record. "outline" (and its
 * alias "meta") is for secondary information such as Telehealth or Invoiced, never tinted.
 * "monitor" is the old name of "watch".
 */
export type TagTone =
  "healthy" | "watch" | "monitor" | "over" | "available" | "neutral" | "outline" | "meta" | "live";

const tones: Record<TagTone, { tag: string; dot?: string }> = {
  healthy: { tag: "bg-healthy-bg text-healthy", dot: "bg-healthy-dot" },
  watch: { tag: "bg-watch-bg text-watch", dot: "bg-watch-dot" },
  monitor: { tag: "bg-watch-bg text-watch", dot: "bg-watch-dot" },
  over: { tag: "bg-over-bg text-over", dot: "bg-over-dot" },
  available: { tag: "bg-available-bg text-available", dot: "bg-available-dot" },
  neutral: { tag: "bg-sunken text-ink-700", dot: "bg-ink-400" },
  outline: { tag: "border border-border-strong font-medium text-ink-700" },
  meta: { tag: "border border-border-strong font-medium text-ink-700" },
  live: { tag: "border border-border text-live", dot: "bg-live-dot" },
};

export function Tag({ tone, children }: { tone: TagTone; children: ReactNode }) {
  const { tag, dot } = tones[tone];
  return (
    <span
      className={cn(
        "inline-flex h-5.5 items-center gap-1.5 rounded-tag px-2 text-caption leading-none font-semibold whitespace-nowrap",
        tag,
      )}
    >
      {dot && <i className={cn("size-1.5 flex-none rounded-full", dot)} aria-hidden="true" />}
      {children}
    </span>
  );
}

export const statusLabels: Record<CaseloadStatus, string> = {
  healthy: "Healthy",
  monitor: "Watch",
  "at-risk": "At Risk",
};

const statusTones: Record<CaseloadStatus, TagTone> = {
  healthy: "healthy",
  monitor: "watch",
  "at-risk": "over",
};

export function StatusTag({ status }: { status: CaseloadStatus }) {
  return <Tag tone={statusTones[status]}>{statusLabels[status]}</Tag>;
}

export const priorityTone: Record<Priority, TagTone> = {
  High: "over",
  Medium: "watch",
  Review: "neutral",
};

export function PriorityTag({ priority }: { priority: Priority }) {
  return <Tag tone={priorityTone[priority]}>{priority}</Tag>;
}
