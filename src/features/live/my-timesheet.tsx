"use client";

import { Lock, PenLine, RotateCcw, Send, Undo2 } from "lucide-react";
import { KpiLabel } from "@/components/ui/kpi-icon";
import { useState } from "react";
import { RuleMark } from "@/components/ai/provenance";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { api, useResource } from "@/lib/live/client";
import { relativeTime, shortDate } from "@/lib/live/time";
import {
  TIMESHEET_TONE,
  hoursLabel,
  type MyTimesheetDto,
  type TimesheetDayDto,
  type TimesheetDto,
} from "@/lib/live/timesheets";
import { ErrorNote, Panel, Skeleton } from "./bits";
import { CheckList, DayTable, useWeekParam, weekRange } from "./timesheet-board";

const day = (key: string) => shortDate(`${key}T00:00:00Z`);

/** The clinician's week, already filled in; they correct what's different and submit. */
export function MyTimesheet() {
  const [week, setWeek] = useWeekParam();
  const { data, error, loading, reload } = useResource<MyTimesheetDto>(
    `/api/me/timesheet${week ? `?week=${week}` : ""}`,
    (e) => e.type === "care",
  );
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-96" />;
  const s = data.sheet;

  return (
    <div className={cn("flex flex-col gap-5", loading && "opacity-80")}>
      <div
        role="group"
        aria-label="Week"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
      >
        {data.weeks.map((w) => (
          <button
            key={w.week}
            type="button"
            aria-pressed={w.week === data.week}
            onClick={() => setWeek(w.week)}
            className={cn(
              "flex h-full cursor-pointer flex-col items-start gap-1.5 rounded-card border px-4 py-3 text-left transition-colors duration-140",
              w.week === data.week
                ? "border-accent bg-accent-tint"
                : "border-border bg-surface hover:bg-sunken",
            )}
          >
            <span className="text-small font-semibold text-ink-900">
              {w.label}
              {w.current && <span className="font-normal text-ink-500"> · this week</span>}
            </span>
            <Tag tone={w.overdue ? "over" : TIMESHEET_TONE[w.status]}>
              {w.overdue ? `${w.status}, overdue` : w.status}
            </Tag>
          </button>
        ))}
      </div>

      <StatusNote s={s} onChanged={reload} />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border md:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "Worked", value: hoursLabel(s.totals.worked) },
          { label: "Rostered", value: hoursLabel(s.totals.rostered) },
          {
            label: "Overtime",
            value: s.totals.overtime ? hoursLabel(s.totals.overtime) : "None",
            watch: s.totals.overtime > 0,
          },
          { label: "With patients", value: hoursLabel(s.totals.clinical) },
          { label: "Travel", value: hoursLabel(s.totals.travel) },
          { label: "Leave", value: s.totals.leave ? hoursLabel(s.totals.leave) : "None" },
        ].map((f) => (
          <div key={f.label} className="flex flex-col gap-1 bg-surface px-5 py-4">
            <KpiLabel label={f.label} tone={f.watch ? "watch" : undefined} />
            <span className={cn("type-display text-h2 leading-none", f.watch && "text-watch")}>
              {f.value}
            </span>
          </div>
        ))}
      </div>

      <Panel title={`Week of ${weekRange(s.week, s.weekEnd)}`}>
        <p className="-mt-2 mb-3 flex flex-wrap items-center gap-2 text-small text-ink-700">
          <RuleMark>Rule</RuleMark>
          Each day starts at your rostered hours, or your visit and travel time if that was longer.
          Approved leave is filled in. Change a day only if it was different, and say why.
        </p>
        <DayTable
          s={s}
          today={data.today}
          edit={(d) => <DayEdit s={s} d={d} today={data.today} onSaved={reload} />}
        />
        <div className="mt-4 flex flex-col gap-2">
          <RuleMark>Rule checks</RuleMark>
          <CheckList checks={s.checks} />
        </div>
      </Panel>

      <Submit s={s} onChanged={reload} />
    </div>
  );
}

