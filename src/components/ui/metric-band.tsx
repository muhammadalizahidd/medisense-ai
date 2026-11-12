import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Metric = {
  label: ReactNode;
  value: ReactNode;
  caption?: ReactNode;
  tone?: "over" | "monitor";
  flagged?: boolean;
};

const captionTone = { over: "text-over", monitor: "text-monitor" };

const columns = {
  5: "grid-cols-2 lg:grid-cols-5",
  6: "grid-cols-2 md:grid-cols-3",
  8: "grid-cols-2 lg:grid-cols-4",
};

/** A single hairline-divided band of figures, used in place of separate stat cards. */
export function MetricBand({
  metrics,
  label,
  size = "stat",
}: {
  metrics: Metric[];
  label: string;
  size?: "stat" | "stat-sm";
}) {
  const count = metrics.length as keyof typeof columns;
  return (
    <section
      aria-label={label}
      className={cn(
        "stat-band grid gap-px overflow-hidden rounded-card border border-border bg-border",
        columns[count],
      )}
    >
      {metrics.map((metric, index) => (
        <div
          key={index}
          className={cn(
            "flex flex-col gap-1.5 bg-surface px-4 py-4",
            metric.flagged && "shadow-flag",
          )}
        >
          <span className="label-caps">{metric.label}</span>
          <span
            className={cn(
              "type-display font-normal",
              size === "stat" ? "text-h1-compact" : "text-h2",
            )}
          >
            {metric.value}
          </span>
          {metric.caption && (
            <span
              className={cn(
                "text-caption font-medium",
                metric.tone ? captionTone[metric.tone] : "text-ink-500",
              )}
            >
              {metric.caption}
            </span>
          )}
        </div>
      ))}
    </section>
  );
}
