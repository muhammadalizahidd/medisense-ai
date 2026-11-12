"use client";

import { ArrowRight, LogIn } from "lucide-react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { colour } from "@/components/charts/chart-kit";
import { StackedColumns } from "@/components/charts/stacked-columns";
import { useResource, useSession } from "@/lib/live/client";
import { relativeTime, shortDate } from "@/lib/live/time";
import type { LiveOverviewDto } from "@/lib/live/types";
import { cn } from "@/lib/cn";
import { ErrorNote, LiveBadge, Skeleton } from "./bits";

/**
 * The Overview's live figures, read from the database rather than sample data. Admins see them;
 * anyone else is invited to sign in.
 */
export function LiveCarePanel() {
  const { user, loading } = useSession();
  if (loading) return <Skeleton className="h-40" />;
  if (user?.role !== "admin") {
    return (
      <section
        aria-label="Live care"
        className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-dashed border-border-strong bg-surface px-5 py-4"
      >
        <p className="text-small text-ink-700">
          <strong className="text-ink-900">Live care figures</strong> show onboarding, visits and
          cancellations straight from the database. Sign in with an admin account to see them.
        </p>
        <ButtonLink href="/login?next=/" size="sm">
          <LogIn className="size-3.5" aria-hidden="true" />
          Sign in
        </ButtonLink>
      </section>
    );
  }
  return <LiveFigures />;
}

function Stat({
  label,
  value,
  caption,
  tone,
  href,
}: {
  label: string;
  value: number | string;
  caption: string;
  tone?: "over" | "monitor";
  href?: string;
}) {
  const body = (
    <>
      <span className="text-caption font-medium text-ink-700">{label}</span>
      <span
        className={cn(
          "type-display text-h1-compact font-semibold",
          tone === "over" && "text-over",
          tone === "monitor" && "text-monitor",
        )}
      >
        {value}
      </span>
      <span className="text-caption text-ink-500">{caption}</span>
    </>
  );
  const box =
    "flex min-w-0 flex-col gap-1 rounded-control border border-border bg-surface px-4 py-3";
  return href ? (
    <Link
      href={href}
      className={cn(box, "text-ink-900 hover:border-border-strong hover:no-underline")}
    >
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}

function LiveFigures() {
  const { data, error, reload } = useResource<LiveOverviewDto>(
    "/api/care/overview",
    (e) => e.type === "care",
  );
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-56" />;
  const { onboarding, visits, cancellations, team } = data;
  const utilisation = team.capacity ? Math.round((team.activeClients / team.capacity) * 100) : 0;

  return (
    <section aria-label="Live care" className="rounded-card border border-border bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-section font-semibold">Live care</h2>
          <LiveBadge />
        </div>
        <Link href="/care" className="inline-flex items-center gap-1 text-caption font-medium">
          Patient onboarding
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      <div className="grid gap-5 xl:grid-cols-12">
        <div className="grid grid-cols-2 gap-3 xl:col-span-7">
          <Stat
            label="Need a therapist"
            value={onboarding.needsTherapist}
            caption={`${onboarding.active} patients fully matched`}
            tone={onboarding.needsTherapist ? "over" : undefined}
            href="/care"
          />
          <Stat
            label="Waiting for a therapist's reply"
            value={onboarding.waiting}
            caption={
              onboarding.oldestPendingAt
                ? `Oldest sent ${relativeTime(onboarding.oldestPendingAt)}`
                : "No requests waiting"
            }
            tone={onboarding.waiting ? "monitor" : undefined}
            href="/care"
          />
          <Stat
            label="Visits today"
            value={visits.today}
            caption={`${visits.week.reduce((s, d) => s + d.booked, 0)} booked this week`}
          />
          <Stat
            label="Missed visits, 30 days"
            value={cancellations.late + cancellations.noShows}
            caption={`${cancellations.late} late cancellations · ${cancellations.noShows} did not attend · ${cancellations.total} cancellations in all`}
            tone={cancellations.late + cancellations.noShows ? "over" : undefined}
          />
        </div>
        <div className="flex min-w-0 flex-col xl:col-span-5">
          <p className="mb-1 text-caption font-medium text-ink-700">This week&apos;s visits</p>
          <StackedColumns
            label="Visits booked and cancelled this week"
            height={150}
            xKey="day"
            data={visits.week.map((d) => ({
              day: shortDate(d.day).split(" ")[0] ?? "",
              booked: d.booked,
              cancelled: d.cancelled,
            }))}
            series={[
              { key: "booked", label: "Booked", colour: colour.series1 },
              { key: "cancelled", label: "Cancelled", colour: colour.over },
            ]}
          />
          <div className="mt-3 border-t border-border pt-3">
            <div className="flex items-baseline justify-between text-caption">
              <span className="font-medium text-ink-700">Team capacity</span>
              <span className="text-ink-500">
                {team.activeClients} of {team.capacity} places · {team.therapists} therapists ·{" "}
                {team.atRisk} At Risk
              </span>
            </div>
            <span
              role="img"
              aria-label={`${utilisation}% of team capacity in use`}
              className="mt-2 block h-2.5 overflow-hidden rounded-full bg-canvas"
            >
              <i
                className="block h-full rounded-full bg-accent-fill"
                style={{ width: `${Math.min(utilisation, 100)}%` }}
              />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
