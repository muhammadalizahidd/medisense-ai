"use client";

import { useCallback, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type TabDef<T extends string> = {
  id: T;
  label: string;
  /** A count beside the label; `alert` makes it stand out (things waiting for action). */
  count?: number;
  alert?: boolean;
};

/**
 * Which tab is open, kept in the address (?tab=…) so a refresh or a shared link opens the same
 * tab. Falls back to the first tab.
 */
export function useTab<T extends string>(tabs: readonly TabDef<T>[], fallback?: T) {
  const [tab, setTabState] = useState<T>(() => {
    const first = fallback ?? tabs[0]!.id;
    if (typeof window === "undefined") return first;
    const wanted = new URLSearchParams(window.location.search).get("tab");
    return (tabs.find((t) => t.id === wanted)?.id ?? first) as T;
  });
  const setTab = useCallback((next: T) => {
    setTabState(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", url);
  }, []);
  return [tab, setTab] as const;
}

/** A tab bar that stays visible under the top bar while the page scrolls. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: readonly TabDef<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}) {
  function onKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length]!;
    onChange(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  }
  return (
    <div
      className={cn(
        "sticky top-16 z-10 -mx-1 mb-6 bg-page/90 px-1 pt-1 pb-2 backdrop-blur",
        className,
      )}
    >
      <div
        role="tablist"
        aria-label={label}
        className="flex gap-1 overflow-x-auto rounded-card border border-border bg-surface p-1"
      >
        {tabs.map((t, i) => {
          const active = t.id === value;
          return (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`panel-${t.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(t.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "flex h-10 flex-none cursor-pointer items-center gap-2 rounded-control px-4 text-small whitespace-nowrap transition-colors duration-160",
                active
                  ? "bg-accent-fill font-semibold text-on-accent shadow-hairline"
                  : "font-medium text-ink-700 hover:bg-canvas hover:text-ink-900",
              )}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span
                  className={cn(
                    "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-label font-bold",
                    active
                      ? "bg-white/25 text-on-accent"
                      : t.alert
                        ? "bg-over-dot text-white"
                        : "bg-canvas text-ink-700",
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TabPanel<T extends string>({
  id,
  value,
  children,
}: {
  id: T;
  value: T;
  children: ReactNode;
}) {
  if (id !== value) return null;
  return (
    <div
      role="tabpanel"
      id={`panel-${id}`}
      aria-labelledby={`tab-${id}`}
      className="flex flex-col gap-6"
    >
      {children}
    </div>
  );
}
