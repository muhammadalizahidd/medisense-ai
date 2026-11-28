import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/*
 * Overlays (sheets, dialogs, prompts) can open on top of each other. Only the topmost one answers
 * Escape and keeps Tab inside it, so closing a prompt never also closes the dialog behind it. The
 * stack also tells each overlay what is open underneath it, which is what its breadcrumbs show.
 */

export type Overlay = { id: symbol; title: string; close: () => void };

const none: Overlay[] = [];
let stack: Overlay[] = none;
const listeners = new Set<() => void>();
const set = (next: Overlay[]) => {
  stack = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** One frame for every popup on the platform. */
export const OVERLAY_FRAME =
  "fixed inset-0 flex items-stretch justify-center sm:items-center sm:p-6";

/**
 * How wide a popup is on a large screen: `sm` for a reason or a confirmation, `md` for reading
 * or a short form, `lg` (the default) for a record with work beside its history. Every popup is
 * only as tall as what it holds, up to 90% of the screen, and fills the screen on a phone.
 */
export type OverlaySize = "sm" | "md" | "lg";

const OVERLAY_WIDTH: Record<OverlaySize, string> = {
  sm: "sm:max-w-xl",
  md: "sm:max-w-3xl",
  lg: "sm:max-w-295",
};

export const overlayPanel = (size: OverlaySize = "lg") =>
  `dialog-panel relative flex h-full w-full flex-col overflow-hidden bg-raised shadow-overlay sm:h-auto sm:max-h-[90dvh] sm:rounded-sheet ${OVERLAY_WIDTH[size]}`;

export const OVERLAY_PANEL = overlayPanel();

/** Registers an overlay while it is mounted; says whether it is on top and what is under it. */
export function useOverlayStack(title: string, onClose: () => void) {
  const [id] = useState(() => Symbol("overlay"));
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    set([...stack, { id, title: "", close: () => close.current() }]);
    return () => set(stack.filter((o) => o.id !== id));
  }, [id]);
  useEffect(() => {
    set(stack.map((o) => (o.id === id ? { ...o, title } : o)));
  }, [id, title]);
  const all = useSyncExternalStore(
    subscribe,
    () => stack,
    () => none,
  );
  const at = all.findIndex((o) => o.id === id);
  return {
    isTop: () => stack[stack.length - 1]?.id === id,
    below: at < 0 ? none : all.slice(0, at),
  };
}

/** Stops the page behind an overlay from scrolling while it is open. */
export function useScrollLock() {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
}
