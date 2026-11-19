"use client";

import {
  ArrowRight,
  Bot,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  CircleUserRound,
  House,
  LayoutGrid,
  ListChecks,
  LogOut,
  type LucideIcon,
  MessageCircleQuestion,
  Send,
  ShieldCheck,
  Sunrise,
  UserRoundPlus,
  Users,
  Video,
  House as HomeVisit,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { resolveQuestion } from "@/components/shell/assistant-panel";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/premium";
import { Tag, type TagTone } from "@/components/ui/tag";
import {
  AppCard,
  AppEmpty,
  AppHeader,
  AppSection,
  AppSheet,
  AppWebView,
  IconBadge,
  PhoneFrame,
  type BadgeTone,
} from "@/features/mobile/phone-frame";
import { cn } from "@/lib/cn";
import type { Answer } from "@/lib/knowledge/state";
import type { AdminAgentDto, AgentReply } from "@/lib/live/agent";
import { signOut, useNow, useResource, useSession } from "@/lib/live/client";
import type { TaskDto } from "@/lib/live/operations";
import type { ScheduleBoardDto, ScheduleEventDto } from "@/lib/live/scheduling";
import { timeOfDay } from "@/lib/live/time";
import type { LiveOverviewDto, SessionUser } from "@/lib/live/types";
import { navigationFor } from "@/lib/navigation";
import { AgentAnswer, agentCall } from "./agent-ui";
import { Skeleton } from "./bits";
import { BookingAgent } from "./booking-agent";
import { BookVisitPanel } from "./quick-book";
import { SignInForm } from "./sign-in-form";

const tabs = [
  { id: "home", label: "Home", icon: House },
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "ask", label: "Ask AI", icon: Bot },
  { id: "work", label: "Work", icon: LayoutGrid },
  { id: "me", label: "Me", icon: CircleUserRound },
];

const frame = {
  name: "Admin app",
  description:
    "For the people who run the practice: today's briefing, the whole team's schedule, booking a caller in seconds, and the AI agents that answer from live records.",
  features: [
    "Today's operations briefing and your tasks",
    "Every clinician's visits, day by day",
    "Book someone new from a name and phone",
    "Ask Medisense, the operations agent and the booking agent",
    "Every portal section your role can open",
  ],
};

