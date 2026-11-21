"use client";

import { CheckCircle2, FileUp, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useResource } from "@/lib/live/client";
import { evidenceCategories } from "@/lib/live/funding";
import { ErrorNote, Skeleton } from "./bits";
import { Choice } from "./form-bits";
import { dayLabel } from "./funding-bits";

type Req = {
  participant: string;
  to: string;
  items: string[];
  message: string;
  expires: string;
  received: { name: string; at: string }[];
};

/** Workflow step 3: a secure, account-free upload for the documents Medisense asked for. */
export function FundingUpload({ token }: { token: string }) {
  const { data, error, loading } = useResource<{ request: Req }>(`/api/upload/${token}`);
  const [fresh, setFresh] = useState<Req | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] =
    useState<(typeof evidenceCategories)[number]>("NDIS plan excerpt");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);

  if (error && !data) return <ErrorNote message={error} />;
  if (loading || !data) return <Skeleton className="h-96 max-w-160" />;
  const r = fresh ?? data.request;

  async function send() {
    if (!file) return setErr("Choose a file first.");
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type))
      return setErr("Upload a PDF, JPG or PNG.");
    if (file.size > 5 * 1024 * 1024) return setErr("The file is larger than 5 MB.");
    setBusy(true);
    setErr("");
    const form = new FormData();
    form.append("file", file);
    form.append("category", category);
    try {
      const res = await fetch(`/api/upload/${token}`, { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { request?: Req; error?: string };
      if (!res.ok || !body.request) throw new Error(body.error ?? "Upload failed.");
      setFresh(body.request);
      setFile(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 flex max-w-160 flex-col gap-5">
      <section className="rounded-card border border-border bg-surface p-6 shadow-lift">
        <p className="text-small text-ink-700">
          Hello {r.to}. Medisense asked for these documents to set up {r.participant}&apos;s
          supports:
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {r.items.map((i) => (
            <li key={i} className="flex items-start gap-2 text-small font-semibold text-ink-900">
              <FileUp className="mt-0.5 size-4 flex-none text-accent" aria-hidden="true" />
              {i}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-caption text-ink-500">
          This link is open until {dayLabel(r.expires)}. Please don&apos;t send clinical notes here.
        </p>
      </section>

      <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-6 shadow-lift">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-card border-2 border-dashed border-border-strong bg-canvas px-4 py-8 text-center transition-colors hover:border-accent hover:bg-accent-tint"
        >
          <Upload className="size-6 text-accent" aria-hidden="true" />
          <span className="text-small font-semibold text-ink-900">
            {file ? file.name : "Choose a file"}
          </span>
          <span className="text-caption text-ink-500">PDF, JPG or PNG, up to 5 MB</span>
        </button>
        <input
          ref={input}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="sr-only"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setErr("");
          }}
        />
        <Choice
          label="What is it?"
          options={evidenceCategories}
          value={category}
          onChange={setCategory}
        />
        {err && <p className="rounded-control bg-over-bg px-3 py-2 text-small text-over">{err}</p>}
        <Button variant="primary" disabled={busy || !file} onClick={send}>
          {busy ? "Sending…" : "Send securely"}
        </Button>
      </section>

      {r.received.length > 0 && (
        <section className="bubble-in rounded-card border border-healthy-bg bg-healthy-bg p-5">
          <p className="flex items-center gap-2 text-small font-semibold text-healthy">
            <CheckCircle2 className="size-4" aria-hidden="true" /> Received, thank you
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {r.received.map((f) => (
              <li key={`${f.name}-${f.at}`} className="text-caption text-ink-700">
                {f.name} · {dayLabel(f.at)}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-caption text-ink-500">
            Medisense will check them and contact you if anything else is needed.
          </p>
        </section>
      )}
    </div>
  );
}
