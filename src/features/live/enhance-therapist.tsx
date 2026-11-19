"use client";

import { Skeleton } from "./bits";
import {
  AlertTriangle,
  BotMessageSquare,
  ChevronRight,
  ClipboardCheck,
  Dumbbell,
  Inbox,
  MessageCircleQuestion,
  Network,
  TrendingUp,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { AppSheet, IconBadge } from "@/features/mobile/phone-frame";
import { cn } from "@/lib/cn";
import { useNow, useResource } from "@/lib/live/client";
import {
  autoSendHours,
  caregiverScopes,
  deliveryChannels,
  checkinTemplates,
  coachModes,
  templateQuestions,
  coachLevels,
  concernStates,
  followUps,
  interpretations,
  shareVisibility,
  suggestionDecisions,
  type CheckinDto,
  type ConcernDto,
  type InboxDto,
  type InsightDto,
  type TherapistEnhanceDto,
} from "@/lib/live/enhance";
import { shortDate, timeOfDay } from "@/lib/live/time";
import {
  act,
  AiBox,
  Card,
  ChatThread,
  Field,
  Pick,
  PickMany,
  ReportedBy,
  Sources,
} from "./enhance-ui";

/* Therapist app and portal side of AI Enhancements 01–07. */

const done = (s: string) => ["Resolved", "Closed - No Action"].includes(s);

/* ------------------------------------------------------------------ inbox (Today) */

export function TherapistAiInbox() {
  const r = useResource<InboxDto>("/api/enhance", (e) => e.type === "care");
  const [open, setOpen] = useState(false);
  const d = r.data;
  const total = d ? d.concerns.length + d.checkins.length + d.logs.length + d.questions.length : 0;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full cursor-pointer items-center gap-3 rounded-card border border-border bg-surface p-4 text-left"
      >
        <IconBadge icon={Inbox} tone="violet" size={44} />
        <span className="min-w-0 flex-1">
          <span className="block text-section font-semibold text-ink-900">
            Patient updates to review
          </span>
          <span className="block text-caption text-ink-500">
            {d
              ? `${d.concerns.length} concerns · ${d.checkins.length} check-ins · ${d.logs.length + d.questions.length} home coach`
              : "Loading…"}
          </span>
        </span>
        {total > 0 && (
          <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-over-dot px-2 text-caption font-semibold text-page">
            {total}
          </span>
        )}
      </button>
      {open && d && <InboxSheet d={d} reload={r.reload} onClose={() => setOpen(false)} />}
    </>
  );
}

function InboxSheet({
  d,
  reload,
  onClose,
}: {
  d: InboxDto;
  reload: () => void;
  onClose: () => void;
}) {
  const [concern, setConcern] = useState<InboxDto["concerns"][number] | null>(null);
  const [checkin, setCheckin] = useState<InboxDto["checkins"][number] | null>(null);
  if (concern)
    return (
      <ConcernReview
        c={concern}
        patient={concern.patient}
        onClose={() => {
          setConcern(null);
          reload();
        }}
      />
    );
  if (checkin)
    return (
      <CheckinReview
        c={checkin}
        patient={checkin.patient}
        onClose={() => {
          setCheckin(null);
          reload();
        }}
      />
    );
  return (
    <AppSheet title="Patient updates" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Group title="AI answers flagged" empty="No flagged AI answers." n={d.feedback.length}>
          {d.feedback.map((f) => (
            <Card key={f.id}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-small font-semibold text-ink-900">
                  {f.patient} · {f.source}
                </p>
                <Tag tone={f.rating === "Unsafe" ? "over" : "watch"}>{f.rating}</Tag>
              </div>
              <p className="mt-1 text-caption text-ink-700">“{f.excerpt}”</p>
              <p className="mt-1 text-caption text-ink-500">
                Flagged by {f.by} · {shortDate(f.at)}
              </p>
              <Button
                size="sm"
                className="mt-2"
                onClick={async () => {
                  await act({ type: "feedback-resolve", feedbackId: f.id }, "Marked reviewed");
                  reload();
                }}
              >
                Mark reviewed
              </Button>
            </Card>
          ))}
        </Group>
        <Group title="Concerns" empty="No open concerns." n={d.concerns.length}>
          {d.concerns.map((c) => (
            <Row
              key={c.id}
              icon={AlertTriangle}
              tone={c.category === "Safety escalation" ? "red" : "amber"}
              title={`${c.patient} · ${c.category}`}
              meta={`${c.status} · ${shortDate(c.at)} · ${c.reporter.role}-reported`}
              onClick={() => setConcern(c)}
            />
          ))}
        </Group>
        <Group title="Pre-visit check-ins" empty="No check-ins to review." n={d.checkins.length}>
          {d.checkins.map((c) => (
            <Row
              key={c.id}
              icon={ClipboardCheck}
              tone={c.flags.length ? "amber" : "indigo"}
              title={`${c.patient} · ${c.service}`}
              meta={`${c.flags.length ? `${c.flags.length} flagged · ` : ""}visit ${shortDate(c.visitAt)}`}
              onClick={() => setCheckin(c)}
            />
          ))}
        </Group>
        <Group
          title="Home coach"
          empty="Nothing new from the home coach."
          n={d.logs.length + d.questions.length}
        >
          {d.questions.map((q) => (
            <Card key={q.id}>
              <p className="text-small font-semibold text-ink-900">
                {q.patient} asked about {q.activityName}
              </p>
              <p className="mt-1 text-small text-ink-700">“{q.question}”</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-caption text-ink-500">
                <ReportedBy r={q.reporter} /> {q.outcome}
              </div>
              <Button
                size="sm"
                className="mt-2"
                onClick={async () => {
                  await act(
                    { type: "question-resolve", questionId: q.id, reply: "" },
                    "Marked as handled",
                  );
                  reload();
                }}
              >
                Mark handled
              </Button>
            </Card>
          ))}
          {d.logs.map((l) => (
            <Card key={l.id}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-small font-semibold text-ink-900">
                  {l.patient} · {l.activityName}
                </p>
                <Tag tone={l.concern ? "over" : l.result === "Completed" ? "healthy" : "watch"}>
                  {l.concern ? "Concern" : l.result}
                </Tag>
              </div>
              <p className="mt-1 text-caption text-ink-500">
                Difficulty {l.difficulty}
                {l.reason ? ` · ${l.reason}` : ""} · {shortDate(l.at)} · plan v{l.sourceVersion}
              </p>
              {l.comment && <p className="mt-1 text-small text-ink-700">“{l.comment}”</p>}
              <AttachmentLink a={l.attachment} />
              <div className="mt-2 flex items-center justify-between">
                <ReportedBy r={l.reporter} />
                <Button
                  size="sm"
                  onClick={async () => {
                    await act({ type: "log-ack", logId: l.id }, "Acknowledged");
                    reload();
                  }}
                >
                  Acknowledge
                </Button>
              </div>
            </Card>
          ))}
        </Group>
      </div>
    </AppSheet>
  );
}

