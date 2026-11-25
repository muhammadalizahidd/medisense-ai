"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import { ChartSkeleton } from "@/components/charts/chart-skeleton";

const Impl = dynamic(() => import("./admin-hours-chart.impl").then((m) => m.AdminHoursChart), {
  ssr: false,
  loading: () => <ChartSkeleton className="h-full" />,
});

export function AdminHoursChart(props: ComponentProps<typeof Impl>) {
  return <Impl {...props} />;
}
