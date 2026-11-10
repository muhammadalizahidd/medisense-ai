"use client";

import { HeartPulse } from "lucide-react";
import { useRouter } from "next/navigation";
import { homeFor } from "@/lib/live/routes";
import { SignInForm } from "./sign-in-form";

export function SignInScreen({ next, offline }: { next: string | null; offline: boolean }) {
  const router = useRouter();
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-100">
        <div className="mb-6 flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-control bg-accent-fill text-on-accent"
          >
            <HeartPulse className="size-5.5" strokeWidth={2} />
          </span>
          <span>
            <span className="block headline text-h2 leading-6">Medisense</span>
            <span className="block text-caption text-ink-500">Allied health, at home</span>
          </span>
        </div>
        <section className="rounded-card border border-border bg-surface p-6 surface-lift">
          <h1 className="headline text-h2">Welcome back</h1>
          <p className="mt-1 mb-5 text-small text-ink-700">
            Staff, therapists and patients all sign in here.
          </p>
          {offline && (
            <p
              role="status"
              className="mb-4 rounded-control bg-monitor-bg px-3 py-2 text-small text-monitor"
            >
              Sign-in is unavailable because the database can&apos;t be reached. Try again shortly.
            </p>
          )}
          <SignInForm
            onSignedIn={(user) => {
              router.replace(next ?? homeFor(user.role));
              router.refresh();
            }}
          />
        </section>
      </div>
    </main>
  );
}
