"use client";

import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Circle,
  ClipboardList,
  History,
  Lock,
  Paperclip,
  PlayCircle,
  StickyNote,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { RuleMark } from "@/components/ai/provenance";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Select } from "@/components/ui/select";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { api, useNow, useResource } from "@/lib/live/client";
import {
  isClosed,
  priorities,
  resolutionCodes,
  taskMoves,
  teams,
  type ApprovalDto,
  type MessageDto,
  type OpsCan,
  type TaskDto,
  type TaskStatus,
} from "@/lib/live/operations";
import { cn } from "@/lib/cn";
import { ErrorNote, LiveBadge, Skeleton } from "./bits";
import { FCard } from "./funding-bits";
import {
  DemoNote,
  PriorityTag,
  approvalTone,
  dueIn,
  messageTone,
  taskTone,
  textArea,
  when,
} from "./ops-bits";

type Detail = {
  task: TaskDto;
  can: OpsCan;
  canWork: boolean;
  staff: { id: string; name: string; teams: string[] }[];
  messages: MessageDto[];
  approvals: ApprovalDto[];
};

export function TaskPage({
  id,
  back = "/care/operations?tab=work",
}: {
  id: string;
  back?: string;
}) {
  const { data, error, loading, reload } = useResource<Detail>(
    `/api/care/operations/tasks/${id}`,
    (e) => e.type === "care",
  );
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-[640px]" />;
  return <TaskView d={data} reload={reload} back={back} />;
}

