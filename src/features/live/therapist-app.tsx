"use client";

import { useAiEnabled } from "@/components/ai/ai-switch";
import { NoteAssist, wantsAssist } from "@/components/ai/note-assist";
import { PatientAiTab, TherapistAiInbox, VisitCheckin } from "./enhance-therapist";
import {
  CalendarPlus,
  AlertTriangle,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileSignature,
  House,
  ListChecks,
  LogOut,
  MapPin,
  MessageCircle,
  Mic,
  MicOff,
  Phone,
  Search,
  Target,
  UserPlus,
  Users,
  Video,
  TrendingUp,
  FolderOpen,
  Briefcase,
  Workflow,
  ChartColumn,
  UserRound,
  Stethoscope,
} from "lucide-react";
import { AssessmentAppSheet } from "./app-assessment";
import { BookingAgent } from "./booking-agent";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AiChip, AiIcon } from "@/components/ai/provenance";
import { Button } from "@/components/ui/button";
import { Avatar, Ring } from "@/components/ui/premium";
import { Tag, type TagTone } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
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
import { declineReasons } from "@/lib/live/catalogue";
import { api, signOut, useNow, useResource, useSession } from "@/lib/live/client";
import type { TaskRow } from "@/lib/live/coord";
import { shortDate, timeOfDay } from "@/lib/live/time";
import type { AppointmentDto, SessionUser, TherapistHomeDto } from "@/lib/live/types";
import { ErrorNote, Skeleton } from "./bits";
import { ChatOverlay } from "./chat-overlay";
import { ConversationList, useConversations, useUnreadMessages } from "./conversations";
import { SignInForm } from "./sign-in-form";

/* ------------------------------------------------------------------ frame */

const tabs = [
  { id: "today", label: "Today", icon: House },
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "patients", label: "Patients", icon: Users },
  { id: "clinical", label: "Clinical", icon: Stethoscope },
  { id: "messages", label: "Messages", icon: MessageCircle },
];

const frame = {
  name: "Therapist app",
  description:
    "For clinicians on the road: today's visits with everything to know before arriving, check-in and check-out, notes drafted from what you dictate, tasks and messages.",
  features: [
    "Today's visits, briefings and precautions",
    "Check in and out; the actual time is recorded",
    "Dictate rough notes; AI drafts, you edit and sign",
    "New patient requests to accept or decline",
    "Tasks, messages and your caseload in one place",
  ],
};

type Home = TherapistHomeDto;
type Visit = AppointmentDto;
type Briefing = {
  patient: string;
  when: string;
  service: string;
  location: string;
  suburb: string;
  phone: string | null;
  precautions: string | null;
  notes: string;
  consent: boolean;
  plan: {
    status: string;
    goals: { id: string; description: string; target: string; current: string }[];
  } | null;
  lastVisit: { at: string; plan: string; summary: string } | null;
};

