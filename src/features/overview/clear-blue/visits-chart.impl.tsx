"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TooltipCard, axisProps, cursorBand, gridProps } from "@/components/charts/chart-kit";

export type VisitsDay = { day: string; label: string; visits: number; today: boolean };

export function VisitsChart({ data }: { data: VisitsDay[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -18 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="day" {...axisProps} />
        <YAxis allowDecimals={false} {...axisProps} />
        <Tooltip
          cursor={cursorBand}
          wrapperStyle={{ zIndex: 20 }}
          content={({ active, payload }) => {
            const row = payload?.[0]?.payload as VisitsDay | undefined;
            if (!active || !row) return null;
            return (
              <TooltipCard
                title={row.today ? `${row.label} · today` : row.label}
                rows={[
                  {
                    key: "v",
                    label: "Visits",
                    value: row.visits,
                    colour: "var(--color-accent-fill)",
                  },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="visits" radius={[6, 6, 0, 0]} maxBarSize={34} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell
              key={d.day}
              fill={
                d.today
                  ? "var(--color-accent-fill)"
                  : `color-mix(in srgb, var(--color-accent-fill) ${72 - i * 8}%, white)`
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
