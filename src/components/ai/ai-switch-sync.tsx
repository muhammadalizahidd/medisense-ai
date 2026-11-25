"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect } from "react";
import { toast } from "@/components/ui/toast";
import type { AiFeaturesDto } from "@/lib/ai/features";
import { startScrub } from "@/lib/ai/scrub";
import { api, useLiveEvents } from "@/lib/live/client";
import { AI_STORAGE_KEY, aiEnabledNow, setAiSwitch, useAiSwitch } from "@/state/ai-switch";

/** A backstop for signed-out pages, which have no live connection. */
const RECHECK_MS = 60_000;

const stored = () => {
  try {
    return localStorage.getItem(AI_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
};

/** Says that something changed, without naming it to people who didn't change it. */
function change(enabled: boolean) {
  if (enabled === aiEnabledNow()) return;
  setAiSwitch(enabled);
  toast(`Drafting and assistant features were turned ${enabled ? "on" : "off"}`, {
    tone: "info",
    detail: "By your organisation. Your own work is unchanged.",
  });
}

/** Mounted once. Keeps this browser in step with the organisation switch. */
export function AiSwitchSync() {
  const pathname = usePathname();
  const enabled = useAiSwitch((s) => s.enabled);
  const live = useAiSwitch((s) => s.persisted === true && s.signedIn);

  const refresh = useCallback(async (announce: boolean) => {
    try {
      const f = await api<AiFeaturesDto>("/api/ai/features");
      useAiSwitch.setState({
        persisted: f.persisted,
        canChange: f.canChange,
        signedIn: f.signedIn,
      });
      const next = f.persisted ? f.enabled : stored();
      if (announce) change(next);
      else setAiSwitch(next);
    } catch {
      // Offline for a moment: the last state stands.
    }
  }, []);

  useEffect(() => {
    setAiSwitch(stored());
    void refresh(false);
    const again = () => {
      if (document.visibilityState === "visible") void refresh(true);
    };
    const otherTab = (e: StorageEvent) => {
      if (e.key === AI_STORAGE_KEY && e.newValue) change(e.newValue !== "off");
    };
    const timer = window.setInterval(again, RECHECK_MS);
    document.addEventListener("visibilitychange", again);
    window.addEventListener("storage", otherTab);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", again);
      window.removeEventListener("storage", otherTab);
    };
  }, [refresh]);

  // Signing in or out changes what the answer says about this person.
  useEffect(() => {
    void refresh(true);
  }, [pathname, refresh]);

  useLiveEvents((event) => {
    if (event.type === "settings") change(event.payload.aiEnabled);
    // A change may have been missed while disconnected.
    else if (event.type === "connected") void refresh(true);
  }, live);

  useEffect(() => (enabled ? undefined : startScrub()), [enabled]);

  return null;
}