function Group({
  title,
  n,
  empty,
  children,
}: {
  title: string;
  n: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title}>
      <p className="mb-2 text-caption font-semibold tracking-wide text-ink-500 uppercase">
        {title} · {n}
      </p>
      {n === 0 ? (
        <p className="text-small text-ink-500">{empty}</p>
      ) : (
        <div className="flex flex-col gap-2">{children}</div>
      )}
    </section>
  );
}

function Row({
  icon,
  tone,
  title,
  meta,
  onClick,
}: {
  icon: typeof Inbox;
  tone: "red" | "amber" | "indigo" | "teal" | "violet" | "blue";
  title: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-3 rounded-card border border-border bg-surface p-3 text-left hover:bg-sunken"
    >
      <IconBadge icon={icon} tone={tone} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-small font-semibold text-ink-900">{title}</span>
        <span className="block text-caption text-ink-500">{meta}</span>
      </span>
      <ChevronRight className="size-4 text-ink-400" aria-hidden="true" />
    </button>
  );
}

function AttachmentLink({
  a,
}: {
  a: { name: string; type: string; size: number; dataUrl?: string } | null;
}) {
  if (!a) return null;
  return a.dataUrl && a.type.startsWith("image/") ? (
    <figure className="mt-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- a patient upload held as a data URL */}
      <img
        src={a.dataUrl}
        alt={`Attachment: ${a.name}`}
        className="max-h-40 rounded-control border border-border"
      />
      <figcaption className="text-caption text-ink-500">
        {a.name} · only the care team can see this
      </figcaption>
    </figure>
  ) : (
    <a
      href={a.dataUrl}
      download={a.name}
      className="mt-2 block text-caption font-semibold text-accent"
    >
      Open attachment: {a.name}
    </a>
  );
}

/* ------------------------------------------------------------------ 04 concern review */

