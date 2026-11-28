"use client";

import {
  CalendarCheck2,
  CalendarClock,
  CalendarX2,
  Check,
  Clock3,
  Search,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { RuleMark } from "@/components/ai/provenance";
import { Button } from "@/components/ui/button";
import { MetricBand } from "@/components/ui/metric-band";
import { PageHeader } from "@/components/ui/page";
import { Avatar } from "@/components/ui/premium";
import { Select } from "@/components/ui/select";
import { inputClass } from "@/components/ui/sheet";
import { TableFrame } from "@/components/ui/table-frame";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { Tag, type TagTone } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { api, useResource } from "@/lib/live/client";
import type {
  AwayDto,
  LeaveBalanceDto,
  LeaveBoardDto,
  LeaveRequestDto,
  LeaveStatus,
  StaffBalanceDto,
} from "@/lib/live/leave";
import { relativeTime, shortDate } from "@/lib/live/time";
import { EmptyNote, ErrorNote, LiveBadge, Skeleton } from "./bits";

export const LEAVE_STATUS_TONE: Record<LeaveStatus, TagTone> = {
  Pending: "watch",
  Approved: "healthy",
  Declined: "over",
  Cancelled: "neutral",
};

const day = (key: string) => shortDate(`${key}T00:00:00Z`);
export const leaveRange = (from: string, to: string) =>
  from === to ? day(from) : `${day(from)} to ${day(to)}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** People and HR: leave requests to decide, who's away, balances and past decisions. */
export function LeaveBoard({
  embedded = false,
}: {
  /** Inside People and HR, which brings its own title and owns the address. */
  embedded?: boolean;
} = {}) {
  const { data, error, loading, reload } = useResource<LeaveBoardDto>(
    "/api/care/hr/leave",
    (e) => e.type === "care",
  );
  const tabs = [
    {
      id: "requests" as const,
      label: "Requests",
      count: data?.pending.length,
      alert: true,
    },
    { id: "away" as const, label: "Who's away" },
    { id: "balances" as const, label: "Balances", count: data?.balances.length },
    { id: "history" as const, label: "History", count: data?.history.length },
  ];
  const addressTab = useTab(tabs, "requests");
  const localTab = useState<(typeof tabs)[number]["id"]>("requests");
  const [tab, setTab] = embedded ? localTab : addressTab;
  const s = data?.summary;

  return (
    <>
      {!embedded && (
        <PageHeader
          eyebrow="People and HR"
          title="Leave and absence"
          description="Leave requests with what each one means for patients and the team, who's away, and every clinician's balance."
          actions={<LiveBadge />}
        />
      )}
      {error && !data ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-12" />
          <Skeleton className="h-96" />
        </div>
      ) : data && s ? (
        <div className="flex flex-col gap-5">
          <MetricBand
            size="stat-sm"
            label="Leave figures"
            metrics={[
              {
                label: "To decide",
                value: s.pending,
                caption: "Requests waiting",
                tone: "watch",
                flagged: s.pending > 0,
              },
              { label: "Away today", value: s.awayToday, caption: "Clinicians on leave" },
              { label: "Away in 14 days", value: s.awayNext14, caption: "Approved leave" },
              {
                label: "Visits to cover",
                value: s.visitsToCover,
                caption: "Booked on leave days",
                tone: "over",
                flagged: s.visitsToCover > 0,
              },
              {
                label: "Days taken",
                value: s.approvedDaysThisYear,
                caption: `Working days in ${data.today.slice(0, 4)}`,
              },
              {
                label: "Time to decide",
                value: s.avgDecisionHours === null ? "—" : `${s.avgDecisionHours} h`,
                caption: "Average, last 90 days",
              },
            ]}
          />
          <div>
            <Tabs label="Leave" tabs={tabs} value={tab} onChange={setTab} />
            <TabPanel id="requests" value={tab}>
              <Requests rows={data.pending} onChanged={reload} />
            </TabPanel>
            <TabPanel id="away" value={tab}>
              <WhosAway days={data.days} today={data.today} rows={data.away} />
            </TabPanel>
            <TabPanel id="balances" value={tab}>
              <Balances rows={data.balances} />
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

/* ------------------------------------------------------------------ requests */

function Requests({ rows, onChanged }: { rows: LeaveRequestDto[]; onChanged: () => void }) {
  if (!rows.length) {
    return (
      <EmptyNote title="No leave requests waiting.">
        New requests from clinicians appear here with their impact on patients and the team.
      </EmptyNote>
    );
  }
  return (
    <>
      <p className="mb-3 flex flex-wrap items-center gap-2 text-small text-ink-700">
        <RuleMark>Rule</RuleMark>
        Visits, team cover, notice and balance are checked automatically. You decide; approved leave
        stops new bookings on those days and flags booked visits to move.
      </p>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <RequestCard key={r.id} r={r} onChanged={onChanged} />
        ))}
      </ul>
    </>
  );
}

function ImpactLine({
  tone,
  icon: Icon,
  children,
}: {
  tone: "ok" | "watch" | "over";
  icon: typeof Check;
  children: ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex items-start gap-2 text-small",
        tone === "over" ? "text-over" : tone === "watch" ? "text-watch" : "text-ink-700",
      )}
    >
      <Icon
        className={cn("mt-0.5 size-4 flex-none", tone === "ok" && "text-healthy")}
        aria-hidden="true"
      />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function RequestCard({ r, onChanged }: { r: LeaveRequestDto; onChanged: () => void }) {
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [showVisits, setShowVisits] = useState(false);
  const i = r.impact;

  async function decide(decision: "Approve" | "Decline") {
    setBusy(true);
    try {
      const res = await api<{ affected: number }>("/api/care/hr/leave", {
        body: { id: r.id, decision, note: note.trim() },
      });
      toast(
        decision === "Approve"
          ? `Approved ${r.staffName}'s leave${res.affected ? `: ${plural(res.affected, "visit")} flagged to move` : ""}`
          : `Declined ${r.staffName}'s leave`,
      );
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save the decision.");
    } finally {
      setBusy(false);
    }
  }

  const visible = showVisits ? i.visits : i.visits.slice(0, 2);
  return (
    <li className="grid gap-5 rounded-card border border-border bg-surface px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_220px]">
      <div className="flex min-w-0 flex-col gap-3">
        <Link
          href={`/care/therapists/${r.staffId}`}
          className="flex min-w-0 items-center gap-3 hover:no-underline"
        >
          <Avatar name={r.staffName} src={r.photoUrl} size={44} kind="staff" />
          <span className="min-w-0">
            <span className="block font-semibold text-ink-900">{r.staffName}</span>
            <span className="block truncate text-caption text-ink-500">
              {r.discipline} · {r.region}
            </span>
          </span>
        </Link>
        <div>
          <p className="flex flex-wrap items-center gap-2">
            <Tag tone="outline">{r.type}</Tag>
            <span className="font-mono text-caption text-ink-500">{r.ref}</span>
          </p>
          <p className="mt-2 text-section font-semibold text-ink-900">{leaveRange(r.from, r.to)}</p>
          <p className="text-caption text-ink-500">
            {plural(i.workingDays, "working day")} · {i.hours} h · asked{" "}
            {relativeTime(r.requestedAt)}
          </p>
          {r.note && (
            <p className="mt-2 rounded-control bg-sunken px-3 py-2 text-small text-ink-700">
              “{r.note}”
            </p>
          )}
        </div>
      </div>

      <ul className="flex min-w-0 flex-col gap-2 lg:border-l lg:border-border lg:pl-5">
        <li className="mb-0.5">
          <RuleMark>Rule checks</RuleMark>
        </li>
        {i.visits.length ? (
          <ImpactLine tone="over" icon={CalendarX2}>
            <span className="font-semibold">{plural(i.visits.length, "booked visit")} to move</span>
            <span className="mt-0.5 block text-caption text-ink-700">
              {visible.map((v) => `${v.patient}, ${v.when}`).join(" · ")}
              {i.visits.length > 2 && (
                <button
                  type="button"
                  onClick={() => setShowVisits((x) => !x)}
                  className="ml-1 cursor-pointer font-semibold text-accent"
                >
                  {showVisits ? "Show less" : `+${i.visits.length - 2} more`}
                </button>
              )}
            </span>
          </ImpactLine>
        ) : (
          <ImpactLine tone="ok" icon={CalendarCheck2}>
            No booked visits on those days
          </ImpactLine>
        )}
        {i.caseloadVisits > 0 && (
          <ImpactLine tone="watch" icon={CalendarClock}>
            About {plural(i.caseloadVisits, "regular caseload visit")} from the practice system
          </ImpactLine>
        )}
        {i.teamAway.length ? (
          <ImpactLine tone="watch" icon={Users}>
            Also away from {r.discipline} · {r.region}:{" "}
            {i.teamAway
              .map(
                (a) =>
                  `${a.name} (${leaveRange(a.from, a.to)}${a.status === "Pending" ? ", asked" : ""})`,
              )
              .join(", ")}
          </ImpactLine>
        ) : (
          <ImpactLine tone="ok" icon={Users}>
            No one else in {r.discipline} · {r.region} is away then
          </ImpactLine>
        )}
        {i.balanceAfter !== null &&
          (i.balanceAfter < 0 ? (
            <ImpactLine tone="over" icon={Wallet}>
              Over the {r.type.toLowerCase()} balance by {Math.abs(i.balanceAfter)} days
            </ImpactLine>
          ) : (
            <ImpactLine tone="ok" icon={Wallet}>
              {i.balanceAfter} days of {r.type.toLowerCase()} left after this
            </ImpactLine>
          ))}
        {i.shortNotice && (
          <ImpactLine tone="watch" icon={Clock3}>
            Short notice: less than 14 days before it starts
          </ImpactLine>
        )}
      </ul>

      <div className="flex flex-col gap-2 lg:items-stretch">
        {declining ? (
          <>
            <label className="flex flex-col gap-1 text-caption font-semibold text-ink-700">
              Reason for declining
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
              onClick={() => decide("Decline")}
            >
              Confirm decline
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDeclining(false)}>
              Back
            </Button>
          </>
        ) : (
          <>
            <Button variant="primary" size="sm" disabled={busy} onClick={() => decide("Approve")}>
              <Check className="size-4" aria-hidden="true" />
              Approve
            </Button>
            <Button size="sm" disabled={busy} onClick={() => setDeclining(true)}>
              <X className="size-4" aria-hidden="true" />
              Decline
            </Button>
            {i.visits.length > 0 && (
              <p className="text-caption text-ink-500">
                Approving flags the visits on the schedule for reassignment. Nothing is moved
                automatically.
              </p>
            )}
          </>
        )}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ who's away */

