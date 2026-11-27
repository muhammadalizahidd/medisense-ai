"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { AppCard } from "@/features/mobile/phone-frame";
import { api, useResource } from "@/lib/live/client";
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

/**
 * Sign-in details: a patient who came in with their MRN adds an email and password, so they can
 * sign in either way. Their MRN confirms it's them, and also resets a forgotten password.
 */
export function PatientSignInCard() {
  const { data, reload } = useResource<{ email: string; hasPassword: boolean }>("/api/me/sign-in");
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [mrn, setMrn] = useState("");
  const [state, setState] = useState<{ busy: boolean; error: string | null; done: boolean }>({
    busy: false,
    error: null,
    done: false,
  });
  const shownEmail = email ?? data?.email ?? "";
  // The sign-in check is cached for a few seconds, so a fresh save counts even before it shows.
  const [saved, setSaved] = useState<string | null>(null);
  const hasPassword = Boolean(data?.hasPassword) || saved !== null;

  // A message from the last try goes as soon as the person changes anything.
  const typed = (set: (value: string) => void) => (value: string) => {
    set(value);
    setState((s) => (s.error || s.done ? { ...s, error: null, done: false } : s));
  };

  async function save(event: FormEvent) {
    event.preventDefault();
    if (password.length < 10) {
      return setState({
        busy: false,
        error: "Use at least 10 characters for the password.",
        done: false,
      });
    }
    if (password !== again) {
      return setState({ busy: false, error: "The two passwords don't match.", done: false });
    }
    setState({ busy: true, error: null, done: false });
    try {
      await api("/api/me/sign-in", { body: { email: shownEmail, password, mrn } });
      setPassword("");
      setAgain("");
      setMrn("");
      setSaved(shownEmail);
      setState({ busy: false, error: null, done: true });
      reload();
    } catch (e) {
      setState({
        busy: false,
        error: e instanceof Error ? e.message : "Couldn't save your sign-in details.",
        done: false,
      });
    }
  }

  return (
    <AppCard title={hasPassword ? "Sign-in details" : "Sign in with email"}>
      <p className="mb-3 text-small text-ink-700">
        {hasPassword
          ? `You can sign in with ${saved ?? data?.email ?? "your email"} and your password, or with your MRN.`
          : "Right now you sign in with your MRN. Add an email and password so you can sign in either way."}
      </p>
      <form onSubmit={save} className="flex flex-col gap-3" noValidate>
        <Field label="Email">
          <input
            type="email"
            autoComplete="email"
            value={shownEmail}
            onChange={(e) => typed(setEmail)(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label={hasPassword ? "New password" : "Password"} hint="At least 10 characters.">
          <PasswordInput value={password} onChange={typed(setPassword)} />
        </Field>
        <Field label="Password again">
          <PasswordInput value={again} onChange={typed(setAgain)} />
        </Field>
        <Field label="Your MRN" hint="To confirm it's you, for example MRN-12112026-0001.">
          <input
            autoComplete="off"
            autoCapitalize="characters"
            value={mrn}
            onChange={(e) => typed(setMrn)(e.target.value)}
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
            Saved. Next time, sign in with your email and password, or with your MRN.
          </p>
        )}
        <Button type="submit" variant="primary" disabled={state.busy || !data}>
          {state.busy ? "Saving…" : hasPassword ? "Change password" : "Save email and password"}
        </Button>
      </form>
    </AppCard>
  );
}

/** A password field with a show/hide button inside it. */
function PasswordInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative flex">
      <input
        type={show ? "text" : "password"}
        autoComplete="new-password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputClass, "w-full pr-11")}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        className="absolute inset-y-0 right-0 grid w-11 cursor-pointer place-items-center rounded-r-control text-ink-500 hover:text-ink-900"
      >
        {show ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </span>
  );
}
