"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { OVERLAY_FRAME, OVERLAY_PANEL, useOverlayStack, useScrollLock } from "./overlay";
import { OverlayCrumbs } from "./overlay-crumbs";

const FOCUSABLE = "button, input, select, textarea, a[href]";

/**
 * A panel over the right of the screen for one focused task; on phones it rises from the bottom.
 * Escape or the backdrop closes it, focus stays inside and returns to the opener.
 */
export function Sheet({
  title,
  description,
  onClose,
  children,
  footer,
  above = false,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Opens above a dialog or another sheet. */
  above?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const { isTop, below } = useOverlayStack(title, onClose);
  useScrollLock();

  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const opener = document.activeElement;
    const node = panel.current;
    const items = () => Array.from(node?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const list = items().filter((el) => !el.closest("[data-crumbs]"));
    (list.find((el) => el.matches("input, select, textarea")) ?? list[0])?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (!isTop()) return;
      if (event.key === "Escape") close.current();
      if (event.key !== "Tab") return;
      const list = items();
      const first = list[0];
      const last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (opener instanceof HTMLElement) opener.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- set up once; isTop reads a stable stack
  }, []);

  return createPortal(
    <div className={`${OVERLAY_FRAME} ${above ? "z-60" : "z-50"}`}>
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-scrim"
      />
      <div ref={panel} role="dialog" aria-modal="true" aria-label={title} className={OVERLAY_PANEL}>
        <OverlayCrumbs title={title} below={below} onClose={onClose} />
        <header className="flex items-start justify-between gap-3 border-b border-border px-6 py-5">
          <div className="min-w-0">
            <h2 className="type-display text-h2">{title}</h2>
            {description && <div className="mt-1 text-small text-ink-700">{description}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="flex size-9 flex-none cursor-pointer items-center justify-center rounded-control text-ink-700 hover:bg-sunken"
          >
            <X className="size-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto bg-canvas px-6 py-5">
          {/* Forms keep a readable measure inside the common popup size. */}
          <div className="mx-auto w-full max-w-3xl">{children}</div>
        </div>
        {footer && (
          <footer className="flex flex-wrap items-center gap-2 border-t border-border bg-raised px-6 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
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
