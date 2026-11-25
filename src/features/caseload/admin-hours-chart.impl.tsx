"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  TooltipCard,
  axisProps,
  axisTick,
  colour,
  cursorBand,
  gridProps,
} from "@/components/charts/chart-kit";
import type { WeeklyTrend } from "@/data/types";

export function AdminHoursChart({
  rows,
  adminTarget,
}: {
  rows: WeeklyTrend[];
  adminTarget: number;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 8, right: 44, bottom: 0, left: -12 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="week" {...axisProps} dy={6} />
        <YAxis {...axisProps} width={44} domain={[0, 10]} />
        <Tooltip
          cursor={cursorBand}
          wrapperStyle={{ zIndex: 20 }}
          content={({ active, payload }) => {
            const r = payload?.[0]?.payload as WeeklyTrend | undefined;
            if (!active || !r) return null;
            return (
              <TooltipCard
                title={`Week of ${r.week}`}
                rows={[
                  {
                    key: "a",
                    label: "admin hours",
                    value: `${r.adminHours.toFixed(1)}h`,
                    colour: r.adminHours > adminTarget ? colour.over : colour.sand,
                  },
                  { key: "c", label: "clinical hours", value: `${r.clinicalHours}h` },
                ]}
              />
            );
          }}
        />
        <ReferenceLine
          y={adminTarget}
          stroke={colour.ink}
          strokeDasharray="4 4"
          label={{ value: `${adminTarget}h`, position: "right", ...axisTick }}
        />
        <Bar dataKey="adminHours" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {rows.map((r) => (
            <Cell key={r.week} fill={r.adminHours > adminTarget ? colour.over : colour.sand} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
