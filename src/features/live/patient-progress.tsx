"use client";

import { FileSignature, FileText, Receipt, Target } from "lucide-react";
import { useState } from "react";
import {
  AppCard,
  AppEmpty,
  AppHeader,
  AppSection,
  AppWebView,
} from "@/features/mobile/phone-frame";
import { api, useResource } from "@/lib/live/client";
import { money } from "@/lib/live/clinical";
import { shortDate } from "@/lib/live/time";
import type { ClientHomeDto } from "@/lib/live/types";
import { cn } from "@/lib/cn";
import { Skeleton } from "./bits";

/**
 * P04 and P05: only what the clinician approved or released (plans' goals, reports, discharge
 * advice) and the invoices issued. Clinical notes and risk records never appear here.
 */
export function PatientProgress({
  data,
  bare = false,
}: {
  data: ClientHomeDto | null;
  bare?: boolean;
}) {
  return (
    <>
      {!bare && <AppHeader eyebrow="My care" title="Your progress" />}
      <div className={bare ? "" : "px-4 pb-4"}>
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
            <AppSection title="Goals and reports" />
            {data.progress.plans.length === 0 && data.progress.reports.length === 0 && (
              <AppEmpty icon={Target} title="No goals or reports yet">
                Your goals appear here once your therapist has assessed you and agreed a plan with
                you.
              </AppEmpty>
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
            <MyAgreements />
            <AppSection title="Invoices" />
            {data.invoices.length === 0 ? (
              <AppEmpty icon={Receipt} title="No invoices yet" compact>
                Invoices for your visits will be listed here once they&apos;re issued.
              </AppEmpty>
            ) : (
              <AppCard>
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

type MyAgreement = {
  id: string;
  ref: string;
  version: number;
  status: string;
  start: string;
  end: string;
  services: string[];
  total: number;
  signedAt: string | null;
  canRespond: boolean;
};

/** AT-30: the participant's own issued and signed service agreements, opened securely. */
function MyAgreements() {
  const { data } = useResource<{ agreements: MyAgreement[] }>(
    "/api/me/agreements",
    (e) => e.type === "care",
  );
  const [opening, setOpening] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const list = data?.agreements ?? [];
  async function open(id: string) {
    setOpening(id);
    try {
      const res = await api<{ link: string }>(`/api/me/agreements/${id}`, { body: {} });
      setViewing(res.link);
    } finally {
      setOpening(null);
    }
  }
  return (
    <>
      {viewing && (
        <AppWebView title="Service agreement" href={viewing} onClose={() => setViewing(null)} />
      )}
      <AppSection title="Service agreements" />
      {list.length === 0 ? (
        <AppEmpty icon={FileSignature} title="No agreements yet" compact>
          When Medisense sends your service agreement, you can read and accept it here.
        </AppEmpty>
      ) : (
        <AppCard>
          <ul className="divide-y divide-border">
            {list.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <FileSignature className="size-4 flex-none text-accent" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-small font-semibold">
                    {a.ref} · v{a.version}
                  </span>
                  <span className="block truncate text-caption text-ink-500">
                    {a.services.join(", ")} · {money(a.total)} estimate
                  </span>
                  <span
                    className={cn(
                      "block text-caption font-semibold",
                      a.canRespond
                        ? "text-accent"
                        : a.status === "Signed"
                          ? "text-healthy"
                          : "text-ink-500",
                    )}
                  >
                    {a.canRespond
                      ? "Waiting for you"
                      : a.status === "Signed" && a.signedAt
                        ? `Signed ${shortDate(a.signedAt)}`
                        : a.status}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={opening === a.id}
                  onClick={() => open(a.id)}
                  className={cn(
                    "h-8 flex-none cursor-pointer rounded-control px-3 text-caption font-semibold transition-colors",
                    a.canRespond ? "bg-accent-fill text-on-accent" : "bg-accent-tint text-accent",
                  )}
                >
                  {a.canRespond ? "Review" : "View"}
                </button>
              </li>
            ))}
          </ul>
        </AppCard>
      )}
    </>
  );
}
