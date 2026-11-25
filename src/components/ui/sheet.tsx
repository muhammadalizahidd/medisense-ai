"use client";

import { type ReactNode } from "react";
import { Dialog } from "./dialog";

/**
 * One focused task in a centred window over the page (it rises from the bottom on a phone). It
 * used to slide in from the right; every task now opens the same way, in the middle of the screen.
 * Escape, the close button or the backdrop close it; focus stays inside and returns to the opener.
 */
export function Sheet({
  title,
  description,
  onClose,
  children,
  footer,
  above = false,
  size = "md",
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Opens above a dialog or another sheet. */
  above?: boolean;
  /** md suits a form; wide suits a list or a two-column form. */
  size?: "sm" | "md" | "wide";
}) {
  return (
    <Dialog
      title={title}
      description={description}
      onRequestClose={onClose}
      footer={
        footer ? <div className="flex flex-wrap items-center gap-2">{footer}</div> : undefined
      }
      above={above}
      size={size}
      plain
    >
      {children}
    </Dialog>
  );
}

export const inputClass =
  "h-10 w-full rounded-(--radius-field) border border-border-strong bg-surface px-3 text-small text-ink-900 outline-none transition-colors duration-(--duration-fast) placeholder:text-ink-400 hover:border-ink-400 focus:border-accent focus:shadow-focus aria-invalid:border-over disabled:bg-sunken disabled:text-ink-500";

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-caption font-semibold text-ink-700">{label}</span>
      {children}
      {error ? (
        <span className="text-caption font-medium text-over">{error}</span>
      ) : (
        hint && <span className="text-caption text-ink-500">{hint}</span>
      )}
    </label>
  );
}
