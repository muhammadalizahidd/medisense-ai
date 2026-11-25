"use client";

import { useEffect, useRef } from "react";
import { TURNED_OFF } from "@/lib/ai/types";
import type { AiMeta, StoryRequest, StoryResponse } from "@/lib/story/types";
import { aiEnabledNow, useAiSwitch } from "./ai-switch";
import { useDemoStore } from "./demo-store";

const inFlight = new Set<string>();

/** One AI step. Returns an error message rather than throwing, so screens can stay calm. */
export async function callStory<T>(
  request: StoryRequest,
): Promise<{ data: T; meta: AiMeta } | { error: string }> {
  if (!aiEnabledNow()) return { error: TURNED_OFF };
  try {
    const res = await fetch("/api/story", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    const body = (await res.json()) as StoryResponse<T>;
    if (!body.ok) return { error: body.error };
    return {
      data: body.data,
      meta: { source: "live", model: body.model, latencyMs: body.latencyMs },
    };
  } catch {
    return { error: "The AI service couldn't be reached" };
  }
}

/**
 * Keeps an AI result for as long as what it was written from stays the same. `key` must change
 * when the inputs change. A failed call stores the prepared version, and the presenter panel
 * shows that it was used. While the organisation switch is off there is no call, no prepared
 * version and no data: `off` tells the screen to leave the section out.
 */
export function useStoryAi<T>(key: string, request: StoryRequest, prepared: T) {
  const cached = useDemoStore((s) => s.story.ai[key]);
  const store = useDemoStore((s) => s.cacheAi);
  const enabled = useAiSwitch((s) => s.enabled);
  const latest = useRef({ request, prepared });

  useEffect(() => {
    latest.current = { request, prepared };
  });

  useEffect(() => {
    if (!enabled) return undefined;
    const run = () => {
      if (!aiEnabledNow() || useDemoStore.getState().story.ai[key] || inFlight.has(key)) return;
      inFlight.add(key);
      void callStory<T>(latest.current.request).then((result) => {
        inFlight.delete(key);
        // Switched off while the call was out: nothing is kept.
        if (!aiEnabledNow()) return;
        if ("error" in result) {
          store(key, latest.current.request.kind, latest.current.prepared, {
            source: "prepared",
            model: null,
            latencyMs: null,
          });
        } else {
          store(key, latest.current.request.kind, result.data, result.meta);
        }
      });
    };
    if (useDemoStore.persist.hasHydrated()) {
      run();
      return undefined;
    }
    return useDemoStore.persist.onFinishHydration(run);
  }, [key, store, enabled]);

  return {
    data: enabled ? ((cached?.data as T | undefined) ?? null) : null,
    meta: enabled ? (cached?.meta ?? null) : null,
    loading: enabled && !cached,
    off: !enabled,
  };
}
