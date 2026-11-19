"use client";

import { CalendarPlus, ChevronRight, FileText, Landmark, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { MetricBand } from "@/components/ui/metric-band";
import { PageHeader } from "@/components/ui/page";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Tag } from "@/components/ui/tag";
import { useNow, useResource } from "@/lib/live/client";
import { relativeTime } from "@/lib/live/time";
import type { ClientStage, ClientSummaryDto, ReferralSummaryDto } from "@/lib/live/types";
import { participantStatuses } from "@/lib/live/participant";
import { TableFrame } from "@/components/ui/table-frame";
import { Avatar } from "@/components/ui/premium";
import { cn } from "@/lib/cn";
import { EmptyNote, ErrorNote, LiveBadge, needTone, Skeleton, StageTag } from "./bits";
import { statusTone } from "./participant-profile";
import { AssessmentCell, PlanCell, usePatientWork } from "./patient-actions";
import { BookVisitPanel } from "./quick-book";
import { Sheet } from "@/components/ui/sheet";

type Filter = "all" | ClientStage;

export function CareBoard() {
  const { data, error, loading, reload } = useResource<{ clients: ClientSummaryDto[] }>(
    "/api/care/clients",
    (event) => event.type === "care",
  );
  const referrals = useResource<{ referrals: ReferralSummaryDto[] }>(
    "/api/care/referrals",
    (event) => event.type === "care",
  );
  const waiting = (referrals.data?.referrals ?? []).filter(
    (r) => r.status === "Under Admin Review" || r.status === "Submitted",
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [service, setService] = useState("");
  const [clinician, setClinician] = useState("");
  const [incomplete, setIncomplete] = useState(false);
  const [booking, setBooking] = useState<ClientSummaryDto | null>(null);
  const work = usePatientWork();
  const now = useNow();
  const weekAgo = now === null ? Infinity : now - 7 * 86_400_000;
  const clients = data?.clients ?? [];
  const count = (stage: ClientStage) => clients.filter((c) => c.stage === stage).length;
  const services = [...new Set(clients.flatMap((c) => c.needs.map((n) => n.support)))].sort();
  const clinicians = [
    ...new Set(
      clients.flatMap((c) => c.needs.flatMap((n) => (n.therapistName ? [n.therapistName] : []))),
    ),
  ].sort();
  const digits = (v: string) => v.replace(/\D/g, "");
  const q = query.trim().toLowerCase();
  const rows = clients
    .filter((c) => filter === "all" || c.stage === filter)
    .filter((c) => !status || c.participantStatus === status)
    .filter((c) => !service || c.needs.some((n) => n.support === service))
    .filter((c) => !clinician || c.needs.some((n) => n.therapistName === clinician))
    .filter((c) => !incomplete || (c.completeness ?? 0) < 100)
    .filter(
      (c) =>
        !q ||
        `${c.name} ${c.mrn ?? ""} ${c.suburb} ${c.needs.map((n) => n.support).join(" ")}`
          .toLowerCase()
          .includes(q) ||
        (digits(q).length >= 4 && digits(c.phone ?? "").includes(digits(q))),
    );
  const filtering = Boolean(status || service || clinician || incomplete);

  return (
    <>
      <PageHeader
        eyebrow="Live care"
        title="Patients"
        description="Accepted referrals become patients with one service request per support. Choose a therapist for each by availability and follow the request until it's accepted."
        actions={
          <div className="flex items-center gap-3">
            <LiveBadge />
            {waiting.length > 0 && (
              <Link
                href="/care/referrals"
                title={
                  waiting[0]
                    ? `Latest: ${waiting[0].name}, ${relativeTime(waiting[0].createdAt)}`
                    : undefined
                }
                className="group inline-flex h-10 items-center gap-2 rounded-control border border-accent bg-accent-tint px-3.5 text-small font-semibold text-accent transition-all duration-(--duration-fast) hover:-translate-y-px hover:bg-accent-fill hover:text-on-accent hover:no-underline active:scale-95"
              >
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent-fill opacity-60 group-hover:bg-on-accent motion-reduce:animate-none" />
                  <span className="relative inline-flex size-2 rounded-full bg-accent-fill group-hover:bg-on-accent" />
                </span>
                {waiting.length} new referral{waiting.length === 1 ? "" : "s"} to review →
              </Link>
            )}
            <ButtonLink href="/care/referrals" variant="primary">
              <Plus className="size-4" aria-hidden="true" />
              New referral
            </ButtonLink>
          </div>
        }
      />

      <MetricBand
        size="stat-sm"
        label="Onboarding figures"
        metrics={[
          {
            label: "Needs a therapist",
            value: count("Needs a therapist"),
            tone: "over",
            flagged: count("Needs a therapist") > 0,
          },
          {
            label: "Waiting for therapist",
            value: count("Waiting for therapist"),
          },
          { label: "Active", value: count("Active") },
          {
            label: "Added this week",
            value: clients.filter((c) => new Date(c.createdAt).getTime() > weekAgo).length,
          },
          { label: "All patients", value: clients.length },
        ]}
      />

      <div className="mt-4 mb-4 flex flex-col gap-3 rounded-card border border-border bg-surface p-3 shadow-lift">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { id: "all", label: "All" },
              { id: "Needs a therapist", label: "Needs a therapist" },
              { id: "Waiting for therapist", label: "Waiting" },
              { id: "Active", label: "Active" },
            ]}
          />
          <label className="flex h-10 w-80 max-w-full items-center gap-2 rounded-control border border-border-strong bg-surface px-3 focus-within:shadow-focus">
            <Search className="size-4 text-ink-500" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search patients"
              placeholder="Search name, MRN, phone or therapy"
              className="min-w-0 flex-1 bg-transparent text-small outline-none placeholder:text-ink-500"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className="mr-1 text-caption font-semibold tracking-wide text-ink-500 uppercase">
            Filter
          </span>
          <div className="w-40 flex-none">
            <Select
              aria-label="Participant status"
              className="h-9"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Any status</option>
              {participantStatuses.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
          </div>
          <div className="w-56 flex-none">
            <Select
              aria-label="Service"
              className="h-9"
              value={service}
              onChange={(e) => setService(e.target.value)}
            >
              <option value="">Any service</option>
              {services.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
          </div>
          <div className="w-48 flex-none">
            <Select
              aria-label="Clinician"
              className="h-9"
              value={clinician}
              onChange={(e) => setClinician(e.target.value)}
            >
              <option value="">Any clinician</option>
              {clinicians.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
          </div>
          <button
            type="button"
            aria-pressed={incomplete}
            onClick={() => setIncomplete(!incomplete)}
            className={cn(
              "h-9 cursor-pointer rounded-control border px-3 text-small font-medium",
              incomplete
                ? "border-accent-fill bg-accent-tint text-accent"
                : "border-border-strong bg-surface text-ink-700 hover:bg-canvas",
            )}
          >
            Missing information
          </button>
          {filtering && (
            <button
              type="button"
              onClick={() => {
                setStatus("");
                setService("");
                setClinician("");
                setIncomplete(false);
              }}
              className="h-9 cursor-pointer px-2 text-small font-semibold text-accent"
            >
              Clear filters
            </button>
          )}
          <span className="ml-auto text-caption text-ink-500">
            Showing {rows.length} of {clients.length}
          </span>
        </div>
      </div>

      <TableFrame>
        {error && !data ? (
          <div className="p-6">
            <ErrorNote message={error} onRetry={reload} />
          </div>
        ) : loading && !data ? (
          <div className="flex flex-col gap-2 p-4" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyNote title={clients.length ? "No patients match." : "No patients yet."}>
              {clients.length ? (
                "Try another filter or search."
              ) : (
                <Link href="/care/referrals">Accept a referral to add the first patient</Link>
              )}
            </EmptyNote>
          </div>
        ) : (
          <table className="table-stack w-full text-left text-small md:min-w-200">
            <thead className="border-b border-border text-caption text-ink-500">
              <tr>
                <th className="px-3 py-3 font-medium">Patient</th>
                <th className="px-3 py-3 font-medium">Therapies</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Assessment</th>
                <th className="px-3 py-3 font-medium">Treatment plan</th>
                <th className="px-3 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((c) => (
                <tr
                  key={c.id}
                  className="transition-colors duration-(--duration-fast) hover:bg-canvas"
                >
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-3">
                      <Avatar name={c.name} size={40} kind="patient" src={c.photoUrl} />
                      <span className="min-w-0">
                        <Link href={`/care/${c.id}`} className="font-semibold text-ink-900">
                          {c.name}
                        </Link>
                        {c.mrn && (
                          <span className="block font-mono text-caption whitespace-nowrap text-ink-500">
                            {c.mrn}
                          </span>
                        )}
                        <span className="block text-caption text-ink-500">
                          {c.suburb} · {c.funding}
                        </span>
                        {c.completeness !== null && (
                          <span
                            className="mt-1 flex items-center gap-1.5"
                            title={
                              c.missing.length ? `Missing: ${c.missing.join(", ")}` : "Complete"
                            }
                          >
                            <span className="h-1 w-14 overflow-hidden rounded-full bg-sunken">
                              <span
                                className={cn(
                                  "block h-full rounded-full",
                                  c.completeness === 100 ? "bg-healthy-dot" : "bg-accent-fill",
                                )}
                                style={{ width: `${c.completeness}%` }}
                              />
                            </span>
                            <span className="text-label text-ink-500 num">
                              Profile {c.completeness}%
                            </span>
                          </span>
                        )}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="flex max-w-56 flex-col gap-1.5">
                      {c.needs.map((n) => (
                        <span key={n.id} className="flex items-start gap-2">
                          <i
                            aria-hidden="true"
                            className={cn(
                              "mt-1.5 size-2 flex-none rounded-full",
                              {
                                healthy: "bg-healthy-dot",
                                watch: "bg-watch-dot",
                                over: "bg-over-dot",
                                available: "bg-available-dot",
                              }[needTone[n.status] as string] ?? "bg-ink-400",
                            )}
                          />
                          <span className="min-w-0">
                            <span className="block text-small leading-snug font-medium text-ink-900">
                              {n.support}
                            </span>
                            <span className="block text-caption text-ink-500">
                              {n.therapistName ?? "Needs a therapist"}
                            </span>
                          </span>
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="flex flex-col items-start gap-1">
                      <Tag tone={statusTone[c.participantStatus]}>{c.participantStatus}</Tag>
                      {c.stage !== c.participantStatus && <StageTag stage={c.stage} />}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {work.ready ? (
                      <AssessmentCell rows={work.assessments.get(c.id)} />
                    ) : (
                      <Skeleton className="h-6 w-28" />
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {work.ready ? (
                      <PlanCell rows={work.plans.get(c.id)} />
                    ) : (
                      <Skeleton className="h-6 w-28" />
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className="flex items-center justify-end gap-1">
                      {c.needs.some((n) => n.therapistName) && (
                        <RowAction
                          label={`Book a visit for ${c.name}`}
                          tip="Book a visit"
                          tone="accent"
                          onClick={() => setBooking(c)}
                        >
                          <CalendarPlus className="size-4" aria-hidden="true" />
                        </RowAction>
                      )}
                      <RowAction
                        label={`Clinical record for ${c.name}`}
                        tip="Clinical record"
                        tone="available"
                        href={`/care/records/${c.id}`}
                      >
                        <FileText className="size-4" aria-hidden="true" />
                      </RowAction>
                      <RowAction
                        label={`Funding for ${c.name}`}
                        tip="Funding"
                        tone="watch"
                        href={`/care/funding/${c.id}`}
                      >
                        <Landmark className="size-4" aria-hidden="true" />
                      </RowAction>
                      <Link
                        href={`/care/${c.id}`}
                        aria-label={`Open ${c.name}'s record`}
                        className="group/action relative ml-1 inline-flex size-8 items-center justify-center rounded-control bg-accent-fill text-on-accent transition-all duration-140 hover:-translate-y-px hover:bg-accent-fill-hover hover:text-on-accent hover:no-underline hover:shadow-lift active:scale-95"
                      >
                        <ChevronRight
                          className="size-4 transition-transform duration-140 group-hover/action:translate-x-0.5"
                          aria-hidden="true"
                        />
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute right-0 bottom-full z-20 mb-1.5 translate-y-1 rounded-tag bg-ink-900 px-2 py-1 text-label font-semibold whitespace-nowrap text-page opacity-0 shadow-overlay transition-all duration-140 group-hover/action:translate-y-0 group-hover/action:opacity-100"
                        >
                          Open record
                        </span>
                      </Link>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableFrame>
      {booking && (
        <Sheet
          title={`Book a visit for ${booking.name}`}
          description="With their own clinician, at a real free time."
          onClose={() => setBooking(null)}
        >
          <BookVisitPanel
            patient={{
              id: booking.id,
              name: booking.name,
              mrn: booking.mrn,
              suburb: booking.suburb,
              phone: null,
            }}
            onDone={reload}
          />
        </Sheet>
      )}
    </>
  );
}

/** An icon button in a table row; a link when it goes somewhere. */
const actionTone = {
  accent: "bg-accent-tint text-accent hover:bg-accent-fill hover:text-on-accent",
  available: "bg-available-bg text-available hover:ring-available-dot",
  watch: "bg-watch-bg text-watch hover:ring-watch-dot",
} as const;

function RowAction({
  label,
  tip,
  tone,
  href,
  onClick,
  children,
}: {
  label: string;
  /** The short name shown above the icon on hover. */
  tip: string;
  tone: keyof typeof actionTone;
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const cls = cn(
    "group/action relative inline-flex size-8 cursor-pointer items-center justify-center rounded-control ring-1 ring-transparent transition-all duration-140 hover:-translate-y-px hover:no-underline hover:shadow-lift active:translate-y-0 active:scale-95",
    actionTone[tone],
  );
  const inner = (
    <>
      {children}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 translate-y-1 rounded-tag bg-ink-900 px-2 py-1 text-label font-semibold whitespace-nowrap text-page opacity-0 shadow-overlay transition-all duration-140 group-hover/action:translate-y-0 group-hover/action:opacity-100 group-focus-visible/action:opacity-100"
      >
        {tip}
      </span>
    </>
  );
  return href ? (
    <Link href={href} aria-label={label} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" aria-label={label} onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}
