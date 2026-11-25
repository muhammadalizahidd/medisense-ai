"use client";

import { useAiEnabled } from "@/components/ai/ai-switch";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileSignature,
  FileText,
  History,
  Lock,
  Mic,
  Pause,
  Play,
  RefreshCcw,
  Share2,
  ShieldAlert,
  Square,
  UserCheck,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AiDraft, RuleMark, Signature } from "@/components/ai/provenance";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Stepper } from "@/components/ui/premium";
import { Select } from "@/components/ui/select";
import { inputClass } from "@/components/ui/sheet";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { useResource } from "@/lib/live/client";
import {
  amendReasons,
  consentStates,
  shareRecipients,
  speakers,
  statusTone,
  type DocFull,
  type DocSection,
  type TranscriptSeg,
} from "@/lib/live/docs";
import { cn } from "@/lib/cn";
import { ErrorNote, LiveBadge, Skeleton } from "./bits";
import { FCard } from "./funding-bits";
import { ops, textArea, when } from "./ops-bits";

const allTabs = [
  { id: "overview", label: "Overview" },
  { id: "capture", label: "Capture" },
  { id: "transcript", label: "Transcript" },
  { id: "draft", label: "Sources & draft" },
  { id: "sign", label: "Review & sign" },
  { id: "share", label: "Addenda & sharing" },
  { id: "history", label: "History" },
] as const;
type T = (typeof allTabs)[number]["id"];
type Post = (body: unknown, ok: string, detail?: string) => Promise<boolean>;
const flow = ["Capture", "Draft", "Review", "Signed"];
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** The one thing to do next, so the clinician never has to work out the order. */
function nextStep(p: DocFull): { text: string; tab: T; button: string } {
  if (p.offline.state === "Conflict")
    return {
      text: "The phone and web versions differ. Choose one.",
      tab: "sign",
      button: "Resolve conflict",
    };
  if (p.status === "Awaiting Co-sign")
    return {
      text: `Signed by you; with ${p.coSign.supervisor} for co-signature.`,
      tab: "history",
      button: "View history",
    };
  if (["Signed", "Addendum"].includes(p.status))
    return {
      text: "Signed and locked. Add an addendum or share an approved summary.",
      tab: "share",
      button: "Addenda & sharing",
    };
  if (!p.observations && !p.transcript.length && !p.sections.some((s) => s.text))
    return {
      text: "Capture what happened: type or dictate.",
      tab: "capture",
      button: "Start capture",
    };
  if (p.transcript.some((s) => s.uncertain && !s.corrected))
    return {
      text: "Some transcript words are uncertain. Correct or confirm them.",
      tab: "transcript",
      button: "Review transcript",
    };
  if (!p.sections.some((s) => s.text) && !p.selected.length)
    return {
      text: "Choose the sources for the AI draft, or write the note yourself.",
      tab: "draft",
      button: "Choose sources",
    };
  if (p.sections.some((s) => s.origin === "ai" && s.state === "pending"))
    return {
      text: "Accept, edit or reject each AI section.",
      tab: "draft",
      button: "Review AI sections",
    };
  if (p.warnings.some((w) => !w.resolved))
    return { text: "Resolve the review warnings.", tab: "sign", button: "Resolve warnings" };
  return {
    text: "Confirm you reviewed and verified the note, then sign.",
    tab: "sign",
    button: "Review and sign",
  };
}