function TaskView({ d, reload, back }: { d: Detail; reload: () => void; back: string }) {
  const t = d.task;
  const now = useNow() ?? Date.parse(t.updatedAt);
  const [conflict, setConflict] = useState("");
  const [busy, setBusy] = useState("");
  const closed = isClosed(t.status);
  const can = d.canWork && !closed;

  async function act(action: Record<string, unknown>, ok: string) {
    setBusy(ok);
    try {
      await api(`/api/care/operations/tasks/${t.id}`, { body: { version: t.version, action } });
      toast(ok, { tone: "success" });
      setConflict("");
      reload();
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't save";
      if (/changed this task|Someone else changed/.test(msg)) setConflict(msg);
      else toast("Couldn't do that", { tone: "error", detail: msg });
      return false;
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Live care"
        leading={
          <ButtonLink size="sm" variant="ghost" href={back}>
            <ArrowLeft className="size-3.5" aria-hidden="true" /> Back
          </ButtonLink>
        }
        title={t.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{t.ref}</span>
            <Tag tone={taskTone[t.status]}>{t.status}</Tag>
            <PriorityTag p={t.priority} />
            {t.source === "Rule" ? (
              <RuleMark>{`${t.ruleCode} v${t.ruleVersion}`}</RuleMark>
            ) : (
              <Tag tone="outline">{t.source}</Tag>
            )}
            {t.visibility !== "Internal" && <Tag tone="outline">{t.visibility}</Tag>}
          </span>
        }
        actions={<LiveBadge />}
      />
      {conflict && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-watch bg-watch-bg px-4 py-3 text-small text-watch"
        >
          <span>
            <strong>Not saved: this task changed while you had it open.</strong> {conflict}
          </span>
          <Button
            size="sm"
            onClick={() => {
              setConflict("");
              reload();
            }}
          >
            Reload the latest
          </Button>
        </div>
      )}
      {t.suggestion && !closed && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-border-strong bg-surface px-4 py-3 text-small">
          <span>
            <RuleMark>Suggested by {t.ruleCode}</RuleMark>{" "}
            <span className="ml-2 text-ink-700">
              This rule runs in Suggest Only. Confirm the task before work starts.
            </span>
          </span>
          {can && (
            <Button
              size="sm"
              variant="primary"
              loading={busy === "Confirmed"}
              onClick={() => act({ type: "confirm" }, "Confirmed")}
            >
              Confirm task
            </Button>
          )}
        </div>
      )}
      <div className="grid items-stretch gap-6 xl:grid-cols-12">
        <div className="flex flex-col gap-6 xl:col-span-8 [&>*:last-child]:flex-1">
          <FCard icon={ClipboardList} title="Details">
            <dl className="grid gap-4 sm:grid-cols-3">
              {[
                ["Category", t.category],
                ["Team", t.team],
                ["Owner", t.assigneeName ?? "Unassigned"],
                ["Due", `${when(t.dueAt)} (${dueIn(t.dueAt, now)})`],
                ["SLA", t.sla],
                ["Created", when(t.createdAt)],
                ["Participant", t.participant ?? "—"],
                ["Service", t.service ?? "—"],
                ["Location", t.locationType ?? "—"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
                    {k}
                  </dt>
                  <dd
                    className={cn(
                      "mt-0.5 text-small text-ink-900",
                      k === "Due" && t.overdue && "font-semibold text-over",
                    )}
                  >
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-control bg-sunken px-4 py-3">
              <span className="text-small text-ink-900">
                {t.related.kind} <span className="font-mono">{t.related.ref}</span> ·{" "}
                {t.related.label}
              </span>
              {t.related.href && (
                <ButtonLink size="sm" variant="ghost" href={t.related.href}>
                  Open record <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </ButtonLink>
              )}
            </div>
            {t.urgentReason && (
              <p className="mt-3 text-small text-over">Urgent: {t.urgentReason}</p>
            )}
            {t.holdReason && t.status === "On Hold" && (
              <p className="mt-3 text-small text-ink-700">On hold: {t.holdReason}</p>
            )}
            {t.escalation && (
              <p className="mt-3 rounded-control border border-over-bg bg-over-bg px-3 py-2 text-small text-over">
                Escalated to the {t.escalation.owner}, {when(t.escalation.at)}:{" "}
                {t.escalation.reason}
                {t.escalation.outcome && (
                  <span className="block text-ink-900">Outcome: {t.escalation.outcome}</span>
                )}
              </p>
            )}
            {t.restrictedNote && (
              <div className="mt-3 rounded-control border border-over bg-over-bg px-3 py-2 text-small">
                <p className="flex items-center gap-1.5 font-semibold text-over">
                  <Lock className="size-3.5" aria-hidden="true" /> Clinically restricted note
                </p>
                <p className="mt-1 text-ink-900">{t.restrictedNote}</p>
              </div>
            )}
            {t.restrictedHidden && (
              <p className="mt-3 rounded-control bg-sunken px-3 py-2 text-caption text-ink-700">
                A clinical note on this task is visible to the Clinical Lead only.
              </p>
            )}
            {t.recordingHref && (
              <ButtonLink className="mt-3" size="sm" href={t.recordingHref}>
                <PlayCircle className="size-3.5" aria-hidden="true" /> Open the recordings page
                (purpose asked and logged)
              </ButtonLink>
            )}
            {t.recordingHidden && (
              <p className="mt-3 text-caption text-ink-500">
                A recording is linked; playback needs recording access.
              </p>
            )}
            {t.resolution && (
              <p className="mt-3 flex items-center gap-1.5 text-small text-ink-700">
                <Lock className="size-3.5 text-ink-500" aria-hidden="true" /> {t.resolution.code} by{" "}
                {t.resolution.by}, {when(t.resolution.at)}
                {t.resolution.note && ` · ${t.resolution.note}`}
              </p>
            )}
          </FCard>
          <Checklist t={t} can={can} act={act} busy={busy} />
          <Notes t={t} can={d.canWork && !closed} act={act} busy={busy} />
          <Attachments t={t} can={can} clinical={d.can.clinical} act={act} />
          {(d.messages.length > 0 || d.approvals.length > 0) && (
            <FCard
              icon={StickyNote}
              title="Linked messages and approvals"
              flush
              action={<DemoNote>Simulated delivery</DemoNote>}
            >
              <ul className="divide-y divide-border">
                {d.messages.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-5 py-2.5 text-small">
                    <span className="font-mono text-caption text-ink-500">{m.ref}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {m.subject} · {m.channel} to {m.recipient}
                    </span>
                    <Tag tone={messageTone[m.state]}>{m.state}</Tag>
                  </li>
                ))}
                {d.approvals.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-5 py-2.5 text-small">
                    <span className="font-mono text-caption text-ink-500">{a.ref}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {a.workflow} · {a.approver}
                    </span>
                    <Tag tone={approvalTone[a.status]}>{a.status}</Tag>
                  </li>
                ))}
              </ul>
            </FCard>
          )}
        </div>
        <div className="flex flex-col gap-6 xl:sticky xl:top-20 xl:col-span-4 xl:self-start">
          <Actions d={d} can={can} act={act} busy={busy} />
          <FCard icon={History} title="Status history" sub="Every change, with who and when" flush>
            <ol className="max-h-[480px] divide-y divide-border overflow-y-auto">
              {[...t.history].reverse().map((h, i) => (
                <li key={i} className="px-5 py-2.5 text-caption">
                  <span className="block text-ink-900">{h.action}</span>
                  <span className="text-ink-500">
                    {h.by} · {when(h.at)}
                  </span>
                </li>
              ))}
            </ol>
          </FCard>
        </div>
      </div>
    </>
  );
}

