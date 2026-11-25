"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import { ChartSkeleton } from "@/components/charts/chart-skeleton";

const Impl = dynamic(() => import("./visits-chart.impl").then((m) => m.VisitsChart), {
  ssr: false,
  loading: () => <ChartSkeleton className="h-full" />,
});

export function VisitsChart(props: ComponentProps<typeof Impl>) {
  return <Impl {...props} />;
}