export function DocWorkspace({
  id,
  base,
}: {
  id: string;
  base: "/therapist/documentation" | "/care/documentation";
}) {
  const url = `/api/care/documentation/${id}`;
  const { data, error, loading, reload } = useResource<{ doc: DocFull }>(
    url,
    (e) => e.type === "care",
  );
  const [tab, setTab] = useTab(allTabs);
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-[760px]" />;
  const p = data.doc;
  const post: Post = async (body, ok, detail) => {
    const res = await ops(url, body, ok, detail);
    if (res) reload();
    return Boolean(res);
  };
  const step = ["Signed", "Addendum"].includes(p.status)
    ? 3
    : p.status === "Awaiting Co-sign" || p.status === "Needs Review"
      ? 2
      : p.sections.some((s) => s.text)
        ? 1
        : 0;
  const visible =
    p.view === "status"
      ? allTabs.filter((t) => t.id === "overview" || t.id === "history")
      : allTabs;
  const current = visible.some((t) => t.id === tab) ? tab : "overview";
  const k = p.timeline.length;
  const open = p.warnings.filter((w) => !w.resolved).length;
  return (
    <>
      <PageHeader
        eyebrow="Live care"
        leading={
          <ButtonLink size="sm" variant="ghost" href={base}>
            <ArrowLeft className="size-3.5" aria-hidden="true" />{" "}
            {base === "/therapist/documentation" ? "My documentation" : "Documentation"}
          </ButtonLink>
        }
        title={p.noteType}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{p.ref}</span>
            <Tag tone={statusTone[p.status]}>{p.status}</Tag>
            {p.overdue && <Tag tone="over">Overdue</Tag>}
            {p.restricted && (
              <Tag tone="outline">
                <Lock className="size-3" aria-hidden="true" /> Protected
              </Tag>
            )}
          </span>
        }
        actions={<LiveBadge />}
      />
      <section className="grid overflow-hidden rounded-card border border-border bg-surface shadow-lift xl:grid-cols-12">
        <div className="border-b border-border p-6 xl:col-span-4 xl:border-r xl:border-b-0">
          <p className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
            Participant
          </p>
          <p className="mt-1 type-display text-h2 text-ink-900">{p.participant}</p>
          <p className="font-mono text-caption text-ink-500">{p.participantId}</p>
          <p className="mt-2 text-small text-ink-700">
            {p.discipline} · {p.clinician}
          </p>
          <p className="text-small text-ink-700">
            {when(p.encounterAt)} · {p.mode}
            {p.appointment ? ` · ${p.appointment.ref}` : ` · not linked: ${p.unlinkedReason}`}
          </p>
        </div>
        <div className="flex flex-col justify-center gap-4 p-6 xl:col-span-8">
          <Stepper steps={flow} current={step} />
          <div className="flex flex-wrap gap-2">
            <Tag tone="outline">{p.capture}</Tag>
            <Tag tone={p.consents.ai === "Granted" ? "healthy" : "outline"}>
              AI processing: {p.consents.ai}
            </Tag>
            {p.mode === "Telehealth" && (
              <Tag tone={p.consents.recording === "Granted" ? "healthy" : "outline"}>
                Recording: {p.consents.recording}
              </Tag>
            )}
            {open > 0 && <Tag tone="over">{open} warning(s) to resolve</Tag>}
            {p.coSign.required && (
              <Tag tone={p.coSign.status === "Approved" ? "healthy" : "watch"}>
                Co-sign: {p.coSign.status}
              </Tag>
            )}
            {p.offline.state !== "Synced" && <Tag tone="over">{p.offline.state}</Tag>}
          </div>
        </div>
      </section>
      {p.view === "status" && (
        <p className="flex items-center gap-2 rounded-card border border-border bg-sunken px-4 py-3 text-small text-ink-700">
          <Lock className="size-4 text-ink-500" aria-hidden="true" /> Status view: completion and
          timeline only. Note content, transcripts and recordings aren&apos;t shown to your role.
        </p>
      )}
      <div className="mt-2">
        <Tabs
          label="Note"
          tabs={visible.map((t) => ({
            ...t,
            count:
              t.id === "transcript"
                ? p.transcript.filter((s) => s.uncertain && !s.corrected).length || undefined
                : t.id === "sign"
                  ? p.blockers.length || undefined
                  : t.id === "draft"
                    ? p.sections.filter((s) => s.origin === "ai" && s.state === "pending").length ||
                      undefined
                    : undefined,
          }))}
          value={current}
          onChange={(t: T) => setTab(t)}
        />
      </div>
      <TabPanel id="overview" value={current}>
        <Overview p={p} go={setTab} post={post} />
      </TabPanel>
      <TabPanel id="capture" value={current}>
        <Capture key={k} p={p} post={post} />
      </TabPanel>
      <TabPanel id="transcript" value={current}>
        <Transcript key={k} p={p} post={post} />
      </TabPanel>
      <TabPanel id="draft" value={current}>
        <Draft p={p} post={post} />
      </TabPanel>
      <TabPanel id="sign" value={current}>
        <Sign key={k} p={p} post={post} />
      </TabPanel>
      <TabPanel id="share" value={current}>
        <Share key={k} p={p} post={post} />
      </TabPanel>
      <TabPanel id="history" value={current}>
        <FCard
          icon={History}
          title="Audit timeline"
          sub="Capture, AI generation, edits, warnings, signatures, addenda and shares"
          flush
        >
          <ol className="max-h-[620px] divide-y divide-border overflow-y-auto">
            {p.timeline.map((h, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-4 px-5 py-3">
                <span className="min-w-0 flex-1 text-small text-ink-900">{h.action}</span>
                <span className="text-caption text-ink-500">
                  {h.by} · {when(h.at)}
                  {h.reason ? ` · ${h.reason}` : ""}
                </span>
              </li>
            ))}
          </ol>
        </FCard>
      </TabPanel>
    </>
  );
}

