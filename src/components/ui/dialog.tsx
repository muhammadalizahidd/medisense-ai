"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { useOverlayStack, useScrollLock } from "./overlay";

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, a[href], [tabindex]:not([tabindex="-1"])';

/**
 * A large, centred dialog for a task that needs the whole screen's attention, such as editing one
 * role's permissions. The header, toolbar and footer stay put while the body scrolls. Escape, the
 * close button or the backdrop all call `onRequestClose`, so the caller can ask before discarding
 * unsaved work. On a phone it fills the screen.
 */
export function Dialog({
  title,
  description,
  meta,
  actions,
  toolbar,
  footer,
  onRequestClose,
  size = "lg",
  above = false,
  plain = false,
  flush = false,
  children,
}: {
  title: string;
  description?: ReactNode;
  /** Small labels beside the title: tags, who holds it, and so on. */
  meta?: ReactNode;
  /** Secondary actions, shown beside the close button. */
  actions?: ReactNode;
  /** A fixed strip under the header: search, filters, counts. */
  toolbar?: ReactNode;
  footer?: ReactNode;
  onRequestClose: () => void;
  /** sm 448px for a question; md 672px for a form; wide 768px for a list; lg for a workspace. */
  size?: "sm" | "md" | "wide" | "lg";
  /** A white body, for forms and cards that were built on one. */
  plain?: boolean;
  /** No padding around the body, for lists that run edge to edge. */
  flush?: boolean;
  /** Opens above another dialog or sheet. */
  above?: boolean;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const request = useRef(onRequestClose);
  const isTop = useOverlayStack();
  useScrollLock();

  useEffect(() => {
    request.current = onRequestClose;
  });

  useEffect(() => {
    const opener = document.activeElement;
    const node = panel.current;
    const items = () => Array.from(node?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    // Start on whatever asks for it, else the first field, else the first control that isn't the
    // close button.
    const list = items();
    (
      list.find((el) => el.hasAttribute("data-autofocus")) ??
      list.find((el) => el.matches("input, textarea")) ??
      list[1] ??
      list[0]
    )?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (!isTop()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        request.current();
        return;
      }
      if (event.key !== "Tab") return;
      const all = items();
      const first = all[0];
      const last = all[all.length - 1];
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
    <div
      className={cn(
        "fixed inset-0 flex items-stretch justify-center sm:items-center sm:p-6",
        above ? "z-60" : "z-50",
      )}
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={() => request.current()}
        className="absolute inset-0 cursor-default bg-scrim"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "dialog-panel relative flex h-full w-full flex-col overflow-hidden bg-raised shadow-overlay sm:h-auto sm:max-h-[90dvh] sm:rounded-sheet",
          {
            sm: "sm:max-w-md",
            md: "sm:max-w-2xl",
            wide: "sm:max-w-3xl",
            lg: "sm:max-w-295",
          }[size],
        )}
      >
        <header className="relative flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-6 sm:py-5">
          <div className="min-w-0 flex-1 pr-12 sm:pr-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="type-display text-h2 leading-tight">{title}</h2>
              {meta}
            </div>
            {description && <div className="mt-1 text-small text-ink-700">{description}</div>}
          </div>
          {actions && (
            <div className="flex flex-wrap items-center gap-2 sm:flex-none">{actions}</div>
          )}
          <button
            type="button"
            onClick={() => request.current()}
            aria-label={`Close ${title}`}
            className="absolute top-3 right-3 flex size-10 flex-none cursor-pointer items-center justify-center rounded-control text-ink-700 transition-colors duration-(--duration-fast) hover:bg-sunken hover:text-ink-900 sm:static sm:order-last"
          >
            <X className="size-5" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </header>
        {toolbar && (
          <div className="border-b border-border bg-surface px-5 py-3 sm:px-6">{toolbar}</div>
        )}
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto",
            plain ? "bg-raised" : "bg-canvas",
            !flush && "px-5 py-5 sm:px-6",
          )}
        >
          {children}
        </div>
        {footer && (
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-raised px-5 py-3.5 sm:px-6">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