const brisbaneDate = (v: string | number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane" }).format(new Date(v));

/* ------------------------------------------------------------------ app */

export function TherapistApp() {
  const { user, loading, reload } = useSession();
  const [tab, setTab] = useState("today");
  const [chat, setChat] = useState<string | null>(null);
  const [sheet, setSheet] = useState<ReactNode>(null);
  const signedIn = user?.role === "therapist";
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

  if (!signedIn) {
    return (
      <PhoneFrame {...frame} tabs={tabs} active="today" onTab={() => undefined}>
        <AppHeader eyebrow="Medisense" title="Therapist sign-in" />
        <div className="p-4">
          {user && (
            <p className="mb-3 rounded-control bg-watch-bg px-3 py-2 text-small text-watch">
              You&apos;re signed in as {user.role === "client" ? "a patient" : "staff"}. Sign in
              with a therapist account to use this app.
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
      <Tabs
        tab={tab}
        user={user}
        onTab={setTab}
        onChat={setChat}
        open={(node) => setSheet(node)}
        close={close}
        onSignedOut={reload}
      />
    </PhoneFrame>
  );
}

function Tabs({
  tab,
  user,
  onTab,
  onChat,
  open,
  close,
  onSignedOut,
}: {
  tab: string;
  user: SessionUser;
  onTab: (t: string) => void;
  onChat: (id: string) => void;
  open: (node: ReactNode) => void;
  close: () => void;
  onSignedOut: () => void;
}) {
  const home = useResource<Home>(
    "/api/care/therapist",
    (e) => e.type === "care" || e.type === "notification",
  );
  const tasks = useResource<{ rows: TaskRow[] }>(
    "/api/care/coordination",
    (e) => e.type === "care",
  );
  if (home.error && !home.data)
    return (
      <div className="p-4 pt-14">
        <ErrorNote message={home.error} onRetry={home.reload} />
      </div>
    );
  const data = home.data;
  const done = () => {
    close();
    home.reload();
    tasks.reload();
  };
  const ctx: Ctx = { data, open, close, done, onChat, reload: home.reload };
  if (tab === "patients") return <PatientsTab ctx={ctx} />;
  if (tab === "schedule") return <ScheduleTab ctx={ctx} />;
  if (tab === "clinical")
    return <ClinicalTab ctx={ctx} rows={tasks.data?.rows ?? null} onTab={onTab} />;
  if (tab === "tasks") return <TasksTab ctx={ctx} rows={tasks.data?.rows ?? null} />;
  if (tab === "messages") return <MessagesTab onChat={onChat} />;
  if (tab === "me") return <MeTab ctx={ctx} user={user} onSignedOut={onSignedOut} />;
  return <TodayTab ctx={ctx} user={user} rows={tasks.data?.rows ?? null} onTab={onTab} />;
}

type Ctx = {
  data: Home | null;
  open: (node: ReactNode) => void;
  close: () => void;
  done: () => void;
  onChat: (id: string) => void;
  reload: () => void;
};

/* ------------------------------------------------------------------ today */

function untilLabel(start: string, now: number) {
  const mins = Math.round((new Date(start).getTime() - now) / 60_000);
  if (mins <= 0) return "Now";
  if (mins < 60) return `In ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `In ${h} h ${m} min` : `In ${h} h`;
}

function TodayTab({
  ctx,
  user,
  rows,
  onTab,
}: {
  ctx: Ctx;
  user: SessionUser;
  rows: TaskRow[] | null;
  onTab: (t: string) => void;
}) {
  const now = useNow();
  const d = ctx.data;
  const today = now ? brisbaneDate(now) : "";
  const all = [...(d?.upcoming ?? []), ...(d?.recent ?? [])];
  const todays = all
    .filter((v, i, list) => list.findIndex((x) => x.id === v.id) === i)
    .filter((v) => brisbaneDate(v.start) === today && v.status !== "cancelled")
    .sort((a, b) => a.start.localeCompare(b.start));
  const later = (d?.upcoming ?? []).filter((v) => brisbaneDate(v.start) !== today).slice(0, 4);
  const next = todays.find((v) => v.status === "booked") ?? null;
  const doneToday = todays.filter((v) => v.status === "completed").length;
  const myTasks = (rows ?? []).filter(
    (t) => t.mine && !["Completed", "Cancelled"].includes(t.status),
  );
  const overdue = myTasks.filter((t) => t.overdue).length;
  const hour = now
    ? Number(
        new Intl.DateTimeFormat("en-AU", {
          hour: "numeric",
          hour12: false,
          timeZone: "Australia/Brisbane",
        }).format(now),
      )
    : 9;
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <AppHeader
        eyebrow={
          now
            ? new Intl.DateTimeFormat("en-AU", {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: "Australia/Brisbane",
              }).format(now)
            : "Today"
        }
        title={`${greeting}, ${user.name.split(" ")[0]}`}
        aside={
          <button
            type="button"
            aria-label="My profile"
            onClick={() => onTab("me")}
            className="cursor-pointer rounded-full"
          >
            <Avatar name={user.name} size={46} kind="staff" className="ring-2 ring-accent-tint" />
          </button>
        }
      />
      <div className="flex flex-col gap-4 px-4 pb-6">
        {!d ? (
          <Skeleton className="h-64" />
        ) : (
          <>
            {next ? (
              <section
                aria-label="Next visit"
                className="relative overflow-hidden rounded-card bg-ink-900 p-4 text-page"
              >
                <div className="flex items-center justify-between">
                  <span className="text-caption font-semibold tracking-[0.14em] uppercase opacity-70">
                    Next visit
                  </span>
                  <span className="rounded-full bg-page/15 px-2.5 py-1 text-caption font-semibold">
                    {now ? untilLabel(next.start, now) : timeOfDay(next.start)}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <Avatar
                    name={next.clientName}
                    size={56}
                    kind="patient"
                    className="ring-2 ring-page/30"
                  />
                  <div className="min-w-0">
                    <p className="truncate type-display text-h2 leading-tight">{next.clientName}</p>
                    <p className="text-small opacity-75">
                      {next.discipline}
                      {next.series ? ` · visit ${next.series.index} of ${next.series.total}` : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-[auto_1fr] items-center gap-3 border-t border-page/15 pt-3">
                  <div>
                    <p className="text-h2 leading-none font-semibold">{timeOfDay(next.start)}</p>
                    <p className="text-caption opacity-70">to {timeOfDay(next.end)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => ctx.open(<VisitSheet visit={next} ctx={ctx} />)}
                    className="flex cursor-pointer items-center justify-center gap-2 rounded-control bg-page px-4 py-2.5 text-small font-semibold text-ink-900 transition-transform duration-(--duration-fast) active:scale-[0.98]"
                  >
                    {next.checkIn ? "Continue visit" : "Open briefing"}
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </section>
            ) : (
              <AppCard>
                <p className="flex items-center gap-2 text-small font-semibold text-healthy">
                  <CheckCircle2 className="size-4" aria-hidden="true" /> All of today&apos;s visits
                  are done
                </p>
              </AppCard>
            )}

            <TherapistAiInbox />

            <section
              aria-label="Your day"
              className="flex items-center gap-4 rounded-card border border-border bg-surface p-4"
            >
              <Ring
                percent={todays.length ? (doneToday / todays.length) * 100 : 0}
                size={84}
                stroke={8}
                label={`${doneToday} of ${todays.length} visits done`}
              >
                <span className="text-center leading-tight">
                  <span className="block text-h2 font-semibold text-ink-900">
                    {doneToday}/{todays.length}
                  </span>
                  <span className="block text-caption text-ink-500">visits</span>
                </span>
              </Ring>
              <ul className="flex min-w-0 flex-1 flex-col gap-2">
                <Stat
                  icon={FileSignature}
                  label="Notes to write"
                  value={d.notesToWrite.length}
                  tone={d.notesToWrite.length ? "over" : "ink"}
                />
                <Stat
                  icon={ListChecks}
                  label={overdue ? `Tasks, ${overdue} late` : "Open tasks"}
                  value={myTasks.length}
                  tone={overdue ? "watch" : "ink"}
                  onClick={() => onTab("tasks")}
                />
                <Stat
                  icon={UserPlus}
                  label="New patients"
                  value={d.requests.length}
                  tone={d.requests.length ? "accent" : "ink"}
                />
              </ul>
            </section>

            <button
              type="button"
              onClick={() =>
                ctx.open(
                  <AppSheet title="Booking agent" onClose={ctx.close}>
                    <BookingAgent compact />
                  </AppSheet>,
                )
              }
              className="flex w-full cursor-pointer items-center gap-3 rounded-card border border-border bg-surface p-3.5 text-left hover:bg-sunken active:scale-98"
            >
              <IconBadge icon={CalendarPlus} tone="violet" size={42} />
              <span className="min-w-0 flex-1">
                <span className="block text-small font-semibold text-ink-900">Booking agent</span>
                <span className="block text-caption text-ink-500">
                  Book a follow-up or move a visit, in real free times
                </span>
              </span>
              <ChevronRight className="size-5 text-ink-500" aria-hidden="true" />
            </button>

            {d.requests.length > 0 && (
              <section aria-label="New patients for you">
                <AppSection title="New patients for you" />
                <ul className="flex flex-col gap-2">
                  {d.requests.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => ctx.open(<RequestSheet r={r} ctx={ctx} />)}
                        className="flex w-full cursor-pointer items-center gap-3 rounded-card border border-accent/30 bg-accent-tint p-3 text-left"
                      >
                        <Avatar name={r.clientName} size={40} kind="patient" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-small font-semibold text-ink-900">
                            {r.clientName}
                          </span>
                          <span className="block text-caption text-ink-700">
                            {r.support} · {r.suburb}
                          </span>
                        </span>
                        <span className="rounded-full bg-accent-fill px-3 py-1 text-caption font-semibold text-on-accent">
                          Reply
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-label="Today's schedule">
              <AppSection title="Today's schedule" />
              {todays.length === 0 ? (
                <AppEmpty icon={CalendarCheck} title="No visits today" compact>
                  Your next visits are under Coming up.
                </AppEmpty>
              ) : (
                <Timeline visits={todays} ctx={ctx} />
              )}
            </section>

            {d.notesToWrite.length > 0 && (
              <section aria-label="Notes to write">
                <AppSection title="Notes to write" />
                <ul className="flex flex-col gap-2">
                  {d.notesToWrite.slice(0, 4).map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => ctx.open(<NoteSheet visit={v} ctx={ctx} />)}
                        className="flex w-full cursor-pointer items-center gap-3 rounded-card border border-border bg-surface p-3 text-left hover:bg-sunken"
                      >
                        <Avatar name={v.clientName} size={40} kind="patient" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-small font-semibold text-ink-900">
                            {v.clientName}
                          </span>
                          <span className="block text-caption text-ink-500">
                            {v.discipline} · {shortDate(v.start)}
                          </span>
                        </span>
                        <span className="flex items-center gap-1.5 rounded-full bg-over-bg px-2.5 py-1 text-caption font-semibold text-over">
                          <Mic className="size-3.5" aria-hidden="true" /> Note due
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {d.toRecord.length > 0 && (
              <section aria-label="Did these visits happen?">
                <AppSection title="Did these visits happen?" />
                <Timeline visits={d.toRecord} ctx={ctx} />
              </section>
            )}

            {later.length > 0 && (
              <section aria-label="Coming up">
                <AppSection title="Coming up" />
                <Timeline visits={later} ctx={ctx} showDay />
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
  onClick,
}: {
  icon: typeof House;
  label: string;
  value: number;
  tone: "ink" | "over" | "watch" | "accent";
  onClick?: () => void;
}) {
  const badge: BadgeTone =
    tone === "over" ? "orange" : tone === "watch" ? "violet" : tone === "accent" ? "teal" : "blue";
  const color = {
    ink: "text-ink-900",
    over: "text-over",
    watch: "text-watch",
    accent: "text-accent",
  }[tone];
  const body = (
    <>
      <IconBadge icon={Icon} tone={badge} size={30} />
      <span className="min-w-0 flex-1 truncate text-small text-ink-700">{label}</span>
      <span className={cn("text-section font-semibold", color)}>{value}</span>
    </>
  );
  return (
    <li>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="flex w-full cursor-pointer items-center gap-2.5 text-left"
        >
          {body}
        </button>
      ) : (
        <span className="flex items-center gap-2.5">{body}</span>
      )}
    </li>
  );
}

function visitTag(v: Visit): { tone: TagTone; label: string } {
  if (v.note?.status === "Final" || v.note?.status === "Amended")
    return { tone: "healthy", label: "Note signed" };
  if (v.status === "completed") return { tone: "watch", label: "Note due" };
  if (v.status === "no-show") return { tone: "over", label: "Did not attend" };
  if (v.checkIn) return { tone: "available", label: "In progress" };
  return { tone: "neutral", label: "Booked" };
}

/** The day as a timeline: time on the left, a rail with a dot per visit, the visit card. */
function Timeline({
  visits,
  ctx,
  showDay = false,
}: {
  visits: Visit[];
  ctx: Ctx;
  showDay?: boolean;
}) {
  return (
    <ol className="relative">
      {visits.map((v, i) => {
        const tag = visitTag(v);
        const last = i === visits.length - 1;
        return (
          <li key={v.id} className="relative grid grid-cols-[56px_18px_1fr] gap-x-1">
            <span className="pt-3 text-right">
              <span className="block text-small font-semibold whitespace-nowrap text-ink-900">
                {timeOfDay(v.start).replace(" ", " ")}
              </span>
              {showDay && (
                <span className="block text-caption whitespace-nowrap text-ink-500">
                  {shortDate(v.start).replace(",", "")}
                </span>
              )}
            </span>
            <span aria-hidden="true" className="relative flex justify-center">
              {!last && <span className="absolute top-5 bottom-0 w-px bg-border-strong" />}
              <span
                className={cn(
                  "relative mt-4 size-2.5 rounded-full ring-4 ring-page",
                  tag.tone === "healthy"
                    ? "bg-healthy-dot"
                    : tag.tone === "available"
                      ? "bg-available-dot"
                      : tag.tone === "over"
                        ? "bg-over-dot"
                        : tag.tone === "watch"
                          ? "bg-watch-dot"
                          : "bg-accent",
                )}
              />
            </span>
            <button
              type="button"
              onClick={() => ctx.open(<VisitSheet visit={v} ctx={ctx} />)}
              className="mb-2 flex min-w-0 cursor-pointer items-center gap-3 rounded-card border border-border bg-surface p-3 text-left hover:bg-sunken"
            >
              <Avatar name={v.clientName} size={38} kind="patient" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-small font-semibold text-ink-900">
                  {v.clientName}
                </span>
                <span className="block truncate text-caption text-ink-500">
                  {v.modality === "Telehealth" ? "Video call" : v.discipline} · until{" "}
                  {timeOfDay(v.end)}
                </span>
              </span>
              <Tag tone={tag.tone}>{tag.label}</Tag>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ visit */

function VisitSheet({ visit, ctx }: { visit: Visit; ctx: Ctx }) {
  const brief = useResource<{ briefing: Briefing }>(`/api/visits/${visit.id}/briefing`);
  const b = brief.data?.briefing;
  const [step, setStep] = useState<"brief" | "checkin">("brief");
  const [attendees, setAttendees] = useState("");
  const [notes, setNotes] = useState("");
  const [safe, setSafe] = useState(true);
  const [arrived, setArrived] = useState<"now" | "booked">("now");
  const [left, setLeft] = useState<"now" | "booked">("now");
  const [busy, setBusy] = useState(false);
  const started = visit.start <= new Date().toISOString();
  const past = visit.end < new Date().toISOString();

  async function run(label: string, url: string, body: unknown) {
    setBusy(true);
    try {
      await api(url, { body });
      toast(label, { tone: "success" });
      ctx.done();
    } catch (e) {
      toast("Couldn't save", {
        tone: "error",
        detail: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  const footer =
    visit.status !== "booked" ? null : visit.checkIn ? (
      <div className="flex flex-col gap-2">
        <Choices
          label="Left at"
          value={left}
          onChange={setLeft}
          options={[
            ["now", "Now"],
            ["booked", `${timeOfDay(visit.end)} (booked end)`],
          ]}
        />
        <Button
          variant="primary"
          className="w-full"
          loading={busy}
          onClick={() =>
            run("Checked out. Your note is next.", `/api/visits/${visit.id}/checkout`, {
              at: left === "booked" ? visit.end : undefined,
            })
          }
        >
          <CheckCircle2 className="size-4" aria-hidden="true" /> Check out
        </Button>
      </div>
    ) : step === "brief" ? (
      <div className="flex flex-col gap-2">
        <Button variant="primary" className="w-full" onClick={() => setStep("checkin")}>
          <MapPin className="size-4" aria-hidden="true" /> I&apos;ve arrived: check in
        </Button>
        {past && (
          <Button
            variant="danger"
            className="w-full"
            loading={busy}
            onClick={() =>
              run("Recorded as did not attend", `/api/visits/${visit.id}/outcome`, {
                outcome: "no-show",
              })
            }
          >
            They didn&apos;t attend
          </Button>
        )}
      </div>
    ) : (
      <Button
        variant="primary"
        className="w-full"
        loading={busy}
        disabled={attendees.trim().length < 2 || !safe}
        onClick={() =>
          run("Checked in", `/api/visits/${visit.id}/checkin`, {
            attendees,
            safe,
            notes,
            at: arrived === "booked" ? visit.start : undefined,
          })
        }
      >
        Check in
      </Button>
    );

  return (
    <AppSheet title={visit.clientName} onClose={ctx.close} footer={footer}>
      <p className="-mt-1 mb-3 text-small text-ink-700">
        {visit.discipline} · {shortDate(visit.start)}, {timeOfDay(visit.start)} to{" "}
        {timeOfDay(visit.end)}
      </p>
      {visit.checkIn && visit.status === "booked" && (
        <p className="mb-3 rounded-control bg-available-bg px-3 py-2 text-small text-available">
          Checked in at {timeOfDay(visit.checkIn.at)} with {visit.checkIn.attendees}.
        </p>
      )}
      {step === "checkin" && !visit.checkIn ? (
        <div className="flex flex-col gap-3">
          <Choices
            label="Arrived at"
            value={arrived}
            onChange={setArrived}
            options={
              started
                ? [
                    ["now", "Now"],
                    ["booked", `${timeOfDay(visit.start)} (booked time)`],
                  ]
                : [["now", "Now"]]
            }
          />
          <Text
            label="Who is present?"
            value={attendees}
            onChange={setAttendees}
            placeholder="For example, participant and mother"
          />
          <label className="flex items-start gap-2.5 rounded-control border border-border p-3 text-small">
            <input
              type="checkbox"
              checked={safe}
              onChange={(e) => setSafe(e.target.checked)}
              className="mt-0.5 size-4 accent-(--color-accent-fill)"
            />
            <span>
              <span className="block font-semibold text-ink-900">It&apos;s safe to start</span>
              <span className="text-ink-500">
                If not, don&apos;t check in: leave and call the office.
              </span>
            </span>
          </label>
          <Text label="Anything to note on arrival (optional)" value={notes} onChange={setNotes} />
        </div>
      ) : !b ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="flex flex-col gap-3">
          {b.precautions && (
            <div className="rounded-control border border-over bg-over-bg p-3 text-small text-over">
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="size-4" aria-hidden="true" /> Precaution
              </p>
              <p className="mt-1 text-ink-900">{b.precautions}</p>
            </div>
          )}
          {visit.status === "booked" && (
            <VisitCheckin clientId={visit.clientId} appointmentId={visit.id} />
          )}
          {visit.modality === "Telehealth" && visit.status === "booked" && (
            <button
              type="button"
              onClick={() =>
                ctx.open(
                  <AppWebView
                    title={`Video call · ${visit.clientName}`}
                    href={`/telehealth/room/${visit.id}`}
                    onClose={ctx.close}
                  />,
                )
              }
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-control bg-ink-900 py-3 text-small font-semibold text-page"
            >
              <Video className="size-4" aria-hidden="true" /> Start video call
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <a
              href={b.phone ? `tel:${b.phone.replace(/\s/g, "")}` : undefined}
              className="flex items-center justify-center gap-2 rounded-control border border-border-strong py-2 text-small font-semibold text-ink-900 hover:bg-sunken hover:no-underline"
            >
              <Phone className="size-4" aria-hidden="true" /> Call
            </a>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.suburb} QLD`)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-control border border-border-strong py-2 text-small font-semibold text-ink-900 hover:bg-sunken hover:no-underline"
            >
              <MapPin className="size-4" aria-hidden="true" /> Directions
            </a>
          </div>
          <Facts
            rows={[
              ["Where", `${b.location} · ${b.suburb}`],
              ["Service", b.service],
              ["Consent", b.consent ? "Recorded" : "Not yet recorded"],
            ]}
          />
          {b.lastVisit && (
            <div className="rounded-control bg-sunken p-3 text-small">
              <p className="label-caps text-ink-500">Last visit · {shortDate(b.lastVisit.at)}</p>
              <p className="mt-1 text-ink-900">
                {b.lastVisit.plan || b.lastVisit.summary || "No plan recorded."}
              </p>
            </div>
          )}
          {b.plan && b.plan.goals.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-small font-semibold text-ink-900">
                <Target className="size-4 text-accent" aria-hidden="true" /> Goals ({b.plan.status})
              </p>
              <ul className="flex flex-col gap-1.5">
                {b.plan.goals.slice(0, 3).map((g) => (
                  <li key={g.id} className="rounded-control border border-border p-2.5 text-small">
                    <p className="text-ink-900">{g.description}</p>
                    <p className="text-caption text-ink-500">
                      Now {g.current || "not measured"} · target {g.target}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {visit.status === "completed" && !visit.note?.signedAt && (
            <Button
              className="w-full"
              onClick={() => ctx.open(<NoteSheet visit={visit} ctx={ctx} />)}
            >
              <FileSignature className="size-4" aria-hidden="true" /> Write the note
            </Button>
          )}
        </div>
      )}
    </AppSheet>
  );
}

/* ------------------------------------------------------------------ note */

type Draft = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  forPatient: string;
};

function NoteSheet({ visit, ctx }: { visit: Visit; ctx: Ctx }) {
  const [rough, setRough] = useState("");
  const [draft, setDraft] = useState<Draft | null>(
    visit.note?.soap ? { ...visit.note.soap, forPatient: visit.note.forPatient } : null,
  );
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState<"draft" | "sign" | null>(null);
  const ai = useAiEnabled();
  const [drafted, setDrafted] = useState(Boolean(visit.note?.soap));
  const [listening, setListening] = useState(false);
  const recogniser = useRef<{ stop: () => void } | null>(null);
  useEffect(() => () => recogniser.current?.stop(), []);

  function dictate() {
    type Rec = {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onend: () => void;
      start: () => void;
      stop: () => void;
    };
    const w = window as unknown as {
      SpeechRecognition?: new () => Rec;
      webkitSpeechRecognition?: new () => Rec;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      toast("Dictation isn't available in this browser", {
        tone: "info",
        detail: "Type the notes instead.",
      });
      return;
    }
    if (listening) {
      recogniser.current?.stop();
      return;
    }
    const r = new Ctor();
    r.lang = "en-AU";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      const text = Array.from(e.results)
        .map((x) => x[0]?.transcript ?? "")
        .join(" ");
      setRough((t) => `${t} ${text}`.trim());
    };
    r.onend = () => setListening(false);
    recogniser.current = r;
    setListening(true);
    r.start();
  }

  async function makeDraft() {
    setBusy("draft");
    try {
      const out = await api<Draft & { missing: string[] }>(`/api/visits/${visit.id}/note/draft`, {
        body: { rough },
      });
      // The clinical assessment stays the clinician's own words.
      setDraft({ ...out, assessment: draft?.assessment ?? "" });
      setMissing(out.missing ?? []);
      setDrafted(true);
    } catch (e) {
      toast("No draft this time", {
        tone: "error",
        detail: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function sign() {
    if (!draft) return;
    setBusy("sign");
    try {
      await api(`/api/visits/${visit.id}/note`, {
        body: { ...draft, aiDrafted: drafted, sign: true },
      });
      toast("Note signed", { tone: "success", detail: "The patient sees the plain summary only." });
      ctx.done();
    } catch (e) {
      toast("Couldn't sign", {
        tone: "error",
        detail: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setBusy(null);
    }
  }

  const set = (k: keyof Draft) => (v: string) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  return (
    <AppSheet
      title={`Note · ${visit.clientName}`}
      onClose={ctx.close}
      footer={
        draft ? (
          <Button
            variant="primary"
            className="w-full"
            loading={busy === "sign"}
            disabled={draft.assessment.trim().length < 5}
            onClick={sign}
          >
            <FileSignature className="size-4" aria-hidden="true" /> Sign note as{" "}
            {visit.therapistName}
          </Button>
        ) : !ai ? (
          <Button
            variant="primary"
            className="w-full"
            onClick={() =>
              setDraft({
                subjective: rough,
                objective: "",
                assessment: "",
                plan: "",
                forPatient: "",
              })
            }
          >
            Write the note
          </Button>
        ) : (
          <Button
            data-ai-only
            variant="primary"
            className="w-full"
            loading={busy === "draft"}
            disabled={rough.trim().length < 15}
            onClick={makeDraft}
          >
            <AiIcon className="size-4" /> Draft the note with AI
          </Button>
        )
      }
    >
      <p className="-mt-1 mb-3 text-small text-ink-700">
        {visit.discipline} · {shortDate(visit.start)}
        {visit.checkOut ? ` · ${visit.checkOut.minutes} min` : ""}
      </p>
      <div className="mb-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-caption font-semibold text-ink-700">Your rough notes</span>
          <button
            type="button"
            onClick={dictate}
            aria-pressed={listening}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-tag px-2 py-1 text-caption font-semibold",
              listening ? "bg-over-bg text-over" : "bg-accent-tint text-accent",
            )}
          >
            {listening ? (
              <MicOff className="size-3.5" aria-hidden="true" />
            ) : (
              <Mic className="size-3.5" aria-hidden="true" />
            )}
            {listening ? "Stop" : "Dictate"}
          </button>
        </div>
        <textarea
          aria-label="Your rough notes"
          value={rough}
          onChange={(e) => setRough(e.target.value)}
          rows={draft ? 2 : 6}
          placeholder="What happened, what you saw, what's next. AI turns it into a SOAP draft; you check and sign."
          className="w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-small"
        />
      </div>
      {busy === "draft" && (
        <div
          role="status"
          aria-label="Drafting"
          className="flex flex-col gap-2 rounded-card p-3 surface-draft"
        >
          <span className="ai-shimmer h-3 w-11/12 rounded-tag" />
          <span className="ai-shimmer h-3 w-8/12 rounded-tag" />
          <span className="ai-shimmer h-3 w-10/12 rounded-tag" />
        </div>
      )}
      {draft && (
        <div className="flex flex-col gap-2.5 rounded-card p-3 surface-draft">
          <div className="flex items-center justify-between">
            <AiChip>AI draft, needs your approval</AiChip>
            <button
              data-ai-only
              type="button"
              onClick={makeDraft}
              className="cursor-pointer text-caption font-semibold text-accent"
            >
              Redraft
            </button>
          </div>
          <Area label="Subjective" value={draft.subjective} onChange={set("subjective")} />
          <Area label="Objective" value={draft.objective} onChange={set("objective")} />
          <Area
            label="Assessment (your clinical judgement)"
            value={draft.assessment}
            onChange={set("assessment")}
            placeholder="AI doesn't write the assessment. Add yours to sign."
          />
          <Area label="Plan" value={draft.plan} onChange={set("plan")} />
          <Area
            label="Summary the patient sees"
            value={draft.forPatient}
            onChange={set("forPatient")}
          />
          {missing.length > 0 && (
            <div data-ai-only className="rounded-control bg-watch-bg p-2.5 text-caption text-watch">
              <p className="font-semibold">Not in your notes</p>
              <ul className="mt-1 list-disc pl-4 text-ink-700">
                {missing.slice(0, 4).map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </AppSheet>
  );
}

/* ------------------------------------------------------------------ requests */

function RequestSheet({ r, ctx }: { r: TherapistHomeDto["requests"][number]; ctx: Ctx }) {
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState<(typeof declineReasons)[number]>(declineReasons[0]);
  const [busy, setBusy] = useState(false);
  async function reply(body: unknown, label: string) {
    setBusy(true);
    try {
      await api(`/api/care/requests/${r.id}`, { body });
      toast(label, { tone: "success" });
      ctx.done();
    } catch (e) {
      toast("Couldn't reply", {
        tone: "error",
        detail: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppSheet
      title="New patient request"
      onClose={ctx.close}
      footer={
        declining ? (
          <Button
            variant="danger"
            className="w-full"
            loading={busy}
            onClick={() =>
              reply({ decision: "decline", reason }, "Declined; the team will find someone else")
            }
          >
            Decline request
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setDeclining(true)}>Decline</Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={() =>
                reply({ decision: "accept" }, `${r.clientName} added to your caseload`)
              }
            >
              Accept
            </Button>
          </div>
        )
      }
    >
      <div className="mb-3 flex items-center gap-3">
        <Avatar name={r.clientName} size={48} kind="patient" />
        <div>
          <p className="text-body font-semibold text-ink-900">{r.clientName}</p>
          <p className="text-small text-ink-500">{r.suburb}</p>
        </div>
      </div>
      <Facts
        rows={[
          ["Service", r.support],
          ["How often", r.frequency],
          ["Where", r.location],
        ]}
      />
      {declining && (
        <div className="mt-3">
          <Choices
            label="Why can't you take them?"
            value={reason}
            onChange={setReason}
            options={declineReasons.map((x) => [x, x] as [typeof x, string])}
          />
        </div>
      )}
    </AppSheet>
  );
}

/* ------------------------------------------------------------------ patients */

function PatientsTab({ ctx }: { ctx: Ctx }) {
  const [q, setQ] = useState("");
  const active = (ctx.data?.clients ?? []).filter((c) => !c.discharged);
  const list = active.filter((c) =>
    `${c.name} ${c.suburb} ${c.discipline}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <>
      <AppHeader eyebrow={`Caseload · ${active.length} active`} title="My patients" />
      <div className="flex flex-col gap-3 px-4 pb-6">
        <label className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5">
          <Search className="size-4 text-ink-500" aria-hidden="true" />
          <input
            aria-label="Search patients"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, suburb or service"
            className="min-w-0 flex-1 bg-transparent text-small outline-none"
          />
        </label>
        {!ctx.data ? (
          <Skeleton className="h-60" />
        ) : list.length === 0 ? (
          <AppEmpty icon={Users} title="No patients found" compact />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {list.map((c) => {
              const next = ctx.data?.upcoming.find((v) => v.clientId === c.id);
              return (
                <li key={c.id} className="rounded-card border border-border bg-surface p-3.5">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      aria-label={`Open ${c.name}`}
                      onClick={() =>
                        ctx.open(<PatientScreen c={c} ctx={ctx} onClose={ctx.close} />)
                      }
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                    >
                      <Avatar name={c.name} size={48} kind="patient" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body font-semibold text-ink-900">{c.name}</p>
                        <p className="flex items-center gap-1 truncate text-caption text-ink-500">
                          <MapPin className="size-3" aria-hidden="true" /> {c.suburb}
                        </p>
                      </div>
                    </button>
                    {c.conversationId && (
                      <button
                        type="button"
                        aria-label={`Message ${c.name}`}
                        onClick={() => c.conversationId && ctx.onChat(c.conversationId)}
                        className="flex size-9 flex-none cursor-pointer items-center justify-center rounded-full bg-accent-tint text-accent"
                      >
                        <MessageCircle className="size-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Tag tone="outline">{c.discipline}</Tag>
                    <Tag tone="outline">{c.frequency}</Tag>
                  </div>
                  <button
                    type="button"
                    disabled={!next}
                    onClick={() => next && ctx.open(<VisitSheet visit={next} ctx={ctx} />)}
                    className="mt-3 flex w-full cursor-pointer items-center gap-2 rounded-control bg-sunken px-3 py-2 text-left text-small disabled:cursor-default"
                  >
                    <CalendarCheck className="size-4 text-accent" aria-hidden="true" />
                    <span className="flex-1 text-ink-700">
                      {next ? (
                        <>
                          Next visit{" "}
                          <strong className="font-semibold text-ink-900">
                            {shortDate(next.start)}, {timeOfDay(next.start)}
                          </strong>
                        </>
                      ) : (
                        "No visit booked"
                      )}
                    </span>
                    {next && <ChevronRight className="size-4 text-ink-500" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ tasks */

const priorityTone: Record<string, TagTone> = {
  Urgent: "over",
  High: "over",
  Medium: "watch",
  Normal: "neutral",
  Low: "neutral",
};
const priorityEdge: Record<string, string> = {
  Urgent: "bg-over-dot",
  High: "bg-over-dot",
  Medium: "bg-watch-dot",
  Normal: "bg-accent",
  Low: "bg-border-strong",
};

function TasksTab({ ctx, rows }: { ctx: Ctx; rows: TaskRow[] | null }) {
  const [view, setView] = useState<"open" | "done">("open");
  const mine = (rows ?? []).filter((t) => t.mine);
  const open = mine.filter((t) => !["Completed", "Cancelled"].includes(t.status));
  const done = mine.filter((t) => t.status === "Completed").slice(0, 12);
  const overdue = open.filter((t) => t.overdue).length;
  const list = view === "open" ? open : done;
  return (
    <>
      <AppHeader
        eyebrow="Care coordination"
        title="My tasks"
        aside={
          overdue > 0 ? (
            <span className="rounded-full bg-over-bg px-2.5 py-1 text-caption font-semibold text-over">
              {overdue} overdue
            </span>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-3 px-4 pb-6">
        <div
          role="tablist"
          aria-label="Tasks"
          className="grid grid-cols-2 gap-1 rounded-full bg-sunken p-1"
        >
          {(
            [
              ["open", `Open · ${open.length}`],
              ["done", "Completed"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={cn(
                "cursor-pointer rounded-full py-2 text-small font-semibold transition-colors duration-(--duration-fast)",
                view === id ? "bg-ink-900 text-page" : "text-ink-500",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {!rows ? (
          <Skeleton className="h-60" />
        ) : list.length === 0 ? (
          <AppEmpty
            icon={ClipboardList}
            title={view === "open" ? "Nothing open" : "Nothing completed yet"}
            compact
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => ctx.open(<TaskSheet t={t} ctx={ctx} />)}
                  className="relative flex w-full cursor-pointer overflow-hidden rounded-card border border-border bg-surface text-left hover:bg-sunken"
                >
                  <span
                    aria-hidden="true"
                    className={cn("w-1 flex-none", priorityEdge[t.priority] ?? "bg-border-strong")}
                  />
                  <span className="min-w-0 flex-1 p-3">
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-small font-semibold text-ink-900">{t.title}</span>
                      <Tag tone={priorityTone[t.priority] ?? "neutral"}>{t.priority}</Tag>
                    </span>
                    <span className="mt-1 flex items-center gap-1.5 text-caption text-ink-500">
                      {t.participant && <Avatar name={t.participant} size={18} kind="patient" />}
                      {t.participant ?? "No patient"} · {t.category}
                    </span>
                    <span className="mt-1.5 flex items-center justify-between text-caption">
                      <span className="text-ink-700">{t.status}</span>
                      {t.dueAt && (
                        <span
                          className={cn(t.overdue ? "font-semibold text-over" : "text-ink-700")}
                        >
                          {t.overdue ? "Overdue · " : "Due "}
                          {shortDate(t.dueAt)}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function TaskSheet({ t, ctx }: { t: TaskRow; ctx: Ctx }) {
  const [outcome, setOutcome] = useState("");
  const [busy, setBusy] = useState(false);
  const closed = ["Completed", "Cancelled"].includes(t.status);
  async function move(to: string, label: string) {
    setBusy(true);
    try {
      await api(`/api/care/coordination/${t.id}`, {
        body: { type: "status", to, reason: "", outcome },
      });
      toast(label, { tone: "success" });
      ctx.done();
    } catch (e) {
      toast("Couldn't update", {
        tone: "error",
        detail: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppSheet
      title={t.ref}
      onClose={ctx.close}
      footer={
        closed ? null : t.status === "In Progress" ? (
          <Button
            variant="primary"
            className="w-full"
            loading={busy}
            disabled={outcome.trim().length < 5}
            onClick={() => move("Completed", "Task completed")}
          >
            <CheckCircle2 className="size-4" aria-hidden="true" /> Complete task
          </Button>
        ) : (
          <Button
            variant="primary"
            className="w-full"
            loading={busy}
            onClick={() => move("In Progress", "Started")}
          >
            Start task
          </Button>
        )
      }
    >
      <p className="text-body font-semibold text-ink-900">{t.title}</p>
      <div className="mt-2 mb-3 flex flex-wrap gap-1.5">
        <Tag tone={priorityTone[t.priority] ?? "neutral"}>{t.priority}</Tag>
        <Tag tone="outline">{t.status}</Tag>
        <Tag tone="outline">{t.category}</Tag>
      </div>
      <Facts
        rows={[
          ["Patient", t.participant ?? "None"],
          [
            "Due",
            t.dueAt ? `${shortDate(t.dueAt)}${t.overdue ? " (overdue)" : ""}` : "No due date",
          ],
          ["From", t.source],
        ]}
      />
      {t.status === "In Progress" && (
        <div className="mt-3">
          <Area
            label="What was done?"
            value={outcome}
            onChange={setOutcome}
            placeholder="Recorded with the task when you complete it."
          />
        </div>
      )}
    </AppSheet>
  );
}

/* ------------------------------------------------------------------ messages and me */

function MessagesTab({ onChat }: { onChat: (id: string) => void }) {
  const chats = useConversations();
  return (
    <>
      <AppHeader eyebrow="Messages" title="Patients and families" />
      <div className="px-4 pb-6">
        <AppCard className="overflow-hidden p-0!">
          <ConversationList
            conversations={chats.data?.conversations}
            error={chats.error}
            loading={chats.loading}
            onRetry={chats.reload}
            selected={null}
            onSelect={onChat}
            emptyText="Conversations start when you accept a patient."
          />
        </AppCard>
      </div>
    </>
  );
}

function MeTab({
  ctx,
  user,
  onSignedOut,
}: {
  ctx: Ctx;
  user: SessionUser;
  onSignedOut: () => void;
}) {
  const t = ctx.data?.therapist;
  const avail = useResource<{
    weekly: { weekday: number; start: number; end: number }[];
    timeOff: { id: string; from: string; to: string; reason: string }[];
  }>("/api/me/availability");
  const days = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const hhmm = (m: number) =>
    timeOfDay(new Date(Date.UTC(2026, 0, 1, Math.floor(m / 60) - 10, m % 60)));
  const pct = t ? Math.round((t.activeClients / Math.max(1, t.capacity)) * 100) : 0;
  const hours = (avail.data?.weekly ?? []).reduce((s, w) => s + (w.end - w.start) / 60, 0);
  const statusTone: TagTone =
    t?.status === "At Risk" ? "over" : t?.status === "Healthy" ? "healthy" : "watch";
  return (
    <>
      <div className="flex flex-col items-center px-4 pt-14 pb-5 text-center">
        <Avatar name={user.name} size={88} kind="staff" className="ring-4 ring-accent-tint" />
        <p className="mt-3 type-display text-h2 text-ink-900">{user.name}</p>
        <p className="text-small text-ink-500">
          {t?.discipline ?? "Therapist"}
          {t?.region ? ` · ${t.region}` : ""}
        </p>
      </div>
      <div className="flex flex-col gap-3 px-4 pb-6">
        {t && (
          <section
            aria-label="Caseload"
            className="flex items-center gap-4 rounded-card border border-border bg-surface p-4"
          >
            <Ring percent={pct} size={78} stroke={7} label={`Caseload ${pct}%`}>
              <span className="text-section font-semibold text-ink-900">{pct}%</span>
            </Ring>
            <div className="min-w-0 flex-1">
              <p className="text-caption font-semibold tracking-wide text-ink-500 uppercase">
                Caseload
              </p>
              <p className="text-h2 leading-tight font-semibold text-ink-900">
                {t.activeClients}
                <span className="text-body font-normal text-ink-500"> of {t.capacity}</span>
              </p>
              <div className="mt-1">
                <Tag tone={statusTone}>{t.status}</Tag>
              </div>
            </div>
          </section>
        )}
        <section
          aria-label="My working week"
          className="rounded-card border border-border bg-surface p-4"
        >
          <div className="flex items-baseline justify-between">
            <p className="text-section font-semibold text-ink-900">My working week</p>
            <p className="text-caption text-ink-500">{hours} h</p>
          </div>
          {!avail.data ? (
            <Skeleton className="mt-3 h-24" />
          ) : (
            <div className="mt-3 grid grid-cols-7 items-end gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                const w = avail.data?.weekly.find((x) => x.weekday === day);
                const h = w ? (w.end - w.start) / 60 : 0;
                return (
                  <div key={day} className="flex flex-col items-center gap-1">
                    <div className="flex h-20 w-full items-end overflow-hidden rounded-control bg-sunken">
                      <div
                        className="w-full rounded-control bg-accent-fill"
                        style={{ height: `${(h / 10) * 100}%` }}
                      />
                    </div>
                    <span className="text-caption text-ink-500">{days[day]}</span>
                  </div>
                );
              })}
            </div>
          )}
          {avail.data && avail.data.weekly[0] && (
            <p className="mt-2 text-caption text-ink-700">
              Usually {hhmm(avail.data.weekly[0].start)} to {hhmm(avail.data.weekly[0].end)}
            </p>
          )}
          {avail.data && avail.data.timeOff.length > 0 && (
            <div className="mt-3 border-t border-border pt-3">
              <p className="text-caption font-semibold text-ink-700">Approved leave</p>
              <ul className="mt-1 flex flex-col gap-1 text-small">
                {avail.data.timeOff.slice(0, 3).map((o) => (
                  <li key={o.id} className="text-ink-900">
                    {shortDate(`${o.from}T00:00:00Z`)} to {shortDate(`${o.to}T00:00:00Z`)} ·{" "}
                    {o.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-small font-semibold">
            <a href="/profile?tab=availability">Change hours</a>
            <a href="/profile?tab=leave">Request leave</a>
            <a href="/profile?tab=timesheet">My timesheet</a>
          </p>
        </section>
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

/* ------------------------------------------------------------------ schedule */

function ScheduleTab({ ctx }: { ctx: Ctx }) {
  const now = useNow();
  const visits = (ctx.data?.upcoming ?? []).filter(
    (v) => !now || new Date(v.start).getTime() - now < 15 * 86_400_000,
  );
  const days = [...new Set(visits.map((v) => brisbaneDate(v.start)))];
  const video = visits.filter((v) => v.modality === "Telehealth").length;
  return (
    <>
      <AppHeader eyebrow="Appointments" title="My schedule" />
      <div className="flex flex-col gap-4 px-4 pb-6">
        <dl className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-card border border-border bg-surface">
          {[
            ["Next 2 weeks", visits.length],
            ["Days", days.length],
            ["Video calls", video],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col items-center py-3">
              <dd className="type-display text-[24px] leading-8 text-ink-900">{value}</dd>
              <dt className="text-label tracking-wide text-ink-500 uppercase">{label}</dt>
            </div>
          ))}
        </dl>
        {!ctx.data ? (
          <Skeleton className="h-64" />
        ) : visits.length === 0 ? (
          <AppEmpty icon={CalendarCheck} title="Nothing booked in the next two weeks" compact />
        ) : (
          days.map((day) => {
            const list = visits.filter((v) => brisbaneDate(v.start) === day);
            return (
              <section key={day} aria-label={shortDate(list[0]?.start ?? day)}>
                <div className="mb-2 flex items-baseline justify-between">
                  <p className="type-display text-h2 text-ink-900">
                    {new Intl.DateTimeFormat("en-AU", {
                      weekday: "long",
                      day: "numeric",
                      month: "short",
                      timeZone: "Australia/Brisbane",
                    }).format(new Date(list[0]?.start ?? day))}
                  </p>
                  <span className="text-caption text-ink-500">
                    {list.length} visit{list.length === 1 ? "" : "s"}
                  </span>
                </div>
                <Timeline visits={list} ctx={ctx} />
              </section>
            );
          })
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ patient */

type Client = TherapistHomeDto["clients"][number];
type PlanRowLite = {
  id: string | null;
  clientId: string;
  needId: string;
  support: string;
  state: string;
};
type Goal = {
  id: string;
  title: string;
  description: string;
  type: string;
  unit: string;
  baseline: string;
  target: string;
  current: string;
  state: string;
  priority: string;
  points: { value: string; date: string; source: string; by: string }[];
};
type AssessRowLite = {
  id: string;
  ref: string;
  clientId: string;
  support: string;
  status: string;
  purpose: string;
  progress: number;
  updatedAt: string;
};
type Domain = { key: string; title: string; items: string[] };
type TimelineItem = {
  id: string;
  at: string;
  kind: string;
  title: string;
  detail: string;
  by: string | null;
  restricted: boolean;
};

const kindTone: Record<string, BadgeTone> = {
  Visit: "blue",
  Assessment: "violet",
  "Treatment plan": "teal",
  Entry: "orange",
  Report: "green",
  Risk: "red",
  Consent: "indigo",
};

const kindIcon: Record<string, typeof House> = {
  Visit: CalendarCheck,
  Assessment: ClipboardList,
  "Treatment plan": Target,
  Entry: FileSignature,
  Report: FileSignature,
};

function PatientScreen({ c, ctx, onClose }: { c: Client; ctx: Ctx; onClose: () => void }) {
  const [picked, setView] = useState<"history" | "goals" | "assess" | "ai">("history");
  const ai = useAiEnabled();
  const view = !ai && picked === "ai" ? "history" : picked;
  const [inner, setInner] = useState<ReactNode>(null);
  const record = useResource<{ record: { timeline: TimelineItem[] } }>(`/api/care/records/${c.id}`);
  const plans = useResource<{ rows: PlanRowLite[] }>("/api/care/plans");
  const assess = useResource<{ rows: AssessRowLite[] }>("/api/care/assessments");
  const versions = (plans.data?.rows ?? []).filter((p) => p.clientId === c.id && p.id);
  const myPlan =
    versions.find((p) => p.state === "Draft") ??
    versions.find((p) => !["Superseded", "Discontinued", "Completed"].includes(p.state)) ??
    versions[0];
  const need = (plans.data?.rows ?? []).find((p) => p.clientId === c.id);
  const plan = useResource<{ plan: { id: string; state: string; goals: Goal[] } }>(
    myPlan?.id ? `/api/care/plans/${myPlan.id}` : null,
  );
  const myAssess = (assess.data?.rows ?? []).filter((a) => a.clientId === c.id);
  const next = ctx.data?.upcoming.find((v) => v.clientId === c.id);
  const visits = [
    ...(ctx.data?.upcoming ?? []),
    ...(ctx.data?.recent ?? []),
    ...(ctx.data?.notesToWrite ?? []),
  ].filter((v, i, l) => v.clientId === c.id && l.findIndex((x) => x.id === v.id) === i);
  const done = visits.filter((v) => v.status === "completed").length;
  const refresh = () => {
    setInner(null);
    plans.reload();
    plan.reload();
    assess.reload();
    record.reload();
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-page">
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div className="bg-ink-900 px-4 pt-12 pb-5 text-page">
          <button
            type="button"
            aria-label="Back"
            onClick={onClose}
            className="mb-3 flex size-9 cursor-pointer items-center justify-center rounded-full bg-page/15"
          >
            <ChevronRight className="size-4 rotate-180" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-3">
            <Avatar name={c.name} size={64} kind="patient" className="ring-2 ring-page/30" />
            <div className="min-w-0">
              <p className="truncate type-display text-h1 leading-tight">{c.name}</p>
              <p className="flex items-center gap-1 text-small opacity-75">
                <MapPin className="size-3.5" aria-hidden="true" /> {c.suburb} · {c.frequency}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 divide-x divide-page/15 border-t border-page/15 pt-3 text-center">
            <div>
              <p className="type-display text-[22px] leading-7">{done}</p>
              <p className="text-label tracking-wide uppercase opacity-70">Visits done</p>
            </div>
            <div>
              <p className="type-display text-[22px] leading-7">
                {plan.data?.plan.goals.length ?? "–"}
              </p>
              <p className="text-label tracking-wide uppercase opacity-70">Goals</p>
            </div>
            <div>
              <p className="type-display text-[22px] leading-7">
                {next ? shortDate(next.start).split(" ").slice(1).join(" ") : "–"}
              </p>
              <p className="text-label tracking-wide uppercase opacity-70">Next visit</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              setInner(
                <AppWebView
                  title={c.name}
                  href={`/therapist/patients/${c.id}`}
                  onClose={() => setInner(null)}
                />,
              )
            }
            className="mt-4 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-full border border-page/30 py-2 text-caption font-semibold"
          >
            <FolderOpen className="size-3.5" aria-hidden="true" /> Full patient file
          </button>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {c.conversationId && (
              <button
                type="button"
                onClick={() => c.conversationId && ctx.onChat(c.conversationId)}
                className="flex cursor-pointer items-center justify-center gap-1.5 rounded-full bg-page/15 py-2 text-caption font-semibold"
              >
                <MessageCircle className="size-3.5" aria-hidden="true" /> Message
              </button>
            )}
            {next && (
              <button
                type="button"
                onClick={() => ctx.open(<VisitSheet visit={next} ctx={ctx} />)}
                className="flex cursor-pointer items-center justify-center gap-1.5 rounded-full bg-page py-2 text-caption font-semibold text-ink-900"
              >
                <CalendarCheck className="size-3.5" aria-hidden="true" /> Next visit
              </button>
            )}
          </div>
        </div>

        <div className="px-4 pt-4 pb-8">
          <div
            role="tablist"
            aria-label="Patient"
            className={cn(
              "mb-4 grid gap-1 rounded-full bg-sunken p-1",
              ai ? "grid-cols-4" : "grid-cols-3",
            )}
          >
            {(
              [
                ["history", "History"],
                ["goals", "Goals"],
                ["assess", "Assess"],
                ["ai", "AI"],
              ] as const
            ).map(([id, label]) => (
              <button
                data-ai-only={id === "ai" || undefined}
                key={id}
                type="button"
                role="tab"
                aria-selected={view === id}
                onClick={() => setView(id)}
                className={cn(
                  "cursor-pointer rounded-full py-2 text-caption font-semibold",
                  view === id ? "bg-ink-900 text-page" : "text-ink-500",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {view === "history" &&
            (!record.data ? (
              <Skeleton className="h-60" />
            ) : (
              <ol className="relative ml-1 border-l border-border-strong pl-4">
                {record.data.record.timeline.slice(0, 25).map((e) => {
                  const Icon = kindIcon[e.kind] ?? CheckCircle2;
                  return (
                    <li key={e.id} className="relative mb-3">
                      <span className="absolute top-2 -left-[25px] flex size-4 items-center justify-center rounded-full bg-page">
                        <span className="size-2.5 rounded-full bg-accent" />
                      </span>
                      <div className="rounded-card border border-border bg-surface p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-caption font-semibold text-ink-700">
                            <IconBadge icon={Icon} tone={kindTone[e.kind] ?? "blue"} size={24} />
                            {e.kind}
                          </span>
                          <span className="text-caption text-ink-500">{shortDate(e.at)}</span>
                        </div>
                        <p className="mt-1 text-small font-semibold text-ink-900">{e.title}</p>
                        {e.detail && !e.restricted && (
                          <p className="mt-0.5 line-clamp-2 text-caption text-ink-700">
                            {e.detail}
                          </p>
                        )}
                        {e.by && <p className="mt-1 text-caption text-ink-500">{e.by}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ))}

          {view === "goals" &&
            (!plans.data ? (
              <Skeleton className="h-60" />
            ) : !myPlan?.id ? (
              <AppEmpty icon={Target} title="No treatment plan yet" compact>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={async () => {
                    if (!need) return;
                    try {
                      await api("/api/care/plans", {
                        body: { clientId: c.id, needId: need.needId },
                      });
                      toast("Plan started", { tone: "success" });
                      plans.reload();
                    } catch (e) {
                      toast("Couldn't start the plan", {
                        tone: "error",
                        detail: e instanceof Error ? e.message : "",
                      });
                    }
                  }}
                >
                  Start a treatment plan
                </Button>
              </AppEmpty>
            ) : !plan.data ? (
              <Skeleton className="h-60" />
            ) : (
              <div className="flex flex-col gap-3">
                {plan.data.plan.goals.map((g) => (
                  <GoalCard
                    key={g.id}
                    g={g}
                    onRecord={() =>
                      setInner(
                        <MeasureSheet
                          planId={plan.data?.plan.id ?? ""}
                          g={g}
                          onClose={() => setInner(null)}
                          onDone={refresh}
                        />,
                      )
                    }
                  />
                ))}
                <Button
                  className="w-full"
                  onClick={() =>
                    setInner(
                      <GoalSheet
                        planId={plan.data?.plan.id ?? ""}
                        signed={["Active", "Under Review", "Paused"].includes(
                          plan.data?.plan.state ?? "",
                        )}
                        onClose={() => setInner(null)}
                        onDone={refresh}
                      />,
                    )
                  }
                >
                  <Target className="size-4" aria-hidden="true" /> Add a goal
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() =>
                    setInner(
                      <AppWebView
                        title="Treatment plan"
                        href={`/therapist/plans/${plan.data?.plan.id ?? ""}`}
                        onClose={() => setInner(null)}
                      />,
                    )
                  }
                >
                  Open the full plan: interventions, budget, sharing
                </Button>
              </div>
            ))}

          {ai && view === "ai" && <PatientAiTab clientId={c.id} />}

          {view === "assess" &&
            (!assess.data ? (
              <Skeleton className="h-60" />
            ) : (
              <div className="flex flex-col gap-3">
                {myAssess.length === 0 && (
                  <AppEmpty icon={ClipboardList} title="No assessments yet" compact />
                )}
                {myAssess.map((a) => (
                  <div key={a.id} className="rounded-card border border-border bg-surface p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-small font-semibold text-ink-900">
                          {a.purpose} assessment
                        </p>
                        <p className="text-caption text-ink-500">
                          {a.support} · <span className="font-mono">{a.ref}</span>
                        </p>
                      </div>
                      <Tag
                        tone={
                          a.status === "Signed" || a.status === "Completed"
                            ? "healthy"
                            : "available"
                        }
                      >
                        {a.status}
                      </Tag>
                    </div>
                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-sunken">
                      <div
                        className="h-full rounded-full bg-accent-fill"
                        style={{ width: `${a.progress}%` }}
                      />
                    </div>
                    <p className="mt-1 text-caption text-ink-500">
                      {a.progress}% complete · updated {shortDate(a.updatedAt)}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setInner(
                          <AssessmentAppSheet
                            id={a.id}
                            onClose={() => setInner(null)}
                            onDone={() => assess.reload()}
                          />,
                        )
                      }
                      className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-accent-fill py-2.5 text-caption font-semibold text-on-accent"
                    >
                      <ClipboardList className="size-4" aria-hidden="true" />
                      Visits, report and signing
                    </button>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setInner(
                            <ObserveSheet
                              id={a.id}
                              title={`${a.purpose} · ${a.ref}`}
                              onClose={() => setInner(null)}
                              onDone={refresh}
                            />,
                          )
                        }
                        className="cursor-pointer rounded-full bg-accent-tint py-2 text-caption font-semibold text-accent"
                      >
                        Record observation
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setInner(
                            <AppWebView
                              title={`${a.purpose} assessment`}
                              href={`/therapist/assessments/${a.id}`}
                              onClose={() => setInner(null)}
                            />,
                          )
                        }
                        className="cursor-pointer rounded-full bg-ink-900 py-2 text-caption font-semibold text-page"
                      >
                        Open full assessment
                      </button>
                    </div>
                  </div>
                ))}
                {need && (
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={async () => {
                      try {
                        const r = await api<{ id: string }>("/api/care/assessments", {
                          body: { clientId: c.id, needId: need.needId, kind: "Initial" },
                        });
                        toast("Initial assessment ready", { tone: "success" });
                        assess.reload();
                        setInner(
                          <ObserveSheet
                            id={r.id}
                            title="Initial assessment"
                            onClose={() => setInner(null)}
                            onDone={refresh}
                          />,
                        );
                      } catch (e) {
                        toast("Couldn't start", {
                          tone: "error",
                          detail: e instanceof Error ? e.message : "",
                        });
                      }
                    }}
                  >
                    <ClipboardList className="size-4" aria-hidden="true" /> Start initial assessment
                  </Button>
                )}
              </div>
            ))}
        </div>
      </div>
      {inner}
    </div>
  );
}

function GoalCard({ g, onRecord }: { g: Goal; onRecord: () => void }) {
  const base = Number.parseFloat(g.baseline);
  const target = Number.parseFloat(g.target);
  const current = Number.parseFloat(g.current || g.baseline);
  const numeric = [base, target, current].every((n) => Number.isFinite(n)) && target !== base;
  const pct = numeric
    ? Math.max(0, Math.min(100, ((current - base) / (target - base)) * 100))
    : null;
  return (
    <div className="rounded-card border border-border bg-surface p-3.5">
      <div className="flex items-start gap-3">
        {pct !== null ? (
          <Ring percent={pct} size={52} stroke={5} label={`${Math.round(pct)}% towards target`}>
            <span className="text-caption font-semibold text-ink-900">{Math.round(pct)}%</span>
          </Ring>
        ) : (
          <span className="flex size-[52px] flex-none items-center justify-center rounded-full bg-accent-tint text-accent">
            <Target className="size-5" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-small font-semibold text-ink-900">{g.title}</p>
            <Tag
              tone={
                g.state === "Achieved" ? "healthy" : g.state === "On Hold" ? "watch" : "available"
              }
            >
              {g.state}
            </Tag>
          </div>
          <p className="mt-0.5 line-clamp-2 text-caption text-ink-700">{g.description}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
        {[
          ["Started", g.baseline],
          ["Now", g.current || g.baseline],
          ["Target", g.target],
        ].map(([k, v]) => (
          <div key={k} className="rounded-control bg-sunken px-1 py-1.5">
            <p className="text-label tracking-wide text-ink-500 uppercase">{k}</p>
            <p className="truncate text-caption font-semibold text-ink-900">
              {v || "–"} {v && g.unit}
            </p>
          </div>
        ))}
      </div>
      {g.points.length > 0 && (
        <p className="mt-2 text-caption text-ink-500">
          Last recorded {g.points[g.points.length - 1]?.value} {g.unit} on{" "}
          {shortDate(g.points[g.points.length - 1]?.date ?? "")}
        </p>
      )}
      <button
        type="button"
        onClick={onRecord}
        className="mt-3 w-full cursor-pointer rounded-full bg-accent-tint py-2 text-caption font-semibold text-accent"
      >
        Record progress
      </button>
    </div>
  );
}

const measureSources = [
  "Direct observation",
  "Participant report",
  "Carer report",
  "Validated instrument",
] as const;

function MeasureSheet({
  planId,
  g,
  onClose,
  onDone,
}: {
  planId: string;
  g: Goal;
  onClose: () => void;
  onDone: () => void;
}) {
  const [value, setValue] = useState("");
  const [source, setSource] = useState<(typeof measureSources)[number]>("Direct observation");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <AppSheet
      title="Record progress"
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          className="w-full"
          loading={busy}
          disabled={!value.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await api(`/api/care/plans/${planId}`, {
                body: {
                  type: "measure",
                  goalId: g.id,
                  value,
                  source,
                  context: "",
                  interpretation: note,
                },
              });
              toast("Progress recorded", { tone: "success" });
              onDone();
            } catch (e) {
              toast("Couldn't save", {
                tone: "error",
                detail: e instanceof Error ? e.message : "",
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          Save measurement
        </Button>
      }
    >
      <p className="mb-3 text-small font-semibold text-ink-900">{g.title}</p>
      <div className="flex flex-col gap-3">
        <Text
          label={`Today's value${g.unit ? ` (${g.unit})` : ""}`}
          value={value}
          onChange={setValue}
          placeholder={`Target ${g.target} ${g.unit}`}
        />
        <Choices
          label="How was it measured?"
          value={source}
          onChange={setSource}
          options={measureSources.map((x) => [x, x] as [typeof x, string])}
        />
        <Area label="What it means (optional)" value={note} onChange={setNote} />
      </div>
    </AppSheet>
  );
}

const goalKinds = ["Self-care", "Mobility", "Communication", "Participation"] as const;

function GoalSheet({
  planId,
  signed,
  onClose,
  onDone,
}: {
  planId: string;
  /** A signed plan changes through a new version, never in place. */
  signed: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<(typeof goalKinds)[number]>("Self-care");
  const [unit, setUnit] = useState("");
  const [baseline, setBaseline] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const numeric = Boolean(unit.trim());
  return (
    <AppSheet
      title="Add a goal"
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          className="w-full"
          loading={busy}
          disabled={
            title.trim().length < 3 ||
            description.trim().length < 10 ||
            (signed && reason.trim().length < 5)
          }
          onClick={async () => {
            setBusy(true);
            try {
              let into = planId;
              if (signed) {
                const r = await api<{ id: string }>(`/api/care/plans/${planId}`, {
                  body: { type: "revise", reason },
                });
                into = r.id;
              }
              await api(`/api/care/plans/${into}`, {
                body: {
                  type: "goal",
                  goal: {
                    title,
                    description,
                    category,
                    ownership: "Shared decision",
                    priority: "Medium",
                    horizon: "Short-term",
                    horizonReason: "",
                    type: numeric ? "Numeric" : "Observation",
                    direction: numeric ? "Increase" : "Descriptive",
                    baseline,
                    target,
                    unit,
                    instrument: "",
                    context: "",
                    reviewFrequency: "Every 4 sessions",
                    targetDate: "",
                    baselineAlternative: "",
                  },
                },
              });
              toast(signed ? "New plan version with the goal" : "Goal added", {
                tone: "success",
                detail: signed ? "The revision is a draft until you sign it." : undefined,
              });
              onDone();
            } catch (e) {
              toast("Couldn't add the goal", {
                tone: "error",
                detail: e instanceof Error ? e.message : "",
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          Add goal
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {signed && (
          <div className="rounded-control bg-watch-bg p-3 text-caption text-watch">
            <p className="font-semibold">This plan is signed</p>
            <p className="mt-0.5 text-ink-700">
              Adding a goal creates a new version for you to sign. The signed version stays on
              record.
            </p>
          </div>
        )}
        {signed && (
          <Text
            label="Why revise the plan?"
            value={reason}
            onChange={setReason}
            placeholder="For example, new goal agreed at review"
          />
        )}
        <Text
          label="Goal"
          value={title}
          onChange={setTitle}
          placeholder="For example, walk to the letterbox"
        />
        <Area label="What success looks like" value={description} onChange={setDescription} />
        <Choices
          label="Area"
          value={category}
          onChange={setCategory}
          options={goalKinds.map((x) => [x, x] as [typeof x, string])}
        />
        <div className="grid grid-cols-3 gap-2">
          <Text label="Unit" value={unit} onChange={setUnit} placeholder="metres" />
          <Text label="Now" value={baseline} onChange={setBaseline} />
          <Text label="Target" value={target} onChange={setTarget} />
        </div>
        <p className="text-caption text-ink-500">
          Leave the unit empty for a goal you describe rather than count.
        </p>
      </div>
    </AppSheet>
  );
}

const perf = [
  "Independent",
  "Modified independent",
  "Supervision",
  "Verbal prompting",
  "Partial physical assistance",
] as const;

function ObserveSheet({
  id,
  title,
  onClose,
  onDone,
}: {
  id: string;
  title: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const detail = useResource<{
    assessment: { domains: Domain[]; observations: { item: string }[] };
  }>(`/api/care/assessments/${id}`);
  const domains = detail.data?.assessment.domains ?? [];
  const [domain, setDomain] = useState("");
  const [item, setItem] = useState("");
  const [level, setLevel] = useState<(typeof perf)[number]>("Supervision");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const d = domains.find((x) => x.key === domain) ?? domains[0];
  return (
    <AppSheet
      title={title}
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          className="w-full"
          loading={busy}
          disabled={!d || !(item || d.items[0])}
          onClick={async () => {
            if (!d) return;
            setBusy(true);
            try {
              await api(`/api/care/assessments/${id}`, {
                body: {
                  type: "observe",
                  domain: d.key,
                  item: item || d.items[0] || d.title,
                  source: "Direct observation",
                  performance: level,
                  context: "Home",
                  frequency: "Often",
                  result:
                    level === "Independent" ? "Completed safely" : "Completed with difficulty",
                  quality: "Observed",
                  notes,
                  reason: "",
                },
              });
              toast("Observation saved", { tone: "success" });
              onDone();
            } catch (e) {
              toast("Couldn't save", {
                tone: "error",
                detail: e instanceof Error ? e.message : "",
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          Save observation
        </Button>
      }
    >
      {!detail.data ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-caption text-ink-500">
            {detail.data.assessment.observations.length} observations so far. Record what you see as
            you go; the full form is on the web.
          </p>
          <Choices
            label="Area"
            value={d?.key ?? ""}
            onChange={(v) => {
              setDomain(v);
              setItem("");
            }}
            options={domains.slice(0, 6).map((x) => [x.key, x.title] as [string, string])}
          />
          {d && d.items.length > 0 && (
            <Choices
              label="Task observed"
              value={item || d.items[0] || ""}
              onChange={setItem}
              options={d.items.slice(0, 6).map((x) => [x, x] as [string, string])}
            />
          )}
          <Choices
            label="How did they do?"
            value={level}
            onChange={setLevel}
            options={perf.map((x) => [x, x] as [typeof x, string])}
          />
          <Area label="What you saw" value={notes} onChange={setNotes} />
        </div>
      )}
    </AppSheet>
  );
}

/* ------------------------------------------------------------------ clinical hub */

const hub: {
  group: string;
  items: { title: string; detail: string; href: string; icon: typeof House; tone: BadgeTone }[];
}[] = [
  {
    group: "Clinical work",
    items: [
      {
        title: "Assessments",
        detail: "Initial and reviews, domains, evidence, sign",
        href: "/therapist/assessments",
        icon: ClipboardList,
        tone: "violet",
      },
      {
        title: "Treatment plans",
        detail: "Goals, interventions, budgets, sharing",
        href: "/therapist/plans",
        icon: Target,
        tone: "teal",
      },
      {
        title: "Sessions",
        detail: "Session records, goals worked on, outcomes",
        href: "/therapist/sessions",
        icon: CalendarCheck,
        tone: "blue",
      },
      {
        title: "Documentation",
        detail: "Notes, AI drafts, signing, amendments",
        href: "/therapist/documentation",
        icon: FileSignature,
        tone: "orange",
      },
      {
        title: "Progress and reports",
        detail: "Outcome trends, progress reports, release",
        href: "/therapist/progress",
        icon: TrendingUp,
        tone: "green",
      },
      {
        title: "Clinical records",
        detail: "History, risks, medications, documents",
        href: "/therapist/records",
        icon: FolderOpen,
        tone: "indigo",
      },
    ],
  },
  {
    group: "My practice",
    items: [
      {
        title: "New patients",
        detail: "Requests to accept or decline",
        href: "/therapist",
        icon: UserPlus,
        tone: "red",
      },
      {
        title: "My workspace",
        detail: "Workload, briefs and what's next",
        href: "/therapist/workspace",
        icon: Briefcase,
        tone: "ink",
      },
      {
        title: "Schedule and billing",
        detail: "Calendar, availability, billable visits",
        href: "/therapist/schedule",
        icon: CalendarDays,
        tone: "blue",
      },
      {
        title: "Care coordination",
        detail: "Shared tasks, handovers, the care team",
        href: "/therapist/coordination",
        icon: Workflow,
        tone: "teal",
      },
      {
        title: "Operations tasks",
        detail: "Tasks routed to me by rules",
        href: "/therapist/tasks",
        icon: ListChecks,
        tone: "amber",
      },
      {
        title: "My reports",
        detail: "My activity and outcomes",
        href: "/therapist/reports",
        icon: ChartColumn,
        tone: "violet",
      },
      {
        title: "Video recordings",
        detail: "Telehealth recordings and consent",
        href: "/telehealth/recordings",
        icon: Video,
        tone: "red",
      },
      {
        title: "Profile and availability",
        detail: "Hours, time off, credentials",
        href: "/profile",
        icon: UserRound,
        tone: "indigo",
      },
    ],
  },
];

function ClinicalTab({
  ctx,
  rows,
  onTab,
}: {
  ctx: Ctx;
  rows: TaskRow[] | null;
  onTab: (t: string) => void;
}) {
  const open = (rows ?? []).filter((t) => t.mine && !["Completed", "Cancelled"].includes(t.status));
  const late = open.filter((t) => t.overdue).length;
  const counts: Record<string, number | undefined> = {
    "New patients": ctx.data?.requests.length,
    Documentation: ctx.data?.notesToWrite.length,
  };
  return (
    <>
      <AppHeader eyebrow="Everything in the portal" title="Clinical" />
      <div className="flex flex-col gap-4 px-4 pb-6">
        <button
          type="button"
          onClick={() => onTab("tasks")}
          className="flex cursor-pointer items-center gap-3 rounded-card bg-ink-900 p-4 text-left text-page"
        >
          <span className="flex size-11 flex-none items-center justify-center rounded-full bg-page/15">
            <ListChecks className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block type-display text-h2 leading-tight">My tasks</span>
            <span className="block text-caption opacity-75">
              {open.length} open{late ? ` · ${late} overdue` : ""}
            </span>
          </span>
          <ChevronRight className="size-5 opacity-70" aria-hidden="true" />
        </button>
        {hub.map((g) => (
          <section key={g.group} aria-label={g.group}>
            <AppSection title={g.group} />
            <div className="grid grid-cols-2 gap-2.5 @3xl:grid-cols-3">
              {g.items.map((it) => {
                const n = counts[it.title];
                return (
                  <button
                    key={it.title}
                    type="button"
                    onClick={() =>
                      ctx.open(<AppWebView title={it.title} href={it.href} onClose={ctx.close} />)
                    }
                    className="relative flex min-h-[124px] cursor-pointer flex-col justify-between rounded-card border border-border bg-surface p-3 text-left hover:bg-sunken active:scale-98"
                  >
                    <IconBadge icon={it.icon} tone={it.tone} size={42} />
                    {n ? (
                      <span className="absolute top-3 right-3 flex h-6 min-w-6 items-center justify-center rounded-full bg-over-dot px-1.5 text-caption font-semibold text-page">
                        {n}
                      </span>
                    ) : null}
                    <span>
                      <span className="block text-small font-semibold text-ink-900">
                        {it.title}
                      </span>
                      <span className="mt-0.5 block text-caption leading-snug text-ink-500">
                        {it.detail}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ small parts */

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 rounded-control border border-border p-3 text-small">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-500">{k}</dt>
          <dd className="text-ink-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Text({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-caption font-semibold text-ink-700">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-control border border-border-strong bg-surface px-3 py-2 text-small"
      />
    </label>
  );
}

function Area({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-caption font-semibold text-ink-700">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="rounded-control border border-border-strong bg-surface px-3 py-2 text-small"
      />
      {wantsAssist(label) && <NoteAssist label={label} value={value} onChange={onChange} />}
    </label>
  );
}

function Choices<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <div>
      <p className="mb-1.5 text-caption font-semibold text-ink-700">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map(([id, text]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            onClick={() => onChange(id)}
            className={cn(
              "cursor-pointer rounded-full border px-3 py-1.5 text-caption font-semibold",
              value === id
                ? "border-accent-fill bg-accent-fill text-on-accent"
                : "border-border-strong bg-surface text-ink-700",
            )}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
