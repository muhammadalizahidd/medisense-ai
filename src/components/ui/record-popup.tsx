"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Dialog } from "./dialog";

/**
 * The popup for one record (a visit, a task, a claim): its status beside the title, the work on
 * the left, and what happened to it (reminders, history, payments) on the right. On a phone the
 * right column follows the left. Forms keep the plain Sheet.
 */
export function RecordPopup({
  title,
  description,
  meta,
  actions,
  footer,
  onClose,
  above,
  aside,
  children,
}: {
  title: string;
  description?: ReactNode;
  /** Status tags beside the title. */
  meta?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  above?: boolean;
  /** The right-hand column: history, reminders, related records. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog
      title={title}
      description={description}
      meta={meta ? <span className="flex flex-wrap items-center gap-2">{meta}</span> : undefined}
      actions={actions}
      footer={
        footer ? <div className="flex flex-wrap items-center gap-2">{footer}</div> : undefined
      }
      onRequestClose={onClose}
      above={above}
    >
      <div
        className={cn(
          "grid items-start gap-6",
          aside ? "lg:grid-cols-[minmax(0,1fr)_360px]" : "mx-auto w-full max-w-4xl",
        )}
      >
        <div className="flex min-w-0 flex-col gap-5">{children}</div>
        {aside && <aside className="flex min-w-0 flex-col gap-5">{aside}</aside>}
      </div>
    </Dialog>
  );
}

/** The record's key facts side by side on one white card: when, who, where, how much. */
export function RecordFacts({
  facts,
}: {
  facts: { icon: LucideIcon; label: string; value: ReactNode }[];
}) {
  return (
    <dl
      className={cn(
        "grid overflow-hidden rounded-card border border-border bg-surface",
        facts.length >= 3 ? "md:grid-cols-3" : facts.length === 2 ? "md:grid-cols-2" : "",
      )}
    >
      {facts.map(({ icon: Icon, label, value }) => (
        <div
          key={label}
          className="flex gap-3 border-b border-border px-4 py-3.5 last:border-0 md:border-r md:border-b-0 md:[&:nth-child(3n)]:border-r-0"
        >
          <Icon className="mt-0.5 size-4 flex-none text-ink-500" aria-hidden="true" />
          <div className="min-w-0">
            <dt className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
              {label}
            </dt>
            <dd className="text-small text-ink-900">{value}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

/** A titled white card for one part of a record: reminders, history, lines, notes. */
export function RecordCard({
  title,
  icon: Icon,
  aside,
  flush = true,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  /** Small text or a count on the right of the heading. */
  aside?: ReactNode;
  /** True when the body is a list whose rows bring their own padding. */
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-card border border-border bg-surface">
      <h4 className="flex items-center gap-1.5 border-b border-border px-4 py-3 text-small font-semibold text-ink-900">
        {Icon && <Icon className="size-4 text-ink-500" aria-hidden="true" />}
        {title}
        {aside && <span className="ml-auto text-caption font-normal text-ink-500">{aside}</span>}
      </h4>
      <div className={flush ? undefined : "p-4"}>{children}</div>
    </section>
  );
}
