"use client";

import { Loader2, Mic, MicOff, Undo2 } from "lucide-react";
import { useState } from "react";
import { useAiEnabled } from "@/components/ai/ai-switch";
import { AiIcon } from "@/components/ai/provenance";
import { useDictation } from "@/features/case-notes/use-dictation";
import { cn } from "@/lib/cn";
import { api } from "@/lib/live/client";
import { aiEnabledNow } from "@/state/ai-switch";

/** Fields that are reasons or addresses get no assist; everything else written by hand does. */
const SKIP = /\b(reason|address|postcode|email|phone|url|link)\b/i;
export const wantsAssist = (label: string) => !SKIP.test(label);

/**
 * Dictate with the microphone and tidy with AI, for any note field. AI only rewrites what was
 * written (the person reviews it before saving); Undo puts the original back.
 */
export function NoteAssist({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const ai = useAiEnabled();
  const [busy, setBusy] = useState(false);
  const [before, setBefore] = useState<string | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  const dictation = useDictation((phrase) => {
    setBefore(null);
    onChange(value.trim() ? `${value.trim()} ${phrase}` : phrase);
  });

  async function write() {
    setBusy(true);
    setFail(null);
    try {
      const res = await api<{ text: string }>("/api/ai/write", {
        body: { field: label, text: value },
      });
      // Switched off while it was writing: the person's own words stay.
      if (!aiEnabledNow()) return;
      setBefore(value);
      onChange(res.text);
    } catch (e) {
      setFail(e instanceof Error ? e.message : "AI writing isn't available right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-note-assist className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {dictation.supported && (
        <button
          type="button"
          onClick={dictation.listening ? dictation.stop : dictation.start}
          aria-pressed={dictation.listening}
          className={cn(
            "flex h-7 cursor-pointer items-center gap-1.5 rounded-tag px-2 text-caption font-semibold transition-colors duration-140",
            dictation.listening
              ? "bg-over-bg text-over"
              : "bg-sunken text-ink-700 hover:bg-accent-tint hover:text-accent",
          )}
        >
          {dictation.listening ? (
            <MicOff className="size-3.5" aria-hidden="true" />
          ) : (
            <Mic className="size-3.5" aria-hidden="true" />
          )}
          {dictation.listening ? "Stop" : "Dictate"}
        </button>
      )}
      <button
        data-ai-only
        type="button"
        onClick={write}
        disabled={busy || value.trim().length < 3}
        title={value.trim().length < 3 ? "Write or dictate a few words first" : undefined}
        className="flex h-7 cursor-pointer items-center gap-1.5 rounded-tag bg-accent-tint px-2 text-caption font-semibold text-accent transition-colors duration-140 hover:bg-accent-fill hover:text-on-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <AiIcon className="size-3.5" />
        )}
        {busy ? "Writing…" : "Write with AI"}
      </button>
      {before !== null && !busy && (
        <button
          type="button"
          onClick={() => {
            onChange(before);
            setBefore(null);
          }}
          className="flex h-7 cursor-pointer items-center gap-1 rounded-tag px-2 text-caption font-semibold text-ink-500 hover:text-ink-900"
        >
          <Undo2 className="size-3.5" aria-hidden="true" /> Undo
        </button>
      )}
      {before !== null && !busy && (
        <span data-ai-only className="text-label text-ink-500">
          AI draft · check before saving
        </span>
      )}
      {dictation.listening && dictation.interim && (
        <span className="truncate text-caption text-ink-500 italic">{dictation.interim}…</span>
      )}
      {((ai && fail) || dictation.error) && (
        <span role="alert" className="text-caption text-over">
          {(ai && fail) || dictation.error}
        </span>
      )}
    </div>
  );
}