function ConcernReview({
  c,
  patient,
  onClose,
}: {
  c: ConcernDto;
  patient: string;
  onClose: () => void;
}) {
  const [to, setTo] = useState<(typeof concernStates)[number]>(
    c.status === "New" ? "Acknowledged" : c.status,
  );
  const [comment, setComment] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <AppSheet
      title={`${patient} · ${c.ref}`}
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          className="w-full"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const r = await act(
              { type: "concern-act", concernId: c.id, to, comment, patientMessage: msg },
              `Marked ${to}`,
            );
            setBusy(false);
            if (r) onClose();
          }}
        >
          Save decision
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag tone={c.category === "Safety escalation" ? "over" : "watch"}>{c.category}</Tag>
          <span className="text-caption text-ink-500">Rule-based category · not a diagnosis</span>
        </div>
        {c.duplicateOf && (
          <p className="rounded-control bg-watch-bg px-3 py-2 text-caption text-watch">
            Possible duplicate of {c.duplicateOf}. Both reports are kept; review them together.
          </p>
        )}
        <AiBox label="AI review card · needs verification" ai={c.card.ai}>
          <p className="text-small text-ink-900">{c.card.summary}</p>
          <ul className="mt-2 flex flex-col gap-1 text-caption text-ink-700">
            {c.card.context.map((x) => (
              <li key={x}>• {x}</li>
            ))}
          </ul>
          <p className="mt-2 text-caption text-ink-500">Uncertain: {c.card.uncertainty}</p>
        </AiBox>
        <Card>
          <p className="mb-1 text-caption font-semibold text-ink-500 uppercase">
            Original report, unchanged
          </p>
          <p className="text-small text-ink-900">
            Feeling {c.how} · {c.types.join(", ") || "no type"} · pain {c.pain || "n/a"} · falls{" "}
            {c.falls} · noticed {c.noticed}
          </p>
          {c.description && <p className="mt-1 text-small text-ink-700">“{c.description}”</p>}
          <AttachmentLink a={c.attachment} />
          <div className="mt-2 flex items-center gap-2 text-caption text-ink-500">
            <ReportedBy r={c.reporter} /> {shortDate(c.at)}, {timeOfDay(c.at)}
            {c.callback && " · asked for a call back"}
          </div>
        </Card>
        <Pick
          label="Decision"
          value={to}
          onChange={setTo}
          options={concernStates.filter((s) => s !== "New")}
        />
        <Field
          label={done(to) ? "Clinical comment (required to close)" : "Clinical comment"}
          value={comment}
          onChange={setComment}
          area
        />
        <Field
          label="Message to the patient (optional, sent only when you save)"
          value={msg}
          onChange={setMsg}
          area
        />
        {c.actions.length > 0 && (
          <ul className="text-caption text-ink-500">
            {c.actions.map((x, i) => (
              <li key={i}>
                {shortDate(x.at)} · {x.by}: {x.action}
                {x.comment ? ` — ${x.comment}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppSheet>
  );
}

/* ------------------------------------------------------------------ 02 check-in review */

export function CheckinReview({
  c,
  patient,
  onClose,
}: {
  c: CheckinDto;
  patient: string;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const decide = async (review: "Reviewed" | "Clarification Requested") => {
    setBusy(true);
    const r = await act(
      { type: "checkin-review", checkinId: c.id, review, note },
      review === "Reviewed" ? "Marked reviewed" : "Clarification requested",
    );
    setBusy(false);
    if (r) onClose();
  };
  return (
    <AppSheet
      title={`Pre-visit brief · ${patient}`}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button
            className="flex-1"
            disabled={busy}
            onClick={() => decide("Clarification Requested")}
          >
            Ask to clarify
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            loading={busy}
            onClick={() => decide("Reviewed")}
          >
            Mark reviewed
          </Button>
        </div>
      }
    >
      <CheckinBody c={c} />
      <div className="mt-3">
        <Field
          label="Note (shown to the patient if you ask to clarify)"
          value={note}
          onChange={setNote}
          area
        />
      </div>
    </AppSheet>
  );
}

function CheckinBody({ c }: { c: CheckinDto }) {
  const a = c.answers;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-ink-500">
        {c.service} · visit {shortDate(c.visitAt)}, {timeOfDay(c.visitAt)} · sent{" "}
        {shortDate(c.submittedAt ?? "")}
      </p>
      {c.flags.length > 0 && (
        <div className="rounded-card border border-over bg-over-bg p-3 text-small">
          <p className="font-semibold text-over">Flagged by rule for your review</p>
          <ul className="mt-1 text-ink-900">
            {c.flags.map((f) => (
              <li key={f}>• {f}</li>
            ))}
          </ul>
        </div>
      )}
      {c.brief && (
        <AiBox label="AI briefing · patient-reported vs recorded" ai={c.brief.ai}>
          <p className="text-small text-ink-900">{c.brief.summary}</p>
          {[
            ["Reported", c.brief.reported],
            ["Recorded context", c.brief.context],
            ["Questions to address", c.brief.questions],
            ["Missing information", c.brief.missing],
          ].map(([h, list]) =>
            (list as string[]).length ? (
              <div key={h as string} className="mt-2">
                <p className="text-label font-semibold tracking-wide text-ink-500 uppercase">
                  {h as string}
                </p>
                <ul className="text-caption text-ink-700">
                  {(list as string[]).map((x) => (
                    <li key={x}>• {x}</li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
        </AiBox>
      )}
      <Card>
        <p className="mb-1 text-caption font-semibold text-ink-500 uppercase">Original answers</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-caption">
          {[
            ["Change", `${a.change}${a.changeDetail ? ` — “${a.changeDetail}”` : ""}`],
            [
              "New difficulty",
              `${a.newDifficulty}${a.difficultyDetail ? ` — “${a.difficultyDetail}”` : ""}`,
            ],
            ["Pain", a.pain || "Not answered"],
            ["Home activities", `${a.homeDone || "—"}, ${a.homeDifficulty || "—"}`],
            ["Concerns", a.concerns || "None"],
            ["Questions", a.questions || "None"],
            ["Logistics", a.logistics || "—"],
          ].map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-500">{k}</dt>
              <dd className="text-ink-900">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-2">
          <ReportedBy r={c.reporter} />
        </div>
      </Card>
    </div>
  );
}

/** The brief inside a visit's briefing sheet. */
export function VisitCheckin({
  clientId,
  appointmentId,
}: {
  clientId: string;
  appointmentId: string;
}) {
  const r = useResource<TherapistEnhanceDto>(
    `/api/enhance?clientId=${clientId}`,
    (e) => e.type === "care",
  );
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<(typeof checkinTemplates)[number]>("Therapy follow-up");
  const [questions, setQuestions] = useState<string[]>(templateQuestions["Therapy follow-up"]);
  const [newQ, setNewQ] = useState("");
  const [channel, setChannel] = useState<(typeof deliveryChannels)[number]>("In app");
  const [auto, setAuto] = useState<(typeof autoSendHours)[number] | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const c = r.data?.checkins.find((x) => x.appointmentId === appointmentId);
  if (!r.data) return <Skeleton className="h-20 rounded-card" />;
  if (!c || c.status !== "Submitted")
    return (
      <div className="rounded-card border border-border bg-surface p-3">
        <div className="flex items-center gap-3">
          <IconBadge icon={ClipboardCheck} tone="indigo" size={36} />
          <span className="min-w-0 flex-1">
            <span className="block text-small font-semibold text-ink-900">Pre-visit check-in</span>
            <span className="block text-caption text-ink-500">
              {c?.status === "Sent"
                ? `Sent · ${c.template} · waiting for the patient`
                : c?.status === "Draft"
                  ? "The patient has started it"
                  : "Not sent. The visit can still go ahead."}
            </span>
          </span>
        </div>
        <div className="mt-2">
          <Pick
            label="Template"
            value={template}
            onChange={(t) => {
              setTemplate(t);
              setQuestions(templateQuestions[t]);
            }}
            options={checkinTemplates}
          />
          <p className="mt-2 text-caption font-semibold text-ink-700">
            Extra questions (core questions are always asked)
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {questions.map((q) => (
              <li
                key={q}
                className="group flex items-center justify-between gap-2 rounded-control px-1.5 py-1 text-caption text-ink-700 hover:bg-sunken"
              >
                <span>• {q}</span>
                <button
                  type="button"
                  aria-label={`Remove ${q}`}
                  title="Remove question"
                  onClick={() => setQuestions((x) => x.filter((y) => y !== q))}
                  className="flex flex-none cursor-pointer items-center gap-1 rounded-control px-1.5 py-0.5 font-semibold text-over transition-colors duration-140 hover:bg-over-bg"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-1 flex gap-1.5">
            <input
              aria-label="Add a question"
              value={newQ}
              onChange={(e) => setNewQ(e.target.value)}
              placeholder="Add a question"
              className="min-w-0 flex-1 rounded-control border border-border-strong bg-surface px-2 py-1.5 text-caption"
            />
            <Button
              size="sm"
              disabled={newQ.trim().length < 3}
              onClick={() => {
                setQuestions((x) => [...x, newQ.trim()]);
                setNewQ("");
              }}
            >
              Add
            </Button>
          </div>
          <div className="mt-2">
            <Pick
              label="Also send by"
              value={channel}
              onChange={setChannel}
              options={deliveryChannels}
            />
          </div>
          <Button
            size="sm"
            variant="primary"
            className="mt-2"
            onClick={async () => {
              const res = await act<{ link: string }>(
                { type: "checkin-send", appointmentId, template, questions, channel },
                "Check-in sent to the patient",
              );
              if (res) setLink(res.link);
              r.reload();
            }}
          >
            {c?.status === "Sent" ? "Send again" : "Send check-in"}
          </Button>
          <div className="mt-3 border-t border-border pt-2">
            <Pick
              label="Send automatically before each visit (hours)"
              value={auto ?? r.data.prefs.checkinAuto.hours}
              onChange={async (h) => {
                setAuto(h);
                await act(
                  { type: "checkin-auto", clientId, hours: h, channel, template },
                  h === "Off"
                    ? "Automatic check-ins off"
                    : `Check-ins go ${h} hours before each visit`,
                );
                r.reload();
              }}
              options={autoSendHours}
            />
            <p className="mt-1 text-caption text-ink-500">
              Automation · a rule sends it; you still review the answers.
            </p>
          </div>
          {link && (
            <p className="mt-2 text-caption text-ink-700">
              Secure link for someone without the app (date of birth required):{" "}
              <a href={link} className="font-mono text-accent" target="_blank" rel="noreferrer">
                {link.slice(0, 22)}…
              </a>
            </p>
          )}
        </div>
      </div>
    );
  return (
    <>
      {c.rescheduled && (
        <p className="mb-1.5 rounded-control bg-watch-bg px-3 py-2 text-caption text-watch">
          The visit moved after this check-in. Check the answers still apply.
        </p>
      )}
      <button
        type="button"
        disabled={!c}
        onClick={() => setOpen(true)}
        className="flex w-full cursor-pointer items-center gap-3 rounded-card border border-border bg-surface p-3 text-left disabled:cursor-default"
      >
        <IconBadge icon={ClipboardCheck} tone={c?.flags.length ? "amber" : "indigo"} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block text-small font-semibold text-ink-900">Pre-visit check-in</span>
          <span className="block text-caption text-ink-500">
            {c
              ? `${c.flags.length ? `${c.flags.length} flagged · ` : ""}${c.review}`
              : "Not submitted. The visit can still go ahead."}
          </span>
        </span>
        {c && <ChevronRight className="size-4 text-ink-400" aria-hidden="true" />}
      </button>
      {open && c && (
        <CheckinReview
          c={c}
          patient={r.data.client.name}
          onClose={() => {
            setOpen(false);
            r.reload();
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ patient AI tab */

type Section = "coach" | "insights" | "team" | "copilot";

export function PatientAiTab({ clientId }: { clientId: string }) {
  const r = useResource<TherapistEnhanceDto>(
    `/api/enhance?clientId=${clientId}`,
    (e) => e.type === "care",
  );
  const [view, setView] = useState<Section>("coach");
  const d = r.data;
  const tabs: [Section, string, typeof Inbox][] = [
    ["coach", "Coach", Dumbbell],
    ["insights", "Insights", TrendingUp],
    ["team", "Care team", Network],
    ["copilot", "Copilot", BotMessageSquare],
  ];
  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label="AI assistants"
        className="grid grid-cols-4 gap-1 rounded-control bg-sunken p-1"
      >
        {tabs.map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-0.5 rounded-control py-1.5 text-label font-semibold",
              view === id ? "bg-surface text-ink-900 shadow-hairline" : "text-ink-500",
            )}
          >
            <Icon className="size-4" aria-hidden="true" /> {label}
          </button>
        ))}
      </div>
      {!d ? (
        <div className="h-40 animate-pulse rounded-card bg-sunken" />
      ) : view === "coach" ? (
        <CoachPanel d={d} reload={r.reload} />
      ) : view === "insights" ? (
        <InsightsPanel d={d} reload={r.reload} />
      ) : view === "team" ? (
        <TeamPanel d={d} reload={r.reload} />
      ) : (
        <CopilotPanel d={d} />
      )}
    </div>
  );
}

/* ---------------- 01 coach (therapist) ---------------- */

/** 06: which verified caregivers may answer for the patient, what about, and until when. */
function CaregiverAccess({ d, reload }: { d: TherapistEnhanceDto; reload: () => void }) {
  if (!d.representatives.length) return null;
  return (
    <Card>
      <p className="text-small font-semibold text-ink-900">Caregiver access</p>
      <p className="mb-2 text-caption text-ink-500">
        Verified representatives can answer for {d.client.name.split(" ")[0]} only where you allow
        it.
      </p>
      {d.representatives.map((rep) => {
        const g = d.prefs.caregivers.find((x) => x.name === rep.name);
        return <CaregiverRow key={rep.name} d={d} rep={rep} g={g ?? null} reload={reload} />;
      })}
    </Card>
  );
}

function CaregiverRow({
  d,
  rep,
  g,
  reload,
}: {
  d: TherapistEnhanceDto;
  rep: { name: string; relationship: string };
  g: TherapistEnhanceDto["prefs"]["caregivers"][number] | null;
  reload: () => void;
}) {
  const [scope, setScope] = useState<(typeof caregiverScopes)[number][]>(
    (g?.scope as (typeof caregiverScopes)[number][] | undefined) ?? [
      "Activities",
      "Appointments",
      "Concerns",
    ],
  );
  const [until, setUntil] = useState(g?.until ?? "");
  const save = async (revoked: boolean) => {
    await act(
      {
        type: "caregiver-access",
        clientId: d.client.id,
        name: rep.name,
        relationship: rep.relationship,
        scope,
        until,
        revoked,
      },
      revoked ? `${rep.name}'s access revoked` : `${rep.name}'s access saved`,
    );
    reload();
  };
  return (
    <div className="mb-2 rounded-control border border-border p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-small font-semibold text-ink-900">
          {rep.name} · {rep.relationship}
        </p>
        <Tag tone={g?.revoked ? "over" : "healthy"}>{g?.revoked ? "Revoked" : "Active"}</Tag>
      </div>
      <div className="mt-2 flex flex-col gap-2">
        <PickMany
          label="May answer about"
          value={scope}
          onChange={setScope}
          options={caregiverScopes}
        />
        <Field label="Until (YYYY-MM-DD, optional)" value={until} onChange={setUntil} />
        <div className="flex gap-1.5">
          <Button size="sm" variant="primary" onClick={() => save(false)}>
            {g?.revoked ? "Restore access" : "Save access"}
          </Button>
          {!g?.revoked && (
            <Button size="sm" variant="ghost" onClick={() => save(true)}>
              Revoke
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function CoachPanel({ d, reload }: { d: TherapistEnhanceDto; reload: () => void }) {
  const [level, setLevel] = useState<(typeof coachLevels)[number]>("Plain");
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    id: string;
    steps: { text: string; source: string }[];
  } | null>(null);
  if (!d.activities.length)
    return (
      <Card>
        <p className="text-small text-ink-700">
          Coach unavailable: no shared home activity on a signed plan. Share a home program first.
        </p>
      </Card>
    );
  return (
    <div className="flex flex-col gap-3">
      <CaregiverAccess d={d} reload={reload} />
      <Pick label="Explanation level" value={level} onChange={setLevel} options={coachLevels} />
      {d.activities.map((a) => {
        const k = a.coach;
        const logs = d.logs.filter((l) => l.coachId === k?.id);
        const qs = d.questions.filter((q) => q.coachId === k?.id);
        return (
          <Card key={a.activityId}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-small font-semibold text-ink-900">{a.name}</p>
                <p className="text-caption text-ink-500">
                  {a.frequency} · {a.dose} · plan v{a.planVersion}
                </p>
              </div>
              <Tag
                tone={
                  k?.status === "Active"
                    ? k.stale
                      ? "over"
                      : "healthy"
                    : k?.status === "Paused"
                      ? "watch"
                      : "neutral"
                }
              >
                {k ? (k.stale ? "Plan changed" : k.status) : "Off"}
              </Tag>
            </div>
            {k && k.steps.length > 0 && (
              <div className="mt-2">
                <AiBox
                  label={
                    k.status === "Draft"
                      ? "AI draft · review before publishing"
                      : "Published guidance"
                  }
                  ai={k.ai}
                >
                  <ol className="flex flex-col gap-1 text-small text-ink-900">
                    {k.steps.map((s, i) => (
                      <li key={i}>
                        {i + 1}. {s.text}{" "}
                        <span className="text-label text-ink-500">· {s.source}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-2 text-caption text-ink-500">
                    Source: plan v{k.planVersion} instructions, frequency, duration, precautions
                  </p>
                </AiBox>
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button
                size="sm"
                loading={busy === a.activityId}
                onClick={async () => {
                  setBusy(a.activityId);
                  await act(
                    {
                      type: "coach-draft",
                      clientId: d.client.id,
                      planId: a.planId,
                      activityId: a.activityId,
                      level,
                    },
                    "AI draft ready to review",
                  );
                  setBusy(null);
                  reload();
                }}
              >
                {k ? "Redraft with AI" : "Draft guidance with AI"}
              </Button>
              {k && (k.status === "Draft" || k.status === "Paused") && !k.stale && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={async () => {
                    await act(
                      { type: "coach-state", coachId: k.id, to: "Active" },
                      "Published to the patient",
                    );
                    reload();
                  }}
                >
                  Approve and publish
                </Button>
              )}
              {k?.status === "Active" && (
                <Button
                  size="sm"
                  onClick={async () => {
                    await act({ type: "coach-state", coachId: k.id, to: "Paused" }, "Coach paused");
                    reload();
                  }}
                >
                  Pause
                </Button>
              )}
              {k && k.status !== "Superseded" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing({ id: k.id, steps: k.steps })}
                >
                  Edit steps
                </Button>
              )}
            </div>
            {k && (
              <div className="mt-2">
                <Pick
                  label="How it answers questions"
                  value={k.mode}
                  onChange={async (m) => {
                    await act(
                      { type: "coach-mode", coachId: k.id, mode: m },
                      `Coach answers: ${m}`,
                    );
                    reload();
                  }}
                  options={coachModes}
                />
              </div>
            )}
            {editing && k && editing.id === k.id && (
              <div className="mt-2 flex flex-col gap-2 rounded-card border border-border bg-sunken p-2.5">
                {editing.steps.map((st, i) => (
                  <Field
                    key={i}
                    label={`Step ${i + 1} · ${st.source}`}
                    value={st.text}
                    onChange={(v) =>
                      setEditing((e) =>
                        e
                          ? {
                              ...e,
                              steps: e.steps.map((x, j) => (j === i ? { ...x, text: v } : x)),
                            }
                          : e,
                      )
                    }
                  />
                ))}
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={async () => {
                      if (
                        await act(
                          { type: "coach-edit", coachId: k.id, steps: editing.steps },
                          "Saved as a draft to approve",
                        )
                      ) {
                        setEditing(null);
                        reload();
                      }
                    }}
                  >
                    Save edits
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {(logs.length > 0 || qs.length > 0) && (
              <div className="mt-3 border-t border-border pt-2">
                <p className="text-label font-semibold tracking-wide text-ink-500 uppercase">
                  Digest
                </p>
                <p className="text-caption text-ink-700">
                  {logs.filter((l) => l.result === "Completed").length} of {logs.length} logs
                  completed · {logs.filter((l) => l.concern).length} concerns · {qs.length}{" "}
                  questions
                </p>
                <ul className="mt-1 flex flex-col gap-1 text-caption text-ink-700">
                  {qs.slice(0, 3).map((q) => (
                    <li key={q.id} className="flex items-start gap-1.5">
                      <MessageCircleQuestion
                        className="mt-0.5 size-3.5 flex-none"
                        aria-hidden="true"
                      />
                      <span>
                        “{q.question}” → {q.outcome} <ReportedBy r={q.reporter} />
                      </span>
                    </li>
                  ))}
                  {logs.slice(0, 3).map((l) => (
                    <li key={l.id}>
                      {shortDate(l.at)}: {l.result}, {l.difficulty}
                      {l.reason ? `, ${l.reason}` : ""} <ReportedBy r={l.reporter} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/* ---------------- 05 insights ---------------- */

function MiniChart({ points, unit }: { points: { date: string; value: string }[]; unit: string }) {
  const nums = points.map((p) => Number(p.value));
  if (points.length < 2 || nums.some((n) => !Number.isFinite(n)))
    return (
      <p className="text-caption text-ink-500">
        Chart unavailable: fewer than two numeric measurements.
      </p>
    );
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const x = (i: number) => 8 + (i * 284) / (nums.length - 1);
  const y = (v: number) => (hi === lo ? 40 : 70 - ((v - lo) / (hi - lo)) * 60);
  const desc = points.map((p) => `${shortDate(p.date)} ${p.value} ${unit}`).join(", ");
  return (
    <figure className="mt-2">
      <svg
        viewBox="0 0 300 80"
        role="img"
        aria-label={`Recorded values: ${desc}`}
        className="h-20 w-full"
      >
        <polyline
          fill="none"
          stroke="var(--color-series-1)"
          strokeWidth="2"
          points={nums.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
        />
        {nums.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill="var(--color-series-1)" />
        ))}
      </svg>
      <figcaption className="text-caption text-ink-500">{desc}</figcaption>
    </figure>
  );
}

function InsightsPanel({ d, reload }: { d: TherapistEnhanceDto; reload: () => void }) {
  const [period, setPeriod] = useState<"30" | "60" | "90" | "All">("All");
  const now = useNow();
  const [busy, setBusy] = useState<string | null>(null);
  const [review, setReview] = useState<InsightDto | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <Pick
        label="Period (days)"
        value={period}
        onChange={setPeriod}
        options={["30", "60", "90", "All"] as const}
      />
      {d.goals.map((g) => {
        const latest = d.insights.find((i) => i.goalId === g.goalId && i.status !== "Superseded");
        const since = period === "All" || !now ? 0 : now - Number(period) * 86_400_000;
        const pts = g.points.filter((p) => new Date(p.date).getTime() >= since);
        return (
          <Card key={g.goalId}>
            <p className="text-small font-semibold text-ink-900">{g.title}</p>
            <p className="text-caption text-ink-500">
              Baseline {g.baseline} · target {g.target} {g.unit} · {g.points.length} measurements
            </p>
            <MiniChart points={pts} unit={g.unit} />
            {latest?.stale && (
              <p className="mt-2 rounded-control bg-watch-bg px-3 py-2 text-caption text-watch">
                New measurements since this insight was drafted. Draft it again before relying on
                it.
              </p>
            )}
            {latest && (
              <div className="mt-2">
                <AiBox label={`AI trend draft · ${latest.status}`} ai={latest.ai}>
                  <div className="mb-1 flex items-center gap-2">
                    <Tag
                      tone={
                        latest.trend === "Improving"
                          ? "healthy"
                          : latest.trend === "Declining"
                            ? "over"
                            : "neutral"
                      }
                    >
                      {latest.trend}
                    </Tag>
                    <span className="text-label text-ink-500">
                      Trend computed by rule from recorded values
                    </span>
                  </div>
                  <p className="text-small text-ink-900">{latest.narrative}</p>
                  {latest.gaps.length > 0 && (
                    <ul className="mt-1 text-caption text-watch">
                      {latest.gaps.map((x) => (
                        <li key={x}>• {x}</li>
                      ))}
                    </ul>
                  )}
                  <Sources
                    items={latest.points.map(
                      (p) => `${shortDate(p.date)} · ${p.value} ${latest.unit} · ${p.source}`,
                    )}
                  />
                </AiBox>
              </div>
            )}
            <div className="mt-2 flex gap-1.5">
              <Button
                size="sm"
                loading={busy === g.goalId}
                onClick={async () => {
                  setBusy(g.goalId);
                  await act(
                    {
                      type: "insight-draft",
                      clientId: d.client.id,
                      planId: g.planId,
                      goalId: g.goalId,
                    },
                    "Insight drafted",
                  );
                  setBusy(null);
                  reload();
                }}
              >
                View effectiveness insight
              </Button>
              {latest && latest.status === "Draft" && (
                <Button size="sm" variant="primary" onClick={() => setReview(latest)}>
                  Review
                </Button>
              )}
              {latest?.status === "Approved" && (
                <>
                  <Tag tone="healthy">{latest.share ? "Shared with patient" : "Approved"}</Tag>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await act(
                        {
                          type: "insight-decide",
                          insightId: latest.id,
                          decision: "Withdraw",
                          interpretation: latest.interpretation,
                          interpretationNote: latest.interpretationNote,
                          followUp: "None",
                          share: false,
                          patientSummary: latest.patientSummary,
                        },
                        "Approval withdrawn; hidden from the patient",
                      );
                      reload();
                    }}
                  >
                    Withdraw
                  </Button>
                </>
              )}
            </div>
          </Card>
        );
      })}
      {review && (
        <InsightReview
          i={review}
          onClose={() => {
            setReview(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function InsightReview({ i, onClose }: { i: InsightDto; onClose: () => void }) {
  const [interp, setInterp] = useState<(typeof interpretations)[number] | "">("");
  const [note, setNote] = useState("");
  const [follow, setFollow] = useState<(typeof followUps)[number]>("None");
  const [share, setShare] = useState(true);
  const [summary, setSummary] = useState(i.patientSummary);
  const [busy, setBusy] = useState(false);
  const decide = async (decision: "Approve" | "Reject") => {
    setBusy(true);
    const r = await act(
      {
        type: "insight-decide",
        insightId: i.id,
        decision,
        interpretation: interp,
        interpretationNote: note,
        followUp: follow,
        share,
        patientSummary: summary,
      },
      decision === "Approve" ? (share ? "Approved and shared" : "Approved") : "Rejected",
    );
    setBusy(false);
    if (r) onClose();
  };
  return (
    <AppSheet
      title="Clinical review"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy} onClick={() => decide("Reject")}>
            Reject
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            loading={busy}
            disabled={!interp}
            onClick={() => decide("Approve")}
          >
            Approve
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-small font-semibold text-ink-900">{i.goalTitle}</p>
        <Pick
          label="Your interpretation"
          value={interp}
          onChange={setInterp}
          options={interpretations}
        />
        <Field label="Why (your clinical reasoning)" value={note} onChange={setNote} area />
        <Pick label="Follow-up" value={follow} onChange={setFollow} options={followUps} />
        <label className="flex items-center gap-2 text-small">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />{" "}
          Share a summary with the patient
        </label>
        {share && (
          <Field
            label="What the patient will see (AI suggestion, edit freely)"
            value={summary}
            onChange={setSummary}
            area
          />
        )}
      </div>
    </AppSheet>
  );
}

/* ---------------- 03 care team ---------------- */

function TeamPanel({ d, reload }: { d: TherapistEnhanceDto; reload: () => void }) {
  const k = d.coordination;
  const [busy, setBusy] = useState(false);
  const [vis, setVis] = useState<(typeof shareVisibility)[number]>("Care-team only");
  const [text, setText] = useState("");
  const [recipient, setRecipient] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="primary"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          await act({ type: "coord-brief", clientId: d.client.id }, "Care-team briefing ready");
          setBusy(false);
          reload();
        }}
      >
        <Network className="size-4" aria-hidden="true" />{" "}
        {k ? "Refresh coordination briefing" : "Generate coordination briefing"}
      </Button>
      {k && (
        <>
          <div className="grid grid-cols-1 gap-2">
            {k.disciplines.map((x) => (
              <Card key={x.service}>
                <p className="text-small font-semibold text-ink-900">{x.service}</p>
                <p className="text-caption text-ink-500">{x.clinician}</p>
                <p className="mt-1 text-caption text-ink-700">
                  {x.goals.length ? x.goals.join(" · ") : "No approved goals yet"}
                </p>
              </Card>
            ))}
            {k.restrictedOmitted > 0 && (
              <p className="text-caption text-ink-500">
                {k.restrictedOmitted} restricted record omitted (psychology/trauma).
              </p>
            )}
          </div>
          <AiBox
            label="AI coordination briefing · suggestions only"
            ai={k.ai}
            offLabel={
              k.disciplines.length < 2
                ? "Rule · one shareable discipline, no AI suggestions"
                : "From approved records · AI unavailable"
            }
          >
            <p className="text-small text-ink-900">{k.briefing}</p>
            <p className="mt-1 text-caption text-ink-500">
              Generated {shortDate(k.at)}, {timeOfDay(k.at)} · plans are never merged or changed
            </p>
          </AiBox>
          {k.suggestions.map((s) => (
            <Card key={s.id}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-small font-semibold text-ink-900">Potential: {s.type}</p>
                <Tag
                  tone={
                    s.decision === "Accept"
                      ? "healthy"
                      : s.decision === "Pending"
                        ? "neutral"
                        : "watch"
                  }
                >
                  {s.decision}
                </Tag>
              </div>
              <p className="mt-1 text-small text-ink-700">{s.text}</p>
              <p className="mt-1 text-caption text-ink-500">Suggested: {s.nextStep}</p>
              <Sources items={s.sources} />
              {s.decision === "Accept" && (
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={async () => {
                    await act(
                      { type: "suggestion-task", coordId: k.id, suggestionId: s.id },
                      "Follow-up task created",
                    );
                    reload();
                  }}
                >
                  Create follow-up task
                </Button>
              )}
              {s.decision === "Pending" && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {suggestionDecisions.map((x) => (
                    <Button
                      key={x}
                      size="sm"
                      variant={x === "Accept" ? "primary" : "secondary"}
                      onClick={async () => {
                        await act({
                          type: "coord-decide",
                          coordId: k.id,
                          suggestionId: s.id,
                          decision: x,
                          reason: x === "Accept" ? "" : "Reviewed by treating therapist",
                        });
                        reload();
                      }}
                    >
                      {x}
                    </Button>
                  ))}
                </div>
              )}
            </Card>
          ))}
          <Card>
            <p className="mb-2 text-small font-semibold text-ink-900">Share an update</p>
            <div className="flex flex-col gap-2">
              <Field
                label="To"
                value={recipient}
                onChange={setRecipient}
                placeholder="For example, physiotherapist"
              />
              <Pick
                label="Who can see it"
                value={vis}
                onChange={setVis}
                options={d.sharingWithdrawn ? (["Care-team only"] as const) : shareVisibility}
              />
              {d.sharingWithdrawn && (
                <p className="text-caption text-watch">
                  {d.client.name.split(" ")[0]} has withdrawn consent to share, so updates stay
                  within the care team.
                </p>
              )}
              <Field label="Exactly what will be shared" value={text} onChange={setText} area />
              <p className="text-caption text-ink-500">
                Preview:{" "}
                {vis === "Care-team only"
                  ? "care team only, never the patient"
                  : "the patient sees this in their app"}
                .
              </p>
              <Button
                size="sm"
                variant="primary"
                disabled={text.trim().length < 5 || recipient.trim().length < 2}
                onClick={async () => {
                  await act(
                    { type: "coord-share", coordId: k.id, recipient, visibility: vis, text },
                    "Shared",
                  );
                  setText("");
                  reload();
                }}
              >
                Share
              </Button>
            </div>
          </Card>
          {k.shares.map((s) => (
            <div
              key={s.id}
              className="flex items-start justify-between gap-2 text-caption text-ink-500"
            >
              <p>
                {shortDate(s.at)} · to {s.recipient} · {s.visibility}: “{s.text}”
              </p>
              {s.status !== "Shared" ? (
                <span className="flex flex-col items-end gap-0.5">
                  <Tag tone={s.status === "Acknowledged" ? "healthy" : "watch"}>{s.status}</Tag>
                  {s.note && <span className="text-label text-ink-500">{s.note}</span>}
                </span>
              ) : (
                <span className="flex flex-none gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await act(
                        { type: "share-ack", coordId: k.id, shareId: s.id },
                        "Acknowledged",
                      );
                      reload();
                    }}
                  >
                    Acknowledge
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await act(
                        {
                          type: "share-clarify",
                          coordId: k.id,
                          shareId: s.id,
                          note: "Can you say which goal this relates to?",
                        },
                        "Clarification requested",
                      );
                      reload();
                    }}
                  >
                    Ask to clarify
                  </Button>
                </span>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ---------------- 07 copilot ---------------- */

function CopilotPanel({ d }: { d: TherapistEnhanceDto }) {
  const [msgs, setMsgs] = useState(d.chat);
  return (
    <div className="flex flex-col gap-2">
      {d.prefs.aiConsent === "Withdrawn" && (
        <p className="rounded-control bg-watch-bg px-3 py-2 text-caption text-watch">
          {d.client.name.split(" ")[0]} has turned AI off. The copilot won&apos;t use their records.
        </p>
      )}
      <p className="text-caption text-ink-500">
        Answers only from {d.client.name}&apos;s records you can access. Drafts stay unsigned; tasks
        are proposals until you create them.
      </p>
      <ChatThread
        messages={msgs}
        starters={[
          "Prepare me for the next visit",
          "Summarise recent patient reports",
          "What's missing before the review?",
        ]}
        placeholder="Ask the copilot"
        onSend={async (text) => {
          setMsgs((m) => [...m, { role: "user", text, at: new Date().toISOString() }]);
          const r = await act<{ reply: TherapistEnhanceDto["chat"][number] }>({
            type: "chat",
            text,
            clientId: d.client.id,
          });
          if (r) setMsgs((m) => [...m, r.reply]);
        }}
        onTask={async (title) => {
          await act({ type: "chat-task", clientId: d.client.id, title }, "Task created");
        }}
        onFeedback={(m, rating) =>
          void act(
            {
              type: "feedback",
              source: "Copilot",
              clientId: d.client.id,
              excerpt: m.text.slice(0, 500),
              rating,
              note: "",
            },
            "Feedback recorded",
          )
        }
      />
      {msgs.length > 0 && (
        <button
          type="button"
          onClick={async () => {
            if (await act({ type: "chat-clear", clientId: d.client.id }, "Copilot history deleted"))
              setMsgs([]);
          }}
          className="cursor-pointer self-start text-caption font-semibold text-over"
        >
          Delete copilot history
        </button>
      )}
    </div>
  );
}
