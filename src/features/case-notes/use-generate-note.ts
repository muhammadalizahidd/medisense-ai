"use client";

import { useCallback } from "react";
import type { SummariseResponse } from "@/lib/ai/case-note-contract";
import { aiEnabledNow } from "@/state/ai-switch";
import { useDemoStore } from "@/state/demo-store";

/** Sends the current raw note to the summarise route and records the outcome in the store. */
export function useGenerateNote(caseId: string) {
  const begin = useDemoStore((s) => s.beginGeneration);
  const complete = useDemoStore((s) => s.completeGeneration);
  const fail = useDemoStore((s) => s.failGeneration);
  const edit = useDemoStore((s) => s.editNote);

  return useCallback(async () => {
    const notes = useDemoStore.getState().caseNotes[caseId]?.rawNotes ?? "";
    // Switched off: the clinician writes the summary, starting from their own lines.
    if (!aiEnabledNow()) {
      const observations = notes
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const own = {
        summary: "",
        interventions: [],
        observations,
        nextActions: [],
        subjective: [],
        missingInformation: [],
        summarySourceLine: 0,
      };
      complete(caseId, own, {
        source: "manual",
        model: null,
        latencyMs: null,
        pairedLine: null,
        notice: null,
        subjective: [],
        missingInformation: [],
      });
      edit(caseId);
      return;
    }
    begin(caseId);
    try {
      const res = await fetch("/api/case-notes/summarise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, notes }),
      });
      const body = (await res.json()) as SummariseResponse;
      if (!body.ok) {
        fail(caseId, body.error);
        return;
      }
      complete(caseId, body.note, {
        source: body.source,
        model: body.model,
        latencyMs: body.latencyMs,
        pairedLine: body.note.summarySourceLine,
        notice: body.notice,
        subjective: body.note.subjective,
        missingInformation: body.note.missingInformation,
      });
    } catch {
      fail(caseId, "Could not reach the server. Check the dev server is running.");
    }
  }, [caseId, begin, complete, fail, edit]);
}
