"use client";

import { CircleHelp, ListChecks, Target, Workflow } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { isStandalone } from "@/lib/navigation";
import { guideFor, type PageGuide } from "@/lib/page-guides";
import { cn } from "@/lib/cn";

/** The guide panel: purpose, what you can do, how it works, and what you get. */
function GuidePanel({ guide, onClose }: { guide: PageGuide; onClose: () => void }) {
  return (
    <Sheet title={guide.title} description="Page guide" onClose={onClose}>
      <div className="flex flex-col gap-6">
        <section>
          <h3 className="mb-1.5 flex items-center gap-2 text-section font-semibold text-ink-900">
            <CircleHelp className="size-4 text-accent" aria-hidden="true" /> What this page is for
          </h3>
          <p className="text-body text-ink-700">{guide.purpose}</p>
        </section>
        <section>
          <h3 className="mb-1.5 flex items-center gap-2 text-section font-semibold text-ink-900">
            <ListChecks className="size-4 text-accent" aria-hidden="true" /> What you can do here
          </h3>
          <ul className="flex flex-col gap-1.5">
            {guide.can.map((c) => (
              <li key={c} className="flex gap-2 text-body text-ink-700">
                <span
                  aria-hidden="true"
                  className="mt-2 size-1.5 flex-none rounded-full bg-accent-fill"
                />
                {c}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="mb-1.5 flex items-center gap-2 text-section font-semibold text-ink-900">
            <Workflow className="size-4 text-accent" aria-hidden="true" /> How it works
          </h3>
          <ol className="flex flex-col gap-2">
            {guide.steps.map((s, i) => (
              <li key={s} className="flex gap-3 text-body text-ink-700">
                <span className="flex size-6 flex-none items-center justify-center rounded-full bg-accent-tint text-caption font-semibold text-accent">
                  {i + 1}
                </span>
                <span className="pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="rounded-card border border-border bg-sunken p-4">
          <h3 className="mb-1 flex items-center gap-2 text-section font-semibold text-ink-900">
            <Target className="size-4 text-accent" aria-hidden="true" /> What you&apos;ll achieve
          </h3>
          <p className="text-body text-ink-700">{guide.outcome}</p>
        </section>
      </div>
    </Sheet>
  );
}

function useGuide() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const guide = guideFor(pathname);
  // "?" opens the guide from anywhere, unless the person is typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "?" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { pathname, guide, open, setOpen };
}

/** The guide button in the top bar, on every page that uses the app shell. */
export function PageGuideButton() {
  const { guide, open, setOpen } = useGuide();
  if (!guide) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Page guide"
        title="Page guide: what this page is for and how to use it (?)"
        className="flex h-9 cursor-pointer items-center gap-1.5 rounded-control px-2 text-small font-medium text-ink-700 transition-colors duration-(--duration-fast) hover:bg-sunken hover:text-ink-900"
      >
        <CircleHelp className="size-4.5" strokeWidth={1.75} aria-hidden="true" />
        <span className="hidden whitespace-nowrap xl:inline">Guide</span>
      </button>
      {open && <GuidePanel guide={guide} onClose={() => setOpen(false)} />}
    </>
  );
}

/** A floating guide button for standalone pages (sign-in, secure links, phone apps). */
export function PageGuideFloating() {
  const { pathname, guide, open, setOpen } = useGuide();
  if (!guide || !isStandalone(pathname)) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Page guide"
        title="Page guide"
        className={cn(
          "fixed top-3 right-3 z-30 flex h-10 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-small font-medium text-ink-700 shadow-overlay transition-colors duration-(--duration-fast) hover:text-ink-900 print:hidden",
        )}
      >
        <CircleHelp className="size-4.5" strokeWidth={1.75} aria-hidden="true" />
        <span className="hidden sm:inline">Guide</span>
      </button>
      {open && <GuidePanel guide={guide} onClose={() => setOpen(false)} />}
    </>
  );
}
