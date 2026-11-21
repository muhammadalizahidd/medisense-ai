"use client";

import { CalendarRange, Lock, PieChart, Search, X } from "lucide-react";
import { useState } from "react";
import { colour } from "@/components/charts/chart-kit";
import { DonutChart } from "@/components/charts/donut-chart";
import { StackedColumns } from "@/components/charts/stacked-columns";
import { PageHeader } from "@/components/ui/page";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Tag } from "@/components/ui/tag";
import { useNow, useResource } from "@/lib/live/client";
import {
  attendanceStates,
  attendanceTone,
  recordTone,
  sessionModes,
  type SessionRow,
} from "@/lib/live/sessions";
import { cn } from "@/lib/cn";
import { ErrorNote, LiveBadge, Skeleton } from "./bits";
import { FCard, td, th } from "./funding-bits";
import { KpiBand, tableBox, tableHead, when } from "./ops-bits";

const DAY = 86_400_000;
type Range = "today" | "week" | "past" | "upcoming" | "all";

const attColour: Record<string, string> = {
  Scheduled: colour.stone,
  Confirmed: colour.series2,
  Arrived: colour.series3,
  "In Progress": colour.series3,
  Completed: colour.healthy,
  "Partially Completed": colour.watch,
  Cancelled: colour.sand,
  "No Show": colour.over,
  "Safety Stop": colour.over,
};

