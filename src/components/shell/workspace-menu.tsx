"use client";

import { ChevronDown, LayoutGrid, LogIn, LogOut, Palette, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/premium";
import { cn } from "@/lib/cn";
import { signOut, useSession } from "@/lib/live/client";
import { homeFor } from "@/lib/live/routes";
import { roleUsers, type Role } from "@/lib/navigation";
import { useDemoStore } from "@/state/demo-store";
import { photoFor } from "@/lib/avatars";

/** A row in the menu: icon, label, optional hint. */
const rowClass =
  "flex h-10 w-full cursor-pointer items-center gap-3 rounded-control px-2.5 text-left text-small font-medium text-ink-900 transition-colors duration-(--duration-fast) hover:bg-canvas hover:no-underline";

const sessionWorkspace: Record<"admin" | "therapist" | "client", Role | null> = {
  admin: "Admin",
  therapist: "Clinician",
  client: null,
};

const SYNC_KEY = "ms-workspace-synced";

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
        title: account.staffRoles?.length
          ? account.staffRoles.join(" · ")
          : accountLabel[account.role],
      }
    : sample;
  const [open, setOpen] = useState(false);

  // The menu follows whoever signs in, once per browser session: admins start in the admin
  // workspace, therapists in the therapist one. After that, a preview someone picks stays put.
  useEffect(() => {
    if (!account) return;
    let synced: string | null = null;
    try {
      synced = sessionStorage.getItem(SYNC_KEY);
    } catch {
      // Private windows can block storage; then the menu follows the account each time.
    }
    if (synced === account.id) return;
    try {
      sessionStorage.setItem(SYNC_KEY, account.id);
    } catch {
      // See above.
    }
    const workspace = sessionWorkspace[account.role];
    if (workspace && workspace !== role) setRole(workspace);
  }, [account, role, setRole]);
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
          className="flex size-8 flex-none items-center justify-center overflow-hidden rounded-full bg-accent-tint text-caption font-semibold text-accent"
        >
          {photoFor(user.name) ? (
            // eslint-disable-next-line @next/next/no-img-element -- small local portrait
            <img
              src={photoFor(user.name) ?? ""}
              alt=""
              className="size-full rounded-full object-cover"
            />
          ) : (
            user.initials
          )}
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
          className="absolute top-12 right-0 z-30 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-card border border-border bg-raised shadow-overlay"
        >
          {account ? (
            <>
              <div className="flex items-center gap-3 px-4 pt-4 pb-3.5">
                <span className="relative flex-none">
                  <Avatar name={account.name} size={44} />
                  <i
                    aria-hidden="true"
                    className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-raised bg-healthy-dot"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-semibold text-ink-900">{account.name}</p>
                  <p className="truncate text-caption text-ink-500">{account.email}</p>
                  <p className="mt-1 truncate text-label font-semibold tracking-[0.06em] text-accent uppercase">
                    {user.title}
                  </p>
                </div>
              </div>
              <nav aria-label="Account" className="border-t border-border p-1.5">
                <Link
                  href={homeFor(account.role, account.staffRoles)}
                  onClick={() => setOpen(false)}
                  className={rowClass}
                >
                  <LayoutGrid className="size-4 flex-none text-ink-500" aria-hidden="true" />
                  My workspace
                </Link>
                {account.role !== "client" && (
                  <>
                    <Link href="/profile" onClick={() => setOpen(false)} className={rowClass}>
                      <UserRound className="size-4 flex-none text-ink-500" aria-hidden="true" />
                      My profile
                    </Link>
                    <Link
                      href="/profile#appearance"
                      onClick={() => setOpen(false)}
                      className={rowClass}
                    >
                      <Palette className="size-4 flex-none text-ink-500" aria-hidden="true" />
                      Appearance
                    </Link>
                  </>
                )}
              </nav>
            </>
          ) : (
            <div className="p-1.5">
              <Link href="/login" onClick={() => setOpen(false)} className={rowClass}>
                <LogIn className="size-4 flex-none text-ink-500" aria-hidden="true" />
                Sign in to your account
              </Link>
            </div>
          )}

          {account && (
            <div className="border-t border-border p-1.5">
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  setOpen(false);
                  live.reload();
                  router.push("/login");
                }}
                className={cn(rowClass, "text-ink-700 hover:bg-over-bg hover:text-over")}
              >
                <LogOut className="size-4 flex-none" aria-hidden="true" />
                Sign out
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
