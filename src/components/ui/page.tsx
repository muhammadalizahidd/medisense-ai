import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PageContainer({ children }: { children: ReactNode }) {
  return <main className="w-full px-4 pt-4 pb-18 md:px-6 md:pt-5 xl:px-10">{children}</main>;
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
  const block = "animate-pulse rounded-card bg-sunken motion-reduce:animate-none";
  return (
    <main className="w-full px-4 pt-6 pb-18 md:px-6 md:pt-8 xl:px-10" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="mb-6 border-b border-border pb-5">
        <div className="h-3 w-32 animate-pulse rounded-tag bg-sunken motion-reduce:animate-none" />
        <div className="mt-3 h-8 w-80 max-w-full animate-pulse rounded-control bg-sunken motion-reduce:animate-none" />
      </div>
      <div className={cn(block, "mb-6 h-24")} />
      <div className={cn(block, "h-72")} />
    </main>
  );
}
