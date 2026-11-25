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
  MessageCircle,
  MessageCircleQuestion,
  MessageSquarePlus,
  Search,
  Send,
  ShieldCheck,
  Stethoscope,
  Sunrise,
  UserRoundPlus,
  Users,
  Video,
  Wallet,
  House as HomeVisit,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { resolveQuestion } from "@/components/shell/assistant-panel";
import { Button } from "@/components/ui/button";
import { Avatar, Ring } from "@/components/ui/premium";
import { Segmented } from "@/components/ui/segmented";
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
import type { ConversationDto, LiveOverviewDto, SessionUser } from "@/lib/live/types";
import { navigationFor } from "@/lib/navigation";
import { AgentAnswer, agentCall } from "./agent-ui";
import { Skeleton } from "./bits";
import { BookingAgent } from "./booking-agent";
import { ChatOverlay } from "./chat-overlay";
import { ConversationList, useConversations, useUnreadMessages } from "./conversations";
import { PeoplePicker } from "./new-chat";
import { BookVisitPanel } from "./quick-book";
import { SignInForm } from "./sign-in-form";

const tabs = [
  { id: "home", label: "Home", icon: House },
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "ask", label: "Ask AI", icon: Bot },
  { id: "messages", label: "Chat", icon: MessageCircle },
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
    "Message anyone in the practice: staff, clinicians or patients",
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
  chat: (conversationId: string) => void;
};

type AskMode = "ask" | "ops" | "booking";

/* ------------------------------------------------------------------ app */

