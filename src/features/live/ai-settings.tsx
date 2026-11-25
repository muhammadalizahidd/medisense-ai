"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import type { AiFeaturesDto } from "@/lib/ai/features";
import { api, useResource } from "@/lib/live/client";
import { shortDate, timeOfDay } from "@/lib/live/time";
import { setAiSwitch, useAiSwitch } from "@/state/ai-switch";
import { ErrorNote, Skeleton } from "./bits";

const STOPS = [
  "Drafting for notes, plans, reports, referrals and invoices",
  "Ask Medisense and every in-app assistant",
  "Suggestions, insights and automatic summaries",
  "The AI Assisted assignment mode, which reads as Manual until you switch back",
];

/**
 * The organisation's AI switch. It keeps naming AI while off, because this is where it is turned
 * back on; `data-keep-words` stops the page rewording it.
 */
export function AiSettings() {
  const state = useResource<AiFeaturesDto>("/api/ai/features", (e) => e.type === "settings");
  const live = useAiSwitch((s) => s.enabled);
  /** The state being asked about, while the dialog box is open. */
  const [asking, setAsking] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const f = state.data;

  async function save(enabled: boolean) {
    setSaving(true);
    // Applied here first, so this screen doesn't announce the change back to its author when the
    // live update arrives ahead of the reply.
    setAiSwitch(enabled);
    try {
      const saved = await api<AiFeaturesDto>("/api/ai/features", { body: { enabled } });
      setAiSwitch(saved.enabled);
      toast(`AI features turned ${enabled ? "on" : "off"} for everyone`);
      setAsking(null);
      state.reload();
    } catch (error) {
      setAiSwitch(!enabled);
      toast(error instanceof Error ? error.message : "Couldn't save that.", { tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  if (state.error && !f) return <ErrorNote message={state.error} onRetry={state.reload} />;
  if (!f) return <Skeleton className="h-48" />;
  // The live state wins over the loaded one, which may be a moment older.
  const on = live;
  return (
    <section
      data-keep-words
      aria-labelledby="ai-switch-title"
      className="max-w-180 rounded-card border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="ai-switch-title" className="text-section font-semibold text-ink-900">
              AI features
            </h2>
            <Tag tone={on ? "healthy" : "neutral"}>{on ? "On" : "Off"}</Tag>
          </div>
          <p className="mt-1 text-small text-ink-700">
            {on
              ? "AI drafts and suggests across Medisense. A named person still approves everything."
              : "Every AI feature is stopped and hidden for everyone. Records, rules and automations carry on."}
          </p>
        </div>
        <Switch
          on={on}
          label={`AI features: ${on ? "on" : "off"}`}
          disabled={!f.canChange || saving}
          onToggle={() => setAsking(!on)}
        />
      </div>
      <p className="mt-3 text-caption text-ink-500">
        {f.canChange
          ? "Applies to everyone straight away."
          : "Only the Super Admin can change this."}
        {f.updatedBy && f.updatedAt
          ? ` Last changed by ${f.updatedBy} · ${shortDate(f.updatedAt)}, ${timeOfDay(f.updatedAt)}.`
          : ""}
      </p>
      {asking !== null && (
        <ConfirmDialog
          keepWords
          title={asking ? "Turn on AI features?" : "Turn off AI features?"}
          confirmLabel={asking ? "Turn on" : "Turn off"}
          danger={!asking}
          busy={saving}
          onConfirm={() => void save(asking)}
          onClose={() => setAsking(null)}
        >
          {asking ? (
            <p>
              Drafting, assistants and suggestions come back for everyone straight away. A named
              person still approves everything.
            </p>
          ) : (
            <>
              <p>This applies to everyone signed in now. It stops:</p>
              <ul className="list-disc pl-5">
                {STOPS.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <p>Approved records and anything people wrote are kept.</p>
            </>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}
