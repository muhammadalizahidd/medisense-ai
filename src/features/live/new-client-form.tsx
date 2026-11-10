"use client";

import { Check, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Select } from "@/components/ui/select";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Field, inputClass } from "@/components/ui/sheet";
import { api } from "@/lib/live/client";
import { fundingStreams, regions, type FundingStream, type Region } from "@/lib/live/catalogue";
import { brisbaneDay, shortDate } from "@/lib/live/time";
import { Panel } from "./bits";
import { TherapyPicker, type Needs } from "./therapy-picker";

type Created = { id: string; inviteCode: string; inviteExpires: string };

export function NewClientForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    dateOfBirth: "",
    email: "",
    phone: "",
    suburb: "",
    region: "Brisbane North" as Region,
    funding: "NDIS" as FundingStream,
    notes: "",
  });
  const [needs, setNeeds] = useState<Needs>({});
  const [today] = useState(() => brisbaneDay(new Date()).toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const chosen = Object.entries(needs).map(([discipline, frequency]) => ({
      discipline,
      frequency,
    }));
    if (form.dateOfBirth && form.dateOfBirth > today) {
      setError("The date of birth can't be in the future.");
      return;
    }
    if (!chosen.length) {
      setError("Choose at least one therapy.");
      return;
    }
    setBusy(true);
    try {
      setCreated(
        await api<Created>("/api/care/clients", {
          body: {
            ...form,
            dateOfBirth: form.dateOfBirth || null,
            phone: form.phone.trim() || null,
            needs: chosen,
          },
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add the patient.");
    } finally {
      setBusy(false);
    }
  }

  if (created)
    return (
      <ClientCreated
        name={form.name}
        created={created}
        onNext={() => router.push(`/care/${created.id}`)}
      />
    );

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader
        eyebrow="Patient onboarding"
        title="Add a patient"
        description="Their details, the therapy they need and how often. Next you'll choose a therapist by availability."
      />
      <div className="grid gap-6 xl:grid-cols-12">
        <div className="flex flex-col gap-6 xl:col-span-8">
          <Panel title="Patient">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Full name">
                <input
                  required
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  className={inputClass}
                  autoComplete="off"
                />
              </Field>
              <Field label="Date of birth" hint="Optional">
                <input
                  type="date"
                  max={today}
                  min="1900-01-01"
                  value={form.dateOfBirth}
                  onChange={(e) => set("dateOfBirth", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field
                label="Email for the patient app"
                hint="The patient or their guardian signs in with this."
              >
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  className={inputClass}
                  autoComplete="off"
                />
              </Field>
              <Field label="Phone" hint="Optional">
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  className={inputClass}
                  autoComplete="off"
                />
              </Field>
              <Field label="Suburb">
                <input
                  required
                  value={form.suburb}
                  onChange={(e) => set("suburb", e.target.value)}
                  className={inputClass}
                  autoComplete="off"
                />
              </Field>
              <Field label="Service region" hint="Used to find therapists close by.">
                <Select
                  value={form.region}
                  onChange={(e) => set("region", e.target.value as Region)}
                  className="w-full"
                >
                  {regions.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Funding">
                <Select
                  value={form.funding}
                  onChange={(e) => set("funding", e.target.value as FundingStream)}
                  className="w-full"
                >
                  {fundingStreams.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </Panel>

          <Panel title="Therapy needed">
            <p className="-mt-2 mb-4 text-small text-ink-700">
              Choose each therapy the patient needs, then how often. Recurring visits are booked
              when the therapist accepts.
            </p>
            <TherapyPicker value={needs} onChange={setNeeds} />
          </Panel>
        </div>

        <div className="flex flex-col gap-6 xl:col-span-4">
          <Panel title="Notes for the therapist">
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={7}
              maxLength={2000}
              aria-label="Notes for the therapist"
              placeholder="Goals, access needs, who will be present, anything the therapist should know before the first visit."
              className={`${inputClass} h-auto py-2`}
            />
            <p className="mt-2 text-caption text-ink-500">
              Shared with the therapist when you send the request.
            </p>
          </Panel>
          {error && (
            <p role="alert" className="rounded-control bg-over-bg px-3 py-2 text-small text-over">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Adding patient…" : "Add patient and find therapists"}
            </Button>
            <ButtonLink href="/care">Cancel</ButtonLink>
          </div>
        </div>
      </div>
    </form>
  );
}

function ClientCreated({
  name,
  created,
  onNext,
}: {
  name: string;
  created: Created;
  onNext: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mx-auto max-w-160 pt-6">
      <Panel title={`${name} has been added`}>
        <p className="text-small text-ink-700">
          Give this invite code to {name.split(" ")[0]} or their guardian. They open the Medisense
          patient app, choose <strong>I have an invite code</strong>, and set a password. This code
          is shown only once.
        </p>
        <div className="my-5 flex items-center justify-between gap-3 rounded-control border border-border bg-canvas px-4 py-3">
          <span className="font-mono text-h2 tracking-widest">{created.inviteCode}</span>
          <Button
            size="sm"
            onClick={() => {
              void navigator.clipboard?.writeText(created.inviteCode);
              setCopied(true);
            }}
          >
            {copied ? (
              <Check className="size-3.5" aria-hidden="true" />
            ) : (
              <Copy className="size-3.5" aria-hidden="true" />
            )}
            {copied ? "Copied" : "Copy code"}
          </Button>
        </div>
        <p className="mb-5 text-caption text-ink-500">
          Valid until {shortDate(created.inviteExpires)}.
        </p>
        <Button variant="primary" onClick={onNext}>
          Choose therapists
        </Button>
      </Panel>
    </div>
  );
}
