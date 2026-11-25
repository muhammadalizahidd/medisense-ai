"use client";

import { Mic, Send } from "lucide-react";
import { useState, type ReactNode } from "react";
import { AiChip, AiIcon } from "@/components/ai/provenance";
import { NoteAssist, wantsAssist } from "@/components/ai/note-assist";
import { ProposalCard, SourcePanel } from "./agent-ui";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { api } from "@/lib/live/client";
import {
  attachmentTypes,
  feedbackRatings,
  MAX_ATTACHMENT,
  type ChatMessage,
  type EnhanceAction,
  type NewAttachment,
  type Reporter,
} from "@/lib/live/enhance";

/* Shared parts for the AI Enhancements 01–07 screens in both apps. */

export async function act<T = unknown>(body: EnhanceAction, ok?: string): Promise<T | null> {
  try {
    const r = await api<T>("/api/enhance", { body });
    if (ok) toast(ok, { tone: "success" });
    return r;
  } catch (e) {
    toast("Couldn't save", { tone: "error", detail: e instanceof Error ? e.message : "" });
    return null;
  }
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  area = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  area?: boolean;
}) {
  const cls = "rounded-control border border-border-strong bg-surface px-3 py-2 text-small";
  return (
    <label className="flex flex-col gap-1">
      <span className="text-caption font-semibold text-ink-700">{label}</span>
      {area ? (
        <>
          <textarea
            rows={3}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className={cls}
          />
          {wantsAssist(label) && <NoteAssist label={label} value={value} onChange={onChange} />}
        </>
      ) : (
        <input
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        />
      )}
    </label>
  );
}

