"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Select } from "./select";

const SIZES = [10, 25, 50, 100];

/**
 * Pages a list for a table: the rows on the current page and the controls beneath. A page past
 * the end (after filtering) falls back to the last one, so a filter never shows an empty page.
 */
export function usePaged<T>(rows: readonly T[], initialSize = 25) {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(initialSize);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const at = Math.min(page, pages - 1);
  return {
    rows: rows.slice(at * size, (at + 1) * size),
    pager: {
      page: at,
      pages,
      size,
      total: rows.length,
      onPage: setPage,
      onSize: (n: number) => {
        setSize(n);
        setPage(0);
      },
    },
    /** Back to the first page, for when the filters change. */
    reset: () => setPage(0),
  };
}

function PageButton({
  label,
  disabled,
  current,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  current?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={current ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid h-8 min-w-8 cursor-pointer place-items-center rounded-control border px-2 text-small font-semibold tabular-nums transition-colors duration-(--duration-fast) disabled:cursor-not-allowed disabled:opacity-40",
        current
          ? "border-transparent bg-accent-fill text-on-accent"
          : "border-border text-ink-700 hover:bg-sunken hover:text-ink-900",
      )}
    >
      {children}
    </button>
  );
}

/** "Showing 1 to 25 of 230", rows per page, and the page numbers, under a table. */
export function TablePager({
  page,
  pages,
  size,
  total,
  onPage,
  onSize,
  noun = "entries",
  className,
}: ReturnType<typeof usePaged>["pager"] & { noun?: string; className?: string }) {
  if (total === 0) return null;
  const start = Math.max(0, Math.min(page - 2, pages - 5));
  const numbers = Array.from({ length: Math.min(5, pages) }, (_, i) => start + i);
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 px-1", className)}>
      <p className="text-small text-ink-700">
        Showing {page * size + 1} to {Math.min(total, (page + 1) * size)} of {total} {noun}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-small text-ink-700">
          Rows per page
          <Select
            aria-label="Rows per page"
            value={size}
            onChange={(e) => onSize(Number(e.target.value))}
            className="w-20"
          >
            {SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </span>
        {pages > 1 && (
          <nav aria-label="Pages" className="flex items-center gap-1">
            <PageButton label="First page" disabled={page === 0} onClick={() => onPage(0)}>
              <ChevronsLeft className="size-4" aria-hidden="true" />
            </PageButton>
            <PageButton
              label="Previous page"
              disabled={page === 0}
              onClick={() => onPage(page - 1)}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </PageButton>
            {numbers.map((n) => (
              <PageButton
                key={n}
                label={`Page ${n + 1}`}
                current={n === page}
                onClick={() => onPage(n)}
              >
                {n + 1}
              </PageButton>
            ))}
            <PageButton
              label="Next page"
              disabled={page >= pages - 1}
              onClick={() => onPage(page + 1)}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </PageButton>
            <PageButton
              label="Last page"
              disabled={page >= pages - 1}
              onClick={() => onPage(pages - 1)}
            >
              <ChevronsRight className="size-4" aria-hidden="true" />
            </PageButton>
          </nav>
        )}
      </div>
    </div>
  );
}

/**
 * A table with its pager: give it every row and render the current page. Key it by the filters
 * so a new filter starts on the first page.
 */
export function Paged<T>({
  rows,
  noun,
  children,
}: {
  rows: readonly T[];
  noun?: string;
  children: (page: readonly T[]) => ReactNode;
}) {
  const { rows: page, pager } = usePaged(rows);
  return (
    <>
      {children(page)}
      <TablePager {...pager} noun={noun} className="mt-3" />
    </>
  );
}