export function AdminApp() {
  const { user, loading, reload } = useSession();
  const [tab, setTab] = useState("home");
  const [sheet, setSheet] = useState<ReactNode>(null);
  const [askMode, setAskMode] = useState<AskMode>("ask");
  const [chat, setChat] = useState<string | null>(null);
  const signedIn = user?.role === "admin";
  const unread = useUnreadMessages(signedIn);
  const withBadges = tabs.map((t) => (t.id === "messages" ? { ...t, badge: unread } : t));

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
    chat: (id) => {
      setSheet(null);
      setChat(id);
    },
  };

  return (
    <PhoneFrame
      {...frame}
      tabs={withBadges}
      active={tab}
      onTab={setTab}
      overlay={
        chat ? (
          <ChatOverlay conversationId={chat} myId={user.id} onBack={() => setChat(null)} />
        ) : (
          (sheet ?? undefined)
        )
      }
    >
      {tab === "schedule" ? (
        <ScheduleTab ctx={ctx} />
      ) : tab === "ask" ? (
        <AskTab mode={askMode} onMode={setAskMode} ctx={ctx} />
      ) : tab === "messages" ? (
        <MessagesTab ctx={ctx} />
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

/** Briefing figures on the dark hero: the number stays white, a tone dot says how urgent it is. */
const briefDot: Record<string, string> = {
  over: "bg-over-dot",
  watch: "bg-watch-dot",
  neutral: "bg-page/40",
};

type Shortcut = {
  label: string;
  detail: string;
  icon: LucideIcon;
  tone: BadgeTone;
  go: () => void;
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
  const todayKey = now ? dayKey(now) : "";
  const briefing = agent.data?.briefing.slice(0, 6) ?? [];
  const needs = briefing.filter((b) => b.tone !== "neutral" && b.value > 0).length;
  const capacity = o ? Math.round((o.team.activeClients / Math.max(1, o.team.capacity)) * 100) : 0;
  const shortcuts: Shortcut[] = [
    {
      label: "Booking agent",
      detail: "Assign and book",
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
      detail: "Proposals",
      icon: Bot,
      tone: "orange",
      go: () => ctx.setAskMode("ops"),
    },
  ];
  const headline = !agent.data
    ? "Reading today's records…"
    : needs === 0
      ? "All clear this morning"
      : `${needs} ${needs === 1 ? "thing needs" : "things need"} you today`;

  return (
    <>
      <AppHeader
        eyebrow={now ? brisbane(now, { weekday: "long", day: "numeric", month: "long" }) : "Today"}
        title={`${greet}, ${first}`}
        aside={
          <button
            type="button"
            aria-label="My profile"
            onClick={() => ctx.onTab("me")}
            className="cursor-pointer rounded-full"
          >
            <Avatar
              name={ctx.user.name}
              kind="staff"
              size={46}
              className="ring-2 ring-accent-tint"
            />
          </button>
        }
      >
        <p className="mt-2 text-small text-ink-500">
          {(ctx.user.staffRoles.length ? ctx.user.staffRoles : ["Administration"]).join(" · ")}
        </p>
      </AppHeader>
      <div className="flex flex-col gap-5 px-4 pb-6">
        <section
          aria-label="Today's operations briefing"
          className="relative overflow-hidden rounded-card bg-ink-900 p-4 text-page shadow-lift"
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-caption font-semibold tracking-[0.14em] uppercase opacity-75">
              <Sunrise className="size-4" aria-hidden="true" /> Today&apos;s briefing
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-page/12 px-2.5 py-1 text-caption font-semibold">
              <span className="size-1.5 animate-pulse rounded-full bg-healthy-dot motion-reduce:animate-none" />
              Live
            </span>
          </div>
          <p className="mt-3 type-display text-h1 leading-tight">{headline}</p>
          <p className="mt-1 text-caption opacity-70">
            Counted from live records. Tap a figure to act.
          </p>
          {!agent.data ? (
            <div className="mt-4 h-36 animate-pulse rounded-card bg-page/10" />
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {briefing.map((b) => (
                <button
                  key={b.label}
                  type="button"
                  onClick={() => ctx.web(b.label, b.href)}
                  className="flex cursor-pointer items-center gap-3 rounded-control bg-page/8 p-3 text-left transition-colors duration-140 hover:bg-page/14 active:scale-98"
                >
                  <span className="type-display text-h2 leading-none">{b.value}</span>
                  <span className="min-w-0 flex-1 text-[11px] leading-tight font-semibold opacity-85">
                    {b.label}
                  </span>
                  <span className={cn("size-2 flex-none rounded-full", briefDot[b.tone])} />
                </button>
              ))}
            </div>
          )}
        </section>

        <section aria-label="Quick actions" className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => quickBook(ctx)}
            className="flex cursor-pointer items-center gap-3 rounded-card bg-accent-fill p-4 text-left text-on-accent shadow-lift transition-transform duration-140 active:scale-98"
          >
            <span className="flex size-12 flex-none items-center justify-center rounded-full bg-page/18">
              <UserRoundPlus className="size-6" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-section font-semibold">Book someone new</span>
              <span className="block text-caption opacity-85">A name and phone are enough</span>
            </span>
            <ArrowRight className="size-5 opacity-80" aria-hidden="true" />
          </button>
          <div className="grid grid-cols-3 gap-2.5">
            {shortcuts.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={a.go}
                className="flex cursor-pointer flex-col items-center gap-2 rounded-card border border-border bg-surface px-2 py-3.5 text-center shadow-lift transition-transform duration-140 active:scale-98"
              >
                <IconBadge icon={a.icon} tone={a.tone} size={42} />
                <span className="text-caption leading-tight font-semibold text-ink-900">
                  {a.label}
                </span>
                <span className="-mt-1 text-[11px] leading-tight text-ink-500">{a.detail}</span>
              </button>
            ))}
          </div>
        </section>

        <section aria-label="The practice today">
          <AppSection title="The practice today" />
          {!o ? (
            <Skeleton className="h-56" />
          ) : (
            <div className="rounded-card border border-border bg-surface p-4 shadow-lift">
              <div className="flex items-center gap-4">
                <Ring percent={capacity} size={96} stroke={9} label={`Team capacity ${capacity}%`}>
                  <span className="type-display text-h2 text-ink-900">{capacity}%</span>
                  <span className="text-[10px] text-ink-500">capacity</span>
                </Ring>
                <div className="grid flex-1 grid-cols-2 gap-x-3 gap-y-2.5">
                  {(
                    [
                      ["Visits today", o.visits.today, CalendarDays],
                      ["Active", o.onboarding.active, Users],
                      ["To assign", o.onboarding.needsTherapist, UserRoundPlus],
                      ["Waiting", o.onboarding.waiting, CalendarClock],
                    ] as const
                  ).map(([label, value, Icon]) => (
                    <div key={label} className="min-w-0">
                      <p className="flex items-center gap-1 text-[11px] text-ink-500">
                        <Icon className="size-3" aria-hidden="true" /> {label}
                      </p>
                      <p className="type-display text-h2 leading-tight text-ink-900">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-caption font-semibold text-ink-700">Visits booked this week</p>
                <div
                  className="mt-2 grid grid-cols-5 items-end gap-2.5"
                  aria-label="Visits booked this week"
                >
                  {week.map((d) => {
                    const today = d.day.slice(0, 10) === todayKey;
                    return (
                      <div key={d.day} className="flex flex-col items-center gap-1">
                        <span
                          className={cn(
                            "text-caption font-semibold",
                            today ? "text-accent" : "text-ink-700",
                          )}
                        >
                          {d.booked}
                        </span>
                        <div className="flex h-18 w-full items-end overflow-hidden rounded-control bg-sunken">
                          <div
                            className={cn(
                              "w-full rounded-control",
                              today ? "bg-accent-fill" : "bg-series-3/55",
                            )}
                            style={{ height: `${Math.max(8, (d.booked / peak) * 100)}%` }}
                          />
                        </div>
                        <span
                          className={cn(
                            "text-caption",
                            today ? "font-semibold text-accent" : "text-ink-500",
                          )}
                        >
                          {brisbane(d.day, { weekday: "short", timeZone: "UTC" })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-control bg-sunken px-3 py-2 text-caption text-ink-700">
                <span className="flex items-center gap-1.5">
                  <Stethoscope className="size-3.5 text-ink-500" aria-hidden="true" />
                  {o.team.therapists} clinicians · {o.team.activeClients} of {o.team.capacity}{" "}
                  places
                </span>
                {o.team.atRisk > 0 && <Tag tone="over">{o.team.atRisk} At Risk</Tag>}
              </div>
            </div>
          )}
        </section>

        <section aria-label="My tasks">
          <AppSection
            title={open.length ? `My tasks · ${open.length}` : "My tasks"}
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
            <div className="overflow-hidden rounded-card border border-border bg-surface shadow-lift">
              {open.slice(0, 4).map((t, i) => {
                const late = now > 0 && new Date(t.dueAt).getTime() < now;
                const dot = late
                  ? "bg-over-dot"
                  : t.priority === "Urgent" || t.priority === "High"
                    ? "bg-watch-dot"
                    : "bg-series-1";
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => ctx.web(t.ref, `/care/operations/tasks/${t.id}`)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 px-3.5 py-3 text-left hover:bg-sunken active:bg-sunken",
                      i > 0 && "border-t border-border",
                    )}
                  >
                    <span
                      className={cn("size-2.5 flex-none rounded-full", dot)}
                      aria-hidden="true"
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
                      <ChevronRight className="size-4 text-ink-500" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>
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

/** The timeline dot takes the visit's state, so the day reads at a glance. */
const statusDot: Partial<Record<ScheduleEventDto["status"], string>> = {
  Held: "bg-watch-dot",
  Confirmed: "bg-healthy-dot",
  "In Progress": "bg-available-dot",
  Completed: "bg-ink-400",
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
  // A weekend or a quiet today opens on the next day that has visits, not an empty list.
  const firstBusy = r.data ? days.find((d) => countOn(d) > 0) : undefined;
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    if (moved || firstBusy === undefined) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- once, when the week first loads
    setMoved(true);
    if (countOn(from) === 0) setDay(firstBusy);
  }, [firstBusy, moved]); // eslint-disable-line react-hooks/exhaustive-deps
  const flagged = shown.filter((e) => e.flags.length > 0).length;

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
            className="flex size-11 cursor-pointer items-center justify-center rounded-full bg-accent-fill text-on-accent shadow-lift active:scale-95"
          >
            <UserRoundPlus className="size-5" aria-hidden="true" />
          </button>
        }
      >
        <div
          className="no-scrollbar -mx-1 mt-4 flex gap-1.5 overflow-x-auto px-1 pb-1"
          role="group"
          aria-label="Choose a day"
        >
          {days.map((d) => {
            const on = day === d;
            const n = r.data ? countOn(d) : 0;
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => setDay(d)}
                className={cn(
                  "flex w-13 flex-none cursor-pointer flex-col items-center gap-0.5 rounded-card border py-2.5 transition-colors duration-140",
                  on
                    ? "border-ink-900 bg-ink-900 text-page shadow-lift"
                    : "border-border bg-surface text-ink-700",
                )}
              >
                <span className="text-[11px] font-medium opacity-75">
                  {brisbane(d, { weekday: "short" })}
                </span>
                <span className="type-display text-h2 leading-none">
                  {brisbane(d, { day: "numeric" })}
                </span>
                <span
                  className={cn(
                    "mt-0.5 rounded-full px-1.5 text-[10px] font-semibold",
                    on ? "bg-page/15" : n ? "bg-accent-tint text-accent" : "text-ink-400",
                  )}
                >
                  {r.data ? n : "·"}
                </span>
              </button>
            );
          })}
        </div>
      </AppHeader>
      <div className="px-4 pb-6">
        <div
          className="no-scrollbar -mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4"
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
                "flex flex-none cursor-pointer items-center gap-1.5 rounded-full border py-1 pr-3 text-caption font-semibold transition-colors duration-140",
                c ? "pl-1" : "pl-3",
                who === c
                  ? "border-accent-fill bg-accent-fill text-on-accent"
                  : "border-border-strong bg-surface text-ink-700",
              )}
            >
              {c && <Avatar name={c} kind="staff" size={22} />}
              {c || "Everyone"}
            </button>
          ))}
        </div>
        {!r.data ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
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
            <div className="mb-4 grid grid-cols-3 gap-2">
              {(
                [
                  ["Visits", shown.length, CalendarDays, "blue"],
                  ["By video", video, Video, "violet"],
                  ["Flagged", flagged, ShieldCheck, flagged ? "amber" : "green"],
                ] as const
              ).map(([label, value, Icon, tone]) => (
                <div
                  key={label}
                  className="flex items-center gap-2 rounded-card border border-border bg-surface p-2.5 shadow-lift"
                >
                  <IconBadge icon={Icon} tone={tone} size={30} />
                  <span className="min-w-0">
                    <span className="block type-display text-h2 leading-none text-ink-900">
                      {value}
                    </span>
                    <span className="block truncate text-[11px] text-ink-500">{label}</span>
                  </span>
                </div>
              ))}
            </div>
            <ol className="relative flex flex-col gap-3 before:absolute before:top-3 before:bottom-3 before:left-[64px] before:w-px before:bg-border">
              {shown.map((e) => (
                <li key={e.id} className="relative flex items-stretch gap-3">
                  <span className="flex w-12 flex-none flex-col items-end pt-3">
                    <span className="text-small font-bold text-ink-900">
                      {timeOfDay(e.start).replace(/ (am|pm)$/, "")}
                    </span>
                    <span className="text-[10px] text-ink-500 uppercase">
                      {timeOfDay(e.start).slice(-2)}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "relative z-10 mt-4.5 size-2.5 flex-none rounded-full ring-4 ring-page",
                      statusDot[e.status] ?? "bg-ink-400",
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => ctx.open(<VisitSheet e={e} ctx={ctx} />)}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-card border border-border bg-surface p-3 text-left shadow-lift transition-transform duration-140 active:scale-98"
                  >
                    <Avatar name={e.patient} size={40} kind="patient" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-small font-semibold text-ink-900">
                        {e.patient}
                      </span>
                      <span className="block truncate text-caption text-ink-500">
                        {e.therapist} · {e.support}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            e.modality === "Telehealth"
                              ? "bg-series-4/12 text-series-4"
                              : "bg-series-3/12 text-series-3",
                          )}
                        >
                          {e.modality === "Telehealth" ? (
                            <Video className="size-3" aria-hidden="true" />
                          ) : (
                            <HomeVisit className="size-3" aria-hidden="true" />
                          )}
                          {e.modality === "Telehealth" ? "Video visit" : "Home visit"}
                        </span>
                        <Tag tone={statusTone[e.status] ?? "neutral"}>{e.status}</Tag>
                      </span>
                      {e.flags.length > 0 && (
                        <span className="mt-1 block truncate text-caption font-semibold text-over">
                          {e.flags[0]?.label}
                        </span>
                      )}
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
      <div className="mb-3 flex items-center gap-3 rounded-card bg-ink-900 p-4 text-page">
        <Avatar name={e.patient} size={52} kind="patient" className="ring-2 ring-page/30" />
        <div className="min-w-0 flex-1">
          <p className="truncate type-display text-h2 leading-tight">{e.patient}</p>
          <p className="mb-1.5 text-caption opacity-75">
            {timeOfDay(e.start)} · {e.modality === "Telehealth" ? "Video visit" : "Home visit"}
          </p>
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
          className="mt-4 grid grid-cols-3 gap-1 rounded-card border border-border bg-surface p-1 shadow-lift"
        >
          {(
            [
              ["ask", "Ask", "Ask", MessageCircleQuestion],
              ["ops", "Operations", "Operations agent", Bot],
              ["booking", "Booking", "Booking agent", CalendarPlus],
            ] as const
          ).map(([id, label, name, Icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-label={name}
              aria-selected={mode === id}
              onClick={() => onMode(id)}
              className={cn(
                "flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-control px-1 text-caption font-semibold whitespace-nowrap transition-colors duration-140",
                mode === id
                  ? "bg-ink-900 text-page shadow-lift"
                  : "text-ink-500 hover:text-ink-900",
              )}
            >
              <Icon className="size-3.5 flex-none" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </AppHeader>
      <div className="px-4 pb-6">
        {mode === "booking" ? (
          <BookingAgent compact dock />
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

/** The welcome before a conversation: what this assistant does, and questions to start with. */
function AskIntro({
  icon: Icon,
  tone,
  title,
  text,
  suggestions,
  onPick,
}: {
  icon: LucideIcon;
  tone: BadgeTone;
  title: string;
  text: string;
  suggestions: string[];
  onPick: (q: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <section className="flex items-start gap-3 rounded-card bg-ink-900 p-3.5 text-page shadow-lift">
        <IconBadge icon={Icon} tone={tone} size={38} />
        <div className="min-w-0 flex-1">
          <p className="text-section leading-tight font-semibold">{title}</p>
          <p className="mt-1 text-caption leading-snug opacity-75">{text}</p>
        </div>
      </section>
      <section aria-label="Try asking">
        <p className="mb-2 px-1 text-label font-semibold tracking-[0.1em] text-ink-500 uppercase">
          Try asking
        </p>
        <div className="overflow-hidden rounded-card border border-border bg-surface shadow-lift">
          {suggestions.map((q, i) => (
            <button
              key={q}
              type="button"
              onClick={() => onPick(q)}
              className={cn(
                "flex w-full cursor-pointer items-center gap-3 px-3.5 py-3 text-left text-small font-medium text-ink-900 hover:bg-sunken active:bg-sunken",
                i > 0 && "border-t border-border",
              )}
            >
              <span className="flex size-7 flex-none items-center justify-center rounded-full bg-accent-tint text-accent">
                <MessageCircleQuestion className="size-3.5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">{q}</span>
              <ArrowRight className="size-4 flex-none text-ink-400" aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>
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
        <AskIntro
          icon={MessageCircleQuestion}
          tone="violet"
          title="Ask in your own words"
          text="Answers come from your Medisense records, with a link to where you act."
          suggestions={ASK_SUGGESTIONS}
          onPick={(q) => void send(q)}
        />
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
        suggestions={[]}
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
        <AskIntro
          icon={Bot}
          tone="orange"
          title="The operations agent"
          text="It reads live records and proposes changes. Nothing happens until you confirm."
          suggestions={OPS_SUGGESTIONS}
          onPick={(q) => void send(q)}
        />
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
        suggestions={[]}
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
  Administration: "indigo",
  Apps: "ink",
  Account: "ink",
};

const sectionIcon: Record<string, LucideIcon> = {
  Patients: Users,
  Therapists: Stethoscope,
  Scheduling: CalendarDays,
  Finance: Wallet,
  "Operations and AI": Bot,
  Administration: ShieldCheck,
  Apps: LayoutGrid,
  Account: CircleUserRound,
};

/* ------------------------------------------------------------------ messages */

type Who = "all" | ConversationDto["group"];

function MessagesTab({ ctx }: { ctx: Ctx }) {
  const chats = useConversations();
  const [who, setWho] = useState<Who>("all");
  const all = chats.data?.conversations;
  const shown = all?.filter((c) => who === "all" || c.group === who);
  const unread = (all ?? []).reduce((s, c) => s + c.unread, 0);
  const newMessage = () =>
    ctx.open(
      <AppSheet title="New message" onClose={ctx.close}>
        <PeoplePicker
          onOpen={(id) => {
            chats.reload();
            ctx.chat(id);
          }}
        />
      </AppSheet>,
    );
  return (
    <>
      <AppHeader
        eyebrow="Messages"
        title="Your team and patients"
        aside={
          <button
            type="button"
            aria-label="New message"
            onClick={newMessage}
            className="flex size-11 cursor-pointer items-center justify-center rounded-full bg-accent-fill text-on-accent active:scale-[0.98]"
          >
            <MessageSquarePlus className="size-5" aria-hidden="true" />
          </button>
        }
      >
        <p className="mt-2 text-small text-ink-500">
          {all ? `${all.length} conversation${all.length === 1 ? "" : "s"}` : "Loading…"}
          {unread > 0 && <span className="font-semibold text-over"> · {unread} unread</span>}
        </p>
      </AppHeader>
      <div className="flex flex-col gap-3 px-4 pb-6">
        <Segmented
          label="Who"
          value={who}
          onChange={setWho}
          options={[
            { id: "all", label: "All" },
            { id: "Office staff", label: "Staff" },
            { id: "Clinicians", label: "Clinicians" },
            { id: "Patients", label: "Patients" },
          ]}
        />
        <AppCard className="overflow-hidden p-0!">
          <ConversationList
            conversations={shown}
            error={chats.error}
            loading={chats.loading}
            onRetry={chats.reload}
            selected={null}
            onSelect={ctx.chat}
            emptyText={
              who === "all"
                ? "Tap the new message button to chat with anyone in the practice."
                : "No chats with this group yet."
            }
          />
        </AppCard>
      </div>
    </>
  );
}

function WorkTab({ ctx }: { ctx: Ctx }) {
  const [query, setQuery] = useState("");
  const all = navigationFor("Admin", ctx.user.staffRoles).filter(
    (g) => g.live && g.group !== "Account" && g.group !== "Apps",
  );
  const count = all.reduce((n, g) => n + g.items.length, 0);
  const q = query.trim().toLowerCase();
  const sections = all
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => !q || `${g.group} ${i.label}`.toLowerCase().includes(q)),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <AppHeader eyebrow="Everything in the portal" title="Work">
        <p className="mt-2 flex items-center gap-1.5 text-caption text-ink-500">
          <ShieldCheck className="size-3.5 text-accent" aria-hidden="true" />
          {count} sections open to {ctx.user.staffRoles.join(", ") || "your role"}
        </p>
        <label className="mt-4 flex h-11 items-center gap-2 rounded-full border border-border-strong bg-surface px-4 shadow-lift focus-within:border-accent-fill">
          <Search className="size-4 flex-none text-ink-500" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Find a section"
            placeholder="Find a section, like billing"
            className="h-full min-w-0 flex-1 bg-transparent text-small text-ink-900 outline-none placeholder:text-ink-500 focus-visible:shadow-none"
          />
        </label>
      </AppHeader>
      <div className="flex flex-col gap-4 px-4 pb-6">
        {!q && (
          <button
            type="button"
            onClick={() => quickBook(ctx)}
            className="flex cursor-pointer items-center gap-3 rounded-card bg-ink-900 p-4 text-left text-page shadow-lift active:scale-98"
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
        )}
        {sections.length === 0 && (
          <AppEmpty icon={Search} title="No section matches" compact>
            Try another word, or clear the search.
          </AppEmpty>
        )}
        {sections.map((g) => (
          <section
            key={g.group}
            aria-label={g.group}
            className="overflow-hidden rounded-card border border-border bg-surface shadow-lift"
          >
            <div className="flex items-center gap-3 px-3.5 pt-3.5 pb-2.5">
              <IconBadge
                icon={sectionIcon[g.group] ?? LayoutGrid}
                tone={sectionTone[g.group] ?? "blue"}
                size={34}
              />
              <h3 className="min-w-0 flex-1 text-section font-semibold text-ink-900">{g.group}</h3>
              <span className="rounded-full bg-sunken px-2 py-0.5 text-caption font-semibold text-ink-700">
                {g.items.length}
              </span>
            </div>
            <ul>
              {g.items.map((it) => (
                <li key={it.href} className="border-t border-border">
                  <button
                    type="button"
                    onClick={() => ctx.web(it.label, it.href)}
                    className="flex w-full cursor-pointer items-center gap-3 px-3.5 py-3 text-left hover:bg-sunken active:bg-sunken"
                  >
                    <it.icon className="size-4.5 flex-none text-ink-500" aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-small font-semibold text-ink-900">
                      {it.label}
                    </span>
                    <ChevronRight className="size-4 flex-none text-ink-400" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ me */

function MeTab({ ctx, onSignedOut }: { ctx: Ctx; onSignedOut: () => void }) {
  const sections = navigationFor("Admin", ctx.user.staffRoles).filter(
    (g) => g.live && g.group !== "Account",
  );
  const pages = sections.reduce((n, g) => n + g.items.length, 0);
  const superAdmin = ctx.user.staffRoles.includes("Super Admin");
  return (
    <>
      <div className="px-4 pt-14 pb-4">
        <section className="relative overflow-hidden rounded-card bg-ink-900 p-5 text-page shadow-lift">
          <div className="flex items-center gap-4">
            <Avatar name={ctx.user.name} size={76} kind="staff" className="ring-4 ring-page/20" />
            <div className="min-w-0">
              <p className="truncate type-display text-h1 leading-tight">{ctx.user.name}</p>
              <p className="truncate text-small opacity-75">{ctx.user.email}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {ctx.user.staffRoles.map((r) => (
              <span
                key={r}
                className="flex items-center gap-1 rounded-full bg-page/12 px-2.5 py-1 text-caption font-semibold"
              >
                {r === "Super Admin" && <ShieldCheck className="size-3" aria-hidden="true" />}
                {r}
              </span>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-page/15 pt-4">
            <div>
              <p className="type-display text-h1 leading-none">{sections.length}</p>
              <p className="mt-1 text-caption opacity-70">Sections you can open</p>
            </div>
            <div>
              <p className="type-display text-h1 leading-none">{pages}</p>
              <p className="mt-1 text-caption opacity-70">Pages in your menu</p>
            </div>
          </div>
        </section>
      </div>
      <div className="flex flex-col gap-3 px-4 pb-6">
        <AppCard title="What you can open">
          <ul className="flex flex-col gap-2.5">
            {sections.map((g) => (
              <li key={g.group} className="flex items-center gap-3">
                <IconBadge
                  icon={sectionIcon[g.group] ?? LayoutGrid}
                  tone={sectionTone[g.group] ?? "blue"}
                  size={32}
                />
                <span className="min-w-0 flex-1 text-small font-semibold text-ink-900">
                  {g.group}
                </span>
                <span className="rounded-full bg-sunken px-2 py-0.5 text-caption font-semibold text-ink-700">
                  {g.items.length}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-caption text-ink-500">
            Menus follow your responsibilities.{" "}
            {superAdmin
              ? "You manage everyone's in User control."
              : "A Super Admin changes them in User control."}
          </p>
        </AppCard>
        <div className="overflow-hidden rounded-card border border-border bg-surface shadow-lift">
          {(
            [
              ["My profile and appearance", "/profile", CircleUserRound, "blue"],
              ...(superAdmin
                ? ([["User control", "/care/users", ShieldCheck, "indigo"]] as const)
                : []),
            ] as const
          ).map(([label, href, Icon, tone], i) => (
            <button
              key={href}
              type="button"
              onClick={() => ctx.web(label, href)}
              className={cn(
                "flex w-full cursor-pointer items-center gap-3 px-3.5 py-3 text-left text-small font-semibold text-ink-900 hover:bg-sunken",
                i > 0 && "border-t border-border",
              )}
            >
              <IconBadge icon={Icon} tone={tone} size={30} />
              <span className="min-w-0 flex-1">{label}</span>
              <ChevronRight className="size-4 text-ink-500" aria-hidden="true" />
            </button>
          ))}
        </div>
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
