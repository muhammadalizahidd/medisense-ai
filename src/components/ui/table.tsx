import type { ComponentProps, CSSProperties } from "react";
import { cn } from "@/lib/cn";

/**
 * Tables are CSS grids so header and rows share one column template.
 * Pass the template once per table and reuse it for every row.
 */
export function TableHeader({
  columns,
  className,
  ...props
}: { columns: string } & ComponentProps<"div">) {
  return (
    <div
      role="row"
      style={{ gridTemplateColumns: columns } as CSSProperties}
      className={cn(
        "grid min-h-9 items-center gap-x-3 border-b border-border bg-sunken px-4 py-2 label-caps whitespace-nowrap",
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
      style={{ gridTemplateColumns: columns, ...style } as CSSProperties}
      className={cn(
        "relative grid min-h-(--row-h) items-center gap-x-3 border-b border-border px-4 py-2.5 text-small",
        interactive && "transition-colors duration-(--duration-fast) hover:bg-sunken/60",
        className,
      )}
      {...props}
    />
  );
}
