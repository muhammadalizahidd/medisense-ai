"use client";

import { AlertCircle, FileText, ScanText, X } from "lucide-react";
import { useEffect, useState } from "react";
import { PenNib } from "@/components/ai/provenance";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field, Sheet } from "@/components/ui/sheet";
import { api } from "@/lib/live/client";
import type { ReferralInput } from "@/lib/live/referral";
import { sampleReferralEmail } from "@/lib/live/referral-extract";

/** The live staff referral form keeps its draft here (see referral-form.tsx). */
const DRAFT_KEY = "medisense-referral-draft-staff";
const NOTE_KEY = "medisense-referral-ai";
const sources = ["Email", "Phone call", "Letter or fax", "GP referral", "Other"] as const;

type Result = { form: ReferralInput; filled: number; missing: string[]; source: string };
type Note = { filled: number; missing: string[]; source: string };

/**
 * Paste or dictate a referral as it arrived; AI reads it into the live referral form. Nothing is
 * created here: the form opens with the draft, and staff check every step and submit it.
 */
export function AiReferralSheet({ onClose }: { onClose: () => void }) {
  const [source, setSource] = useState<(typeof sources)[number]>("Email");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function read() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<Result>("/api/care/referrals/extract", { body: { source, text } });
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ form: r.form, step: 0 }));
        window.sessionStorage.setItem(
          NOTE_KEY,
          JSON.stringify({ filled: r.filled, missing: r.missing, source: r.source } satisfies Note),
        );
      } catch {
        // Storage can be blocked; the form then opens empty and staff type it in.
      }
      // A full load, so the form reads the new draft even if it's already open.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load re-reads the draft even when the form is already open
      window.location.assign("/care/new?from=ai");
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI couldn't read the referral. Try again.");
      setBusy(false);
    }
  }

  return (
    <Sheet
      title="New referral"
      description="Paste or dictate the referral as you received it. AI fills in the referral form, and you check every step before anything is created."
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" disabled={busy || text.trim().length < 40} onClick={read}>
            <ScanText className="size-4" aria-hidden="true" />
            {busy ? "Reading the referral…" : "Read referral with AI"}
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Where it came from">
          <Select
            value={source}
            onChange={(e) => setSource(e.target.value as (typeof sources)[number])}
          >
            {sources.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Referral text" hint="The email, letter or your call notes, as they are.">
          <textarea
            aria-label="Referral text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={14}
            placeholder="Paste the referral here, or dictate it."
            className="w-full resize-y rounded-(--radius-field) border border-border-strong bg-surface px-3 py-2.5 text-small text-ink-900 outline-none placeholder:text-ink-400 focus:border-accent focus:shadow-focus"
          />
        </Field>
        {!text && (
          <button
            type="button"
            onClick={() => setText(sampleReferralEmail)}
            className="inline-flex w-fit cursor-pointer items-center gap-1.5 text-small font-semibold text-accent"
          >
            <FileText className="size-4" aria-hidden="true" />
            Use sample referral
          </button>
        )}
        {busy && (
          <div
            role="status"
            className="flex flex-col gap-2 rounded-card border border-dashed border-draft-rule bg-draft p-4"
          >
            <span className="flex items-center gap-2 text-small font-semibold text-ink-900">
              <PenNib className="size-4 text-accent" />
              Reading the referral…
            </span>
            <span className="h-2.5 w-4/5 animate-pulse rounded-tag bg-sunken" />
            <span className="h-2.5 w-3/5 animate-pulse rounded-tag bg-sunken" />
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-control bg-over-bg px-3 py-2 text-small text-over">
            {error}
          </p>
        )}
        <ul className="flex flex-col gap-1.5 rounded-card bg-sunken p-3 text-caption text-ink-700">
          <li>AI copies only what the referral says. Anything missing is left blank and listed.</li>
          <li>Consent and the referrer&apos;s authority are never ticked for you.</li>
          <li>The referral goes through intake review, triage and funding like any other.</li>
        </ul>
      </div>
    </Sheet>
  );
}

/** On the referral form after AI read a referral: what it filled, and what to look out for. */
export function AiReferralBanner() {
  const [note, setNote] = useState<Note | null>(null);
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("from")) return;
    try {
      const saved = window.sessionStorage.getItem(NOTE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after mount
      if (saved) setNote(JSON.parse(saved) as Note);
    } catch {
      // Without storage the form still opens; only the summary is skipped.
    }
  }, []);
  if (!note) return null;
  return (
    <section
      data-ai-only
      aria-label="AI draft"
      className="relative rounded-card border border-dashed border-draft-rule bg-draft p-4 pr-12"
    >
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          setNote(null);
          try {
            window.sessionStorage.removeItem(NOTE_KEY);
          } catch {
            // Nothing to clear.
          }
        }}
        className="absolute top-3 right-3 flex size-7 cursor-pointer items-center justify-center rounded-control text-ink-500 hover:bg-sunken"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
      <p className="flex items-center gap-2 text-small font-semibold text-ink-900">
        <PenNib className="size-4 text-accent" />
        AI draft, needs your check · {note.filled} fields filled from the{" "}
        {note.source.toLowerCase()}
      </p>
      <p className="mt-1 text-small text-ink-700">
        Check every step against the original, then confirm consent and submit. Nothing is created
        until you do.
      </p>
      {note.missing.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1 text-caption font-semibold text-watch">
            <AlertCircle className="size-3.5" aria-hidden="true" />
            Not in the referral:
          </span>
          {note.missing.map((m) => (
            <span
              key={m}
              className="rounded-tag border border-border-strong bg-surface px-2 py-0.5 text-caption text-ink-700"
            >
              {m}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