export function Pick<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T | "";
  onChange: (v: T) => void;
  options: readonly T[];
}) {
  return (
    <div>
      <p className="mb-1.5 text-caption font-semibold text-ink-700">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={value === o}
            onClick={() => onChange(o)}
            className={cn(
              "cursor-pointer rounded-full border px-3 py-1.5 text-caption font-semibold",
              value === o
                ? "border-accent-fill bg-accent-fill text-on-accent"
                : "border-border-strong bg-surface text-ink-700",
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PickMany<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T[];
  onChange: (v: T[]) => void;
  options: readonly T[];
}) {
  return (
    <div>
      <p className="mb-1.5 text-caption font-semibold text-ink-700">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value.includes(o);
          return (
            <button
              key={o}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
              className={cn(
                "cursor-pointer rounded-full border px-3 py-1.5 text-caption font-semibold",
                on
                  ? "border-accent-fill bg-accent-fill text-on-accent"
                  : "border-border-strong bg-surface text-ink-700",
              )}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Who is answering: the patient or a verified caregiver. Answers are labelled with it. */
export function ReporterPick({
  reporters: all,
  value,
  onChange,
  area,
}: {
  reporters: Reporter[];
  value: Reporter | null;
  onChange: (r: Reporter) => void;
  /** Caregivers appear only where the therapist allowed them: Activities, Appointments, Concerns. */
  area?: string;
}) {
  const reporters = all.filter(
    (r) => r.role === "Patient" || !area || (r.scope ?? []).includes(area),
  );
  const hidden = all.filter((r) => r.role === "Caregiver" && !reporters.includes(r));
  if (reporters.length < 2)
    return hidden.length ? (
      <p className="text-caption text-ink-500">
        {hidden.map((h) => h.name).join(", ")} can&apos;t answer this for you: their caregiver
        access doesn&apos;t include {area?.toLowerCase()}.
      </p>
    ) : null;
  return (
    <div>
      <p className="mb-1.5 text-caption font-semibold text-ink-700">Who is answering?</p>
      <div role="radiogroup" aria-label="Who is answering?" className="flex flex-wrap gap-1.5">
        {reporters.map((r) => (
          <button
            key={r.name}
            type="button"
            role="radio"
            aria-checked={value?.name === r.name}
            onClick={() => onChange(r)}
            className={cn(
              "cursor-pointer rounded-full border px-3 py-1.5 text-caption font-semibold",
              value?.name === r.name
                ? "border-accent-fill bg-accent-fill text-on-accent"
                : "border-border-strong bg-surface text-ink-700",
            )}
          >
            {r.role === "Caregiver" ? `${r.name} · ${r.relationship}, verified` : `${r.name} (me)`}
          </button>
        ))}
      </div>
      {value?.role === "Caregiver" && (
        <p className="mt-1.5 text-caption text-ink-500">
          {value.name} can: {(value.scope ?? []).join(", ") || "nothing"}
          {value.until ? ` · until ${value.until}` : ""}. Answers are labelled caregiver-reported.
        </p>
      )}
    </div>
  );
}

export function ReportedBy({ r }: { r: Reporter }) {
  return (
    <span className="rounded-tag border border-border-strong px-1.5 py-0.5 text-label font-semibold text-ink-700">
      {r.role === "Caregiver" ? `Caregiver-reported · ${r.name}` : "Patient-reported"}
    </span>
  );
}

export function Sources({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {items.map((s) => (
        <span
          key={s}
          className="rounded-tag border border-border-strong bg-surface px-1.5 py-0.5 text-label text-ink-700"
        >
          Source · {s}
        </span>
      ))}
    </div>
  );
}

/** The AI layer: dashed draft surface and mark. When AI was unavailable it says so plainly. */
export function AiBox({
  label = "AI draft",
  ai = true,
  offLabel = "From approved records · AI unavailable",
  keep = false,
  children,
}: {
  label?: string;
  ai?: boolean;
  /** A person has approved it, so it stays when the switch is off. */
  keep?: boolean;
  /** What to say when no AI was used, e.g. a rule chose not to call it. */
  offLabel?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-ai-only={(ai && !keep) || undefined}
      className="rounded-card border border-dashed border-draft-rule bg-draft p-3"
    >
      <div className="mb-2">
        {ai ? (
          <AiChip>{label}</AiChip>
        ) : (
          <span className="text-label font-semibold tracking-wide text-ink-500 uppercase">
            {offLabel}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-card border border-border bg-surface p-3.5", className)}>
      {children}
    </div>
  );
}

/** One chat thread for the patient assistant and the clinical copilot. */
export function ChatThread({
  messages,
  onSend,
  onAction,
  onTask,
  onFeedback,
  starters,
  placeholder,
}: {
  messages: ChatMessage[];
  onSend: (text: string) => Promise<void>;
  onAction?: (target: string) => void;
  onTask?: (title: string) => void;
  /** Rate an answer: helpful, inaccurate, unsafe or missing information. */
  onFeedback?: (m: ChatMessage, rating: (typeof feedbackRatings)[number]) => void;
  starters: string[];
  placeholder: string;
}) {
  const [rated, setRated] = useState<Record<number, string>>({});
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async (t: string) => {
    if (!t.trim() || busy) return;
    setBusy(true);
    setText("");
    await onSend(t.trim());
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-3">
      <div aria-live="polite" className="flex flex-col gap-2.5">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {starters.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setText(s)}
                className="cursor-pointer rounded-full border border-border-strong bg-surface px-3 py-1.5 text-caption font-semibold text-ink-700"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <p
              key={i}
              className="ml-8 self-end rounded-card rounded-br-sm bg-accent-fill px-3 py-2 text-small text-on-accent"
            >
              {m.text}
            </p>
          ) : (
            <div
              key={i}
              className="mr-6 rounded-card border border-dashed border-draft-rule bg-draft p-3"
            >
              <p className="mb-1 flex items-center gap-1.5 text-label font-semibold tracking-wide text-ink-500 uppercase">
                <AiIcon className="size-3" /> {m.outcome ?? "Answered"}
              </p>
              <p className="text-small whitespace-pre-line text-ink-900">{m.text}</p>
              <Sources items={m.sources ?? []} />
              {m.sourceDocs && <SourcePanel sources={m.sourceDocs} inline />}
              {m.proposals?.map((p) => (
                <div key={p.runId} className="mt-2.5">
                  <ProposalCard p={p} endpoint="/api/agent" />
                </div>
              ))}
              {onFeedback && (
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {rated[i] ? (
                    <span className="text-label text-ink-500">
                      Thanks · marked {rated[i]?.toLowerCase()}
                    </span>
                  ) : (
                    feedbackRatings.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => {
                          setRated((x) => ({ ...x, [i]: r }));
                          onFeedback(m, r);
                        }}
                        className="cursor-pointer rounded-full border border-border px-2 py-0.5 text-label text-ink-500 hover:bg-sunken"
                      >
                        {r}
                      </button>
                    ))
                  )}
                </div>
              )}
              {(m.actions?.length || m.proposedTask) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.actions?.map((a) => (
                    <button
                      key={a.target}
                      type="button"
                      onClick={() => onAction?.(a.target)}
                      className="cursor-pointer rounded-full bg-ink-900 px-3 py-1.5 text-caption font-semibold text-page"
                    >
                      {a.label}
                    </button>
                  ))}
                  {m.proposedTask && onTask && (
                    <button
                      type="button"
                      onClick={() => onTask(m.proposedTask ?? "")}
                      className="cursor-pointer rounded-full border border-border-strong bg-surface px-3 py-1.5 text-caption font-semibold text-ink-700"
                    >
                      Proposed task: {m.proposedTask} · Create
                    </button>
                  )}
                </div>
              )}
            </div>
          ),
        )}
        {busy && (
          <p
            role="status"
            className="mr-6 animate-pulse rounded-card bg-draft p-3 text-small text-ink-500"
          >
            Checking your records…
          </p>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
        className="flex items-center gap-2"
      >
        <DictateButton onText={(t) => setText((x) => (x ? `${x} ${t}` : t))} />
        <input
          aria-label="Message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-full border border-border-strong bg-surface px-4 py-2.5 text-small"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={busy || !text.trim()}
          className="flex size-10 flex-none cursor-pointer items-center justify-center rounded-full bg-accent-fill text-on-accent disabled:opacity-40"
        >
          <Send className="size-4" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}

/** Attach one PDF, JPG or PNG (up to 1.5 MB). Only the care team can open it. */
export function AttachFile({
  value,
  onChange,
}: {
  value: NewAttachment | null;
  onChange: (v: NewAttachment | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <p className="mb-1 text-caption font-semibold text-ink-700">Photo or document (optional)</p>
      {value ? (
        <p className="flex items-center gap-2 text-small text-ink-900">
          {value.name} · {Math.round(value.size / 1024)} KB
          <button
            type="button"
            onClick={() => onChange(null)}
            className="cursor-pointer text-caption font-semibold text-over"
          >
            Remove
          </button>
        </p>
      ) : (
        <input
          type="file"
          aria-label="Attach a photo or document"
          accept="application/pdf,image/jpeg,image/png"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setError(null);
            if (!f) return;
            if (!(attachmentTypes as readonly string[]).includes(f.type)) {
              setError("Use a PDF, JPG or PNG.");
              return;
            }
            if (f.size > MAX_ATTACHMENT) {
              setError("That file is over 1.5 MB.");
              return;
            }
            const reader = new FileReader();
            reader.onload = () =>
              onChange({
                name: f.name,
                type: f.type as NewAttachment["type"],
                size: f.size,
                dataUrl: String(reader.result),
              });
            reader.readAsDataURL(f);
          }}
          className="text-caption"
        />
      )}
      {error && <p className="mt-1 text-caption text-over">{error}</p>}
      <p className="mt-1 text-caption text-ink-500">Only your care team can open it.</p>
    </div>
  );
}

type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
};

/** Speak instead of typing, where the browser supports it. The text can be edited before sending. */
export function DictateButton({ onText }: { onText: (t: string) => void }) {
  const [on, setOn] = useState(false);
  const Ctor =
    typeof window === "undefined"
      ? null
      : ((
          window as unknown as {
            SpeechRecognition?: new () => Recognition;
            webkitSpeechRecognition?: new () => Recognition;
          }
        ).SpeechRecognition ??
        (window as unknown as { webkitSpeechRecognition?: new () => Recognition })
          .webkitSpeechRecognition ??
        null);
  if (!Ctor) return null;
  return (
    <button
      type="button"
      aria-label={on ? "Listening" : "Dictate"}
      onClick={() => {
        const r = new Ctor();
        r.lang = "en-AU";
        r.interimResults = false;
        r.onresult = (e) => onText(e.results[0]?.[0]?.transcript ?? "");
        r.onend = () => setOn(false);
        setOn(true);
        r.start();
      }}
      className={cn(
        "flex size-10 flex-none cursor-pointer items-center justify-center rounded-full border border-border-strong",
        on ? "bg-over-bg text-over" : "bg-surface text-ink-700",
      )}
    >
      <Mic className="size-4" aria-hidden="true" />
    </button>
  );
}
