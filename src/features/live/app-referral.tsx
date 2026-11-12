"use client";

import {
  ArrowLeft,
  BellRing,
  Check,
  CircleAlert,
  ClipboardList,
  Copy,
  PauseCircle,
  RefreshCw,
} from "lucide-react";
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

/** Shown after a referral is sent from the app: the reference and the MRN to sign in with. */
export function SentCard({ sent, onUseCode }: { sent: SentReferral; onUseCode: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <AppCard>
      <p className="flex items-center gap-2 text-small font-semibold text-healthy">
        <Check className="size-4" aria-hidden="true" /> Referral {sent.reference} sent
      </p>
      <p className="mt-2 text-caption text-ink-700">
        Your MRN (medical record number). Keep it: it signs you in here.
      </p>
      <div className="mt-1 flex items-center gap-2">
        <span className="flex-1 font-mono text-section font-semibold tracking-wide">
          {sent.appCode}
        </span>
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

const path: { label: string; detail: string; statuses: ReferralStatus[] }[] = [
  {
    label: "Referral received",
    detail: "We have your referral and everything you sent with it.",
    statuses: ["Submitted"],
  },
  {
    label: "Intake review",
    detail: "Our intake team checks the details and funding. We'll ask if anything is missing.",
    statuses: ["Under Admin Review", "Needs Information"],
  },
  {
    label: "Clinical review",
    detail: "A senior clinician confirms we're the right fit and plans for a safe first visit.",
    statuses: ["Clinical Triage"],
  },
  {
    label: "Funding and agreement",
    detail: "We confirm funding and your service agreement.",
    statuses: ["Funding Review"],
  },
  {
    label: "Accepted",
    detail: "Your care team is set up and we match you with a therapist.",
    statuses: ["Accepted", "Closed"],
  },
];

const stoppedCopy: Partial<Record<ReferralStatus, { title: string; body: string }>> = {
  Waitlisted: {
    title: "On the waitlist",
    body: "We can't start just yet. Your referral keeps its place and we'll be in touch as soon as there's capacity.",
  },
  Declined: {
    title: "Not able to go ahead",
    body: "We're not able to provide this service. Your care team will contact you with the reason and other options.",
  },
  Withdrawn: {
    title: "Referral withdrawn",
    body: "This referral was withdrawn. You can send a new one at any time.",
  },
};

/** Progress of a referral that isn't accepted yet, seen with its MRN. */
export function PendingReferral({
  referral: r,
  onRefresh,
  onBack,
}: {
  referral: PublicReferralDto;
  onRefresh: () => void;
  onBack: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const at = Math.max(
    0,
    path.findIndex((p) => p.statuses.includes(r.status)),
  );
  const stopped = stoppedCopy[r.status];
  const accepted = r.status === "Accepted" || r.status === "Closed";
  const percent = accepted ? 100 : Math.round(((at + 0.5) / path.length) * 100);

  async function refresh() {
    setChecking(true);
    try {
      await onRefresh();
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <section className="overflow-hidden rounded-card border border-border bg-surface shadow-lift">
        <div className="px-4 pt-4 pb-4">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sunken px-2.5 py-1 font-mono text-label font-semibold text-ink-700">
              <ClipboardList className="size-3.5 text-accent" aria-hidden="true" />
              {r.reference}
            </span>
            <span className="text-caption text-ink-500">Updated {relativeTime(r.updatedAt)}</span>
          </div>
          {stopped ? (
            <div className="mt-4 flex gap-3">
              <span
                aria-hidden="true"
                className="flex size-10 flex-none items-center justify-center rounded-full bg-watch-bg text-watch"
              >
                <PauseCircle className="size-5" strokeWidth={1.75} />
              </span>
              <div>
                <h3 role="status" className="text-body font-semibold text-ink-900">
                  {stopped.title}
                </h3>
                <p className="mt-1 text-small text-ink-700">{stopped.body}</p>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-4 text-label font-semibold tracking-[0.1em] text-ink-500 uppercase">
                {accepted ? "Complete" : `Step ${at + 1} of ${path.length}`}
              </p>
              <h3 role="status" className="mt-1 type-display text-[24px] leading-7 text-ink-900">
                {path[at]!.label}
              </h3>
              <p className="mt-1.5 text-small text-ink-700">{r.statusText}</p>
              <div
                className="mt-4 h-2 overflow-hidden rounded-full bg-sunken"
                role="progressbar"
                aria-label="Referral progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <div
                  className="h-full rounded-full bg-accent-fill transition-[width] duration-500"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-label text-ink-500">
                <span>Received</span>
                <span>{percent}%</span>
                <span>Accepted</span>
              </div>
            </>
          )}
        </div>
        {r.openRequest && (
          <div className="flex gap-3 border-t border-border bg-watch-bg px-4 py-3">
            <CircleAlert className="mt-0.5 size-4.5 flex-none text-watch" aria-hidden="true" />
            <p className="text-caption leading-5 text-ink-900">
              <span className="block font-semibold">We need a little more information</span>
              Open the tracking link from your referral to answer. Your referral continues as soon
              as you do.
            </p>
          </div>
        )}
      </section>

      {!stopped && (
        <section className="rounded-card border border-border bg-surface px-4 pt-4 pb-1 shadow-lift">
          <h3 className="mb-3 text-label font-semibold tracking-[0.1em] text-ink-500 uppercase">
            Your referral&apos;s journey
          </h3>
          <ol>
            {path.map((step, i) => {
              const done = i < at || accepted;
              const now = i === at && !accepted;
              return (
                <li
                  key={step.label}
                  aria-current={now ? "step" : undefined}
                  className="relative flex gap-3 pb-4"
                >
                  {i < path.length - 1 && (
                    <i
                      aria-hidden="true"
                      className={cn(
                        "absolute top-7 bottom-0 left-[13px] w-0.5 rounded-full",
                        done ? "bg-accent-fill" : "bg-border",
                      )}
                    />
                  )}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "relative flex size-7 flex-none items-center justify-center rounded-full text-label font-bold",
                      done && "bg-accent-fill text-on-accent",
                      now &&
                        "bg-surface text-accent ring-2 ring-accent-fill ring-offset-2 ring-offset-surface",
                      !done && !now && "bg-sunken text-ink-500",
                    )}
                  >
                    {done ? (
                      <Check className="size-3.5" strokeWidth={3} />
                    ) : now ? (
                      <i className="size-2.5 animate-pulse rounded-full bg-accent-fill" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className={cn(
                          "text-small leading-6",
                          done || now ? "font-semibold text-ink-900" : "font-medium text-ink-500",
                        )}
                      >
                        {step.label}
                      </p>
                      <span
                        className={cn(
                          "text-label font-semibold",
                          done ? "text-healthy" : now ? "text-accent" : "text-ink-500",
                        )}
                      >
                        {done ? "Done" : now ? "In progress" : "Next"}
                      </span>
                    </div>
                    {now && (
                      <p className="mt-0.5 rounded-control bg-accent-tint px-3 py-2 text-caption leading-5 text-ink-700">
                        {step.detail}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <div className="flex gap-3 rounded-card bg-accent-tint px-4 py-3.5">
        <BellRing className="mt-0.5 size-4.5 flex-none text-accent" aria-hidden="true" />
        <p className="text-caption leading-5 text-ink-700">
          <span className="block font-semibold text-ink-900">
            {accepted ? "Your app is ready" : "Nothing to do right now"}
          </span>
          {accepted
            ? "Enter your MRN again to open your app and meet your therapist."
            : "When your referral is accepted, enter the same MRN again and your app opens."}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Button variant="primary" className="w-full" loading={checking} onClick={refresh}>
          {!checking && <RefreshCw className="size-4" aria-hidden="true" />}
          Check for updates
        </Button>
        <Button variant="ghost" className="w-full" onClick={onBack}>
          Use a different MRN
        </Button>
      </div>
    </div>
  );
}
