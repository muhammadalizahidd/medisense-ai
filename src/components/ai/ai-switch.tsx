"use client";

import type { ReactNode } from "react";
import { withoutAiWording } from "@/lib/ai/wording";
import { useAiSwitch } from "@/state/ai-switch";

export const useAiEnabled = () => useAiSwitch((s) => s.enabled);

/**
 * Picks a label: the usual one, or its plain form while the switch is off. Pass `off` when the
 * automatic rewording wouldn't read well.
 */
export function useAiText() {
  const enabled = useAiEnabled();
  return (on: string, off?: string) => (enabled ? on : (off ?? withoutAiWording(on)));
}

/** Content that only exists because of the feature. `otherwise` is what stands in its place. */
export function AiOnly({
  children,
  otherwise = null,
}: {
  children: ReactNode;
  otherwise?: ReactNode;
}) {
  return useAiEnabled() ? children : otherwise;
}

/** A label inside a server component. */
export function AiText({ on, off }: { on: string; off?: string }) {
  return useAiText()(on, off);
}