function WhosAway({ days, today, rows }: { days: string[]; today: string; rows: AwayDto[] }) {
  const people = new Map<string, { row: AwayDto; spans: AwayDto[] }>();
  for (const r of rows) {
    const p = people.get(r.staffId) ?? { row: r, spans: [] };
    p.spans.push(r);
    people.set(r.staffId, p);
  }
  const list = [...people.values()].sort((a, b) => a.row.staffName.localeCompare(b.row.staffName));
  const awayOn = (k: string) =>
    rows.filter((r) => r.status === "Approved" && r.from <= k && k <= r.to);
  if (!list.length) {
    return (
      <EmptyNote title="No one is away in the next three weeks.">
        Approved and requested leave shows here day by day.
      </EmptyNote>
    );
  }
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-caption text-ink-700">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-tag bg-available-dot" aria-hidden="true" /> Approved
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="size-3 rounded-tag border border-dashed border-watch bg-watch-bg"
            aria-hidden="true"
          />{" "}
          Requested, not decided
        </span>
        <span className="ml-auto text-ink-500">Next three working weeks</span>
      </div>
      <TableFrame>
        <table className="w-full min-w-240 border-separate border-spacing-0 text-left text-small">
          <thead className="sticky top-0 bg-sunken text-caption text-ink-500">
            <tr>
              <th className="sticky left-0 z-10 border-b border-border bg-sunken px-4 py-2 font-medium">
                Clinician
              </th>
              {days.map((k) => (
                <th
                  key={k}
                  className={cn(
                    "border-b border-border px-1 py-2 text-center font-medium whitespace-nowrap",
                    k === today && "text-accent",
                  )}
                >
                  <span className="block">{day(k).split(" ")[0]}</span>
                  <span className="block font-semibold">
                    {day(k).split(" ").slice(1).join(" ")}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map(({ row, spans }) => (
              <tr key={row.staffId}>
                <td className="sticky left-0 z-10 border-b border-border bg-surface px-4 py-2">
                  <Link
                    href={`/care/therapists/${row.staffId}`}
                    className="flex items-center gap-2.5 hover:no-underline"
                  >
                    <Avatar name={row.staffName} src={row.photoUrl} size={30} kind="staff" />
                    <span className="min-w-0">
                      <span className="block font-semibold whitespace-nowrap text-ink-900">
                        {row.staffName}
                      </span>
                      <span className="block text-caption whitespace-nowrap text-ink-500">
                        {row.discipline}
                      </span>
                    </span>
                  </Link>
                </td>
                {days.map((k) => {
                  const s = spans.find((x) => x.from <= k && k <= x.to);
                  return (
                    <td
                      key={k}
                      className={cn(
                        "border-b border-border px-0.5 py-2",
                        k === today && "bg-accent-tint",
                      )}
                    >
                      {s ? (
                        <span
                          title={`${s.staffName}: ${s.reason}, ${leaveRange(s.from, s.to)}${s.status === "Pending" ? " (requested)" : ""}`}
                          className={cn(
                            "block h-7 rounded-tag",
                            s.status === "Approved"
                              ? "bg-available-dot"
                              : "border border-dashed border-watch bg-watch-bg",
                          )}
                        >
                          <span className="sr-only">
                            {s.reason}
                            {s.status === "Pending" ? ", requested" : ""}
                          </span>
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td className="sticky left-0 z-10 bg-sunken px-4 py-2 text-caption font-semibold text-ink-700">
                Away that day
              </td>
              {days.map((k) => {
                const n = awayOn(k).length;
                return (
                  <td
                    key={k}
                    className={cn(
                      "bg-sunken px-1 py-2 text-center text-caption font-semibold",
                      n >= 3 ? "text-over" : n > 0 ? "text-ink-900" : "text-ink-500",
                    )}
                  >
                    {n}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </TableFrame>
    </>
  );
}

/* ------------------------------------------------------------------ balances */

function BalanceBar({ b, label }: { b: LeaveBalanceDto; label: string }) {
  const total = Math.max(b.entitlement, b.taken + b.booked + b.pending, 1);
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="min-w-44">
      <div className="flex items-baseline justify-between gap-2 text-caption">
        <span className={cn("font-semibold", b.remaining < 0 ? "text-over" : "text-ink-900")}>
          {b.remaining} left
        </span>
        <span className="text-ink-500">of {b.entitlement}</span>
      </div>
      <div
        role="img"
        aria-label={`${label}: ${b.taken} taken, ${b.booked} booked, ${b.pending} requested, ${b.remaining} left of ${b.entitlement}`}
        className="mt-1 flex h-2 overflow-hidden rounded-full bg-sunken"
      >
        <span className="bg-ink-700" style={{ width: pct(b.taken) }} />
        <span className="bg-available-dot" style={{ width: pct(b.booked) }} />
        <span className="bg-watch-dot" style={{ width: pct(b.pending) }} />
      </div>
    </div>
  );
}

function Balances({ rows: all }: { rows: StaffBalanceDto[] }) {
  const [query, setQuery] = useState("");
  const [discipline, setDiscipline] = useState("");
  const q = query.trim().toLowerCase();
  const disciplines = [...new Set(all.map((r) => r.discipline))].sort();
  const rows = all
    .filter((r) => !discipline || r.discipline === discipline)
    .filter((r) => !q || `${r.staffName} ${r.region}`.toLowerCase().includes(q));
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-lift">
        <span className="mr-1 label-caps text-ink-500">Filter</span>
        <div className="w-56 flex-none">
          <Select
            aria-label="Discipline"
            className="h-9"
            value={discipline}
            onChange={(e) => setDiscipline(e.target.value)}
          >
            <option value="">Any discipline</option>
            {disciplines.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </Select>
        </div>
        <span className="flex flex-wrap items-center gap-3 text-caption text-ink-700">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-ink-700" aria-hidden="true" /> Taken
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-available-dot" aria-hidden="true" /> Booked
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-watch-dot" aria-hidden="true" /> Requested
          </span>
        </span>
        <span className="ml-auto text-caption text-ink-500">
          {rows.length} of {all.length}
        </span>
        <label className="flex h-9 w-64 max-w-full items-center gap-2 rounded-control border border-border-strong bg-surface px-3 focus-within:shadow-focus">
          <Search className="size-4 text-ink-500" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search clinicians"
            placeholder="Clinician or region"
            className="min-w-0 flex-1 bg-transparent text-small outline-none placeholder:text-ink-500"
          />
        </label>
      </div>
      <p className="mb-3 flex flex-wrap items-center gap-2 text-small text-ink-700">
        <RuleMark>Rule</RuleMark>
        20 days of annual leave and 10 of personal leave a year for a five-day week, pro-rata to the
        days each clinician works. Counted in working days.
      </p>
      <TableFrame>
        {rows.length === 0 ? (
          <EmptyNote title="No clinicians match.">Try another filter or search.</EmptyNote>
        ) : (
          <table className="table-stack w-full text-left text-small md:min-w-240">
            <thead className="sticky top-0 border-b border-border bg-sunken text-caption text-ink-500">
              <tr>
                <th className="px-5 py-3 font-medium">Clinician</th>
                <th className="px-4 py-3 text-right font-medium">Days a week</th>
                <th className="px-4 py-3 font-medium">Annual leave</th>
                <th className="px-4 py-3 text-right font-medium">Taken · booked</th>
                <th className="px-4 py-3 font-medium">Personal leave</th>
                <th className="px-4 py-3 text-right font-medium">Taken</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.staffId} className="transition-colors duration-140 hover:bg-sunken">
                  <td className="px-5 py-3">
                    <Link
                      href={`/care/therapists/${r.staffId}`}
                      className="flex items-center gap-3 hover:no-underline"
                    >
                      <Avatar name={r.staffName} src={r.photoUrl} size={34} kind="staff" />
                      <span className="min-w-0">
                        <span className="block font-semibold text-ink-900">{r.staffName}</span>
                        <span className="block text-caption text-ink-500">
                          {r.discipline} · {r.region}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right text-ink-700">{r.daysPerWeek}</td>
                  <td className="px-4 py-3">
                    <BalanceBar b={r.annual} label="Annual leave" />
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-ink-700">
                    {r.annual.taken} · {r.annual.booked}
                    {r.annual.pending > 0 && (
                      <span className="block text-caption text-watch">
                        {r.annual.pending} requested
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <BalanceBar b={r.personal} label="Personal leave" />
                  </td>
                  <td className="px-4 py-3 text-right text-ink-700">{r.personal.taken}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableFrame>
    </>
  );
}

/* ------------------------------------------------------------------ history */

function History({ rows }: { rows: LeaveRequestDto[] }) {
  if (!rows.length) {
    return (
      <EmptyNote title="No decisions yet.">
        Approved, declined and withdrawn requests are kept here.
      </EmptyNote>
    );
  }
  return (
    <TableFrame>
      <table className="table-stack w-full text-left text-small md:min-w-240">
        <thead className="sticky top-0 border-b border-border bg-sunken text-caption text-ink-500">
          <tr>
            <th className="px-5 py-3 font-medium">Request</th>
            <th className="px-4 py-3 font-medium">Clinician</th>
            <th className="px-4 py-3 font-medium">Leave</th>
            <th className="px-4 py-3 text-right font-medium">Days</th>
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
              <td className="px-4 py-3">
                <span className="block text-ink-900">{leaveRange(r.from, r.to)}</span>
                <span className="block text-caption text-ink-500">{r.type}</span>
              </td>
              <td className="px-4 py-3 text-right text-ink-700">{r.impact.workingDays}</td>
              <td className="px-4 py-3">
                <Tag tone={LEAVE_STATUS_TONE[r.status]}>{r.status}</Tag>
                {r.decisionNote && r.status !== "Cancelled" && (
                  <span className="mt-1 block max-w-64 text-caption text-ink-500">
                    {r.decisionNote}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-caption text-ink-700">
                {r.decidedBy ?? "—"}
                {r.decidedAt && (
                  <span className="block text-ink-500">{relativeTime(r.decidedAt)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}
