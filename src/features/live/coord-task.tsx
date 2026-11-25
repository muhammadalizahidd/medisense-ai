"use client";

import {
  ArrowLeft,
  CalendarPlus,
  ClipboardList,
  History,
  Lock,
  MessageSquare,
  Phone,
  RefreshCcw,
  Send,
  ShieldAlert,
  Share2,
  UserCheck,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { AiDraft, RuleMark } from "@/components/ai/provenance";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Select } from "@/components/ui/select";
import { inputClass } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { useResource } from "@/lib/live/client";
import {
  cancelReasons,
  checkStates,
  contactModes,
  escalationReasons,
  locations,
  priorities,
  statusTone,
  waiting,
  type TaskFull,
} from "@/lib/live/coord";
import { cn } from "@/lib/cn";
import { ErrorNote, LiveBadge, Skeleton } from "./bits";
import { FCard } from "./funding-bits";
import { ops, textArea, when } from "./ops-bits";

type Post = (body: unknown, ok: string, detail?: string) => Promise<boolean>;
const opts = (list: readonly string[]) => list.map((o) => <option key={o}>{o}</option>);

export function CoordTask({
  id,
  base,
}: {
  id: string;
  base: "/therapist/coordination" | "/care/coordination";
}) {
  const url = `/api/care/coordination/${id}`;
  const { data, error, loading, reload } = useResource<{ task: TaskFull }>(
    url,
    (e) => e.type === "care",
  );
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-[760px]" />;
  const t = data.task;
  const post: Post = async (body, ok, detail) => {
    const res = await ops(url, body, ok, detail);
    if (res) reload();
    return Boolean(res);
  };
  const k = t.history.length;
  return (
    <>
      <PageHeader
        eyebrow="Live care"
        leading={
          <ButtonLink size="sm" variant="ghost" href={base}>
            <ArrowLeft className="size-3.5" aria-hidden="true" /> Tasks
          </ButtonLink>
        }
        title={t.restricted && t.view === "status" ? "Restricted follow-up" : t.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{t.ref}</span>
            <Tag tone={statusTone[t.status]}>{t.status}</Tag>
            <Tag tone="outline">{t.category}</Tag>
            {t.restricted && (
              <Tag tone="outline">
                <Lock className="size-3" aria-hidden="true" /> {t.visibility}
              </Tag>
            )}
          </span>
        }
        actions={<LiveBadge />}
      />
      <section className="grid overflow-hidden rounded-card border border-border bg-surface shadow-lift sm:grid-cols-2 xl:grid-cols-5">
        {[
          [
            "Participant",
            t.participant ? `${t.participant}` : "General task",
            t.participant ? `${t.participantId} · ${t.discipline}` : "",
          ],
          [
            "Owner",
            t.assignee,
            t.collaborators.length ? `With ${t.collaborators.join(", ")}` : "No collaborators",
          ],
          [
            "Due",
            t.dueAt ? when(t.dueAt) : "No due date",
            t.overdue ? "Overdue" : `Reminder: ${t.reminder}`,
          ],
          [
            "Priority",
            t.priority,
            t.escalation ? `Escalated to ${t.escalation.to}` : "Not escalated",
          ],
          ["Source", t.source, t.sourceLink?.label ?? ""],
        ].map(([l, v, s], i) => (
          <div
            key={l}
            className={cn("p-5", i > 0 && "border-t border-border sm:border-t-0 xl:border-l")}
          >
            <p className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">{l}</p>
            <p
              className={cn(
                "mt-1 text-body font-semibold",
                l === "Due" && t.overdue ? "text-over" : "text-ink-900",
              )}
            >
              {v}
            </p>
            <p className="text-caption text-ink-500">{s}</p>
          </div>
        ))}
      </section>
      {t.view === "status" && (
        <p className="flex items-center gap-2 rounded-card border border-border bg-sunken px-4 py-3 text-small text-ink-700">
          <Lock className="size-4 text-ink-500" aria-hidden="true" /> Status view: this task belongs
          to a restricted or different care team. Details stay with the assigned clinician.
        </p>
      )}
      {t.conflict && t.canEdit && (
        <FCard
          icon={RefreshCcw}
          title="Edited on the phone and the web"
          sub={`${t.conflict.field}: choose one; both versions are kept in the history`}
          action={<RuleMark>Sync</RuleMark>}
        >
          <div className="grid items-stretch gap-4 md:grid-cols-2">
            {(["mobile", "web"] as const).map((side) => (
              <div
                key={side}
                className="flex flex-col gap-3 rounded-control border border-border-strong p-4"
              >
                <p className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
                  {side === "mobile" ? "Phone (offline)" : "Web"}
                </p>
                <p className="flex-1 text-small text-ink-900">
                  {side === "mobile" ? t.conflict?.mobile : t.conflict?.web}
                </p>
                <Button
                  size="sm"
                  onClick={() =>
                    post({ type: "resolve-conflict", keep: side }, "Conflict resolved")
                  }
                >
                  Keep this version
                </Button>
              </div>
            ))}
          </div>
        </FCard>
      )}
      <div className="grid items-stretch gap-6 xl:grid-cols-12">
        <div className="flex flex-col gap-6 xl:col-span-7 [&>*:last-child]:flex-1">
          <FCard
            icon={ClipboardList}
            title="Instructions"
            sub={
              t.sourceLink
                ? `From ${t.sourceLink.label}`
                : `Created ${t.history.at(-1) ? when(t.history.at(-1)?.at) : ""}`
            }
          >
            <p className="text-body whitespace-pre-line text-ink-900">{t.instructions}</p>
            {t.sourceLink && t.view !== "status" && (
              <a href={t.sourceLink.href} className="mt-2 inline-block text-small">
                Open {t.sourceLink.label}
              </a>
            )}
          </FCard>
          {t.view !== "status" && <CategoryPanel key={k} t={t} post={post} />}
          {t.checklist.length > 0 && (
            <FCard icon={ClipboardList} title="Checklist" flush>
              <ul className="divide-y divide-border">
                {t.checklist.map((c, i) => (
                  <li key={c.label} className="flex items-center gap-3 px-5 py-2.5">
                    <span
                      className={cn(
                        "min-w-0 flex-1 text-small",
                        c.state === "Done" ? "text-ink-500 line-through" : "text-ink-900",
                      )}
                    >
                      {c.label}
                    </span>
                    <div className="w-40">
                      <Select
                        aria-label={`${c.label} state`}
                        className="h-8"
                        disabled={!t.canEdit}
                        value={c.state}
                        onChange={(e) =>
                          post(
                            { type: "checklist", index: i, state: e.target.value },
                            "Checklist updated",
                          )
                        }
                      >
                        {opts(checkStates)}
                      </Select>
                    </div>
                  </li>
                ))}
              </ul>
            </FCard>
          )}
          <Comments key={`c${k}`} t={t} post={post} />
        </div>
        <div className="flex flex-col gap-6 xl:col-span-5 [&>*:last-child]:flex-1">
          {(t.canEdit || t.canReview) && <TakeAction key={`a${k}`} t={t} post={post} />}
          <FCard
            icon={History}
            title="Activity and audit"
            sub="Assignment, status, messages, approvals"
            flush
          >
            <ol className="max-h-[480px] divide-y divide-border overflow-y-auto">
              {t.history.map((h, i) => (
                <li key={i} className="px-5 py-2.5">
                  <p className="text-small text-ink-900">{h.action}</p>
                  <p className="text-caption text-ink-500">
                    {h.by} · {when(h.at)}
                    {h.reason ? ` · ${h.reason}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          </FCard>
        </div>
      </div>
    </>
  );
}

function TakeAction({ t, post }: { t: TaskFull; post: Post }) {
  const [outcome, setOutcome] = useState("");
  const [reason, setReason] = useState("");
  const [assignee, setAssignee] = useState(
    t.assignable.find((x) => x.name !== t.assignee)?.id ?? "",
  );
  const [esc, setEsc] = useState("Clinical review");
  const [cancel, setCancel] = useState("Not required");
  const closed = ["Completed", "Cancelled"].includes(t.status);
  const [feedback, setFeedback] = useState("");
  return (
    <FCard
      icon={Zap}
      title="Take action"
      sub="Only allowed next steps are shown"
      action={<RuleMark>Rules</RuleMark>}
    >
      <div className="flex flex-col gap-4">
        {t.canReview && (
          <div className="flex flex-col gap-2 rounded-control border border-border-strong p-3">
            <p className="text-small font-semibold text-ink-900">Reviewer decision</p>
            <textarea
              aria-label="Review feedback"
              placeholder="Feedback for the author"
              className={textArea}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => post({ type: "review", decision: "Approve", feedback }, "Approved")}
              >
                <UserCheck className="size-3.5" aria-hidden="true" /> Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  post(
                    { type: "review", decision: "Return for changes", feedback },
                    "Returned for changes",
                  )
                }
              >
                Return for changes
              </Button>
            </div>
          </div>
        )}
        {!closed && t.canEdit && (
          <>
            <div className="flex flex-wrap gap-2">
              {t.allowed
                .filter((s) => s !== "Completed" && s !== "Cancelled")
                .map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={s === "In Progress" ? "primary" : "secondary"}
                    onClick={() =>
                      post({ type: "status", to: s, reason, outcome: "" }, `Moved to ${s}`)
                    }
                  >
                    {s}
                  </Button>
                ))}
            </div>
            {t.allowed.some((s) => waiting.includes(s)) && (
              <input
                aria-label="Wait reason"
                placeholder="For a waiting state: what you're waiting for"
                className={inputClass}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            )}
            {t.allowed.includes("Completed") && (
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <textarea
                  aria-label="Outcome"
                  placeholder="Outcome, reason and evidence (required for clinical and approval tasks)"
                  className={textArea}
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() =>
                    post(
                      { type: "status", to: "Completed", reason: "", outcome },
                      "Task completed",
                      "Completing a task never signs a note",
                    )
                  }
                >
                  Complete task
                </Button>
              </div>
            )}
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <Select
                    aria-label="Reassign to"
                    className="h-9"
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                  >
                    {t.assignable.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name} · {x.role}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    post(
                      { type: "assign", assigneeId: assignee, reason: "Handover" },
                      "Reassigned",
                      "Both people were notified",
                    )
                  }
                >
                  Reassign
                </Button>
              </div>
              <p className="text-caption text-ink-500">
                Only people with access to this record are listed.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <div className="w-40">
                <Select
                  aria-label="Priority"
                  className="h-9"
                  value={t.priority}
                  onChange={(e) =>
                    post({ type: "priority", priority: e.target.value }, "Priority changed")
                  }
                >
                  {opts(priorities)}
                </Select>
              </div>
              <div className="w-44">
                <Select
                  aria-label="Escalation reason"
                  className="h-9"
                  value={esc}
                  onChange={(e) => setEsc(e.target.value)}
                >
                  {opts(escalationReasons)}
                </Select>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  post(
                    {
                      type: "escalate",
                      reason: esc,
                      detail: reason || "Needs Clinical Lead review",
                    },
                    "Escalated",
                    "The Clinical Lead was notified without clinical detail",
                  )
                }
              >
                <ShieldAlert className="size-3.5" aria-hidden="true" /> Escalate
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <div className="w-44">
                <Select
                  aria-label="Cancellation reason"
                  className="h-9"
                  value={cancel}
                  onChange={(e) => setCancel(e.target.value)}
                >
                  {opts(cancelReasons)}
                </Select>
              </div>
              <Button
                size="sm"
                variant="danger"
                onClick={() =>
                  post({ type: "cancel", reason: cancel, detail: reason }, "Task cancelled")
                }
              >
                Cancel task
              </Button>
            </div>
          </>
        )}
        {closed && t.canEdit && (
          <div className="flex flex-col gap-2">
            <p className="text-small text-ink-700">
              {t.status}
              {t.completed ? ` by ${t.completed.by}, ${when(t.completed.at)}` : ""}
              {t.cancelReason ? ` · ${t.cancelReason}` : ""}
            </p>
            {t.outcome && (
              <p className="rounded-control bg-sunken p-3 text-small text-ink-900">{t.outcome}</p>
            )}
            <input
              aria-label="Reopen reason"
              placeholder="Why reopen it"
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={reason.length < 5}
              onClick={() => post({ type: "reopen", reason }, "Reopened")}
            >
              Reopen
            </Button>
          </div>
        )}
      </div>
    </FCard>
  );
}

function CategoryPanel({ t, post }: { t: TaskFull; post: Post }) {
  const f = t.fields;
  const [attempt, setAttempt] = useState({ mode: f.contactMode || "Phone", outcome: "", next: "" });
  const [sched, setSched] = useState({
    location: f.location || "Home",
    window: f.window,
    frequency: f.frequency,
  });
  const [docs, setDocs] = useState<string[]>(
    f.documents.filter((d) => d.shareable).map((d) => d.label),
  );
  const [auth, setAuth] = useState(f.shareAuthority);
  const [ack, setAck] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  switch (t.category) {
    case "Clinical Follow-up":
      return (
        <FCard
          icon={Phone}
          title="Contact attempts"
          sub="Every attempt and its outcome, without duplicate notes"
        >
          <ul className="flex flex-col gap-2">
            {f.attempts.map((a, i) => (
              <li key={i} className="rounded-control border border-border px-3 py-2 text-small">
                <span className="font-semibold text-ink-900">
                  Attempt {i + 1} · {a.mode}
                </span>
                <span className="block text-ink-700">{a.outcome}</span>
                <span className="text-caption text-ink-500">
                  {a.by} · {when(a.at)}
                  {a.next ? ` · next: ${a.next}` : ""}
                </span>
              </li>
            ))}
            {!f.attempts.length && <li className="text-small text-ink-500">No attempts yet.</li>}
          </ul>
          {t.canEdit && !["Completed", "Cancelled"].includes(t.status) && (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <Select
                aria-label="Contact mode"
                className="h-9"
                value={attempt.mode}
                onChange={(e) => setAttempt({ ...attempt, mode: e.target.value })}
              >
                {opts(contactModes)}
              </Select>
              <input
                aria-label="Attempt outcome"
                placeholder="Outcome (e.g. no answer)"
                className={cn(inputClass, "sm:col-span-2")}
                value={attempt.outcome}
                onChange={(e) => setAttempt({ ...attempt, outcome: e.target.value })}
              />
              <input
                aria-label="Next attempt"
                placeholder="Next attempt (optional)"
                className={cn(inputClass, "sm:col-span-2")}
                value={attempt.next}
                onChange={(e) => setAttempt({ ...attempt, next: e.target.value })}
              />
              <Button
                size="sm"
                variant="primary"
                disabled={attempt.outcome.length < 2}
                onClick={() => post({ type: "attempt", ...attempt }, "Attempt recorded")}
              >
                Record attempt
              </Button>
            </div>
          )}
        </FCard>
      );
    case "Appointment Request":
      return (
        <FCard
          icon={CalendarPlus}
          title="Booking request"
          sub="Scheduling books it; your task tracks the response"
        >
          <dl className="mb-3 grid grid-cols-3 gap-3 text-small">
            <div>
              <dt className="text-caption text-ink-500">Location</dt>
              <dd>{f.location || "—"}</dd>
            </div>
            <div>
              <dt className="text-caption text-ink-500">Window</dt>
              <dd>{f.window || "—"}</dd>
            </div>
            <div>
              <dt className="text-caption text-ink-500">Scheduling response</dt>
              <dd className="font-semibold">{f.schedulerResponse || "Not sent"}</dd>
            </div>
          </dl>
          {t.canEdit && !f.schedulerResponse && (
            <div className="grid gap-2 sm:grid-cols-3">
              <Select
                aria-label="Location"
                className="h-9"
                value={sched.location}
                onChange={(e) => setSched({ ...sched, location: e.target.value })}
              >
                {opts(locations)}
              </Select>
              <input
                aria-label="Preferred window"
                placeholder="Preferred window"
                className={inputClass}
                value={sched.window}
                onChange={(e) => setSched({ ...sched, window: e.target.value })}
              />
              <input
                aria-label="Frequency"
                placeholder="Frequency"
                className={inputClass}
                value={sched.frequency}
                onChange={(e) => setSched({ ...sched, frequency: e.target.value })}
              />
              <Button
                size="sm"
                variant="primary"
                onClick={() => post({ type: "send-scheduling", ...sched }, "Sent to Scheduling")}
              >
                <Send className="size-3.5" aria-hidden="true" /> Send to Scheduling
              </Button>
            </div>
          )}
        </FCard>
      );
    case "Care Coordination":
    case "Referral":
      return (
        <FCard
          icon={Share2}
          title={t.category === "Referral" ? "Referral" : "Handover"}
          sub="Only shareable, authorised documents; psychology notes never go by default"
        >
          <div className="flex flex-col gap-3">
            {f.purpose && <p className="text-small">Purpose: {f.purpose}</p>}
            <ul className="flex flex-col gap-1.5">
              {f.documents.map((d) => (
                <li key={d.label}>
                  <label
                    className={cn(
                      "flex items-center gap-2 text-small",
                      !d.shareable && "text-ink-500",
                    )}
                  >
                    <input
                      type="checkbox"
                      disabled={!d.shareable || !t.canEdit}
                      checked={docs.includes(d.label)}
                      onChange={(e) =>
                        setDocs(
                          e.target.checked ? [...docs, d.label] : docs.filter((x) => x !== d.label),
                        )
                      }
                    />
                    {d.label}
                    {!d.shareable && <Tag tone="outline">Not shareable</Tag>}
                  </label>
                </li>
              ))}
            </ul>
            {f.ack ? (
              <p className="rounded-control border border-healthy bg-healthy-bg px-3 py-2 text-small">
                Acknowledged by {f.ack.by}, {when(f.ack.at)}
                {f.ack.comment ? `: ${f.ack.comment}` : ""}
              </p>
            ) : (
              t.canEdit && (
                <>
                  <label className="flex items-center gap-2 text-small">
                    <input
                      type="checkbox"
                      checked={auth}
                      onChange={(e) => setAuth(e.target.checked)}
                    />{" "}
                    Sharing authority confirmed
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() =>
                        post(
                          {
                            type: "handover",
                            documents: docs,
                            shareAuthority: auth,
                            purpose: f.purpose || t.title,
                          },
                          "Handover sent",
                        )
                      }
                    >
                      Send handover
                    </Button>
                    <input
                      aria-label="Acknowledgement comment"
                      placeholder="Recipient: acknowledgement comment"
                      className={cn(inputClass, "min-w-48 flex-1")}
                      value={ack}
                      onChange={(e) => setAck(e.target.value)}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => post({ type: "acknowledge", comment: ack }, "Acknowledged")}
                    >
                      Acknowledge receipt
                    </Button>
                  </div>
                </>
              )
            )}
            {busy ? (
              <AiDraft label="Drafting the handover summary" suggestionsOnly generating />
            ) : t.aiDraft ? (
              <AiDraft
                label="AI handover summary"
                suggestionsOnly
                meta={`Sources ${t.aiDraft.sources.join(", ")}`}
              >
                <p className="text-small text-ink-900">{t.aiDraft.text}</p>
              </AiDraft>
            ) : (
              t.canEdit &&
              t.participant && (
                <Button
                  data-ai-only
                  size="sm"
                  variant="soft"
                  onClick={async () => {
                    setBusy(true);
                    await post(
                      { type: "draft-summary" },
                      "Summary drafted",
                      "Review it before sharing",
                    );
                    setBusy(false);
                  }}
                >
                  Draft handover summary with AI
                </Button>
              )
            )}
          </div>
        </FCard>
      );
    case "Patient Communication":
      return (
        <FCard
          icon={MessageSquare}
          title="Message the participant"
          sub={
            f.consentOk
              ? `Approved recipient: ${f.recipient || "Participant"}`
              : "Messaging is disabled: no consent to contact on record"
          }
        >
          {f.consentOk ? (
            t.canEdit && (
              <div className="flex flex-col gap-2">
                <textarea
                  aria-label="Message"
                  placeholder="Approved instructions only; never a draft report"
                  className={textArea}
                  value={msg}
                  onChange={(e) => setMsg(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="primary"
                  disabled={msg.length < 5}
                  onClick={() =>
                    post(
                      {
                        type: "patient-message",
                        recipient: f.recipient || "Participant",
                        channel: "Secure Message",
                        text: msg,
                      },
                      "Message sent",
                    )
                  }
                >
                  Send secure message
                </Button>
              </div>
            )
          ) : (
            <p className="rounded-control border border-watch bg-watch-bg px-3 py-2 text-small">
              A consent review is needed before anyone can message this person.
            </p>
          )}
        </FCard>
      );
    case "Supervision":
      return (
        <FCard
          icon={UserCheck}
          title="Supervision"
          sub={`Supervisor: ${f.supervisor || "Clinical Lead"}`}
        >
          <p className="text-small text-ink-700">
            {f.reviewFeedback ? `Latest feedback: ${f.reviewFeedback}` : "No feedback yet."}
          </p>
          <p className="mt-2 text-caption text-ink-500">
            Approval here doesn&apos;t sign the clinical note or give admin sign-off rights.
          </p>
        </FCard>
      );
    default:
      return (
        <FCard
          icon={ClipboardList}
          title={t.category}
          sub={
            t.category === "Administrative Handoff"
              ? `Type: ${f.handoffType || "Other"}; operational summary only`
              : "Details"
          }
        >
          <p className="text-small text-ink-700">
            {f.handoffType
              ? `Admin works the operational task; the clinician keeps clinical responsibility.`
              : "Use the checklist and comments to record progress."}
          </p>
        </FCard>
      );
  }
}

function Comments({ t, post }: { t: TaskFull; post: Post }) {
  const [text, setText] = useState("");
  return (
    <FCard icon={MessageSquare} title="Comments" sub="Visible to people working on this task" flush>
      <ul className="divide-y divide-border">
        {t.comments.map((c, i) => (
          <li key={i} className="px-5 py-2.5">
            <p className="text-small text-ink-900">{c.text}</p>
            <p className="text-caption text-ink-500">
              {c.by} · {when(c.at)}
            </p>
          </li>
        ))}
        {!t.comments.length && <li className="px-5 py-5 text-small text-ink-500">No comments.</li>}
      </ul>
      {t.canEdit && (
        <div className="flex gap-2 border-t border-border p-4">
          <input
            aria-label="Comment"
            placeholder="Add a comment"
            className={inputClass}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button
            size="sm"
            disabled={!text.trim()}
            onClick={async () => {
              if (await post({ type: "comment", text }, "Comment added")) setText("");
            }}
          >
            Add
          </Button>
        </div>
      )}
    </FCard>
  );
}
