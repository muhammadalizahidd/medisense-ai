"use client";

import { ArrowLeft, BatteryFull, Signal, Wifi, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/live/client";

/** The device's status bar, shown only when the app is drawn inside a phone on a large screen. */
function StatusBar() {
  const now = useNow();
  const time = now
    ? new Intl.DateTimeFormat("en-AU", {
        hour: "numeric",
        minute: "2-digit",
        hour12: false,
        timeZone: "Australia/Brisbane",
      }).format(now)
    : "";
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 z-20 hidden h-11 items-center justify-between px-7 text-caption font-semibold text-white md:flex"
    >
      <span>{time}</span>
      <span className="flex items-center gap-1">
        <Signal className="size-3.5" strokeWidth={2.5} />
        <Wifi className="size-3.5" strokeWidth={2.5} />
        <BatteryFull className="size-4" strokeWidth={2} />
      </span>
    </div>
  );
}

/** Full-screen on a phone. On a larger screen, a device beside a short description of the app. */
export function PhoneFrame({
  name,
  description,
  features,
  tabs,
  active,
  onTab,
  overlay,
  children,
}: {
  name: string;
  description: string;
  features: string[];
  tabs: { id: string; label: string; icon: LucideIcon; badge?: number }[];
  active: string;
  onTab: (id: string) => void;
  overlay?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="hero-page flex min-h-dvh items-center justify-center gap-16 bg-canvas md:py-8 lg:px-10">
      <div className="fixed top-4 left-4 z-10 hidden md:block">
        <ButtonLink href="/">
          <ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
          Back to Medisense
        </ButtonLink>
      </div>

      <div className="hidden max-w-92 lg:block">
        <h1 className="type-display text-[44px] leading-13">{name}</h1>
        <p className="mt-3 text-body text-ink-700">{description}</p>
        <ul className="mt-6 flex flex-col gap-2.5 text-small text-ink-700">
          {features.map((f) => (
            <li key={f} className="flex gap-2.5">
              <span
                aria-hidden="true"
                className="mt-2 size-1.5 flex-none rounded-full bg-accent-fill"
              />
              {f}
            </li>
          ))}
        </ul>
      </div>

      <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-canvas md:h-197 md:max-h-[calc(100dvh-4rem)] md:w-95 md:rounded-[44px] md:border-10 md:border-ink-900 md:shadow-overlay">
        <span
          aria-hidden="true"
          className="absolute top-2.5 left-1/2 z-30 hidden h-6 w-24 -translate-x-1/2 rounded-full bg-ink-900 md:block"
        />
        <StatusBar />
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pb-28">
          {children}
        </div>
        <nav
          aria-label="App sections"
          className="absolute inset-x-0 bottom-0 z-10 border-t border-border bg-surface/90 backdrop-blur-xl"
        >
          <div className="flex px-1.5 pt-1.5 pb-1">
            {tabs.map(({ id, label, icon: Icon, badge }) => {
              const current = active === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-current={current ? "page" : undefined}
                  onClick={() => onTab(id)}
                  className="group flex h-15 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1 transition-transform duration-150 active:scale-95"
                >
                  <span
                    className={cn(
                      "relative flex h-8 w-15 items-center justify-center rounded-full transition-colors duration-200",
                      current
                        ? "bg-accent-tint text-accent"
                        : "text-ink-500 group-hover:bg-canvas group-hover:text-ink-900",
                    )}
                  >
                    <Icon
                      className="size-5.5 flex-none"
                      strokeWidth={current ? 2.25 : 1.75}
                      aria-hidden="true"
                    />
                    {badge ? (
                      <span className="absolute -top-1 right-2 flex h-4.5 min-w-4.5 items-center justify-center rounded-full border-2 border-surface bg-over-dot px-1 text-label leading-none font-bold text-white">
                        {badge > 9 ? "9+" : badge}
                        <span className="sr-only"> unread</span>
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "max-w-full truncate text-label",
                      current ? "font-bold text-accent" : "font-medium text-ink-500",
                    )}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
          <span
            aria-hidden="true"
            className="mx-auto mb-2 hidden h-1.5 w-32 rounded-full bg-ink-900 md:block"
          />
          <span aria-hidden="true" className="block h-[env(safe-area-inset-bottom)] md:hidden" />
        </nav>
        {overlay}
      </div>
    </div>
  );
}

/** The gradient heading at the top of a phone screen. */
export function AppHeader({
  eyebrow,
  title,
  aside,
  children,
}: {
  eyebrow?: string;
  title: string;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-hero border-b border-border bg-surface px-5 pt-12 pb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <p className="text-caption font-medium text-ink-700">{eyebrow}</p>}
          <h2 className="mt-0.5 type-display text-[28px] leading-8.5">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </header>
  );
}

export function AppCard({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mb-3 rounded-card border border-border bg-surface p-4", className)}>
      {(title || action) && (
        <div className="mb-2.5 flex items-center justify-between gap-2">
          {title && <h3 className="type-display text-section">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** A panel that rises from the bottom, inside the phone. */
export function AppSheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink-900/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[88%] flex-col rounded-t-[28px] bg-raised"
      >
        <header className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
          <h3 className="type-display text-h2">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-canvas text-ink-700"
          >
            <X className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </header>
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && (
          <footer className="flex gap-2 border-t border-border px-5 py-3">{footer}</footer>
        )}
      </div>
    </div>
  );
}