/** Module 14 screen: My Sessions (therapist) and Sessions (care team). */
export function SessionList({ base }: { base: "/therapist/sessions" | "/care/sessions" }) {
  const { data, error, loading, reload } = useResource<{ rows: SessionRow[] }>(
    "/api/care/sessions",
    (e) => e.type === "care",
  );
  const clock = useNow();
  const [range, setRange] = useState<Range>("all");
  const [att, setAtt] = useState("");
  const [mode, setMode] = useState("");
  const [service, setService] = useState("");
  const [q, setQ] = useState("");
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  // Date figures wait for the browser clock, so the first render matches the server's.
  if (loading || !data || clock === null) return <Skeleton className="h-[760px]" />;
  const now = clock;
  const all = data.rows;
  const t = new Date(now);
  const dayStart = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const inRange = (r: SessionRow) => {
    const s = new Date(r.start).getTime();
    if (range === "today") return s >= dayStart && s < dayStart + DAY;
    if (range === "week") return s >= dayStart - 3 * DAY && s < dayStart + 4 * DAY;
    if (range === "past") return s < now;
    if (range === "upcoming") return s >= now;
    return true;
  };
  const services = [...new Set(all.map((r) => r.discipline))].sort();
  const query = q.trim().toLowerCase();
  const rows = all
    .filter(inRange)
    .filter((r) => (!att || r.attendance === att) && (!mode || r.mode === mode))
    .filter((r) => !service || r.discipline === service)
    .filter(
      (r) =>
        !query ||
        `${r.ref} ${r.apt} ${r.participant} ${r.participantId} ${r.therapist}`
          .toLowerCase()
          .includes(query),
    )
    .sort((a, b) => {
      // Live work first, then the nearest sessions.
      const live = (r: SessionRow) => (r.attendance === "In Progress" ? 0 : 1);
      return (
        live(a) - live(b) ||
        Math.abs(new Date(a.start).getTime() - now) - Math.abs(new Date(b.start).getTime() - now)
      );
    });
  const happened = (r: SessionRow) =>
    ["Completed", "Partially Completed", "Safety Stop"].includes(r.attendance);
  const today = all.filter((r) => {
    const s = new Date(r.start).getTime();
    return s >= dayStart && s < dayStart + DAY;
  });
  const slices = attendanceStates
    .map((s) => ({
      id: s,
      label: s,
      value: all.filter((r) => r.attendance === s).length,
      colour: attColour[s] ?? colour.stone,
    }))
    .filter((s) => s.value);
  const days = Array.from({ length: 14 }, (_, i) => dayStart + (i - 9) * DAY);
  const week = days.map((d) => {
    const on = all.filter((r) => {
      const s = new Date(r.start).getTime();
      return s >= d && s < d + DAY;
    });
    return {
      day: new Date(d).toLocaleDateString("en-AU", { weekday: "short", day: "numeric" }),
      Completed: on.filter(happened).length,
      Upcoming: on.filter((r) =>
        ["Scheduled", "Confirmed", "In Progress", "Arrived"].includes(r.attendance),
      ).length,
      Missed: on.filter((r) => ["No Show", "Cancelled"].includes(r.attendance)).length,
    };
  });
  return (
    <>
      <PageHeader
        eyebrow="Live care"
        title={base === "/therapist/sessions" ? "My sessions" : "Sessions"}
        description="Prepare, conduct, document and hand over every visit"
        actions={<LiveBadge />}
      />
      <KpiBand
        label="Session figures"
        items={[
          {
            label: "Today",
            value: today.length,
            sub: "sessions booked today",
            onClick: () => setRange("today"),
          },
          {
            label: "In progress",
            value: all.filter((r) => r.attendance === "In Progress").length,
            sub: "checked in, not yet ended",
            onClick: () => {
              setRange("all");
              setAtt("In Progress");
            },
          },
          {
            label: "Notes to sign",
            value: all.filter((r) => happened(r) && !["Signed", "Amended"].includes(r.record))
              .length,
            sub: "documentation outstanding",
            tone: "watch",
            onClick: () => {
              setRange("past");
              setAtt("Completed");
            },
          },
          {
            label: "Did not attend",
            value: all.filter((r) => r.attendance === "No Show").length,
            sub: "finance reviews, no note",
            tone: all.some((r) => r.attendance === "No Show") ? "over" : undefined,
            onClick: () => {
              setRange("all");
              setAtt("No Show");
            },
          },
          {
            label: "Unverified",
            value: all.filter((r) => happened(r) && r.verification === "Unverified").length,
            sub: "delivered, awaiting finance",
          },
          {
            label: "Sync issues",
            value: all.filter((r) => r.sync !== "Synced").length,
            sub: "unsynced drafts or conflicts",
            tone: all.some((r) => r.sync === "Conflict") ? "over" : undefined,
          },
        ]}
      />
      <div className="grid items-stretch gap-6 xl:grid-cols-12">
        <FCard
          icon={PieChart}
          title="Sessions by attendance"
          sub="Click a slice to filter"
          className="xl:col-span-5"
        >
          <DonutChart
            label="Sessions by attendance"
            stacked
            size={150}
            slices={slices}
            centre={all.length}
            centreCaption="sessions"
            selected={att || null}
            onSelect={(id) => setAtt(id ?? "")}
          />
        </FCard>
        <FCard
          icon={CalendarRange}
          title="Fourteen days at a glance"
          sub="Delivered, upcoming and missed sessions by day"
          className="xl:col-span-7"
        >
          <div className="flex h-full min-h-72 flex-col">
            <StackedColumns
              label="Sessions by day"
              data={week}
              xKey="day"
              height="fill"
              series={[
                { key: "Completed", label: "Delivered", colour: colour.healthy },
                { key: "Upcoming", label: "Upcoming", colour: colour.series2 },
                { key: "Missed", label: "Missed or cancelled", colour: colour.over },
              ]}
            />
          </div>
        </FCard>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-lift">
        <Segmented<Range>
          label="Date range"
          value={range}
          onChange={setRange}
          options={[
            { id: "all", label: "All" },
            { id: "today", label: "Today" },
            { id: "week", label: "This week" },
            { id: "past", label: "Past" },
            { id: "upcoming", label: "Upcoming" },
          ]}
        />
        <div className="w-48">
          <Select
            aria-label="Attendance"
            className="h-9"
            value={att}
            onChange={(e) => setAtt(e.target.value)}
          >
            <option value="">Any attendance</option>
            {attendanceStates.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
        <div className="w-48">
          <Select
            aria-label="Mode"
            className="h-9"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="">Any mode</option>
            {sessionModes.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
        <div className="w-52">
          <Select
            aria-label="Service"
            className="h-9"
            value={service}
            onChange={(e) => setService(e.target.value)}
          >
            <option value="">Any service</option>
            {services.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
        <label className="flex h-9 min-w-56 flex-1 items-center gap-2 rounded-control border border-border-strong bg-surface px-3 focus-within:shadow-focus">
          <Search className="size-4 text-ink-500" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search sessions"
            placeholder="Session, appointment, participant or MRN"
            className="min-w-0 flex-1 bg-transparent text-small outline-none placeholder:text-ink-500"
          />
          {q && (
            <button
              type="button"
              aria-label="Clear"
              onClick={() => setQ("")}
              className="cursor-pointer text-ink-500"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </label>
      </div>
      <div className={tableBox}>
        <table className="w-full text-left text-small">
          <thead className={tableHead}>
            <tr>
              <th className={th}>Session</th>
              <th className={th}>Participant</th>
              <th className={th}>When</th>
              <th className={th}>Mode</th>
              <th className={th}>Note</th>
              <th className={th}>Next step</th>
              <th className={th}>Attendance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-canvas">
                <td className={td}>
                  <a
                    href={`${base}/${r.id}`}
                    className="font-semibold text-ink-900 hover:text-accent hover:no-underline"
                  >
                    {r.purpose}
                  </a>
                  <span className="flex items-center gap-1.5 font-mono text-caption text-ink-500">
                    {r.restricted && <Lock className="size-3" aria-label="Restricted discipline" />}
                    {r.ref}
                  </span>
                </td>
                <td className={td}>
                  <span className="block text-ink-900">{r.participant}</span>
                  <span className="font-mono text-caption text-ink-500">{r.participantId}</span>
                </td>
                <td className={cn(td, "whitespace-nowrap")}>
                  <span className="block text-ink-900">{when(r.start)}</span>
                  <span className="text-caption text-ink-500">
                    {r.discipline}
                    {base === "/care/sessions" ? ` · ${r.therapist}` : ""}
                  </span>
                </td>
                <td className={cn(td, "whitespace-nowrap")}>{r.mode}</td>
                <td className={td}>
                  <Tag tone={recordTone[r.record]}>{r.record}</Tag>
                  {r.sync !== "Synced" && (
                    <span className="mt-1 block text-caption text-over">{r.sync}</span>
                  )}
                </td>
                <td className={cn(td, "text-ink-700")}>{r.next}</td>
                <td className={td}>
                  <Tag tone={attendanceTone[r.attendance]}>{r.attendance}</Tag>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-small text-ink-500">
                  No sessions match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2! px-1 text-caption text-ink-500">
        {rows.length} of {all.length} sessions · scroll inside the table for more
      </p>
    </>
  );
}
