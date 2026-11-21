"use client";

import { Lock, PenLine } from "lucide-react";
import { AiIcon } from "@/components/ai/provenance";
import { useState } from "react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Field, Sheet } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { dischargeReasons } from "@/lib/live/catalogue";
import { api } from "@/lib/live/client";
import { relativeTime, slotLabel } from "@/lib/live/time";
import type { AppointmentDto } from "@/lib/live/types";
import { TextArea, Tick } from "./form-bits";

const soapFields = [
  { key: "subjective", label: "Subjective", hint: "What the participant or carer reported" },
  { key: "objective", label: "Objective", hint: "What you observed and measured" },
  { key: "assessment", label: "Assessment", hint: "Your clinical interpretation" },
  { key: "plan", label: "Plan", hint: "Next steps, home practice, next visit" },
] as const;
type SoapKey = (typeof soapFields)[number]["key"];

/**
 * The SOAP session note. A draft until signed; signing makes it final, shows the patient the plain
 * summary and verifies the service for invoicing. AI can draft it from rough notes: the draft
 * never signs itself, and never adds measurements the clinician didn't give.
 */
export function NoteSheet({
  visit,
  onClose,
  onSaved,
}: {
  visit: AppointmentDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const note = visit.note;
  const signed = note?.status === "Final" || note?.status === "Amended";
  const [soap, setSoap] = useState<Record<SoapKey, string>>({
    subjective: note?.soap?.subjective ?? "",
    objective: note?.soap?.objective ?? (note && !note.soap ? (note.text ?? "") : ""),
    assessment: note?.soap?.assessment ?? "",
    plan: note?.soap?.plan ?? "",
  });
  const [forPatient, setForPatient] = useState(note?.forPatient ?? "");
  const [rough, setRough] = useState("");
  const [aiDrafted, setAiDrafted] = useState(Boolean(note?.aiDrafted));
  const [missing, setMissing] = useState<string[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [amendReason, setAmendReason] = useState("");
  const [amendText, setAmendText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(sign: boolean, ready = false) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/visits/${visit.id}/note`, {
        body: { ...soap, forPatient, aiDrafted, sign, ready },
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the note.");
      setBusy(false);
    }
  }

  async function draft() {
    setDrafting(true);
    setError(null);
    try {
      const d = await api<Record<SoapKey | "forPatient", string> & { missing: string[] }>(
        `/api/visits/${visit.id}/note/draft`,
        { body: { rough } },
      );
      setSoap({
        subjective: d.subjective,
        objective: d.objective,
        assessment: d.assessment,
        plan: d.plan,
      });
      setForPatient(d.forPatient);
      setMissing(d.missing);
      setAiDrafted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The AI draft isn't available.");
    } finally {
      setDrafting(false);
    }
  }

  async function amend() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/visits/${visit.id}/note/amend`, {
        body: { reason: amendReason, text: amendText },
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add the amendment.");
      setBusy(false);
    }
  }

  const complete =
    soapFields.every((f) => soap[f.key].trim().length >= 3) && forPatient.trim().length >= 10;

  return (
    <Sheet
      title={
        signed
          ? "Session note"
          : note?.status === "Pending Signature"
            ? "Sign session note"
            : note
              ? "Finish session note"
              : "Write session note"
      }
      description={`${visit.clientName} · ${visit.discipline} · ${slotLabel(visit.start)}`}
      onClose={onClose}
      footer={
        signed ? (
          <>
            <Button
              variant="primary"
              disabled={busy || amendReason.trim().length < 5 || amendText.trim().length < 5}
              onClick={amend}
            >
              Add amendment
            </Button>
            <Button onClick={onClose}>Close</Button>
          </>
        ) : (
          <>
            <Button variant="primary" disabled={busy || !complete} onClick={() => save(true)}>
              <PenLine className="size-4" aria-hidden="true" />
              {busy ? "Saving…" : "Sign note"}
            </Button>
            <Button disabled={busy || !complete} onClick={() => save(false, true)}>
              Ready to sign
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => save(false)}>
              Save draft
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {signed ? (
          <>
            <p className="flex items-center gap-2 text-small">
              <Lock className="size-4 text-accent" aria-hidden="true" />
              Signed by {note?.byName}
              {note?.signedAt ? `, ${relativeTime(note.signedAt)}` : ""}. Signed notes change only
              by amendment.
            </p>
            <dl className="flex flex-col gap-3 rounded-card bg-canvas p-4 text-small">
              {soapFields.map((f) => (
                <div key={f.key}>
                  <dt className="text-caption font-semibold text-ink-500">{f.label}</dt>
                  <dd className="whitespace-pre-line">{soap[f.key] || "–"}</dd>
                </div>
              ))}
              <div>
                <dt className="text-caption font-semibold text-ink-500">Shared with the patient</dt>
                <dd>{forPatient}</dd>
              </div>
            </dl>
            {note?.amendments.map((m) => (
              <div key={m.at} className="rounded-control border border-border px-3 py-2 text-small">
                <p className="font-semibold">Amendment: {m.reason}</p>
                <p className="whitespace-pre-line">{m.text}</p>
                <p className="text-caption text-ink-500">
                  {m.byName} · {relativeTime(m.at)}
                </p>
              </div>
            ))}
            <TextArea
              label="Reason for amendment"
              required
              value={amendReason}
              onChange={setAmendReason}
              rows={2}
            />
            <TextArea
              label="Amendment"
              required
              value={amendText}
              onChange={setAmendText}
              rows={3}
            />
          </>
        ) : (
          <>
            <section
              aria-label="Draft with AI"
              className="rounded-card border border-accent/30 bg-accent-tint p-4"
            >
              <p className="flex items-center gap-2 text-small font-semibold">
                <AiIcon className="size-4" />
                Draft with AI
              </p>
              <p className="mt-1 text-caption text-ink-700">
                Jot down what happened in your own words. AI arranges it into SOAP using only what
                you wrote and the session record. You review and sign.
              </p>
              <div className="mt-3">
                <TextArea
                  label="Rough notes"
                  value={rough}
                  onChange={setRough}
                  rows={3}
                  placeholder="Mum says mornings are easier. Buttons 3 of 5 with verbal prompts. Practised sock donning..."
                  maxLength={6000}
                />
              </div>
              <Button
                size="sm"
                className="mt-2"
                disabled={drafting || rough.trim().length < 15}
                onClick={draft}
              >
                <AiIcon className="size-3.5" />
                {drafting ? "Drafting…" : "Draft SOAP note"}
              </Button>
            </section>
            {aiDrafted && (
              <p className="flex flex-wrap items-center gap-2 text-caption text-ink-700">
                <Tag tone="live">AI draft</Tag>
                Check every line before signing. Nothing is final until you sign.
              </p>
            )}
            {missing.length > 0 && (
              <div className="rounded-control bg-watch-bg px-3 py-2 text-small">
                <p className="font-semibold">AI found these missing from your notes:</p>
                <ul className="mt-1 list-disc pl-5">
                  {missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
            {soapFields.map((f) => (
              <TextArea
                key={f.key}
                label={f.label}
                required
                hint={f.hint}
                value={soap[f.key]}
                onChange={(v) => setSoap((s) => ({ ...s, [f.key]: v }))}
                rows={3}
              />
            ))}
            <TextArea
              label="Summary for the patient"
              required
              hint="Plain words. The patient sees this in their app once you sign."
              value={forPatient}
              onChange={setForPatient}
              rows={3}
              maxLength={800}
            />
          </>
        )}
        {error && (
          <p role="alert" className="text-small text-over">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

/**
 * Discharge (section 10): reason, outcomes, outstanding risks, advice and handover, signed by the
 * clinician. Future visits are cancelled without charge and everyone is told.
 */
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
  const [outcomes, setOutcomes] = useState("");
  const [outstandingRisks, setRisks] = useState("");
  const [advice, setAdvice] = useState("");
  const [handover, setHandover] = useState("");
  const [signed, setSigned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function discharge() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/care/clients/${clientId}/discharge`, {
        body: { reason, outcomes, outstandingRisks, advice, handover, signed },
      });
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
      description="The discharge summary closes every service, plan and the referral."
      onClose={onClose}
      footer={
        <>
          <Button
            variant="primary"
            disabled={busy || !signed || outcomes.trim().length < 10}
            onClick={discharge}
          >
            {busy ? "Discharging…" : "Sign and discharge"}
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
        <TextArea
          label="Outcomes"
          required
          value={outcomes}
          onChange={setOutcomes}
          rows={3}
          placeholder="Goals achieved, final measures, function at discharge"
        />
        <TextArea label="Outstanding risks" value={outstandingRisks} onChange={setRisks} rows={2} />
        <TextArea
          label="Advice for the participant"
          value={advice}
          onChange={setAdvice}
          rows={2}
          hint="Shared with the participant in their app"
        />
        <TextArea label="Referrals and handover" value={handover} onChange={setHandover} rows={2} />
        <ul className="list-disc pl-5 text-small text-ink-700">
          <li>
            {upcoming
              ? `${upcoming} upcoming ${upcoming === 1 ? "visit is" : "visits are"} cancelled by Medisense, with no charge.`
              : "There are no upcoming visits to cancel."}
          </li>
          <li>Requests still waiting are withdrawn; services and plans are marked complete.</li>
          <li>The referral is closed and everyone involved is told.</li>
        </ul>
        <Tick checked={signed} onChange={setSigned}>
          I sign this discharge summary as the responsible clinician or authorised staff member.
        </Tick>
        {error && (
          <p role="alert" className="text-small text-over">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
