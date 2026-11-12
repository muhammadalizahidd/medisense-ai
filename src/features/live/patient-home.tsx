"use client";

import { CalendarClock, Check, ChevronRight, MessageCircle, Star } from "lucide-react";
import { Avatar } from "@/components/ui/premium";
import { AppCard, AppHeader } from "@/features/mobile/phone-frame";
import { useLiveStatus, useNow } from "@/lib/live/client";
import { practitioner } from "@/lib/live/catalogue";
import { brisbaneDay, shortDate, slotLabel, timeOfDay } from "@/lib/live/time";
import type { AppointmentDto, ClientHomeDto, ConversationDto } from "@/lib/live/types";
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
      className="mb-3 overflow-hidden rounded-card bg-surface shadow-overlay"
    >
      <div className="flex items-center gap-4 p-4">
        <div className="flex w-16 flex-none flex-col items-center rounded-control bg-accent-fill py-2 text-on-accent">
          <span className="text-label font-semibold uppercase">{part("weekday")}</span>
          <span className="type-display text-h1 font-semibold">{part("day")}</span>
          <span className="text-label uppercase">{part("month")}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-caption font-semibold text-accent">
            Next visit
            {soon && (
              <span className="rounded-full bg-accent-tint px-2 py-0.5 text-label">{soon}</span>
            )}
          </p>
          <p className="type-display text-h2 leading-7">{timeOfDay(visit.start)}</p>
          <p className="truncate text-caption text-ink-700">
            {visit.discipline} · at home
            {visit.series && ` · visit ${visit.series.index} of ${visit.series.total}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-border bg-canvas/60 px-4 py-2.5">
        <Avatar name={visit.therapistName} size={28} />
        <span className="min-w-0 flex-1 truncate text-caption font-medium">
          {visit.therapistName}
        </span>
        {onMessage && (
          <button
            type="button"
            onClick={onMessage}
            aria-label={`Message ${visit.therapistName}`}
            className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-accent-fill text-on-accent active:scale-95"
          >
            <MessageCircle className="size-4.5" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={onChange}
          className="h-9 cursor-pointer rounded-full border border-border-strong bg-surface px-3.5 text-caption font-semibold active:scale-95"
        >
          Change
        </button>
      </div>
    </section>
  );
}

const steps = ["Referral received", "Therapist asked", "Visits booked"];

function Matching({
  discipline,
  status,
  therapist,
}: {
  discipline: string;
  status: string;
  therapist: string | null;
}) {
  const at = status === "waiting" ? 1 : 0;
  return (
    <AppCard title={discipline}>
      <ol className="mb-2 flex items-center gap-1">
        {steps.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-1">
            <span
              className={cn(
                "flex size-5 flex-none items-center justify-center rounded-full text-label font-bold",
                i <= at ? "bg-accent-fill text-on-accent" : "bg-canvas text-ink-500",
                i === at + 1 && "ring-2 ring-accent-tint",
              )}
            >
              {i <= at ? <Check className="size-3" strokeWidth={3} aria-hidden="true" /> : i + 1}
            </span>
            {i < steps.length - 1 && (
              <i
                aria-hidden="true"
                className={cn("h-0.5 flex-1 rounded-full", i < at ? "bg-accent-fill" : "bg-border")}
              />
            )}
          </li>
        ))}
      </ol>
      <p className="text-small text-ink-700">
        {status === "waiting"
          ? `We've asked ${therapist ?? "a therapist"}. You'll see them here the moment they accept.`
          : "We're finding the right therapist for you."}
      </p>
    </AppCard>
  );
}

/** The patient's home: the next visit, their care team, anything waiting, and visits to rate. */
export function PatientHome({
  first,
  data,
  conversations,
  onChat,
  onChange,
  onRate,
  onOpenVisits,
}: {
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
        eyebrow={greeting(now)}
        title={`Hi ${first}`}
        aside={
          <span className="relative mt-1">
            <Avatar name={data?.name ?? first} size={42} className="ring-2 ring-surface" />
            <i
              aria-hidden="true"
              className={cn(
                "absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-white",
                status === "live" ? "bg-healthy-dot" : "bg-monitor-dot",
              )}
            />
          </span>
        }
      />
      <div className="relative -mt-4 px-4 pb-4">
        {!data ? (
          <>
            <Skeleton className="mb-3 h-36" />
            <Skeleton className="h-20" />
          </>
        ) : (
          <>
            {data.discharged && (
              <AppCard title="Your care has finished">
                <p className="text-small text-ink-700">
                  {data.discharged.reason}. Thank you for choosing Medisense. Your visits and notes
                  stay here.
                </p>
              </AppCard>
            )}
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
                <AppCard>
                  <p className="flex items-center gap-2 text-small text-ink-700">
                    <CalendarClock className="size-4 text-accent" aria-hidden="true" />
                    No visits booked right now.
                  </p>
                </AppCard>
              )
            )}

            {data.toRate.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => onRate(v)}
                className="mb-3 flex w-full cursor-pointer items-center gap-3 rounded-card border border-monitor-bg bg-monitor-bg p-3.5 text-left active:scale-99"
              >
                <span className="flex size-10 flex-none items-center justify-center rounded-full bg-surface text-monitor">
                  <Star className="size-5 fill-monitor-dot text-monitor-dot" aria-hidden="true" />
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
                <h3 className="mt-4 mb-2 px-1 text-caption font-semibold tracking-wide text-ink-500 uppercase">
                  Your care team
                </h3>
                <ul className="mb-3 overflow-hidden rounded-card bg-surface shadow-hairline">
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

            {waiting.map((n) => (
              <Matching
                key={n.id}
                discipline={n.support}
                status={n.status}
                therapist={n.therapistName}
              />
            ))}

            {data.upcoming.length > 1 && (
              <button
                type="button"
                onClick={onOpenVisits}
                className="flex w-full cursor-pointer items-center justify-between rounded-card bg-surface px-4 py-3 text-small font-semibold shadow-hairline"
              >
                {data.upcoming.length - 1} more visits booked
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
