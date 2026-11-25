"use client";

import {
  CalendarCheck,
  CalendarClock,
  CalendarOff,
  CalendarX,
  ChevronRight,
  Clock,
  GraduationCap,
  History,
  Languages,
  Mail,
  MapPin,
  MessageSquareQuote,
  Phone,
  Star,
  Stethoscope,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/modal";
import { Avatar } from "@/components/ui/premium";
import { Segmented } from "@/components/ui/segmented";
import { Tag } from "@/components/ui/tag";
import { relativeTime, shortDate } from "@/lib/live/time";
import type { TherapistDetailDto } from "@/lib/live/types";
import { cn } from "@/lib/cn";
import { CaseloadTag, Stars } from "./bits";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const clock = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h >= 12 ? "pm" : "am"}`;
};
const day = (iso: string) => shortDate(`${iso}T00:00:00+10:00`);
/** The working-day ruler runs 7 am to 7 pm. */
const RULER = { start: 7 * 60, end: 19 * 60 };

function Card({
  title,
  icon: Icon,
  aside,
  children,
  className,
}: {
  title: string;
  icon: LucideIcon;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-card border border-border bg-surface shadow-lift",
        className,
      )}
    >
      <header className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
        <span className="flex size-8 items-center justify-center rounded-control bg-accent-tint text-accent">
          <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <h3 className="text-section font-semibold text-ink-900">{title}</h3>
        {aside && <div className="ml-auto">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="group flex min-w-0 gap-3 rounded-control px-3 py-2.5 transition-colors duration-(--duration-fast) hover:bg-canvas">
      <span className="mt-0.5 flex size-8 flex-none items-center justify-center rounded-control bg-sunken text-ink-500 transition-colors group-hover:bg-accent-tint group-hover:text-accent">
        <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">{label}</p>
        <div className="mt-0.5 text-small font-medium break-words text-ink-900">{children}</div>
      </div>
    </div>
  );
}

/**
 * Everything about a therapist in one place: who they are, when they work, their patients, what
 * patients said and what they've done. Admins see it for anyone; therapists see their own.
 */
export function TherapistRecord({
  t,
  patientLinks,
}: {
  t: TherapistDetailDto;
  /** Admins can open each patient's record; therapists see names only. */
  patientLinks: boolean;
}) {
  const load = Math.min(100, Math.round((t.activeClients / Math.max(1, t.capacity)) * 100));
  const attended = t.stats.completed;
  const missed = t.stats.lateCancellations + t.stats.noShows;
  const missRate = attended + missed ? Math.round((missed / (attended + missed)) * 100) : 0;
  const weekMinutes = t.weekly.reduce((n, w) => n + (w.end - w.start), 0);
  const counts = [5, 4, 3, 2, 1].map((n) => ({
    n,
    c: t.feedback.filter((f) => Math.round(f.rating) === n).length,
  }));
  const most = Math.max(1, ...counts.map((x) => x.c));

  const tiles: {
    label: string;
    icon: LucideIcon;
    value: ReactNode;
    sub: ReactNode;
    tone?: "over";
  }[] = [
    {
      label: "Caseload",
      icon: Users,
      value: `${t.activeClients} of ${t.capacity}`,
      sub: (
        <span className="mt-1.5 flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
            <span
              className={cn(
                "block h-full rounded-full",
                t.status === "At Risk"
                  ? "bg-over-dot"
                  : t.status === "Watch"
                    ? "bg-watch-dot"
                    : "bg-healthy-dot",
              )}
              style={{ width: `${load}%` }}
            />
          </span>
          <CaseloadTag status={t.status} />
        </span>
      ),
    },
    {
      label: "Upcoming visits",
      icon: CalendarClock,
      value: String(t.stats.upcoming),
      sub: "Booked from today",
    },
    {
      label: "Visits completed",
      icon: CalendarCheck,
      value: String(attended),
      sub: "Attended and checked out",
    },
    {
      label: "Missed or late",
      icon: CalendarX,
      value: String(missed),
      sub: `${missRate}% of visits · ${t.stats.noShows} did not attend`,
      tone: missed ? "over" : undefined,
    },
    {
      label: "Patient rating",
      icon: Star,
      value: t.rating ? t.rating.average.toFixed(1) : "No ratings",
      sub: t.rating ? <Stars value={t.rating.average} /> : "Patients rate after a visit",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-label="Performance"
        className="grid gap-px overflow-hidden rounded-card border border-border bg-border shadow-lift sm:grid-cols-2 xl:grid-cols-5"
      >
        {tiles.map((k) => (
          <div
            key={k.label}
            className="group bg-surface px-5 py-4 transition-colors duration-(--duration-fast) hover:bg-canvas"
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-control transition-transform duration-(--duration-fast) group-hover:scale-105",
                  k.tone === "over" ? "bg-over-bg text-over" : "bg-accent-tint text-accent",
                )}
              >
                <k.icon className="size-3.5" strokeWidth={2} aria-hidden="true" />
              </span>
              <p className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
                {k.label}
              </p>
            </div>
            <p className="mt-2 type-display text-h2 leading-8 text-ink-900">{k.value}</p>
            <div className="text-caption text-ink-500">{k.sub}</div>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="flex flex-col gap-6 xl:col-span-7">
          <Card title="About" icon={Stethoscope}>
            <div className="grid gap-1 p-2 sm:grid-cols-2">
              <Fact icon={Stethoscope} label="Discipline">
                {t.discipline}
              </Fact>
              <Fact icon={GraduationCap} label="Seniority">
                {t.seniority}
              </Fact>
              <Fact icon={Clock} label="Session length">
                {t.sessionMinutes} minutes
              </Fact>
              <Fact icon={MapPin} label="Region">
                {t.region}
              </Fact>
              <Fact icon={Mail} label="Email">
                <a href={`mailto:${t.email}`} className="text-ink-900 hover:text-accent">
                  {t.email}
                </a>
              </Fact>
              <Fact icon={Phone} label="Phone">
                {t.phone ?? <span className="text-ink-500 italic">Not given</span>}
              </Fact>
              <Fact icon={Languages} label="Languages">
                {t.profile.languages.join(", ") || "English"}
              </Fact>
              {t.profile.qualifications && (
                <Fact icon={GraduationCap} label="Qualifications">
                  {t.profile.qualifications}
                </Fact>
              )}
            </div>
            <div className="border-t border-border px-5 py-4">
              <p className="mb-1.5 text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
                Patient-facing bio
              </p>
              {t.profile.bio ? (
                <p className="border-l-2 border-accent-fill pl-3 text-small whitespace-pre-line text-ink-700">
                  {t.profile.bio}
                </p>
              ) : (
                <p className="text-small text-ink-500 italic">
                  No bio yet. Patients see this when they meet their clinician.
                </p>
              )}
            </div>
          </Card>

          <Card
            title="What patients say"
            icon={MessageSquareQuote}
            aside={
              t.rating && (
                <span className="text-caption text-ink-500">{t.rating.count} ratings</span>
              )
            }
          >
            {t.feedback.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-accent-tint text-accent ring-8 ring-accent-tint/40">
                  <Star className="size-5" aria-hidden="true" />
                </span>
                <p className="text-body font-semibold text-ink-900">No feedback yet</p>
                <p className="mt-1 max-w-72 text-small text-ink-500">
                  Patients rate each visit after it&apos;s completed. Ratings appear here.
                </p>
              </div>
            ) : (
              <>
                <div className="grid gap-6 border-b border-border p-5 sm:grid-cols-[140px_1fr]">
                  <div className="text-center sm:text-left">
                    <p className="type-display text-[44px] leading-none text-ink-900">
                      {t.rating?.average.toFixed(1)}
                    </p>
                    <div className="mt-2">
                      <Stars value={t.rating?.average ?? 0} />
                    </div>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {counts.map((x) => (
                      <li key={x.n} className="flex items-center gap-2 text-caption text-ink-700">
                        <span className="w-3">{x.n}</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-sunken">
                          <span
                            className="block h-full rounded-full bg-accent-fill transition-[width] duration-500"
                            style={{ width: `${(x.c / most) * 100}%` }}
                          />
                        </span>
                        <span className="w-5 text-right">{x.c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <ul className="divide-y divide-border">
                  {t.feedback.slice(0, FEEDBACK_SHOWN).map((f) => (
                    <FeedbackRow key={`${f.visit}-${f.at}`} f={f} />
                  ))}
                </ul>
                {t.feedback.length > FEEDBACK_SHOWN && <AllFeedback feedback={t.feedback} />}
              </>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6 xl:col-span-5">
          <Card
            title="Working pattern"
            icon={CalendarClock}
            aside={
              <span className="text-caption text-ink-500">
                {Math.round(weekMinutes / 60)} h a week
              </span>
            }
          >
            <ul className="flex flex-col gap-2 p-5">
              {DAYS.map((name, i) => {
                const hours = t.weekly.find((w) => w.weekday === i + 1);
                const span = RULER.end - RULER.start;
                return (
                  <li key={name} className="grid grid-cols-[40px_1fr_96px] items-center gap-3">
                    <span
                      className={cn(
                        "text-small font-semibold",
                        hours ? "text-ink-900" : "text-ink-500",
                      )}
                    >
                      {name}
                    </span>
                    <span className="relative h-2.5 rounded-full bg-sunken">
                      {hours && (
                        <span
                          className="absolute inset-y-0 rounded-full bg-accent-fill"
                          style={{
                            left: `${((hours.start - RULER.start) / span) * 100}%`,
                            width: `${((hours.end - hours.start) / span) * 100}%`,
                          }}
                        />
                      )}
                    </span>
                    <span className="text-right text-caption text-ink-700">
                      {hours ? `${clock(hours.start)}–${clock(hours.end)}` : "Off"}
                    </span>
                  </li>
                );
              })}
              <li className="grid grid-cols-[40px_1fr_96px] gap-3 text-label text-ink-500">
                <span />
                <span className="flex justify-between">
                  <span>7 am</span>
                  <span>1 pm</span>
                  <span>7 pm</span>
                </span>
                <span />
              </li>
            </ul>
            <div className="border-t border-border px-5 py-3">
              {t.availability.away.length === 0 ? (
                <p className="text-caption text-ink-500">No time off in the next four weeks.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {t.availability.away.map((a) => (
                    <li
                      key={`${a.from}-${a.to}`}
                      className="inline-flex items-center gap-1.5 rounded-tag bg-watch-bg px-2.5 py-1 text-caption font-semibold text-watch"
                    >
                      <CalendarOff className="size-3.5" aria-hidden="true" />
                      {day(a.from)}
                      {a.to !== a.from && ` – ${day(a.to)}`} · {a.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card
            title="Patients"
            icon={Users}
            aside={<span className="text-caption text-ink-500">{t.patients.length}</span>}
          >
            {t.patients.length === 0 ? (
              <p className="px-5 py-6 text-center text-small text-ink-500">
                No patients accepted through onboarding yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {t.patients.map((p) => {
                  const body = (
                    <>
                      <Avatar name={p.name} size={36} kind="patient" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-small font-semibold text-ink-900">
                          {p.name}
                        </span>
                        <span className="block text-caption text-ink-500">
                          {p.discipline} · since {shortDate(p.since)}
                        </span>
                      </span>
                      {p.discharged ? (
                        <Tag tone="neutral">Discharged</Tag>
                      ) : (
                        <Tag tone="healthy">Active</Tag>
                      )}
                      {patientLinks && (
                        <ChevronRight
                          className="size-4 text-ink-500 transition-transform group-hover:translate-x-0.5"
                          aria-hidden="true"
                        />
                      )}
                    </>
                  );
                  return (
                    <li key={`${p.id}-${p.discipline}`}>
                      {patientLinks ? (
                        <Link
                          href={`/care/${p.id}`}
                          className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-canvas hover:no-underline"
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3 px-5 py-3">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Recent activity" icon={History}>
            {t.history.length === 0 ? (
              <p className="px-5 py-6 text-center text-small text-ink-500">Nothing yet.</p>
            ) : (
              <div className="max-h-80 overflow-auto px-5 py-4">
                <ol className="relative ml-2 border-l border-border pl-5">
                  {t.history.map((h) => (
                    <li key={h.id} className="relative pb-3 last:pb-0">
                      <span
                        aria-hidden="true"
                        className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-surface bg-accent-fill"
                      />
                      <p className="text-small text-ink-900">{h.action}</p>
                      <p className="text-caption text-ink-500">{relativeTime(h.at)}</p>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

/** The newest few ratings show on the page; the rest open in a window, so the page keeps its shape. */
const FEEDBACK_SHOWN = 3;

type Feedback = TherapistDetailDto["feedback"][number];

function FeedbackRow({ f }: { f: Feedback }) {
  return (
    <li className="flex gap-3 px-5 py-3.5 transition-colors hover:bg-canvas">
      <Avatar name={f.patient} size={32} kind="patient" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-small font-semibold text-ink-900">{f.patient}</span>
          <Stars value={f.rating} />
        </div>
        {f.comment && <p className="mt-0.5 text-small text-ink-700">“{f.comment}”</p>}
        <p className="text-caption text-ink-500">Visit on {shortDate(f.visit)}</p>
      </div>
    </li>
  );
}

type StarFilter = "all" | "5" | "4" | "low";

function AllFeedback({ feedback }: { feedback: Feedback[] }) {
  const [open, setOpen] = useState(false);
  const [stars, setStars] = useState<StarFilter>("all");
  const shown = feedback.filter((f) =>
    stars === "all" ? true : stars === "low" ? f.rating <= 3 : f.rating === Number(stars),
  );
  const count = (k: StarFilter) =>
    feedback.filter((f) => (k === "low" ? f.rating <= 3 : f.rating === Number(k))).length;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full cursor-pointer items-center justify-between border-t border-border px-5 py-3 text-small font-semibold text-accent hover:bg-canvas"
      >
        View all {feedback.length} ratings
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
      {open && (
        <Modal
          title="What patients say"
          description={`${feedback.length} ratings, newest first.`}
          onClose={() => setOpen(false)}
          toolbar={
            <Segmented<StarFilter>
              label="Rating"
              value={stars}
              onChange={setStars}
              options={[
                { id: "all", label: `All (${feedback.length})` },
                { id: "5", label: `5 stars (${count("5")})` },
                { id: "4", label: `4 stars (${count("4")})` },
                { id: "low", label: `3 or less (${count("low")})` },
              ]}
            />
          }
        >
          {shown.length === 0 ? (
            <p className="px-6 py-12 text-center text-small text-ink-500">No ratings here.</p>
          ) : (
            <ul className="divide-y divide-border">
              {shown.map((f) => (
                <FeedbackRow key={`${f.visit}-${f.at}`} f={f} />
              ))}
            </ul>
          )}
        </Modal>
      )}
    </>
  );
}
