"use client";

import { AiText, useAiEnabled } from "@/components/ai/ai-switch";
import {
  CheckCircle2,
  ClipboardCheck,
  FileSignature,
  Lock,
  MapPin,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { AiChip, AiIcon } from "@/components/ai/provenance";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { AppSheet } from "@/features/mobile/phone-frame";
import { cn } from "@/lib/cn";
import { outcomes, type AssessDto, type Outcome } from "@/lib/live/assess";
import { api, useResource } from "@/lib/live/client";
import { shortDate, timeOfDay } from "@/lib/live/time";
import { Skeleton } from "./bits";

type View = "visits" | "report" | "sign";
const places = ["Home", "Telehealth", "School", "Community"] as const;

function Pills<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly T[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-caption font-semibold text-ink-700">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={value === o}
            onClick={() => onChange(o)}
            className={cn(
              "cursor-pointer rounded-full border px-3 py-1.5 text-caption font-semibold transition-colors duration-140",
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

function Area({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-caption font-semibold text-ink-700">{label}</span>
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-control border border-border-strong bg-surface px-3 py-2 text-small"
      />
    </label>
  );
}

/**
 * Module 12 on the phone: the assessment's visits, its AI-drafted report and signing, natively in
 * the therapist app. Same rules as the web: AI drafts from documented findings only, signing is
 * blocked until nothing is missing, and a signed assessment locks.
 */
export function AssessmentAppSheet({
  id,
  start = "visits",
  onClose,
  onDone,
}: {
  id: string;
  start?: View;
  onClose: () => void;
  onDone: () => void;
}) {
  const r = useResource<{ assessment: AssessDto }>(`/api/care/assessments/${id}`);
  const [view, setView] = useState<View>(start);
  const [busy, setBusy] = useState<string | null>(null);
  const a = r.data?.assessment;

  async function post(body: Record<string, unknown>, done: string, detail?: string) {
    setBusy(String(body.type));
    try {
      await api(`/api/care/assessments/${id}`, { body });
      toast(done, { tone: "success", detail });
      r.reload();
      onDone();
      return true;
    } catch (e) {
      toast("Couldn't save", { tone: "error", detail: e instanceof Error ? e.message : "" });
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppSheet
      title={a ? `${a.purpose || "Assessment"} · ${a.ref}` : "Assessment"}
      onClose={onClose}
    >
      {!a ? (
        <Skeleton className="h-60" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2 rounded-card bg-sunken px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-small font-semibold text-ink-900">{a.participant}</p>
              <p className="truncate text-caption text-ink-500">
                {a.support} · {a.templateTitle}
              </p>
            </div>
            <Tag
              tone={a.signed ? "healthy" : a.status === "Pending Signature" ? "watch" : "available"}
            >
              {a.status}
            </Tag>
          </div>
          <div
            role="tablist"
            aria-label="Assessment"
            className="grid grid-cols-3 gap-1 rounded-control bg-sunken p-1"
          >
            {(
              [
                ["visits", `Visits · ${a.visits.length}`],
                ["report", "Report"],
                ["sign", "Sign"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={view === k}
                onClick={() => setView(k)}
                className={cn(
                  "cursor-pointer rounded-control py-1.5 text-caption font-semibold",
                  view === k ? "bg-surface text-ink-900 shadow-hairline" : "text-ink-500",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {view === "visits" && <Visits a={a} busy={busy} post={post} />}
          {view === "report" && <Report a={a} busy={busy} post={post} />}
          {view === "sign" && <Sign a={a} busy={busy} post={post} />}
        </div>
      )}
    </AppSheet>
  );
}

type Post = (body: Record<string, unknown>, done: string, detail?: string) => Promise<boolean>;

function Visits({ a, busy, post }: { a: AssessDto; busy: string | null; post: Post }) {
  const [place, setPlace] = useState<(typeof places)[number]>("Home");
  const [summary, setSummary] = useState("");
  const [paused, setPaused] = useState("");
  const [outstanding, setOutstanding] = useState("");
  const editable = a.canEdit && !a.signed;
  return (
    <div className="flex flex-col gap-4">
      <ol className="relative flex flex-col gap-3 border-l-2 border-border pl-4">
        {a.visits.map((v, i) => (
          <li key={v.id} className="relative">
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-1 -left-5.5 size-3 rounded-full ring-4 ring-surface",
                v.paused ? "bg-watch-dot" : "bg-healthy-dot",
              )}
            />
            <p className="flex items-center gap-1.5 text-small font-semibold text-ink-900">
              Visit {i + 1} <span className="text-ink-500">·</span>
              <MapPin className="size-3.5 text-ink-500" aria-hidden="true" /> {v.location}
            </p>
            <p className="text-caption text-ink-500">
              {shortDate(v.date)}, {timeOfDay(v.date)} · {v.author}
            </p>
            <p className="mt-1 text-small text-ink-700">{v.summary}</p>
            {v.paused && (
              <p className="mt-1 text-caption font-semibold text-watch">Paused: {v.paused}</p>
            )}
            {v.outstanding.length > 0 && (
              <p className="mt-0.5 text-caption text-ink-500">
                Outstanding: {v.outstanding.join(", ")}
              </p>
            )}
          </li>
        ))}
        {a.visits.length === 0 && (
          <li className="text-small text-ink-500">No visits recorded yet.</li>
        )}
      </ol>
      {editable && (
        <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3.5">
          <p className="flex items-center gap-2 text-small font-semibold text-ink-900">
            <ClipboardCheck className="size-4 text-accent" aria-hidden="true" /> Record this visit
          </p>
          <Pills label="Where" value={place} onChange={setPlace} options={places} />
          <Area
            label="What happened"
            value={summary}
            onChange={setSummary}
            placeholder="What you observed and who was there"
          />
          <label className="flex flex-col gap-1">
            <span className="text-caption font-semibold text-ink-700">Pause reason (optional)</span>
            <input
              value={paused}
              onChange={(e) => setPaused(e.target.value)}
              placeholder="Fatigue, refusal, safety, time"
              className="h-10 rounded-control border border-border-strong bg-surface px-3 text-small"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-caption font-semibold text-ink-700">
              Still to finish (comma separated)
            </span>
            <input
              value={outstanding}
              onChange={(e) => setOutstanding(e.target.value)}
              placeholder="e.g. Standardised measures"
              className="h-10 rounded-control border border-border-strong bg-surface px-3 text-small"
            />
          </label>
          <Button
            variant="primary"
            loading={busy === "visit"}
            disabled={summary.trim().length < 3}
            onClick={async () => {
              const ok = await post(
                {
                  type: "visit",
                  location: place,
                  summary,
                  paused,
                  outstanding: outstanding
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean),
                },
                "Visit saved",
                outstanding.trim() ? "A booking task was raised for what's outstanding" : undefined,
              );
              if (ok) {
                setSummary("");
                setPaused("");
                setOutstanding("");
              }
            }}
          >
            Save visit
          </Button>
        </div>
      )}
    </div>
  );
}

function Report({ a, busy, post }: { a: AssessDto; busy: string | null; post: Post }) {
  const [edit, setEdit] = useState<string | null>(null);
  const ai = useAiEnabled();
  const editable = a.canEdit && !a.signed;
  const rep = a.report;
  return (
    <div className="flex flex-col gap-3">
      {!rep ? (
        <p className="rounded-card border border-dashed border-border-strong p-4 text-center text-small text-ink-500">
          <AiText
            on="No report yet. AI drafts it from the documented findings only, citing each one."
            off="No report yet. Write it from the documented findings."
          />
        </p>
      ) : edit !== null ? (
        <Area label="Your final narrative" value={edit} onChange={setEdit} rows={12} />
      ) : (
        <div
          // An unreviewed draft goes with the switch; a reviewed one is the clinician's.
          data-ai-only={!rep.reviewedBy || undefined}
          className="flex flex-col gap-3 rounded-card p-3.5 surface-draft"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            {rep.reviewedBy ? (
              <Tag tone="healthy">Reviewed by {rep.reviewedBy}</Tag>
            ) : (
              <AiChip>AI draft · needs your review</AiChip>
            )}
            <span className="text-label text-ink-500">{shortDate(rep.at)}</span>
          </div>
          {(rep.sections.length
            ? rep.sections
            : [{ heading: "Report", body: rep.text, cites: [] }]
          ).map((s) => (
            <section key={s.heading}>
              <p className="label-caps text-ink-500">{s.heading}</p>
              <p className="mt-0.5 text-small whitespace-pre-line text-ink-900">{s.body}</p>
              {s.cites.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {s.cites.slice(0, 4).map((c) => (
                    <span
                      key={c}
                      className="rounded-tag border border-border-strong px-1.5 py-0.5 text-label text-ink-500"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
      {editable && (
        <div className="grid grid-cols-2 gap-2">
          {edit !== null ? (
            <>
              <Button onClick={() => setEdit(null)}>Cancel</Button>
              <Button
                variant="primary"
                loading={busy === "review-report"}
                disabled={edit.trim().length < 20}
                onClick={async () => {
                  if (
                    await post(
                      { type: "review-report", text: edit },
                      "Report reviewed",
                      "Your edit is the final narrative",
                    )
                  )
                    setEdit(null);
                }}
              >
                Save review
              </Button>
            </>
          ) : (
            <>
              <Button
                data-ai-only
                loading={busy === "ai-report"}
                onClick={() => post({ type: "ai-report" }, "Draft ready", "Check every citation")}
              >
                <AiIcon className="size-4" />
                {rep ? "Redraft" : "Draft with AI"}
              </Button>
              <Button
                variant="primary"
                disabled={ai && !rep}
                onClick={() => setEdit(rep?.text ?? "")}
              >
                {rep ? "Review and edit" : ai ? "Review and edit" : "Write report"}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Sign({ a, busy, post }: { a: AssessDto; busy: string | null; post: Post }) {
  const [outcome, setOutcome] = useState<Outcome>(
    (a.outcome || "Treatment recommendation") as Outcome,
  );
  const [note, setNote] = useState(a.outcomeNote);
  if (a.signed)
    return (
      <div className="flex flex-col items-center gap-2 rounded-card bg-healthy-bg p-5 text-center">
        <Lock className="size-6 text-healthy" aria-hidden="true" />
        <p className="type-display text-h2 text-ink-900">{a.signed.by}</p>
        <p className="text-small text-ink-700">
          Signed {shortDate(a.signed.at)}, {timeOfDay(a.signed.at)}. The record is locked; changes
          need an amendment.
        </p>
        {a.coSign.required && (
          <Tag tone={a.coSign.by ? "healthy" : "watch"}>
            {a.coSign.by ? `Co-signed by ${a.coSign.by}` : "Awaiting Clinical Lead co-signature"}
          </Tag>
        )}
      </div>
    );
  return (
    <div className="flex flex-col gap-3">
      <Pills label="Outcome" value={outcome} onChange={setOutcome} options={outcomes} />
      <Area label="Why (your clinical reasoning)" value={note} onChange={setNote} />
      {a.canEdit && (
        <Button
          loading={busy === "outcome"}
          disabled={note.trim().length < 5}
          onClick={() => post({ type: "outcome", outcome, note }, "Outcome saved")}
        >
          Save outcome
        </Button>
      )}
      <div className="rounded-card border border-border bg-surface p-3.5">
        <p className="mb-2 text-small font-semibold text-ink-900">Before signing</p>
        {a.blockers.length === 0 ? (
          <p className="flex items-center gap-2 text-small text-healthy">
            <CheckCircle2 className="size-4" aria-hidden="true" /> Nothing is blocking. Ready to
            sign.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {a.blockers.map((b) => (
              <li key={b} className="flex items-start gap-2 text-small text-over">
                <TriangleAlert className="mt-0.5 size-4 flex-none" aria-hidden="true" /> {b}
              </li>
            ))}
          </ul>
        )}
      </div>
      {a.canEdit && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            disabled={a.blockers.length > 0 || a.status === "Pending Signature"}
            loading={busy === "submit"}
            onClick={() => post({ type: "submit" }, "Ready for signature")}
          >
            Mark ready
          </Button>
          <Button
            variant="primary"
            disabled={a.blockers.length > 0}
            loading={busy === "sign"}
            onClick={() =>
              post(
                { type: "sign" },
                "Signed and locked",
                a.coSign.required ? "Sent for Clinical Lead co-signature" : undefined,
              )
            }
          >
            <FileSignature className="size-4" aria-hidden="true" />
            Sign
          </Button>
        </div>
      )}
    </div>
  );
}
