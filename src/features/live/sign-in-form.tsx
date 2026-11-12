"use client";

import { AlertCircle, Eye, EyeOff, KeyRound, Loader2, Lock, Mail } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { api } from "@/lib/live/client";
import type { PublicReferralDto, SessionUser } from "@/lib/live/types";
import { cn } from "@/lib/cn";

type Mode = "sign-in" | "activate";

function IconField({
  id,
  label,
  hint,
  icon,
  children,
  trailing,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  icon: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-caption font-semibold text-ink-700">
        {label}
      </label>
      <div className="flex h-11 items-center gap-2.5 rounded-control border border-border-strong bg-raised px-3 focus-within:border-accent focus-within:shadow-focus">
        <span className="flex-none text-ink-500" aria-hidden="true">
          {icon}
        </span>
        {children}
        {trailing}
      </div>
      {hint && <span className="text-caption text-ink-500">{hint}</span>}
    </div>
  );
}

const inputBare =
  "h-full min-w-0 flex-1 bg-transparent text-small text-ink-900 outline-none placeholder:text-ink-500";

/** Staff sign in with email and password; patients and families with their MRN. */
export function SignInForm({
  onSignedIn,
  onPending,
  initialMode = "sign-in",
  initialEmail = "",
  initialCode = "",
}: {
  onSignedIn: (user: SessionUser) => void;
  /** A referral code whose referral isn't accepted yet: show its progress instead. */
  onPending?: (referral: PublicReferralDto, credentials: { email: string; code: string }) => void;
  initialMode?: Mode;
  initialEmail?: string;
  initialCode?: string;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState(initialCode);
  const [show, setShow] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const activating = mode === "activate";

  const watchCaps = (event: KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(event.getModifierState("CapsLock"));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!activating && !email.includes("@")) {
      setError("Enter the email address for your account.");
      return;
    }
    if (activating && code.trim().length < 6) {
      setError("Enter the MRN from your referral or your care team, like MRN-12112026-0001.");
      return;
    }
    setBusy(true);
    try {
      const result = await api<{
        user?: SessionUser;
        pending?: boolean;
        referral?: PublicReferralDto;
      }>(activating ? "/api/auth/activate" : "/api/auth/login", {
        body: activating ? { code } : { email, password },
      });
      if (result.pending && result.referral) {
        onPending?.(result.referral, { email: "", code });
        setBusy(false);
        return;
      }
      if (result.user) onSignedIn(result.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't sign in. Try again.");
      setBusy(false);
    }
  }

  const eye = (
    <button
      type="button"
      onClick={() => setShow(!show)}
      aria-label={show ? "Hide password" : "Show password"}
      aria-pressed={show}
      className="flex size-8 flex-none cursor-pointer items-center justify-center rounded-control text-ink-500 hover:bg-canvas hover:text-ink-900"
    >
      {show ? (
        <EyeOff className="size-4" aria-hidden="true" />
      ) : (
        <Eye className="size-4" aria-hidden="true" />
      )}
    </button>
  );

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
          { id: "activate", label: "I have an MRN" },
        ]}
      />
      {activating && (
        <p className="rounded-control bg-accent-tint px-3 py-2 text-caption text-ink-700">
          Enter your medical record number (MRN) from your referral or your care team. That&apos;s
          all you need: before the referral is accepted it shows its progress, and after that it
          opens your app.
        </p>
      )}
      {!activating && (
        <IconField id="email" label="Email" icon={<Mail className="size-4" />}>
          <input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputBare}
          />
        </IconField>
      )}
      {activating && (
        <IconField id="code" label="MRN" icon={<KeyRound className="size-4" />}>
          <input
            id="code"
            required
            autoComplete="one-time-code"
            autoFocus
            placeholder="MRN-12112026-0001"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={24}
            className={cn(inputBare, "font-semibold tracking-wide uppercase")}
          />
        </IconField>
      )}
      {!activating && (
        <IconField
          id="password"
          label="Password"
          icon={<Lock className="size-4" />}
          trailing={eye}
          hint={capsLock ? <span className="text-watch">Caps Lock is on.</span> : undefined}
        >
          <input
            id="password"
            type={show ? "text" : "password"}
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyUp={watchCaps}
            onKeyDown={watchCaps}
            className={inputBare}
          />
        </IconField>
      )}
      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-control bg-over-bg px-3 py-2.5 text-small text-over"
        >
          <AlertCircle className="mt-0.5 size-4 flex-none" aria-hidden="true" />
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={busy} className="h-11 text-body">
        {busy && (
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        )}
        {busy ? "Signing in…" : activating ? "Continue" : "Sign in"}
      </Button>
    </form>
  );
}
