"use client";

import {
  AlarmClock,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Download,
  PenLine,
  Search,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { RuleMark } from "@/components/ai/provenance";
import { Button } from "@/components/ui/button";
import { MetricBand } from "@/components/ui/metric-band";
import { PageHeader } from "@/components/ui/page";
import { Avatar } from "@/components/ui/premium";
import { Segmented } from "@/components/ui/segmented";
import { inputClass } from "@/components/ui/sheet";
import { TableFrame } from "@/components/ui/table-frame";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { api, useResource } from "@/lib/live/client";
import { relativeTime, shortDate, timeOfDay } from "@/lib/live/time";
import {
  TIMESHEET_TONE,
  decimalHours,
  hoursLabel,
  type TimesheetBoardDto,
  type TimesheetCheckDto,
  type TimesheetDayDto,
  type TimesheetDto,
  type TimesheetWeekDto,
} from "@/lib/live/timesheets";
import { EmptyNote, ErrorNote, LiveBadge, Skeleton } from "./bits";

const day = (key: string) => shortDate(`${key}T00:00:00Z`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const clock = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${suffix}`;
};
export const weekRange = (week: string, weekEnd: string) => `${day(week)} to ${day(weekEnd)}`;

/** Reads ?week= once after mount and keeps it in the address as it changes. */
export function useWeekParam() {
  const [week, setWeekState] = useState<string | null>(null);
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("week");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the address once after mount
    if (wanted && /^\d{4}-\d{2}-\d{2}$/.test(wanted)) setWeekState(wanted);
  }, []);
  const setWeek = (next: string) => {
    setWeekState(next);
    const url = new URL(window.location.href);
    url.searchParams.set("week", next);
    window.history.replaceState(window.history.state, "", url);
  };
  return [week, setWeek] as const;
}

/** People and HR: timesheets built from visits, waiting for approval, and the payroll file. */
export function TimesheetBoard({
  embedded = false,
}: {
  /** Inside People and HR, which brings its own title and owns the address. */
  embedded?: boolean;
} = {}) {
  const [week, setWeek] = useWeekParam();
  const { data, error, loading, reload } = useResource<TimesheetBoardDto>(
    `/api/care/hr/timesheets${week ? `?week=${week}` : ""}`,
    (e) => e.type === "care",
  );
  const approved = data?.rows.filter((r) => r.status === "Approved").length;
  const tabs = [
    { id: "approve" as const, label: "To approve", count: data?.queue.length, alert: true },
    { id: "team" as const, label: "Team", count: data?.rows.length },
    { id: "payroll" as const, label: "Payroll", count: approved },
    { id: "history" as const, label: "History", count: data?.history.length },
  ];
  const addressTab = useTab(tabs, "approve");
  const localTab = useState<(typeof tabs)[number]["id"]>("approve");
  const [tab, setTab] = embedded ? localTab : addressTab;
  const s = data?.summary;
  const current = data?.weeks.find((w) => w.week === data.week);

  return (
    <>
      {!embedded && (
        <PageHeader
          eyebrow="People and HR"
          title="Timesheets"
          description="Each clinician's week, already filled in from their roster, visits and approved leave. Check what the rules flag, approve, and send the hours to payroll."
          actions={<LiveBadge />}
        />
      )}
      {error && !data ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
          <Skeleton className="h-96" />
        </div>
      ) : data && s ? (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="label-caps text-ink-500">Week</span>
            <Segmented
              label="Week"
              value={data.week}
              onChange={setWeek}
              options={data.weeks.map((w) => ({
                id: w.week,
                label: w.current ? `${w.label} (this week)` : w.label,
              }))}
            />
            {loading && <span className="text-caption text-ink-500">Updating…</span>}
          </div>
          <MetricBand
            size="stat-sm"
            label="Timesheet figures"
            metrics={[
              {
                label: "To approve",
                value: s.toApprove,
                caption: "Submitted, all weeks",
                tone: "watch",
                flagged: s.toApprove > 0,
              },
              {
                label: "Not submitted",
                value: s.notSubmitted,
                caption: s.overdue ? `${s.overdue} overdue` : `Week of ${current?.label ?? ""}`,
                tone: s.overdue ? "over" : undefined,
                flagged: s.overdue > 0,
              },
              {
                label: "Approved",
                value: `${s.approved} of ${data.rows.length}`,
                caption: s.returned ? `${s.returned} sent back` : "Ready for payroll",
              },
              { label: "Hours worked", value: s.workedHours, caption: "All clinicians, this week" },
              {
                label: "Overtime",
                value: `${s.overtimeHours} h`,
                caption: "Beyond rostered hours",
                tone: s.overtimeHours > 0 ? "watch" : undefined,
              },
              {
                label: "Visits delivered",
                value: s.visits,
                caption: `${s.clinicalHours} h with patients`,
              },
            ]}
          />
          <div>
            <Tabs label="Timesheets" tabs={tabs} value={tab} onChange={setTab} />
            <TabPanel id="approve" value={tab}>
              <Queue rows={data.queue} today={data.today} onChanged={reload} />
            </TabPanel>
            <TabPanel id="team" value={tab}>
              <Team rows={data.rows} week={current} today={data.today} onChanged={reload} />
            </TabPanel>
            <TabPanel id="payroll" value={tab}>
              <Payroll rows={data.rows} week={current} />
            </TabPanel>
            <TabPanel id="history" value={tab}>
              <History rows={data.history} />
            </TabPanel>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ shared pieces */

export function CheckList({ checks }: { checks: TimesheetCheckDto[] }) {
  if (!checks.length) {
    return (
      <p className="flex items-center gap-2 text-small text-ink-700">
        <CircleCheck className="size-4 text-healthy" aria-hidden="true" />
        Nothing to check: matches the roster and every visit is closed off and signed
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {checks.map((c) => (
        <li
          key={c.kind}
          className={cn(
            "flex items-start gap-2 text-small",
            c.tone === "over" ? "text-over" : "text-watch",
          )}
        >
          <CircleAlert className="mt-0.5 size-4 flex-none" aria-hidden="true" />
          <span className="min-w-0">{c.text}</span>
        </li>
      ))}
    </ul>
  );
}

function VisitsCell({ s }: { s: TimesheetDto }) {
  const t = s.totals;
  if (!t.visits) return <span className="text-caption text-ink-500">None recorded</span>;
  return (
    <span className="block">
      <span className="font-semibold text-ink-900">{plural(t.visits, "visit")}</span>
      <span className="block text-caption text-ink-500">
        {hoursLabel(t.clinical)} with patients · {hoursLabel(t.travel)} travel
      </span>
    </span>
  );
}

const VISIT_TONE = {
  Completed: "text-ink-700",
  Incomplete: "text-watch",
  "Did not attend": "text-watch",
  "Not closed off": "text-over",
} as const;

/** The week day by day: roster, leave, visits and hours worked. `edit` adds the clinician's controls. */
export function DayTable({
  s,
  today,
  edit,
}: {
  s: TimesheetDto;
  today: string;
  edit?: (d: TimesheetDayDto) => ReactNode;
}) {
  const t = s.totals;
  return (
    <TableFrame>
      <table className="table-stack w-full text-left text-small md:min-w-240">
        <thead className="sticky top-0 border-b border-border bg-sunken text-caption text-ink-500">
          <tr>
            <th className="px-4 py-2.5 font-medium">Day</th>
            <th className="px-4 py-2.5 font-medium">Rostered</th>
            <th className="px-4 py-2.5 font-medium">Visits</th>
            <th className="px-4 py-2.5 text-right font-medium">With patients</th>
            <th className="px-4 py-2.5 text-right font-medium">Travel</th>
            <th className="px-4 py-2.5 text-right font-medium">Hours worked</th>
            {edit && <th className="px-4 py-2.5 font-medium">Change</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {s.days.map((d) => {
            const future = d.date > today;
            const quiet = !d.roster && !d.visits.length && !d.adjustment;
            return (
              <tr
                key={d.date}
                className={cn(
                  "align-top",
                  d.date === today && "bg-accent-tint",
                  quiet && "text-ink-500",
                )}
              >
                <td className="px-4 py-2.5 font-semibold whitespace-nowrap text-ink-900">
                  {day(d.date)}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {d.leave ? (
                    <Tag tone="available">{d.leave}</Tag>
                  ) : d.roster ? (
                    <span className="text-ink-700">
                      {clock(d.roster.start)} to {clock(d.roster.end)}
                    </span>
                  ) : (
                    <span className="text-ink-500">Not rostered</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {d.visits.length ? (
                    <ul className="flex flex-col gap-0.5">
                      {d.visits.map((v) => (
                        <li key={v.id} className="text-caption">
                          <span className="font-semibold text-ink-900">{timeOfDay(v.start)}</span>{" "}
                          <span className="text-ink-700">{v.patient}</span>
                          <span className={cn("ml-1", VISIT_TONE[v.status])}>
                            · {v.status}
                            {v.noteSigned === false && " · note not signed"}
                            {v.modality === "Telehealth" && " · Telehealth"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-caption text-ink-500">{future ? "—" : "No visits"}</span>
                  )}
                </td>
                <td
                  className={cn(
                    "px-4 py-2.5 whitespace-nowrap text-ink-700 md:text-right",
                    !d.clinicalMinutes && "max-md:hidden",
                  )}
                >
                  <span className="text-ink-500 md:hidden">With patients </span>
                  {d.clinicalMinutes ? hoursLabel(d.clinicalMinutes) : "—"}
                </td>
                <td
                  className={cn(
                    "px-4 py-2.5 whitespace-nowrap text-ink-700 md:text-right",
                    !d.travelMinutes && "max-md:hidden",
                  )}
                >
                  <span className="text-ink-500 md:hidden">Travel </span>
                  {d.travelMinutes ? hoursLabel(d.travelMinutes) : "—"}
                </td>
                <td
                  className={cn(
                    "px-4 py-2.5 whitespace-nowrap md:text-right",
                    !future && !d.workedMinutes && !d.leaveMinutes && "max-md:hidden",
                  )}
                >
                  <span className="text-caption text-ink-500 md:hidden">Hours worked </span>
                  {future ? (
                    <span className="text-caption text-ink-500">Not yet</span>
                  ) : (
                    <>
                      <span
                        className={cn(
                          "font-semibold",
                          d.adjustment ? "text-watch" : "text-ink-900",
                        )}
                      >
                        {d.workedMinutes ? hoursLabel(d.workedMinutes) : "—"}
                      </span>
                      {d.leaveMinutes > 0 && (
                        <span className="block text-caption text-ink-500">
                          + {hoursLabel(d.leaveMinutes)} leave
                        </span>
                      )}
                      {d.adjustment && (
                        <span className="mt-0.5 flex items-center gap-1 text-caption text-watch md:justify-end">
                          <PenLine className="size-3" aria-hidden="true" />
                          {d.adjustment.reason}
                        </span>
                      )}
                    </>
                  )}
                </td>
                {edit && <td className="px-4 py-2.5">{edit(d)}</td>}
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t border-border bg-sunken text-small font-semibold text-ink-900">
          <tr>
            <td className="px-4 py-2.5">Week</td>
            <td className="px-4 py-2.5 text-ink-700">{hoursLabel(t.rostered)} rostered</td>
            <td className="px-4 py-2.5 text-ink-700">{plural(t.visits, "visit")}</td>
            <td className="px-4 py-2.5 text-right">{hoursLabel(t.clinical)}</td>
            <td className="px-4 py-2.5 text-right">{hoursLabel(t.travel)}</td>
            <td className="px-4 py-2.5 text-right">
              {hoursLabel(t.worked)}
              {t.leave > 0 && (
                <span className="block text-caption font-normal text-ink-500">
                  + {hoursLabel(t.leave)} leave
                </span>
              )}
            </td>
            {edit && <td />}
          </tr>
        </tfoot>
      </table>
    </TableFrame>
  );
}

function Person({ s, sub }: { s: TimesheetDto; sub?: ReactNode }) {
  return (
    <Link
      href={`/care/therapists/${s.staffId}`}
      className="flex min-w-0 items-center gap-3 hover:no-underline"
    >
      <Avatar name={s.staffName} src={s.photoUrl} size={40} kind="staff" />
      <span className="min-w-0">
        <span className="block font-semibold text-ink-900">{s.staffName}</span>
        <span className="block truncate text-caption text-ink-500">
          {sub ?? `${s.discipline} · ${s.region}`}
        </span>
      </span>
    </Link>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: "watch" }) {
  return (
    <div className="rounded-control bg-sunken px-3 py-2">
      <p className="text-caption text-ink-500">{label}</p>
      <p className={cn("font-semibold", tone === "watch" ? "text-watch" : "text-ink-900")}>
        {value}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ to approve */

function Queue({
  rows,
  today,
  onChanged,
}: {
  rows: TimesheetDto[];
  today: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const clear = rows.filter((r) => r.checks.length === 0 && r.id);
  if (!rows.length) {
    return (
      <EmptyNote title="No timesheets waiting.">
        Submitted timesheets appear here with anything the rules flag.
      </EmptyNote>
    );
  }
  async function approveClear() {
    setBusy(true);
    try {
      const r = await api<{ decided: number }>("/api/care/hr/timesheets", {
        body: { ids: clear.map((s) => s.id), decision: "Approve", note: "" },
      });
      toast(`Approved ${plural(r.decided, "timesheet")} with nothing to check`);
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't approve.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p className="flex flex-1 flex-wrap items-center gap-2 text-small text-ink-700">
          <RuleMark>Rule checks</RuleMark>
          Visits not closed off, unsigned notes, overtime and changed days are flagged. You approve
          or send back.
        </p>
        {clear.length > 0 && (
          <Button size="sm" disabled={busy} onClick={approveClear}>
            <Check className="size-4" aria-hidden="true" />
            Approve {plural(clear.length, "sheet")} with nothing flagged
          </Button>
        )}
      </div>
      <ul className="flex flex-col gap-3">
        {rows.map((s) => (
          <SheetCard key={`${s.staffId}:${s.week}`} s={s} today={today} onChanged={onChanged} />
        ))}
      </ul>
    </>
  );
}

function SheetCard({
  s,
  today,
  onChanged,
}: {
  s: TimesheetDto;
  today: string;
  onChanged: () => void;
}) {
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const t = s.totals;

  async function decide(decision: "Approve" | "Return") {
    if (!s.id) return;
    setBusy(true);
    try {
      await api("/api/care/hr/timesheets", {
        body: { ids: [s.id], decision, note: note.trim() },
      });
      toast(
        decision === "Approve"
          ? `Approved ${s.staffName}'s timesheet: ${hoursLabel(t.worked)}`
          : `Sent ${s.staffName}'s timesheet back`,
      );
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save the decision.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-card border border-border bg-surface">
      <div className="grid gap-5 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_220px]">
        <div className="flex min-w-0 flex-col gap-3">
          <Person s={s} />
          <div>
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-section font-semibold text-ink-900">
                {weekRange(s.week, s.weekEnd)}
              </span>
              {s.ref && <span className="font-mono text-caption text-ink-500">{s.ref}</span>}
            </p>
            <p className="text-caption text-ink-500">
              {s.employment} · submitted {s.submittedAt ? relativeTime(s.submittedAt) : ""}
            </p>
            {s.comment && (
              <p className="mt-2 rounded-control bg-sunken px-3 py-2 text-small text-ink-700">
                “{s.comment}”
              </p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Figure label="Worked" value={hoursLabel(t.worked)} />
            <Figure label="Rostered" value={hoursLabel(t.rostered)} />
            <Figure
              label="Overtime"
              value={t.overtime ? hoursLabel(t.overtime) : "None"}
              tone={t.overtime ? "watch" : undefined}
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3 lg:border-l lg:border-border lg:pl-5">
          <RuleMark>Rule checks</RuleMark>
          <CheckList checks={s.checks} />
          <div className="mt-auto grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Figure label="With patients" value={hoursLabel(t.clinical)} />
            <Figure label="Travel" value={hoursLabel(t.travel)} />
            <Figure label="Other work" value={hoursLabel(t.other)} />
            <Figure label="Leave" value={t.leave ? hoursLabel(t.leave) : "None"} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {returning ? (
            <>
              <label className="flex flex-col gap-1 text-caption font-semibold text-ink-700">
                What needs fixing
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={400}
                  placeholder="Shown to the clinician"
                  className={cn(inputClass, "h-auto py-2")}
                />
              </label>
              <Button
                variant="danger"
                size="sm"
                disabled={busy || !note.trim()}
                onClick={() => decide("Return")}
              >
                Send back
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setReturning(false)}>
                Back
              </Button>
            </>
          ) : (
            <>
              <Button variant="primary" size="sm" disabled={busy} onClick={() => decide("Approve")}>
                <Check className="size-4" aria-hidden="true" />
                Approve
              </Button>
              <Button size="sm" disabled={busy} onClick={() => setReturning(true)}>
                <Undo2 className="size-4" aria-hidden="true" />
                Send back
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setOpen((x) => !x)}>
                <ChevronDown
                  className={cn("size-4 transition-transform duration-140", open && "rotate-180")}
                  aria-hidden="true"
                />
                {open ? "Hide days" : "Show days"}
              </Button>
            </>
          )}
        </div>
      </div>
      {open && (
        <div className="border-t border-border px-5 py-4">
          <DayTable s={s} today={today} />
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ team */

const filters = ["All", "Not submitted", "Submitted", "Approved", "Returned"] as const;
type Filter = (typeof filters)[number];

function Team({
  rows: all,
  week,
  today,
  onChanged,
}: {
  rows: TimesheetDto[];
  week: TimesheetWeekDto | undefined;
  today: string;
  onChanged: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("All");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const q = query.trim().toLowerCase();
  const rows = all
    .filter((r) => filter === "All" || r.status === filter)
    .filter((r) => !q || `${r.staffName} ${r.discipline} ${r.region}`.toLowerCase().includes(q));
  const missing = all.filter(
    (r) => (r.status === "Not submitted" || r.status === "Returned") && r.open,
  );

  async function remind(ids: string[]) {
    if (!week) return;
    setBusy(true);
    try {
      const r = await api<{ reminded: number }>("/api/care/hr/timesheets/remind", {
        body: { staffIds: ids, week: week.week },
      });
      toast(`Reminder sent to ${plural(r.reminded, "clinician")}`);
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't send the reminder.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-lift">
        <Segmented
          label="Status"
          value={filter}
          onChange={setFilter}
          options={filters.map((f) => ({
            id: f,
            label:
              f === "All"
                ? `All (${all.length})`
                : `${f} (${all.filter((r) => r.status === f).length})`,
          }))}
        />
        <label className="ml-auto flex h-9 w-64 max-w-full items-center gap-2 rounded-control border border-border-strong bg-surface px-3 focus-within:shadow-focus">
          <Search className="size-4 text-ink-500" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search clinicians"
            placeholder="Clinician, discipline or region"
            className="min-w-0 flex-1 bg-transparent text-small outline-none placeholder:text-ink-500"
          />
        </label>
        {missing.length > 0 && (
          <Button size="sm" disabled={busy} onClick={() => remind(missing.map((r) => r.staffId))}>
            <AlarmClock className="size-4" aria-hidden="true" />
            Remind {plural(missing.length, "clinician")}
          </Button>
        )}
      </div>
      <TableFrame>
        {rows.length === 0 ? (
          <EmptyNote title="No timesheets match.">Try another status or search.</EmptyNote>
        ) : (
          <table className="table-stack w-full text-left text-small md:min-w-240">
            <thead className="sticky top-0 border-b border-border bg-sunken text-caption text-ink-500">
              <tr>
                <th className="px-5 py-3 font-medium">Clinician</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Rostered</th>
                <th className="px-4 py-3 text-right font-medium">Worked</th>
                <th className="px-4 py-3 text-right font-medium">Overtime</th>
                <th className="px-4 py-3 text-right font-medium">Leave</th>
                <th className="px-4 py-3 font-medium">Visits</th>
                <th className="px-4 py-3 font-medium">Checks</th>
                <th className="px-4 py-3 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const open = openId === r.staffId;
                const canRemind =
                  (r.status === "Not submitted" || r.status === "Returned") && r.open;
                return (
                  <TeamRow
                    key={r.staffId}
                    r={r}
                    open={open}
                    today={today}
                    onToggle={() => setOpenId(open ? null : r.staffId)}
                    action={
                      canRemind ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => remind([r.staffId])}
                        >
                          Remind
                        </Button>
                      ) : null
                    }
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </TableFrame>
    </>
  );
}

function TeamRow({
  r,
  open,
  today,
  onToggle,
  action,
}: {
  r: TimesheetDto;
  open: boolean;
  today: string;
  onToggle: () => void;
  action: ReactNode;
}) {
  const t = r.totals;
  return (
    <>
      <tr className={cn("transition-colors duration-140 hover:bg-sunken", open && "bg-sunken")}>
        <td className="px-5 py-3">
          <Person s={r} />
        </td>
        <td className="px-4 py-3">
          <Tag tone={r.overdue ? "over" : TIMESHEET_TONE[r.status]}>
            {r.overdue ? `${r.status}, overdue` : r.status}
          </Tag>
          {r.remindedAt && r.status !== "Approved" && r.status !== "Submitted" && (
            <span className="mt-1 block text-caption text-ink-500">
              Reminded {relativeTime(r.remindedAt)}
            </span>
          )}
          {r.status === "Approved" && r.decidedBy && (
            <span className="mt-1 block text-caption text-ink-500">by {r.decidedBy}</span>
          )}
        </td>
        <td className="px-4 py-3 text-right text-ink-700">{hoursLabel(t.rostered)}</td>
        <td className="px-4 py-3 text-right font-semibold text-ink-900">{hoursLabel(t.worked)}</td>
        <td className={cn("px-4 py-3 text-right", t.overtime ? "text-watch" : "text-ink-500")}>
          {t.overtime ? hoursLabel(t.overtime) : "—"}
        </td>
        <td className="px-4 py-3 text-right text-ink-700">{t.leave ? hoursLabel(t.leave) : "—"}</td>
        <td className="px-4 py-3">
          <VisitsCell s={r} />
        </td>
        <td className="px-4 py-3">
          {r.checks.length ? (
            <span
              title={r.checks.map((c) => c.text).join("\n")}
              className={cn(
                "inline-flex items-center gap-1 text-caption font-semibold whitespace-nowrap",
                r.checks.some((c) => c.tone === "over") ? "text-over" : "text-watch",
              )}
            >
              <CircleAlert className="size-3.5" aria-hidden="true" />
              {plural(r.checks.length, "check")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-caption text-ink-500">
              <CircleCheck className="size-3.5 text-healthy" aria-hidden="true" />
              Clear
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          <span className="flex items-center justify-end gap-1">
            {action}
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={open}
              aria-label={`${open ? "Hide" : "Show"} ${r.staffName}'s days`}
              onClick={onToggle}
            >
              <ChevronDown
                className={cn("size-4 transition-transform duration-140", open && "rotate-180")}
                aria-hidden="true"
              />
            </Button>
          </span>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={9} className="bg-sunken px-5 pb-4">
            <div className="flex flex-col gap-3 pt-1">
              <CheckList checks={r.checks} />
              <DayTable s={r} today={today} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ payroll */

function Payroll({ rows, week }: { rows: TimesheetDto[]; week: TimesheetWeekDto | undefined }) {
  const approved = rows.filter((r) => r.status === "Approved");
  const waiting = rows.length - approved.length;
  const ordinary = (r: TimesheetDto) => Math.max(0, r.totals.worked - r.totals.overtime);
  const sum = (f: (r: TimesheetDto) => number) => approved.reduce((n, r) => n + f(r), 0);

  function download() {
    const header = [
      "Week starting",
      "Clinician",
      "Employment",
      "Discipline",
      "Ordinary hours",
      "Overtime hours",
      "Leave hours",
      "Paid hours",
      "Visits",
      "Timesheet",
      "Approved by",
    ];
    const lines = approved.map((r) => [
      r.week,
      r.staffName,
      r.employment,
      r.discipline,
      decimalHours(ordinary(r)),
      decimalHours(r.totals.overtime),
      decimalHours(r.totals.leave),
      decimalHours(r.totals.worked + r.totals.leave),
      r.totals.visits,
      r.ref ?? "",
      r.decidedBy ?? "",
    ]);
    const csv = [header, ...lines]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-hours-${week?.week ?? "week"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Payroll file downloaded: ${plural(approved.length, "clinician")}`);
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p className="flex flex-1 flex-wrap items-center gap-2 text-small text-ink-700">
          <RuleMark>Rule</RuleMark>
          Only approved timesheets go to payroll. Overtime is time beyond rostered hours, leave
          included.
          {waiting > 0 && (
            <span className="text-watch">{plural(waiting, "timesheet")} not approved yet.</span>
          )}
        </p>
        <Button variant="primary" size="sm" disabled={!approved.length} onClick={download}>
          <Download className="size-4" aria-hidden="true" />
          Download payroll file
        </Button>
      </div>
      <TableFrame>
        {approved.length === 0 ? (
          <EmptyNote title="Nothing approved for this week yet.">
            Approved timesheets are listed here, ready for the payroll file.
          </EmptyNote>
        ) : (
          <table className="table-stack w-full text-left text-small md:min-w-240">
            <thead className="sticky top-0 border-b border-border bg-sunken text-caption text-ink-500">
              <tr>
                <th className="px-5 py-3 font-medium">Clinician</th>
                <th className="px-4 py-3 font-medium">Timesheet</th>
                <th className="px-4 py-3 text-right font-medium">Ordinary</th>
                <th className="px-4 py-3 text-right font-medium">Overtime</th>
                <th className="px-4 py-3 text-right font-medium">Leave</th>
                <th className="px-4 py-3 text-right font-medium">Paid hours</th>
                <th className="px-4 py-3 font-medium">Approved</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {approved.map((r) => (
                <tr key={r.staffId} className="transition-colors duration-140 hover:bg-sunken">
                  <td className="px-5 py-3">
                    <Person s={r} sub={`${r.employment} · ${r.discipline}`} />
                  </td>
                  <td className="px-4 py-3 font-mono text-caption text-ink-700">{r.ref}</td>
                  <td className="px-4 py-3 text-right text-ink-700">{decimalHours(ordinary(r))}</td>
                  <td className="px-4 py-3 text-right text-ink-700">
                    {decimalHours(r.totals.overtime)}
                  </td>
                  <td className="px-4 py-3 text-right text-ink-700">
                    {decimalHours(r.totals.leave)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-ink-900">
                    {decimalHours(r.totals.worked + r.totals.leave)}
                  </td>
                  <td className="px-4 py-3 text-caption text-ink-700">
                    {r.decidedBy}
                    {r.decidedAt && (
                      <span className="block text-ink-500">{relativeTime(r.decidedAt)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border bg-sunken font-semibold text-ink-900">
              <tr>
                <td className="px-5 py-3">{plural(approved.length, "clinician")}</td>
                <td />
                <td className="px-4 py-3 text-right">{decimalHours(sum(ordinary))}</td>
                <td className="px-4 py-3 text-right">
                  {decimalHours(sum((r) => r.totals.overtime))}
                </td>
                <td className="px-4 py-3 text-right">{decimalHours(sum((r) => r.totals.leave))}</td>
                <td className="px-4 py-3 text-right">
                  {decimalHours(sum((r) => r.totals.worked + r.totals.leave))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </TableFrame>
    </>
  );
}

/* ------------------------------------------------------------------ history */

function History({ rows }: { rows: TimesheetBoardDto["history"] }) {
  if (!rows.length) {
    return (
      <EmptyNote title="No decisions yet.">
        Approved and returned timesheets are kept here.
      </EmptyNote>
    );
  }
  return (
    <TableFrame>
      <table className="table-stack w-full text-left text-small md:min-w-240">
        <thead className="sticky top-0 border-b border-border bg-sunken text-caption text-ink-500">
          <tr>
            <th className="px-5 py-3 font-medium">Timesheet</th>
            <th className="px-4 py-3 font-medium">Clinician</th>
            <th className="px-4 py-3 font-medium">Week</th>
            <th className="px-4 py-3 text-right font-medium">Hours</th>
            <th className="px-4 py-3 font-medium">Decision</th>
            <th className="px-4 py-3 font-medium">By</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id} className="transition-colors duration-140 hover:bg-sunken">
              <td className="px-5 py-3 font-mono text-caption text-ink-700">{r.ref}</td>
              <td className="px-4 py-3">
                <span className="flex items-center gap-2.5">
                  <Avatar name={r.staffName} src={r.photoUrl} size={30} kind="staff" />
                  <span className="font-semibold text-ink-900">{r.staffName}</span>
                </span>
              </td>
              <td className="px-4 py-3 text-ink-700">Week of {day(r.week)}</td>
              <td className="px-4 py-3 text-right text-ink-700">
                {r.workedMinutes ? hoursLabel(r.workedMinutes) : "—"}
              </td>
              <td className="px-4 py-3">
                <Tag tone={TIMESHEET_TONE[r.status]}>{r.status}</Tag>
                {r.note && (
                  <span className="mt-1 block max-w-64 text-caption text-ink-500">{r.note}</span>
                )}
              </td>
              <td className="px-4 py-3 text-caption text-ink-700">
                {r.byName}
                <span className="block text-ink-500">{relativeTime(r.at)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}
