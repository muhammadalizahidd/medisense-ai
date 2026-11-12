import type { ReactNode } from "react";
import { Caption } from "./card";

/** A row of headline figures. Clear Blue turns each one into its own card. */
export function StatRow({
  label,
  stats,
}: {
  label: string;
  stats: { label: string; value: ReactNode; caption: string }[];
}) {
  return (
    <section
      aria-label={label}
      className="stat-band grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border lg:grid-cols-4"
    >
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col gap-1.5 bg-surface px-5 py-4">
          <span className="label-caps">{s.label}</span>
          <span className="type-display text-h1-compact font-normal">{s.value}</span>
          <Caption>{s.caption}</Caption>
        </div>
      ))}
    </section>
  );
}
