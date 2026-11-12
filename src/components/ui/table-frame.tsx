import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The box every list table sits in: the same height whether it holds no rows or hundreds, so the
 * page never jumps. Long lists scroll inside it with the column headings pinned; loading, empty
 * and error states sit in its middle. Row hover and entry motion come from `.table-frame` in
 * globals.css.
 */
export function TableFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "table-frame h-[min(560px,calc(100dvh-14rem))] min-h-[380px] overflow-auto rounded-card border border-border bg-surface shadow-lift",
        className,
      )}
    >
      {children}
    </div>
  );
}
