"use client";

import { Check, Copy, UserPlus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PhotoPicker } from "@/components/ui/photo-picker";
import { Field, Sheet } from "@/components/ui/sheet";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/live/client";
import {
  disciplines,
  practitioner,
  regions,
  supportCatalogue,
  type Discipline,
  type Region,
  type Support,
} from "@/lib/live/catalogue";
import { Choice, TextField, Tick } from "./form-bits";

const weekdays = [
  { n: 1, label: "Mon" },
  { n: 2, label: "Tue" },
  { n: 3, label: "Wed" },
  { n: 4, label: "Thu" },
  { n: 5, label: "Fri" },
];

type Created = { id: string; email: string; temporaryPassword: string };

/** Admin module A04: add a therapist with credentials and working days; they get a login. */
export function AddTherapist({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" aria-hidden="true" />
        Add therapist
      </Button>
      {open && <AddTherapistSheet onClose={() => setOpen(false)} onAdded={onAdded} />}
    </>
  );
}

function AddTherapistSheet({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    discipline: "Occupational Therapy" as Discipline,
    region: "Brisbane North" as Region,
    seniority: "Clinician" as "Graduate" | "Clinician" | "Senior",
    capacity: "20",
    sessionMinutes: "60",
    registration: "",
    registrationExpiry: "",
    screeningExpiry: "",
  });
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [scopes, setScopes] = useState<Support[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const assessments = supportCatalogue.filter(
    (s) => s.discipline === form.discipline && s.kind === "assessment",
  );

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<Created>("/api/care/therapists", {
        body: {
          ...form,
          capacity: Number(form.capacity),
          sessionMinutes: Number(form.sessionMinutes),
          weekdays: days,
          assessmentScopes: scopes.filter((s) => assessments.some((a) => a.name === s)),
          photo,
        },
      });
      setCreated(result);
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add the therapist.");
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <Sheet
        title={`${form.name} has been added`}
        onClose={onClose}
        footer={
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        }
      >
        <div className="flex flex-col gap-4 text-small">
          <p>
            Give {form.name.split(" ")[0]} these sign-in details in person or by phone. The
            temporary password is shown only once; they change it under <strong>My profile</strong>,
            then set their working hours and time off.
          </p>
          <dl className="grid grid-cols-[120px_1fr] gap-y-2 rounded-card bg-canvas p-4">
            <dt className="text-ink-500">Email</dt>
            <dd className="font-semibold">{created.email}</dd>
            <dt className="text-ink-500">Password</dt>
            <dd className="flex items-center gap-2 font-mono text-body font-semibold">
              {created.temporaryPassword}
              <Button
                size="sm"
                onClick={() => {
                  void navigator.clipboard?.writeText(created.temporaryPassword);
                  setCopied(true);
                }}
              >
                {copied ? (
                  <Check className="size-3.5" aria-hidden="true" />
                ) : (
                  <Copy className="size-3.5" aria-hidden="true" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
            </dd>
          </dl>
          <p className="text-ink-700">
            They&apos;re now offered in matching for {form.discipline.toLowerCase()} in{" "}
            {form.region}.
          </p>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      title="Add a therapist"
      description="Creates their profile and their sign-in. Matching checks the credentials before offering them."
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" disabled={busy} onClick={save}>
            {busy ? "Adding…" : "Add therapist"}
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <PhotoPicker name={form.name} value={photo} onChange={setPhoto} kind="staff" />
        <TextField label="Full name" required value={form.name} onChange={set("name")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Work email"
            type="email"
            required
            value={form.email}
            onChange={set("email")}
            hint="Their sign-in"
          />
          <TextField label="Phone" type="tel" value={form.phone} onChange={set("phone")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Discipline">
            <Select
              value={form.discipline}
              onChange={(e) => {
                set("discipline")(e.target.value);
                setScopes([]);
              }}
            >
              {disciplines.map((d) => (
                <option key={d} value={d}>
                  {practitioner[d]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Service region">
            <Select value={form.region} onChange={(e) => set("region")(e.target.value)}>
              {regions.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Choice
          label="Seniority"
          options={["Graduate", "Clinician", "Senior"] as const}
          value={form.seniority}
          onChange={(v) => setForm((f) => ({ ...f, seniority: v }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Caseload capacity (patients)"
            required
            value={form.capacity}
            onChange={set("capacity")}
          />
          <Field label="Session length">
            <Select
              value={form.sessionMinutes}
              onChange={(e) => set("sessionMinutes")(e.target.value)}
            >
              {["30", "45", "60", "90"].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div>
          <p className="mb-1.5 text-caption font-semibold text-ink-700">
            Working days (9 am to 5 pm; they can change hours later)
          </p>
          <div className="flex gap-1.5">
            {weekdays.map((d) => {
              const on = days.includes(d.n);
              return (
                <button
                  key={d.n}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDays((x) => (on ? x.filter((n) => n !== d.n) : [...x, d.n]))}
                  className={`h-9 w-14 cursor-pointer rounded-full border text-small ${on ? "border-accent-fill bg-accent-fill font-semibold text-on-accent" : "border-border-strong bg-surface"}`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>
        <h3 className="mt-2 text-body font-semibold">Credentials</h3>
        <TextField
          label="Registration number"
          required
          value={form.registration}
          onChange={set("registration")}
          placeholder="For example, OCC0001234"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Registration expiry"
            type="date"
            required
            value={form.registrationExpiry}
            onChange={set("registrationExpiry")}
          />
          <TextField
            label="Worker screening expiry"
            type="date"
            required
            value={form.screeningExpiry}
            onChange={set("screeningExpiry")}
          />
        </div>
        {assessments.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-caption font-semibold text-ink-700">
              Credentialed for these assessments
            </p>
            {assessments.map((a) => (
              <Tick
                key={a.name}
                checked={scopes.includes(a.name)}
                onChange={(on) =>
                  setScopes((x) => (on ? [...x, a.name] : x.filter((s) => s !== a.name)))
                }
              >
                {a.name}
              </Tick>
            ))}
          </div>
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

/** Deactivate a therapist who has left, or bring them back. */
export function TherapistActiveToggle({
  id,
  name,
  active,
  onChanged,
}: {
  id: string;
  name: string;
  active: boolean;
  onChanged: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await api(`/api/care/therapists/${id}/active`, { body: { active: !active } });
      onChanged();
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };
  if (active && confirm) {
    return (
      <span className="flex items-center gap-2 text-caption text-ink-700">
        {name.split(" ")[0]} won&apos;t be able to sign in or get new patients.
        <Button size="sm" disabled={busy} onClick={run}>
          Deactivate
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
          Keep
        </Button>
      </span>
    );
  }
  return (
    <Button size="sm" disabled={busy} onClick={() => (active ? setConfirm(true) : run())}>
      {active ? "Deactivate" : "Reactivate"}
    </Button>
  );
}
