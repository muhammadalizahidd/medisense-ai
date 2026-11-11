"use client";

import { FileText, Receipt, Target } from "lucide-react";
import { AppCard, AppHeader } from "@/features/mobile/phone-frame";
import { money } from "@/lib/live/clinical";
import { shortDate } from "@/lib/live/time";
import type { ClientHomeDto } from "@/lib/live/types";
import { cn } from "@/lib/cn";
import { Skeleton } from "./bits";

/**
 * P04 and P05: only what the clinician approved or released (plans' goals, reports, discharge
 * advice) and the invoices issued. Clinical notes and risk records never appear here.
 */
export function PatientProgress({ data }: { data: ClientHomeDto | null }) {
  return (
    <>
      <AppHeader eyebrow="My care" title="Goals and reports" />
      <div className="relative -mt-4 flex flex-col gap-3 px-4 pb-4">
        {!data ? (
          <Skeleton className="h-40" />
        ) : (
          <>
            {data.dischargeAdvice && (
              <AppCard title="Advice from your therapist">
                <p className="text-small whitespace-pre-line text-ink-700">
                  {data.dischargeAdvice}
                </p>
              </AppCard>
            )}
            {data.progress.plans.length === 0 && data.progress.reports.length === 0 && (
              <AppCard>
                <p className="text-small text-ink-700">
                  Your goals appear here once your therapist has assessed you and agreed a plan with
                  you.
                </p>
              </AppCard>
            )}
            {data.progress.plans.map((p) => (
              <AppCard key={p.id} title={p.support}>
                <p className="-mt-1 mb-3 text-caption text-ink-500">
                  With {p.therapistName}
                  {p.reviewDate && ` · review ${shortDate(`${p.reviewDate}T00:00:00Z`)}`}
                </p>
                <ul className="flex flex-col gap-3">
                  {p.goals.map((g) => (
                    <li key={g.id} className="rounded-control bg-canvas p-3">
                      <p className="flex gap-2 text-small font-semibold">
                        <Target
                          className="mt-0.5 size-4 flex-none text-accent"
                          aria-hidden="true"
                        />
                        {g.description}
                      </p>
                      <div className="mt-2 flex items-center gap-2 text-caption">
                        <span className="text-ink-500">Started {g.baseline}</span>
                        <i aria-hidden="true" className="h-0.5 flex-1 rounded-full bg-border" />
                        <span
                          className={cn(
                            "font-semibold",
                            g.status === "Achieved" ? "text-healthy" : "text-ink-900",
                          )}
                        >
                          {g.status === "Achieved" ? "Achieved" : `Now ${g.current || g.baseline}`}
                        </span>
                        <i aria-hidden="true" className="h-0.5 flex-1 rounded-full bg-border" />
                        <span className="text-ink-500">Aim {g.target}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </AppCard>
            ))}
            {data.progress.reports.map((r) => (
              <AppCard key={r.id} title={`${r.support} report`}>
                <p className="flex gap-2 text-small whitespace-pre-line text-ink-700">
                  <FileText className="mt-0.5 size-4 flex-none text-accent" aria-hidden="true" />
                  {r.summary}
                </p>
                <p className="mt-2 text-caption text-ink-500">
                  From {r.byName}, {shortDate(r.at)}
                </p>
              </AppCard>
            ))}
            {data.invoices.length > 0 && (
              <AppCard title="Invoices">
                <ul className="divide-y divide-border">
                  {data.invoices.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <Receipt className="size-4 flex-none text-accent" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-small font-semibold">{i.number}</span>
                        <span className="block truncate text-caption text-ink-500">
                          To {i.payer}
                          {i.issuedAt && ` · ${shortDate(i.issuedAt)}`}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block text-small font-semibold">{money(i.total)}</span>
                        <span className="block text-caption text-ink-500">{i.status}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </AppCard>
            )}
          </>
        )}
      </div>
    </>
  );
}
