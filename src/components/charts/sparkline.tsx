"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import { ChartSkeleton } from "./chart-skeleton";

const Impl = dynamic(() => import("./sparkline.impl").then((m) => m.Sparkline), {
  ssr: false,
  loading: () => <ChartSkeleton style={{ height: 36 }} />,
});

export function Sparkline(props: ComponentProps<typeof Impl>) {
  return <Impl {...props} />;
}