type Act = (action: Record<string, unknown>, ok: string) => Promise<boolean>;

function Checklist({ t, can, act, busy }: { t: TaskDto; can: boolean; act: Act; busy: string }) {
  if (!t.checklist.length) return null;
  const done = t.checklist.filter((c) => c.done).length;
  return (
    <FCard
      icon={ClipboardList}
      title="Checklist"
      sub={`${done} of ${t.checklist.length} done · required items must be ticked before completion`}
      flush
    >
      <ul className="divide-y divide-border">
        {t.checklist.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              disabled={!can || Boolean(busy)}
              onClick={() =>
                act({ type: "check", itemId: c.id, done: !c.done }, c.done ? "Unticked" : "Ticked")
              }
              className="flex w-full cursor-pointer items-start gap-3 px-5 py-3 text-left hover:bg-canvas disabled:cursor-default disabled:hover:bg-transparent"
              aria-pressed={c.done}
            >
              {c.done ? (
                <Check className="mt-0.5 size-4 flex-none text-healthy" aria-hidden="true" />
              ) : (
                <Circle className="mt-0.5 size-4 flex-none text-ink-400" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-small",
                    c.done ? "text-ink-500 line-through" : "text-ink-900",
                  )}
                >
                  {c.label}
                </span>
                {c.done && c.by && (
                  <span className="text-caption text-ink-500">
                    {c.by} · {when(c.at)}
                  </span>
                )}
              </span>
              {c.required && !c.done && <Tag tone="outline">Required</Tag>}
            </button>
          </li>
        ))}
      </ul>
    </FCard>
  );
}

function Notes({ t, can, act, busy }: { t: TaskDto; can: boolean; act: Act; busy: string }) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  return (
    <FCard icon={StickyNote} title="Action notes" sub="Time-stamped; edits keep the earlier text">
      <ul className="flex flex-col gap-3">
        {t.notes.length === 0 && <li className="text-small text-ink-500">No notes yet.</li>}
        {t.notes.map((n) => (
          <li key={n.id} className="rounded-control border border-border px-3 py-2">
            <p className="text-caption text-ink-500">
              {n.by} · {when(n.at)}
              {n.edited && " · edited"}
            </p>
            {editing?.id === n.id ? (
              <div className="mt-1 flex flex-col gap-2">
                <textarea
                  className={textArea}
                  value={editing.text}
                  onChange={(e) => setEditing({ id: n.id, text: e.target.value })}
                  aria-label="Edit note"
                />
                <span className="flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={async () => {
                      if (
                        await act(
                          { type: "edit-note", noteId: n.id, text: editing.text },
                          "Note updated",
                        )
                      )
                        setEditing(null);
                    }}
                  >
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </span>
              </div>
            ) : (
              <p className="mt-1 text-small whitespace-pre-wrap text-ink-900">{n.text}</p>
            )}
            {can && editing?.id !== n.id && (
              <button
                type="button"
                className="mt-1 cursor-pointer text-caption font-semibold text-accent"
                onClick={() => setEditing({ id: n.id, text: n.text })}
              >
                Edit
              </button>
            )}
          </li>
        ))}
      </ul>
      {can && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            className={textArea}
            maxLength={10000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What did you do or find?"
            aria-label="New note"
          />
          <span>
            <Button
              size="sm"
              disabled={!text.trim()}
              loading={busy === "Note added"}
              onClick={async () => {
                if (await act({ type: "note", text }, "Note added")) setText("");
              }}
            >
              Add note
            </Button>
          </span>
        </div>
      )}
    </FCard>
  );
}

function Attachments({
  t,
  can,
  clinical,
  act,
}: {
  t: TaskDto;
  can: boolean;
  clinical: boolean;
  act: Act;
}) {
  const [restricted, setRestricted] = useState(false);
  return (
    <FCard
      icon={Paperclip}
      title="Attachments"
      sub="PDF, images, Word or text up to 10 MB · file contents aren't stored in this demo"
    >
      <ul className="flex flex-col gap-1.5 text-small">
        {t.attachments.length === 0 && <li className="text-ink-500">None.</li>}
        {t.attachments.map((a, i) => (
          <li key={i} className="flex items-center gap-2">
            <Paperclip className="size-3.5 text-ink-500" aria-hidden="true" />
            {a.name}{" "}
            <span className="text-caption text-ink-500">{Math.ceil(a.size / 1024)} KB</span>
            {a.restricted && <Tag tone="outline">Restricted</Tag>}
          </li>
        ))}
      </ul>
      {can && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-control border border-border-strong px-3 py-1.5 text-caption font-semibold text-ink-900 hover:bg-sunken">
            Attach a file
            <input
              type="file"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f)
                  void act(
                    {
                      type: "attach",
                      name: f.name,
                      size: f.size,
                      mime: f.type || "application/octet-stream",
                      restricted,
                    },
                    "Attached",
                  );
                e.target.value = "";
              }}
            />
          </label>
          {clinical && (
            <label className="flex items-center gap-1.5 text-caption text-ink-700">
              <input
                type="checkbox"
                checked={restricted}
                onChange={(e) => setRestricted(e.target.checked)}
              />{" "}
              Clinically restricted
            </label>
          )}
        </div>
      )}
    </FCard>
  );
}

