"use client";

import {
  CalendarCheck,
  CalendarClock,
  CalendarX,
  ChevronDown,
  ClipboardList,
  FileSignature,
  HeartPulse,
  PencilLine,
  Search,
  ShieldCheck,
  Sparkle,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Tag } from "@/components/ui/tag";
import { useNow } from "@/lib/live/client";
import { consentItems, type ParticipantProfileDto } from "@/lib/live/participant";
import { relativeTime, shortDate, timeOfDay } from "@/lib/live/time";
import type { AppointmentDto, ClientDetailDto } from "@/lib/live/types";
import { cn } from "@/lib/cn";

type Kind = "referral" | "service" | "visit" | "change" | "consent";

type Event = {
  id: string;
  at: string;
  kind: Kind;
  icon: LucideIcon;
  title: string;
  detail?: string;
  actor?: string;
  tone: "accent" | "healthy" | "watch" | "over" | "neutral";
  more?: ReactNode;
  upcoming?: boolean;
};

const kinds: { id: Kind | "all"; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "referral", label: "Referrals" },
  { id: "service", label: "Services" },
  { id: "visit", label: "Visits" },
  { id: "change", label: "Record changes" },
  { id: "consent", label: "Consent" },
];

const toneDot: Record<Event["tone"], string> = {
  accent: "bg-accent-tint text-accent ring-accent-tint",
  healthy: "bg-healthy-bg text-healthy ring-healthy-bg",
  watch: "bg-watch-bg text-watch ring-watch-bg",
  over: "bg-over-bg text-over ring-over-bg",
  neutral: "bg-sunken text-ink-700 ring-sunken",
};

const consentLabels = consentItems.map((c) => c.label);

function visitEvent(v: AppointmentDto, now: number): Event | null {
  if (v.status === "tentative") return null;
  const who = `${v.discipline} with ${v.therapistName}${v.series ? ` · visit ${v.series.index} of ${v.series.total}` : ""}`;
  const future = new Date(v.start).getTime() > now;
  const base = { id: `v-${v.id}`, at: v.start, kind: "visit" as const, detail: who };
  switch (v.status) {
    case "completed":
      return {
        ...base,
        icon: CalendarCheck,
        title: "Visit completed",
        tone: "healthy",
        more: v.note?.forPatient ? (
          <p className="rounded-control bg-canvas px-3 py-2 text-small text-ink-700">
            <span className="mb-0.5 block text-caption font-semibold text-ink-500">
              Visit summary
            </span>
            {v.note.forPatient}
          </p>
        ) : undefined,
      };
    case "booked":
      return {
        ...base,
        icon: CalendarClock,
        title: future ? "Visit booked" : "Visit due",
        tone: "accent",
        upcoming: future,
      };
    case "no-show":
      return { ...base, icon: CalendarX, title: "Did not attend", tone: "over" };
    case "aborted":
      return { ...base, icon: CalendarX, title: "Visit stopped early", tone: "watch" };
    case "rescheduled":
      return { ...base, icon: CalendarClock, title: "Visit moved", tone: "neutral" };
    default:
      return {
        ...base,
        icon: CalendarX,
        title: v.status === "late-cancelled" ? "Late cancellation" : "Visit cancelled",
        tone: v.status === "late-cancelled" ? "over" : "neutral",
        more: v.cancellation ? (
          <p className="text-small text-ink-700">
            {v.cancellation.reason} · by{" "}
            {v.cancellation.by === "client" ? "the patient" : "Medisense"} (
            {v.cancellation.actorName}){v.cancellation.chargeable ? " · may be charged" : ""}
          </p>
        ) : undefined,
      };
  }
}

function auditEvent(a: ClientDetailDto["activity"][number]): Event {
  const base = { id: `a-${a.id}`, at: a.at, actor: a.actor, title: a.action };
  if (consentLabels.some((l) => a.action.startsWith(l))) {
    return { ...base, kind: "consent", icon: ShieldCheck, tone: "accent" };
  }
  if (/^Status /.test(a.action)) {
    return { ...base, kind: "change", icon: HeartPulse, tone: "watch" };
  }
  if (
    /Accepted referral|service request|Closed |from the waitlist|request|accepted|Discharg/i.test(
      a.action,
    )
  ) {
    return { ...base, kind: "service", icon: Sparkle, tone: "healthy" };
  }
  return { ...base, kind: "change", icon: PencilLine, tone: "neutral" };
}

