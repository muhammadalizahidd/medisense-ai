import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

/** Holds a chart's space while Recharts loads, so the card never jumps when the chart arrives. */
export function ChartSkeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "bg-surface-sunken w-full animate-pulse rounded-card motion-reduce:animate-none",
        className,
      )}
      style={style}
    />
  );
}
