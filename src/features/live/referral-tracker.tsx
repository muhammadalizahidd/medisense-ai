"use client";

import { Check, FileUp, MessageSquareWarning, Paperclip, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  DOCUMENT_MAX_BYTES,
  DOCUMENT_TYPES,
  documentKinds,
  type DocumentKind,
} from "@/lib/live/catalogue";
import type { ReferralStatus } from "@/lib/live/referral";
import { relativeTime, shortDate } from "@/lib/live/time";
import type { PublicReferralDto } from "@/lib/live/types";
import { useResource } from "@/lib/live/client";
import { cn } from "@/lib/cn";
import { ErrorNote, Skeleton } from "./bits";
import { TextArea } from "./form-bits";

const path: { label: string; statuses: ReferralStatus[] }[] = [
  { label: "Received", statuses: ["Submitted"] },
  { label: "Intake review", statuses: ["Under Admin Review", "Needs Information"] },
  { label: "Clinical review", statuses: ["Clinical Triage"] },
  { label: "Funding and agreement", statuses: ["Funding Review"] },
  { label: "Accepted", statuses: ["Accepted", "Closed"] },
];

/** The private tracking page: progress, any questions for the submitter, and withdrawal. */
export function ReferralTracker({ token }: { token: string }) {
  const url = `/api/referrals/track/${encodeURIComponent(token)}`;
  const resource = useResource<{ referral: PublicReferralDto }>(url);
  const { error, reload: load } = resource;
  const data = resource.data?.referral ?? null;

  // No account here, so no live connection: check for changes every half minute instead.
  useEffect(() => {
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  if (error && !data) return <ErrorNote message={error} onRetry={load} />;
  if (!data) return <Skeleton className="h-64 max-w-180" />;

  const at = path.findIndex((p) => p.statuses.includes(data.status));
  const stopped = ["Declined", "Withdrawn", "Waitlisted"].includes(data.status);

  return (
    <div className="grid max-w-240 gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="flex flex-col gap-6">
        <section className="rounded-card border border-border bg-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="label-caps">Reference</p>
              <p className="mt-1 font-mono text-h2 tracking-widest">{data.reference}</p>
            </div>
            <Button size="sm" onClick={() => void load()}>
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Refresh
            </Button>
          </div>
          <p role="status" className="mt-4 text-body font-semibold">
            {data.statusText}
          </p>
          <p className="mt-1 text-caption text-ink-500">
            Sent {shortDate(data.submittedAt)} · updated {relativeTime(data.updatedAt)}
          </p>
          {!stopped && (
            <ol className="mt-6 flex flex-col gap-0">
              {path.map((p, i) => {
                const done = i < at || data.status === "Accepted";
                const now = i === at && data.status !== "Accepted";
                return (
                  <li key={p.label} className="relative flex gap-3 pb-5 last:pb-0">
                    {i < path.length - 1 && (
                      <i
                        aria-hidden="true"
                        className={cn(
                          "absolute top-7 left-3.25 h-[calc(100%-1.5rem)] w-0.5",
                          done ? "bg-accent-fill" : "bg-border",
                        )}
                      />
                    )}
                    <span
                      className={cn(
                        "relative flex size-7 flex-none items-center justify-center rounded-full text-caption font-bold",
                        done
                          ? "bg-accent-fill text-on-accent"
                          : now
                            ? "bg-ink-900 text-surface ring-4 ring-accent-tint"
                            : "bg-canvas text-ink-500",
                      )}
                    >
                      {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                    </span>
                    <span
                      className={cn(
                        "pt-1 text-small",
                        now ? "font-semibold text-ink-900" : "text-ink-700",
                      )}
                    >
                      {p.label}
                      {now && data.status === "Needs Information" && " · waiting for you"}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {data.openRequest && (
          <AnswerRequest url={url} request={data.openRequest} onDone={() => void load()} />
        )}
      </div>

      <aside className="flex flex-col gap-4">
        <div className="rounded-card border border-border bg-surface p-5 text-small text-ink-700">
          <p className="font-semibold text-ink-900">Participant {data.participantInitials}</p>
          <p className="mt-2">
            For privacy, this page shows progress only. Our intake team will call the booking
            contact once a therapist is matched.
          </p>
        </div>
        {data.canWithdraw && <Withdraw url={url} onDone={() => void load()} />}
      </aside>
    </div>
  );
}

type Attached = { id: string; file: File; kind: DocumentKind };

function AnswerRequest({
  url,
  request,
  onDone,
}: {
  url: string;
  request: NonNullable<PublicReferralDto["openRequest"]>;
  onDone: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const [files, setFiles] = useState<Attached[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wantsPlan = request.items.some((i) => i.field === "document:NDIS plan");

  function add(list: FileList | null) {
    setError(null);
    // Copy now: the input is cleared right after, which empties the live FileList.
    const incoming = list ? [...list] : [];
    for (const file of incoming) {
      if (
        !(DOCUMENT_TYPES as readonly string[]).includes(file.type) ||
        file.size > DOCUMENT_MAX_BYTES
      ) {
        setError(`${file.name}: use a PDF, JPG, PNG or Word file up to 5 MB.`);
        return;
      }
    }
    setFiles((f) => [
      ...f,
      ...incoming.map((file) => ({
        id: crypto.randomUUID(),
        file,
        kind: (wantsPlan ? "NDIS plan" : "Other") as DocumentKind,
      })),
    ]);
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("answer", answer);
      for (const f of files) {
        body.append("files", f.file);
        body.append("kinds", f.kind);
      }
      const response = await fetch(url, { method: "POST", body });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(json.error ?? "Couldn't send your answer.");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send your answer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="We need more information"
      className="rounded-card border border-watch-bg bg-surface p-6"
    >
      <h2 className="flex items-center gap-2 text-body font-semibold">
        <MessageSquareWarning className="size-5 text-watch" aria-hidden="true" />
        We need a little more information
      </h2>
      <p className="mt-1 text-caption text-ink-500">Asked {relativeTime(request.at)}</p>
      {request.items.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5">
          {request.items.map((i) => (
            <li key={i.field} className="flex gap-2 text-small">
              <span
                aria-hidden="true"
                className="mt-2 size-1.5 flex-none rounded-full bg-watch-dot"
              />
              {i.label}
            </li>
          ))}
        </ul>
      )}
      {request.message && (
        <p className="mt-4 rounded-control bg-canvas px-3 py-2 text-small whitespace-pre-line">
          {request.message}
        </p>
      )}
      <div className="mt-5 flex flex-col gap-4">
        <TextArea label="Your answer" value={answer} onChange={setAnswer} rows={4} />
        <label className="flex cursor-pointer items-center gap-3 rounded-control border border-dashed border-border-strong px-4 py-3 hover:border-accent hover:bg-accent-tint">
          <FileUp className="size-5 text-accent" aria-hidden="true" />
          <span className="text-small font-semibold">Attach documents</span>
          <span className="text-caption text-ink-500">PDF, JPG, PNG or Word, up to 5 MB</span>
          <input
            type="file"
            multiple
            accept={DOCUMENT_TYPES.join(",")}
            className="sr-only"
            onChange={(e) => {
              add(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {files.length > 0 && (
          <ul className="flex flex-col gap-2">
            {files.map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-3 rounded-control border border-border px-3 py-2"
              >
                <Paperclip className="size-4 text-accent" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-small">{f.file.name}</span>
                <div className="w-40">
                  <Select
                    aria-label={`What is ${f.file.name}?`}
                    value={f.kind}
                    onChange={(e) =>
                      setFiles((all) =>
                        all.map((x) =>
                          x.id === f.id ? { ...x, kind: e.target.value as DocumentKind } : x,
                        ),
                      )
                    }
                  >
                    {documentKinds.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </Select>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${f.file.name}`}
                  onClick={() => setFiles((all) => all.filter((x) => x.id !== f.id))}
                  className="cursor-pointer rounded-control p-1.5 text-ink-500 hover:text-over"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="text-small text-over">
            {error}
          </p>
        )}
        <div>
          <Button
            variant="primary"
            onClick={send}
            disabled={busy || (!answer.trim() && !files.length)}
          >
            {busy ? "Sending…" : "Send answer"}
          </Button>
        </div>
      </div>
    </section>
  );
}

function Withdraw({ url, onDone }: { url: string; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <p className="text-small font-semibold">No longer need this referral?</p>
      {confirming ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const response = await fetch(url, { method: "DELETE" });
              setBusy(false);
              if (!response.ok) {
                setError(
                  ((await response.json()) as { error?: string }).error ?? "Couldn't withdraw.",
                );
                return;
              }
              onDone();
            }}
          >
            {busy ? "Withdrawing…" : "Yes, withdraw it"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Keep it
          </Button>
        </div>
      ) : (
        <Button size="sm" className="mt-3" onClick={() => setConfirming(true)}>
          Withdraw referral
        </Button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-small text-over">
          {error}
        </p>
      )}
    </div>
  );
}
