"use client";

import { AssistantPanel } from "./assistant-panel";

/** The whole assistant on its own page: the same questions, booking agent and quick booking. */
export function AssistantFullPage() {
  return <AssistantPanel variant="page" initialQuestion="" onClose={() => undefined} />;
}
