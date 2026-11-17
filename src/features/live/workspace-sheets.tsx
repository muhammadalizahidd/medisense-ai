"use client";

import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/live/client";
import type { WorkspaceAction, WorkspaceDto, WsVisit } from "@/lib/live/workspace";
import { textArea } from "./ops-bits";

/** Posts a workspace action; a toast either way. Returns null on failure. */
export async function wsAction<T = Record<string, unknown>>(
  body: WorkspaceAction,
  ok?: string,
  detail?: (res: T) => string | undefined,
) {
  try {
    const res = await api<T>("/api/care/workspace", { body });
    if (ok) toast(ok, { tone: "success", detail: detail?.(res) });
    return res;
  } catch (e) {
    toast("Couldn't do that", { tone: "error", detail: e instanceof Error ? e.message : "" });
    return null;
  }
}

type Done = () => void;

export function FollowUpSheet({
  visit,
  onClose,
  onDone,
}: {
  visit: WsVisit;
  onClose: Done;
  onDone: Done;
}) {
  const suggested = new Date(new Date(visit.start).getTime() + 7 * 86_400_000);
  const [reason, setReason] = useState(
    visit.purpose === "Initial Assessment"
      ? "Assessment continues: complete the remaining sections at the next visit."
      : "",
  );
  const [date, setDate] = useState(suggested.toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    const res = await wsAction<{ ref: string | null }>(
      {
        type: "follow-up",
        visitId: visit.id,
        reason,
        dueAt: new Date(`${date}T09:00:00+10:00`).toISOString(),
      },
      "Follow-up request sent to scheduling",
      (r) => (r.ref ? `${r.ref} is a draft for the scheduling team to book.` : undefined),
    );
    setBusy(false);
    if (res) {
      onDone();
      onClose();
    }
  }
  return (
    <Sheet
      title="Request a follow-up"
      description={`${visit.clientName} · ${visit.ref}. This creates a draft task; the scheduling team books it and checks for conflicts.`}
      onClose={onClose}
      footer={
        <Button variant="primary" loading={busy} disabled={reason.trim().length < 3} onClick={send}>
          Send request
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Recommended date" hint="Suggested: one week after this visit">
          <input
            type="date"
            className={inputClass}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Reason">
          <textarea
            className={textArea}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <p className="text-caption text-ink-500">Owner: Scheduling team · Linked to {visit.ref}</p>
      </div>
    </Sheet>
  );
}

export function SupervisorSheet({
  target,
  onClose,
  onDone,
  supervisor,
}: {
  target: { visitId: string | null; assessmentId: string | null; label: string };
  onClose: Done;
  onDone: Done;
  supervisor: string | null;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    const res = await wsAction<{ ref: string | null; owner: string }>(
      {
        type: "supervisor-review",
        visitId: target.visitId,
        assessmentId: target.assessmentId,
        note,
      },
      "Supervisor review requested",
      (r) => `${r.ref ?? "Task"} created, owner ${r.owner}. Not approved until they respond.`,
    );
    setBusy(false);
    if (res) {
      onDone();
      onClose();
    }
  }
  return (
    <Sheet
      title="Request supervisor review"
      description={`${target.label}. A linked task goes to ${supervisor ?? "the clinical lead"}; requesting a review doesn't mark anything clinically approved.`}
      onClose={onClose}
      footer={
        <Button variant="primary" loading={busy} disabled={note.trim().length < 3} onClick={send}>
          Send request
        </Button>
      }
    >
      <Field label="What would you like reviewed?">
        <textarea className={textArea} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Sheet>
  );
}

export function MessageSheet({
  ws,
  clientId,
  onClose,
}: {
  ws: WorkspaceDto;
  clientId: string | null;
  onClose: Done;
}) {
  const [recipient, setRecipient] = useState("");
  const [patient, setPatient] = useState(clientId ?? "");
  const [sensitivity, setSensitivity] = useState<"Routine" | "Clinical Restricted">("Routine");
  const [text, setText] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const to = ws.recipients.find((r) => r.id === recipient);
  const about = ws.clients.find((c) => c.id === patient);
  async function send() {
    setBusy(true);
    const res = await wsAction(
      { type: "message", recipientId: recipient, clientId: patient || null, sensitivity, text },
      `Message sent to ${to?.name ?? "the care team"}`,
    );
    setBusy(false);
    if (res) onClose();
  }
  return (
    <Sheet
      title="Send a care-team message"
      description="Secure and internal. Only permitted staff can receive it; patients never see it."
      onClose={onClose}
      footer={
        confirm ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Back
            </Button>
            <Button variant="primary" loading={busy} onClick={send}>
              Confirm and send
            </Button>
          </div>
        ) : (
          <Button
            variant="primary"
            disabled={!recipient || text.trim().length < 3}
            onClick={() => setConfirm(true)}
          >
            Review message
          </Button>
        )
      }
    >
      {confirm ? (
        <div className="flex flex-col gap-2 text-small">
          <p>
            To <strong>{to?.name}</strong> ({to?.role})
          </p>
          <p>About: {about ? about.name : "no particular patient"}</p>
          <p>Sensitivity: {sensitivity}</p>
          <p className="rounded-control border border-border bg-sunken p-3 whitespace-pre-wrap">
            {text}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="To">
            <Select value={recipient} onChange={(e) => setRecipient(e.target.value)}>
              <option value="">Choose a person</option>
              {ws.recipients.map((r) => (
                <option key={r.id} value={r.id}>
                  {`${r.name} · ${r.role}`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Patient" hint="Only patients on your caseload">
            <Select value={patient} onChange={(e) => setPatient(e.target.value)}>
              <option value="">No particular patient</option>
              {ws.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-col gap-1">
            <span className="text-caption font-semibold text-ink-700">Sensitivity</span>
            <Segmented
              label="Sensitivity"
              value={sensitivity}
              onChange={setSensitivity}
              options={[
                { id: "Routine", label: "Routine" },
                { id: "Clinical Restricted", label: "Clinical restricted" },
              ]}
            />
          </div>
          <Field label="Message">
            <textarea className={textArea} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        </div>
      )}
    </Sheet>
  );
}

export function SafetySheet({
  visit,
  onClose,
  onDone,
}: {
  visit: WsVisit | null;
  onClose: Done;
  onDone: Done;
}) {
  const [what, setWhat] = useState("");
  const [danger, setDanger] = useState(false);
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    const res = await wsAction<{ ref: string | null }>(
      { type: "safety", visitId: visit?.id ?? null, what, immediateDanger: danger },
      "Safety issue sent to clinical leadership",
      (r) => `${r.ref ?? "Incident"} is escalated for a human decision.`,
    );
    setBusy(false);
    if (res) {
      onDone();
      onClose();
    }
  }
  return (
    <Sheet
      title="Report a safety issue"
      description={visit ? `${visit.clientName} · ${visit.ref}` : "Not linked to a visit"}
      onClose={onClose}
      footer={
        <Button variant="danger" loading={busy} disabled={what.trim().length < 5} onClick={send}>
          Report and escalate
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="flex gap-2 rounded-card border border-over bg-over-bg p-3 text-small text-over">
          <ShieldAlert className="mt-0.5 size-4 flex-none" aria-hidden="true" />
          <span>
            <strong>Emergency protocol comes first.</strong> If anyone is in immediate danger, call
            000 and leave the site, then report here.
          </span>
        </p>
        <label className="flex items-center gap-2 text-small">
          <input type="checkbox" checked={danger} onChange={(e) => setDanger(e.target.checked)} />
          Someone was in immediate danger
        </label>
        <Field label="What happened">
          <textarea className={textArea} value={what} onChange={(e) => setWhat(e.target.value)} />
        </Field>
        <p className="text-caption text-ink-500">
          Goes to the clinical lead as a restricted incident. It is never resolved by automation.
        </p>
      </div>
    </Sheet>
  );
}

/** AT-24: a visit with blockers can't start; say why and what fixes it. */
export function StartCheckSheet({
  visit,
  onClose,
  onStart,
}: {
  visit: WsVisit;
  onClose: Done;
  onStart: Done;
}) {
  const [reviewed, setReviewed] = useState(false);
  const blocked = visit.blockers.length > 0;
  const needsReview = visit.readiness === "Safety Review Required";
  return (
    <Sheet
      title={`Before you start: ${visit.ref}`}
      description={`${visit.clientName} · ${visit.purpose} · ${visit.location}`}
      onClose={onClose}
      footer={
        <div className="flex flex-col items-end gap-1">
          <Button
            variant="primary"
            disabled={blocked || (needsReview && !reviewed)}
            onClick={onStart}
          >
            Start visit
          </Button>
          {blocked && (
            <span className="text-caption text-ink-500">Resolve the items above to start.</span>
          )}
        </div>
      }
    >
      <ul className="flex flex-col gap-3">
        {visit.blockers.map((b) => (
          <li key={b.reason} className="rounded-card border border-over bg-over-bg p-3 text-small">
            <p className="font-semibold text-over">{b.reason}</p>
            <p className="mt-1 text-ink-700">{b.remedy}</p>
          </li>
        ))}
        {needsReview && (
          <li className="rounded-card border border-border p-3 text-small">
            <p className="font-semibold">A precaution is recorded for this patient.</p>
            <p className="mt-1 text-ink-700">
              Read it in the patient record. On arrival, confirm identity, who is present and that
              it is safe to proceed.
            </p>
            <label className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              I have read the precaution
            </label>
          </li>
        )}
        {!blocked && !needsReview && (
          <li className="rounded-card border border-healthy-bg bg-healthy-bg p-3 text-small">
            Readiness checks are complete. You still confirm identity and safety on arrival.
          </li>
        )}
      </ul>
    </Sheet>
  );
}
