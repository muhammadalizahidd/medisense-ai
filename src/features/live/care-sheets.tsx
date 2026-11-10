"use client";

import { useState } from "react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Field, inputClass, Sheet } from "@/components/ui/sheet";
import { dischargeReasons } from "@/lib/live/catalogue";
import { api } from "@/lib/live/client";
import { slotLabel } from "@/lib/live/time";
import type { AppointmentDto } from "@/lib/live/types";

/** The therapist's session note: the clinical record, and a short summary the patient will see. */
export function NoteSheet({
  visit,
  onClose,
  onSaved,
}: {
  visit: AppointmentDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState(visit.note?.text ?? "");
  const [forPatient, setForPatient] = useState(visit.note?.forPatient ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/visits/${visit.id}/note`, { body: { text, forPatient } });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the note.");
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={visit.note ? "Edit session note" : "Write session note"}
      description={`${visit.clientName} · ${visit.discipline} · ${slotLabel(visit.start)}`}
      onClose={onClose}
      footer={
        <>
          <Button
            variant="primary"
            disabled={busy || text.trim().length < 10 || forPatient.trim().length < 10}
            onClick={save}
          >
            {busy ? "Saving…" : "Save note"}
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Session note" hint="The clinical record. Only the care team sees this.">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            maxLength={4000}
            placeholder="What you assessed and did, how the patient responded, and the plan."
            className={`${inputClass} h-auto py-2`}
          />
        </Field>
        <Field
          label="Summary for the patient"
          hint="Plain words. The patient sees this in their app."
        >
          <textarea
            value={forPatient}
            onChange={(e) => setForPatient(e.target.value)}
            rows={3}
            maxLength={800}
            placeholder="What you worked on today and anything to practise at home."
            className={`${inputClass} h-auto py-2`}
          />
        </Field>
        {error && (
          <p role="alert" className="text-small text-over">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

/** Ends a patient's care. Future visits are cancelled without charge and everyone is told. */
export function DischargeSheet({
  clientId,
  name,
  upcoming,
  onClose,
  onDone,
}: {
  clientId: string;
  name: string;
  upcoming: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState<(typeof dischargeReasons)[number]>(dischargeReasons[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function discharge() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/care/clients/${clientId}/discharge`, { body: { reason } });
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't discharge the patient.");
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={`Discharge ${name}`}
      description="Ends this patient's care with Medisense."
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" disabled={busy} onClick={discharge}>
            {busy ? "Discharging…" : "Discharge patient"}
          </Button>
          <Button onClick={onClose}>Keep in care</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Reason">
          <Select
            value={reason}
            onChange={(e) => setReason(e.target.value as (typeof dischargeReasons)[number])}
            className="w-full"
          >
            {dischargeReasons.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <ul className="list-disc pl-5 text-small text-ink-700">
          <li>
            {upcoming
              ? `${upcoming} upcoming ${upcoming === 1 ? "visit is" : "visits are"} cancelled by Medisense, with no charge.`
              : "There are no upcoming visits to cancel."}
          </li>
          <li>Any request still waiting for a therapist is withdrawn.</li>
          <li>Each therapist&apos;s caseload goes down by one.</li>
          <li>
            The patient, their therapists and the care team are told, and the patient can still rate
            past visits.
          </li>
        </ul>
        {error && (
          <p role="alert" className="text-small text-over">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
