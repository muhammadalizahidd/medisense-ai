"use client";

import {
  ArrowUpRight,
  CalendarPlus,
  ClipboardList,
  FileText,
  Landmark,
  Target,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { statusTone as assessTone, type AssessRow } from "@/lib/live/assess";
import { useResource } from "@/lib/live/client";
import { shortDate } from "@/lib/live/time";
import { stateTone, type PlanRow } from "@/lib/live/tplan";
import { EmptyNote, Panel, Skeleton } from "./bits";

export type PatientWork = {
  assessments: Map<string, AssessRow[]>;
  plans: Map<string, PlanRow[]>;
  ready: boolean;
};

function group<T extends { clientId: string; updatedAt: string }>(rows: T[]) {
  const by = new Map<string, T[]>();
  for (const r of [...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    by.set(r.clientId, [...(by.get(r.clientId) ?? []), r]);
  }
  return by;
}

/** Every patient's assessments and treatment plans, newest first, keyed by patient. */
export function usePatientWork(clientId?: string): PatientWork {
  const q = clientId ? `?clientId=${clientId}` : "";
  const a = useResource<{ rows: AssessRow[] }>(
    `/api/care/assessments${q}`,
    (e) => e.type === "care",
  );
  const p = useResource<{ rows: PlanRow[] }>(`/api/care/plans${q}`, (e) => e.type === "care");
  return {
    assessments: group(a.data?.rows ?? []),
    plans: group(p.data?.rows ?? []),
    ready: Boolean(a.data && p.data),
  };
}

/** A small "open it" link that names its status, for tables. */
export function WorkLink({
  href,
  label,
  tone,
  icon: Icon,
}: {
  href: string | null;
  label: string;
  tone: "healthy" | "watch" | "over" | "available" | "neutral";
  icon: LucideIcon;
}) {
  const body = (
    <>
      <Icon className="size-3.5 flex-none" aria-hidden="true" />
      <span className="truncate">{label}</span>
      {href && (
        <ArrowUpRight
          className="-ml-0.5 size-3 flex-none opacity-0 transition-all duration-140 group-hover:translate-x-0.5 group-hover:opacity-100"
          aria-hidden="true"
        />
      )}
    </>
  );
  if (!href) {
    return (
      <span className="inline-flex max-w-40 items-center gap-1.5 rounded-tag border border-dashed border-border-strong px-2 py-1 text-caption text-ink-500">
        {body}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={cn(
        // Keeps its colours on hover (the status stays readable) and lifts with a ring instead.
        "group inline-flex max-w-44 items-center gap-1.5 rounded-tag px-2 py-1 text-caption font-semibold ring-1 ring-transparent transition-all duration-140 hover:-translate-y-px hover:no-underline hover:shadow-lift active:translate-y-0",
        {
          healthy: "bg-healthy-bg text-healthy hover:text-healthy hover:ring-healthy-dot",
          watch: "bg-watch-bg text-watch hover:text-watch hover:ring-watch-dot",
          over: "bg-over-bg text-over hover:text-over hover:ring-over-dot",
          available: "bg-available-bg text-available hover:text-available hover:ring-available-dot",
          neutral: "bg-sunken text-ink-700 hover:text-ink-900 hover:ring-border-strong",
        }[tone],
      )}
    >
      {body}
    </Link>
  );
}

/** The patient's latest assessment, as a table cell that opens it. */
export function AssessmentCell({ rows }: { rows: AssessRow[] | undefined }) {
  const a = rows?.[0];
  if (!a) return <WorkLink href={null} label="None yet" tone="neutral" icon={ClipboardList} />;
  return (
    <WorkLink
      href={`/care/assessments/${a.id}`}
      label={`${a.status} · ${a.progress}%`}
      tone={assessTone[a.status] ?? "neutral"}
      icon={ClipboardList}
    />
  );
}

/** The patient's current treatment plan, as a table cell that opens it. */
export function PlanCell({ rows }: { rows: PlanRow[] | undefined }) {
  const p = rows?.find((r) => r.id) ?? rows?.[0];
  if (!p) return <WorkLink href={null} label="None yet" tone="neutral" icon={Target} />;
  return (
    <WorkLink
      href={p.id ? `/care/plans/${p.id}` : null}
      label={p.id ? `${p.state} · ${p.achieved}/${p.goals}` : "Not started"}
      tone={stateTone[p.state] ?? "neutral"}
      icon={Target}
    />
  );
}

/** One row of buttons for everything that can be done for a patient. */
export function PatientQuickActions({
  clientId,
  work,
  onBook,
}: {
  clientId: string;
  work: PatientWork;
  onBook: () => void;
}) {
  const a = work.assessments.get(clientId)?.[0];
  const p = work.plans.get(clientId)?.find((r) => r.id);
  const items: {
    label: string;
    detail: string;
    icon: LucideIcon;
    href?: string;
    go?: () => void;
  }[] = [
    { label: "Book a visit", detail: "Real free times", icon: CalendarPlus, go: onBook },
    {
      label: "Assessment",
      detail: a ? `${a.status} · ${a.progress}%` : "None yet",
      icon: ClipboardList,
      href: a ? `/care/assessments/${a.id}` : undefined,
    },
    {
      label: "Treatment plan",
      detail: p ? `${p.state} · v${p.version}` : "Not started",
      icon: Target,
      href: p?.id ? `/care/plans/${p.id}` : undefined,
    },
    {
      label: "Clinical record",
      detail: "Notes and documents",
      icon: FileText,
      href: `/care/records/${clientId}`,
    },
    {
      label: "Funding",
      detail: "Plan and agreement",
      icon: Landmark,
      href: `/care/funding/${clientId}`,
    },
  ];
  return (
    <section
      aria-label="Quick actions"
      className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5"
    >
      {items.map(({ label, detail, icon: Icon, href, go }) => {
        const inner = (
          <>
            <span className="flex size-9 flex-none items-center justify-center rounded-control bg-accent-tint text-accent">
              <Icon className="size-4.5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-small font-semibold text-ink-900">{label}</span>
              <span className="block truncate text-caption text-ink-500">
                {work.ready || !["Assessment", "Treatment plan"].includes(label)
                  ? detail
                  : "Loading…"}
              </span>
            </span>
          </>
        );
        const cls =
          "flex items-center gap-3 rounded-card border border-border bg-surface p-3 text-left transition-shadow duration-140 hover:shadow-lift hover:no-underline";
        if (go) {
          return (
            <button key={label} type="button" onClick={go} className={cn(cls, "cursor-pointer")}>
              {inner}
            </button>
          );
        }
        return href ? (
          <Link key={label} href={href} className={cls}>
            {inner}
          </Link>
        ) : (
          <span key={label} className={cn(cls, "opacity-60 hover:shadow-none")}>
            {inner}
          </span>
        );
      })}
    </section>
  );
}

/** This patient's treatment plans, each opening its own plan. */
export function PlansTab({
  rows,
  base = "/care/plans",
}: {
  rows: PlanRow[] | null;
  base?: "/care/plans" | "/therapist/plans";
}) {
  if (!rows) return <Skeleton className="h-48" />;
  if (rows.length === 0) {
    return (
      <EmptyNote title="No treatment plan yet">
        A plan starts once a service is accepted and the assessment is complete.
      </EmptyNote>
    );
  }
  return (
    <Panel title="Treatment plans">
      <ul className="flex flex-col divide-y divide-border">
        {rows.map((r) => {
          const inner = (
            <>
              <span className="flex size-10 flex-none items-center justify-center rounded-control bg-accent-tint text-accent">
                <Target className="size-4.5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-small font-semibold text-ink-900 group-hover:text-accent">
                  {r.support}
                </span>
                <span className="block truncate text-caption text-ink-500">
                  {r.id ? (
                    <span className="font-mono">
                      {r.ref} · v{r.version} ·{" "}
                    </span>
                  ) : null}
                  {r.clinician}
                </span>
              </span>
              <span className="w-32 flex-none text-caption text-ink-700">
                {r.goals ? `${r.achieved} of ${r.goals} goals achieved` : "No goals yet"}
              </span>
              <span
                className={cn(
                  "w-32 flex-none text-caption",
                  r.reviewOverdue ? "font-semibold text-over" : "text-ink-500",
                )}
              >
                {r.reviewDate
                  ? `Review ${shortDate(`${r.reviewDate}T00:00:00Z`)}`
                  : "No review set"}
              </span>
              <Tag tone={stateTone[r.state]}>{r.id ? r.state : "Not started"}</Tag>
            </>
          );
          return (
            <li key={r.id ?? `${r.clientId}-${r.needId}`}>
              {r.id ? (
                <Link
                  href={`${base}/${r.id}`}
                  className="group flex flex-wrap items-center gap-x-4 gap-y-2 py-3 hover:no-underline"
                >
                  {inner}
                </Link>
              ) : (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