function StatusNote({ s, onChanged }: { s: TimesheetDto; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  async function recall() {
    setBusy(true);
    try {
      await api("/api/me/timesheet/recall", { body: { week: s.week } });
      toast("Timesheet recalled. Change it and submit again.");
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't recall the timesheet.");
    } finally {
      setBusy(false);
    }
  }
  if (s.status === "Returned") {
    return (
      <div role="alert" className="rounded-card border border-over bg-over-bg px-5 py-4">
        <p className="font-semibold text-over">Sent back by {s.decidedBy}</p>
        <p className="mt-1 text-small text-ink-900">{s.decisionNote}</p>
        <p className="mt-1 text-caption text-ink-700">Fix the days below and submit again.</p>
      </div>
    );
  }
  if (s.status === "Submitted") {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface px-5 py-4">
        <Lock className="size-4 text-ink-500" aria-hidden="true" />
        <p className="flex-1 text-small text-ink-700">
          Submitted {s.submittedAt ? relativeTime(s.submittedAt) : ""} ({s.ref}). It&apos;s with HR
          for approval; recall it if something needs changing.
        </p>
        <Button size="sm" disabled={busy} onClick={recall}>
          <Undo2 className="size-4" aria-hidden="true" />
          Recall
        </Button>
      </div>
    );
  }
  if (s.status === "Approved") {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface px-5 py-4">
        <Lock className="size-4 text-healthy" aria-hidden="true" />
        <p className="flex-1 text-small text-ink-700">
          Approved by <span className="font-semibold text-ink-900">{s.decidedBy}</span>{" "}
          {s.decidedAt ? relativeTime(s.decidedAt) : ""} ({s.ref}). It goes to payroll as shown.
          {s.decisionNote ? ` “${s.decisionNote}”` : ""}
        </p>
      </div>
    );
  }
  if (s.overdue) {
    return (
      <p className="rounded-card border border-over bg-over-bg px-5 py-3 text-small text-over">
        This timesheet was due {day(s.due)}. Check the days and submit it.
      </p>
    );
  }
  return null;
}

function DayEdit({
  s,
  d,
  today,
  onSaved,
}: {
  s: TimesheetDto;
  d: TimesheetDayDto;
  today: string;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [hours, setHours] = useState(String(Math.round((d.workedMinutes / 60) * 100) / 100));
  const [reason, setReason] = useState(d.adjustment?.reason ?? "");
  const [busy, setBusy] = useState(false);
  const locked = s.status === "Submitted" || s.status === "Approved";
  if (locked || d.date > today) return null;

  async function save(minutes: number | null) {
    setBusy(true);
    try {
      await api("/api/me/timesheet/adjust", {
        body: {
          week: s.week,
          date: d.date,
          minutes,
          reason: minutes === null ? "" : reason.trim(),
        },
      });
      toast(minutes === null ? `${day(d.date)} put back` : `${day(d.date)} saved`);
      setEditing(false);
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save the change.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <span className="flex flex-wrap gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setHours(String(Math.round((d.workedMinutes / 60) * 100) / 100));
            setReason(d.adjustment?.reason ?? "");
            setEditing(true);
          }}
        >
          <PenLine className="size-4" aria-hidden="true" />
          Change
        </Button>
        {d.adjustment && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => save(null)}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Undo
          </Button>
        )}
      </span>
    );
  }
  const value = Number(hours);
  const valid = Number.isFinite(value) && value >= 0 && value <= 14;
  return (
    <div className="flex min-w-56 flex-col gap-2">
      <label className="flex flex-col gap-1 text-caption font-semibold text-ink-700">
        Hours worked
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={14}
          step={0.25}
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className={cn(inputClass, "w-28")}
        />
      </label>
      <label className="flex flex-col gap-1 text-caption font-semibold text-ink-700">
        Why it was different
        <input
          value={reason}
          maxLength={200}
          onChange={(e) => setReason(e.target.value)}
          placeholder="For example, family meeting ran late"
          className={inputClass}
        />
      </label>
      <span className="flex gap-1">
        <Button
          size="sm"
          variant="primary"
          disabled={busy || !valid || reason.trim().length < 3}
          onClick={() => save(Math.round(value * 60))}
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </span>
    </div>
  );
}

function Submit({ s, onChanged }: { s: TimesheetDto; onChanged: () => void }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  if (s.status === "Submitted" || s.status === "Approved") return null;
  const blocked = !s.open;

  async function submit() {
    setBusy(true);
    try {
      const r = await api<{ ref: string }>("/api/me/timesheet", {
        body: { week: s.week, comment: comment.trim() },
      });
      toast(`Timesheet submitted (${r.ref}). You'll be told when it's approved.`);
      setComment("");
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't submit the timesheet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title={s.status === "Returned" ? "Submit again" : "Submit for approval"}>
      <label className="flex flex-col gap-1 text-caption font-semibold text-ink-700">
        Note for the approver (optional)
        <input
          value={comment}
          maxLength={400}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Anything they should know about this week"
          className={inputClass}
        />
      </label>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={busy || blocked} onClick={submit}>
          <Send className="size-4" aria-hidden="true" />
          {busy ? "Submitting…" : `Submit ${hoursLabel(s.totals.worked)}`}
        </Button>
        {blocked ? (
          <span className="text-caption text-ink-500">
            This week can be submitted from {day(s.opensOn)}.
          </span>
        ) : (
          s.checks.length > 0 && (
            <span className="text-caption text-watch">
              HR will see the {s.checks.length === 1 ? "check" : "checks"} above. Closing off visits
              and signing notes first speeds up approval.
            </span>
          )
        )}
      </div>
    </Panel>
  );
}
