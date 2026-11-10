"use client";

import { Check, ChevronDown, LogIn, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { signOut, useSession } from "@/lib/live/client";
import { homeFor } from "@/lib/live/routes";
import { roleHome, roleUsers, type Role } from "@/lib/navigation";
import { useDemoStore } from "@/state/demo-store";

const workspaces: { id: Role; label: string }[] = [
  { id: "Leadership", label: "Director" },
  { id: "Clinician", label: "Therapist" },
  { id: "Admin", label: "Admin" },
  { id: "Supervisor", label: "Supervisor" },
];

const accountLabel = {
  admin: "Administration",
  therapist: "Therapist",
  client: "Patient",
} as const;

/** The signed-in person, and the way to move between the four workspaces. */
export function WorkspaceMenu() {
  const router = useRouter();
  const role = useDemoStore((s) => s.role);
  const setRole = useDemoStore((s) => s.setRole);
  const sample = roleUsers[role];
  const live = useSession();
  const account = live.user;
  const user = account
    ? {
        name: account.name,
        initials: account.name
          .split(" ")
          .map((p) => p[0])
          .slice(0, 2)
          .join(""),
        title: accountLabel[account.role],
      }
    : sample;
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-label={`Switch workspace. Signed in as ${user.name}`}
        onClick={() => setOpen(!open)}
        className="flex cursor-pointer items-center gap-2.5 rounded-control py-1 pr-1.5 pl-1 text-left hover:bg-canvas"
      >
        <span
          aria-hidden="true"
          className="flex size-8 flex-none items-center justify-center rounded-full bg-accent-fill text-caption font-semibold text-on-accent"
        >
          {user.initials}
        </span>
        <span className="hidden max-w-44 min-w-0 flex-col md:flex">
          <span className="truncate text-small font-semibold">{user.name}</span>
          <span className="truncate text-caption text-ink-500">{user.title}</span>
        </span>
        <ChevronDown className="size-4 flex-none text-ink-500" aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={panel}
          className="absolute top-12 right-0 z-30 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-card border border-border bg-surface-raised p-1.5 shadow-overlay"
        >
          <div className="mb-1.5 border-b border-border px-2.5 pt-1.5 pb-2.5">
            {account ? (
              <>
                <p className="text-small font-semibold">{account.name}</p>
                <p className="truncate text-caption text-ink-500">{account.email}</p>
                <div className="mt-2 flex gap-1.5">
                  <Link
                    href={homeFor(account.role)}
                    onClick={() => setOpen(false)}
                    className="rounded-control border border-border-strong px-2.5 py-1.5 text-caption font-semibold text-ink-900 hover:bg-canvas hover:no-underline"
                  >
                    My workspace
                  </Link>
                  {account.role !== "client" && (
                    <Link
                      href="/profile"
                      onClick={() => setOpen(false)}
                      className="rounded-control border border-border-strong px-2.5 py-1.5 text-caption font-semibold text-ink-900 hover:bg-canvas hover:no-underline"
                    >
                      My profile
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      await signOut();
                      setOpen(false);
                      live.reload();
                      router.push("/login");
                    }}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-control px-2.5 py-1.5 text-caption font-semibold text-accent hover:bg-accent-tint"
                  >
                    <LogOut className="size-3.5" aria-hidden="true" />
                    Sign out
                  </button>
                </div>
              </>
            ) : (
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 text-small font-semibold"
              >
                <LogIn className="size-4" aria-hidden="true" />
                Sign in to your account
              </Link>
            )}
          </div>
          <h2 className="px-2.5 pt-1.5 pb-2 text-small font-semibold">Switch workspace</h2>
          <div role="radiogroup" aria-label="Workspace" className="flex flex-col gap-0.5">
            {workspaces.map((w) => (
              <button
                key={w.id}
                type="button"
                role="radio"
                aria-checked={role === w.id}
                onClick={() => {
                  setRole(w.id);
                  setOpen(false);
                  router.push(roleHome[w.id]);
                }}
                className={cn(
                  "flex h-12 cursor-pointer items-center gap-2.5 rounded-control px-2.5 text-left",
                  role === w.id ? "bg-accent-tint" : "hover:bg-canvas",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-small font-semibold">{w.label}</span>
                  <span className="block truncate text-caption text-ink-500">
                    {roleUsers[w.id].name}
                  </span>
                </span>
                {role === w.id && (
                  <Check
                    className="size-4 flex-none text-accent"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
