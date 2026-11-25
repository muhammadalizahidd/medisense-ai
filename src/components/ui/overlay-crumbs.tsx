import { ChevronLeft, ChevronRight } from "lucide-react";
import { Fragment } from "react";
import type { Overlay } from "./overlay";

/** The page's own name, from the browser tab: "Reports and analytics · Medisense". */
const pageName = () =>
  (typeof document === "undefined" ? "" : document.title.split(" · ")[0]) || "Page";

/**
 * Where you are, at the top of every popup: the page, each popup opened on the way, then this one.
 * Choosing a step closes everything opened after it.
 */
export function OverlayCrumbs({
  title,
  below,
  onClose,
}: {
  title: string;
  below: Overlay[];
  onClose: () => void;
}) {
  /** Closes this popup, then those under it down to (not including) the chosen step. */
  const backTo = (index: number) => {
    onClose();
    below
      .slice(index + 1)
      .reverse()
      .forEach((o) => o.close());
  };
  const link = "max-w-60 cursor-pointer truncate text-accent hover:underline";
  const chevron = <ChevronRight className="size-3.5 flex-none text-ink-500" aria-hidden="true" />;
  return (
    <nav
      aria-label="Breadcrumb"
      data-crumbs
      className="flex min-h-11 flex-wrap items-center gap-x-1.5 border-b border-border bg-surface py-1.5 pr-16 pl-3 text-small sm:pl-4"
    >
      <button
        type="button"
        onClick={onClose}
        className="mr-2 flex h-8 flex-none cursor-pointer items-center gap-1 rounded-control px-2 font-semibold text-ink-900 hover:bg-sunken"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Back
      </button>
      <button type="button" className={link} onClick={() => backTo(-1)}>
        {pageName()}
      </button>
      {below.map((o, i) => (
        <Fragment key={o.title + String(i)}>
          {chevron}
          <button type="button" className={link} onClick={() => backTo(i)}>
            {o.title}
          </button>
        </Fragment>
      ))}
      {chevron}
      <span aria-current="page" className="max-w-80 truncate font-semibold text-ink-900">
        {title}
      </span>
    </nav>
  );
}
