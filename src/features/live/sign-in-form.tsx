"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Field, inputClass } from "@/components/ui/sheet";
import { api } from "@/lib/live/client";
import type { SessionUser } from "@/lib/live/types";

type Mode = "sign-in" | "activate";

/** Sign in, or set a password with the invite code the care team gave a client. */
export function SignInForm({
  onSignedIn,
  initialMode = "sign-in",
}: {
  onSignedIn: (user: SessionUser) => void;
  initialMode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (mode === "activate" && password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const { user } = await api<{ user: SessionUser }>(
        mode === "sign-in" ? "/api/auth/login" : "/api/auth/activate",
        { body: mode === "sign-in" ? { email, password } : { email, code, password } },
      );
      onSignedIn(user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't sign in. Try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Segmented
        label="How do you want to continue?"
        value={mode}
        onChange={(next) => {
          setMode(next);
          setError(null);
        }}
        options={[
          { id: "sign-in", label: "Sign in" },
          { id: "activate", label: "I have an invite code" },
        ]}
      />
      <Field label="Email">
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </Field>
      {mode === "activate" && (
        <Field label="Invite code" hint="8 letters and numbers from your care team.">
          <input
            required
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className={`${inputClass} tracking-widest uppercase`}
            maxLength={12}
          />
        </Field>
      )}
      <Field
        label={mode === "sign-in" ? "Password" : "Choose a password"}
        hint={mode === "activate" ? "At least 10 characters." : undefined}
      >
        <input
          type="password"
          required
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </Field>
      {mode === "activate" && (
        <Field label="Confirm password">
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
          />
        </Field>
      )}
      {error && (
        <p role="alert" className="rounded-control bg-over-bg px-3 py-2 text-small text-over">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Activate and sign in"}
      </Button>
    </form>
  );
}
