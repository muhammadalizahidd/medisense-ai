"use client";

import { Check, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Field, inputClass } from "@/components/ui/sheet";
import { api } from "@/lib/live/client";
import {
  disciplines,
  frequencies,
  fundingStreams,
  regions,
  type Discipline,
  type Frequency,
  type FundingStream,
  type Region,
} from "@/lib/live/catalogue";
import { shortDate } from "@/lib/live/time";
import { cn } from "@/lib/cn";
import { Panel } from "./bits";

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
  const [needs, setNeeds] = useState<Partial<Record<Discipline, Frequency>>>({});
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
      setError(e instanceof Error ? e.message : "Couldn't add the client.");
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
        eyebrow="Client onboarding"
        title="Add a client"
        description="Their details, the therapy they need and how often. Next you'll choose a therapist by availability."
      />
      <div className="grid gap-6 xl:grid-cols-12">
        <div className="flex flex-col gap-6 xl:col-span-8">
          <Panel title="Client">
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
                  value={form.dateOfBirth}
                  onChange={(e) => set("dateOfBirth", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field
                label="Email for the client app"
                hint="The client or their guardian signs in with this."
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
                <select
                  value={form.region}
                  onChange={(e) => set("region", e.target.value as Region)}
                  className={inputClass}
                >
                  {regions.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </Field>
              <Field label="Funding">
                <select
                  value={form.funding}
                  onChange={(e) => set("funding", e.target.value as FundingStream)}
                  className={inputClass}
                >
                  {fundingStreams.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </Field>
            </div>
          </Panel>

          <Panel title="Therapy needed">
            <p className="-mt-2 mb-4 text-small text-ink-700">
              Tick each therapy and choose how often.
            </p>
            <ul className="grid gap-2 md:grid-cols-2">
              {disciplines.map((d) => {
                const chosen = needs[d];
                return (
                  <li
                    key={d}
                    className={cn(
                      "flex items-center gap-3 rounded-control border px-3 py-2",
                      chosen ? "border-accent bg-accent-tint" : "border-border",
                    )}
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-small font-medium">
                      <input
                        type="checkbox"
                        checked={Boolean(chosen)}
                        onChange={(e) =>
                          setNeeds((n) => {
                            const next = { ...n };
                            if (e.target.checked) next[d] = "Assessment";
                            else delete next[d];
                            return next;
                          })
                        }
                        className="size-4 accent-accent-fill"
                      />
                      {d}
                    </label>
                    {chosen && (
                      <select
                        aria-label={`${d} frequency`}
                        value={chosen}
                        onChange={(e) =>
                          setNeeds((n) => ({ ...n, [d]: e.target.value as Frequency }))
                        }
                        className={`${inputClass} h-8 w-34`}
                      >
                        {frequencies.map((f) => (
                          <option key={f}>{f}</option>
                        ))}
                      </select>
                    )}
                  </li>
                );
              })}
            </ul>
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
              {busy ? "Adding client…" : "Add client and find therapists"}
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
          client app, choose <strong>I have an invite code</strong>, and set a password. This code
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
