"use client";

import { CalendarOff, CalendarPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
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

function label(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
}

type Saved = {
  availability: AvailabilitySummary;
  clashes: { id: string; when: string; patient: string }[];
};

/** The therapist sets their working days and hours. Leave goes through a request (My profile, Leave). */
export function AvailabilityEditor({
  weekly: initialWeekly,
  timeOff,
  onSaved,
}: {
  weekly: WeeklyHoursDto[];
  timeOff: TimeOffDto[];
  onSaved: () => void;
}) {
  const [weekly, setWeekly] = useState(initialWeekly);
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

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<Saved>("/api/me/availability", {
        method: "PUT",
        body: { weekly },
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

      <h3 className="mt-6 mb-2 text-small font-semibold">Approved leave</h3>
      {timeOff.filter((o) => o.to >= today).length === 0 ? (
        <p className="mb-3 text-small text-ink-500">No leave coming up.</p>
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
              </li>
            ))}
        </ul>
      )}
      <Link
        href="/profile?tab=leave"
        className="inline-flex h-9 items-center gap-2 rounded-control border border-border-strong px-3 text-small font-semibold text-ink-900 hover:bg-sunken hover:no-underline"
      >
        <CalendarPlus className="size-4" aria-hidden="true" />
        Request leave
      </Link>
      <span className="ml-3 text-caption text-ink-500">Leave is approved by HR first.</span>

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
