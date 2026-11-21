"use client";

import type { ReactNode } from "react";

import {
  BellRing,
  CalendarCheck,
  CalendarClock,
  Check,
  ChevronRight,
  HeartHandshake,
  MessageCircle,
  Star,
} from "lucide-react";
import { Avatar } from "@/components/ui/premium";
import { Tag } from "@/components/ui/tag";
import { AppCard, AppEmpty, AppHeader, AppSection } from "@/features/mobile/phone-frame";
import { useLiveStatus, useNow } from "@/lib/live/client";
import { practitioner } from "@/lib/live/catalogue";
import { brisbaneDay, shortDate, slotLabel, timeOfDay } from "@/lib/live/time";
import type { AppointmentDto, ClientHomeDto, ConversationDto, NeedDto } from "@/lib/live/types";
import { cn } from "@/lib/cn";
import { Skeleton } from "./bits";

const DAY = 86_400_000;

function greeting(now: number | null) {
  if (now === null) return "Welcome back";
  const hour = new Date(now + 10 * 3_600_000).getUTCHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function countdown(start: string, now: number | null) {
  if (now === null) return null;
  const days = Math.round(
    (brisbaneDay(new Date(start)).getTime() - brisbaneDay(new Date(now)).getTime()) / DAY,
  );
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

function NextVisit({
  visit,
  now,
  onMessage,
  onChange,
}: {
  visit: AppointmentDto;
  now: number | null;
  onMessage?: () => void;
  onChange: () => void;
}) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(new Date(visit.start));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const soon = countdown(visit.start, now);
  return (
    <section
      aria-label="Next visit"
      className="mb-4 overflow-hidden rounded-card bg-ink-900 text-page"
    >
      <div className="flex items-center justify-between px-4 pt-4">
        <span className="text-caption font-semibold tracking-[0.16em] uppercase opacity-70">
          Your next visit
        </span>
        {soon && (
          <span className="rounded-full bg-page/15 px-2.5 py-1 text-caption font-semibold">
            {soon}
          </span>
        )}
      </div>
      <div className="flex items-end gap-4 px-4 pt-3 pb-4">
        <div className="flex w-[72px] flex-none flex-col items-center rounded-card bg-page py-2.5 text-ink-900">
          <span className="text-label font-semibold tracking-wide text-ink-500 uppercase">
            {part("weekday")}
          </span>
          <span className="type-display text-[34px] leading-none">{part("day")}</span>
          <span className="text-label font-semibold tracking-wide text-accent uppercase">
            {part("month")}
          </span>
        </div>
        <div className="min-w-0 flex-1 pb-0.5">
          <p className="type-display text-[30px] leading-none">{timeOfDay(visit.start)}</p>
          <p className="mt-1.5 truncate text-small opacity-75">
            {visit.discipline}
            {visit.series && ` · visit ${visit.series.index} of ${visit.series.total}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 border-t border-page/15 px-4 py-3">
        <Avatar name={visit.therapistName} size={40} className="ring-2 ring-page/30" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-small font-semibold">{visit.therapistName}</span>
          <span className="block text-caption opacity-70">Your clinician</span>
        </span>
        {onMessage && (
          <button
            type="button"
            onClick={onMessage}
            aria-label={`Message ${visit.therapistName}`}
            className="flex size-10 cursor-pointer items-center justify-center rounded-full bg-page/15 active:scale-95"
          >
            <MessageCircle className="size-4.5" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={onChange}
          className="h-10 cursor-pointer rounded-full bg-page px-4 text-caption font-semibold text-ink-900 active:scale-95"
        >
          Change
        </button>
      </div>
    </section>
  );
}

function todayLabel(now: number | null) {
  if (now === null) return "Medisense";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
}

/** Where one service is on its way to the first visit, as a vertical timeline. */
function Journey({ need }: { need: NeedDto }) {
  const asked = need.status === "waiting";
  const steps = [
    { title: "Referral approved", detail: "Your care team has approved this service." },
    {
      title: asked ? `${need.therapistName ?? "A therapist"} asked` : "Finding your therapist",
      detail: asked
        ? "Chosen for their experience and availability near you."
        : "We're matching you with the right clinician for your needs.",
    },
    {
      title: "Therapist confirms",
      detail: "You'll see who they are here, and can message them straight away.",
    },
    { title: "First visit booked", detail: "The date and time appear on your home screen." },
  ];
  const current = asked ? 2 : 1;
  return (
    <section className="mb-3 overflow-hidden rounded-card border border-border bg-surface shadow-lift">
      <header className="flex items-start gap-3 border-b border-border px-4 py-3.5">
        <span
          aria-hidden="true"
          className="flex size-10 flex-none items-center justify-center rounded-control bg-accent-tint text-accent"
        >
          <HeartHandshake className="size-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-small leading-5 font-semibold text-ink-900">{need.support}</h3>
          <p className="truncate text-caption text-ink-500">
            {need.frequency} · {need.location}
          </p>
        </div>
        <Tag tone={asked ? "watch" : "neutral"}>{asked ? "Confirming" : "Matching"}</Tag>
      </header>
      <ol className="px-4 pt-4 pb-1">
        {steps.map((step, i) => {
          const done = i < current;
          const now = i === current;
          return (
            <li key={step.title} className="relative flex gap-3 pb-4 last:pb-3">
              {i < steps.length - 1 && (
                <i
                  aria-hidden="true"
                  className={cn(
                    "absolute top-6 bottom-0 left-[11px] w-0.5 rounded-full",
                    done ? "bg-accent-fill" : "bg-border",
                  )}
                />
              )}
              <span
                aria-hidden="true"
                className={cn(
                  "relative flex size-6 flex-none items-center justify-center rounded-full text-label font-bold",
                  done && "bg-accent-fill text-on-accent",
                  now && "bg-surface text-accent ring-2 ring-accent-fill",
                  !done && !now && "bg-sunken text-ink-500",
                )}
              >
                {done ? (
                  <Check className="size-3.5" strokeWidth={3} />
                ) : now ? (
                  <i className="size-2 animate-pulse rounded-full bg-accent-fill" />
                ) : (
                  i + 1
                )}
              </span>
              <div className="min-w-0 pt-0.5">
                <p
                  className={cn(
                    "text-small leading-5",
                    done || now ? "font-semibold text-ink-900" : "font-medium text-ink-500",
                  )}
                >
                  {step.title}
                  <span className="sr-only">
                    {done ? " (done)" : now ? " (in progress)" : " (to come)"}
                  </span>
                </p>
                {now && <p className="mt-0.5 text-caption text-ink-700">{step.detail}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      {asked && need.therapistName && (
        <footer className="flex items-center gap-3 border-t border-border bg-canvas px-4 py-3">
          <Avatar name={need.therapistName} size={32} />
          <p className="min-w-0 flex-1 text-caption text-ink-700">
            <span className="block font-semibold text-ink-900">{need.therapistName}</span>
            Reviewing your request
          </p>
        </footer>
      )}
    </section>
  );
}

/** Three numbers at a glance: services, visits booked, unread messages. */
/** The patient's home: the next visit, their care team, anything waiting, and visits to rate. */
export function PatientHome({
  top,
  first,
  data,
  conversations,
  onChat,
  onChange,
  onRate,
  onOpenVisits,
}: {
  top?: ReactNode;
  first: string;
  data: ClientHomeDto | null;
  conversations: ConversationDto[];
  onChat: (id: string) => void;
  onChange: (visit: AppointmentDto) => void;
  onRate: (visit: AppointmentDto) => void;
  onOpenVisits: () => void;
}) {
  const now = useNow();
  const status = useLiveStatus();
  const unreadFor = (id: string | null) => conversations.find((c) => c.id === id)?.unread ?? 0;
  const next = data?.upcoming[0];
  const chatFor = (therapistName: string) =>
    data?.team.find((t) => t.therapistName === therapistName)?.conversationId ?? null;
  const waiting = data?.needs.filter((n) => n.status !== "assigned") ?? [];

  return (
    <>
      <AppHeader
        eyebrow={todayLabel(now)}
        title={`${greeting(now)}, ${first}`}
        aside={
          <span className="relative mt-1">
            <Avatar name={data?.name ?? first} size={42} className="ring-4 ring-surface" />
            <i
              aria-hidden="true"
              className={cn(
                "absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-surface",
                status === "live" ? "bg-healthy-dot" : "bg-watch-dot",
              )}
            />
          </span>
        }
      />
      <div className="px-4 pb-4">
        {!data ? (
          <>
            <Skeleton className="mb-3 h-20" />
            <Skeleton className="mb-3 h-36" />
            <Skeleton className="h-24" />
          </>
        ) : (
          <>
            {next ? (
              <NextVisit
                visit={next}
                now={now}
                onMessage={
                  chatFor(next.therapistName)
                    ? () => onChat(chatFor(next.therapistName) ?? "")
                    : undefined
                }
                onChange={() => onChange(next)}
              />
            ) : (
              !data.discharged &&
              waiting.length === 0 && (
                <AppEmpty icon={CalendarClock} title="No visits booked yet">
                  {data.needs.length === 0
                    ? "There are no services on your record yet. Once your care team adds one, it shows here."
                    : "Your next visit will appear here as soon as it's booked."}
                </AppEmpty>
              )
            )}

            {data.discharged && (
              <AppCard title="Your care has finished">
                <p className="text-small text-ink-700">
                  {data.discharged.reason}. Thank you for choosing Medisense. Your visits and notes
                  stay here.
                </p>
              </AppCard>
            )}
            {top}
            {data.toRate.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => onRate(v)}
                className="mb-3 flex w-full cursor-pointer items-center gap-3 rounded-card border border-watch-bg bg-watch-bg p-3.5 text-left active:scale-99"
              >
                <span className="flex size-10 flex-none items-center justify-center rounded-full bg-surface text-watch">
                  <Star className="size-5 fill-watch-dot text-watch-dot" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-small font-semibold">How was your visit?</span>
                  <span className="block truncate text-caption text-ink-700">
                    {v.therapistName.split(" ")[0]} · {shortDate(v.start)}
                  </span>
                </span>
                <ChevronRight className="size-4 text-ink-500" aria-hidden="true" />
              </button>
            ))}

            {data.team.length > 0 && (
              <>
                <AppSection title="Your care team" />
                <ul className="mb-3 overflow-hidden rounded-card border border-border bg-surface shadow-lift">
                  {data.team.map((t) => {
                    const unread = unreadFor(t.conversationId);
                    return (
                      <li key={t.therapistName} className="border-b border-border last:border-0">
                        <button
                          type="button"
                          disabled={!t.conversationId}
                          onClick={() => t.conversationId && onChat(t.conversationId)}
                          className="flex w-full cursor-pointer items-center gap-3 px-3.5 py-3 text-left hover:bg-canvas"
                        >
                          <Avatar name={t.therapistName} size={44} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-small font-semibold">
                              {t.therapistName}
                            </span>
                            <span className="block text-caption text-ink-500">
                              Your {practitioner[t.discipline].toLowerCase()}
                            </span>
                          </span>
                          {unread > 0 ? (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-over-dot px-1.5 text-label font-bold text-white">
                              {unread}
                            </span>
                          ) : (
                            <MessageCircle className="size-5 text-accent" aria-hidden="true" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {waiting.length > 0 && (
              <>
                <AppSection
                  title={next ? "Also getting started" : "Getting you started"}
                  action={
                    <span className="text-caption text-ink-500">{waiting.length} in progress</span>
                  }
                />
                {waiting.map((n) => (
                  <Journey key={n.id} need={n} />
                ))}
                <div className="mb-3 flex gap-3 rounded-card bg-accent-tint px-4 py-3.5">
                  <BellRing className="mt-0.5 size-4.5 flex-none text-accent" aria-hidden="true" />
                  <p className="text-caption leading-5 text-ink-700">
                    <span className="block font-semibold text-ink-900">
                      Nothing for you to do right now
                    </span>
                    We&apos;ll let you know the moment a therapist confirms. You can message your
                    care team any time.
                  </p>
                </div>
              </>
            )}

            {data.upcoming.length > 1 && (
              <button
                type="button"
                onClick={onOpenVisits}
                className="flex w-full cursor-pointer items-center justify-between rounded-card border border-border bg-surface px-4 py-3.5 text-small font-semibold shadow-lift"
              >
                <span className="flex items-center gap-2.5">
                  <CalendarCheck className="size-4.5 text-accent" aria-hidden="true" />
                  {data.upcoming.length - 1} more visits booked
                </span>
                <span className="flex items-center gap-1 text-caption text-ink-500">
                  {next && `after ${slotLabel(next.start)}`}
                  <ChevronRight className="size-4" aria-hidden="true" />
                </span>
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}
