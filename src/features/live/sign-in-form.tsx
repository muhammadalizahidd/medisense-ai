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

/** Sign in, or set a password with the invite code the care team gave a patient. */
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
  const [confirm, setConfirm] = useState("");
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
    if (!email.includes("@")) {
      setError("Enter the email address for your account.");
      return;
    }
    if (activating && password && password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const result = await api<{
        user?: SessionUser;
        pending?: boolean;
        referral?: PublicReferralDto;
      }>(activating ? "/api/auth/activate" : "/api/auth/login", {
        body: activating ? { email, code, password } : { email, password },
      });
      if (result.pending && result.referral) {
        onPending?.(result.referral, { email, code });
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
          { id: "activate", label: "I have a code" },
        ]}
      />
      {activating && (
        <p className="rounded-control bg-accent-tint px-3 py-2 text-caption text-ink-700">
          Use your email and the 8-character code from your referral (or from your care team). Leave
          the password blank to see your referral&apos;s progress; once it&apos;s accepted, choose a
          password to set up your account.
        </p>
      )}
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
      {activating && (
        <IconField id="code" label="Code" icon={<KeyRound className="size-4" />}>
          <input
            id="code"
            required
            autoComplete="one-time-code"
            placeholder="ABCD2345"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={12}
            className={cn(inputBare, "font-semibold tracking-widest uppercase")}
          />
        </IconField>
      )}
      <IconField
        id="password"
        label={activating ? "Choose a password" : "Password"}
        icon={<Lock className="size-4" />}
        trailing={eye}
        hint={
          capsLock ? (
            <span className="text-monitor">Caps Lock is on.</span>
          ) : activating ? (
            "At least 10 characters. Leave blank to check a referral."
          ) : undefined
        }
      >
        <input
          id="password"
          type={show ? "text" : "password"}
          required={!activating}
          autoComplete={activating ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyUp={watchCaps}
          onKeyDown={watchCaps}
          className={inputBare}
        />
      </IconField>
      {activating && (
        <IconField id="confirm" label="Confirm password" icon={<Lock className="size-4" />}>
          <input
            id="confirm"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
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
        {busy
          ? "Signing in…"
          : activating
            ? password
              ? "Activate and sign in"
              : "Continue"
            : "Sign in"}
      </Button>
    </form>
  );
}
