"use client";

import { CalendarOff, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/sheet";
import { CLOSE_MINUTES, OPEN_MINUTES } from "@/lib/live/catalogue";
import { api, useToday } from "@/lib/live/client";
import { shortDate } from "@/lib/live/time";
import type { AvailabilitySummary, TimeOffDto, WeeklyHoursDto } from "@/lib/live/types";
import { cn } from "@/lib/cn";
import { Panel } from "./bits";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const TIMES = Array.from(
  { length: (CLOSE_MINUTES - OPEN_MINUTES) / 30 + 1 },
  (_, i) => OPEN_MINUTES + i * 30,
);
const timeOffReasons = ["Annual leave", "Sick leave", "Training", "Public holiday", "Other"];

function label(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
}

type Saved = {
  availability: AvailabilitySummary;
  clashes: { id: string; when: string; patient: string }[];
};

/** The therapist sets their working days, hours and time off. Admins see it when matching. */
export function AvailabilityEditor({
  weekly: initialWeekly,
  timeOff: initialTimeOff,
  onSaved,
}: {
  weekly: WeeklyHoursDto[];
  timeOff: TimeOffDto[];
  onSaved: () => void;
}) {
  const [weekly, setWeekly] = useState(initialWeekly);
  const [timeOff, setTimeOff] = useState(initialTimeOff);
  const [draft, setDraft] = useState({
    from: "",
    to: "",
    reason: timeOffReasons[0] ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const today = useToday() ?? "";
  const dayOf = (weekday: number) => weekly.find((w) => w.weekday === weekday);

  function setDay(weekday: number, patch: Partial<WeeklyHoursDto> | null) {
    setSaved(null);
    setWeekly((list) => {
      const rest = list.filter((w) => w.weekday !== weekday);
      if (patch === null) return rest;
      const current = list.find((w) => w.weekday === weekday) ?? {
        weekday,
        start: OPEN_MINUTES,
        end: CLOSE_MINUTES,
      };
      return [...rest, { ...current, ...patch }].sort((a, b) => a.weekday - b.weekday);
    });
  }

  function addTimeOff() {
    const from = draft.from || today;
    const to = draft.to || from;
    if (!from) return;
    setSaved(null);
    setTimeOff((list) => [
      ...list,
      {
        id: `new-${list.length}-${from}`,
        reason: draft.reason,
        from,
        to: to < from ? from : to,
      },
    ]);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<Saved>("/api/me/availability", {
        method: "PUT",
        body: {
          weekly,
          timeOff: timeOff.map((o) => ({
            ...(o.id.startsWith("new-") ? {} : { id: o.id }),
            from: o.from,
            to: o.to,
            reason: o.reason,
          })),
        },
      });
      setSaved(result);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your availability.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Availability">
      <p className="-mt-2 mb-4 text-small text-ink-700">
        The care team only offers new patients times when you work. Medisense is open Monday to
        Friday, 9:00 am to 5:00 pm.
      </p>
      <ul className="flex flex-col gap-2">
        {DAYS.map((name, i) => {
          const weekday = i + 1;
          const hours = dayOf(weekday);
          return (
            <li
              key={name}
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-control border px-3 py-2",
                hours ? "border-accent bg-accent-tint" : "border-border",
              )}
            >
              <label className="flex w-36 cursor-pointer items-center gap-2 text-small font-semibold">
                <input
                  type="checkbox"
                  checked={Boolean(hours)}
                  onChange={(e) => setDay(weekday, e.target.checked ? {} : null)}
                  className="size-4 accent-accent-fill"
                />
                {name}
              </label>
              {hours ? (
                <span className="flex items-center gap-2 text-small">
                  <Select
                    aria-label={`${name} start`}
                    value={hours.start}
                    onChange={(e) => setDay(weekday, { start: Number(e.target.value) })}
                    className="h-8 w-28"
                  >
                    {TIMES.filter((t) => t <= hours.end - 60).map((t) => (
                      <option key={t} value={t}>
                        {label(t)}
                      </option>
                    ))}
                  </Select>
                  to
                  <Select
                    aria-label={`${name} finish`}
                    value={hours.end}
                    onChange={(e) => setDay(weekday, { end: Number(e.target.value) })}
                    className="h-8 w-28"
                  >
                    {TIMES.filter((t) => t >= hours.start + 60).map((t) => (
                      <option key={t} value={t}>
                        {label(t)}
                      </option>
                    ))}
                  </Select>
                </span>
              ) : (
                <span className="text-small text-ink-500">Not working</span>
              )}
            </li>
          );
        })}
      </ul>

      <h3 className="mt-6 mb-2 text-small font-semibold">Time off</h3>
      {timeOff.filter((o) => o.to >= today).length === 0 ? (
        <p className="mb-3 text-small text-ink-500">No time off booked.</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-1.5">
          {timeOff
            .filter((o) => o.to >= today)
            .sort((a, b) => a.from.localeCompare(b.from))
            .map((o) => (
              <li
                key={o.id}
                className="flex items-center gap-3 rounded-control bg-canvas px-3 py-2 text-small"
              >
                <CalendarOff className="size-4 text-ink-500" aria-hidden="true" />
                <span className="flex-1">
                  {shortDate(`${o.from}T00:00:00+10:00`)}
                  {o.to !== o.from && ` – ${shortDate(`${o.to}T00:00:00+10:00`)}`} · {o.reason}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${o.reason}`}
                  onClick={() => {
                    setSaved(null);
                    setTimeOff((list) => list.filter((x) => x.id !== o.id));
                  }}
                  className="flex size-7 cursor-pointer items-center justify-center rounded-control text-ink-700 hover:bg-surface"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-caption font-semibold text-ink-700">
          From
          <input
            type="date"
            min={today}
            value={draft.from || today}
            onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            className={`${inputClass} w-40`}
          />
        </label>
        <label className="flex flex-col gap-1 text-caption font-semibold text-ink-700">
          To
          <input
            type="date"
            min={draft.from || today}
            value={draft.to || draft.from || today}
            onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            className={`${inputClass} w-40`}
          />
        </label>
        <label className="flex flex-col gap-1 text-caption font-semibold text-ink-700">
          Reason
          <Select
            value={draft.reason}
            onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
            className="w-40"
          >
            {timeOffReasons.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </label>
        <Button onClick={addTimeOff}>
          <Plus className="size-4" aria-hidden="true" />
          Add time off
        </Button>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-control bg-over-bg px-3 py-2 text-small text-over">
          {error}
        </p>
      )}
      {saved && (
        <div
          role="status"
          className="mt-4 rounded-control bg-healthy-bg px-3 py-2 text-small text-healthy"
        >
          Saved. The care team now sees: {saved.availability.pattern}.
          {saved.clashes.length > 0 && (
            <span className="mt-1 block text-watch">
              {saved.clashes.length} booked{" "}
              {saved.clashes.length === 1 ? "visit falls" : "visits fall"} outside your new hours:{" "}
              {saved.clashes.map((c) => `${c.patient}, ${c.when}`).join("; ")}. Use Cancel or change
              on each to move it.
            </span>
          )}
        </div>
      )}
      <div className="mt-4">
        <Button variant="primary" disabled={busy || weekly.length === 0} onClick={save}>
          {busy ? "Saving…" : "Save availability"}
        </Button>
        {weekly.length === 0 && (
          <span className="ml-3 text-caption text-ink-500">Choose at least one working day.</span>
        )}
      </div>
    </Panel>
  );
}
