"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Tag, type TagTone } from "@/components/ui/tag";
import type {
  AgreementStatus,
  BookingReadiness,
  Eligibility,
  EvidenceStatus,
  FieldState,
  FundingAlertDto,
  Management,
  PayerStatus,
} from "@/lib/live/funding";
import { cn } from "@/lib/cn";

export const agreementTone: Record<AgreementStatus | "None", TagTone> = {
  Draft: "neutral",
  "Internal Review": "monitor",
  Issued: "available",
  Viewed: "available",
  "Changes Requested": "watch",
  Signed: "healthy",
  Declined: "over",
  Cancelled: "neutral",
  Expired: "over",
  Superseded: "outline",
  None: "outline",
};

export const evidenceTone: Record<
  EvidenceStatus | "Missing" | "Under Review" | "No plan",
  TagTone
> = {
  "Not Received": "neutral",
  Received: "available",
  "Pending Review": "watch",
  Verified: "healthy",
  Rejected: "over",
  Superseded: "outline",
  Missing: "over",
  "Under Review": "watch",
  "No plan": "outline",
};

export const bookingTone: Record<BookingReadiness, TagTone> = {
  Ready: "healthy",
  Conditional: "watch",
  Blocked: "over",
};

export const payerTone: Record<PayerStatus, TagTone> = {
  Draft: "neutral",
  "Awaiting Verification": "watch",
  Verified: "healthy",
  Inactive: "over",
};

export const eligibilityTone: Record<Eligibility, TagTone> = {
  Unknown: "neutral",
  "Needs Review": "watch",
  Confirmed: "healthy",
  "Not Confirmed": "over",
};

export const fieldTone: Record<FieldState, TagTone> = {
  "Participant-reported": "watch",
  Verified: "healthy",
  Rejected: "over",
};

export const severityTone: Record<FundingAlertDto["severity"], TagTone> = {
  high: "over",
  medium: "watch",
  low: "neutral",
};

/** Plan Managed, Self-Managed, Agency Managed and Unknown each get their own chip colour. */
export function ManagementChip({ value }: { value: Management | string }) {
  const tone =
    value === "Plan Managed"
      ? "bg-accent-tint text-accent"
      : value === "Self-Managed"
        ? "bg-available-bg text-available"
        : value === "Agency Managed"
          ? "bg-healthy-bg text-healthy"
          : "bg-sunken text-ink-700";
  return (
    <span
      className={cn(
        "inline-flex h-5.5 items-center rounded-tag px-2 text-caption leading-none font-semibold whitespace-nowrap",
        tone,
      )}
    >
      {value || "Not recorded"}
    </span>
  );
}

export function StatusTag({ tone, children }: { tone: TagTone; children: ReactNode }) {
  return <Tag tone={tone}>{children}</Tag>;
}

/** A titled card with an icon header, optional action and footer. */
export function FCard({
  icon: Icon,
  title,
  sub,
  action,
  children,
  footer,
  className,
  flush = false,
}: {
  icon: LucideIcon;
  title: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section
      className={cn(
        "flex flex-col overflow-hidden rounded-card border border-border bg-surface shadow-lift",
        className,
      )}
    >
      {/* A fixed header height keeps titles level across a row, with or without a subtitle. */}
      <header className="flex min-h-16 flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <span className="flex size-8 flex-none items-center justify-center rounded-control bg-accent-tint text-accent">
          <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-section font-semibold text-ink-900">{title}</h2>
          {sub && <p className="text-caption text-ink-500">{sub}</p>}
        </div>
        {action}
      </header>
      <div className={cn("flex-1", !flush && "p-5")}>{children}</div>
      {footer && (
        <footer className="flex flex-wrap items-center gap-3 border-t border-border bg-canvas px-5 py-3">
          {footer}
        </footer>
      )}
    </section>
  );
}

/** A small label-over-value fact. */
export function Fact({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">{label}</dt>
      <dd className={cn("mt-0.5 truncate text-small text-ink-900", mono && "font-mono")}>
        {children}
      </dd>
    </div>
  );
}

/** "Local estimate" or "participant-reported" caveats sit beside figures, never hidden. */
export function Caveat({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-tag border border-dashed border-border-strong px-1.5 text-label font-semibold tracking-wide text-ink-500 uppercase">
      {children}
    </span>
  );
}

export const th = "px-4 py-3 font-medium whitespace-nowrap";
export const td = "px-4 py-3 align-top";

export function relativeDays(days: number | null) {
  if (days === null) return "No end date";
  if (days < 0) return `Ended ${-days} day${days === -1 ? "" : "s"} ago`;
  if (days === 0) return "Ends today";
  return `${days} day${days === 1 ? "" : "s"} left`;
}

export function dayLabel(iso: string) {
  if (!iso) return "Not recorded";
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  // A plain date stays as written; a timestamp is shown as its Brisbane day.
  return iso.length > 10
    ? new Intl.DateTimeFormat("en-AU", { ...opts, timeZone: "Australia/Brisbane" }).format(
        new Date(iso),
      )
    : new Intl.DateTimeFormat("en-AU", opts).format(new Date(`${iso}T00:00:00`));
}
