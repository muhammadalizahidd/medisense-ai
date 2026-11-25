import { Check, Lock, Workflow } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The AI mark: a hollow diamond. Everything AI drafted or suggested carries it, and nothing else
 * does. It replaces the old sparkle, wand and pen icons.
 */
export function AiIcon({ className }: { className?: string }) {
  return (
    <svg
      data-ai-only
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("size-4 flex-none", className)}
    >
      <path d="M8 1.75 14.25 8 8 14.25 1.75 8Z" />
      <path d="M8 5.6 10.4 8 8 10.4 5.6 8Z" />
    </svg>
  );
}

/** Kept under its old name so existing AI labels pick up the new mark. */
export const PenNib = AiIcon;

/** The mark for rules and automation: computed or routed by a rule, never by AI. */
export function RuleIcon({ className }: { className?: string }) {
  return (
    <Workflow className={cn("size-4 flex-none", className)} strokeWidth={1.75} aria-hidden="true" />
  );
}

/** The label every AI output carries until a named person approves it. */
export function DraftLabel({
  children = "AI draft · clinician review required",
  meta,
}: {
  children?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div data-ai-only className="flex flex-wrap items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-caption font-semibold text-ink-700">
        <AiIcon className="size-3.5" />
        {children}
      </span>
      {meta && <span className="text-caption font-medium text-ink-500">{meta}</span>}
    </div>
  );
}

export function ApprovedLabel({ children, meta }: { children: ReactNode; meta?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-small font-semibold text-healthy">
        <Check className="size-4" strokeWidth={2} aria-hidden="true" />
        {children}
      </span>
      {meta && <span className="text-caption font-medium text-ink-500">{meta}</span>}
    </div>
  );
}

/** The draft surface for AI content (dashed edge). Switches to a plain card once approved. */
export function draftSurface(approved: boolean) {
  return approved ? "rounded-card border border-border bg-surface" : "surface-draft rounded-card";
}

/** A small "AI draft" chip, for lists and rows where a full label doesn't fit. */
export function AiChip({ children = "AI draft" }: { children?: ReactNode }) {
  return (
    <span
      data-ai-only
      className="inline-flex h-5 items-center gap-1 rounded-tag border border-dashed border-draft-rule bg-draft px-1.5 text-label font-semibold tracking-[0.06em] text-ink-700 uppercase"
    >
      <AiIcon className="size-3" />
      {children}
    </span>
  );
}

/** A rule or automation marker: solid outline, never the AI mark. */
export function RuleMark({ children = "Rule" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-tag border border-border-strong px-1.5 text-label font-semibold tracking-[0.06em] text-ink-700 uppercase">
      <RuleIcon className="size-3" />
      {children}
    </span>
  );
}

/** A person's decision or signature: name, role, when, and the lock that makes it final. */
export function Signature({
  name,
  role,
  when,
  label = "Signed",
}: {
  name: string;
  role?: string;
  when: string;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-control border border-border bg-surface px-3.5 py-2.5">
      <Lock className="size-4 flex-none text-ink-500" strokeWidth={1.75} aria-hidden="true" />
      <div className="min-w-0 leading-tight">
        <p className="text-small font-semibold text-ink-900">
          {label} by {name}
          {role && <span className="font-medium text-ink-500"> · {role}</span>}
        </p>
        <p className="text-caption text-ink-500">{when}</p>
      </div>
    </div>
  );
}

/**
 * An AI draft block: the draft surface, the AI label and an optional "suggestions only" note.
 * While `generating`, a calm shimmer stands in for the content.
 */
export function AiDraft({
  label = "AI draft",
  suggestionsOnly = false,
  generating = false,
  meta,
  children,
  className,
}: {
  label?: ReactNode;
  suggestionsOnly?: boolean;
  generating?: boolean;
  meta?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section data-ai-only className={cn("rounded-card p-4 surface-draft", className)}>
      <DraftLabel meta={meta}>
        {label}
        {suggestionsOnly && <span className="font-medium text-ink-500"> · suggestions only</span>}
      </DraftLabel>
      {generating ? (
        <div role="status" aria-label="Drafting" className="mt-3 flex flex-col gap-2">
          <span className="ai-shimmer h-3 w-11/12 rounded-tag" />
          <span className="ai-shimmer h-3 w-9/12 rounded-tag" />
          <span className="ai-shimmer h-3 w-10/12 rounded-tag" />
        </div>
      ) : (
        children && <div className="mt-3">{children}</div>
      )}
    </section>
  );
}
