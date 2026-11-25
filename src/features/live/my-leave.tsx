"use client";

import { CalendarPlus, CalendarX2 } from "lucide-react";
import { useState } from "react";
import { RuleMark } from "@/components/ai/provenance";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { api, useResource } from "@/lib/live/client";
import {
  leaveRules,
  leaveTypes,
  type LeaveBalanceDto,
  type LeaveType,
  type MyLeaveDto,
} from "@/lib/live/leave";
import { relativeTime } from "@/lib/live/time";
import { EmptyNote, ErrorNote, Panel, Skeleton } from "./bits";
import { LEAVE_STATUS_TONE, leaveRange } from "./leave-board";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function BalanceCard({ title, b }: { title: string; b: LeaveBalanceDto }) {
  const total = Math.max(b.entitlement, b.taken + b.booked + b.pending, 1);
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <p className="label-caps text-ink-500">{title}</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span
          className={cn("type-display text-h1", b.remaining < 0 ? "text-over" : "text-ink-900")}
        >
          {b.remaining}
        </span>
        <span className="text-small text-ink-500">days left of {b.entitlement}</span>
      </p>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
        <span className="bg-ink-700" style={{ width: pct(b.taken) }} />
        <span className="bg-available-dot" style={{ width: pct(b.booked) }} />
        <span className="bg-watch-dot" style={{ width: pct(b.pending) }} />
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-700">
        <span>{b.taken} taken</span>
        <span>{b.booked} booked</span>
        {b.pending > 0 && <span className="text-watch">{b.pending} waiting for a decision</span>}
      </p>
    </section>
  );
}

/** The clinician asks for leave; HR approves it, and only then do the days come off the diary. */
export function MyLeave() {
  const { data, error, loading, reload } = useResource<MyLeaveDto>(
    "/api/me/leave",
    (e) => e.type === "care",
  );
  const [type, setType] = useState<LeaveType>("Annual leave");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-96" />;
  const today = data.today;
  const start = from || today;
  const end = to && to >= start ? to : start;

  async function submit() {
    setBusy(true);
    setFormError(null);
    try {
      const r = await api<{ ref: string }>("/api/me/leave", {
        body: { type, from: start, to: end, note: note.trim() },
      });
      toast(`Leave requested (${r.ref}). You'll be notified when it's decided.`);
      setFrom("");
      setTo("");
      setNote("");
      reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't send the request.");
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(id: string) {
    try {
      await api("/api/me/leave/cancel", { body: { id } });
      toast("Request withdrawn");
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't withdraw the request.");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-2">
        <BalanceCard title="Annual leave" b={data.annual} />
        <BalanceCard title="Personal leave" b={data.personal} />
      </div>

      <Panel title="Request leave">
        <p className="-mt-2 mb-4 flex flex-wrap items-center gap-2 text-small text-ink-700">
          <RuleMark>Rule</RuleMark>
          Counted in your working days ({data.daysPerWeek} a week). The care team stops offering new
          visits once it&apos;s approved, and moves anything already booked.
        </p>
        <div role="radiogroup" aria-label="Type of leave" className="mb-4 flex flex-wrap gap-2">
          {leaveTypes.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              onClick={() => setType(t)}
              className={cn(
                "h-9 cursor-pointer rounded-full border px-4 text-small font-semibold transition-colors duration-140",
                type === t
                  ? "border-accent bg-accent-tint text-accent"
                  : "border-border-strong bg-surface text-ink-700 hover:bg-sunken",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-caption font-semibold text-ink-700">
            First day
            <input
              type="date"
              min={type === "Personal leave" ? undefined : today}
              value={start}
              onChange={(e) => setFrom(e.target.value)}
              className={`${inputClass} w-44`}
            />
          </label>
          <label className="flex flex-col gap-1 text-caption font-semibold text-ink-700">
            Last day
            <input
              type="date"
              min={start}
              value={end}
              onChange={(e) => setTo(e.target.value)}
              className={`${inputClass} w-44`}
            />
          </label>
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-caption font-semibold text-ink-700">
            Note for the approver (optional)
            <input
              value={note}
              maxLength={400}
              onChange={(e) => setNote(e.target.value)}
              placeholder="For example, cover arranged for Tuesday's group"
              className={inputClass}
            />
          </label>
        </div>
        {type === "Annual leave" && from && start < plusDays(today, leaveRules.noticeDays) && (
          <p className="mt-3 text-caption text-watch">
            Less than {leaveRules.noticeDays} days&apos; notice: it can still be approved, but
            visits may be hard to move.
          </p>
        )}
        {formError && (
          <p
            role="alert"
            className="mt-3 rounded-control bg-over-bg px-3 py-2 text-small text-over"
          >
            {formError}
          </p>
        )}
        <div className="mt-4">
          <Button variant="primary" disabled={busy} onClick={submit}>
            <CalendarPlus className="size-4" aria-hidden="true" />
            {busy ? "Sending…" : "Send request"}
          </Button>
        </div>
      </Panel>

      <Panel title="My requests">
        {data.requests.length === 0 ? (
          <EmptyNote title="No leave requested yet.">Requests and decisions appear here.</EmptyNote>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.requests.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-control border border-border px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-ink-900">
                    {leaveRange(r.from, r.to)}
                    <span className="font-mono text-caption font-normal text-ink-500">{r.ref}</span>
                  </p>
                  <p className="text-caption text-ink-500">
                    {r.type} · {plural(r.impact.workingDays, "working day")} · asked{" "}
                    {relativeTime(r.requestedAt)}
                  </p>
                  {r.status === "Pending" && r.impact.visits.length > 0 && (
                    <p className="mt-1 inline-flex items-center gap-1 text-caption text-watch">
                      <CalendarX2 className="size-3.5" aria-hidden="true" />
                      {plural(r.impact.visits.length, "booked visit")} on those days
                    </p>
                  )}
                  {r.decidedBy && r.status !== "Cancelled" && (
                    <p className="mt-1 text-caption text-ink-700">
                      {r.status} by {r.decidedBy}
                      {r.decisionNote ? `: ${r.decisionNote}` : ""}
                    </p>
                  )}
                </div>
                <Tag tone={LEAVE_STATUS_TONE[r.status]}>{r.status}</Tag>
                {r.status === "Pending" && (
                  <Button size="sm" variant="ghost" onClick={() => withdraw(r.id)}>
                    Withdraw
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function plusDays(key: string, n: number) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
