"use client";

import { Skeleton } from "./bits";
import {
  AlertTriangle,
  BotMessageSquare,
  ClipboardCheck,
  Dumbbell,
  LifeBuoy,
  MessageCircleQuestion,
  Share2,
  TrendingUp,
  Volume2,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { AppSheet, IconBadge } from "@/features/mobile/phone-frame";
import { useResource } from "@/lib/live/client";
import {
  changeOptions,
  coachResults,
  concernTypes,
  difficulties,
  fallOptions,
  homeDifficulty,
  homeDone,
  languages,
  logistics,
  noticedOptions,
  skipReasons,
  type ActivityDto,
  type CheckinAnswers,
  type CoachQuestionDto,
  type PatientEnhanceDto,
  type NewAttachment,
  type Reporter,
} from "@/lib/live/enhance";
import { shortDate, timeOfDay } from "@/lib/live/time";
import {
  act,
  AttachFile,
  AiBox,
  Card,
  ChatThread,
  Field,
  Pick,
  PickMany,
  ReportedBy,
  ReporterPick,
  Sources,
} from "./enhance-ui";
import { BookingAgent } from "./booking-agent";
import { cn } from "@/lib/cn";

/* Patient app side of AI Enhancements 01, 02, 03, 04, 05, 06 and 07. */

export function usePatientEnhance() {
  return useResource<PatientEnhanceDto>("/api/enhance", (e) => e.type === "care");
}

/* ------------------------------------------------------------------ home card (04, 07) */

export function PatientAiHome({ onTab }: { onTab: (t: string) => void }) {
  const r = usePatientEnhance();
  const [sheet, setSheet] = useState<"chat" | "concern" | "follow" | null>(null);
  const d = r.data;
  const open =
    d?.concerns.filter((c) => !["Resolved", "Closed - No Action"].includes(c.status)).length ?? 0;
  if (d?.accessDenied)
    return (
      <section
        aria-label="Caregiver access ended"
        className="mb-4 rounded-card border border-over bg-over-bg p-4"
      >
        <p className="text-section font-semibold text-over">Caregiver access ended</p>
        <p className="mt-1 text-small text-ink-900">{d.accessDenied}</p>
      </section>
    );
  return (
    <>
      {d?.actingAs && (
        <section
          aria-label="Acting as caregiver"
          className="mb-3 rounded-card border border-border bg-accent-tint p-3"
        >
          <p className="text-small font-semibold text-ink-900">
            {d.actingAs.name} · {d.actingAs.relationship}, caregiver
          </p>
          <p className="text-caption text-ink-700">
            You can: {d.actingAs.scope.join(", ") || "view only"}
            {d.actingAs.until ? ` · until ${d.actingAs.until}` : ""}. Everything you send is
            labelled caregiver-reported.
          </p>
          <label className="mt-2 flex items-center gap-2 text-caption">
            <span className="font-semibold text-ink-700">Caring for</span>
            <select
              aria-label="Caring for"
              value={d.actingAs.current}
              onChange={async (e) => {
                if (await act({ type: "switch-participant", clientId: e.target.value }, "Switched"))
                  window.location.reload();
              }}
              className="rounded-control border border-border-strong bg-surface px-2 py-1 text-caption"
            >
              {d.actingAs.participants.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}
      <section
        aria-label="Your care assistant"
        className="mb-4 overflow-hidden rounded-card border border-border bg-surface"
      >
        <button
          type="button"
          onClick={() => setSheet("chat")}
          className="flex w-full cursor-pointer items-center gap-3 p-4 text-left"
        >
          <IconBadge icon={BotMessageSquare} tone="violet" size={44} />
          <span className="min-w-0 flex-1">
            <span className="block type-display text-h2 leading-tight text-ink-900">
              Ask Medisense
            </span>
            <span className="block text-caption text-ink-500">
              Visits, your plan, invoices: answers from your own records
            </span>
          </span>
        </button>
        <div className="grid grid-cols-2 divide-x divide-border border-t border-border">
          <button
            type="button"
            onClick={() => setSheet("concern")}
            className="flex cursor-pointer items-center justify-center gap-2 py-3 text-caption font-semibold text-over"
          >
            <AlertTriangle className="size-4" aria-hidden="true" /> Report a concern
          </button>
          <button
            type="button"
            onClick={() => setSheet("follow")}
            className="flex cursor-pointer items-center justify-center gap-2 py-3 text-caption font-semibold text-ink-700"
          >
            <LifeBuoy className="size-4" aria-hidden="true" /> My follow-ups
            {open > 0 && <span className="rounded-full bg-over-bg px-1.5 text-over">{open}</span>}
          </button>
        </div>
      </section>
      {sheet === "chat" && d && (
        <ChatSheet d={d} onClose={() => setSheet(null)} onTab={onTab} reload={r.reload} />
      )}
      {sheet === "concern" && d && (
        <ConcernSheet
          d={d}
          source="Report concern"
          onClose={() => setSheet(null)}
          onDone={() => {
            r.reload();
            setSheet("follow");
          }}
        />
      )}
      {sheet === "follow" && d && <FollowUps d={d} onClose={() => setSheet(null)} />}
    </>
  );
}

function ChatSheet({
  d,
  onClose,
  onTab,
  reload,
}: {
  d: PatientEnhanceDto;
  onClose: () => void;
  onTab: (t: string) => void;
  reload: () => void;
}) {
  const [msgs, setMsgs] = useState(d.chat);
  const [mode, setMode] = useState<"ask" | "agent">("ask");
  const [settings, setSettings] = useState(false);
  const [consent, setConsent] = useState(d.prefs.aiConsent);
  const [lang, setLang] = useState(d.prefs.language);
  return (
    <AppSheet title="Ask Medisense" onClose={onClose}>
      {!d.actingAs && (
        <div
          role="tablist"
          aria-label="Assistant mode"
          className="mb-3 grid grid-cols-2 gap-1 rounded-full border border-border bg-sunken p-1"
        >
          {(
            [
              ["ask", "Ask questions"],
              ["agent", "Booking agent"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => setMode(id)}
              className={cn(
                "cursor-pointer rounded-full px-3 py-1.5 text-caption font-semibold transition-colors duration-140",
                mode === id ? "bg-accent-fill text-on-accent" : "text-ink-500",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {mode === "agent" ? (
        <BookingAgent compact />
      ) : (
        <>
          <p className="mb-2 text-caption text-ink-500">
            Answers come only from your own records. It can&apos;t give medical advice or change
            your treatment, and it isn&apos;t monitored around the clock.
          </p>
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <Tag tone={consent === "Allowed" ? "healthy" : "watch"}>
              AI {consent === "Allowed" ? "on" : "off"} · {lang}
            </Tag>
            {!d.actingAs && (
              <button
                type="button"
                onClick={() => setSettings((x) => !x)}
                className="cursor-pointer text-caption font-semibold text-accent"
              >
                AI settings
              </button>
            )}
            {msgs.length > 0 && (
              <button
                type="button"
                onClick={async () => {
                  if (await act({ type: "chat-clear", clientId: "" }, "History deleted"))
                    setMsgs([]);
                }}
                className="cursor-pointer text-caption font-semibold text-over"
              >
                Delete history
              </button>
            )}
          </div>
          {settings && (
            <Card className="mb-3">
              <div className="flex flex-col gap-3">
                <Pick
                  label="Use AI with my information"
                  value={consent}
                  onChange={setConsent}
                  options={["Allowed", "Withdrawn"] as const}
                />
                <Pick label="Language" value={lang} onChange={setLang} options={languages} />
                <p className="text-caption text-ink-500">
                  With AI off, nothing about you is sent to the AI service. Visits, My care and
                  Messages work as usual. Amounts in your plan are never translated or changed.
                </p>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={async () => {
                    if (await act({ type: "prefs", aiConsent: consent, language: lang }, "Saved")) {
                      setSettings(false);
                      reload();
                    }
                  }}
                >
                  Save
                </Button>
              </div>
            </Card>
          )}
          <ChatThread
            messages={msgs}
            onFeedback={(m, rating) =>
              void act(
                {
                  type: "feedback",
                  source: "Assistant",
                  clientId: "",
                  excerpt: m.text.slice(0, 500),
                  rating,
                  note: "",
                },
                rating === "Helpful" ? undefined : "Sent to your care team for review",
              )
            }
            starters={
              d.actingAs
                ? [
                    "What should we practise today?",
                    "When is the next appointment?",
                    "Can I see the psychology notes?",
                  ]
                : [
                    "When is my next appointment?",
                    "What should I practise today?",
                    "Why do I owe money?",
                    "Can I double my exercises?",
                  ]
            }
            placeholder={
              d.actingAs
                ? `Ask about ${d.actingAs.participants.find((x) => x.id === d.actingAs?.current)?.name.split(" ")[0] ?? "their"} care`
                : "Ask about your care"
            }
            onSend={async (text) => {
              setMsgs((m) => [...m, { role: "user", text, at: new Date().toISOString() }]);
              const r = await act<{ reply: PatientEnhanceDto["chat"][number] }>({
                type: "chat",
                text,
                clientId: "",
              });
              if (r) setMsgs((m) => [...m, r.reply]);
              reload();
            }}
            onAction={(t) => {
              onClose();
              onTab(
                t === "documents" || t === "payments" || t === "upload"
                  ? "me"
                  : t === "concern"
                    ? "home"
                    : t,
              );
            }}
          />
        </>
      )}
    </AppSheet>
  );
}

/* ------------------------------------------------------------------ 04 concern */

function useReporter(d: PatientEnhanceDto) {
  return useState<Reporter | null>(d.reporters[0] ?? null);
}

export function ConcernSheet({
  d,
  source,
  onClose,
  onDone,
}: {
  d: PatientEnhanceDto;
  source: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reporter, setReporter] = useReporter(d);
  const [how, setHow] = useState<"Better" | "Same" | "Worse" | "Prefer not to say" | "">("");
  const [nd, setNd] = useState<"Yes" | "No" | "Unsure" | "">("");
  const [types, setTypes] = useState<(typeof concernTypes)[number][]>([]);
  const [pain, setPain] = useState("");
  const [falls, setFalls] = useState<(typeof fallOptions)[number]>("None");
  const [desc, setDesc] = useState("");
  const [noticed, setNoticed] = useState<(typeof noticedOptions)[number]>("Today");
  const [callback, setCallback] = useState(false);
  const [file, setFile] = useState<NewAttachment | null>(null);
  const [unsent, setUnsent] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem("concern-draft");
    } catch {
      return null;
    }
  });
  const [busy, setBusy] = useState(false);
  const [safety, setSafety] = useState<string | null>(null);
  if (safety)
    return (
      <AppSheet title="We've told your care team" onClose={onDone}>
        <div className="rounded-card border border-over bg-over-bg p-3 text-small text-over">
          <p className="font-semibold">Please read</p>
          <p className="mt-1 text-ink-900">{safety}</p>
        </div>
      </AppSheet>
    );
  return (
    <AppSheet
      title="Report a concern"
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          className="w-full"
          loading={busy}
          disabled={!reporter || !how || !nd}
          onClick={async () => {
            if (!reporter || !how || !nd) return;
            setBusy(true);
            if (typeof navigator !== "undefined" && !navigator.onLine) {
              const draft = JSON.stringify({
                type: "concern",
                source,
                how,
                newDifficulty: nd,
                types,
                pain,
                falls,
                description: desc,
                noticed,
                callback,
                reporter,
                attachment: file,
              });
              try {
                window.localStorage.setItem("concern-draft", draft);
              } catch {
                /* storage unavailable: the form stays filled in */
              }
              setUnsent(draft);
              setBusy(false);
              return;
            }
            const r = await act<{ safety: string | null }>(
              {
                attachment: file,
                type: "concern",
                source,
                how,
                newDifficulty: nd,
                types,
                pain,
                falls,
                description: desc,
                noticed,
                callback,
                reporter,
              },
              "Sent to your care team",
            );
            setBusy(false);
            if (r?.safety) setSafety(r.safety);
            else if (r) onDone();
          }}
        >
          Send to my care team
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <ReporterPick
          reporters={d.reporters}
          value={reporter}
          onChange={setReporter}
          area="Concerns"
        />
        <Pick
          label="How are you today?"
          value={how}
          onChange={setHow}
          options={["Better", "Same", "Worse", "Prefer not to say"] as const}
        />
        <Pick
          label="New or worsening difficulty?"
          value={nd}
          onChange={setNd}
          options={["Yes", "No", "Unsure"] as const}
        />
        {nd && nd !== "No" && (
          <>
            <PickMany label="What kind?" value={types} onChange={setTypes} options={concernTypes} />
            <Field label="Tell us what happened" value={desc} onChange={setDesc} area />
          </>
        )}
        {types.includes("Pain") && (
          <Field label="Pain, 0 to 10 (or leave blank)" value={pain} onChange={setPain} />
        )}
        <Pick
          label="Falls since your last update"
          value={falls}
          onChange={setFalls}
          options={fallOptions}
        />
        <Pick
          label="When did you notice it?"
          value={noticed}
          onChange={setNoticed}
          options={noticedOptions}
        />
        <label className="flex items-center gap-2 text-small">
          <input
            type="checkbox"
            checked={callback}
            onChange={(e) => setCallback(e.target.checked)}
          />
          I&apos;d like a call back (a request, not an immediate call)
        </label>
        <AttachFile value={file} onChange={setFile} />
        {unsent && (
          <div className="rounded-card border border-watch bg-watch-bg p-3 text-small">
            <p className="font-semibold text-watch">Saved on this phone · not sent</p>
            <p className="text-ink-700">
              Your care team hasn&apos;t received this. Send it when you&apos;re online.
            </p>
            <Button
              size="sm"
              className="mt-2"
              onClick={async () => {
                const r = await act(
                  JSON.parse(unsent) as Parameters<typeof act>[0],
                  "Sent to your care team",
                );
                if (r) {
                  try {
                    window.localStorage.removeItem("concern-draft");
                  } catch {
                    /* nothing to clear */
                  }
                  setUnsent(null);
                  onDone();
                }
              }}
            >
              Send now
            </Button>
          </div>
        )}
        <p className="text-caption text-ink-500">
          For an emergency call 000. This app isn&apos;t monitored around the clock.
        </p>
      </div>
    </AppSheet>
  );
}

function FollowUps({ d, onClose }: { d: PatientEnhanceDto; onClose: () => void }) {
  return (
    <AppSheet title="My follow-ups" onClose={onClose}>
      {d.concerns.length === 0 ? (
        <p className="text-small text-ink-500">Nothing reported yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {d.concerns.map((c) => (
            <li key={c.id}>
              <Card>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-small font-semibold text-ink-900">
                    {c.types.join(", ") || "Concern"} · <span className="font-mono">{c.ref}</span>
                  </p>
                  <Tag
                    tone={
                      c.status === "Resolved"
                        ? "healthy"
                        : c.status === "New"
                          ? "watch"
                          : "available"
                    }
                  >
                    {c.status === "New" ? "Received" : c.status}
                  </Tag>
                </div>
                <p className="mt-1 text-caption text-ink-500">
                  {shortDate(c.at)} · <ReportedBy r={c.reporter} />
                </p>
                {c.duplicateOf && (
                  <p className="mt-1 text-caption text-ink-500">
                    Linked to {c.duplicateOf} (possible duplicate)
                  </p>
                )}
                {!["Resolved", "Closed - No Action"].includes(c.status) && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (
                        await act(
                          {
                            type: "concern-retract",
                            concernId: c.id,
                            reason: "Reported by mistake",
                          },
                          "Report withdrawn; it stays on record",
                        )
                      )
                        onClose();
                    }}
                    className="mt-1 cursor-pointer text-caption font-semibold text-over"
                  >
                    Withdraw this report
                  </button>
                )}
                {c.patientMessage ? (
                  <p className="mt-2 rounded-control bg-accent-tint p-2 text-small text-ink-900">
                    From your therapist: {c.patientMessage}
                  </p>
                ) : (
                  <p className="mt-2 text-caption text-ink-500">
                    Received. Not yet reviewed by a clinician.
                  </p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </AppSheet>
  );
}

/* ------------------------------------------------------------------ 01 coach, 05 insights, 03 shares (My care) */

export function PatientCareAi() {
  const r = usePatientEnhance();
  const [open, setOpen] = useState<ActivityDto | null>(null);
  const d = r.data;
  if (!d) return <Skeleton className="h-28 rounded-card" />;
  const live = d.activities.filter((a) => a.coach?.status === "Active" && !a.coach.stale);
  return (
    <>
      {live.length > 0 && (
        <section aria-label="Home coach" className="mb-4">
          <p className="mb-2 text-caption font-semibold tracking-wide text-ink-500 uppercase">
            Home coach
          </p>
          {live.map((a) => (
            <button
              key={a.activityId}
              type="button"
              onClick={() => setOpen(a)}
              className="mb-2 flex w-full cursor-pointer items-center gap-3 rounded-card border border-border bg-surface p-3.5 text-left"
            >
              <IconBadge icon={Dumbbell} tone="teal" size={42} />
              <span className="min-w-0 flex-1">
                <span className="block text-small font-semibold text-ink-900">{a.name}</span>
                <span className="block text-caption text-ink-500">
                  {a.frequency} · {a.dose} · approved by {a.coach?.approvedBy}
                </span>
              </span>
              <Tag tone="healthy">Guide me</Tag>
            </button>
          ))}
        </section>
      )}
      {(d.insights.length > 0 || d.shares.length > 0) && (
        <section aria-label="Updates from your care team" className="mb-4 flex flex-col gap-2">
          <p className="text-caption font-semibold tracking-wide text-ink-500 uppercase">
            Updates from your care team
          </p>
          {d.insights.map((i) => (
            <Card key={i.goalTitle + i.at}>
              <p className="flex items-center gap-2 text-small font-semibold text-ink-900">
                <TrendingUp className="size-4 text-healthy" aria-hidden="true" /> {i.goalTitle}
              </p>
              <p className="mt-1 text-small text-ink-700">{i.summary}</p>
              <p className="mt-1 text-caption text-ink-500">
                Approved by {i.by} · {shortDate(i.at)}
              </p>
            </Card>
          ))}
          {d.shares.map((s) => (
            <Card key={s.at}>
              <p className="flex items-center gap-2 text-small font-semibold text-ink-900">
                <Share2 className="size-4 text-accent" aria-hidden="true" /> Shared care update
              </p>
              <p className="mt-1 text-small text-ink-700">{s.text}</p>
              <p className="mt-1 text-caption text-ink-500">
                From {s.by} · {shortDate(s.at)}
              </p>
            </Card>
          ))}
        </section>
      )}
      {open && <CoachSheet a={open} d={d} onClose={() => setOpen(null)} reload={r.reload} />}
    </>
  );
}

function CoachSheet({
  a,
  d,
  onClose,
  reload,
}: {
  a: ActivityDto;
  d: PatientEnhanceDto;
  onClose: () => void;
  reload: () => void;
}) {
  const [reporter, setReporter] = useReporter(d);
  const [view, setView] = useState<"guide" | "log">("guide");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<CoachQuestionDto[]>(
    d.questions
      .filter((x) => x.coachId === a.coach?.id)
      .slice(0, 3)
      .reverse(),
  );
  const [result, setResult] = useState<(typeof coachResults)[number] | "">("");
  const [diff, setDiff] = useState<(typeof difficulties)[number] | "">("");
  const [reason, setReason] = useState<(typeof skipReasons)[number] | "">("");
  const [concern, setConcern] = useState(false);
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<NewAttachment | null>(null);
  const [conflict, setConflict] = useState<PatientEnhanceDto["logs"][number] | null>(null);
  const [safety, setSafety] = useState<string | null>(null);
  const coach = a.coach;
  const [lang, setLang] = useState<(typeof languages)[number]>(d.prefs.language);
  const [shown, setShown] = useState(coach?.steps ?? []);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(`coach-log-${coach?.id ?? ""}`);
    } catch {
      return null;
    }
  });
  if (!coach) return null;
  return (
    <AppSheet
      title={a.name}
      onClose={onClose}
      footer={
        view === "log" ? (
          <Button
            variant="primary"
            className="w-full"
            loading={busy}
            disabled={!reporter || !result || !diff || (result !== "Completed" && !reason)}
            onClick={async () => {
              if (!reporter || !result || !diff) return;
              setBusy(true);
              const body = {
                type: "coach-log" as const,
                savedAt: new Date().toISOString(),
                attachment: file,
                coachId: coach.id,
                result,
                difficulty: diff,
                reason,
                concern,
                comment,
                reporter,
              };
              if (typeof navigator !== "undefined" && !navigator.onLine) {
                try {
                  window.localStorage.setItem(`coach-log-${coach.id}`, JSON.stringify(body));
                } catch {
                  /* storage unavailable: the form stays filled in instead */
                }
                setPending(JSON.stringify(body));
                setBusy(false);
                return;
              }
              const r = await act<{ safety: string | null }>(
                {
                  type: "coach-log",
                  attachment: file,
                  coachId: coach.id,
                  result,
                  difficulty: diff,
                  reason,
                  concern,
                  comment,
                  reporter,
                },
                "Saved for your therapist",
              );
              setBusy(false);
              reload();
              if (r?.safety) setSafety(r.safety);
              else if (r) onClose();
            }}
          >
            Save
          </Button>
        ) : undefined
      }
    >
      {pending && (
        <div className="mb-3 rounded-card border border-watch bg-watch-bg p-3 text-small">
          <p className="font-semibold text-watch">Saved on this phone · not sent yet</p>
          <p className="text-ink-700">
            Your therapist hasn&apos;t received this log. It sends when you&apos;re back online.
          </p>
          <Button
            size="sm"
            className="mt-2"
            onClick={async () => {
              if (!pending) return;
              const { savedAt, ...body } = JSON.parse(pending) as { savedAt?: string } & Parameters<
                typeof act
              >[0];
              // Someone logged this activity after the unsent one was saved: show both, don't overwrite.
              const newer = d.logs.find((l) => l.coachId === coach.id && savedAt && l.at > savedAt);
              if (newer && !conflict) {
                setConflict(newer);
                return;
              }
              const r = await act(body as Parameters<typeof act>[0], "Sent to your therapist");
              if (r) {
                try {
                  window.localStorage.removeItem(`coach-log-${coach.id}`);
                } catch {
                  /* nothing to clear */
                }
                setPending(null);
                reload();
              }
            }}
          >
            {conflict ? "Send mine as well" : "Send now"}
          </Button>
          {conflict && (
            <div className="mt-2 grid grid-cols-2 gap-2 text-caption">
              <div className="rounded-control bg-surface p-2">
                <p className="font-semibold text-ink-900">Saved on this phone</p>
                <p className="text-ink-700">
                  {(JSON.parse(pending) as { result: string; difficulty: string }).result} ·{" "}
                  {(JSON.parse(pending) as { difficulty: string }).difficulty}
                </p>
              </div>
              <div className="rounded-control bg-surface p-2">
                <p className="font-semibold text-ink-900">
                  Already sent · {conflict.reporter.name}
                </p>
                <p className="text-ink-700">
                  {conflict.result} · {conflict.difficulty}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  try {
                    window.localStorage.removeItem(`coach-log-${coach.id}`);
                  } catch {
                    /* nothing to clear */
                  }
                  setPending(null);
                  setConflict(null);
                }}
                className="col-span-2 cursor-pointer text-left font-semibold text-over"
              >
                Discard mine
              </button>
            </div>
          )}
        </div>
      )}
      {safety ? (
        <div className="rounded-card border border-over bg-over-bg p-3 text-small">
          <p className="font-semibold text-over">Please read</p>
          <p className="mt-1 text-ink-900">{safety}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div role="tablist" className="grid grid-cols-2 gap-1 rounded-full bg-sunken p-1">
            {(["guide", "log"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`cursor-pointer rounded-full py-2 text-caption font-semibold ${view === v ? "bg-ink-900 text-page" : "text-ink-500"}`}
              >
                {v === "guide" ? "Guide me" : "Log today"}
              </button>
            ))}
          </div>
          {view === "guide" ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-control bg-sunken p-2.5">
                  <p className="text-label tracking-wide text-ink-500 uppercase">How often</p>
                  <p className="text-small font-semibold text-ink-900">{coach.frequency}</p>
                </div>
                <div className="rounded-control bg-sunken p-2.5">
                  <p className="text-label tracking-wide text-ink-500 uppercase">How long</p>
                  <p className="text-small font-semibold text-ink-900">{coach.dose}</p>
                </div>
              </div>
              {coach.precautions && (
                <div className="rounded-control border border-over bg-over-bg p-2.5 text-small">
                  <span className="font-semibold text-over">Precaution </span>
                  <span className="text-ink-900">{coach.precautions}</span>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <Pick
                  label="Language"
                  value={lang}
                  onChange={async (l) => {
                    setLang(l);
                    const r = await act<{ steps: typeof coach.steps; note: string }>({
                      type: "translate",
                      coachId: coach.id,
                      language: l,
                    });
                    if (r) {
                      setShown(r.steps);
                      setNote(r.note);
                    }
                  }}
                  options={languages}
                />
                <Button
                  size="sm"
                  onClick={() => {
                    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
                    if (!synth) return;
                    synth.cancel();
                    synth.speak(
                      new SpeechSynthesisUtterance(
                        shown.map((x, i) => `Step ${i + 1}. ${x.text}`).join(" "),
                      ),
                    );
                  }}
                >
                  <Volume2 className="size-4" aria-hidden="true" /> Read aloud
                </Button>
              </div>
              {note && <p className="text-caption text-watch">{note}</p>}
              <AiBox label="Explained by AI · approved by your therapist" ai={coach.ai}>
                <ol className="flex flex-col gap-2">
                  {shown.map((s, i) => (
                    <li key={i} className="flex gap-2.5 text-small text-ink-900">
                      <span className="flex size-6 flex-none items-center justify-center rounded-full bg-ink-900 text-caption font-semibold text-page">
                        {i + 1}
                      </span>
                      <span>
                        {s.text}
                        <span className="ml-1 text-label text-ink-500">· {s.source}</span>
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-caption text-ink-500">
                  From plan version {coach.planVersion} · approved{" "}
                  {coach.approvedAt ? shortDate(coach.approvedAt) : ""}
                </p>
              </AiBox>
              <ReporterPick
                reporters={d.reporters}
                value={reporter}
                onChange={setReporter}
                area="Activities"
              />
              {answers.map((x) => (
                <div key={x.id} className="flex flex-col gap-1.5">
                  <p className="ml-8 self-end rounded-card bg-accent-fill px-3 py-2 text-small text-on-accent">
                    {x.question}
                  </p>
                  <div
                    className={`rounded-card p-3 text-small ${x.outcome === "Safety" ? "border border-over bg-over-bg" : "border border-dashed border-draft-rule bg-draft"}`}
                  >
                    <p className="mb-1 text-label font-semibold tracking-wide text-ink-500 uppercase">
                      {x.outcome}
                    </p>
                    <p className="whitespace-pre-line text-ink-900">{x.answer}</p>
                    <Sources items={x.sources} />
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {(["Helpful", "Inaccurate", "Unsafe"] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() =>
                            void act(
                              {
                                type: "feedback",
                                source: "Coach",
                                clientId: "",
                                excerpt: `${x.question} → ${x.answer}`.slice(0, 500),
                                rating: r,
                                note: "",
                              },
                              r === "Helpful" ? "Thanks" : "Sent to your therapist for review",
                            )
                          }
                          className="cursor-pointer rounded-full border border-border px-2 py-0.5 text-label text-ink-500 hover:bg-sunken"
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    {x.outcome !== "Answered" && x.outcome !== "Safety" && (
                      <button
                        type="button"
                        disabled={x.helpRequested}
                        onClick={async () => {
                          await act(
                            { type: "coach-help", questionId: x.id },
                            "Sent to your therapist",
                          );
                          setAnswers((list) =>
                            list.map((y) => (y.id === x.id ? { ...y, helpRequested: true } : y)),
                          );
                        }}
                        className="mt-2 cursor-pointer rounded-full bg-ink-900 px-3 py-1.5 text-caption font-semibold text-page disabled:opacity-50"
                      >
                        {x.helpRequested ? "Sent to your therapist" : "Ask my therapist"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <form
                className="flex items-center gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!q.trim() || !reporter) return;
                  setBusy(true);
                  const r = await act<{
                    id: string;
                    answer: string;
                    outcome: CoachQuestionDto["outcome"];
                    sources: string[];
                  }>({
                    type: "coach-ask",
                    coachId: coach.id,
                    question: q,
                    reporter,
                  });
                  setBusy(false);
                  if (r)
                    setAnswers((list) => [
                      ...list,
                      {
                        id: r.id,
                        coachId: coach.id,
                        activityName: a.name,
                        question: q,
                        answer: r.answer,
                        outcome: r.outcome,
                        sources: r.sources,
                        at: new Date().toISOString(),
                        reporter,
                        helpRequested: r.outcome === "Safety",
                        resolved: false,
                      },
                    ]);
                  setQ("");
                }}
              >
                <input
                  aria-label="Ask about this activity"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Ask about this activity"
                  className="min-w-0 flex-1 rounded-full border border-border-strong bg-surface px-4 py-2.5 text-small"
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="primary"
                  loading={busy}
                  disabled={!q.trim()}
                >
                  <MessageCircleQuestion className="size-4" aria-hidden="true" /> Ask
                </Button>
              </form>
            </>
          ) : (
            <>
              <ReporterPick
                reporters={d.reporters}
                value={reporter}
                onChange={setReporter}
                area="Activities"
              />
              <Pick
                label="How did it go?"
                value={result}
                onChange={setResult}
                options={coachResults}
              />
              <Pick
                label="How hard was it?"
                value={diff}
                onChange={setDiff}
                options={difficulties}
              />
              {result && result !== "Completed" && (
                <Pick
                  label="What got in the way?"
                  value={reason}
                  onChange={setReason}
                  options={skipReasons}
                />
              )}
              <label className="flex items-center gap-2 text-small">
                <input
                  type="checkbox"
                  checked={concern}
                  onChange={(e) => setConcern(e.target.checked)}
                />
                Something new is worrying me (pain, a fall, feeling worse)
              </label>
              <Field label="Anything else? (optional)" value={comment} onChange={setComment} area />
              <AttachFile value={file} onChange={setFile} />
              <p className="text-caption text-ink-500">
                Your therapist sees this as{" "}
                {reporter?.role === "Caregiver" ? "caregiver" : "patient"}-reported. It doesn&apos;t
                change your plan.
              </p>
            </>
          )}
        </div>
      )}
    </AppSheet>
  );
}

/* ------------------------------------------------------------------ 02 check-in */

const blank: CheckinAnswers = {
  change: "",
  changeDetail: "",
  newDifficulty: "",
  difficultyDetail: "",
  pain: "",
  homeDone: "",
  homeDifficulty: "",
  homeDifficultyDetail: "",
  concerns: "",
  questions: "",
  logistics: "",
  access: [],
  accurate: false,
};

export function CheckinButton({ appointmentId }: { appointmentId: string }) {
  const r = usePatientEnhance();
  const [open, setOpen] = useState(false);
  const d = r.data;
  const c = d?.checkins.find((x) => x.appointmentId === appointmentId);
  if (!d) return <Skeleton className="h-20 rounded-card" />;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 flex w-full cursor-pointer items-center gap-3 rounded-card border border-border bg-surface p-3 text-left"
      >
        <IconBadge icon={ClipboardCheck} tone="indigo" size={38} />
        <span className="min-w-0 flex-1">
          <span className="block text-small font-semibold text-ink-900">Pre-visit check-in</span>
          <span className="block text-caption text-ink-500">
            {c?.status === "Submitted"
              ? `Sent ${shortDate(c.submittedAt ?? "")}${c.review === "Reviewed" ? " · reviewed by your therapist" : ""}`
              : c?.status === "Sent"
                ? `Requested by ${c.requestedBy ?? "your therapist"}`
                : c
                  ? "Draft saved · finish it"
                  : "Two minutes, helps your therapist prepare"}
          </span>
        </span>
        <Tag tone={c?.status === "Submitted" ? "healthy" : "watch"}>
          {c?.status === "Submitted" ? "Sent" : c?.status === "Draft" ? "Draft" : "To do"}
        </Tag>
      </button>
      {open && (
        <CheckinSheet
          d={d}
          appointmentId={appointmentId}
          onClose={() => {
            setOpen(false);
            r.reload();
          }}
        />
      )}
    </>
  );
}

function CheckinSheet({
  d,
  appointmentId,
  onClose,
}: {
  d: PatientEnhanceDto;
  appointmentId: string;
  onClose: () => void;
}) {
  const existing = d.checkins.find((x) => x.appointmentId === appointmentId);
  const visit = d.upcoming.find((x) => x.id === appointmentId);
  const [a, setA] = useState<CheckinAnswers>(existing?.answers ?? blank);
  const [reporter, setReporter] = useState<Reporter | null>(
    existing?.reporter ?? d.reporters[0] ?? null,
  );
  const [busy, setBusy] = useState(false);
  const set =
    <K extends keyof CheckinAnswers>(k: K) =>
    (v: CheckinAnswers[K]) =>
      setA((x) => ({ ...x, [k]: v }));
  const save = async (submit: boolean) => {
    if (!reporter) return;
    setBusy(true);
    const r = await act(
      { type: "checkin-save", appointmentId, answers: a, submit, reporter },
      submit ? "Sent to your therapist" : "Draft saved",
    );
    setBusy(false);
    if (r) onClose();
  };
  if (existing?.status === "Submitted")
    return (
      <AppSheet title="Pre-visit check-in" onClose={onClose}>
        <p className="text-small text-ink-700">
          Sent {shortDate(existing.submittedAt ?? "")} by {existing.reporter.name}. Your therapist
          will read it before your visit
          {existing.review === "Reviewed" ? " and has reviewed it" : ""}.
        </p>
      </AppSheet>
    );
  return (
    <AppSheet
      title="Pre-visit check-in"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy} onClick={() => save(false)}>
            Save draft
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            loading={busy}
            disabled={!a.accurate || !a.change}
            onClick={() => save(true)}
          >
            Send
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {existing?.requestedBy && (
          <p className="rounded-control bg-accent-tint px-3 py-2 text-caption text-ink-700">
            Requested by {existing.requestedBy} · {existing.template}
          </p>
        )}
        {existing?.rescheduled && (
          <p className="rounded-control bg-watch-bg px-3 py-2 text-caption text-watch">
            Your visit time changed. Your therapist will check these answers still apply.
          </p>
        )}
        {visit && (
          <p className="text-caption text-ink-500">
            {visit.service} with {visit.clinician} · {shortDate(visit.start)},{" "}
            {timeOfDay(visit.start)}
          </p>
        )}
        <ReporterPick
          reporters={d.reporters}
          value={reporter}
          onChange={setReporter}
          area="Appointments"
        />
        <Pick
          label="Since your last visit, are things…"
          value={a.change as (typeof changeOptions)[number]}
          onChange={set("change")}
          options={changeOptions}
        />
        {a.change === "Worse" && (
          <Field label="What's worse?" value={a.changeDetail} onChange={set("changeDetail")} area />
        )}
        <Pick
          label="Any new difficulties?"
          value={a.newDifficulty as "Yes"}
          onChange={set("newDifficulty")}
          options={["Yes", "No", "Prefer to discuss privately"] as const}
        />
        {a.newDifficulty === "Yes" && (
          <Field
            label="Tell us about it"
            value={a.difficultyDetail}
            onChange={set("difficultyDetail")}
            area
          />
        )}
        <Field label="Pain today, 0 to 10 (optional)" value={a.pain} onChange={set("pain")} />
        {d.activities.length > 0 && (
          <>
            <Pick
              label="Home activities done"
              value={a.homeDone as (typeof homeDone)[number]}
              onChange={set("homeDone")}
              options={homeDone}
            />
            <Pick
              label="How hard were they?"
              value={a.homeDifficulty as (typeof homeDifficulty)[number]}
              onChange={set("homeDifficulty")}
              options={homeDifficulty}
            />
          </>
        )}
        <Field
          label="Anything new worrying you?"
          value={a.concerns}
          onChange={set("concerns")}
          area
        />
        <Field
          label="Questions for your therapist"
          value={a.questions}
          onChange={set("questions")}
          area
        />
        {(existing?.extraQuestions ?? []).map((q) => (
          <Field
            key={q}
            label={q}
            value={a.extra?.[q] ?? ""}
            onChange={(v) => setA((x) => ({ ...x, extra: { ...(x.extra ?? {}), [q]: v } }))}
          />
        ))}
        <Pick
          label="For the visit"
          value={a.logistics as (typeof logistics)[number]}
          onChange={set("logistics")}
          options={logistics}
        />
        <label className="flex items-start gap-2 text-small">
          <input
            type="checkbox"
            className="mt-1"
            checked={a.accurate}
            onChange={(e) => set("accurate")(e.target.checked)}
          />
          These answers are accurate to the best of my knowledge.
        </label>
      </div>
    </AppSheet>
  );
}
