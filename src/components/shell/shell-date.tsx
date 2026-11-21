"use client";

import { useSyncExternalStore } from "react";
import { longDate } from "@/lib/clock";
import { useDemoStore } from "@/state/demo-store";

const subscribe = () => () => {};

/**
 * The shell is prerendered once, so today's date can't be written into its HTML. The server
 * snapshot is empty and the browser fills it in, which also keeps hydration matching.
 */
export function ShellDate({ className }: { className?: string }) {
  const dayOffset = useDemoStore((s) => s.story.dayOffset);
  const text = useSyncExternalStore(
    subscribe,
    () => longDate(dayOffset),
    () => "",
  );
  return <span className={className}>{text}</span>;
}
