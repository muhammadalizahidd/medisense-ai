import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { KpiLabel } from "./kpi-icon";
import { cn } from "@/lib/cn";

export type Metric = {
  label: ReactNode;
  value: ReactNode;
  caption?: ReactNode;
  tone?: "over" | "watch" | "monitor";
  flagged?: boolean;
  /** Chosen from the label when not given. */
  icon?: LucideIcon;
};

const captionTone = { over: "text-over", watch: "text-watch", monitor: "text-watch" };

const columns = {
  5: "grid-cols-2 lg:grid-cols-5",
  6: "grid-cols-2 md:grid-cols-3 xl:grid-cols-6",
  8: "grid-cols-2 lg:grid-cols-4",
};

/** One flat, hairline-divided band of figures (no tints, no shadow). Flagged figures get a Watch rule on top. */
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
        "grid gap-px overflow-hidden rounded-card border border-border bg-border",
        columns[count],
      )}
    >
      {metrics.map((metric, index) => (
        <div
          key={index}
          className={cn(
            "flex flex-col gap-1.5 bg-surface px-5 py-4",
            metric.flagged && "shadow-flag",
          )}
        >
          <KpiLabel
            label={typeof metric.label === "string" ? metric.label : ""}
            icon={metric.icon}
            tone={metric.tone}
          >
            {metric.label}
          </KpiLabel>
          <span
            className={cn(
              "type-display leading-none",
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
