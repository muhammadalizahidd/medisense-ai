"use client";

import { CalendarOff, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { MetricBand } from "@/components/ui/metric-band";
import { Tag } from "@/components/ui/tag";
import { relativeTime, shortDate } from "@/lib/live/time";
import type { TherapistDetailDto } from "@/lib/live/types";
import { CaseloadTag, EmptyNote, Panel, Stars } from "./bits";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const clock = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h >= 12 ? "pm" : "am"}`;
};
const day = (iso: string) => shortDate(`${iso}T00:00:00+10:00`);

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
  return (
    <div className="flex flex-col gap-6">
      <MetricBand
        label="Therapist figures"
        metrics={[
          {
            label: "Caseload",
            value: `${t.activeClients}/${t.capacity}`,
            caption: <CaseloadTag status={t.status} />,
          },
          { label: "Upcoming visits", value: t.stats.upcoming },
          { label: "Visits completed", value: t.stats.completed },
          {
            label: "Late cancellations and no-shows",
            value: t.stats.lateCancellations + t.stats.noShows,
            tone: t.stats.lateCancellations + t.stats.noShows ? "monitor" : undefined,
          },
          {
            label: "Patient rating",
            value: t.rating ? t.rating.average.toFixed(1) : "–",
            caption: t.rating ? `${t.rating.count} ratings` : "No ratings yet",
          },
        ]}
      />
      <div className="grid gap-6 xl:grid-cols-12">
        <div className="flex flex-col gap-6 xl:col-span-7">
          <Panel title="About">
            <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-small">
              <dt className="text-ink-500">Discipline</dt>
              <dd>
                {t.discipline} · {t.seniority} · {t.sessionMinutes}-minute sessions
              </dd>
              <dt className="text-ink-500">Region</dt>
              <dd>{t.region}</dd>
              <dt className="text-ink-500">Contact</dt>
              <dd className="flex flex-wrap gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1.5 break-all">
                  <Mail className="size-3.5 text-ink-500" aria-hidden="true" />
                  {t.email}
                </span>
                {t.phone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="size-3.5 text-ink-500" aria-hidden="true" />
                    {t.phone}
                  </span>
                )}
              </dd>
              {t.profile.qualifications && (
                <>
                  <dt className="text-ink-500">Qualifications</dt>
                  <dd>{t.profile.qualifications}</dd>
                </>
              )}
              <dt className="text-ink-500">Languages</dt>
              <dd>{t.profile.languages.join(", ") || "English"}</dd>
            </dl>
            <p className="text-small whitespace-pre-line text-ink-700">
              {t.profile.bio || "No bio added yet."}
            </p>
          </Panel>
          <Panel title="What patients say">
            {t.feedback.length === 0 ? (
              <EmptyNote title="No feedback yet.">
                Patients rate a visit after it&apos;s completed.
              </EmptyNote>
            ) : (
              <ul className="divide-y divide-border">
                {t.feedback.map((f) => (
                  <li key={`${f.visit}-${f.at}`} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Stars value={f.rating} />
                      <span className="text-caption text-ink-500">
                        {f.patient} · visit on {shortDate(f.visit)}
                      </span>
                    </div>
                    {f.comment && <p className="mt-1 text-small">“{f.comment}”</p>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        <div className="flex flex-col gap-6 xl:col-span-5">
          <Panel title="Working pattern">
            <ul className="mb-3 grid grid-cols-5 gap-1.5 text-center text-caption">
              {DAYS.map((name, i) => {
                const hours = t.weekly.find((w) => w.weekday === i + 1);
                return (
                  <li
                    key={name}
                    className={
                      hours
                        ? "rounded-control bg-accent-tint px-1 py-2 text-ink-900"
                        : "rounded-control bg-canvas px-1 py-2 text-ink-500"
                    }
                  >
                    <span className="block font-semibold">{name}</span>
                    {hours ? `${clock(hours.start)}–${clock(hours.end)}` : "Off"}
                  </li>
                );
              })}
            </ul>
            {t.availability.away.length === 0 ? (
              <p className="text-caption text-ink-500">No time off in the next four weeks.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {t.availability.away.map((a) => (
                  <li key={`${a.from}-${a.to}`} className="flex items-center gap-2 text-small">
                    <CalendarOff className="size-4 text-monitor" aria-hidden="true" />
                    Away {day(a.from)}
                    {a.to !== a.from && ` – ${day(a.to)}`} · {a.reason}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Patients">
            {t.patients.length === 0 ? (
              <p className="text-small text-ink-500">
                No patients accepted through onboarding yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {t.patients.map((p) => (
                  <li
                    key={`${p.id}-${p.discipline}`}
                    className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                  >
                    <span className="min-w-0">
                      {patientLinks ? (
                        <Link
                          href={`/care/${p.id}`}
                          className="block truncate text-small font-semibold"
                        >
                          {p.name}
                        </Link>
                      ) : (
                        <span className="block truncate text-small font-semibold">{p.name}</span>
                      )}
                      <span className="text-caption text-ink-500">Since {shortDate(p.since)}</span>
                    </span>
                    {p.discharged && <Tag tone="neutral">Discharged</Tag>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="History">
            {t.history.length === 0 ? (
              <p className="text-small text-ink-500">Nothing yet.</p>
            ) : (
              <ol className="flex flex-col gap-2.5">
                {t.history.map((h) => (
                  <li key={h.id} className="text-small">
                    <span className="block">{h.action}</span>
                    <span className="text-caption text-ink-500">{relativeTime(h.at)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
