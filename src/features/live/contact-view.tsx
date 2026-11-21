"use client";

import { CalendarDays, Lock, MapPin, MonitorPlay, Receipt, UserRound } from "lucide-react";
import { Tag } from "@/components/ui/tag";
import { useResource } from "@/lib/live/client";
import { ErrorNote, Skeleton } from "./bits";

type View = {
  participant: string;
  contact: string;
  role: string;
  canSchedule: boolean;
  appointments: {
    ref: string;
    start: string;
    end: string;
    status: string;
    clinician: string;
    service: string;
    mode: string;
    place: string;
  }[];
  invoices:
    | {
        number: string;
        status: string;
        issuedAt: string | null;
        total: number;
        balance: number;
        services: string[];
      }[]
    | null;
};

const money = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

const fmt = (v: string, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Brisbane", ...o }).format(new Date(v));

/** What an authorised contact sees: upcoming appointments only, nothing clinical. */
export function ContactView({ token }: { token: string }) {
  const { data, error, reload } = useResource<{ view: View }>(
    `/api/contact/${encodeURIComponent(token)}`,
  );
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-96 max-w-180" />;
  const v = data.view;
  return (
    <div className="max-w-180 overflow-hidden rounded-card border border-border bg-surface shadow-lift">
      <div className="flex items-start gap-4 border-b border-border p-6">
        <span className="flex size-12 flex-none items-center justify-center rounded-full bg-accent-tint text-accent ring-8 ring-accent-tint/40">
          <CalendarDays className="size-5.5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-label font-semibold tracking-[0.1em] text-ink-500 uppercase">
            {v.role}
          </p>
          <h2 className="mt-1 type-display text-h2 text-ink-900">
            Hi {v.contact.split(" ")[0]}, here are {v.participant}&apos;s appointments
          </h2>
          <p className="mt-1 text-small text-ink-700">
            {v.canSchedule
              ? "You can arrange changes with the care team."
              : "You receive appointment updates."}{" "}
            Times are AEST · Brisbane.
          </p>
        </div>
      </div>
      {v.appointments.length === 0 ? (
        <p className="px-6 py-12 text-center text-small text-ink-500">No upcoming appointments.</p>
      ) : (
        <ul className="divide-y divide-border">
          {v.appointments.map((a) => (
            <li
              key={a.ref + a.start}
              className="flex items-start gap-4 px-6 py-4 transition-colors hover:bg-canvas"
            >
              <div className="w-20 flex-none rounded-control bg-accent-tint py-2 text-center text-accent">
                <p className="text-label font-semibold uppercase">
                  {fmt(a.start, { weekday: "short" })}
                </p>
                <p className="type-display text-h2 leading-7">{fmt(a.start, { day: "numeric" })}</p>
                <p className="text-label uppercase">{fmt(a.start, { month: "short" })}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-body font-semibold text-ink-900">
                  {fmt(a.start, { hour: "numeric", minute: "2-digit" })} –{" "}
                  {fmt(a.end, { hour: "numeric", minute: "2-digit" })}
                  <Tag tone={a.status === "Booked" ? "healthy" : "watch"}>{a.status}</Tag>
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-small text-ink-700">
                  <UserRound className="size-3.5" aria-hidden="true" /> {a.clinician} · {a.service}
                </p>
                <p className="flex items-center gap-1.5 text-small text-ink-700">
                  {a.mode === "Video visit" ? (
                    <MonitorPlay className="size-3.5" aria-hidden="true" />
                  ) : (
                    <MapPin className="size-3.5" aria-hidden="true" />
                  )}
                  {a.mode} · {a.place}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {v.invoices && (
        <div className="border-t border-border">
          <p className="px-6 pt-4 text-label font-semibold tracking-[0.1em] text-ink-500 uppercase">
            Invoices (you&apos;re the verified billing contact)
          </p>
          {v.invoices.length === 0 ? (
            <p className="px-6 py-4 text-small text-ink-500">No invoices issued yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {v.invoices.map((i) => (
                <li key={i.number} className="flex items-center gap-4 px-6 py-3 text-small">
                  <Receipt className="size-4 flex-none text-accent" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink-900">{i.number}</span>
                    <span className="block truncate text-caption text-ink-500">
                      {i.services.join(", ")}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold">{money(i.total)}</span>
                    <span className="block text-caption text-ink-500">
                      {i.status} · {money(i.balance)} owing
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="flex items-center gap-2 border-t border-border px-6 py-3 text-caption text-ink-500">
        <Lock className="size-3.5" aria-hidden="true" />{" "}
        {v.invoices ? "Appointments and invoices only." : "Appointments only."} Notes, reports and
        recordings aren&apos;t shared here. The link stops if access is revoked or expires.
      </p>
    </div>
  );
}
