"use client";

import { Star } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tag, type TagTone } from "@/components/ui/tag";
import { useLiveStatus } from "@/lib/live/client";
import type { CaseloadStatus } from "@/lib/live/catalogue";
import type { ClientStage, NeedStatus } from "@/lib/live/types";
import { cn } from "@/lib/cn";

/** Shows whether changes are arriving live, so nobody waits on a stale screen. */
export function LiveBadge() {
  const status = useLiveStatus();
  const label = status === "live" ? "Live" : status === "connecting" ? "Reconnecting…" : "Offline";
  return (
    <span
      role="status"
      className={cn(
        "inline-flex h-6.5 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 text-caption font-semibold",
        status === "live" ? "text-live" : status === "connecting" ? "text-watch" : "text-ink-500",
      )}
    >
      <i
        aria-hidden="true"
        className={cn(
          "size-1.75 rounded-full",
          status === "live"
            ? "bg-live-dot motion-safe:animate-pulse"
            : status === "connecting"
              ? "bg-watch-dot"
              : "bg-ink-400",
        )}
      />
      {label}
    </span>
  );
}

export const stageTone: Record<ClientStage, TagTone> = {
  "Needs a therapist": "over",
  "Waiting for therapist": "watch",
  Active: "healthy",
  Discharged: "neutral",
};

export function StageTag({ stage }: { stage: ClientStage }) {
  return <Tag tone={stageTone[stage]}>{stage}</Tag>;
}

/** Service request statuses in the requirements' words (section 3.1). */
export const needLabel: Record<NeedStatus, string> = {
  "needs-therapist": "Approved · awaiting clinician",
  waiting: "Clinician suggested",
  assigned: "Active",
  completed: "Completed",
};

export const needTone: Record<NeedStatus, TagTone> = {
  "needs-therapist": "over",
  waiting: "watch",
  assigned: "healthy",
  completed: "neutral",
};

const caseloadTone: Record<CaseloadStatus, TagTone> = {
  Healthy: "healthy",
  Watch: "watch",
  "At Risk": "over",
};

export function CaseloadTag({ status }: { status: CaseloadStatus }) {
  return <Tag tone={caseloadTone[status]}>{status}</Tag>;
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-over-bg bg-over-bg px-4 py-3 text-small text-over"
    >
      <span>{message}</span>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Empty state: a dashed card, one sentence and at most one action. */
export function EmptyNote({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-dashed border-border-strong px-6 py-10 text-center">
      <p className="text-small font-semibold text-ink-900">{title}</p>
      {children && <div className="mt-1 text-small text-ink-700">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block animate-pulse rounded-control bg-sunken motion-reduce:animate-none",
        className,
      )}
    />
  );
}

export function Panel({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cn("overflow-hidden rounded-card border border-border bg-surface", className)}
    >
      <div className="flex min-h-13 items-center justify-between gap-3 border-b border-border px-5 py-3">
        <h2 className="text-section font-semibold text-ink-900">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

/** A rating out of five. With `onChange` it becomes a keyboard-friendly radio group. */
export function Stars({
  value,
  onChange,
  size = "sm",
}: {
  value: number;
  onChange?: (value: number) => void;
  size?: "sm" | "lg";
}) {
  const icon = size === "lg" ? "size-8" : "size-4";
  if (!onChange) {
    return (
      <span role="img" aria-label={`${value} out of 5`} className="inline-flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            aria-hidden="true"
            className={cn(
              icon,
              n <= Math.round(value) ? "fill-watch-dot text-watch-dot" : "text-border-strong",
            )}
          />
        ))}
      </span>
    );
  }
  return (
    <span role="radiogroup" aria-label="Rating" className="inline-flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} out of 5`}
          onClick={() => onChange(n)}
          className="cursor-pointer rounded-control p-0.5"
        >
          <Star
            aria-hidden="true"
            className={cn(
              icon,
              n <= value ? "fill-watch-dot text-watch-dot" : "text-border-strong",
            )}
          />
        </button>
      ))}
    </span>
  );
}
