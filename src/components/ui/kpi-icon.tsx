import {
  Activity,
  AlarmClock,
  Bell,
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  Car,
  CircleCheck,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Diamond,
  FileText,
  Hourglass,
  Inbox,
  ListChecks,
  LogIn,
  type LucideIcon,
  MessageSquare,
  Mic,
  PenLine,
  Percent,
  Send,
  ShieldAlert,
  Stethoscope,
  Target,
  TrendingUp,
  TriangleAlert,
  UserPlus,
  UserRound,
  UsersRound,
  Video,
  Wallet,
  XCircle,
} from "lucide-react";
import { createElement, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The icon for a figure, picked from the words in its label so every KPI band gets one without
 * each page choosing. The first rule that matches wins, so the specific ones come first.
 */
const rules: [RegExp, LucideIcon][] = [
  [/\bai\b/i, Diamond],
  [/overdue|late|expired|failed|blocked|warning|exception|risk|precaution/i, TriangleAlert],
  // "Not submitted" and "Not approved" are waiting, not done.
  [/\bnot (submitted|started|approved|signed)|still to/i, Hourglass],
  [/alert|reminder/i, Bell],
  [/restricted|unverified|security|credential/i, ShieldAlert],
  [/cancel|did not attend|missed|withdrawn|declined|not completed|deactivated/i, XCircle],
  [/sign(ed|ature)?\b|co-sign|to sign/i, PenLine],
  [
    /approve|approval|accepted|verified|achieved|completed|delivered|attended|claim|paid|ready/i,
    CircleCheck,
  ],
  [/submitted|sent/i, Send],
  [/review|triage|decide|supervis/i, ClipboardCheck],
  [/wait|pending|awaiting|queue|oldest|not submitted|not started|still to/i, Hourglass],
  [/note|draft|documentation|document|report/i, FileText],
  [/video|telehealth/i, Video],
  [/recording|audio/i, Mic],
  [/travel/i, Car],
  [/leave|away|time off/i, CalendarOff],
  [/overtime|hour|time|minutes/i, Clock],
  [/due/i, AlarmClock],
  [
    /revenue|money|pay|cost|margin|funding|invoice|superannuation|balance|price|owed|collected|outstanding|unbilled|budget|\$/i,
    Wallet,
  ],
  [/rate|utilisation|%/i, Percent],
  [/goal|plan/i, Target],
  [/improv|trend|growth/i, TrendingUp],
  [/assessment/i, ClipboardList],
  [/visit|session|appointment|booked|book/i, CalendarCheck],
  [/today|week|day|month|upcoming|calendar|schedule/i, CalendarDays],
  [/task|follow-up|to do/i, ListChecks],
  [/referral|new patient|intake|added/i, UserPlus],
  [/message|chat/i, MessageSquare],
  [/login|sign in|signed in/i, LogIn],
  [/therapist|clinician|clinical|staff|team|people|admin/i, Stethoscope],
  [/patient|participant|episode|client|caseload/i, UsersRound],
  [/request|open/i, Inbox],
  [/person|user|account/i, UserRound],
];

export function kpiIconFor(label: string): LucideIcon {
  return rules.find(([pattern]) => pattern.test(label))?.[1] ?? Activity;
}

const tile = {
  over: "bg-over-bg text-over",
  watch: "bg-watch-bg text-watch",
  plain: "bg-accent-tint text-accent",
};

/** A KPI label with its icon: the same small tile everywhere, tinted when the figure needs action. */
export function KpiLabel({
  label,
  icon,
  tone,
  className,
  children,
}: {
  /** Used to pick the icon when the label isn't plain text. */
  label: string;
  icon?: LucideIcon;
  tone?: "over" | "watch" | "monitor";
  className?: string;
  /** What to show as the label, when it isn't just the text. */
  children?: ReactNode;
}) {
  const look = tone === "over" ? tile.over : tone ? tile.watch : tile.plain;
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <span
        aria-hidden="true"
        className={cn("flex size-7 flex-none items-center justify-center rounded-control", look)}
      >
        {createElement(icon ?? kpiIconFor(label), { className: "size-3.5", strokeWidth: 2 })}
      </span>
      <span className="min-w-0 text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
        {children ?? label}
      </span>
    </span>
  );
}