function Actions({ d, can, act, busy }: { d: Detail; can: boolean; act: Act; busy: string }) {
  const t = d.task;
  const [to, setTo] = useState<TaskStatus | "">("");
  const [note, setNote] = useState("");
  const [code, setCode] = useState("Completed");
  const [team, setTeam] = useState<string>(t.team);
  const [who, setWho] = useState(t.assigneeId ?? "");
  const [why, setWhy] = useState("");
  const [prio, setPrio] = useState<string>(t.priority);
  const [prioWhy, setPrioWhy] = useState("");
  const [reopen, setReopen] = useState("");
  const moves = taskMoves[t.status];
  const open = t.checklist.filter((c) => c.required && !c.done);
  const eligible = d.staff.filter((s) => s.teams.includes(team));

  if (isClosed(t.status)) {
    return (
      <FCard icon={Lock} title="Closed" sub="Closed tasks can't be edited. History is kept.">
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-caption font-semibold text-ink-700">
            Reason to reopen
            <input
              value={reopen}
              onChange={(e) => setReopen(e.target.value)}
              className="h-9 rounded-control border border-border-strong px-2 text-small font-normal"
            />
          </label>
          <Button
            disabled={reopen.length < 5}
            loading={busy === "Reopened"}
            onClick={() => act({ type: "reopen", reason: reopen }, "Reopened")}
          >
            Reopen task
          </Button>
          <p className="text-caption text-ink-500">Needs the team lead or an Operations Manager.</p>
        </div>
      </FCard>
    );
  }
  if (!can) {
    return (
      <FCard
        icon={Lock}
        title="View only"
        sub={`Only the ${t.team} team or the assignee can change this task.`}
      >
        <p className="text-small text-ink-700">
          Ask the {t.team} team if something needs to change.
        </p>
      </FCard>
    );
  }
  return (
    <FCard icon={UserRound} title="Next step">
      <div className="flex flex-col gap-4">
        {t.assigneeName && !t.acknowledged && d.task.assigneeId && (
          <Button
            variant="primary"
            loading={busy === "Acknowledged"}
            onClick={() => act({ type: "acknowledge" }, "Acknowledged")}
          >
            Acknowledge (assigned to {t.assigneeName})
          </Button>
        )}
        {t.acknowledged && (
          <p className="text-caption text-ink-500">
            Acknowledged by {t.acknowledged.by}, {when(t.acknowledged.at)}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <span className="text-caption font-semibold text-ink-700">Move to</span>
          <div className="flex flex-wrap gap-1.5">
            {moves.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setTo(m)}
                className={cn(
                  "h-8 cursor-pointer rounded-control border px-2.5 text-caption font-semibold",
                  to === m
                    ? "border-accent bg-accent-tint text-accent"
                    : "border-border-strong text-ink-700 hover:bg-canvas",
                )}
              >
                {m}
              </button>
            ))}
          </div>
          {to && (
            <div className="flex flex-col gap-2 rounded-control border border-border p-3">
              {(to === "Completed" || to === "Cancelled") && (
                <Select
                  aria-label="Resolution code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                >
                  {resolutionCodes.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              )}
              <textarea
                className={textArea}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                aria-label="Note for this change"
                placeholder={
                  to === "On Hold"
                    ? "Hold reason (required)"
                    : to === "Escalated"
                      ? "Why escalate? (required)"
                      : t.status === "Escalated"
                        ? "Escalation outcome (required)"
                        : "Note (optional)"
                }
              />
              {to === "Completed" && open.length > 0 && (
                <p className="text-caption font-semibold text-over">
                  Blocked: {open.length} required checklist item(s) still open.
                </p>
              )}
              {to === "In Progress" && !t.assigneeId && (
                <p className="text-caption font-semibold text-over">
                  Blocked: assign the task first.
                </p>
              )}
              <Button
                variant="primary"
                disabled={
                  (to === "Completed" && open.length > 0) || (to === "In Progress" && !t.assigneeId)
                }
                loading={busy === `Moved to ${to}`}
                onClick={async () => {
                  if (
                    await act(
                      {
                        type: "move",
                        to,
                        note,
                        ...(to === "Completed" || to === "Cancelled" ? { code } : {}),
                      },
                      `Moved to ${to}`,
                    )
                  ) {
                    setTo("");
                    setNote("");
                  }
                }}
              >
                Move to {to}
              </Button>
            </div>
          )}
        </div>
        {d.can.teams.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <span className="text-caption font-semibold text-ink-700">Assign</span>
            <Select
              aria-label="Team"
              value={team}
              onChange={(e) => {
                setTeam(e.target.value);
                setWho("");
              }}
            >
              {teams.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
            <Select aria-label="Person" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">Unassigned (team queue)</option>
              {eligible.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            {t.assigneeId && who && who !== t.assigneeId && (
              <input
                value={why}
                onChange={(e) => setWhy(e.target.value)}
                placeholder="Reason for reassigning (required)"
                aria-label="Reason for reassigning"
                className="h-9 rounded-control border border-border-strong px-2 text-small"
              />
            )}
            <Button
              disabled={
                (team === t.team && who === (t.assigneeId ?? "")) ||
                Boolean(t.assigneeId && who && who !== t.assigneeId && why.length < 3)
              }
              loading={busy === "Assignment saved"}
              onClick={() =>
                act(
                  { type: "assign", team, assigneeId: who || null, reason: why },
                  "Assignment saved",
                )
              }
            >
              Save assignment
            </Button>
            <p className="text-caption text-ink-500">
              Only people in the team are listed. The previous and new owner are notified.
            </p>
          </div>
        )}
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <span className="text-caption font-semibold text-ink-700">Priority</span>
          <Select aria-label="Priority" value={prio} onChange={(e) => setPrio(e.target.value)}>
            {priorities.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
          {prio !== t.priority && (
            <input
              value={prioWhy}
              onChange={(e) => setPrioWhy(e.target.value)}
              placeholder={
                prio === "Urgent" ? "Why urgent? (required, opens an escalation)" : "Reason"
              }
              aria-label="Priority reason"
              className="h-9 rounded-control border border-border-strong px-2 text-small"
            />
          )}
          <Button
            disabled={prio === t.priority || (prio === "Urgent" && prioWhy.length < 5)}
            onClick={() =>
              act({ type: "priority", priority: prio, reason: prioWhy }, "Priority changed")
            }
          >
            Change priority
          </Button>
        </div>
      </div>
    </FCard>
  );
}

/** A therapist's own tasks, on their workspace. */
export function MyTasks() {
  const { data, error, loading, reload } = useResource<{ tasks: TaskDto[] }>(
    "/api/care/operations/mine",
    (e) => e.type === "care",
  );
  const now = useNow() ?? 0;
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-96" />;
  const open = data.tasks.filter((t) => !isClosed(t.status));
  const closed = data.tasks.filter((t) => isClosed(t.status)).slice(0, 10);
  return (
    <>
      <PageHeader
        eyebrow="Live care"
        title="My tasks"
        description={`${open.length} open · visit preparation, notes to sign, reports due`}
        actions={<LiveBadge />}
      />
      {open.length === 0 ? (
        <p className="rounded-card border border-dashed border-border-strong px-6 py-10 text-center text-small text-ink-700">
          No open tasks. Rules add them here when a visit, note or report needs you.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {open.map((t) => (
            <li key={t.id}>
              <a
                href={`/therapist/tasks/${t.id}`}
                className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface px-5 py-4 hover:no-underline hover:shadow-lift"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-small font-semibold text-ink-900">{t.title}</span>
                  <span className="text-caption text-ink-500">
                    <span className="font-mono">{t.ref}</span> · {t.category} · due {when(t.dueAt)}
                    {now ? ` (${dueIn(t.dueAt, now)})` : ""}
                  </span>
                </span>
                {t.source === "Rule" && <RuleMark>{t.ruleCode ?? "Rule"}</RuleMark>}
                <Tag tone={taskTone[t.status]}>{t.status}</Tag>
              </a>
            </li>
          ))}
        </ul>
      )}
      {closed.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-section font-semibold text-ink-900">Recently closed</h2>
          <ul className="divide-y divide-border rounded-card border border-border bg-surface">
            {closed.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-2.5 text-small">
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <Tag tone={taskTone[t.status]}>{t.status}</Tag>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
