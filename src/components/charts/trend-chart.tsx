"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import { ChartSkeleton } from "./chart-skeleton";

export type { TrendReference, TrendSeries } from "./trend-chart.impl";

const Impl = dynamic(() => import("./trend-chart.impl").then((m) => m.TrendChart), {
  ssr: false,
  loading: () => <ChartSkeleton className="min-h-55 flex-1" />,
});

export function TrendChart(props: ComponentProps<typeof Impl>) {
  return <Impl {...props} />;
}
