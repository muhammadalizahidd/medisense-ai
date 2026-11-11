import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "./sign-in-screen";

/** The frame for pages people use without an account: the referral form and tracking link. */
export function PublicShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-300 items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <Brand />
          <Link href="/login" className="text-small font-semibold text-accent">
            Staff and patient sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-300 px-4 pt-8 pb-16 sm:px-8">
        <h1 className="headline text-h1">{title}</h1>
        {description && (
          <p className="mt-1.5 mb-8 max-w-180 text-small text-ink-700">{description}</p>
        )}
        {children}
      </main>
      <footer className="border-t border-border py-6 text-center text-caption text-ink-500">
        Medisense allied health · Monday to Friday, 9:00 am to 5:00 pm
      </footer>
    </div>
  );
}
