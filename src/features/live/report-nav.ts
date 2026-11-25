"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * One piece of report navigation (a sub-tab, a chosen therapist or patient). On a full page it
 * lives in the address, so a link or Back lands on the same view. Embedded inside another page it
 * stays local, so it never fights the outer page's address.
 */
export function useNavParam(key: string, fallback: string, sync: boolean) {
  const [value, setState] = useState(fallback);
  useEffect(() => {
    if (!sync) return;
    const found = new URLSearchParams(window.location.search).get(key);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the address once after mount
    if (found) setState(found);
  }, [key, sync]);
  const set = useCallback(
    (next: string) => {
      setState(next);
      if (!sync) return;
      const url = new URL(window.location.href);
      if (next && next !== fallback) url.searchParams.set(key, next);
      else url.searchParams.delete(key);
      window.history.replaceState(window.history.state, "", url);
    },
    [key, fallback, sync],
  );
  return [value, set] as const;
}

/** Reads a parameter once, for mapping older links. */
export function readParam(key: string) {
  return typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.search).get(key);
}
