import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PageContainer({ children }: { children: ReactNode }) {
  // One vertical rhythm for every page: each top-level section sits 24px below the last.
  return (
    <main className="w-full px-4 pt-4 pb-18 md:px-6 md:pt-5 xl:px-10 [&>*+*]:mt-6">{children}</main>
  );
}

/**
 * The page header, in two variants only.
 * - compact (default): working pages. Eyebrow, a 32px title, one meta line, actions on the right.
 * - landing (`display`): dashboards and greetings. A flat surface panel with the display title.
 * No gradients, photos or tinted banners.
 */
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
  if (!display) {
    // Compact: one row with the title and actions. The breadcrumb already names the section, so
    // a text eyebrow is dropped; explanatory sentences are dropped too (kept for screen readers).
    // Short facts (an MRN line) and links (a back button) stay.
    const sentence = typeof description === "string" && description.trim().endsWith(".");
    return (
      <header className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          {leading}
          {typeof eyebrow !== "string" && eyebrow && (
            <>
              <div className="flex-none">{eyebrow}</div>
              <span aria-hidden="true" className="h-5 w-px bg-border-strong" />
            </>
          )}
          <h1 className="type-display text-h2 leading-tight text-ink-900">{title}</h1>
          {description &&
            (sentence ? (
              <p className="sr-only">{description}</p>
            ) : (
              <div className="min-w-0 text-small text-ink-500">{description}</div>
            ))}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
    );
  }
  return (
    <header
      className={cn(
        "mb-6 flex flex-wrap justify-between gap-x-6 gap-y-4",
        align === "end" ? "items-end" : "items-center",
        "rounded-card border border-border bg-surface px-5 py-6 md:px-8 md:py-7",
      )}
    >
      <div className="flex min-w-0 items-center gap-4">
        {leading}
        <div className="min-w-0">
          <p className="label-caps">{eyebrow}</p>
          <h1 className="mt-2 type-display text-h1 text-ink-900 md:text-display">{title}</h1>
          {description && (
            <p className="mt-2 max-w-3xl text-body text-ink-700 md:text-[15px]">{description}</p>
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
    <header
      className={cn(
        "mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4",
        display
          ? "rounded-card border border-border bg-surface px-5 py-6 md:px-8 md:py-7"
          : "border-b border-border pb-5",
      )}
    >
      <div className="max-w-180 min-w-0">
        <h1
          className={cn(
            "type-display text-ink-900",
            display ? "text-h1 md:text-display" : "text-h1-compact",
          )}
        >
          {title}
        </h1>
        {description && <div className="mt-1.5 text-small text-ink-700">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Shown while a signed-in page checks the session and loads: the header, a band and a panel. */
export function PageLoading() {
  const pulse = "animate-pulse bg-sunken motion-reduce:animate-none";
  return (
    <main
      className="w-full px-4 pt-6 pb-18 md:px-6 md:pt-8 xl:px-10"
      aria-busy="true"
      role="status"
    >
      <span className="sr-only">Loading…</span>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className={cn(pulse, "h-3 w-28 rounded-tag")} />
          <div className={cn(pulse, "mt-3 h-8 w-72 max-w-full rounded-control")} />
        </div>
        <div className={cn(pulse, "hidden h-10 w-36 rounded-control sm:block")} />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border md:grid-cols-4 xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={cn("bg-surface p-4", i === 4 && "hidden xl:block")}>
            <div className={cn(pulse, "h-3 w-24 rounded-tag")} />
            <div className={cn(pulse, "mt-3 h-7 w-14 rounded-control")} />
          </div>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {[28, 36, 32, 24].map((w) => (
          <div
            key={w}
            className={cn(pulse, "h-9 rounded-control")}
            style={{ width: `${w * 4}px` }}
          />
        ))}
      </div>
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-border px-4 py-3.5 last:border-b-0"
          >
            <div className={cn(pulse, "size-9 flex-none rounded-full")} />
            <div className="min-w-0 flex-1">
              <div className={cn(pulse, "h-3.5 w-48 max-w-full rounded-tag")} />
              <div className={cn(pulse, "mt-2 h-3 w-32 max-w-full rounded-tag")} />
            </div>
            <div className={cn(pulse, "hidden h-6 w-20 rounded-tag md:block")} />
            <div className={cn(pulse, "hidden h-6 w-24 rounded-tag lg:block")} />
          </div>
        ))}
      </div>
    </main>
  );
}

/** The whole app before its frame has loaded: a top bar and a page skeleton, never a blank screen. */
export function ShellLoading() {
  return (
    <div className="min-h-screen bg-page" aria-busy="true">
      <div className="flex h-15 items-center gap-4 border-b border-border px-4 md:px-6 xl:px-10">
        <div className="size-8 animate-pulse rounded-control bg-sunken motion-reduce:animate-none" />
        <div className="h-9 w-full max-w-md animate-pulse rounded-control bg-sunken motion-reduce:animate-none" />
        <div className="ml-auto size-9 animate-pulse rounded-full bg-sunken motion-reduce:animate-none" />
      </div>
      <PageLoading />
    </div>
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

const blockPulse = "animate-blockPulse rounded-card bg-sunken motion-reduce:animate-none";

/**
 * A page-shaped placeholder (title, four figures, two chart cards, a list) shown while a
 * screen streams in. It matches the dashboard layout so content replaces it without a jump.
 */
export function DashboardLoading() {
  return (
    <main className="w-full px-4 pt-6 pb-18 md:px-6 md:pt-8 xl:px-10" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="mb-8 space-y-3">
        <div className={cn(blockPulse, "h-3 w-24")} />
        <div className={cn(blockPulse, "h-9 w-80 max-w-full")} />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={cn(blockPulse, "h-28")} />
        ))}
      </div>
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className={cn(blockPulse, "h-72")} />
        <div className={cn(blockPulse, "h-72")} />
      </div>
      <div className={cn(blockPulse, "h-56")} />
    </main>
  );
}
