"use client";

import { Children, createContext, useContext, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/*
 * What part of an area a tab renders. The page shows a "summary": a few tiles and one chart. The
 * full-report dialog shows "measures" (every tile and chart) or one "table" at a time. Anywhere
 * else, "all" renders everything, as before. The area components don't change shape: the tiles,
 * charts and tables they already hold decide for themselves what to show in each part.
 */
export type Section =
  { kind: "all" } | { kind: "summary" } | { kind: "measures" } | { kind: "table"; id: string };

const SectionContext = createContext<Section>({ kind: "all" });
export const SectionProvider = SectionContext.Provider;
export const useSection = () => useContext(SectionContext);

/** The tiles in the page summary: enough to answer the question, not the whole catalogue. */
export const SUMMARY_TILES = 4;

/** Charts for an area. The summary keeps the first one; the dialog shows them all. */
export function Charts({
  cols = "xl:grid-cols-2",
  children,
}: {
  cols?: string;
  children: ReactNode;
}) {
  const s = useSection();
  if (s.kind === "table") return null;
  if (s.kind === "summary") return Children.toArray(children)[0] ?? null;
  return <div className={cn("grid gap-4", cols)}>{children}</div>;
}

/** Extra detail that belongs with the full measures, not the page summary or a table. */
export function Measures({ children }: { children: ReactNode }) {
  const s = useSection();
  return s.kind === "measures" || s.kind === "all" ? children : null;
}
