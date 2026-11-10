"use client";

import { CalendarCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Field, inputClass } from "@/components/ui/sheet";
import { classifyCancellation, noticeSummary, type CancelledBy } from "@/lib/live/cancellation";
import { cancelReasons, CANCELLATION_NOTICE_HOURS } from "@/lib/live/catalogue";
import { api } from "@/lib/live/client";
import { shortDate, slotLabel, timeOfDay } from "@/lib/live/time";
import type { AppointmentDto } from "@/lib/live/types";
import { cn } from "@/lib/cn";

type Step = "cancel" | "rebook" | "done";

/**
 * Cancel a visit under the 48-hour policy, then offer the therapist's next free times.
 * `staff` lets the care team record who called it off; a client's own cancellation is client-side.
 */
export function CancelVisitPanel({
  visit,
  staff,
  onClose,
  onChanged,
}: {
  visit: AppointmentDto;
  staff: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [step, setStep] = useState<Step>("cancel");
  const [by, setBy] = useState<CancelledBy>("client");
  const [reason, setReason] = useState<(typeof cancelReasons)[number]>(cancelReasons[0]);
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const who: CancelledBy = staff ? by : "client";
  const preview = classifyCancellation(new Date(visit.start), now, who);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const outcome = await api<{ late: boolean; noticeHours: number }>(
        `/api/visits/${visit.id}/cancel`,
        { body: { reason, ...(staff ? { by } : {}) } },
      );
      setResult(
        outcome.late
          ? `Visit cancelled. With ${outcome.noticeHours} hours' notice it's recorded as a late cancellation.`
          : "Visit cancelled. No charge applies.",
      );
      onChanged();
      setStep("rebook");
      const times = await api<{ slots: string[] }>(`/api/visits/${visit.id}/times`);
      setSlots(times.slots);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't cancel the visit.");
    } finally {
      setBusy(false);
    }
  }

  async function rebook() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/visits/${visit.id}/rebook`, { body: { start: picked } });
      setResult(`New visit booked for ${slotLabel(picked)}.`);
      onChanged();
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't book that time.");
      const times = await api<{ slots: string[] }>(`/api/visits/${visit.id}/times`).catch(
        () => null,
      );
      if (times) setSlots(times.slots);
      setPicked(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-control border border-border bg-canvas px-4 py-3">
        <p className="text-small font-semibold">{slotLabel(visit.start)}</p>
        <p className="text-caption text-ink-700">
          {visit.discipline} · {staff ? visit.clientName : visit.therapistName}
        </p>
      </div>

      {step === "cancel" && (
        <>
          {staff && (
            <div className="flex flex-col gap-1">
              <span className="text-caption font-semibold text-ink-700">Who cancelled?</span>
              <Segmented
                label="Who cancelled?"
                value={by}
                onChange={setBy}
                options={[
                  { id: "client", label: "The patient" },
                  { id: "medisense", label: "Medisense" },
                ]}
              />
            </div>
          )}
          <Field label="Reason">
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as (typeof cancelReasons)[number])}
              className={inputClass}
            >
              {cancelReasons.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          <p
            role="status"
            className={cn(
              "rounded-control px-3 py-2 text-small",
              preview.late ? "bg-monitor-bg text-monitor" : "bg-healthy-bg text-healthy",
            )}
          >
            {noticeSummary(preview, who)}
          </p>
          <p className="text-caption text-ink-500">
            Medisense asks for {CANCELLATION_NOTICE_HOURS} hours&apos; notice to cancel or change a
            visit.
          </p>
          {error && (
            <p role="alert" className="text-small text-over">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={busy} onClick={cancel}>
              {busy ? "Cancelling…" : "Cancel visit"}
            </Button>
            <Button onClick={onClose}>Keep visit</Button>
          </div>
        </>
      )}

      {step !== "cancel" && result && (
        <p role="status" className="rounded-control bg-canvas px-3 py-2 text-small">
          {result}
        </p>
      )}

      {step === "rebook" && (
        <>
          <h3 className="text-small font-semibold">Book a new time with {visit.therapistName}</h3>
          {!slots ? (
            <p className="text-small text-ink-500">Finding free times…</p>
          ) : slots.length === 0 ? (
            <p className="text-small text-ink-700">
              No free times in the next two weeks. The care team will be in touch.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {slots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  aria-pressed={picked === slot}
                  onClick={() => setPicked(picked === slot ? null : slot)}
                  className={cn(
                    "cursor-pointer rounded-control border px-2.5 py-1.5 text-caption font-medium",
                    picked === slot
                      ? "border-accent-fill bg-accent-fill text-on-accent"
                      : "border-border-strong bg-surface hover:bg-canvas",
                  )}
                >
                  <span className="block">{shortDate(slot)}</span>
                  <span className="block font-semibold">{timeOfDay(slot)}</span>
                </button>
              ))}
            </div>
          )}
          {error && (
            <p role="alert" className="text-small text-over">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={!picked || busy} onClick={rebook}>
              <CalendarCheck className="size-4" aria-hidden="true" />
              {busy ? "Booking…" : "Book new time"}
            </Button>
            <Button onClick={onClose}>Not now</Button>
          </div>
        </>
      )}

      {step === "done" && <Button onClick={onClose}>Done</Button>}
    </div>
  );
}
