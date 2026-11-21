"use client";

import { CheckinButton, PatientCareAi } from "./enhance-patient";
import {
  BadgeCheck,
  CalendarCheck,
  CalendarPlus,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  CreditCard,
  Eye,
  FileText,
  FileUp,
  HeartHandshake,
  IdCard,
  ListChecks,
  LockKeyhole,
  MessageCircleQuestion,
  Pencil,
  Receipt,
  Send,
  ShieldCheck,
  Target,
  UsersRound,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/premium";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  AppCard,
  AppEmpty,
  AppHeader,
  AppSection,
  AppSheet,
  IconBadge,
  type BadgeTone,
  AppWebView,
} from "@/features/mobile/phone-frame";
import { api, ApiError, useResource } from "@/lib/live/client";
import { money } from "@/lib/live/clinical";
import {
  accessibilityOptions,
  activityStatuses,
  bookingModes,
  contactChannels,
  contactTimes,
  docCategories,
  MAX_UPLOAD,
  pronounOptions,
  uploadTypes,
  type PortalAppointment,
  type PortalDto,
  type PortalPlan,
} from "@/lib/live/portal";
import { shortDate, slotLabel, timeOfDay } from "@/lib/live/time";
import { Skeleton } from "./bits";

/* ------------------------------------------------------------------ shared */

/** "16 April 1952": a date of birth needs its year, never a weekday. */
const fullDate = (iso: string) =>
  new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
/** ISO dates typed by the patient read back in Australian order. */
const auDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? fullDate(v) : v);

export function usePortal(enabled = true) {
  return useResource<PortalDto>(enabled ? "/api/patient/portal" : null, (e) => e.type === "care");
}

type Portal = ReturnType<typeof usePortal>;

async function send(portal: Portal, body: Record<string, unknown>, done?: string) {
  try {
    const r = await api<{ message: string }>("/api/patient/portal", { body });
    toast(done ?? r.message);
    portal.reload();
    return true;
  } catch (e) {
    toast(e instanceof ApiError ? e.message : "That didn't go through. Try again.", {
      tone: "error",
    });
    return false;
  }
}

const field =
  "w-full rounded-control border border-border-strong bg-surface px-3 py-2.5 text-small text-ink-900 placeholder:text-ink-500 focus-visible:outline-2 focus-visible:outline-accent";

function Label({ text, children, hint }: { text: string; children: ReactNode; hint?: string }) {
  return (
    <label className="mb-3 flex flex-col gap-1.5">
      <span className="text-caption font-semibold text-ink-700">{text}</span>
      {children}
      {hint && <span className="text-caption text-ink-500">{hint}</span>}
    </label>
  );
}

