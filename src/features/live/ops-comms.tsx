"use client";

import { ArrowUpRight, Inbox, Lock, Mail, MessageSquareText, History } from "lucide-react";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { RecordCard, RecordPopup } from "@/components/ui/record-popup";
import { Tag } from "@/components/ui/tag";
import {
  approvalWorkflows,
  hasSensitiveText,
  messageStates,
  renderTemplate,
  templates,
  type ApprovalDto,
  type MessageDto,
  type OpsHubDto,
} from "@/lib/live/operations";
import { cn } from "@/lib/cn";
import { EmptyNote } from "./bits";
import { FCard, th, td } from "./funding-bits";
import {
  DemoNote,
  approvalTone,
  messageTone,
  ops,
  textArea,
  when,
  tableBox,
  tableHead,
  TableFoot,
} from "./ops-bits";

/* ------------------------------------------------------------------ approvals (OP-09) */

export function ApprovalsTab({ hub, onDone }: { hub: OpsHubDto; onDone: () => void }) {
  const [view, setView] = useState<"mine" | "pending" | "all">("mine");
  const [workflow, setWorkflow] = useState("");
  const [open, setOpen] = useState<ApprovalDto | null>(null);
  const list = hub.approvals.filter(
    (a) =>
      (view === "all" ||
        (view === "mine"
          ? a.canDecide
          : a.status === "Pending" || a.status === "Changes requested")) &&
      (!workflow || a.workflow === workflow),
  );
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-lift">
        {(["mine", "pending", "all"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={cn(
              "h-8 cursor-pointer rounded-control px-3 text-small",
              view === v
                ? "bg-accent-tint font-semibold text-accent"
                : "text-ink-700 hover:bg-canvas",
            )}
          >
            {v === "mine"
              ? `For me to decide · ${hub.approvals.filter((a) => a.canDecide).length}`
              : v === "pending"
                ? "All pending"
                : "History"}
          </button>
        ))}
        <div className="ml-auto w-72">
          <Select
            aria-label="Workflow"
            className="h-9"
            value={workflow}
            onChange={(e) => setWorkflow(e.target.value)}
          >
            <option value="">All workflows</option>
            {approvalWorkflows.map((w) => (
              <option key={w}>{w}</option>
            ))}
          </Select>
        </div>
      </div>
      {list.length === 0 ? (
        <EmptyNote
          title={view === "mine" ? "Nothing waiting for your decision." : "No approvals match."}
        >
          Approvals appear when a rule, an escalation or a colleague needs a named decision.
        </EmptyNote>
      ) : (
        <div className={tableBox}>
          <table className="w-full text-left text-small">
            <thead className={tableHead}>
              <tr>
                <th className={th}>Request</th>
                <th className={th}>Workflow</th>
                <th className={th}>Approver</th>
                <th className={th}>Raised by</th>
                <th className={th}>SLA</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((a) => (
                <tr key={a.id} className="hover:bg-canvas">
                  <td className={cn(td, "max-w-96")}>
                    <button
                      type="button"
                      onClick={() => setOpen(a)}
                      className="cursor-pointer text-left font-semibold text-ink-900 hover:text-accent"
                    >
                      {a.restricted && (
                        <Lock
                          className="mr-1 inline size-3.5 text-ink-500"
                          aria-label="Restricted"
                        />
                      )}
                      {a.title}
                    </button>
                    <span className="block truncate text-caption text-ink-500">
                      <span className="font-mono">{a.ref}</span> · {a.reason}
                    </span>
                  </td>
                  <td className={td}>{a.workflow}</td>
                  <td className={td}>{a.approver}</td>
                  <td className={td}>
                    <span className="block">{a.initiator}</span>
                    <span className="text-caption text-ink-500">{when(a.createdAt)}</span>
                  </td>
                  <td className={cn(td, a.overdue ? "font-semibold text-over" : "")}>
                    {a.slaHours} business h
                    <span className="block text-caption font-normal text-ink-500">
                      by {when(a.dueAt)}
                    </span>
                  </td>
                  <td className={td}>
                    <Tag tone={approvalTone[a.status]}>{a.status}</Tag>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.length > 0 && (
        <TableFoot shown={list.length} total={hub.approvals.length} noun="approvals" />
      )}
      {open && <ApprovalSheet a={open} onClose={() => setOpen(null)} onDone={onDone} />}
    </>
  );
}

function ApprovalSheet({
  a,
  onClose,
  onDone,
}: {
  a: ApprovalDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState("");
  const url = `/api/care/operations/approvals/${a.id}`;
  const decide = async (decision: string) => {
    setBusy(decision);
    const res = await ops(
      url,
      { type: "decide", decision, note },
      `${decision}`,
      "Recorded with your name and the time",
    );
    setBusy("");
    if (res) {
      onDone();
      onClose();
    }
  };
  return (
    <RecordPopup
      title={a.ref}
      description={a.title}
      onClose={onClose}
      meta={
        <>
          <Tag tone={approvalTone[a.status]}>{a.status}</Tag>
          <Tag tone="outline">{a.workflow}</Tag>
        </>
      }
      footer={
        a.canDecide ? (
          <>
            <Button
              variant="primary"
              loading={busy === "Approved"}
              onClick={() => decide("Approved")}
            >
              Approve
            </Button>
            <Button
              loading={busy === "Changes requested"}
              onClick={() => decide("Changes requested")}
            >
              Request changes
            </Button>
            <Button
              variant="danger"
              loading={busy === "Rejected"}
              onClick={() => decide("Rejected")}
            >
              Reject
            </Button>
          </>
        ) : (
          <span className="text-caption text-ink-500">
            {a.status === "Pending" || a.status === "Changes requested"
              ? `Waiting for the ${a.approver}. You can comment.`
              : `Decided: ${a.status}.`}
          </span>
        )
      }
    >
      <div className="flex flex-col gap-4 text-small">
        <dl className="grid grid-cols-2 gap-3">
          <div>
            <dt className="text-caption font-semibold text-ink-500">Approver</dt>
            <dd>{a.approver}</dd>
          </div>
          <div>
            <dt className="text-caption font-semibold text-ink-500">Raised by</dt>
            <dd>{a.initiator}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-caption font-semibold text-ink-500">Escalation reason</dt>
            <dd>{a.reason}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-caption font-semibold text-ink-500">Completion criteria</dt>
            <dd>{a.criteria}</dd>
          </div>
        </dl>
        {a.related.href && (
          <ButtonLink size="sm" variant="ghost" href={a.related.href}>
            Open {a.related.label} <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </ButtonLink>
        )}
        {a.canDecide && (
          <label className="flex flex-col gap-1 text-caption font-semibold text-ink-700">
            Decision note{" "}
            {a.workflow === "Clinical-risk referral"
              ? "(clinical rationale, required)"
              : "(required to reject or request changes)"}
            <textarea className={textArea} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        )}
        <div>
          <p className="mb-1 text-caption font-semibold text-ink-500">Decision history</p>
          {a.decisions.length === 0 ? (
            <p className="text-caption text-ink-500">No decision yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {a.decisions.map((d, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 rounded-control border border-border px-3 py-2"
                >
                  <Lock className="mt-0.5 size-3.5 text-ink-500" aria-hidden="true" />
                  <span>
                    <span className="font-semibold">{d.decision}</span> by {d.by}, {when(d.at)}
                    {d.note && <span className="block text-caption text-ink-700">{d.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-1 text-caption font-semibold text-ink-500">Comments</p>
          <ul className="flex flex-col gap-1.5">
            {a.comments.map((c, i) => (
              <li key={i} className="text-caption text-ink-700">
                <span className="font-semibold text-ink-900">{c.by}</span> · {when(c.at)}: {c.text}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment"
              aria-label="Comment"
              className="h-9 flex-1 rounded-control border border-border-strong px-2 text-small"
            />
            <Button
              size="sm"
              disabled={!comment.trim()}
              onClick={async () => {
                if (await ops(url, { type: "comment", text: comment }, "Comment added")) {
                  setComment("");
                  onDone();
                }
              }}
            >
              Add
            </Button>
          </div>
        </div>
      </div>
    </RecordPopup>
  );
}

/* ------------------------------------------------------------------ notifications (OP-08) */

const sample: Record<string, string> = {
  preferred_name: "Casey",
  referral_number: "REF-MRN-15112026-0001",
  appointment_date: "Tue, 17 Nov",
  appointment_time: "10:30 am",
  channel: "SMS",
  location_type: "home visit",
};

export function NotificationsTab({ hub, onDone }: { hub: OpsHubDto; onDone: () => void }) {
  const [state, setState] = useState("");
  const [tpl, setTpl] = useState(templates[0]?.id ?? "");
  const [drop, setDrop] = useState<string[]>(["appointment_time"]);
  const [open, setOpen] = useState<MessageDto | null>(null);
  const list = hub.messages.filter((m) => !state || m.state === state);
  const t = templates.find((x) => x.id === tpl) ?? templates[0];
  const vars = Object.fromEntries(Object.entries(sample).filter(([k]) => !drop.includes(k)));
  const preview = t ? renderTemplate(t.body, vars) : { text: "", missing: [] };
  const counts = Object.fromEntries(
    messageStates.map((s) => [s, hub.messages.filter((m) => m.state === s).length]),
  );
  return (
    <>
      <div className="grid items-stretch gap-6 xl:grid-cols-12">
        <FCard
          icon={MessageSquareText}
          title="Template preview"
          sub="Plain language, versioned, no clinical narrative"
          className="xl:col-span-5"
        >
          <div className="flex flex-col gap-3">
            <Select aria-label="Template" value={tpl} onChange={(e) => setTpl(e.target.value)}>
              {templates.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.category} · {x.channel} · v{x.version}
                </option>
              ))}
            </Select>
            {t && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  <Tag tone={t.approved ? "healthy" : "watch"}>
                    {t.approved ? "Approved for sending" : "Needs approval each time"}
                  </Tag>
                  <Tag tone="outline">{t.channel}</Tag>
                  <span className="font-mono text-caption text-ink-500">{t.id}</span>
                </div>
                <div className="rounded-control bg-sunken p-3 text-small text-ink-900">
                  <p className="font-semibold">{renderTemplate(t.subject, vars).text}</p>
                  <p className="mt-1">{preview.text}</p>
                </div>
                {preview.missing.length > 0 && (
                  <p className="text-caption font-semibold text-watch">
                    Missing: {preview.missing.join(", ").replace(/_/g, " ")}. A person completes it
                    before it can be sent.
                  </p>
                )}
                {t.channel === "SMS" && hasSensitiveText(preview.text) && (
                  <p className="text-caption font-semibold text-over">
                    Blocked: SMS can carry only a minimal notice.
                  </p>
                )}
                <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
                  <legend className="mb-1 text-caption font-semibold text-ink-500">
                    Try with these variables on file
                  </legend>
                  {Object.keys(sample).map((k) => (
                    <label key={k} className="flex items-center gap-1.5 text-caption text-ink-700">
                      <input
                        type="checkbox"
                        checked={!drop.includes(k)}
                        onChange={(e) =>
                          setDrop(e.target.checked ? drop.filter((d) => d !== k) : [...drop, k])
                        }
                      />
                      {k.replace(/_/g, " ")}
                    </label>
                  ))}
                </fieldset>
              </>
            )}
          </div>
        </FCard>
        <FCard
          icon={Inbox}
          title="Delivery states"
          sub="Every send is simulated; nothing leaves the system"
          className="xl:col-span-7"
          action={<DemoNote>Simulated</DemoNote>}
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {messageStates.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setState(state === s ? "" : s)}
                className={cn(
                  "flex cursor-pointer flex-col rounded-control border px-3 py-2 text-left",
                  state === s ? "border-accent bg-accent-tint" : "border-border hover:bg-canvas",
                )}
              >
                <span className="text-caption text-ink-500">{s}</span>
                <span className="type-display text-h2 leading-tight text-ink-900">{counts[s]}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-caption text-ink-500">
            Reminders respect contact consent, quiet hours ({hub.settings.quietStart} to{" "}
            {hub.settings.quietEnd}) and a cap of {hub.settings.reminderCapPerDay} a day per person.
            A message without an authorised recipient is suppressed and explained.
          </p>
        </FCard>
      </div>
      {list.length === 0 ? (
        <EmptyNote title="No messages in this state." />
      ) : (
        <div className={tableBox}>
          <table className="w-full text-left text-small">
            <thead className={tableHead}>
              <tr>
                <th className={th}>Message</th>
                <th className={th}>Recipient · authority</th>
                <th className={th}>Channel</th>
                <th className={th}>Related</th>
                <th className={th}>Created</th>
                <th className={th}>State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((m) => (
                <tr key={m.id} className="hover:bg-canvas">
                  <td className={cn(td, "max-w-96")}>
                    <button
                      type="button"
                      onClick={() => setOpen(m)}
                      className="cursor-pointer text-left font-semibold text-ink-900 hover:text-accent"
                    >
                      {m.subject}
                    </button>
                    <span className="block truncate text-caption text-ink-500">
                      <span className="font-mono">{m.ref}</span> · {m.category} v{m.templateVersion}
                    </span>
                  </td>
                  <td className={td}>
                    <span className="block">{m.recipient}</span>
                    <span
                      className={cn(
                        "text-caption",
                        m.authority === "Missing authority"
                          ? "font-semibold text-over"
                          : "text-ink-500",
                      )}
                    >
                      {m.recipientType} · {m.authority}
                    </span>
                  </td>
                  <td className={td}>{m.channel}</td>
                  <td className={td}>{m.related.label}</td>
                  <td className={td}>{when(m.createdAt)}</td>
                  <td className={td}>
                    <Tag tone={messageTone[m.state]}>
                      {m.state === "Sent" || m.state === "Delivered"
                        ? `${m.state} (simulated)`
                        : m.state}
                    </Tag>
                    {m.reason && (
                      <span className="mt-1 block max-w-60 text-caption text-ink-500">
                        {m.reason}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.length > 0 && (
        <TableFoot shown={list.length} total={hub.messages.length} noun="messages" />
      )}
      {open && <MessageSheet m={open} onClose={() => setOpen(null)} onDone={onDone} />}
    </>
  );
}

function MessageSheet({
  m,
  onClose,
  onDone,
}: {
  m: MessageDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const [body, setBody] = useState(m.body);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState("");
  const url = `/api/care/operations/messages/${m.id}`;
  const act = async (payload: Record<string, unknown>, label: string) => {
    setBusy(label);
    const res = await ops<{ state: string; reason: string }>(url, payload, label);
    setBusy("");
    if (res) {
      onDone();
      onClose();
    }
  };
  const editable = m.state === "Awaiting Approval" || m.state === "Draft";
  return (
    <RecordPopup
      title={m.ref}
      description={`${m.category} · ${m.channel} · to ${m.recipient}`}
      onClose={onClose}
      meta={
        <>
          <Tag tone={messageTone[m.state]}>{m.state}</Tag>
          <Tag tone={m.authority === "Missing authority" ? "over" : "outline"}>{m.authority}</Tag>
          <DemoNote>Simulated delivery</DemoNote>
        </>
      }
      aside={
        <RecordCard title="Delivery history" icon={History} flush={false}>
          <ol className="relative ml-2 border-l border-border pl-5">
            {[...m.history].reverse().map((h, i) => (
              <li key={i} className="relative pb-3 last:pb-0">
                <span
                  className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-surface bg-accent-fill"
                  aria-hidden="true"
                />
                <p className="text-small text-ink-900">
                  {h.state}
                  {h.note ? `: ${h.note}` : ""}
                </p>
                <p className="text-caption text-ink-500">{when(h.at)}</p>
              </li>
            ))}
          </ol>
        </RecordCard>
      }
      footer={
        <>
          {editable && (
            <Button
              variant="primary"
              loading={busy === "Approved and sent"}
              onClick={() => act({ type: "approve", body }, "Approved and sent")}
            >
              Approve and send
            </Button>
          )}
          {m.state === "Failed" && (
            <Button
              variant="primary"
              disabled={m.attempts >= 3}
              loading={busy === "Retried"}
              onClick={() => act({ type: "retry" }, "Retried")}
            >
              Retry ({m.attempts}/3)
            </Button>
          )}
          {m.state === "Queued" && (
            <Button
              loading={busy === "Released"}
              onClick={() => act({ type: "release" }, "Released")}
            >
              Send now
            </Button>
          )}
          {!["Delivered", "Sent", "Suppressed"].includes(m.state) && (
            <Button
              variant="danger"
              disabled={why.length < 3}
              loading={busy === "Suppressed"}
              onClick={() => act({ type: "suppress", reason: why }, "Suppressed")}
            >
              Suppress
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4 text-small">
        {m.reason && (
          <p className="rounded-control bg-sunken px-3 py-2 text-caption text-ink-700">
            {m.reason}
          </p>
        )}
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-caption font-semibold text-ink-500">
            <Mail className="size-3.5" aria-hidden="true" /> {m.subject}
          </p>
          {editable ? (
            <textarea
              className={textArea}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              aria-label="Message text"
            />
          ) : (
            <p className="rounded-control border border-border p-3">{m.body}</p>
          )}
          {m.missing.length > 0 && (
            <p className="mt-1 text-caption font-semibold text-watch">
              Fill in: {m.missing.join(", ").replace(/_/g, " ")}
            </p>
          )}
        </div>
        {!["Delivered", "Sent", "Suppressed"].includes(m.state) && (
          <label className="flex flex-col gap-1 text-caption font-semibold text-ink-700">
            Reason to suppress
            <input
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              className="h-9 rounded-control border border-border-strong px-2 text-small font-normal"
            />
          </label>
        )}
        {m.taskId && (
          <ButtonLink size="sm" variant="ghost" href={`/care/operations/tasks/${m.taskId}`}>
            Open the linked task <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </ButtonLink>
        )}
      </div>
    </RecordPopup>
  );
}
