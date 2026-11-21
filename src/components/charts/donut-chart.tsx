"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import { ChartSkeleton } from "./chart-skeleton";

export type { DonutSlice } from "./donut-chart.impl";

const Impl = dynamic(() => import("./donut-chart.impl").then((m) => m.DonutChart), {
  ssr: false,
  loading: () => <ChartSkeleton style={{ height: 168 }} />,
});

export function DonutChart(props: ComponentProps<typeof Impl>) {
  return <Impl {...props} />;
}