/** One answer from a short list: large tap targets, never a native select. */
function Pills<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T | "";
  onChange: (v: T) => void;
}) {
  return (
    <div className="mb-3">
      <p className="mb-1.5 text-caption font-semibold text-ink-700">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={value === o}
            onClick={() => onChange(o)}
            className={cn(
              "min-h-9 cursor-pointer rounded-full border px-3 text-caption font-semibold transition-colors active:scale-97",
              value === o
                ? "border-accent-fill bg-accent-tint text-accent"
                : "border-border-strong bg-surface text-ink-700",
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Sections inside a tab: scrolls sideways on a phone. */
function Segments<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="tablist" className="no-scrollbar -mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4">
      {items.map((i) => (
        <button
          key={i.id}
          type="button"
          role="tab"
          aria-selected={value === i.id}
          onClick={() => onChange(i.id)}
          className={cn(
            "flex h-9 flex-none cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-caption font-semibold transition-colors",
            value === i.id ? "bg-ink-900 text-page" : "bg-surface text-ink-700 ring-1 ring-border",
          )}
        >
          {i.label}
          {i.count ? (
            <span
              className={cn(
                "rounded-full px-1.5 text-label",
                value === i.id ? "bg-page/20" : "bg-accent-tint text-accent",
              )}
            >
              {i.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function Tag({
  tone,
  children,
}: {
  tone: "healthy" | "watch" | "over" | "available" | "plain";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex flex-none items-center gap-1 rounded-tag px-2 py-0.5 text-label font-semibold",
        tone === "healthy" && "bg-healthy-bg text-healthy",
        tone === "watch" && "bg-watch-bg text-watch",
        tone === "over" && "bg-over-bg text-over",
        tone === "available" && "bg-available-bg text-available",
        tone === "plain" && "border border-border-strong text-ink-700",
      )}
    >
      {tone !== "plain" && (
        <i
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-full",
            tone === "healthy" && "bg-healthy-dot",
            tone === "watch" && "bg-watch-dot",
            tone === "over" && "bg-over-dot",
            tone === "available" && "bg-available-dot",
          )}
        />
      )}
      {children}
    </span>
  );
}

function toneFor(status: string): "healthy" | "watch" | "over" | "available" | "plain" {
  if (
    /approved|accepted|paid|active|confirmed|completed|verified|submitted|received|acknowledged|current/i.test(
      status,
    )
  )
    return "healthy";
  if (
    /pending|need|review|requested|processing|draft|due|waiting|partial|being|under/i.test(status)
  )
    return "watch";
  if (/reject|declined|not accepted|cancel|expired|revoked|unable|overdue/i.test(status))
    return "over";
  if (/upcoming|progress|telehealth/i.test(status)) return "available";
  return "plain";
}

function Row({
  icon: Icon,
  title,
  meta,
  aside,
  onClick,
  tone = "blue",
}: {
  tone?: BadgeTone;
  icon: LucideIcon;
  title: ReactNode;
  meta?: ReactNode;
  aside?: ReactNode;
  onClick?: () => void;
}) {
  const body = (
    <>
      <IconBadge icon={Icon} tone={tone} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block text-small font-semibold text-ink-900">{title}</span>
        {meta && <span className="mt-0.5 block text-caption text-ink-500">{meta}</span>}
      </span>
      {aside}
      {onClick && <ChevronRight className="size-4 flex-none text-ink-500" aria-hidden="true" />}
    </>
  );
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-3 py-3 text-left first:pt-0 last:pb-0 active:opacity-70"
    >
      {body}
    </button>
  ) : (
    <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">{body}</div>
  );
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-border">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
          <dt className="text-caption text-ink-500">{k}</dt>
          <dd className="text-right text-small font-medium text-ink-900">{v || "Not recorded"}</dd>
        </div>
      ))}
    </dl>
  );
}

function Loading() {
  return (
    <div className="flex flex-col gap-3 px-4">
      <Skeleton className="h-28" />
      <Skeleton className="h-40" />
      <Skeleton className="h-28" />
    </div>
  );
}

/* ------------------------------------------------------------------ home (Module 18) */

const actionTone: Record<string, BadgeTone> = {
  Referral: "amber",
  Plan: "teal",
  Visit: "blue",
  Invoice: "orange",
  "Check-in": "violet",
};

const actionIcon: Record<string, LucideIcon> = {
  Referral: ClipboardList,
  Plan: Target,
  Visit: CalendarCheck,
  Invoice: Receipt,
  "Check-in": ListChecks,
};

/** The dashboard's "needs your attention" list and three at-a-glance tiles. */
export function PortalHomeCards({ onTab }: { onTab: (tab: string) => void }) {
  const portal = usePortal();
  const d = portal.data;
  if (!d) return <Skeleton className="mb-3 h-32" />;
  const upcoming = d.appointments.filter((a) => a.status === "Upcoming").length;
  const unread = d.documents.filter((x) => x.unread).length;
  const due = d.invoices.reduce((s, i) => s + (i.status === "Payment processing" ? 0 : i.due), 0);
  const tiles: { label: string; value: string; tab: string }[] = [
    { label: "Visits", value: String(upcoming), tab: "visits" },
    { label: "New files", value: String(unread), tab: "me" },
    { label: "To pay", value: money(due), tab: "me" },
  ];
  return (
    <>
      <dl className="mb-4 grid grid-cols-3 divide-x divide-border overflow-hidden rounded-card border border-border bg-surface">
        {tiles.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => onTab(t.tab)}
            className="flex cursor-pointer flex-col items-center gap-0.5 px-2 py-3.5 hover:bg-sunken active:scale-98"
          >
            <dd className="type-display text-[24px] leading-8 text-ink-900">{t.value}</dd>
            <dt className="text-label font-medium tracking-wide text-ink-500 uppercase">
              {t.label}
            </dt>
          </button>
        ))}
      </dl>
      <section
        aria-label="Needs your attention"
        className="mb-4 overflow-hidden rounded-card border border-border bg-surface"
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div>
            <p className="type-display text-h2 leading-tight text-ink-900">For you today</p>
            <p className="text-caption text-ink-500">Needs your attention</p>
          </div>
          {d.actions.length ? (
            <span className="flex size-9 items-center justify-center rounded-full bg-ink-900 text-small font-semibold text-page">
              {d.actions.length}
            </span>
          ) : (
            <Tag tone="healthy">All done</Tag>
          )}
        </div>
        {d.actions.length === 0 ? (
          <p className="px-4 pb-4 text-small text-ink-700">
            Nothing needs you right now. We&apos;ll let you know when something does.
          </p>
        ) : (
          <ul className="px-2 pb-2">
            {d.actions.map((a) => {
              const Icon = actionIcon[a.kind] ?? CircleCheck;
              return (
                <li key={a.title + a.detail}>
                  <button
                    type="button"
                    onClick={() => onTab(a.tab)}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-control px-2 py-2.5 text-left hover:bg-sunken"
                  >
                    <IconBadge icon={Icon} tone={actionTone[a.kind] ?? "blue"} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-small font-semibold text-ink-900">{a.title}</span>
                      <span className="block truncate text-caption text-ink-500">{a.detail}</span>
                    </span>
                    <ChevronRight className="size-4 flex-none text-ink-400" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ visits (Module 20) */

export function PortalVisits() {
  const portal = usePortal();
  const [view, setView] = useState<"Upcoming" | "Completed" | "Cancelled" | "Requests">("Upcoming");
  const [open, setOpen] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const d = portal.data;
  const list = d?.appointments.filter((a) => a.status === view) ?? [];
  const ordered = view === "Upcoming" ? list : [...list].reverse();
  const visit = d?.appointments.find((a) => a.id === open) ?? null;
  return (
    <>
      <AppHeader
        eyebrow="Visits"
        title="Your appointments"
        aside={
          <Button size="sm" variant="primary" onClick={() => setBooking(true)}>
            <CalendarPlus className="size-4" aria-hidden="true" /> Request
          </Button>
        }
      />
      <div className="px-4 pb-4">
        {!d ? (
          <Loading />
        ) : (
          <>
            <Segments
              value={view}
              onChange={setView}
              items={[
                {
                  id: "Upcoming",
                  label: "Upcoming",
                  count: d.appointments.filter((a) => a.status === "Upcoming").length,
                },
                {
                  id: "Completed",
                  label: "Completed",
                  count: d.appointments.filter((a) => a.status === "Completed").length,
                },
                {
                  id: "Cancelled",
                  label: "Cancelled",
                  count: d.appointments.filter((a) => a.status === "Cancelled").length,
                },
                { id: "Requests", label: "My requests", count: d.bookingRequests.length },
              ]}
            />
            {view === "Requests" ? (
              d.bookingRequests.length === 0 ? (
                <AppEmpty
                  icon={CalendarPlus}
                  title="No visit requests"
                  action={
                    <Button size="sm" onClick={() => setBooking(true)}>
                      Request a visit
                    </Button>
                  }
                >
                  Ask for a visit and Scheduling will offer you a time.
                </AppEmpty>
              ) : (
                <AppCard>
                  <div className="divide-y divide-border">
                    {d.bookingRequests.map((b) => (
                      <Row
                        key={b.id}
                        icon={CalendarPlus}
                        title={`${b.service} · ${b.mode}`}
                        meta={`${b.window} · sent ${shortDate(b.at)}`}
                        aside={<Tag tone="watch">{b.status}</Tag>}
                      />
                    ))}
                  </div>
                  <p className="mt-3 border-t border-border pt-3 text-caption text-ink-500">
                    A request isn&apos;t a booking. Scheduling confirms the time with you.
                  </p>
                </AppCard>
              )
            ) : ordered.length === 0 ? (
              <AppEmpty icon={CalendarCheck} title={`No ${view.toLowerCase()} visits`}>
                {view === "Upcoming"
                  ? "When a visit is booked it appears here."
                  : "Nothing to show yet."}
              </AppEmpty>
            ) : (
              ordered.map((a) => <VisitCard key={a.id} a={a} onOpen={() => setOpen(a.id)} />)
            )}
          </>
        )}
      </div>
      {visit && <VisitSheet portal={portal} a={visit} onClose={() => setOpen(null)} />}
      {booking && d && <BookingSheet portal={portal} d={d} onClose={() => setBooking(false)} />}
    </>
  );
}

function VisitCard({ a, onOpen }: { a: PortalAppointment; onOpen: () => void }) {
  const day = new Date(a.start);
  const fmt = (o: Intl.DateTimeFormatOptions) =>
    day.toLocaleDateString("en-AU", { ...o, timeZone: "Australia/Brisbane" });
  const upcoming = a.status === "Upcoming";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mb-3 flex w-full cursor-pointer flex-col overflow-hidden rounded-card border border-border bg-surface text-left active:scale-99"
    >
      <span className="flex items-stretch gap-3 p-3">
        <span
          className={cn(
            "flex w-16 flex-none flex-col items-center justify-center rounded-control py-2",
            upcoming ? "bg-ink-900 text-page" : "bg-sunken text-ink-900",
          )}
        >
          <span className="text-label font-semibold tracking-wide uppercase opacity-70">
            {fmt({ weekday: "short" })}
          </span>
          <span className="type-display text-[28px] leading-none">{fmt({ day: "numeric" })}</span>
          <span className="text-label font-semibold tracking-wide uppercase opacity-70">
            {fmt({ month: "short" })}
          </span>
        </span>
        <span className="min-w-0 flex-1 py-0.5">
          <span className="flex items-start justify-between gap-2">
            <span className="text-body font-semibold text-ink-900">{a.service}</span>
            <Tag tone={upcoming ? (a.confirmed ? "healthy" : "available") : toneFor(a.status)}>
              {upcoming ? (a.confirmed ? "Confirmed" : "Booked") : a.status}
            </Tag>
          </span>
          <span className="mt-0.5 block text-small text-ink-700">
            {timeOfDay(a.start)} to {timeOfDay(a.end)}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Tag tone="plain">
              {a.mode === "Telehealth" && <Video className="size-3" aria-hidden="true" />}
              {a.mode}
            </Tag>
            {a.changeRequest?.status === "Pending" && (
              <Tag tone="watch">{a.changeRequest.type} requested</Tag>
            )}
          </span>
        </span>
      </span>
      <span className="flex items-center gap-2.5 border-t border-border bg-sunken/60 px-3 py-2">
        <Avatar name={a.clinician} size={26} kind="staff" />
        <span className="flex-1 truncate text-caption font-medium text-ink-700">{a.clinician}</span>
        <ChevronRight className="size-4 text-ink-400" aria-hidden="true" />
      </span>
    </button>
  );
}

function VisitSheet({
  portal,
  a,
  onClose,
}: {
  portal: Portal;
  a: PortalAppointment;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"view" | "Change" | "Cancel">("view");
  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);
  const [ticked, setTicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [room, setRoom] = useState<string | null>(null);
  const openRoom = async () => {
    setBusy(true);
    try {
      const { link } = await api<{ link: string }>(`/api/visits/${a.id}/join-link`, {
        method: "POST",
      });
      setRoom(link);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "The video visit isn't open yet.", {
        tone: "error",
      });
    }
    setBusy(false);
  };
  const upcoming = a.status === "Upcoming";
  const pending = a.changeRequest?.status === "Pending";
  if (room)
    return (
      <AppWebView title={`Video visit · ${a.service}`} href={room} onClose={() => setRoom(null)} />
    );
  if (room)
    return (
      <AppWebView
        title={`Video visit · ${a.clinician}`}
        href={room}
        onClose={() => setRoom(null)}
      />
    );
  return (
    <AppSheet
      title={mode === "view" ? a.service : mode === "Cancel" ? "Ask to cancel" : "Ask to change"}
      onClose={onClose}
      footer={
        mode === "view" ? (
          upcoming ? (
            <>
              {a.telehealthJoinOpen ? (
                <Button variant="primary" className="flex-1" loading={busy} onClick={openRoom}>
                  <Video className="size-4" aria-hidden="true" /> Join
                </Button>
              ) : !a.confirmed ? (
                <Button
                  variant="primary"
                  className="flex-1"
                  loading={busy}
                  onClick={async () => {
                    setBusy(true);
                    await send(portal, { type: "confirm", appointmentId: a.id });
                    setBusy(false);
                  }}
                >
                  <CalendarCheck className="size-4" aria-hidden="true" /> I&apos;ll be there
                </Button>
              ) : null}
              <Button className="flex-1" disabled={pending} onClick={() => setMode("Change")}>
                Change
              </Button>
              <Button variant="danger" disabled={pending} onClick={() => setMode("Cancel")}>
                Cancel
              </Button>
            </>
          ) : undefined
        ) : (
          <>
            <Button className="flex-1" onClick={() => setMode("view")}>
              Back
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              loading={busy}
              disabled={reason.trim().length < 3 || (mode === "Cancel" && !ack)}
              onClick={async () => {
                setBusy(true);
                const ok = await send(portal, {
                  type: "change",
                  appointmentId: a.id,
                  kind: mode,
                  reason,
                  acknowledge: ack,
                });
                setBusy(false);
                if (ok) setMode("view");
              }}
            >
              <Send className="size-4" aria-hidden="true" /> Send request
            </Button>
          </>
        )
      }
    >
      {mode === "view" ? (
        <>
          <Facts
            rows={[
              ["When", `${slotLabel(a.start)} AEST (Brisbane)`],
              ["Clinician", a.clinician],
              ["Where", `${a.mode} · ${a.detail}`],
              [
                "Reference",
                <span key="r" className="font-mono">
                  {a.ref}
                </span>,
              ],
              [
                "Status",
                <Tag key="s" tone={a.confirmed && upcoming ? "healthy" : toneFor(a.status)}>
                  {a.confirmed && upcoming ? "Confirmed by you" : a.status}
                </Tag>,
              ],
            ]}
          />
          {pending && a.changeRequest && (
            <p className="mt-3 rounded-control bg-watch-bg px-3 py-2 text-caption text-watch">
              {a.changeRequest.type} requested {shortDate(a.changeRequest.at)}. The visit stays
              booked until Scheduling replies.
            </p>
          )}
          {upcoming && <CheckinButton appointmentId={a.id} />}
          {upcoming && (
            <>
              <AppSection title="Before your visit" />
              <ul className="flex flex-col gap-1.5">
                {a.prep.map((p) => {
                  const on = ticked.includes(p);
                  return (
                    <li key={p}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setTicked(on ? ticked.filter((x) => x !== p) : [...ticked, p])
                        }
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-2.5 rounded-control border px-3 py-2.5 text-left text-small",
                          on
                            ? "border-healthy bg-healthy-bg text-ink-900"
                            : "border-border bg-surface text-ink-700",
                        )}
                      >
                        <CircleCheck
                          className={cn("size-4 flex-none", on ? "text-healthy" : "text-ink-500")}
                          aria-hidden="true"
                        />
                        {p}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {upcoming && a.mode === "Telehealth" && (
            <Button
              size="sm"
              variant="soft"
              className="mt-2 w-full"
              loading={busy}
              onClick={openRoom}
            >
              <Video className="size-3.5" aria-hidden="true" /> Test my camera and microphone
            </Button>
          )}
          <AppSection title="What happened" />
          <ol className="relative ml-2 border-l border-border pl-4">
            {a.events.map((e, i) => (
              <li key={i} className="relative pb-3 last:pb-0">
                <i
                  aria-hidden="true"
                  className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-surface bg-accent"
                />
                <p className="text-small font-semibold text-ink-900">{e.action}</p>
                <p className="text-caption text-ink-500">
                  {shortDate(e.at)} · {e.actor}
                  {e.reason ? ` · ${e.reason}` : ""}
                </p>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <>
          <p className="mb-3 text-small text-ink-700">
            {mode === "Cancel"
              ? "Your visit stays booked until Scheduling confirms the cancellation."
              : "Tell us what would suit better. Scheduling offers a new time; nothing moves until you agree."}
          </p>
          <Label text={mode === "Cancel" ? "Why do you need to cancel?" : "What should change?"}>
            <textarea
              className={cn(field, "min-h-24")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Label>
          {mode === "Cancel" && (
            <label className="flex items-start gap-2.5 rounded-control border border-border-strong p-3 text-small">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              <span>
                I understand cancellations with less than 48 hours&apos; notice may be charged under
                my service agreement.
              </span>
            </label>
          )}
        </>
      )}
    </AppSheet>
  );
}

function BookingSheet({
  portal,
  d,
  onClose,
}: {
  portal: Portal;
  d: PortalDto;
  onClose: () => void;
}) {
  const services = [...new Set(d.careTeam.map((c) => c.service))];
  const [service, setService] = useState(services[0] ?? "");
  const [mode, setMode] = useState<(typeof bookingModes)[number]>(
    (bookingModes as readonly string[]).includes(d.profile.preferredLocation)
      ? (d.profile.preferredLocation as (typeof bookingModes)[number])
      : "Home",
  );
  const [window, setWindow] = useState("");
  const [purpose, setPurpose] = useState("");
  const [address, setAddress] = useState(d.profile.address);
  const [siteContact, setSiteContact] = useState("");
  const [otherLocation, setOther] = useState("");
  const [device, setDevice] = useState("");
  const [busy, setBusy] = useState(false);
  const site = ["School", "Daycare", "Day Program"].includes(mode);
  return (
    <AppSheet
      title="Request a visit"
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          className="flex-1"
          loading={busy}
          disabled={!service || window.trim().length < 2}
          onClick={async () => {
            setBusy(true);
            const ok = await send(portal, {
              type: "booking",
              service,
              mode,
              window,
              purpose,
              address,
              siteContact,
              otherLocation,
              device,
            });
            setBusy(false);
            if (ok) onClose();
          }}
        >
          <Send className="size-4" aria-hidden="true" /> Send request
        </Button>
      }
    >
      <Pills
        label="Service"
        options={services.length ? services : ["Therapy"]}
        value={service}
        onChange={setService}
      />
      <Pills label="Where" options={bookingModes} value={mode} onChange={setMode} />
      <Label text="When suits you?" hint="For example: weekday mornings, after 3 pm, not Fridays">
        <input className={field} value={window} onChange={(e) => setWindow(e.target.value)} />
      </Label>
      {mode !== "Telehealth" && mode !== "Other community location" && (
        <Label text="Address">
          <input className={field} value={address} onChange={(e) => setAddress(e.target.value)} />
        </Label>
      )}
      {site && (
        <Label text="Site contact" hint="Name and phone of the teacher or coordinator">
          <input
            className={field}
            value={siteContact}
            onChange={(e) => setSiteContact(e.target.value)}
          />
        </Label>
      )}
      {mode === "Other community location" && (
        <Label text="Describe the location">
          <input
            className={field}
            value={otherLocation}
            onChange={(e) => setOther(e.target.value)}
          />
        </Label>
      )}
      {mode === "Telehealth" && (
        <Label text="Which device will you use?">
          <input
            className={field}
            value={device}
            onChange={(e) => setDevice(e.target.value)}
            placeholder="Laptop, tablet or phone"
          />
        </Label>
      )}
      <Label text="What is the visit for? (optional)">
        <textarea
          className={cn(field, "min-h-20")}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
        />
      </Label>
      <p className="text-caption text-ink-500">
        This is a request. Scheduling checks therapist availability and confirms a time with you.
      </p>
    </AppSheet>
  );
}

/* ------------------------------------------------------------------ my care (Module 21) */

export function PortalCare({ progress }: { progress: ReactNode }) {
  const portal = usePortal();
  const [view, setView] = useState<"plan" | "checkin" | "progress">("plan");
  const d = portal.data;
  return (
    <>
      <AppHeader eyebrow="My care" title="Your plan" />
      <div className="px-4 pb-4">
        {d && d.plans[0] && (
          <section
            aria-label="Your care plan"
            className="mb-4 overflow-hidden rounded-card bg-ink-900 p-4 text-page"
          >
            <div className="flex items-center gap-3">
              <Avatar
                name={d.plans[0].clinician}
                size={48}
                kind="staff"
                className="ring-2 ring-page/30"
              />
              <div className="min-w-0">
                <p className="text-caption font-semibold tracking-[0.16em] uppercase opacity-70">
                  {d.plans[0].service}
                </p>
                <p className="truncate type-display text-h2 leading-tight">
                  With {d.plans[0].clinician}
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 divide-x divide-page/15 border-t border-page/15 pt-3 text-center">
              <div>
                <p className="type-display text-[24px] leading-8">{d.plans[0].goals.length}</p>
                <p className="text-label tracking-wide uppercase opacity-70">Goals</p>
              </div>
              <div>
                <p className="type-display text-[24px] leading-8">{d.plans[0].activities.length}</p>
                <p className="text-label tracking-wide uppercase opacity-70">Activities</p>
              </div>
              <div>
                <p className="type-display text-[24px] leading-8">
                  {shortDate(d.plans[0].reviewDate).split(" ").slice(1).join(" ")}
                </p>
                <p className="text-label tracking-wide uppercase opacity-70">Review</p>
              </div>
            </div>
          </section>
        )}
        <PatientCareAi />
        <Segments
          value={view}
          onChange={setView}
          items={[
            { id: "plan", label: "My plan", count: d?.plans.filter((p) => !p.acknowledged).length },
            {
              id: "checkin",
              label: "Check-in",
              count: d?.questionnaires.filter((q) => q.status !== "Submitted").length,
            },
            { id: "progress", label: "Reports and goals" },
          ]}
        />
        {view === "progress" ? (
          progress
        ) : !d ? (
          <Loading />
        ) : view === "plan" ? (
          d.plans.length === 0 ? (
            <AppEmpty icon={Target} title="No plan shared yet">
              Your therapist shares your plan here once it&apos;s agreed with you.
            </AppEmpty>
          ) : (
            d.plans.map((p) => <PlanCard key={p.id} portal={portal} p={p} />)
          )
        ) : (
          d.questionnaires.map((q) => <CheckIn key={q.id} portal={portal} q={q} />)
        )}
      </div>
    </>
  );
}

function Spark({ points, target }: { points: { value: number }[]; target: string }) {
  if (points.length < 2) return null;
  const vals = points.map((p) => p.value);
  const t = Number(target);
  const all = Number.isNaN(t) ? vals : [...vals, t];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const y = (v: number) => 34 - ((v - lo) / (hi - lo || 1)) * 30;
  const step = 240 / (vals.length - 1);
  return (
    <svg
      viewBox="0 0 240 38"
      className="mt-2 h-10 w-full"
      role="img"
      aria-label={`Trend: ${vals.join(", ")}`}
    >
      {!Number.isNaN(t) && (
        <line
          x1="0"
          x2="240"
          y1={y(t)}
          y2={y(t)}
          className="stroke-healthy"
          strokeDasharray="4 4"
          strokeWidth="1"
        />
      )}
      <polyline
        fill="none"
        className="stroke-accent"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={vals.map((v, i) => `${i * step},${y(v)}`).join(" ")}
      />
      {vals.map((v, i) => (
        <circle key={i} cx={i * step} cy={y(v)} r="2.5" className="fill-accent" />
      ))}
    </svg>
  );
}

function PlanCard({ portal, p }: { portal: Portal; p: PortalPlan }) {
  const [logging, setLogging] = useState<PortalPlan["activities"][number] | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <AppCard
        title={p.service}
        action={
          p.acknowledged ? (
            <Tag tone="healthy">Acknowledged</Tag>
          ) : (
            <Tag tone="watch">Please read</Tag>
          )
        }
      >
        <p className="-mt-1 mb-3 text-caption text-ink-500">
          With {p.clinician} · version {p.version}
          {p.reviewDate && ` · review ${shortDate(`${p.reviewDate.slice(0, 10)}T00:00:00Z`)}`}
        </p>
        {p.precautions && (
          <p className="mb-3 rounded-control border border-over bg-over-bg px-3 py-2 text-caption text-over">
            <strong>Precaution:</strong> {p.precautions}
          </p>
        )}
        <AppSection title="Your goals" />
        <ul className="flex flex-col gap-2">
          {p.goals.map((g) => (
            <li key={g.id} className="rounded-control bg-canvas p-3">
              <p className="flex gap-2 text-small font-semibold">
                <Target className="mt-0.5 size-4 flex-none text-accent" aria-hidden="true" />
                {g.title}
              </p>
              <div className="mt-2 grid grid-cols-3 items-stretch gap-2 text-center">
                {(
                  [
                    ["Started", g.baseline],
                    ["Now", g.current || g.baseline],
                    ["Aim", g.target],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="rounded-control bg-surface px-2 py-1.5">
                    <p className="text-label text-ink-500">{k}</p>
                    <p className="text-caption leading-tight font-semibold text-balance hyphens-auto text-ink-900">
                      {v ? `${v}${g.unit ? ` ${g.unit}` : ""}` : "Not recorded"}
                    </p>
                  </div>
                ))}
              </div>
              <Spark points={g.points} target={g.target} />
            </li>
          ))}
        </ul>
        {p.activities.length > 0 && (
          <>
            <AppSection title="Home activities" />
            <ul className="flex flex-col gap-2">
              {p.activities.map((a) => (
                <li key={a.id} className="rounded-control border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-small font-semibold text-ink-900">{a.name}</p>
                      <p className="text-caption text-ink-500">
                        {a.frequency} · {a.dose}
                      </p>
                    </div>
                    <Button size="sm" variant="soft" onClick={() => setLogging(a)}>
                      Log
                    </Button>
                  </div>
                  {a.instructions && (
                    <p className="mt-2 text-caption text-ink-700">{a.instructions}</p>
                  )}
                  {a.logs[0] && (
                    <div className="mt-2 flex flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Tag tone="plain">Self-reported</Tag>
                        <Tag tone={toneFor(a.logs[0].status)}>{a.logs[0].status}</Tag>
                      </span>
                      <span className="text-caption text-ink-500">
                        {shortDate(a.logs[0].at)} · {a.logs[0].review}
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="mt-4 flex gap-2 border-t border-border pt-3">
          {!p.acknowledged && (
            <Button
              variant="primary"
              className="flex-1"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                await send(portal, { type: "acknowledge", planId: p.id, version: p.version });
                setBusy(false);
              }}
            >
              <BadgeCheck className="size-4" aria-hidden="true" /> I&apos;ve read my plan
            </Button>
          )}
          <Button className="flex-1" onClick={() => setAsking(true)}>
            <MessageCircleQuestion className="size-4" aria-hidden="true" /> Ask a question
          </Button>
        </div>
        {p.acknowledged && (
          <p className="mt-2 text-caption text-ink-500">
            You acknowledged version {p.version} on {shortDate(p.acknowledged)}.
          </p>
        )}
      </AppCard>
      {logging && (
        <ActivitySheet portal={portal} planId={p.id} a={logging} onClose={() => setLogging(null)} />
      )}
      {asking && <ClarifySheet portal={portal} p={p} onClose={() => setAsking(false)} />}
    </>
  );
}

function ActivitySheet({
  portal,
  planId,
  a,
  onClose,
}: {
  portal: Portal;
  planId: string;
  a: PortalPlan["activities"][number];
  onClose: () => void;
}) {
  const [status, setStatus] = useState<(typeof activityStatuses)[number] | "">("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <AppSheet
      title={`Log: ${a.name}`}
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          className="flex-1"
          loading={busy}
          disabled={!status || (status === "Unable" && reason.trim().length < 3)}
          onClick={async () => {
            setBusy(true);
            const ok = await send(portal, {
              type: "activity",
              planId,
              activityId: a.id,
              status,
              reason,
            });
            setBusy(false);
            if (ok) onClose();
          }}
        >
          Save log
        </Button>
      }
    >
      <Pills
        label="How did it go today?"
        options={activityStatuses}
        value={status}
        onChange={setStatus}
      />
      <Label
        text={status === "Unable" ? "What stopped you? (required)" : "Anything to add? (optional)"}
      >
        <textarea
          className={cn(field, "min-h-20")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Label>
      <p className="text-caption text-ink-500">
        Your therapist reviews your logs. If you feel unwell or are hurt, stop and call us.
      </p>
      {a.logs.length > 0 && (
        <>
          <AppSection title="Recent logs" />
          <ul className="divide-y divide-border">
            {a.logs.slice(0, 5).map((l, i) => (
              <li key={i} className="flex items-center justify-between gap-2 py-2 text-caption">
                <span className="text-ink-700">{shortDate(l.at)}</span>
                <Tag tone={toneFor(l.status)}>{l.status}</Tag>
              </li>
            ))}
          </ul>
        </>
      )}
    </AppSheet>
  );
}

function ClarifySheet({
  portal,
  p,
  onClose,
}: {
  portal: Portal;
  p: PortalPlan;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <AppSheet
      title="Ask about your plan"
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          className="flex-1"
          loading={busy}
          disabled={text.trim().length < 5}
          onClick={async () => {
            setBusy(true);
            const ok = await send(portal, { type: "clarify", planId: p.id, text });
            setBusy(false);
            if (ok) onClose();
          }}
        >
          <Send className="size-4" aria-hidden="true" /> Send to {p.clinician.split(" ")[0]}
        </Button>
      }
    >
      <Label
        text="Your question"
        hint="Your plan doesn't change until your therapist replies and updates it."
      >
        <textarea
          className={cn(field, "min-h-28")}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </Label>
    </AppSheet>
  );
}

function CheckIn({ portal, q }: { portal: Portal; q: PortalDto["questionnaires"][number] }) {
  const [answers, setAnswers] = useState(q.items.map((i) => ({ answer: i.answer, na: i.na })));
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);
  const done = q.status === "Submitted";
  const left = q.items.filter(
    (it, i) => it.required && !answers[i]?.na && !answers[i]?.answer.trim(),
  ).length;
  const save = async (submit: boolean) => {
    setBusy(submit ? "submit" : "draft");
    await send(portal, { type: "questionnaire", id: q.id, answers, submit });
    setBusy(null);
  };
  return (
    <AppCard title={q.title} action={<Tag tone={toneFor(q.status)}>{q.status}</Tag>}>
      <p className="-mt-1 mb-3 text-caption text-ink-500">
        Self-reported · your therapist reviews it{q.at ? ` · last saved ${shortDate(q.at)}` : ""}
      </p>
      <ol className="flex flex-col gap-3">
        {q.items.map((it, i) => (
          <li key={it.q}>
            <p className="mb-1.5 text-small font-semibold text-ink-900">
              {i + 1}. {it.q}
              {it.required && <span className="text-over"> *</span>}
            </p>
            <textarea
              aria-label={it.q}
              disabled={done || answers[i]?.na}
              className={cn(field, "min-h-16 disabled:bg-sunken")}
              value={answers[i]?.answer ?? ""}
              onChange={(e) =>
                setAnswers(answers.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))
              }
            />
            {!done && (
              <label className="mt-1 flex items-center gap-2 text-caption text-ink-500">
                <input
                  type="checkbox"
                  checked={answers[i]?.na ?? false}
                  onChange={(e) =>
                    setAnswers(
                      answers.map((x, j) => (j === i ? { ...x, na: e.target.checked } : x)),
                    )
                  }
                />
                Not applicable
              </label>
            )}
          </li>
        ))}
      </ol>
      {!done && (
        <>
          <p className="mt-3 text-caption text-ink-500">
            {left ? `${left} required question${left === 1 ? "" : "s"} left.` : "Ready to send."}{" "}
            Concerns about safety go straight to your therapist.
          </p>
          <div className="mt-3 flex gap-2 border-t border-border pt-3">
            <Button className="flex-1" loading={busy === "draft"} onClick={() => save(false)}>
              Save draft
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              loading={busy === "submit"}
              disabled={left > 0}
              onClick={() => save(true)}
            >
              Submit
            </Button>
          </div>
        </>
      )}
    </AppCard>
  );
}

/* ------------------------------------------------------------------ me (Modules 18, 19, 22) */

type MeView = "profile" | "funding" | "documents" | "payments" | "referrals";

export function PortalMe({ footer }: { footer: ReactNode }) {
  const portal = usePortal();
  const [view, setView] = useState<MeView>("profile");
  const d = portal.data;
  return (
    <>
      <div className="flex flex-col items-center px-4 pt-14 pb-5 text-center">
        <Avatar
          name={d?.profile.legalName ?? "You"}
          size={92}
          kind="patient"
          className="ring-4 ring-accent-tint"
        />
        <p className="mt-3 type-display text-h1 leading-tight text-ink-900">
          {d ? d.profile.preferredName || d.profile.legalName.split(" ")[0] || "You" : "You"}
        </p>
        {d && (
          <p className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5 text-caption">
            <span className="rounded-full border border-border-strong px-2.5 py-0.5 font-mono text-ink-700">
              {d.profile.mrn}
            </span>
            <Tag tone={toneFor(d.profile.status)}>{d.profile.status}</Tag>
          </p>
        )}
      </div>
      <div className="px-4 pb-4">
        <Segments
          value={view}
          onChange={setView}
          items={[
            {
              id: "profile",
              label: "Profile",
              count: d?.requests.filter((r) => r.status === "Pending").length,
            },
            { id: "funding", label: "Funding and team" },
            {
              id: "documents",
              label: "Documents",
              count: d?.documents.filter((x) => x.unread).length,
            },
            {
              id: "payments",
              label: "Payments",
              count: d?.invoices.filter((i) => i.due > 0 && i.status !== "Payment processing")
                .length,
            },
            {
              id: "referrals",
              label: "Referrals",
              count: d?.referrals.filter((r) => r.actionNeeded).length,
            },
          ]}
        />
        {!d ? (
          <Loading />
        ) : view === "profile" ? (
          <ProfileView portal={portal} d={d} />
        ) : view === "funding" ? (
          <FundingView portal={portal} d={d} />
        ) : view === "documents" ? (
          <DocumentsView portal={portal} d={d} />
        ) : view === "payments" ? (
          <PaymentsView portal={portal} d={d} />
        ) : (
          <ReferralsView portal={portal} d={d} />
        )}
        {footer}
      </div>
    </>
  );
}

function ProfileView({ portal, d }: { portal: Portal; d: PortalDto }) {
  const [sheet, setSheet] = useState<
    null | "details" | "identity" | "contact" | "medical" | "prefs"
  >(null);
  const p = d.profile;
  return (
    <>
      <AppCard
        title="My details"
        action={
          <Button size="sm" variant="ghost" onClick={() => setSheet("details")}>
            <Pencil className="size-3.5" aria-hidden="true" /> Edit
          </Button>
        }
      >
        <Facts
          rows={[
            ["Legal name", p.legalName],
            ["Preferred name", p.preferredName],
            ["Pronouns", p.pronouns],
            ["Date of birth", p.dob ? fullDate(p.dob) : ""],
            ["Home address", p.address],
            ["Postal address", p.postalSameAsHome ? "Same as home" : p.postal],
            ["Preferred visit location", p.preferredLocation],
          ]}
        />
        <Button
          size="sm"
          variant="ghost"
          className="mt-3 w-full"
          onClick={() => setSheet("identity")}
        >
          <IdCard className="size-4" aria-hidden="true" /> Correct my legal name or date of birth
        </Button>
      </AppCard>
      <AppCard
        title="Contact"
        action={
          <Button size="sm" variant="ghost" onClick={() => setSheet("contact")}>
            <Pencil className="size-3.5" aria-hidden="true" /> Change
          </Button>
        }
      >
        <Facts
          rows={[
            [
              "Email",
              <span key="e" className="flex items-center justify-end gap-1.5 break-all">
                {p.email}
                {p.emailVerified && (
                  <ShieldCheck className="size-3.5 flex-none text-healthy" aria-label="Verified" />
                )}
              </span>,
            ],
            [
              "Mobile",
              <span key="m" className="flex items-center justify-end gap-1.5">
                {p.phone || "Not recorded"}
                {p.phoneVerified && p.phone && (
                  <ShieldCheck className="size-3.5 flex-none text-healthy" aria-label="Verified" />
                )}
              </span>,
            ],
            [
              "Emergency contact",
              p.emergency
                ? `${p.emergency.name} (${p.emergency.relationship}) · ${p.emergency.phone}`
                : "",
            ],
          ]}
        />
      </AppCard>
      <AppCard
        title="How we contact you"
        action={
          <Button size="sm" variant="ghost" onClick={() => setSheet("prefs")}>
            <Pencil className="size-3.5" aria-hidden="true" /> Edit
          </Button>
        }
      >
        <Facts
          rows={[
            ["Preferred channel", d.prefs.channel],
            ["Best time", d.prefs.time],
            ["Language", d.prefs.language],
            ["Interpreter", d.prefs.interpreter],
            ["Accessibility", d.prefs.accessibility.join(", ") || "None"],
            ["Visit reminders", d.prefs.reminders ? "On" : "Off"],
          ]}
        />
      </AppCard>
      <AppCard
        title="My requests"
        action={
          <Button size="sm" variant="ghost" onClick={() => setSheet("medical")}>
            Health record correction
          </Button>
        }
      >
        {d.requests.length === 0 ? (
          <p className="text-small text-ink-700">
            Changes to your legal name, date of birth or health record are reviewed by our team.
            They appear here.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {d.requests.map((r) => (
              <li key={r.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-small font-semibold text-ink-900">{r.field}</p>
                  <Tag tone={toneFor(r.status)}>{r.status}</Tag>
                </div>
                <p className="mt-0.5 text-caption text-ink-700">{auDate(r.to)}</p>
                {r.kind === "Medical record" && (
                  <p className="text-caption text-ink-500 italic">
                    Reported by you · not verified until your clinician reviews it
                  </p>
                )}
                <p className="text-caption text-ink-500">
                  {shortDate(r.at)}
                  {r.reason ? ` · ${r.reason}` : ""}
                </p>
                {r.status === "Pending" && (
                  <Button
                    size="sm"
                    variant="danger"
                    className="mt-1 -ml-3"
                    onClick={() => send(portal, { type: "withdraw", id: r.id })}
                  >
                    Withdraw
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </AppCard>
      {sheet === "details" && <DetailsSheet portal={portal} d={d} onClose={() => setSheet(null)} />}
      {sheet === "identity" && <IdentitySheet portal={portal} onClose={() => setSheet(null)} />}
      {sheet === "contact" && <ContactSheet portal={portal} d={d} onClose={() => setSheet(null)} />}
      {sheet === "medical" && <MedicalSheet portal={portal} onClose={() => setSheet(null)} />}
      {sheet === "prefs" && <PrefsSheet portal={portal} d={d} onClose={() => setSheet(null)} />}
    </>
  );
}

function SaveSheet({
  title,
  onClose,
  onSave,
  disabled,
  label = "Save",
  children,
}: {
  title: string;
  onClose: () => void;
  onSave: () => Promise<boolean>;
  disabled?: boolean;
  label?: string;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <AppSheet
      title={title}
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          className="flex-1"
          loading={busy}
          disabled={disabled}
          onClick={async () => {
            setBusy(true);
            const ok = await onSave();
            setBusy(false);
            if (ok) onClose();
          }}
        >
          {label}
        </Button>
      }
    >
      {children}
    </AppSheet>
  );
}

function DetailsSheet({
  portal,
  d,
  onClose,
}: {
  portal: Portal;
  d: PortalDto;
  onClose: () => void;
}) {
  const [preferredName, setName] = useState(d.profile.preferredName);
  const [pronouns, setPronouns] = useState<(typeof pronounOptions)[number] | "">(
    (pronounOptions as readonly string[]).includes(d.profile.pronouns)
      ? (d.profile.pronouns as (typeof pronounOptions)[number])
      : "",
  );
  const [same, setSame] = useState(d.profile.postalSameAsHome);
  const [postal, setPostal] = useState(d.profile.postalSameAsHome ? "" : d.profile.postal);
  const [loc, setLoc] = useState(d.profile.preferredLocation);
  return (
    <SaveSheet
      title="Edit my details"
      onClose={onClose}
      onSave={() =>
        send(portal, {
          type: "profile",
          preferredName,
          pronouns,
          postal,
          postalSameAsHome: same,
          preferredLocation: loc,
        })
      }
    >
      <Label text="Preferred name">
        <input className={field} value={preferredName} onChange={(e) => setName(e.target.value)} />
      </Label>
      <Pills label="Pronouns" options={pronounOptions} value={pronouns} onChange={setPronouns} />
      <label className="mb-3 flex items-center gap-2 text-small">
        <input type="checkbox" checked={same} onChange={(e) => setSame(e.target.checked)} /> Postal
        address is the same as home
      </label>
      {!same && (
        <Label text="Postal address">
          <input className={field} value={postal} onChange={(e) => setPostal(e.target.value)} />
        </Label>
      )}
      <Pills
        label="Preferred visit location"
        options={bookingModes}
        value={
          (bookingModes as readonly string[]).includes(loc)
            ? (loc as (typeof bookingModes)[number])
            : ""
        }
        onChange={setLoc}
      />
      <p className="text-caption text-ink-500">
        Your legal name and date of birth are changed through a request, so our records stay
        accurate.
      </p>
    </SaveSheet>
  );
}

function IdentitySheet({ portal, onClose }: { portal: Portal; onClose: () => void }) {
  const opts = ["Legal first name", "Legal last name", "Date of birth"] as const;
  const [f, setF] = useState<(typeof opts)[number]>("Legal first name");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  return (
    <SaveSheet
      title="Request a correction"
      label="Send for review"
      onClose={onClose}
      disabled={!to.trim()}
      onSave={() => send(portal, { type: "identity", field: f, to, reason })}
    >
      <Pills
        label="What needs correcting?"
        options={opts}
        value={f}
        onChange={(v) => {
          setF(v);
          setTo("");
        }}
      />
      {f === "Date of birth" ? (
        <DobField value={to} onChange={setTo} />
      ) : (
        <Label text="Correct value">
          <input className={field} value={to} onChange={(e) => setTo(e.target.value)} />
        </Label>
      )}
      <Label text="Why? (optional)" hint="For example: legal name change, typo when referred">
        <input className={field} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Label>
      <p className="text-caption text-ink-500">
        Our team checks identity changes before they apply. Your record stays as it is until then.
      </p>
    </SaveSheet>
  );
}

/** Day, month and year as separate boxes, in Australian order. */
function DobField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [y = "", m = "", d = ""] = value ? value.split("-") : [];
  const set = (dd: string, mm: string, yy: string) =>
    onChange(
      dd && mm && yy.length === 4 ? `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}` : "",
    );
  const [day, setDay] = useState(d);
  const [month, setMonth] = useState(m);
  const [year, setYear] = useState(y);
  const box = (label: string, v: string, max: number, upd: (x: string) => void) => (
    <label className="flex flex-col gap-1">
      <span className="text-caption text-ink-500">{label}</span>
      <input
        aria-label={label}
        className={cn(field, "text-center")}
        inputMode="numeric"
        maxLength={max}
        value={v}
        onChange={(e) => upd(e.target.value.replace(/\D/g, ""))}
      />
    </label>
  );
  return (
    <div className="mb-3">
      <p className="mb-1.5 text-caption font-semibold text-ink-700">Correct date of birth</p>
      <div className="grid grid-cols-[1fr_1fr_1.6fr] gap-2">
        {box("Day", day, 2, (x) => {
          setDay(x);
          set(x, month, year);
        })}
        {box("Month", month, 2, (x) => {
          setMonth(x);
          set(day, x, year);
        })}
        {box("Year", year, 4, (x) => {
          setYear(x);
          set(day, month, x);
        })}
      </div>
    </div>
  );
}

function ContactSheet({
  portal,
  d,
  onClose,
}: {
  portal: Portal;
  d: PortalDto;
  onClose: () => void;
}) {
  const [f, setF] = useState<"Email" | "Mobile phone">("Mobile phone");
  const [to, setTo] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  return (
    <SaveSheet
      title="Change contact details"
      label={sent ? "Verify" : "Send code"}
      onClose={onClose}
      disabled={sent ? code.length !== 6 : to.trim().length < 3}
      onSave={async () => {
        if (!sent) {
          const ok = await send(portal, { type: "contact", field: f, to });
          if (ok) setSent(true);
          return false;
        }
        return send(portal, { type: "verify", field: f, code });
      }}
    >
      {!sent ? (
        <>
          <Pills
            label="Which one?"
            options={["Mobile phone", "Email"] as const}
            value={f}
            onChange={setF}
          />
          <Label
            text={`New ${f.toLowerCase()}`}
            hint={`Current: ${f === "Email" ? d.profile.email : d.profile.phone || "none"}`}
          >
            <input
              className={field}
              inputMode={f === "Email" ? "email" : "tel"}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Label>
        </>
      ) : (
        <>
          <p className="mb-3 text-small text-ink-700">
            We sent a 6-digit code to <strong>{to}</strong>. Your {f.toLowerCase()} changes once
            it&apos;s verified.
          </p>
          <Label text="Verification code" hint="In this demo the code is 246810.">
            <input
              className={cn(field, "font-mono tracking-[0.3em]")}
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </Label>
        </>
      )}
    </SaveSheet>
  );
}

function MedicalSheet({ portal, onClose }: { portal: Portal; onClose: () => void }) {
  const [text, setText] = useState("");
  return (
    <SaveSheet
      title="Correct my health information"
      label="Send to my clinician"
      onClose={onClose}
      disabled={text.trim().length < 5}
      onSave={() => send(portal, { type: "medical", text })}
    >
      <Label
        text="What is wrong, and what should it say?"
        hint="For example: an allergy, medicine or condition that's out of date"
      >
        <textarea
          className={cn(field, "min-h-28")}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </Label>
      <p className="text-caption text-ink-500">
        Your clinician reviews health-record changes. If they disagree, your request is kept with
        your record.
      </p>
    </SaveSheet>
  );
}

function PrefsSheet({ portal, d, onClose }: { portal: Portal; d: PortalDto; onClose: () => void }) {
  const [channel, setChannel] = useState(d.prefs.channel as (typeof contactChannels)[number]);
  const [time, setTime] = useState(d.prefs.time as (typeof contactTimes)[number]);
  const [language, setLanguage] = useState(d.prefs.language);
  const [interpreter, setInterp] = useState(d.prefs.interpreter as "Yes" | "No" | "Unsure");
  const [acc, setAcc] = useState(d.prefs.accessibility);
  const [reminders, setRem] = useState(d.prefs.reminders);
  return (
    <SaveSheet
      title="Communication preferences"
      onClose={onClose}
      onSave={() =>
        send(portal, {
          type: "prefs",
          channel,
          time,
          language,
          interpreter,
          accessibility: acc,
          reminders,
        })
      }
    >
      <Pills
        label="Preferred channel"
        options={contactChannels}
        value={channel}
        onChange={setChannel}
      />
      <Pills label="Best time to contact" options={contactTimes} value={time} onChange={setTime} />
      <Label text="Preferred language">
        <input className={field} value={language} onChange={(e) => setLanguage(e.target.value)} />
      </Label>
      <Pills
        label="Do you need an interpreter?"
        options={["Yes", "No", "Unsure"] as const}
        value={interpreter}
        onChange={setInterp}
      />
      <div className="mb-3">
        <p className="mb-1.5 text-caption font-semibold text-ink-700">Accessibility needs</p>
        <div className="flex flex-wrap gap-1.5">
          {accessibilityOptions.map((o) => {
            const on = acc.includes(o);
            return (
              <button
                key={o}
                type="button"
                aria-pressed={on}
                onClick={() => setAcc(on ? acc.filter((x) => x !== o) : [...acc, o])}
                className={cn(
                  "min-h-9 cursor-pointer rounded-full border px-3 text-caption font-semibold",
                  on
                    ? "border-accent-fill bg-accent-tint text-accent"
                    : "border-border-strong text-ink-700",
                )}
              >
                {o}
              </button>
            );
          })}
        </div>
      </div>
      <label className="flex items-center justify-between gap-2 rounded-control border border-border p-3 text-small">
        Visit reminders
        <input type="checkbox" checked={reminders} onChange={(e) => setRem(e.target.checked)} />
      </label>
    </SaveSheet>
  );
}

function FundingView({ portal, d }: { portal: Portal; d: PortalDto }) {
  const [confirm, setConfirm] = useState(false);
  const [withdraw, setWithdraw] = useState<PortalDto["consents"][number] | null>(null);
  const [why, setWhy] = useState("");
  const f = d.funding;
  return (
    <>
      <AppCard
        title="Funding"
        action={f ? <Tag tone={toneFor(f.status)}>{f.status}</Tag> : undefined}
      >
        {!f ? (
          <p className="text-small text-ink-700">
            No funding plan is recorded yet. Our team adds it once your NDIS plan is confirmed.
          </p>
        ) : (
          <>
            <Facts
              rows={[
                ["Program", f.program],
                [
                  "NDIS number",
                  <span key="n" className="flex items-center justify-end gap-2">
                    <span className="font-mono">{f.number}</span>
                    {!f.revealed && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="-my-1"
                        onClick={() => setConfirm(true)}
                      >
                        <Eye className="size-3.5" aria-hidden="true" /> Show
                      </Button>
                    )}
                  </span>,
                ],
                ["Plan management", f.type],
                ...(f.manager ? ([["Plan manager", f.manager]] as [string, string][]) : []),
                [
                  "Plan dates",
                  `${shortDate(`${f.start}T00:00:00Z`)} to ${shortDate(`${f.end}T00:00:00Z`)}`,
                ],
                ["Checked by our team", f.verified ? "Yes" : "Not yet"],
              ]}
            />
            <p className="mt-3 flex items-center gap-1.5 text-caption text-ink-500">
              <LockKeyhole className="size-3.5" aria-hidden="true" /> Your NDIS number is hidden by
              default. Viewing it is recorded.
            </p>
          </>
        )}
      </AppCard>
      <AppCard title="My care team">
        {d.careTeam.length === 0 ? (
          <p className="text-small text-ink-700">
            Your care team appears here once a therapist accepts.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {d.careTeam.map((c) => (
              <Row
                key={c.service + c.clinician}
                icon={HeartHandshake}
                title={c.service}
                meta={c.clinician}
                aside={<Tag tone={toneFor(c.status)}>{c.status}</Tag>}
              />
            ))}
          </div>
        )}
      </AppCard>
      <AppCard title="People who can act for me">
        {d.representatives.length === 0 ? (
          <p className="text-small text-ink-700">
            No representatives are recorded. Ask your care team to add a guardian or nominee.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {d.representatives.map((r) => (
              <Row
                key={r.name + r.role}
                icon={UsersRound}
                title={r.name}
                meta={`${r.relationship || r.role}${r.expires ? ` · until ${shortDate(`${r.expires}T00:00:00Z`)}` : ""}${r.scope.length ? ` · ${r.scope.join(", ")}` : ""}`}
                aside={<Tag tone={toneFor(r.status)}>{r.status}</Tag>}
              />
            ))}
          </div>
        )}
      </AppCard>
      <AppCard title="My consents">
        <ul className="divide-y divide-border">
          {d.consents.map((c) => (
            <li key={c.key} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-small font-semibold text-ink-900">{c.label}</p>
                <Tag
                  tone={
                    c.state === "Given" ? "healthy" : c.state === "Not asked" ? "plain" : "over"
                  }
                >
                  {c.state}
                </Tag>
              </div>
              <p className="mt-0.5 text-caption text-ink-500">
                {c.help}
                {c.at && c.state !== "Not asked"
                  ? ` Recorded ${shortDate(c.at)}${c.version ? `, version ${c.version}` : ""}.`
                  : ""}
              </p>
              {c.withdrawal ? (
                <p className="mt-1 text-caption text-watch">
                  Withdrawal requested {c.withdrawal}; our team confirms it.
                </p>
              ) : (
                c.state === "Given" && (
                  <Button
                    size="sm"
                    variant="danger"
                    className="mt-1 -ml-3"
                    onClick={() => setWithdraw(c)}
                  >
                    Withdraw consent
                  </Button>
                )
              )}
            </li>
          ))}
        </ul>
      </AppCard>
      {withdraw && (
        <SaveSheet
          title={`Withdraw: ${withdraw.label}`}
          label="Ask to withdraw"
          onClose={() => setWithdraw(null)}
          onSave={() => send(portal, { type: "consent-withdraw", key: withdraw.key, reason: why })}
        >
          <p className="mb-3 text-small text-ink-700">
            Our team confirms the change and tells your clinicians. Anything already done with your
            consent stays on record.
          </p>
          <Label text="Reason (optional)">
            <input className={field} value={why} onChange={(e) => setWhy(e.target.value)} />
          </Label>
        </SaveSheet>
      )}
      {confirm && (
        <SaveSheet
          title="Show your NDIS number?"
          label="Show for 10 minutes"
          onClose={() => setConfirm(false)}
          onSave={() =>
            send(portal, { type: "reveal", confirm: true }, "NDIS number shown for 10 minutes")
          }
        >
          <p className="text-small text-ink-700">
            Make sure no one can see your screen. It hides again after 10 minutes, and we record
            that you viewed it.
          </p>
        </SaveSheet>
      )}
    </>
  );
}

function DocumentsView({ portal, d }: { portal: Portal; d: PortalDto }) {
  const [upload, setUpload] = useState(false);
  const [open, setOpen] = useState<PortalDto["documents"][number] | null>(null);
  return (
    <>
      <AppCard
        title="Shared with me"
        action={
          <Button size="sm" variant="soft" onClick={() => setUpload(true)}>
            <FileUp className="size-3.5" aria-hidden="true" /> Upload
          </Button>
        }
      >
        {d.documents.length === 0 ? (
          <p className="text-small text-ink-700">
            Reports and summaries your clinician releases to you appear here. Clinical notes stay
            with your clinicians.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {d.documents.map((x) => (
              <Row
                key={x.id}
                icon={x.kind === "Agreement" ? ClipboardList : FileText}
                title={
                  <span className="flex items-center gap-1.5">
                    {x.unread && (
                      <i aria-label="New" className="size-2 flex-none rounded-full bg-accent" />
                    )}
                    {x.title}
                  </span>
                }
                meta={`${x.kind}${x.version ? ` · ${x.version}` : ""} · ${shortDate(x.date)}`}
                onClick={() => {
                  setOpen(x);
                  if (x.unread) void send(portal, { type: "read", id: x.id }, "Marked as read");
                }}
              />
            ))}
          </div>
        )}
      </AppCard>
      <AppCard title="Uploaded by me">
        {d.uploads.length === 0 ? (
          <p className="text-small text-ink-700">
            Upload your NDIS plan, a referral or a previous assessment. PDF, JPG, PNG or Word, up to
            10 MB.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {d.uploads.map((u, i) => (
              <Row
                key={u.name + i}
                icon={FileUp}
                title={u.name}
                meta={`${u.category} · ${shortDate(u.at)}`}
                aside={<Tag tone="watch">In review</Tag>}
              />
            ))}
          </div>
        )}
      </AppCard>
      {upload && <UploadSheet portal={portal} onClose={() => setUpload(false)} />}
      {open && (
        <AppSheet title={open.title} onClose={() => setOpen(null)}>
          <Facts
            rows={[
              ["Type", open.kind],
              ["Version", open.version || "Current"],
              ["Shared", shortDate(open.date)],
            ]}
          />
          <p className="mt-3 text-small text-ink-700">
            This is the version your clinician released to you. If something looks wrong, ask a
            question from My care or request a health-record correction.
          </p>
        </AppSheet>
      )}
    </>
  );
}

function UploadSheet({ portal, onClose }: { portal: Portal; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<(typeof docCategories)[number]>("NDIS Plan");
  const [consent, setConsent] = useState(false);
  const bad =
    file && (!(uploadTypes as readonly string[]).includes(file.type) || file.size > MAX_UPLOAD);
  return (
    <SaveSheet
      title="Upload a document"
      label="Upload"
      onClose={onClose}
      disabled={!file || Boolean(bad) || !consent}
      onSave={() =>
        file
          ? send(portal, {
              type: "upload",
              name: file.name,
              mime: file.type,
              size: file.size,
              category,
              consent,
            })
          : Promise.resolve(false)
      }
    >
      <Label text="File" hint="PDF, JPG, PNG or Word, up to 10 MB">
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.docx"
          className={field}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </Label>
      {bad && (
        <p className="-mt-2 mb-3 text-caption text-over">
          That file type or size isn&apos;t accepted.
        </p>
      )}
      <Pills label="What is it?" options={docCategories} value={category} onChange={setCategory} />
      <label className="flex items-start gap-2.5 rounded-control border border-border-strong p-3 text-small">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        I&apos;m happy for Medisense to keep this document with my record.
      </label>
    </SaveSheet>
  );
}

function PaymentsView({ portal, d }: { portal: Portal; d: PortalDto }) {
  const [paying, setPaying] = useState<PortalDto["invoices"][number] | null>(null);
  const [open, setOpen] = useState<PortalDto["invoices"][number] | null>(null);
  const due = d.invoices.reduce((s, i) => s + (i.status === "Payment processing" ? 0 : i.due), 0);
  const paid = d.invoices.reduce((s, i) => s + i.paid, 0);
  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {(
          [
            ["Balance due", money(due)],
            ["Paid to date", money(paid)],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-card border border-border bg-surface p-3 shadow-lift">
            <p className="text-label text-ink-500">{k}</p>
            <p className="mt-1 text-section font-semibold">{v}</p>
          </div>
        ))}
      </div>
      <AppCard title="Invoices">
        {d.invoices.length === 0 ? (
          <p className="text-small text-ink-700">
            Invoices for self-funded or self-managed services appear here. NDIA-managed claims
            don&apos;t.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {d.invoices.map((i) => (
              <Row
                key={i.id}
                icon={Receipt}
                title={
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-mono">{i.number}</span>
                    <Tag tone={i.due > 0 && i.status === "Issued" ? "watch" : toneFor(i.status)}>
                      {i.due > 0 && ["Issued", "Part-Paid"].includes(i.status)
                        ? `Due ${money(i.due)}`
                        : i.status}
                    </Tag>
                  </span>
                }
                meta={`${i.issuedAt ? shortDate(i.issuedAt) : "Not issued"} · ${money(i.total)}${i.payment ? ` · ${i.payment}` : ""}`}
                onClick={() => setOpen(i)}
              />
            ))}
          </div>
        )}
      </AppCard>
      {paying && <PaySheet portal={portal} inv={paying} onClose={() => setPaying(null)} />}
      {open && !paying && (
        <InvoiceSheet
          portal={portal}
          inv={d.invoices.find((x) => x.id === open.id) ?? open}
          onPay={() => setPaying(open)}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

function InvoiceSheet({
  portal,
  inv,
  onPay,
  onClose,
}: {
  portal: Portal;
  inv: PortalDto["invoices"][number];
  onPay: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const payable = inv.due > 0 && ["Issued", "Part-Paid"].includes(inv.status);
  return (
    <AppSheet
      title={`Invoice ${inv.number}`}
      onClose={onClose}
      footer={
        query ? (
          <>
            <Button className="flex-1" onClick={() => setQuery(false)}>
              Back
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              loading={busy}
              disabled={reason.trim().length < 5}
              onClick={async () => {
                setBusy(true);
                const ok = await send(portal, { type: "dispute", invoiceId: inv.id, reason });
                setBusy(false);
                if (ok) setQuery(false);
              }}
            >
              <Send className="size-4" aria-hidden="true" /> Send to Finance
            </Button>
          </>
        ) : (
          <>
            {payable && (
              <Button variant="primary" className="flex-1" onClick={onPay}>
                <CreditCard className="size-4" aria-hidden="true" /> Pay {money(inv.due)}
              </Button>
            )}
            {!inv.disputed && (
              <Button className="flex-1" onClick={() => setQuery(true)}>
                Something looks wrong
              </Button>
            )}
          </>
        )
      }
    >
      {query ? (
        <Label
          text="What looks wrong?"
          hint="Finance replies by your preferred channel. Your invoice stays as issued until they do."
        >
          <textarea
            className={cn(field, "min-h-24")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Label>
      ) : (
        <>
          <Facts
            rows={[
              [
                "Status",
                <Tag key="s" tone={toneFor(inv.status)}>
                  {inv.status}
                </Tag>,
              ],
              ["Billed to", inv.payer],
              ["Issued", inv.issuedAt ? shortDate(inv.issuedAt) : "Not issued"],
            ]}
          />
          <AppSection title="Services" />
          <ul className="divide-y divide-border rounded-control border border-border px-3">
            {inv.lines.map((l, k) => (
              <li key={k} className="flex items-start justify-between gap-3 py-2.5 text-small">
                <span className="min-w-0">
                  <span className="block text-ink-900">{l.description}</span>
                  <span className="text-caption text-ink-500">{shortDate(l.date)}</span>
                </span>
                <span className="flex-none font-medium tabular-nums">{money(l.amount)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 flex flex-col gap-1 text-small">
            {(
              [
                ["Total", money(inv.total)],
                ["Paid", money(inv.paid)],
                ["Balance", money(inv.due)],
              ] as const
            ).map(([k, v]) => (
              <div
                key={k}
                className={cn(
                  "flex justify-between",
                  k === "Balance" && "border-t border-border pt-2 font-semibold",
                )}
              >
                <dt className="text-ink-700">{k}</dt>
                <dd className="tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          {inv.payment && (
            <p className="mt-3 rounded-control bg-healthy-bg px-3 py-2 text-caption text-healthy">
              Receipt: {inv.payment} (simulated). Your balance updates once the payment clears.
            </p>
          )}
          {inv.disputed && (
            <p className="mt-3 rounded-control bg-watch-bg px-3 py-2 text-caption text-watch">
              Query raised {inv.disputed}
            </p>
          )}
        </>
      )}
    </AppSheet>
  );
}

function PaySheet({
  portal,
  inv,
  onClose,
}: {
  portal: Portal;
  inv: PortalDto["invoices"][number];
  onClose: () => void;
}) {
  const [method, setMethod] = useState<"Card" | "Bank transfer">("Card");
  return (
    <SaveSheet
      title={`Pay ${inv.number}`}
      label={`Pay ${money(inv.due)}`}
      onClose={onClose}
      onSave={() => send(portal, { type: "pay", invoiceId: inv.id, method })}
    >
      <Facts
        rows={[
          ["Invoice total", money(inv.total)],
          ["Already paid", money(inv.paid)],
          ["Due now", money(inv.due)],
        ]}
      />
      <div className="mt-3">
        <Pills
          label="Pay by"
          options={["Card", "Bank transfer"] as const}
          value={method}
          onChange={setMethod}
        />
      </div>
      <p className="flex items-center gap-1.5 text-caption text-ink-500">
        <CreditCard className="size-3.5" aria-hidden="true" /> Payment is simulated in this demo.
        Card details are never stored by Medisense.
      </p>
    </SaveSheet>
  );
}

function ReferralsView({ portal, d }: { portal: Portal; d: PortalDto }) {
  const [answering, setAnswering] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  if (d.referrals.length === 0)
    return (
      <AppEmpty icon={ClipboardList} title="No referrals on file" compact>
        Referrals made with your MRN appear here with their progress.
      </AppEmpty>
    );
  return (
    <>
      {d.referrals.map((r) => (
        <AppCard key={r.ref} title={r.services.map((x) => x.name).join(", ") || "Referral"}>
          <div className="-mt-1 mb-2">
            <Tag tone={toneFor(r.status)}>{r.status}</Tag>
          </div>
          <p className="-mt-1 mb-3 text-caption text-ink-500">
            <span className="font-mono break-all text-ink-700">{r.ref}</span> · sent{" "}
            {shortDate(r.submitted)}
          </p>
          {r.actionNeeded && (
            <div className="mb-3 rounded-control bg-watch-bg px-3 py-2.5 text-caption text-watch">
              <p className="font-semibold">{r.actionNeeded}</p>
              {r.question && <p className="mt-1 text-ink-700">&ldquo;{r.question}&rdquo;</p>}
              <Button
                size="sm"
                variant="primary"
                className="mt-2"
                onClick={() => setAnswering(r.ref)}
              >
                <Send className="size-3.5" aria-hidden="true" /> Send information
              </Button>
            </div>
          )}
          <ul className="divide-y divide-border">
            {r.services.map((x) => (
              <li
                key={x.name}
                className="flex items-center justify-between gap-2 py-2 text-small first:pt-0 last:pb-0"
              >
                <span className="text-ink-900">{x.name}</span>
                <Tag tone={toneFor(x.status)}>{x.status}</Tag>
              </li>
            ))}
          </ul>
          {r.timeline.length > 0 && (
            <>
              <AppSection title="Progress" />
              <ol className="relative ml-2 border-l border-border pl-4">
                {r.timeline.map((t, i) => (
                  <li key={i} className="relative pb-2.5 last:pb-0">
                    <i
                      aria-hidden="true"
                      className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-surface bg-accent"
                    />
                    <p className="text-small font-semibold text-ink-900">{t.status}</p>
                    <p className="text-caption text-ink-500">{shortDate(t.at)}</p>
                  </li>
                ))}
              </ol>
            </>
          )}
          {r.canWithdraw && (
            <Button
              size="sm"
              variant="danger"
              className="mt-3 -ml-3"
              onClick={() => setWithdrawing(r.ref)}
            >
              Withdraw this referral
            </Button>
          )}
        </AppCard>
      ))}
      {answering && (
        <AnswerSheet portal={portal} refNo={answering} onClose={() => setAnswering(null)} />
      )}
      {withdrawing && (
        <WithdrawSheet portal={portal} refNo={withdrawing} onClose={() => setWithdrawing(null)} />
      )}
    </>
  );
}

function AnswerSheet({
  portal,
  refNo,
  onClose,
}: {
  portal: Portal;
  refNo: string;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const bad =
    file && (!(uploadTypes as readonly string[]).includes(file.type) || file.size > MAX_UPLOAD);
  return (
    <SaveSheet
      title="Send information"
      label="Send to our team"
      onClose={onClose}
      disabled={(!text.trim() && !file) || Boolean(bad)}
      onSave={() =>
        send(portal, { type: "referral-answer", ref: refNo, text, file: file?.name ?? "" })
      }
    >
      <Label text="Your answer">
        <textarea
          className={cn(field, "min-h-24")}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </Label>
      <Label text="Attach a document (optional)" hint="PDF, JPG, PNG or Word, up to 10 MB">
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.docx"
          className={field}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </Label>
      {bad && (
        <p className="-mt-2 mb-3 text-caption text-over">
          That file type or size isn&apos;t accepted. Your answer is kept.
        </p>
      )}
      <p className="text-caption text-ink-500">
        Your referral goes back to our team for review once you send this.
      </p>
    </SaveSheet>
  );
}

function WithdrawSheet({
  portal,
  refNo,
  onClose,
}: {
  portal: Portal;
  refNo: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <SaveSheet
      title="Withdraw this referral?"
      label="Withdraw referral"
      onClose={onClose}
      disabled={reason.trim().length < 3}
      onSave={() => send(portal, { type: "referral-withdraw", ref: refNo, reason })}
    >
      <p className="mb-3 text-small text-ink-700">
        We&apos;ll stop work on {refNo}. You can make a new referral at any time.
      </p>
      <Label text="Why are you withdrawing it?">
        <input className={field} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Label>
    </SaveSheet>
  );
}
