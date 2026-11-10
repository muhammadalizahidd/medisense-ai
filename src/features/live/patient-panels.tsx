"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/sheet";
import { AppCard } from "@/features/mobile/phone-frame";
import { api } from "@/lib/live/client";
import { slotLabel } from "@/lib/live/time";
import type { AppointmentDto, ClientHomeDto } from "@/lib/live/types";
import { Stars } from "./bits";

/** The patient rates a completed visit and can add a comment. It can be done once per visit. */
export function RateVisitPanel({
  visit,
  onClose,
  onDone,
}: {
  visit: AppointmentDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/visits/${visit.id}/feedback`, { body: { rating, comment } });
      setSent(true);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send your feedback.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <p
          role="status"
          className="rounded-control bg-healthy-bg px-3 py-2 text-small text-healthy"
        >
          Thank you. {visit.therapistName.split(" ")[0]} and the care team can see your feedback.
        </p>
        <Button onClick={onClose}>Done</Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-small text-ink-700">
        {visit.discipline} with {visit.therapistName}, {slotLabel(visit.start)}
      </p>
      {visit.note && (
        <p className="rounded-control bg-canvas px-3 py-2 text-small">{visit.note.forPatient}</p>
      )}
      <div className="flex flex-col items-center gap-1">
        <Stars value={rating} onChange={setRating} size="lg" />
        <span className="text-caption text-ink-500">
          {rating ? `${rating} out of 5` : "Tap a star"}
        </span>
      </div>
      <Field label="Anything you'd like to add?" hint="Optional.">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={600}
          className={`${inputClass} h-auto py-2`}
        />
      </Field>
      {error && (
        <p role="alert" className="text-small text-over">
          {error}
        </p>
      )}
      <Button variant="primary" disabled={!rating || busy} onClick={send}>
        {busy ? "Sending…" : "Send feedback"}
      </Button>
    </div>
  );
}

/** The patient keeps their phone number and emergency contact current. */
export function PatientDetailsCard({
  home,
  onSaved,
}: {
  home: ClientHomeDto;
  onSaved: () => void;
}) {
  const [phone, setPhone] = useState(home.phone ?? "");
  const [name, setName] = useState(home.emergencyContact?.name ?? "");
  const [relationship, setRelationship] = useState(home.emergencyContact?.relationship ?? "");
  const [contactPhone, setContactPhone] = useState(home.emergencyContact?.phone ?? "");
  const [state, setState] = useState<{ busy: boolean; error: string | null; done: boolean }>({
    busy: false,
    error: null,
    done: false,
  });
  const anyContact = name || relationship || contactPhone;

  async function save(event: FormEvent) {
    event.preventDefault();
    setState({ busy: true, error: null, done: false });
    try {
      await api("/api/care/me", {
        method: "PUT",
        body: {
          phone: phone.trim() || null,
          emergencyContact: anyContact ? { name, relationship, phone: contactPhone } : null,
        },
      });
      setState({ busy: false, error: null, done: true });
      onSaved();
    } catch (e) {
      setState({
        busy: false,
        error: e instanceof Error ? e.message : "Couldn't save your details.",
        done: false,
      });
    }
  }

  return (
    <AppCard title="Your details">
      <form onSubmit={save} className="flex flex-col gap-3">
        <Field label="Your phone">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
          />
        </Field>
        <p className="text-caption font-semibold text-ink-700">Emergency contact</p>
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Relationship" hint="For example mother, partner or carer.">
          <input
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Their phone">
          <input
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            className={inputClass}
          />
        </Field>
        {state.error && (
          <p role="alert" className="text-small text-over">
            {state.error}
          </p>
        )}
        {state.done && (
          <p role="status" className="text-small text-healthy">
            Saved. Your care team can see these details.
          </p>
        )}
        <Button type="submit" variant="primary" disabled={state.busy}>
          {state.busy ? "Saving…" : "Save details"}
        </Button>
      </form>
    </AppCard>
  );
}
