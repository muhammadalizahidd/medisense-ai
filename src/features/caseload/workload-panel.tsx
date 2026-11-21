"use client";

import { useState } from "react";
import { colour } from "@/components/charts/chart-kit";
import { TrendChart } from "@/components/charts/trend-chart";
import { Caption, Card, CardTitle } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import type { WeeklyTrend } from "@/data/types";
import { cn } from "@/lib/cn";
import { AdminHoursChart } from "./admin-hours-chart";

function growth(from: number, to: number) {
  return Math.round(((to - from) / from) * 100);
}

/** Weighted caseload and weekly hours for one clinician, over 6 or 12 weeks. */
export function WorkloadPanel({
  trend,
  capacityUnits,
  adminTarget,
  id = "workload",
  stretch = true,
}: {
  trend: WeeklyTrend[];
  capacityUnits: number;
  adminTarget: number;
  id?: string;
  /** Fill the grid row's height; turn off when stacked with other cards in a column. */
  stretch?: boolean;
}) {
  const [range, setRange] = useState<"6" | "12">("6");
  const rows = trend.slice(-Number(range));
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last) return null;
  const change = growth(first.weightedUnits, last.weightedUnits);
  const weeksOver = rows.filter((r) => r.adminHours > adminTarget).length;

  return (
    <Card
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("flex flex-col px-6 pt-5 pb-4.5", stretch && "h-full")}
    >
      <CardTitle
        id={`${id}-title`}
        title={`Workload, last ${range} weeks`}
        description="Weighted caseload units · Low 1.0 · Medium 1.5 · High 2.5"
        aside={
          <div className="flex items-center gap-3">
            <span className="headline text-stat-sm text-over">+{change}%</span>
            <Segmented
              label="Range"
              value={range}
              onChange={setRange}
              options={[
                { id: "6", label: "6 wks" },
                { id: "12", label: "12 wks" },
              ]}
            />
          </div>
        }
      />
      <div className="mt-3 flex min-h-0 flex-1 flex-col">
        <TrendChart
          label="Weighted caseload against capacity"
          data={rows.map((r) => ({
            week: r.week,
            units: r.weightedUnits,
            clients: r.activeClients,
          }))}
          xKey="week"
          height={stretch ? "fill" : 220}
          series={[{ key: "units", label: "Weighted units", colour: colour.accent, kind: "area" }]}
          references={[{ y: capacityUnits, label: `Capacity ${capacityUnits}`, tone: "over" }]}
          format={(v) => v.toFixed(1)}
          tooltipTitle={(w) => `Week of ${w}`}
        />
      </div>
      <div className="mt-3.5 border-t border-border pt-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="eyebrow">Admin hours / week · {adminTarget}h target</span>
          <Caption>
            {weeksOver} of {rows.length} weeks above target · active patients {first.activeClients}{" "}
            → {last.activeClients}
          </Caption>
        </div>
        <div className="mt-2 h-32">
          <AdminHoursChart rows={rows} adminTarget={adminTarget} />
        </div>
      </div>
    </Card>
  );
}
