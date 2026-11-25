"use client";

import {
  CalendarHeart,
  HeartPulse,
  House,
  MessagesSquare,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { sessionChanged } from "@/lib/live/client";
import { homeFor } from "@/lib/live/routes";
import type { SessionUser } from "@/lib/live/types";
import { cn } from "@/lib/cn";
import { SignInForm } from "./sign-in-form";

export type TestAccount = { name: string; role: string; email: string };

/** Stock photograph from Unsplash (free licence). */
const PHOTO =
  "https://images.unsplash.com/photo-1723433892471-62f113c8c9a0?auto=format&fit=crop&w=1600&q=80";

const promises = [
  { icon: House, title: "Care at home", text: "Therapists come to you, anywhere in Brisbane." },
  { icon: UsersRound, title: "One care team", text: "Nine disciplines working from one plan." },
  {
    icon: MessagesSquare,
    title: "Always in touch",
    text: "Message your therapist and see every visit.",
  },
];

/**
 * One sign-in for everyone: admins and therapists with their work email, patients with the
 * MRN (medical record number) their care team gave them.
 */
/** Staff-only destinations: the therapist app and the staff portals never offer the MRN option. */
const STAFF_AREAS = ["/mobile/therapist", "/mobile/staff", "/therapist", "/care", "/admin"];

export function SignInScreen({
  next,
  offline,
  testAccounts,
  oneClick = false,
  pendingUser = null,
}: {
  next: string | null;
  offline: boolean;
  /** Already signed in with a temporary password: only the "choose your password" step shows. */
  pendingUser?: SessionUser | null;
  testAccounts: TestAccount[] | null;
  /** Local development: a demo account signs in with one click (no password in the browser). */
  oneClick?: boolean;
}) {
  const router = useRouter();
  const [prefill, setPrefill] = useState<{ email: string; key: number } | null>(null);
  // Set once a temporary password is accepted, so the heading matches the "choose" step.
  const [choosing, setChoosing] = useState<SessionUser | null>(pendingUser);
  const staffArea = Boolean(
    next &&
    STAFF_AREAS.some((p) => next === p || next.startsWith(`${p}/`) || next.startsWith(`${p}?`)),
  );

  return (
    <main className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <section
        aria-label="About Medisense"
        className="relative hidden overflow-hidden bg-ink-900 bg-cover bg-center lg:block"
        style={{ backgroundImage: `url(${PHOTO})` }}
      >
        <div className="absolute inset-0 bg-ink-900/60" aria-hidden="true" />
        <div className="relative flex h-full flex-col justify-between p-12 text-surface">
          <Brand light />
          <div className="max-w-120">
            <h2 className="type-display text-[40px] leading-12 font-semibold text-surface">
              Allied health that comes to you.
            </h2>
            <ul className="mt-8 flex flex-col gap-5">
              {promises.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-4">
                  <span className="flex size-10 flex-none items-center justify-center rounded-control bg-surface/15 text-surface">
                    <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-body font-semibold text-surface">{title}</span>
                    <span className="block text-small text-surface/80">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="flex items-center gap-2 text-caption text-surface/75">
            <CalendarHeart className="size-4" aria-hidden="true" />
            Monday to Friday, 9:00 am to 5:00 pm
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-110">
          <div className="mb-8 lg:hidden">
            <Brand />
          </div>
          <h1 className="type-display text-h1">{choosing ? "Choose your password" : "Sign in"}</h1>
          <p className="mt-1.5 mb-6 text-small text-ink-700">
            {choosing
              ? `Welcome, ${choosing.name.split(" ")[0]}. You signed in with a temporary password: choose your own to continue.`
              : staffArea
                ? "Staff and therapists sign in with their work email and password."
                : "Staff and therapists use their work email. Patients and families sign in with the MRN (medical record number) from their care team."}
          </p>
          {offline && (
            <p
              role="status"
              className="mb-4 rounded-control bg-watch-bg px-3 py-2 text-small text-watch"
            >
              Sign-in is unavailable because the database can&apos;t be reached. Try again shortly.
            </p>
          )}
          <div className="rounded-card border border-border bg-surface p-6 sm:p-7">
            <SignInForm
              key={prefill?.key ?? 0}
              initialEmail={prefill?.email}
              staffOnly={staffArea}
              pendingUser={pendingUser}
              onChoosePassword={setChoosing}
              onSignedIn={(user) => {
                router.replace(next ?? homeFor(user.role, user.staffRoles));
                router.refresh();
              }}
            />
          </div>
          <div className="mt-6 flex flex-col gap-2 text-caption text-ink-500">
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 flex-none text-accent" aria-hidden="true" />
              Forgotten your password? Staff can ask a Medisense admin for a temporary one.
              {!staffArea && " Patients can ask their care team for their MRN."}
            </p>
          </div>
          {testAccounts && !choosing && (
            <details className="mt-6 rounded-control border border-dashed border-border-strong bg-surface px-4 py-3">
              <summary className="cursor-pointer text-small font-semibold">Quick sign-in</summary>
              <p className="mt-2 mb-3 text-caption text-ink-500">
                {oneClick
                  ? "Medisense portal accounts, set up for quick access. Choose one to sign in straight away."
                  : "Medisense portal accounts, set up for quick access. Choose one to fill in its email, then enter the password your Medisense admin gave you."}
              </p>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {testAccounts.map((a) => (
                  <li key={a.email}>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!oneClick) return setPrefill({ email: a.email, key: Date.now() });
                        setPrefill({ email: a.email, key: Date.now() });
                        const res = await fetch("/api/auth/demo", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ email: a.email }),
                        });
                        const body = (await res.json().catch(() => ({}))) as {
                          user?: { role: Parameters<typeof homeFor>[0]; staffRoles?: string[] };
                        };
                        if (res.ok && body.user) {
                          sessionChanged();
                          router.replace(next ?? homeFor(body.user.role, body.user.staffRoles));
                          router.refresh();
                        }
                      }}
                      className={cn(
                        "w-full cursor-pointer rounded-control border border-border px-3 py-2 text-left hover:border-accent hover:bg-accent-tint",
                        prefill?.email === a.email && "border-accent bg-accent-tint",
                      )}
                    >
                      <span className="block text-small font-semibold">{a.name}</span>
                      <span className="block truncate text-caption text-ink-500">{a.role}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </section>
    </main>
  );
}

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex size-11 items-center justify-center rounded-control bg-ink-900 text-page"
      >
        <HeartPulse className="size-6" strokeWidth={2} />
      </span>
      <span>
        <span className={cn("block type-display text-h2 leading-6", light && "text-surface")}>
          Medisense
        </span>
        <span className={cn("block text-caption", light ? "text-surface/75" : "text-ink-500")}>
          Allied health, at home
        </span>
      </span>
    </div>
  );
}
