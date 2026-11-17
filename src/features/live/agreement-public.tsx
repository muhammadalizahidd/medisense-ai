"use client";

import { CheckCircle2, FileSignature, MessageSquareText, ShieldCheck, XCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { api, useResource } from "@/lib/live/client";
import { cn } from "@/lib/cn";
import { AgreementDocument, type ReadableAgreement } from "./agreement-document";
import { ErrorNote, Skeleton } from "./bits";
import { TextArea, TextField, Tick } from "./form-bits";
import { dayLabel } from "./funding-bits";

type Public = ReadableAgreement & {
  status: string;
  acceptance: { name: string; role: string; at: string } | null;
  changeRequest: { note: string; at: string } | null;
  declined: { at: string; outcome: string } | null;
};

/** The signatory's secure link: read, then accept, ask for a change, or decline (AT-18). */
export function AgreementPublic({ token }: { token: string }) {
  const { data, error, loading, reload } = useResource<{ agreement: Public }>(
    `/api/agreement/${token}`,
  );
  const [mode, setMode] = useState<"accept" | "change" | "decline" | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [read, setRead] = useState(false);
  const [authority, setAuthority] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [answered, setAnswered] = useState<Public | null>(null);

  if (error && !data) {
    return (
      <div className="mx-auto max-w-xl py-16">
        <ErrorNote message={error} />
      </div>
    );
  }
  if (loading || !data) return <Skeleton className="mx-auto mt-10 h-[600px] max-w-4xl" />;
  const a = answered ?? data.agreement;
  const open = a.status === "Issued" || a.status === "Viewed";

  async function send(body: unknown) {
    setBusy(true);
    setErr("");
    try {
      const res = await api<{ agreement: Public }>(`/api/agreement/${token}`, { body });
      setAnswered(res.agreement);
      setMode(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-card bg-accent-fill text-on-accent">
          <FileSignature className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-label font-semibold tracking-[0.12em] text-accent uppercase">
            Medisense
          </p>
          <p className="text-small text-ink-700">
            Hello {a.signatory.name}. Please read your service agreement, then choose what
            you&apos;d like to do.
          </p>
        </div>
        <Tag
          tone={
            a.status === "Signed"
              ? "healthy"
              : a.status === "Declined"
                ? "over"
                : open
                  ? "available"
                  : "watch"
          }
        >
          {a.status}
        </Tag>
      </div>

      {!open && (
        <section
          className={cn(
            "bubble-in flex items-start gap-3 rounded-card border px-5 py-4",
            a.status === "Signed"
              ? "border-healthy-bg bg-healthy-bg"
              : a.status === "Declined"
                ? "border-over-bg bg-over-bg"
                : "border-watch-bg bg-watch-bg",
          )}
        >
          {a.status === "Signed" ? (
            <CheckCircle2 className="mt-0.5 size-5 flex-none text-healthy" aria-hidden="true" />
          ) : a.status === "Declined" ? (
            <XCircle className="mt-0.5 size-5 flex-none text-over" aria-hidden="true" />
          ) : (
            <MessageSquareText className="mt-0.5 size-5 flex-none text-watch" aria-hidden="true" />
          )}
          <div className="text-small text-ink-900">
            {a.status === "Signed" && a.acceptance && (
              <p>
                <strong>Accepted</strong> by {a.acceptance.name} ({a.acceptance.role}) on{" "}
                {dayLabel(a.acceptance.at)}. This version is now fixed; any change will be a new
                version for you to review.
              </p>
            )}
            {a.status === "Changes Requested" && a.changeRequest && (
              <p>
                <strong>Thanks, we&apos;ve got your request:</strong> &ldquo;{a.changeRequest.note}
                &rdquo;. We&apos;ll send you an updated version.
              </p>
            )}
            {a.status === "Declined" && a.declined && (
              <p>
                <strong>You declined this agreement.</strong> {a.declined.outcome}
              </p>
            )}
            {!["Signed", "Changes Requested", "Declined"].includes(a.status) && (
              <p>This agreement is {a.status.toLowerCase()}.</p>
            )}
          </div>
        </section>
      )}

      <AgreementDocument a={a} />

      {open && (
        <section className="overflow-hidden rounded-card border border-border bg-surface shadow-lift">
          <div className="grid gap-px bg-border sm:grid-cols-3">
            {(
              [
                ["accept", "Accept and sign", CheckCircle2],
                ["change", "Ask for a change", MessageSquareText],
                ["decline", "Decline", XCircle],
              ] as const
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-2 bg-surface px-4 py-4 text-small font-semibold transition-colors",
                  mode === m
                    ? m === "decline"
                      ? "bg-over-bg text-over"
                      : "bg-accent-tint text-accent"
                    : "text-ink-700 hover:bg-canvas",
                )}
              >
                <Icon className="size-4" aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
          {mode && (
            <div className="bubble-in flex flex-col gap-4 border-t border-border px-6 py-5">
              {mode === "accept" && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      label="Type your full name"
                      value={name}
                      onChange={setName}
                      hint={`As recorded: ${a.signatory.name}`}
                      required
                    />
                    <TextField
                      label="You're signing as"
                      value={role}
                      onChange={setRole}
                      placeholder={a.signatory.authority}
                      required
                    />
                  </div>
                  <Tick checked={read} onChange={setRead}>
                    I&apos;ve read this agreement, including the prices and cancellation terms.
                  </Tick>
                  <Tick checked={authority} onChange={setAuthority}>
                    I&apos;m{" "}
                    {a.signatory.authority === "Participant (self)"
                      ? "the participant"
                      : `authorised to sign as ${a.signatory.authority.toLowerCase()}`}
                    .
                  </Tick>
                  <p className="flex items-center gap-2 text-caption text-ink-500">
                    <ShieldCheck className="size-3.5" aria-hidden="true" /> Your name, role, the
                    time and this version number are recorded. This prototype simulates e-signature.
                  </p>
                  <Button
                    variant="primary"
                    disabled={
                      busy ||
                      name.trim().length < 2 ||
                      role.trim().length < 2 ||
                      !read ||
                      !authority
                    }
                    onClick={() =>
                      send({
                        action: "accept",
                        name,
                        role,
                        confirmAuthority: authority,
                        confirmRead: read,
                      })
                    }
                  >
                    {busy ? "Saving…" : "Accept and sign"}
                  </Button>
                </>
              )}
              {mode === "change" && (
                <>
                  <TextArea
                    label="What would you like changed?"
                    value={note}
                    onChange={setNote}
                    rows={4}
                    placeholder="For example: monthly visits instead of fortnightly"
                    required
                  />
                  <p className="text-caption text-ink-500">
                    This version stays unsigned. We&apos;ll prepare an updated version for you.
                  </p>
                  <Button
                    variant="primary"
                    disabled={busy || note.trim().length < 5}
                    onClick={() => send({ action: "change", note })}
                  >
                    Send my request
                  </Button>
                </>
              )}
              {mode === "decline" && (
                <>
                  <TextArea
                    label="Would you tell us why? (optional)"
                    value={note}
                    onChange={setNote}
                    rows={3}
                  />
                  <p className="text-caption text-ink-500">
                    A written agreement isn&apos;t legally required for these supports. If you
                    decline, we&apos;ll contact you about the next steps under Medisense&apos;s
                    policy.
                  </p>
                  <Button
                    variant="soft-danger"
                    disabled={busy}
                    onClick={() => send({ action: "decline", reason: note })}
                  >
                    Decline this agreement
                  </Button>
                </>
              )}
              {err && (
                <p className="rounded-control bg-over-bg px-3 py-2 text-small text-over">{err}</p>
              )}
            </div>
          )}
        </section>
      )}
      <button type="button" onClick={reload} className="sr-only">
        Refresh
      </button>
    </div>
  );
}
