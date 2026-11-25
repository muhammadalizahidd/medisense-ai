"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "./button";
import { useOverlayStack, useScrollLock } from "./overlay";

/**
 * A small box that asks one question over the page, for a decision that needs no screen of its
 * own. Escape, the backdrop and the first button all cancel, and focus starts on that button.
 */
export function ConfirmDialog({
  title,
  confirmLabel,
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  keepWords = false,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  /** Shown as written even while the page is rewording text. */
  keepWords?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const titleId = useId();
  const bodyId = useId();
  const { isTop } = useOverlayStack(title, onClose);
  useScrollLock();

  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const opener = document.activeElement;
    const buttons = () =>
      Array.from(panel.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []);
    buttons()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (!isTop()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
        return;
      }
      if (event.key !== "Tab") return;
      const all = buttons();
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
      data-keep-words={keepWords || undefined}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-scrim"
      />
      <div
        ref={panel}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="dialog-panel relative w-full max-w-110 rounded-sheet bg-raised p-5 shadow-overlay"
      >
        <h2 id={titleId} className="text-section font-semibold text-ink-900">
          {title}
        </h2>
        <div id={bodyId} className="mt-2 flex flex-col gap-3 text-small text-ink-700">
          {children}
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "danger" : "primary"} loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
