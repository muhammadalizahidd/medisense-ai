"use client";

import { CalendarCheck, Check, Mail, Send, UserRoundCheck } from "lucide-react";
import type { ReactNode } from "react";
import { RuleMark } from "@/components/ai/provenance";
import { Button, ButtonLink } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { relativeTime, slotLabel } from "@/lib/live/time";
import type { FirstVisitDto } from "@/lib/live/types";
import { cn } from "@/lib/cn";
import { needLabel, needTone, Panel } from "./bits";
import { MatchPicker } from "./match-picker";

type Step = { label: string; detail: string; state: "done" | "now" | "next"; icon: typeof Check };

/**
 * Intake to first visit in one place: once a referral is accepted, intake chooses the therapist
 * and first visit for each service and sends the welcome here, without leaving the referral.
 */
export function FirstVisitFlow({
  flow,
  mrn,
  clientId,
  busy,
  onSend,
  onChanged,
  waitlisted,
}: {
  flow: FirstVisitDto;
  mrn: string | null;
  clientId: string;
  busy: boolean;
  onSend: () => void;
  onChanged: () => void;
  /** Services held on the waitlist, shown below so they aren't forgotten. */
  waitlisted?: ReactNode;
}) {
  const total = flow.services.length;
  const requested = flow.services.filter((s) => s.request).length;
  const confirmed = flow.services.filter((s) => s.request === "accepted").length;
  const matched = total > 0 && requested === total;
  const welcomed = Boolean(flow.welcome);
  const ready = matched && welcomed;

  const steps: Step[] = [
    { label: "Accepted", detail: mrn ?? "Patient record created", state: "done", icon: Check },
    {
      label: "Therapist and first visit",
      detail: `${requested} of ${total} requested`,
      state: matched ? "done" : "now",
      icon: UserRoundCheck,
    },
    {
      label: "Welcome message",
      detail: welcomed ? "Sent" : "Not sent yet",
      state: welcomed ? "done" : matched ? "now" : "next",
      icon: Mail,
    },
    {
      label: "Ready for the first visit",
      detail: ready
        ? confirmed === total
          ? "Confirmed by the therapist"
          : "Waiting for the therapist to accept"
        : "After the steps above",
      state: ready ? "done" : "next",
      icon: CalendarCheck,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-label="Intake to first visit"
        className="overflow-hidden rounded-card border border-border bg-surface"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <p className="label-caps text-accent">Intake to first visit</p>
            <h2 className="mt-1 text-section font-semibold text-ink-900">
              {ready
                ? "Everything is arranged for the first visit"
                : matched
                  ? "Send the welcome message to finish"
                  : "Choose the therapist and first visit for each service"}
            </h2>
            <p className="mt-1 text-small text-ink-700">
              Accept, match, welcome: all from this referral. Nothing is booked until the therapist
              accepts, and every step is recorded in the audit trail.
            </p>
          </div>
          {mrn && (
            <div className="rounded-control border border-border bg-canvas px-4 py-2.5 text-right">
              <p className="label-caps text-ink-500">Medical record number</p>
              <p className="font-mono text-section font-semibold">{mrn}</p>
            </div>
          )}
        </div>
        <ol className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
          {steps.map((s, i) => (
            <li
              key={s.label}
              aria-current={s.state === "now" ? "step" : undefined}
              className={cn(
                "flex items-center gap-3 bg-surface px-5 py-4",
                s.state === "now" && "bg-accent-tint",
              )}
            >
              <span
                className={cn(
                  "flex size-9 flex-none items-center justify-center rounded-full",
                  s.state === "done"
                    ? "bg-accent-fill text-on-accent"
                    : s.state === "now"
                      ? "border-2 border-accent-fill bg-surface text-accent"
                      : "border border-border-strong text-ink-500",
                )}
              >
                {s.state === "done" ? (
                  <Check className="size-4" strokeWidth={3} aria-hidden="true" />
                ) : (
                  <s.icon className="size-4" aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block text-caption text-ink-500">Step {i + 1}</span>
                <span
                  className={cn(
                    "block text-small",
                    s.state === "next" ? "text-ink-500" : "font-semibold text-ink-900",
                  )}
                >
                  {s.label}
                </span>
                <span className="block truncate text-caption text-ink-500">{s.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          {flow.services.map((s) => (
            <Panel
              key={s.needId}
              title={s.support === s.discipline ? s.support : `${s.support} · ${s.discipline}`}
              action={<Tag tone={needTone[s.status]}>{needLabel[s.status]}</Tag>}
            >
              {s.status === "needs-therapist" && (
                <>
                  <p className="-mt-1 mb-4 flex flex-wrap items-center gap-2 text-small text-ink-700">
                    <RuleMark>Matching rules</RuleMark>
                    Ranked by eligibility, region, caseload and open times. Pick a time to send the
                    request.
                  </p>
                  <MatchPicker
                    clientId={clientId}
                    needId={s.needId}
                    discipline={s.discipline}
                    onSent={onChanged}
                  />
                </>
              )}
              {s.request === "pending" && s.firstVisit && (
                <p className="rounded-control border border-watch-bg bg-watch-bg px-4 py-3 text-small">
                  Waiting for <strong>{s.therapistName}</strong> to accept. First visit held for{" "}
                  <strong>{slotLabel(s.firstVisit)}</strong>.
                </p>
              )}
              {s.request === "accepted" && s.firstVisit && (
                <p className="rounded-control border border-healthy-bg bg-healthy-bg px-4 py-3 text-small">
                  <strong>{s.therapistName}</strong> accepted. First visit{" "}
                  <strong>{slotLabel(s.firstVisit)}</strong>.
                </p>
              )}
              {s.status === "assigned" && !s.request && (
                <p className="text-small text-ink-700">
                  {s.therapistName ?? "A therapist"} is already looking after this service.
                </p>
              )}
            </Panel>
          ))}
          {waitlisted}
        </div>

        <div className="flex flex-col gap-6 xl:sticky xl:top-24">
          <Panel
            title="Welcome message"
            action={
              flow.welcome ? (
                <Tag tone={welcomeTone(flow.welcome.state)}>{flow.welcome.state}</Tag>
              ) : (
                <RuleMark>Approved template</RuleMark>
              )
            }
          >
            {flow.welcome ? (
              <div className="flex flex-col gap-2 text-small">
                <p>
                  <span className="font-mono">{flow.welcome.ref}</span> · {flow.welcome.channel} to{" "}
                  {flow.welcome.recipient}
                </p>
                <p className="text-ink-500">
                  Sent by {flow.welcome.byName}, {relativeTime(flow.welcome.at)}. Follow it in
                  Operations → Messages.
                </p>
              </div>
            ) : (
              <>
                <dl className="mb-3 grid grid-cols-[72px_1fr] gap-x-3 gap-y-1 text-small">
                  <dt className="text-ink-500">To</dt>
                  <dd className="min-w-0 truncate">{flow.preview.recipient}</dd>
                  <dt className="text-ink-500">By</dt>
                  <dd>{flow.preview.channel}</dd>
                  <dt className="text-ink-500">Subject</dt>
                  <dd className="font-semibold">{flow.preview.subject}</dd>
                </dl>
                <p className="mb-4 rounded-control border border-border bg-canvas px-4 py-3 text-small leading-relaxed text-ink-900">
                  {flow.preview.body}
                </p>
                {!matched && (
                  <p className="mb-3 text-caption text-ink-500">
                    Choose the therapist first so the message includes the first visit.
                  </p>
                )}
                <Button
                  variant={matched ? "primary" : "secondary"}
                  disabled={busy}
                  onClick={onSend}
                >
                  <Send className="size-4" aria-hidden="true" />
                  Send welcome message
                </Button>
                <p className="mt-2 text-caption text-ink-500">
                  Consent, contact authority and quiet hours are checked before it goes.
                </p>
              </>
            )}
          </Panel>

          {ready && (
            <section
              aria-label="Ready for the first visit"
              className="rounded-card border border-healthy-bg bg-healthy-bg px-5 py-4"
            >
              <p className="flex items-center gap-2 text-section font-semibold text-healthy">
                <CalendarCheck className="size-4.5" aria-hidden="true" />
                Ready for the first visit
              </p>
              <p className="mt-1 text-small text-ink-900">
                {confirmed === total
                  ? "Every therapist has accepted and the patient has been welcomed."
                  : "The patient has been welcomed. You'll be notified when the therapist accepts."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <ButtonLink href={`/care/${clientId}`} size="sm" variant="primary">
                  Open patient record
                </ButtonLink>
                <ButtonLink href="/care/referrals" size="sm" variant="secondary">
                  Back to referrals
                </ButtonLink>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function welcomeTone(state: string) {
  if (state === "Delivered" || state === "Sent") return "healthy" as const;
  if (state === "Failed" || state === "Suppressed") return "over" as const;
  return "watch" as const;
}
