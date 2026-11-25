"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AI_SWITCH_ROUTE, aiRouteRedirect } from "@/lib/ai/routes";
import { useAiSwitch } from "@/state/ai-switch";
import { useAiEnabled } from "./ai-switch";

/** Moves people off a screen that has just been switched off, or that they typed the address of. */
export function AiRouteGuard({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const canChange = useAiSwitch((s) => s.canChange);
  const unknown = useAiSwitch((s) => s.persisted === null);
  const off = !useAiEnabled();
  // Who may change the switch arrives just after load: nobody is moved off its screen before then.
  const waiting = off && unknown && path.startsWith(AI_SWITCH_ROUTE);
  const instead = aiRouteRedirect(path, canChange);
  const blocked = off && !waiting && instead !== null;
  useEffect(() => {
    if (blocked && instead) router.replace(instead);
  }, [blocked, instead, router]);
  return blocked || waiting ? null : children;
}
