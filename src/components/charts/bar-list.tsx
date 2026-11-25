"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import { ChartSkeleton } from "./chart-skeleton";

export type { BarDatum } from "./bar-list.impl";

/** Recharts is loaded on demand so it stays out of every page's first JavaScript. */
const Impl = dynamic(() => import("./bar-list.impl").then((m) => m.BarList), {
  ssr: false,
  loading: () => <ChartSkeleton className="min-h-40 flex-1" />,
});

export function BarList(props: ComponentProps<typeof Impl>) {
  return <Impl {...props} />;
}