const dayKey = (iso: string) => iso.slice(0, 10);
function dayLabel(key: string, now: number) {
  const today = new Date(now).toISOString().slice(0, 10);
  const yesterday = new Date(now - 86_400_000).toISOString().slice(0, 10);
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return shortDate(`${key}T00:00:00Z`);
}

const decisionChip: Record<string, string> = {
  Accepted: "bg-healthy-bg text-healthy",
  Waitlisted: "bg-watch-bg text-watch",
  Declined: "bg-over-bg text-over",
};

/** The patient's whole story: referrals, services, visits, record and consent changes. */
export function PatientHistory({
  client,
  profile,
}: {
  client: ClientDetailDto;
  profile: ParticipantProfileDto | undefined;
}) {
  const now = useNow() ?? 0;
  const [kind, setKind] = useState<Kind | "all">("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState(40);

  const events = useMemo(() => {
    const list: Event[] = [];
    for (const r of profile?.referrals ?? []) {
      r.history.forEach((h, i) =>
        list.push({
          id: `r-${r.id}-${i}`,
          at: h.at,
          kind: "referral",
          icon: i === 0 ? FileSignature : ClipboardList,
          title: `${r.reference} · ${h.status}`,
          detail: h.note || undefined,
          actor: h.byName,
          tone: h.status === "Accepted" ? "healthy" : h.status === "Declined" ? "over" : "accent",
        }),
      );
    }
    for (const v of client.appointments) {
      const e = visitEvent(v, now);
      if (e) list.push(e);
    }
    for (const a of client.activity) list.push(auditEvent(a));
    return list.sort((a, b) => b.at.localeCompare(a.at));
  }, [client, profile, now]);

  const q = query.trim().toLowerCase();
  const filtered = events.filter(
    (e) =>
      (kind === "all" || e.kind === kind) &&
      (!q || `${e.title} ${e.detail ?? ""} ${e.actor ?? ""}`.toLowerCase().includes(q)),
  );
  const visible = filtered.slice(0, shown);
  const groups: [string, Event[]][] = [];
  for (const e of visible) {
    const key = dayKey(e.at);
    const last = groups.at(-1);
    if (last && last[0] === key) last[1].push(e);
    else groups.push([key, [e]]);
  }
  const count = (k: Kind | "all") =>
    k === "all" ? events.length : events.filter((e) => e.kind === k).length;

  const firstReferral = profile?.referrals[0];
  const attended = client.appointments.filter((v) => v.status === "completed").length;
  const upcoming = client.appointments.filter(
    (v) => v.status === "booked" && new Date(v.start).getTime() > now,
  ).length;
  const stats = [
    {
      label: "In care since",
      value: shortDate(firstReferral?.createdAt ?? client.createdAt),
      hint: firstReferral ? `Referral ${firstReferral.reference}` : "Added directly",
    },
    {
      label: "Services",
      value: String(client.needs.length),
      hint: `${client.needs.filter((n) => n.status === "assigned").length} active`,
    },
    { label: "Visits attended", value: String(attended), hint: `${upcoming} upcoming` },
    {
      label: "Last activity",
      value: events[0] ? relativeTime(events[0].at) : "None",
      hint: events[0]?.title.slice(0, 40) ?? "",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-label="At a glance"
        className="grid gap-px overflow-hidden rounded-card border border-border bg-border shadow-lift sm:grid-cols-2 xl:grid-cols-4"
      >
        {stats.map((s) => (
          <div
            key={s.label}
            className="group bg-surface px-5 py-4 transition-colors duration-(--duration-fast) hover:bg-canvas"
          >
            <p className="text-label font-semibold tracking-[0.1em] text-ink-500 uppercase">
              {s.label}
            </p>
            <p className="mt-1.5 type-display text-[26px] leading-8 text-ink-900">{s.value}</p>
            <p className="mt-0.5 truncate text-caption text-ink-500">{s.hint}</p>
          </div>
        ))}
      </section>

      {profile && profile.referrals.length > 0 && (
        <section aria-label="Referrals">
          <h2 className="mb-3 text-label font-semibold tracking-[0.1em] text-ink-500 uppercase">
            Referrals ({profile.referrals.length})
          </h2>
          <div className="flex flex-col gap-4">
            {profile.referrals.map((r) => (
              <ReferralCard key={r.id} referral={r} />
            ))}
          </div>
        </section>
      )}

      <section
        aria-label="Timeline"
        className="rounded-card border border-border bg-surface shadow-lift"
      >
        <div className="flex flex-col gap-3 border-b border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="type-display text-h2">Timeline</h2>
            <label className="flex h-9 w-72 max-w-full items-center gap-2 rounded-control border border-border-strong bg-surface px-3 focus-within:shadow-focus">
              <Search className="size-4 text-ink-500" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search the history"
                placeholder="Search the history"
                className="min-w-0 flex-1 bg-transparent text-small outline-none placeholder:text-ink-500"
              />
            </label>
          </div>
          <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
            {kinds.map((k) => {
              const on = kind === k.id;
              return (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setKind(k.id);
                    setShown(40);
                  }}
                  className={cn(
                    "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-caption font-semibold transition-all duration-(--duration-fast) active:scale-95",
                    on
                      ? "border-accent-fill bg-accent-fill text-on-accent shadow-lift"
                      : "border-border-strong bg-surface text-ink-700 hover:-translate-y-px hover:border-accent hover:text-accent",
                  )}
                >
                  {k.label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-label",
                      on ? "bg-on-accent/20 text-on-accent" : "bg-sunken text-ink-500",
                    )}
                  >
                    {count(k.id)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-accent-tint text-accent ring-8 ring-accent-tint/40">
              <ClipboardList className="size-5" aria-hidden="true" />
            </span>
            <p className="text-body font-semibold">
              {q ? "Nothing matches your search" : "No history yet"}
            </p>
            <p className="mt-1 text-small text-ink-500">
              {q
                ? "Try another word, or show everything."
                : "Events appear here as the patient's care moves on."}
            </p>
          </div>
        ) : (
          <div className="px-4 pb-4">
            {groups.map(([key, items]) => (
              <div key={key}>
                <p className="sticky top-[calc(var(--topbar-h)+3.5rem)] z-[1] -mx-4 border-b border-border bg-surface/95 px-4 py-2 text-caption font-semibold text-ink-700 backdrop-blur">
                  {dayLabel(key, now)}
                  <span className="ml-2 font-normal text-ink-500">
                    {items.length} event{items.length === 1 ? "" : "s"}
                  </span>
                </p>
                <ol className="relative mt-2 mb-3 ml-4 border-l border-border pl-6">
                  {items.map((e) => {
                    const Icon = e.icon;
                    const expanded = open === e.id;
                    return (
                      <li key={e.id} className="bubble-in relative py-1.5">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "absolute top-3 -left-[39px] flex size-7 items-center justify-center rounded-full ring-4 transition-transform duration-(--duration-fast)",
                            toneDot[e.tone],
                            expanded && "scale-110",
                          )}
                        >
                          <Icon className="size-3.5" strokeWidth={2} />
                        </span>
                        <button
                          type="button"
                          aria-expanded={e.more ? expanded : undefined}
                          onClick={() => e.more && setOpen(expanded ? null : e.id)}
                          className={cn(
                            "group flex w-full items-start gap-3 rounded-control px-3 py-2 text-left transition-all duration-(--duration-fast)",
                            e.more ? "cursor-pointer" : "cursor-default",
                            "hover:translate-x-0.5 hover:bg-canvas",
                            expanded && "bg-canvas",
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-small font-semibold text-ink-900">
                                {e.title}
                              </span>
                              {e.upcoming && <Tag tone="monitor">Upcoming</Tag>}
                            </span>
                            {e.detail && (
                              <span className="block text-small text-ink-700">{e.detail}</span>
                            )}
                            <span className="mt-0.5 block text-caption text-ink-500">
                              {timeOfDay(e.at)}
                              {e.actor && ` · ${e.actor}`}
                            </span>
                          </span>
                          {e.more && (
                            <ChevronDown
                              aria-hidden="true"
                              className={cn(
                                "mt-1 size-4 flex-none text-ink-500 transition-transform duration-(--duration-fast) group-hover:text-ink-900",
                                expanded && "rotate-180",
                              )}
                            />
                          )}
                        </button>
                        {expanded && e.more && <div className="bubble-in mt-1 ml-3">{e.more}</div>}
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
            {filtered.length > visible.length && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setShown((n) => n + 40)}
                  className="h-9 cursor-pointer rounded-full border border-border-strong px-4 text-small font-semibold text-ink-700 transition-all duration-(--duration-fast) hover:-translate-y-px hover:border-accent hover:text-accent active:scale-95"
                >
                  Show {Math.min(40, filtered.length - visible.length)} more
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function ReferralCard({ referral: r }: { referral: ParticipantProfileDto["referrals"][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="overflow-hidden rounded-card border border-border bg-surface shadow-lift transition-[border-color,box-shadow] duration-(--duration-fast) hover:border-accent/40 hover:shadow-overlay">
      <div className="grid divide-y divide-border lg:grid-cols-[minmax(240px,300px)_1fr_minmax(260px,340px)] lg:divide-x lg:divide-y-0">
        <div className="flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-label font-semibold tracking-[0.1em] text-ink-500 uppercase">
              Referral
            </span>
            <Tag
              tone={
                r.status === "Accepted" ? "healthy" : r.status === "Declined" ? "over" : "monitor"
              }
            >
              {r.status}
            </Tag>
          </div>
          <p className="font-mono text-body font-semibold break-all text-ink-900">{r.reference}</p>
          <p className="text-caption text-ink-500">
            Received {shortDate(r.createdAt)} · {r.enteredBy}
          </p>
          <Link
            href={`/care/referrals/${r.id}`}
            className="mt-auto inline-flex h-9 w-fit items-center gap-1.5 rounded-control bg-accent-tint px-3 text-caption font-semibold text-accent transition-all duration-(--duration-fast) hover:-translate-y-px hover:bg-accent-fill hover:text-on-accent hover:no-underline active:scale-95"
          >
            Open referral →
          </Link>
        </div>
        <dl className="grid content-start gap-x-4 gap-y-2.5 p-5 text-small sm:grid-cols-[110px_1fr]">
          <dt className="text-ink-500">Referred by</dt>
          <dd className="min-w-0">{r.submitter}</dd>
          <dt className="text-ink-500">Funding</dt>
          <dd>{r.funding}</dd>
          <dt className="text-ink-500">Location</dt>
          <dd>{r.location}</dd>
          <dt className="text-ink-500">Goals</dt>
          <dd className="text-ink-700">{r.goals || "Not given"}</dd>
        </dl>
        <div className="flex flex-col gap-2.5 p-5">
          <span className="text-label font-semibold tracking-[0.1em] text-ink-500 uppercase">
            Services requested
          </span>
          <ul className="flex flex-col gap-2">
            {r.supports.map((s) => (
              <li
                key={s.name}
                className="flex items-center justify-between gap-3 rounded-control border border-border px-3 py-2 transition-colors duration-(--duration-fast) hover:bg-canvas"
              >
                <span className="min-w-0">
                  <span className="block truncate text-small font-semibold text-ink-900">
                    {s.name}
                  </span>
                  <span className="block text-caption text-ink-500">{s.frequency}</span>
                </span>
                <span
                  className={cn(
                    "flex-none rounded-tag px-2 py-0.5 text-label font-semibold",
                    decisionChip[s.decision ?? ""] ?? "bg-sunken text-ink-700",
                  )}
                >
                  {s.decision ?? "Requested"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center justify-between gap-2 border-t border-border px-5 py-3 text-small font-semibold text-ink-700 transition-colors duration-(--duration-fast) hover:bg-canvas hover:text-ink-900"
      >
        <span>Referral journey · {r.history.length} steps</span>
        <ChevronDown
          className={cn(
            "size-4 transition-transform duration-(--duration-base)",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      {open && (
        <ol className="bubble-in grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-px border-t border-border bg-border">
          {r.history.map((h, i) => {
            const last = i === r.history.length - 1;
            return (
              <li key={i} className="flex flex-col gap-1 bg-surface px-5 py-4">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-6 flex-none items-center justify-center rounded-full text-label font-bold",
                      last ? "bg-accent-fill text-on-accent" : "bg-healthy-bg text-healthy",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="text-small font-semibold text-ink-900">{h.status}</span>
                </span>
                {h.note && <span className="text-caption text-ink-700">{h.note}</span>}
                <span className="mt-auto pt-1 text-caption text-ink-500">
                  {h.byName} · {shortDate(h.at)}, {timeOfDay(h.at)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </article>
  );
}