/* ------------------------------------------------------------------ overview */

function Overview({ p, go, post }: { p: DocFull; go: (t: T) => void; post: Post }) {
  const n = nextStep(p);
  const [note, setNote] = useState("");
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <FCard
        icon={FileText}
        title="Note sections"
        sub="Who wrote each section, and its review state"
        className="xl:col-span-7"
        flush
      >
        <ul className="divide-y divide-border">
          {p.sections.map((s) => (
            <li key={s.key} className="flex items-center gap-3 px-5 py-3">
              <span className="min-w-0 flex-1">
                <span className="text-small font-semibold text-ink-900">{s.title}</span>
                {s.required && <span className="ml-1.5 text-caption text-ink-500">required</span>}
                {p.view !== "status" && s.text && (
                  <span className="block truncate text-caption text-ink-500">{s.text}</span>
                )}
              </span>
              <Tag
                tone={s.origin === "ai" ? (s.state === "pending" ? "watch" : "outline") : "outline"}
              >
                {s.origin === "ai"
                  ? s.state === "pending"
                    ? "AI · not verified"
                    : `AI · ${s.state}`
                  : s.text
                    ? "Clinician"
                    : "Empty"}
              </Tag>
            </li>
          ))}
        </ul>
      </FCard>
      <div className="flex flex-col gap-6 xl:col-span-5 [&>*:last-child]:flex-1">
        {p.view === "edit" && (
          <FCard icon={ArrowRight} title="Next step" sub="One step at a time; nothing is skipped">
            <p className="text-body text-ink-900">{n.text}</p>
            <Button className="mt-4" variant="primary" onClick={() => go(n.tab)}>
              {n.button} <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </FCard>
        )}
        {p.canSupervise ? (
          <FCard
            icon={UserCheck}
            title="Supervisor review"
            sub="Approve to co-sign, or send it back with a reason"
            action={<RuleMark>Policy</RuleMark>}
          >
            <textarea
              aria-label="Feedback"
              placeholder="Feedback for the author"
              className={textArea}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="primary"
                onClick={() => post({ type: "co-sign", decision: "Approve", note }, "Co-signed")}
              >
                Approve and co-sign
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  post(
                    { type: "co-sign", decision: "Request changes", note },
                    "Changes requested",
                    "The author has a correction task",
                  )
                }
              >
                Request changes
              </Button>
            </div>
          </FCard>
        ) : (
          <FCard
            icon={FileSignature}
            title="Signature"
            sub={
              p.coSign.required
                ? `Supervised: ${p.coSign.supervisor} co-signs`
                : "The treating clinician signs"
            }
          >
            {p.signed ? (
              <div className="flex flex-col gap-3">
                <Signature name={p.signed.by} when={when(p.signed.at)} label="Author signed" />
                {p.coSign.required && (
                  <p className="text-small text-ink-700">
                    Supervisor: {p.coSign.status}
                    {p.coSign.note ? ` · ${p.coSign.note}` : ""}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-small text-ink-500">
                Not signed.{" "}
                {p.view === "edit" ? `${p.blockers.length} item(s) before signing.` : ""}
              </p>
            )}
          </FCard>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ capture */

function Capture({ p, post }: { p: DocFull; post: Post }) {
  const ai = useAiEnabled();
  const [text, setText] = useState(p.observations);
  const [rec, setRec] = useState<"idle" | "recording" | "paused">("idle");
  const [secs, setSecs] = useState(0);
  const [denied, setDenied] = useState(false);
  const can = p.canEdit;
  useEffect(() => {
    if (rec !== "recording") return;
    const t = window.setInterval(() => setSecs((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [rec]);
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <FCard
        icon={FileText}
        title="Typed observations"
        sub="What you observed and what was reported; AI is optional"
        className="xl:col-span-7"
        footer={
          can && (
            <Button
              variant="primary"
              onClick={() => post({ type: "observations", text }, "Observations saved")}
            >
              Save observations
            </Button>
          )
        }
      >
        <textarea
          aria-label="Observations"
          disabled={!can}
          className={cn(textArea, "h-full min-h-72")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="For example: Dressing, upper body independent with set-up; lower body needed physical help with socks."
        />
      </FCard>
      <div className="flex flex-col gap-6 xl:col-span-5 [&>*:last-child]:flex-1">
        <FCard
          icon={Mic}
          title="Dictation"
          sub="Dictate observations only; this is not a recording of the visit"
          action={<Tag tone="outline">Simulated</Tag>}
        >
          {denied ? (
            <div className="rounded-control border border-watch bg-watch-bg p-3 text-small">
              <strong>Microphone blocked.</strong> Allow the microphone in your browser&apos;s site
              settings, or type your observations instead.
              <Button className="mt-2" size="sm" variant="ghost" onClick={() => setDenied(false)}>
                Try again
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-2">
              <div
                className="flex h-12 w-full items-center justify-center gap-1"
                aria-hidden="true"
              >
                {Array.from({ length: 28 }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "w-1 rounded-full bg-accent-fill transition-all duration-220",
                      rec === "recording" ? "opacity-90" : "opacity-25",
                    )}
                    style={{
                      height: rec === "recording" ? `${8 + ((i * 37 + secs * 13) % 36)}px` : "6px",
                    }}
                  />
                ))}
              </div>
              <p className="font-mono text-h2 text-ink-900" role="status">
                {mmss(secs)}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {rec === "idle" && (
                  <Button variant="primary" disabled={!can} onClick={() => setRec("recording")}>
                    <Mic className="size-4" aria-hidden="true" /> Start
                  </Button>
                )}
                {rec === "recording" && (
                  <Button onClick={() => setRec("paused")}>
                    <Pause className="size-4" aria-hidden="true" /> Pause
                  </Button>
                )}
                {rec === "paused" && (
                  <Button onClick={() => setRec("recording")}>
                    <Play className="size-4" aria-hidden="true" /> Resume
                  </Button>
                )}
                {rec !== "idle" && (
                  <Button
                    variant="primary"
                    onClick={async () => {
                      setRec("idle");
                      await post(
                        {
                          type: "dictation",
                          seconds: Math.max(secs, 20),
                          language: "English (Australia)",
                        },
                        "Dictation transcribed",
                        "Check uncertain words in the Transcript tab",
                      );
                      setSecs(0);
                    }}
                  >
                    <Square className="size-4" aria-hidden="true" /> Stop and transcribe
                  </Button>
                )}
                {rec !== "idle" && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setRec("idle");
                      setSecs(0);
                    }}
                  >
                    Delete capture
                  </Button>
                )}
              </div>
              {rec === "idle" && can && (
                <button
                  type="button"
                  className="cursor-pointer text-caption text-ink-500 underline"
                  onClick={() => setDenied(true)}
                >
                  Microphone not working?
                </button>
              )}
              <p className="text-caption text-ink-500">
                Language: {p.dictation.language} · {mmss(p.dictation.seconds)} dictated so far
              </p>
            </div>
          )}
        </FCard>
        <FCard
          icon={ShieldAlert}
          title="Consent"
          sub="Each purpose is recorded separately; nothing is inferred"
        >
          <div className="flex flex-col gap-3">
            {[
              ...(ai ? ["ai"] : []),
              ...(p.mode === "Telehealth" ? ["recording"] : []),
              "sharing",
            ].map((w) => (
              <div key={w} className="flex items-center justify-between gap-3">
                <span className="text-small text-ink-900">
                  {w === "ai"
                    ? "AI processing"
                    : w === "recording"
                      ? "Visit recording"
                      : "Sharing with third parties"}
                </span>
                <div className="w-40">
                  <Select
                    aria-label={`${w} consent`}
                    className="h-9"
                    value={p.consents[w as keyof DocFull["consents"]]}
                    onChange={(e) =>
                      post({ type: "consent", which: w, state: e.target.value }, "Consent recorded")
                    }
                  >
                    {consentStates.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </div>
              </div>
            ))}
          </div>
        </FCard>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ transcript */

function Segment({ s, can, post }: { s: TranscriptSeg; can: boolean; post: Post }) {
  const [text, setText] = useState(s.text);
  const [speaker, setSpeaker] = useState<string>(s.speaker);
  const needs = s.uncertain && !s.corrected;
  return (
    <li className={cn("px-5 py-3", needs && "bg-watch-bg")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-caption text-ink-500">{mmss(s.at)}</span>
        <div className="w-36">
          <Select
            aria-label="Speaker"
            className="h-8"
            disabled={!can}
            value={speaker}
            onChange={(e) => setSpeaker(e.target.value)}
          >
            {speakers.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </Select>
        </div>
        {needs && <Tag tone="watch">Uncertain</Tag>}
        {s.corrected && (
          <Tag tone="healthy">{s.text !== s.original ? "Corrected" : "Confirmed"}</Tag>
        )}
      </div>
      <input
        aria-label="Transcript text"
        disabled={!can}
        className={cn(inputClass, "mt-2")}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {s.text !== s.original && (
        <p className="mt-1 text-caption text-ink-500">Original: {s.original}</p>
      )}
      {can && (
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            variant={needs ? "primary" : "secondary"}
            onClick={() =>
              post(
                { type: "segment", id: s.id, text, speaker, confirm: true },
                text !== s.original ? "Correction saved" : "Confirmed",
              )
            }
          >
            <Check className="size-3.5" aria-hidden="true" />{" "}
            {text !== s.original ? "Save correction" : "Confirm as heard"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => post({ type: "redact", id: s.id }, "Redacted")}
          >
            Redact
          </Button>
        </div>
      )}
    </li>
  );
}

function Transcript({ p, post }: { p: DocFull; post: Post }) {
  const authorised =
    p.mode !== "Telehealth" ||
    p.capture !== "Transcript import" ||
    (p.consents.recording === "Granted" && p.consents.ai === "Granted");
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <FCard
        icon={Mic}
        title="Transcript"
        sub="Machine-generated until you review it; originals are kept"
        className="xl:col-span-8"
        flush
      >
        {!authorised ? (
          <p className="px-5 py-10 text-center text-small text-ink-700">
            No transcript: recording or AI processing wasn&apos;t authorised. Document the visit
            manually.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {p.transcript.map((s) => (
              <Segment key={s.id} s={s} can={p.canEdit} post={post} />
            ))}
            {!p.transcript.length && (
              <li className="px-5 py-10 text-center text-small text-ink-500">
                No transcript yet. Dictate from the Capture tab, or type your observations.
              </li>
            )}
          </ul>
        )}
      </FCard>
      <FCard
        icon={ShieldAlert}
        title="How to review"
        className="xl:col-span-4"
        action={<RuleMark>Rule</RuleMark>}
      >
        <ul className="flex flex-col gap-2 text-small text-ink-700">
          <li>Uncertain words are highlighted and must be corrected or confirmed.</li>
          <li>Label each speaker: clinician, participant, carer or unknown.</li>
          <li>Corrections keep the original for the reviewer.</li>
          <li>Redact anything that shouldn&apos;t be kept.</li>
        </ul>
        <p className="mt-4 text-caption text-ink-500">
          {p.transcript.filter((s) => s.uncertain && !s.corrected).length} uncertain ·{" "}
          {p.transcript.filter((s) => s.corrected).length} reviewed · {p.transcript.length} segments
        </p>
      </FCard>
    </div>
  );
}

/* ------------------------------------------------------------------ sources and AI draft */

function SectionCard({ s, p, post }: { s: DocSection; p: DocFull; post: Post }) {
  const [text, setText] = useState(s.text);
  const ai = s.origin === "ai";
  const pending = ai && s.state === "pending";
  return (
    <div
      className={cn(
        "rounded-card border p-4",
        pending ? "border-dashed surface-draft" : "border-border bg-surface",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-small font-semibold text-ink-900">{s.title}</span>
        {s.required && <span className="text-caption text-ink-500">required</span>}
        {ai && (
          <Tag tone={pending ? "watch" : "outline"}>
            {pending ? "AI generated · not clinically verified" : `AI · ${s.state}`}
          </Tag>
        )}
        {s.cites.length > 0 && (
          <span className="ml-auto font-mono text-caption text-ink-500">{s.cites.join(" ")}</span>
        )}
      </div>
      <textarea
        aria-label={s.title}
        disabled={!p.canEdit}
        className={cn(textArea, "min-h-24")}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {p.canEdit && (
        <div className="mt-2 flex flex-wrap gap-2">
          {ai ? (
            <>
              <Button
                size="sm"
                variant={pending ? "primary" : "secondary"}
                // Once reviewed, the button only saves a change; there's nothing left to accept.
                disabled={!pending && text === s.text}
                onClick={() =>
                  post(
                    {
                      type: "section",
                      key: s.key,
                      text,
                      state: text !== s.text ? "edited" : "accepted",
                    },
                    text !== s.text ? "Section edited" : "Section accepted",
                  )
                }
              >
                <Check className="size-3.5" aria-hidden="true" />{" "}
                {text !== s.text ? "Save edit" : pending ? "Accept" : "Reviewed"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  post(
                    { type: "section", key: s.key, text: "", state: "rejected" },
                    "Section rejected",
                  )
                }
              >
                <X className="size-3.5" aria-hidden="true" /> Reject
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                post({ type: "section", key: s.key, text, state: "clinician" }, "Section saved")
              }
            >
              Save
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Draft({ p, post }: { p: DocFull; post: Post }) {
  const [sel, setSel] = useState<string[]>(p.selected);
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) =>
    setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  const aiBlocked = p.consents.ai === "Declined" || p.consents.ai === "Withdrawn";
  const aiPending = p.consents.ai === "Pending";
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <div className="flex flex-col gap-6 xl:col-span-4 [&>*:last-child]:flex-1">
        <FCard
          icon={FileText}
          title="Sources"
          sub="Only what you tick is used; other patients' notes are never available"
          flush
          footer={
            p.canEdit && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => post({ type: "sources", selected: sel }, "Sources saved")}
              >
                Save selection
              </Button>
            )
          }
        >
          <ul className="max-h-[560px] divide-y divide-border overflow-y-auto">
            {p.sources.map((s, i) => (
              <li key={s.id} className="px-4 py-2.5">
                <label className="flex items-start gap-2.5 text-small">
                  <input
                    type="checkbox"
                    className="mt-1"
                    disabled={!p.canEdit}
                    checked={sel.includes(s.id)}
                    onChange={() => toggle(s.id)}
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-caption text-ink-500">
                        S{p.selected.includes(s.id) ? p.selected.indexOf(s.id) + 1 : i + 1}
                      </span>
                      <span className="font-semibold text-ink-900">{s.label}</span>
                      <Tag tone="outline">{s.reported}</Tag>
                    </span>
                    <span className="mt-0.5 block text-caption text-ink-700">{s.text}</span>
                  </span>
                </label>
              </li>
            ))}
            {!p.sources.length && (
              <li className="px-4 py-8 text-center text-small text-ink-500">
                No sources yet. Capture observations or dictate first.
              </li>
            )}
          </ul>
        </FCard>
      </div>
      <div className="flex flex-col gap-4 xl:col-span-8">
        {busy ? (
          <AiDraft label="Drafting from your chosen sources" suggestionsOnly generating />
        ) : (
          <AiDraft
            label="AI draft"
            suggestionsOnly
            meta={p.aiAt ? `Generated ${when(p.aiAt)}` : `${sel.length} source(s) chosen`}
          >
            <p className="text-small text-ink-700">
              {aiBlocked
                ? "AI processing consent isn't in place. Write each section yourself below."
                : "The draft uses only your ticked sources, cites them, keeps reported and observed apart, and never adds measurements or diagnoses."}
            </p>
            {p.canEdit && aiPending && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-control border border-watch bg-watch-bg p-3 text-small">
                <span className="min-w-0 flex-1">
                  AI processing consent is pending. Nothing is sent to AI until it is recorded.
                </span>
                <Button
                  size="sm"
                  onClick={() =>
                    post({ type: "consent", which: "ai", state: "Granted" }, "AI consent recorded")
                  }
                >
                  Participant consented to AI processing
                </Button>
              </div>
            )}
            {p.canEdit && !aiBlocked && !aiPending && (
              <Button
                className="mt-3"
                size="sm"
                variant="soft"
                disabled={!sel.length}
                onClick={async () => {
                  setBusy(true);
                  if (sel.join() !== p.selected.join())
                    await post({ type: "sources", selected: sel }, "Sources saved");
                  await post(
                    { type: "generate" },
                    "Draft generated",
                    "Review every section before signing",
                  );
                  setBusy(false);
                }}
              >
                {p.aiAt ? "Generate again" : "Generate draft"}
              </Button>
            )}
          </AiDraft>
        )}
        {p.sections.map((s) => (
          <SectionCard key={`${s.key}-${s.state}-${s.text.length}`} s={s} p={p} post={post} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ review and sign */

function Sign({ p, post }: { p: DocFull; post: Post }) {
  const [res, setRes] = useState<Record<string, string>>({});
  return (
    <div className="flex flex-col gap-6">
      {p.offline.conflict && p.canEdit && (
        <FCard
          icon={RefreshCcw}
          title="Phone and web versions differ"
          sub={`Section: ${p.offline.conflict.section}. Choose one; nothing is overwritten silently.`}
          action={<RuleMark>Sync</RuleMark>}
        >
          <div className="grid items-stretch gap-4 md:grid-cols-2">
            {(["mobile", "web"] as const).map((side) => (
              <div
                key={side}
                className="flex flex-col gap-3 rounded-control border border-border-strong p-4"
              >
                <p className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
                  {side === "mobile" ? "Phone (offline draft)" : "Web"}
                </p>
                <p className="flex-1 text-small text-ink-900">
                  {side === "mobile" ? p.offline.conflict?.mobile : p.offline.conflict?.web}
                </p>
                <Button
                  size="sm"
                  onClick={() => post({ type: "resolve-sync", keep: side }, "Conflict resolved")}
                >
                  Keep this version
                </Button>
              </div>
            ))}
          </div>
        </FCard>
      )}
      <div className="grid items-stretch gap-6 xl:grid-cols-12">
        <FCard
          icon={ShieldAlert}
          title="Review warnings"
          sub="Conflicts, unsupported claims, uncertain words and risks; rules never resolve them for you"
          className="xl:col-span-7"
          action={<RuleMark>Check</RuleMark>}
          flush
        >
          <ul className="divide-y divide-border">
            {p.warnings.map((w) => (
              <li key={w.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Tag
                    tone={
                      w.resolved
                        ? "healthy"
                        : w.kind === "Risk" || w.kind === "Conflict"
                          ? "over"
                          : "watch"
                    }
                  >
                    {w.resolved ? "Resolved" : w.kind}
                  </Tag>
                  <span className="min-w-0 flex-1 text-small text-ink-900">{w.text}</span>
                </div>
                {w.resolved ? (
                  <p className="mt-1 text-caption text-ink-500">Resolution: {w.resolution}</p>
                ) : (
                  p.canEdit && (
                    <div className="mt-2 flex gap-2">
                      <input
                        aria-label="Resolution"
                        placeholder={
                          w.kind === "Conflict"
                            ? "Which value is correct, and why"
                            : "How you resolved it"
                        }
                        className={inputClass}
                        value={res[w.id] ?? ""}
                        onChange={(e) => setRes({ ...res, [w.id]: e.target.value })}
                      />
                      <Button
                        size="sm"
                        disabled={(res[w.id] ?? "").length < 3}
                        onClick={() =>
                          post(
                            { type: "resolve", id: w.id, resolution: res[w.id] ?? "" },
                            "Resolved",
                          )
                        }
                      >
                        Resolve
                      </Button>
                    </div>
                  )
                )}
              </li>
            ))}
            {!p.warnings.length && (
              <li className="px-5 py-8 text-center text-small text-healthy">
                No conflicts, unsupported claims or uncertain words.
              </li>
            )}
          </ul>
        </FCard>
        <FCard
          icon={FileSignature}
          title="Sign and finalise"
          sub="Signing locks the note; changes then need an addendum"
          className="xl:col-span-5"
          footer={
            p.canEdit && (
              <Button
                variant="primary"
                disabled={p.blockers.length > 0}
                onClick={() =>
                  post(
                    { type: "sign" },
                    p.coSign.required ? "Signed; sent for co-signature" : "Signed and locked",
                  )
                }
              >
                <FileSignature className="size-4" aria-hidden="true" />{" "}
                {p.coSign.required ? "Sign and send to supervisor" : "Sign note"}
              </Button>
            )
          }
        >
          <div className="flex flex-col gap-3">
            {p.signed && (
              <Signature name={p.signed.by} when={when(p.signed.at)} label="Author signed" />
            )}
            {p.canEdit && (
              <label
                className={cn(
                  "flex items-start gap-2.5 rounded-control border p-3 text-small",
                  p.reviewedAck ? "border-healthy bg-healthy-bg" : "border-border-strong",
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={p.reviewedAck}
                  onChange={(e) =>
                    post(
                      { type: "review", ack: e.target.checked },
                      e.target.checked ? "Review confirmed" : "Confirmation removed",
                    )
                  }
                />
                <span>
                  <strong>I reviewed and verified this note.</strong> It reflects what happened, and
                  I am responsible for its content.
                </span>
              </label>
            )}
            {p.blockers.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {p.blockers.map((b) => (
                  <li
                    key={b}
                    className="rounded-control border border-watch bg-watch-bg px-3 py-1.5 text-small"
                  >
                    {b}
                  </li>
                ))}
              </ul>
            )}
            {!p.blockers.length && p.canEdit && (
              <p className="text-small text-healthy">Ready to sign.</p>
            )}
          </div>
        </FCard>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ addenda and sharing */

function Share({ p, post }: { p: DocFull; post: Post }) {
  const signed = ["Signed", "Addendum"].includes(p.status);
  const [a, setA] = useState({ reason: "Correction", text: "" });
  const [s, setS] = useState({ recipient: "Participant", authorityChecked: false, summary: "" });
  const mine = p.view === "edit";
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <FCard
        icon={FileSignature}
        title="Addenda"
        sub="The signed note stays unchanged; each addendum keeps its reason, author and time"
        className="xl:col-span-6"
        footer={
          mine &&
          signed && (
            <Button
              size="sm"
              disabled={a.text.length < 5}
              onClick={() => post({ type: "addendum", ...a }, "Addendum added")}
            >
              Add addendum
            </Button>
          )
        }
      >
        <ul className="flex flex-col gap-2">
          {p.addenda.map((x) => (
            <li key={x.at} className="rounded-control border border-border p-3 text-small">
              <p className="text-ink-900">{x.text}</p>
              <p className="text-caption text-ink-500">
                {x.reason} · {x.by} · {when(x.at)}
              </p>
            </li>
          ))}
          {!p.addenda.length && <li className="text-small text-ink-500">No addenda.</li>}
        </ul>
        {mine && signed && (
          <div className="mt-4 flex flex-col gap-2">
            <Select
              aria-label="Amendment reason"
              value={a.reason}
              onChange={(e) => setA({ ...a, reason: e.target.value })}
            >
              {amendReasons.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
            <textarea
              aria-label="Addendum text"
              placeholder="Addendum"
              className={textArea}
              value={a.text}
              onChange={(e) => setA({ ...a, text: e.target.value })}
            />
          </div>
        )}
        {!signed && (
          <p className="mt-3 text-small text-ink-500">Available once the note is signed.</p>
        )}
      </FCard>
      <FCard
        icon={Share2}
        title="Share an approved summary"
        sub="Only what you write here is shared, and only with an authorised recipient"
        className="xl:col-span-6"
        footer={
          mine &&
          signed && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => post({ type: "share", ...s }, "Shared", "Recorded in the audit")}
            >
              Share summary
            </Button>
          )
        }
      >
        <ul className="mb-3 flex flex-col gap-2">
          {p.shares.map((x) => (
            <li key={x.at} className="rounded-control border border-border p-3 text-small">
              <p className="font-semibold text-ink-900">{x.recipient}</p>
              <p className="text-ink-700">{x.summary}</p>
              <p className="text-caption text-ink-500">
                {x.by} · {when(x.at)}
              </p>
            </li>
          ))}
          {!p.shares.length && (
            <li className="text-small text-ink-500">
              Nothing shared. Internal notes are never shared automatically.
            </li>
          )}
        </ul>
        {mine && signed && (
          <div className="flex flex-col gap-2">
            <Select
              aria-label="Recipient"
              value={s.recipient}
              onChange={(e) => setS({ ...s, recipient: e.target.value })}
            >
              {shareRecipients.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
            <textarea
              aria-label="Summary to share"
              placeholder="A plain-language summary for the recipient"
              className={textArea}
              value={s.summary}
              onChange={(e) => setS({ ...s, summary: e.target.value })}
            />
            <label className="flex items-center gap-2 text-small">
              <input
                type="checkbox"
                checked={s.authorityChecked}
                onChange={(e) => setS({ ...s, authorityChecked: e.target.checked })}
              />
              I checked this recipient is authorised to receive it
            </label>
          </div>
        )}
      </FCard>
    </div>
  );
}
