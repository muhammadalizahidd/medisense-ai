"use client";

import { ArrowLeft, Check, ClipboardList, Copy, Hourglass } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AppCard } from "@/features/mobile/phone-frame";
import type { ReferralStatus } from "@/lib/live/referral";
import { relativeTime } from "@/lib/live/time";
import type { PublicReferralDto } from "@/lib/live/types";
import { cn } from "@/lib/cn";

export type SentReferral = { reference: string; appCode: string; appEmail: string };

/**
 * The referral form inside the patient app. It's the same form as /refer, sized for the phone,
 * so anyone can refer without an account, and patients can ask for another service.
 */
export function ReferralOverlay({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent: (sent: SentReferral) => void;
}) {
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string } & Partial<SentReferral>;
      if (data.type === "medisense-referral" && data.reference && data.appCode) {
        onSent({ reference: data.reference, appCode: data.appCode, appEmail: data.appEmail ?? "" });
      }
      if (data.type === "medisense-referral-close") onClose();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onClose, onSent]);

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-canvas">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-3 pt-12 pb-3">
        <button
          type="button"
          aria-label="Back"
          onClick={onClose}
          className="flex size-9 cursor-pointer items-center justify-center rounded-full hover:bg-canvas"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </button>
        <div>
          <p className="text-body font-semibold">Make a referral</p>
          <p className="text-caption text-ink-500">No account needed. Your draft is saved.</p>
        </div>
      </header>
      <iframe title="Referral form" src="/refer/app" className="min-h-0 w-full flex-1 border-0" />
    </div>
  );
}

/** Shown after a referral is sent from the app: the reference and the code to sign in with. */
export function SentCard({ sent, onUseCode }: { sent: SentReferral; onUseCode: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <AppCard>
      <p className="flex items-center gap-2 text-small font-semibold text-healthy">
        <Check className="size-4" aria-hidden="true" /> Referral {sent.reference} sent
      </p>
      <p className="mt-2 text-caption text-ink-700">
        Your app code. Keep it: it signs you in here.
      </p>
      <div className="mt-1 flex items-center gap-2">
        <span className="flex-1 font-mono text-h2 tracking-[0.2em]">{sent.appCode}</span>
        <Button
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(sent.appCode);
            setCopied(true);
          }}
        >
          <Copy className="size-3.5" aria-hidden="true" />
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <Button variant="primary" className="mt-3 w-full" onClick={onUseCode}>
        Follow my referral
      </Button>
    </AppCard>
  );
}

const path: { label: string; statuses: ReferralStatus[] }[] = [
  { label: "Received", statuses: ["Submitted"] },
  { label: "Intake review", statuses: ["Under Admin Review", "Needs Information"] },
  { label: "Clinical review", statuses: ["Clinical Triage"] },
  { label: "Funding and agreement", statuses: ["Funding Review"] },
  { label: "Accepted", statuses: ["Accepted", "Closed"] },
];

/** Progress of a referral that isn't accepted yet, seen with the email and app code. */
export function PendingReferral({
  referral: r,
  onRefresh,
  onBack,
}: {
  referral: PublicReferralDto;
  onRefresh: () => void;
  onBack: () => void;
}) {
  const at = path.findIndex((p) => p.statuses.includes(r.status));
  const stopped = ["Declined", "Withdrawn", "Waitlisted"].includes(r.status);
  return (
    <AppCard>
      <p className="flex items-center gap-2 text-caption font-semibold text-ink-500">
        <ClipboardList className="size-4 text-accent" aria-hidden="true" />
        Referral {r.reference}
      </p>
      <p role="status" className="mt-2 text-small font-semibold">
        {r.statusText}
      </p>
      <p className="mt-0.5 text-caption text-ink-500">Updated {relativeTime(r.updatedAt)}</p>
      {!stopped && (
        <ol className="mt-4 flex flex-col gap-2.5">
          {path.map((p, i) => {
            const done = i < at;
            const now = i === at;
            return (
              <li key={p.label} className="flex items-center gap-2.5 text-small">
                <span
                  className={cn(
                    "flex size-6 flex-none items-center justify-center rounded-full text-eyebrow font-bold",
                    done
                      ? "bg-accent-fill text-on-accent"
                      : now
                        ? "bg-ink-900 text-surface"
                        : "bg-canvas text-ink-500",
                  )}
                >
                  {done ? (
                    <Check className="size-3.5" strokeWidth={3} />
                  ) : now ? (
                    <Hourglass className="size-3" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className={cn(now ? "font-semibold" : "text-ink-700")}>{p.label}</span>
              </li>
            );
          })}
        </ol>
      )}
      {r.openRequest && (
        <p className="mt-4 rounded-control bg-monitor-bg px-3 py-2 text-caption">
          We&apos;ve asked for more information. Use the tracking link from your referral to answer.
        </p>
      )}
      <p className="mt-4 text-caption text-ink-700">
        When it&apos;s accepted, sign in again with the same email and code and choose a password.
      </p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={onRefresh}>
          Check again
        </Button>
        <Button size="sm" variant="ghost" onClick={onBack}>
          Back
        </Button>
      </div>
    </AppCard>
  );
}
