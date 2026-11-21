import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

/** Holds a chart's space while Recharts loads, so the card never jumps when the chart arrives. */
export function ChartSkeleton({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "w-full animate-pulse rounded-card bg-surface-sunken motion-reduce:animate-none",
        className,
      )}
      style={style}
    />
  );
}
