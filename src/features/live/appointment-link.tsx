"use client";

import { CalendarCheck, Check, Clock, MapPin, MonitorPlay, UserRound } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { useResource } from "@/lib/live/client";
import { ErrorNote, Skeleton } from "./bits";
import { TextArea } from "./form-bits";

type Appointment = {
  ref: string;
  when: string;
  start: string;
  end: string;
  timezone: string;
  first: string;
  therapist: string;
  service: string;
  mode: string;
  place: string;
  status: string;
  confirmed: boolean;
  changeRequested: boolean;
};

/** The participant's view of one visit: safe details only, confirm or ask for a change. */
export function AppointmentLink({ token }: { token: string }) {
  const url = `/api/appointment/${encodeURIComponent(token)}`;
  const { data, error, reload } = useResource<{ appointment: Appointment }>(url);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setFail(null);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(json.error ?? "That didn't work.");
      setAsking(false);
      reload();
    } catch (e) {
      setFail(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-96 max-w-160" />;
  const a = data.appointment;
  const rows = [
    { icon: Clock, label: "When", value: `${a.when} (${a.timezone})` },
    { icon: UserRound, label: "With", value: `${a.therapist} · ${a.service}` },
    { icon: a.mode === "Video visit" ? MonitorPlay : MapPin, label: a.mode, value: a.place },
  ];
  return (
    <div className="max-w-160 overflow-hidden rounded-card border border-border bg-surface shadow-lift">
      <div className="flex items-start gap-4 border-b border-border p-6">
        <span className="flex size-12 flex-none items-center justify-center rounded-full bg-accent-tint text-accent ring-8 ring-accent-tint/40">
          <CalendarCheck className="size-5.5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-label font-semibold tracking-[0.1em] text-ink-500 uppercase">
            {a.ref}
          </p>
          <h2 className="mt-1 type-display text-h2 text-ink-900">
            Hi {a.first}, here&apos;s your appointment
          </h2>
          <p className="mt-2 flex flex-wrap gap-2">
            <Tag tone={a.status === "Booked" ? "healthy" : "watch"}>{a.status}</Tag>
            {a.confirmed && <Tag tone="healthy">You confirmed</Tag>}
            {a.changeRequested && <Tag tone="watch">Change requested</Tag>}
          </p>
        </div>
      </div>
      <dl className="divide-y divide-border">
        {rows.map((r) => (
          <div key={r.label} className="flex gap-3 px-6 py-3.5">
            <r.icon className="mt-0.5 size-4.5 flex-none text-ink-500" aria-hidden="true" />
            <div>
              <dt className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
                {r.label}
              </dt>
              <dd className="text-small text-ink-900">{r.value}</dd>
            </div>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-3 border-t border-border p-6">
        {asking ? (
          <>
            <TextArea
              label="What would suit you better?"
              required
              rows={3}
              value={note}
              onChange={setNote}
              placeholder="For example, any weekday after 3 pm next week"
            />
            <div className="flex gap-2">
              <Button
                variant="primary"
                loading={busy}
                disabled={note.trim().length < 5}
                onClick={() => send({ action: "change", note })}
              >
                Send request
              </Button>
              <Button variant="ghost" onClick={() => setAsking(false)}>
                Back
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            {!a.confirmed && (
              <Button variant="primary" loading={busy} onClick={() => send({ action: "confirm" })}>
                <Check className="size-4" aria-hidden="true" /> Confirm I&apos;ll be there
              </Button>
            )}
            <Button variant="soft" onClick={() => setAsking(true)}>
              Ask for a different time
            </Button>
          </div>
        )}
        {fail && (
          <p role="alert" className="text-small text-over">
            {fail}
          </p>
        )}
        <p className="text-caption text-ink-500">
          This private link shows only this appointment. No account is needed.
        </p>
      </div>
    </div>
  );
}