const DAY = 86_400_000;
const brisbane = (iso: string | number, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Brisbane", ...o }).format(new Date(iso));
const dayKey = (iso: string | number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane" }).format(new Date(iso));

type Ctx = {
  user: SessionUser;
  open: (node: ReactNode) => void;
  close: () => void;
  web: (title: string, href: string) => void;
  onTab: (id: string) => void;
  setAskMode: (m: AskMode) => void;
};

type AskMode = "ask" | "ops" | "booking";

/* ------------------------------------------------------------------ app */

export function AdminApp() {
  const { user, loading, reload } = useSession();
  const [tab, setTab] = useState("home");
  const [sheet, setSheet] = useState<ReactNode>(null);
  const [askMode, setAskMode] = useState<AskMode>("ask");
  const signedIn = user?.role === "admin";

  if (loading) {
    return (
      <PhoneFrame {...frame} tabs={tabs} active={tab} onTab={setTab}>
        <div className="p-4 pt-14">
          <Skeleton className="h-40" />
        </div>
      </PhoneFrame>
    );
  }

  if (!signedIn || !user) {
    return (
      <PhoneFrame {...frame} tabs={tabs} active="home" onTab={() => undefined}>
        <AppHeader eyebrow="Medisense" title="Admin sign-in" />
        <div className="p-4">
          {user && (
            <p className="mb-3 rounded-control bg-watch-bg px-3 py-2 text-small text-watch">
              You&apos;re signed in as {user.role === "client" ? "a patient" : "a therapist"}. Sign
              in with an admin account to use this app.
            </p>
          )}
          <AppCard>
            <SignInForm staffOnly onSignedIn={() => reload()} />
          </AppCard>
        </div>
      </PhoneFrame>
    );
  }

  const close = () => setSheet(null);
  const ctx: Ctx = {
    user,
    open: setSheet,
    close,
    web: (title, href) => setSheet(<AppWebView title={title} href={href} onClose={close} />),
    onTab: setTab,
    setAskMode: (m) => {
      setAskMode(m);
      setTab("ask");
    },
  };

  return (
    <PhoneFrame {...frame} tabs={tabs} active={tab} onTab={setTab} overlay={sheet ?? undefined}>
      {tab === "schedule" ? (
        <ScheduleTab ctx={ctx} />
      ) : tab === "ask" ? (
        <AskTab mode={askMode} onMode={setAskMode} ctx={ctx} />
      ) : tab === "work" ? (
        <WorkTab ctx={ctx} />
      ) : tab === "me" ? (
        <MeTab ctx={ctx} onSignedOut={reload} />
      ) : (
        <HomeTab ctx={ctx} />
      )}
    </PhoneFrame>
  );
}

function quickBook(ctx: Ctx) {
  ctx.open(
    <AppSheet title="Book a visit" onClose={ctx.close}>
      <BookVisitPanel initial="new" />
    </AppSheet>,
  );
}

/* ------------------------------------------------------------------ home */

const briefTone: Record<string, string> = {
  over: "bg-over-bg text-over",
  watch: "bg-watch-bg text-watch",
  neutral: "bg-sunken text-ink-900",
};

function HomeTab({ ctx }: { ctx: Ctx }) {
  const agent = useResource<AdminAgentDto>("/api/agent", (e) => e.type === "care");
  const overview = useResource<LiveOverviewDto>("/api/care/overview", (e) => e.type === "care");
  const tasks = useResource<{ tasks: TaskDto[] }>("/api/care/operations/mine");
  const first = ctx.user.name.split(" ")[0];
  const now = useNow() ?? 0;
  const hour = now ? Number(brisbane(now, { hour: "numeric", hourCycle: "h23" })) : 9;
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const o = overview.data;
  const open = (tasks.data?.tasks ?? []).filter(
    (t) => !["Completed", "Cancelled"].includes(t.status),
  );
  const week = o?.visits.week ?? [];
  const peak = Math.max(1, ...week.map((d) => d.booked));
  const actions: {
    label: string;
    detail: string;
    icon: LucideIcon;
    tone: BadgeTone;
    go: () => void;
  }[] = [
    {
      label: "Book someone new",
      detail: "Name and phone",
      icon: UserRoundPlus,
      tone: "teal",
      go: () => quickBook(ctx),
    },
    {
      label: "Booking agent",
      detail: "Assign, book, move",
      icon: CalendarPlus,
      tone: "blue",
      go: () => ctx.setAskMode("booking"),
    },
    {
      label: "Ask Medisense",
      detail: "Plain English",
      icon: MessageCircleQuestion,
      tone: "violet",
      go: () => ctx.setAskMode("ask"),
    },
    {
      label: "Operations agent",
      detail: "Proposals to confirm",
      icon: Bot,
      tone: "orange",
      go: () => ctx.setAskMode("ops"),
    },
  ];

  return (
    <>
      <AppHeader
        eyebrow={now ? brisbane(now, { weekday: "long", day: "numeric", month: "long" }) : "Today"}
        title={`${greet}, ${first}`}
        aside={<Avatar name={ctx.user.name} kind="staff" size={44} />}
      >
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(ctx.user.staffRoles.length ? ctx.user.staffRoles : ["Administration"]).map((r) => (
            <span
              key={r}
              className="rounded-full border border-border-strong px-2.5 py-0.5 text-caption font-semibold text-ink-700"
            >
              {r}
            </span>
          ))}
        </div>
      </AppHeader>
      <div className="px-4 pb-6">
        <section
          aria-label="Today's operations briefing"
          className="rounded-card bg-ink-900 p-4 text-page"
        >
          <div className="flex items-center gap-3">
            <IconBadge icon={Sunrise} tone="orange" size={38} />
            <div className="min-w-0 flex-1">
              <p className="text-section font-semibold">Today&apos;s briefing</p>
              <p className="text-caption opacity-70">From live records · tap a figure to act</p>
            </div>
          </div>
          {!agent.data ? (
            <div className="mt-3 h-28 animate-pulse rounded-card bg-page/10" />
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {agent.data.briefing.slice(0, 6).map((b) => (
                <button
                  key={b.label}
                  type="button"
                  onClick={() => ctx.web(b.label, b.href)}
                  className={cn(
                    "flex min-h-19 cursor-pointer flex-col justify-between rounded-control p-2.5 text-left active:scale-98",
                    briefTone[b.tone],
                  )}
                >
                  <span className="type-display text-h2 leading-none">{b.value}</span>
                  <span className="text-[11px] leading-tight font-semibold">{b.label}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <AppSection title="Quick actions" />
        <div className="grid grid-cols-2 gap-2.5">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.go}
              className="flex cursor-pointer items-center gap-2.5 rounded-card border border-border bg-surface p-3 text-left active:scale-98"
            >
              <IconBadge icon={a.icon} tone={a.tone} size={36} />
              <span className="min-w-0">
                <span className="block text-small leading-tight font-semibold text-ink-900">
                  {a.label}
                </span>
                <span className="block truncate text-caption text-ink-500">{a.detail}</span>
              </span>
            </button>
          ))}
        </div>

        <AppSection title="The practice today" />
        {!o ? (
          <Skeleton className="h-44" />
        ) : (
          <AppCard>
            <div className="grid grid-cols-4 gap-2 text-center">
              {(
                [
                  ["Visits today", o.visits.today],
                  ["Active", o.onboarding.active],
                  ["To assign", o.onboarding.needsTherapist],
                  ["Waiting", o.onboarding.waiting],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-control bg-sunken px-1 py-2">
                  <p className="type-display text-h2 leading-none text-ink-900">{value}</p>
                  <p className="mt-1 text-[11px] leading-tight text-ink-500">{label}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-caption font-semibold text-ink-700">Visits booked this week</p>
            <div
              className="mt-2 grid grid-cols-5 items-end gap-2"
              aria-label="Visits booked this week"
            >
              {week.map((d) => (
                <div key={d.day} className="flex flex-col items-center gap-1">
                  <span className="text-caption font-semibold text-ink-900">{d.booked}</span>
                  <div className="flex h-16 w-full items-end overflow-hidden rounded-control bg-sunken">
                    <div
                      className="w-full rounded-control bg-accent-fill"
                      style={{ height: `${(d.booked / peak) * 100}%` }}
                    />
                  </div>
                  <span className="text-caption text-ink-500">
                    {brisbane(d.day, { weekday: "short", timeZone: "UTC" })}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-caption text-ink-700">
              <span>
                {o.team.therapists} clinicians · {o.team.activeClients} of {o.team.capacity} places
              </span>
              {o.team.atRisk > 0 && <Tag tone="over">{o.team.atRisk} At Risk</Tag>}
            </div>
          </AppCard>
        )}

        <AppSection
          title="My tasks"
          action={
            <button
              type="button"
              onClick={() => ctx.web("Operations", "/care/operations")}
              className="cursor-pointer text-caption font-semibold text-accent"
            >
              All tasks
            </button>
          }
        />
        {!tasks.data ? (
          <Skeleton className="h-28" />
        ) : open.length === 0 ? (
          <AppEmpty icon={ListChecks} title="No tasks waiting" compact>
            New tasks from rules and colleagues appear here.
          </AppEmpty>
        ) : (
          <div className="flex flex-col gap-2">
            {open.slice(0, 4).map((t) => {
              const late = now > 0 && new Date(t.dueAt).getTime() < now;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => ctx.web(t.ref, `/care/operations/tasks/${t.id}`)}
                  className="flex cursor-pointer items-center gap-3 rounded-card border border-border bg-surface p-3 text-left active:scale-98"
                >
                  <IconBadge
                    icon={ListChecks}
                    tone={
                      late
                        ? "red"
                        : t.priority === "Urgent" || t.priority === "High"
                          ? "amber"
                          : "blue"
                    }
                    size={34}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-small font-semibold text-ink-900">
                      {t.title}
                    </span>
                    <span className="block truncate text-caption text-ink-500">
                      {t.participant ?? t.category} · due{" "}
                      {brisbane(t.dueAt, { weekday: "short", day: "numeric", month: "short" })}
                    </span>
                  </span>
                  {late ? (
                    <Tag tone="over">Overdue</Tag>
                  ) : (
                    <ChevronRight className="size-4 text-ink-500" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ schedule */

const statusTone: Partial<Record<ScheduleEventDto["status"], TagTone>> = {
  Held: "watch",
  Confirmed: "healthy",
  "In Progress": "available",
  Completed: "neutral",
  Cancelled: "over",
  "No-show": "over",
};

function ScheduleTab({ ctx }: { ctx: Ctx }) {
  const [from] = useState(() => {
    const today = dayKey(Date.now());
    return new Date(`${today}T00:00:00+10:00`).getTime();
  });
  const days = Array.from({ length: 7 }, (_, i) => from + i * DAY);
  const [day, setDay] = useState(from);
  const [who, setWho] = useState("");
  const r = useResource<{ board: ScheduleBoardDto }>(
    `/api/care/schedule?from=${new Date(from).toISOString()}&to=${new Date(from + 7 * DAY).toISOString()}`,
    (e) => e.type === "care",
  );
  const events = (r.data?.board.events ?? []).filter(
    (e) => !["Cancelled", "Rescheduled"].includes(e.status),
  );
  const clinicians = [...new Set(events.map((e) => e.therapist))].sort();
  const shown = events
    .filter((e) => dayKey(e.start) === dayKey(day))
    .filter((e) => !who || e.therapist === who)
    .sort((a, b) => a.start.localeCompare(b.start));
  const countOn = (d: number) => events.filter((e) => dayKey(e.start) === dayKey(d)).length;
  const video = shown.filter((e) => e.modality === "Telehealth").length;

  return (
    <>
      <AppHeader
        eyebrow="The whole team"
        title="Schedule"
        aside={
          <button
            type="button"
            onClick={() => quickBook(ctx)}
            aria-label="Book someone new"
            className="flex size-11 cursor-pointer items-center justify-center rounded-full bg-accent-fill text-on-accent active:scale-95"
          >
            <UserRoundPlus className="size-5" aria-hidden="true" />
          </button>
        }
      >
        <div
          className="no-scrollbar -mx-1 mt-4 flex gap-1.5 overflow-x-auto px-1"
          role="group"
          aria-label="Choose a day"
        >
          {days.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={day === d}
              onClick={() => setDay(d)}
              className={cn(
                "flex w-12 flex-none cursor-pointer flex-col items-center rounded-control py-2",
                day === d ? "bg-accent-fill text-on-accent" : "bg-surface text-ink-700",
              )}
            >
              <span className="text-[11px] font-medium opacity-80">
                {brisbane(d, { weekday: "short" })}
              </span>
              <span className="text-section font-bold">{brisbane(d, { day: "numeric" })}</span>
              <span className="text-[10px] opacity-75">{r.data ? countOn(d) : "·"}</span>
            </button>
          ))}
        </div>
      </AppHeader>
      <div className="px-4 pb-6">
        <div
          className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto"
          role="group"
          aria-label="Clinician"
        >
          {["", ...clinicians].map((c) => (
            <button
              key={c || "all"}
              type="button"
              aria-pressed={who === c}
              onClick={() => setWho(c)}
              className={cn(
                "flex-none cursor-pointer rounded-full border px-3 py-1 text-caption font-semibold",
                who === c
                  ? "border-accent-fill bg-accent-tint text-accent"
                  : "border-border-strong bg-surface text-ink-700",
              )}
            >
              {c || "Everyone"}
            </button>
          ))}
        </div>
        {!r.data ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : shown.length === 0 ? (
          <AppEmpty
            icon={CalendarClock}
            title="No visits this day"
            action={
              <Button size="sm" variant="primary" onClick={() => quickBook(ctx)}>
                Book someone new
              </Button>
            }
          >
            Pick another day, or book a caller in.
          </AppEmpty>
        ) : (
          <>
            <p className="mb-2 text-caption text-ink-500">
              {shown.length} visits · {video} by video · {shown.length - video} home visits
            </p>
            <ol className="flex flex-col gap-2">
              {shown.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => ctx.open(<VisitSheet e={e} ctx={ctx} />)}
                    className="flex w-full cursor-pointer items-stretch gap-3 rounded-card border border-border bg-surface p-3 text-left active:scale-98"
                  >
                    <span className="flex w-13 flex-none flex-col items-center justify-center rounded-control bg-sunken">
                      <span className="text-small font-bold text-ink-900">
                        {timeOfDay(e.start).replace(/ (am|pm)$/, "")}
                      </span>
                      <span className="text-[10px] text-ink-500">
                        {timeOfDay(e.start).slice(-2)}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-small font-semibold text-ink-900">
                        {e.patient}
                      </span>
                      <span className="block truncate text-caption text-ink-500">
                        {e.therapist} · {e.support}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 text-caption whitespace-nowrap text-ink-700">
                        {e.modality === "Telehealth" ? (
                          <Video className="size-3.5 flex-none text-accent" aria-hidden="true" />
                        ) : (
                          <HomeVisit
                            className="size-3.5 flex-none text-accent"
                            aria-hidden="true"
                          />
                        )}
                        {e.modality === "Telehealth" ? "Video visit" : "Home visit"}
                      </span>
                      {e.flags.length > 0 && (
                        <span className="mt-0.5 block truncate text-caption font-semibold text-over">
                          {e.flags[0]?.label}
                        </span>
                      )}
                    </span>
                    <span className="self-center">
                      <Tag tone={statusTone[e.status] ?? "neutral"}>{e.status}</Tag>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </>
  );
}

function VisitSheet({ e, ctx }: { e: ScheduleEventDto; ctx: Ctx }) {
  const rows: [string, string][] = [
    [
      "When",
      `${brisbane(e.start, { weekday: "short", day: "numeric", month: "short" })}, ${timeOfDay(e.start)} to ${timeOfDay(e.end)}`,
    ],
    ["Clinician", `${e.therapist} · ${e.discipline}`],
    ["Service", e.support],
    ["Where", e.modality === "Telehealth" ? "Video visit" : e.location],
    ["Confirmation", e.confirmation],
    ["Reference", e.ref],
  ];
  return (
    <AppSheet
      title={e.patient}
      onClose={ctx.close}
      footer={
        <Button
          variant="primary"
          className="flex-1"
          onClick={() => ctx.web("Scheduling", "/care/schedule")}
        >
          Open in scheduling
        </Button>
      }
    >
      <div className="mb-3 flex items-center gap-3">
        <Avatar name={e.patient} size={48} />
        <div className="min-w-0">
          <p className="text-section font-semibold text-ink-900">{e.patient}</p>
          <Tag tone={statusTone[e.status] ?? "neutral"}>{e.status}</Tag>
        </div>
      </div>
      <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 rounded-card border border-border bg-surface p-3 text-small">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-500">{k}</dt>
            <dd className={cn("text-ink-900", k === "Reference" && "font-mono")}>{v}</dd>
          </div>
        ))}
      </dl>
      {e.flags.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {e.flags.map((f) => (
            <p key={f.label} className="rounded-control bg-over-bg px-3 py-2 text-small text-over">
              {f.label}
            </p>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => ctx.web(e.patient, `/care/${e.clientId}`)}
        className="mt-3 flex w-full cursor-pointer items-center justify-between rounded-card border border-border bg-surface p-3 text-small font-semibold text-ink-900"
      >
        Open patient record
        <ChevronRight className="size-4 text-ink-500" aria-hidden="true" />
      </button>
    </AppSheet>
  );
}

/* ------------------------------------------------------------------ ask */

const ASK_SUGGESTIONS = [
  "Which referrals need attention today?",
  "Who is at risk of being overloaded?",
  "Which visits are not confirmed this week?",
];
const OPS_SUGGESTIONS = [
  "Which referrals need attention?",
  "Who should take the next waiting patient?",
  "Which invoices are overdue?",
];

function AskTab({ mode, onMode, ctx }: { mode: AskMode; onMode: (m: AskMode) => void; ctx: Ctx }) {
  return (
    <>
      <AppHeader eyebrow="Medisense AI" title="Ask AI">
        <div
          role="tablist"
          aria-label="Assistant"
          className="mt-4 grid grid-cols-3 gap-1 rounded-card border border-border bg-sunken p-1"
        >
          {(
            [
              ["ask", "Ask"],
              ["ops", "Operations"],
              ["booking", "Booking agent"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => onMode(id)}
              className={cn(
                "cursor-pointer rounded-control px-1 py-1.5 text-caption font-semibold",
                mode === id ? "bg-surface text-ink-900 ring-1 ring-border" : "text-ink-500",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </AppHeader>
      <div className="px-4 pb-6">
        {mode === "booking" ? (
          <BookingAgent compact />
        ) : mode === "ops" ? (
          <OpsChat />
        ) : (
          <AskChat ctx={ctx} />
        )}
      </div>
    </>
  );
}

/**
 * The message box, pinned to the bottom of the screen just above the tab bar, as in chat apps.
 * Starter questions sit right above it until the conversation begins.
 */
function Composer({
  busy,
  placeholder,
  onSend,
  suggestions,
}: {
  busy: boolean;
  placeholder: string;
  onSend: (q: string) => void;
  suggestions: string[];
}) {
  const [text, setText] = useState("");
  return (
    <div className="absolute inset-x-0 bottom-18 z-20 border-t border-border bg-page px-3 pt-2.5 pb-2 md:bottom-21">
      {suggestions.length > 0 && (
        <div className="no-scrollbar -mx-3 mb-2 flex gap-1.5 overflow-x-auto px-3">
          {suggestions.map((q) => (
            <button
              key={q}
              type="button"
              disabled={busy}
              onClick={() => onSend(q)}
              className="flex-none cursor-pointer rounded-full border border-border-strong bg-surface px-3 py-1.5 text-caption font-semibold whitespace-nowrap text-ink-700 hover:border-accent-fill hover:text-accent disabled:opacity-60"
            >
              {q}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim() || busy) return;
          onSend(text.trim());
          setText("");
        }}
        className="flex items-center gap-1.5 rounded-full border border-border-strong bg-surface p-1.5 pl-4 shadow-lift focus-within:border-accent-fill"
      >
        <input
          aria-label="Message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          className="h-9 min-w-0 flex-1 bg-transparent text-small text-ink-900 outline-none placeholder:text-ink-500 focus-visible:shadow-none"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!text.trim() || busy}
          className="flex size-9 flex-none cursor-pointer items-center justify-center rounded-full bg-accent-fill text-on-accent transition-transform duration-140 active:scale-95 disabled:opacity-40"
        >
          <Send className="size-4" aria-hidden="true" />
        </button>
      </form>
      <p className="mt-1.5 text-center text-label text-ink-500">
        AI can make mistakes. Check before acting.
      </p>
    </div>
  );
}

/** Keeps the newest message in view, as chat apps do. */
function useScrollToEnd(dep: unknown) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [dep]);
  return end;
}

function Thinking({ label }: { label: string }) {
  return (
    <div role="status" className="rounded-card border border-dashed border-draft-rule bg-draft p-4">
      <span className="block h-3 w-3/5 animate-pulse rounded-tag bg-sunken" />
      <span className="mt-2 block h-3 w-full animate-pulse rounded-tag bg-sunken" />
      <span className="mt-2 block text-caption text-ink-500">{label}</span>
    </div>
  );
}

function AskChat({ ctx }: { ctx: Ctx }) {
  const [turns, setTurns] = useState<{ q: string; a: Answer | null }[]>([]);
  const busy = turns.some((t) => !t.a);
  const end = useScrollToEnd(turns);
  async function send(q: string) {
    setTurns((t) => [...t, { q, a: null }]);
    const r = await resolveQuestion(q);
    setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a: r.answer } : x)));
  }
  return (
    <>
      {turns.length === 0 && (
        <AppEmpty icon={MessageCircleQuestion} title="Ask in your own words" compact>
          Answers come from your Medisense records and link to where you act.
        </AppEmpty>
      )}
      <div aria-live="polite" className="flex flex-col gap-4">
        {turns.map((t, i) => (
          <div key={i} className="flex flex-col gap-2">
            <p className="ml-10 self-end rounded-card rounded-br-sm bg-accent-fill px-3 py-2 text-small font-semibold text-on-accent">
              {t.q}
            </p>
            {!t.a ? (
              <Thinking label="Reading your records…" />
            ) : (
              <article className="rounded-card border border-l-2 border-border border-l-accent-fill bg-surface p-3.5">
                <p className="label-caps text-accent">Medisense AI</p>
                <h3 className="mt-1 text-section font-semibold text-ink-900">{t.a.title}</h3>
                <p className="mt-1 text-small leading-relaxed text-ink-700">{t.a.intro}</p>
                {t.a.items.length > 0 && (
                  <ol className="mt-2 flex flex-col gap-1">
                    {t.a.items.slice(0, 6).map((it, n) => (
                      <li key={`${n}-${it.label}`}>
                        <button
                          type="button"
                          disabled={!it.href}
                          onClick={() => it.href && ctx.web(it.label, it.href)}
                          className="flex w-full items-start gap-2 rounded-control px-1 py-1.5 text-left enabled:cursor-pointer enabled:hover:bg-sunken"
                        >
                          <span className="mt-0.5 flex size-5 flex-none items-center justify-center rounded-full bg-accent-tint text-label font-semibold text-accent">
                            {n + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-small font-semibold text-ink-900">
                              {it.label}
                            </span>
                            {it.detail && (
                              <span className="block text-caption text-ink-500">{it.detail}</span>
                            )}
                          </span>
                          {it.href && (
                            <ArrowRight
                              className="mt-1 size-3.5 flex-none text-accent"
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
                <p className="mt-2 border-t border-border pt-2 text-caption text-ink-500">
                  AI answer. Check before acting; a person makes every decision.
                </p>
              </article>
            )}
          </div>
        ))}
      </div>
      <div ref={end} aria-hidden="true" className="h-40" />
      <Composer
        busy={busy}
        placeholder="Ask about patients, the team, visits…"
        onSend={(q) => void send(q)}
        suggestions={turns.length ? [] : ASK_SUGGESTIONS}
      />
    </>
  );
}

function OpsChat() {
  const [turns, setTurns] = useState<{ q: string; reply: AgentReply | null; failed: boolean }[]>(
    [],
  );
  const busy = turns.some((t) => !t.reply && !t.failed);
  const end = useScrollToEnd(turns);
  async function send(q: string) {
    setTurns((t) => [...t, { q, reply: null, failed: false }]);
    const out = await agentCall<{ reply: AgentReply }>("/api/agent", { type: "ask", text: q });
    setTurns((t) =>
      t.map((x, i) => (i === t.length - 1 ? { ...x, reply: out?.reply ?? null, failed: !out } : x)),
    );
  }
  return (
    <>
      {turns.length === 0 && (
        <AppEmpty icon={Bot} title="The operations agent" compact>
          It reads live records and proposes changes. Nothing happens until you confirm.
        </AppEmpty>
      )}
      <div aria-live="polite" className="flex flex-col gap-4">
        {turns.map((t, i) => (
          <div key={i} className="flex flex-col gap-2">
            <p className="ml-10 self-end rounded-card rounded-br-sm bg-accent-fill px-3 py-2 text-small font-semibold text-on-accent">
              {t.q}
            </p>
            {t.reply ? (
              <AgentAnswer reply={t.reply} endpoint="/api/agent" />
            ) : t.failed ? (
              <p className="rounded-control bg-over-bg px-3 py-2 text-small text-over">
                The agent couldn&apos;t answer that. Try again.
              </p>
            ) : (
              <Thinking label="Checking live records…" />
            )}
          </div>
        ))}
      </div>
      <div ref={end} aria-hidden="true" className="h-40" />
      <Composer
        busy={busy}
        placeholder="Ask the operations agent…"
        onSend={(q) => void send(q)}
        suggestions={turns.length ? [] : OPS_SUGGESTIONS}
      />
    </>
  );
}

/* ------------------------------------------------------------------ work */

const sectionTone: Record<string, BadgeTone> = {
  Patients: "blue",
  Therapists: "teal",
  Scheduling: "violet",
  Finance: "green",
  "Operations and AI": "orange",
  Account: "ink",
};

function WorkTab({ ctx }: { ctx: Ctx }) {
  const sections = navigationFor("Admin", ctx.user.staffRoles).filter(
    (g) => g.live && g.group !== "Account",
  );
  const count = sections.reduce((n, g) => n + g.items.length, 0);
  return (
    <>
      <AppHeader eyebrow="Everything in the portal" title="Work">
        <p className="mt-2 flex items-center gap-1.5 text-caption text-ink-500">
          <ShieldCheck className="size-3.5 text-accent" aria-hidden="true" />
          {count} sections open to {ctx.user.staffRoles.join(", ") || "your role"}
        </p>
      </AppHeader>
      <div className="flex flex-col gap-1 px-4 pb-6">
        <button
          type="button"
          onClick={() => quickBook(ctx)}
          className="flex cursor-pointer items-center gap-3 rounded-card bg-ink-900 p-4 text-left text-page active:scale-98"
        >
          <span className="flex size-11 flex-none items-center justify-center rounded-full bg-page/15">
            <UserRoundPlus className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block type-display text-h2 leading-tight">Book someone new</span>
            <span className="block text-caption opacity-75">A name and phone are enough</span>
          </span>
          <ChevronRight className="size-5 opacity-70" aria-hidden="true" />
        </button>
        {sections.map((g) => (
          <section key={g.group} aria-label={g.group}>
            <AppSection title={g.group} />
            <div className="grid grid-cols-2 gap-2.5">
              {g.items.map((it) => (
                <button
                  key={it.href}
                  type="button"
                  onClick={() => ctx.web(it.label, it.href)}
                  className="flex min-h-26 cursor-pointer flex-col justify-between rounded-card border border-border bg-surface p-3 text-left hover:bg-sunken active:scale-98"
                >
                  <IconBadge icon={it.icon} tone={sectionTone[g.group] ?? "blue"} size={38} />
                  <span className="mt-2 block text-small leading-tight font-semibold text-ink-900">
                    {it.label}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ me */

function MeTab({ ctx, onSignedOut }: { ctx: Ctx; onSignedOut: () => void }) {
  const sections = navigationFor("Admin", ctx.user.staffRoles).filter((g) => g.live);
  return (
    <>
      <div className="flex flex-col items-center px-4 pt-14 pb-5 text-center">
        <Avatar name={ctx.user.name} size={88} kind="staff" className="ring-4 ring-accent-tint" />
        <p className="mt-3 type-display text-h2 text-ink-900">{ctx.user.name}</p>
        <p className="text-small text-ink-500">{ctx.user.email}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {ctx.user.staffRoles.map((r) => (
            <Tag key={r} tone="available">
              {r}
            </Tag>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3 px-4 pb-6">
        <AppCard title="What you can open">
          <ul className="flex flex-col gap-2">
            {sections.map((g) => (
              <li key={g.group} className="flex items-center gap-3">
                <IconBadge
                  icon={g.group === "Patients" ? Users : LayoutGrid}
                  tone={sectionTone[g.group] ?? "blue"}
                  size={30}
                />
                <span className="min-w-0 flex-1 text-small font-semibold text-ink-900">
                  {g.group}
                </span>
                <span className="text-caption text-ink-500">{g.items.length}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-caption text-ink-500">
            Menus follow your responsibilities. A Super Admin changes them in Security.
          </p>
        </AppCard>
        <button
          type="button"
          onClick={() => ctx.web("My profile", "/profile")}
          className="flex cursor-pointer items-center justify-between rounded-card border border-border bg-surface p-4 text-small font-semibold text-ink-900"
        >
          My profile and appearance
          <ChevronRight className="size-4 text-ink-500" aria-hidden="true" />
        </button>
        <Button
          className="w-full"
          onClick={async () => {
            await signOut();
            onSignedOut();
          }}
        >
          <LogOut className="size-4" aria-hidden="true" /> Sign out
        </Button>
      </div>
    </>
  );
}
