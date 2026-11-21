"use client";

import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

type Tone = "success" | "info" | "warning" | "error";
type Toast = { id: number; tone: Tone; message: string; detail?: string };

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

/**
 * Confirms a decision ("Referral accepted", "Note signed"). Shows bottom-right for a few seconds;
 * errors stay until dismissed.
 */
export function toast(message: string, options: { tone?: Tone; detail?: string } = {}) {
  const item: Toast = {
    id: nextId++,
    tone: options.tone ?? "success",
    message,
    detail: options.detail,
  };
  toasts = [...toasts.slice(-2), item];
  emit();
  if (item.tone !== "error") window.setTimeout(() => dismiss(item.id), 4500);
}

const icons = { success: CircleCheck, info: Info, warning: TriangleAlert, error: CircleAlert };
const iconTone = {
  success: "text-healthy",
  info: "text-available",
  warning: "text-watch",
  error: "text-over",
};

/** Render once in the root layout. */
export function Toaster() {
  const items = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => toasts,
    () => toasts,
  );
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-20 z-50 flex w-88 max-w-[calc(100vw-2rem)] flex-col gap-2 md:right-6 md:bottom-6"
    >
      {items.map((t) => {
        const Icon = icons[t.tone];
        return (
          <div
            key={t.id}
            className="toast-in pointer-events-auto flex items-start gap-3 rounded-card border border-border bg-raised px-4 py-3 shadow-overlay"
          >
            <Icon className={cn("mt-0.5 size-4 flex-none", iconTone[t.tone])} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-small font-semibold text-ink-900">{t.message}</p>
              {t.detail && <p className="mt-0.5 text-caption text-ink-500">{t.detail}</p>}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="-mr-1 flex size-7 flex-none cursor-pointer items-center justify-center rounded-control text-ink-500 hover:bg-sunken"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
