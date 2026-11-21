import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PageContainer({ children }: { children: ReactNode }) {
  return <main className="w-full px-4 pt-6 pb-18 md:px-6 md:pt-8 xl:px-10">{children}</main>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  leading,
  display = false,
  align = "end",
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
  display?: boolean;
  align?: "end" | "center";
}) {
  return (
    <header
      className={cn(
        "page-hero mb-8 flex flex-wrap justify-between gap-4 border-b border-border pb-6",
        align === "end" ? "items-end" : "items-center",
      )}
    >
      <div className="flex items-center gap-4">
        {leading}
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className={cn("headline", display ? "mt-2 text-display" : "mt-2 text-h1")}>
            {title}
          </h1>
          {description && (
            <p className={cn("mt-1 text-ink-700", display ? "mt-1.5 text-body" : "text-small")}>
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A page title without an eyebrow, for screens built around one clear focal point. */
export function ScreenTitle({
  title,
  description,
  actions,
  display = false,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  display?: boolean;
}) {
  return (
    <header className="page-hero mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-180">
        <h1 className={cn("headline", display ? "text-display" : "text-h1")}>{title}</h1>
        {description && <div className="mt-1.5 text-body text-ink-700">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Shown while a signed-in page checks the session and loads, so the frame appears at once. */
export function PageLoading() {
  return (
    <main className="w-full px-4 pt-6 pb-18 md:px-6 md:pt-8 xl:px-10" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="mb-8 h-32 animate-pulse rounded-card bg-border motion-reduce:animate-none" />
      <div className="h-64 animate-pulse rounded-card bg-border motion-reduce:animate-none" />
    </main>
  );
}

const pulse = "animate-pulse rounded-card bg-border motion-reduce:animate-none";

/**
 * A page-shaped placeholder (title, four figures, two chart cards, a list) shown while a
 * screen streams in. It matches the dashboard layout so content replaces it without a jump.
 */
export function DashboardLoading() {
  return (
    <main className="w-full px-4 pt-6 pb-18 md:px-6 md:pt-8 xl:px-10" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="mb-8 space-y-3">
        <div className={cn(pulse, "h-3 w-24")} />
        <div className={cn(pulse, "h-9 w-80 max-w-full")} />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={cn(pulse, "h-28")} />
        ))}
      </div>
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className={cn(pulse, "h-72")} />
        <div className={cn(pulse, "h-72")} />
      </div>
      <div className={cn(pulse, "h-56")} />
    </main>
  );
}

/** A phone app loading: the device with a header, a hero card and list rows. */
export function PhoneLoading() {
  const pulse = "animate-pulse bg-sunken motion-reduce:animate-none";
  return (
    <div
      className="flex min-h-dvh items-center justify-center bg-canvas md:py-8"
      aria-busy="true"
      role="status"
    >
      <span className="sr-only">Loading…</span>
      <div className="flex h-dvh w-full flex-col overflow-hidden bg-page md:h-197 md:max-h-[calc(100dvh-4rem)] md:w-95 md:rounded-[48px] md:border-[11px] md:border-ink-900 md:shadow-overlay">
        <div className="px-5 pt-14 pb-5">
          <div className={cn(pulse, "h-3 w-28 rounded-tag")} />
          <div className={cn(pulse, "mt-3 h-8 w-52 rounded-control")} />
        </div>
        <div className="flex flex-1 flex-col gap-3 px-4">
          <div className={cn(pulse, "h-36 rounded-card")} />
          <div className="grid grid-cols-2 gap-2.5">
            <div className={cn(pulse, "h-16 rounded-card")} />
            <div className={cn(pulse, "h-16 rounded-card")} />
          </div>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-card border border-border bg-surface p-3"
            >
              <div className={cn(pulse, "size-10 flex-none rounded-full")} />
              <div className="flex-1">
                <div className={cn(pulse, "h-3.5 w-32 rounded-tag")} />
                <div className={cn(pulse, "mt-2 h-3 w-20 rounded-tag")} />
              </div>
            </div>
          ))}
        </div>
        <div className="flex h-17 items-center justify-around border-t border-border bg-surface px-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={cn(pulse, "size-6 rounded-control")} />
          ))}
        </div>
      </div>
    </div>
  );
}
