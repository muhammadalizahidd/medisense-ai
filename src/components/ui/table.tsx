import type { ComponentProps, CSSProperties } from "react";
import { cn } from "@/lib/cn";

/**
 * Tables are CSS grids so header and rows share one column template.
 * Pass the template once per table and reuse it for every row. Under 768px the header hides and
 * each row stacks into a small card, so phones never scroll sideways.
 */
export function TableHeader({
  columns,
  className,
  ...props
}: { columns: string } & ComponentProps<"div">) {
  return (
    <div
      role="row"
      style={{ "--cols": columns } as CSSProperties}
      className={cn(
        "hidden min-h-9 items-center gap-x-3 border-b border-border bg-sunken px-4 py-2 label-caps whitespace-nowrap md:grid md:grid-cols-(--cols)",
        className,
      )}
      {...props}
    />
  );
}

export function TableRow({
  columns,
  className,
  interactive = true,
  style,
  ...props
}: { columns: string; interactive?: boolean } & ComponentProps<"div">) {
  return (
    <div
      role="row"
      style={{ "--cols": columns, ...style } as CSSProperties}
      className={cn(
        "relative grid min-h-(--row-h) grid-cols-1 items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3 text-small md:grid-cols-(--cols) md:gap-y-0 md:py-2.5",
        interactive && "transition-colors duration-(--duration-fast) hover:bg-sunken/60",
        className,
      )}
      {...props}
    />
  );
}
