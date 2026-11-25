"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import { ChartSkeleton } from "./chart-skeleton";

export type { ColumnSeries } from "./stacked-columns.impl";

const Impl = dynamic(() => import("./stacked-columns.impl").then((m) => m.StackedColumns), {
  ssr: false,
  loading: () => <ChartSkeleton className="min-h-55 flex-1" />,
});

export function StackedColumns(props: ComponentProps<typeof Impl>) {
  return <Impl {...props} />;
}
