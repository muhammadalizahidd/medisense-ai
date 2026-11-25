"use client";

import { isAiOnlyRoute } from "@/lib/ai/routes";
import type { navigationFor } from "@/lib/navigation";
import { useAiSwitch } from "@/state/ai-switch";
import { useAiEnabled, useAiText } from "./ai-switch";

type Menu = ReturnType<typeof navigationFor>;

/** The menu as it should read now: switched-off screens leave, the rest lose the wording. */
export function useMenu(groups: Menu): Menu {
  const enabled = useAiEnabled();
  const text = useAiText();
  const canChange = useAiSwitch((s) => s.canChange);
  if (enabled) return groups;
  return groups
    .map((g) => ({
      ...g,
      group: text(g.group),
      items: g.items
        .filter((i) => !isAiOnlyRoute(i.href, canChange))
        .map((i) => ({ ...i, label: text(i.label) })),
    }))
    .filter((g) => g.items.length > 0);
}
