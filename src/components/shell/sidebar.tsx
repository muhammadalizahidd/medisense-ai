"use client";

import { ChevronDown, HeartPulse, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type CSSProperties } from "react";
import { caseNotes } from "@/data/case-note";
import { cn } from "@/lib/cn";
import { isActive, isStandalone, navigationFor, roleUsers } from "@/lib/navigation";
import { pageAccessFor } from "@/lib/permissions/pages";
import { useUnreadMessages } from "@/features/live/conversations";
import { useSession } from "@/lib/live/client";
import { useDemoStore } from "@/state/demo-store";
import { photoFor } from "@/lib/avatars";

export const darkFocus = { "--shadow-focus": "var(--shadow-focus-dark)" } as CSSProperties;

const COLLAPSED_KEY = "ms-nav-collapsed";

const collapsedListeners = new Set<() => void>();

/** The saved value as a string, so the snapshot stays stable between renders. */
function readCollapsed(): string {
  try {
    return localStorage.getItem(COLLAPSED_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function subscribeCollapsed(listener: () => void) {
  collapsedListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    collapsedListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * Groups a person has folded away, remembered on this device. The server (and the first client
 * render) shows every group open, so hydration matches; the saved state applies right after.
 */
function useCollapsed() {
  const raw = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => "[]");
  let collapsed: string[] = [];
  try {
    collapsed = JSON.parse(raw) as string[];
  } catch {
    // Ignore a damaged saved value.
  }
  function toggle(group: string) {
    const next = collapsed.includes(group)
      ? collapsed.filter((g) => g !== group)
      : [...collapsed, group];
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
    } catch {
      // Private windows can block storage.
    }
    collapsedListeners.forEach((l) => l());
  }
  return [collapsed, toggle] as const;
}

/**
 * Labelled sidebar from 1280 px, an icon rail down to 768 px, and a tab bar below that.
 * "Live care" (the real workflow) comes first; the other groups run on sample data and say so.
 */
export function Sidebar() {
  const pathname = usePathname();
  const role = useDemoStore((s) => s.role);
  const user = roleUsers[role];
  const notes = useDemoStore((s) => s.caseNotes);
  const notesLeft = caseNotes.filter((c) => notes[c.id]?.mode !== "approved").length;
  const { user: account, loading: sessionLoading } = useSession();
  const unreadMessages = useUnreadMessages(account?.role === "therapist");
  const [collapsed, toggle] = useCollapsed();
  const router = useRouter();
  const [query, setQuery] = useState("");

  if (isStandalone(pathname)) return null;

  const all = navigationFor(role, account?.role === "admin" ? pageAccessFor(account) : null, {
    liveOnly: Boolean(account),
  });
  // Search matches a page's own name or its section's, so "finance" lists the whole section.
  const q = query.trim().toLowerCase();
  const groups = q
    ? all
        .map((g) => ({
          ...g,
          items: g.items.filter((i) => `${g.group} ${i.label}`.toLowerCase().includes(q)),
        }))
        .filter((g) => g.items.length > 0)
    : all;
  const firstMatch = q ? groups[0]?.items[0] : undefined;

  return (
    <nav
      aria-label="Primary"
      style={darkFocus}
      className="no-scrollbar sticky top-0 hidden h-screen w-(--rail-w) flex-none flex-col gap-4 overflow-y-auto border-r border-sidebar-border bg-sidebar px-2 pt-4 pb-4 md:flex xl:w-(--sidebar-w) xl:px-3 print:hidden"
    >
      <Link
        href="/"
        aria-label="Medisense home"
        className="flex items-center justify-center gap-2.5 px-1 pb-2 text-sidebar-ink hover:text-sidebar-ink hover:no-underline xl:justify-start xl:px-2"
      >
        <span
          aria-hidden="true"
          className="flex size-8 flex-none items-center justify-center rounded-control bg-ink-900 text-page"
        >
          <HeartPulse className="size-4.5" strokeWidth={2} />
        </span>
        <span className="hidden min-w-0 flex-col leading-tight xl:flex">
          <span className="text-[15px] font-bold">Medisense</span>
          <span className="truncate text-label text-sidebar-muted">
            Clinical Operations &amp; Supervision
          </span>
        </span>
      </Link>

      <div className="sticky -top-4 z-10 -mx-2 -mt-2 hidden bg-sidebar px-2 pt-2 pb-1 xl:-mx-3 xl:block xl:px-3">
        <label className="flex h-9 items-center gap-2 rounded-control border border-sidebar-border bg-sidebar-hover px-2.5 text-sidebar-ink focus-within:border-accent-fill focus-within:shadow-focus">
          <Search className="size-4 flex-none text-sidebar-muted" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
              if (e.key === "Enter" && firstMatch) {
                router.push(firstMatch.href);
                setQuery("");
              }
            }}
            aria-label="Search the menu"
            placeholder="Search the menu"
            className="h-full min-w-0 flex-1 bg-transparent text-small text-sidebar-ink outline-none placeholder:text-sidebar-muted focus-visible:shadow-none [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="flex size-5 flex-none cursor-pointer items-center justify-center rounded-full text-sidebar-muted hover:text-sidebar-ink"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </label>
        {q && (
          <p role="status" className="px-1 pt-1.5 text-label text-sidebar-muted">
            {firstMatch
              ? `${groups.reduce((n, g) => n + g.items.length, 0)} found · Enter opens the first`
              : "No pages match. Try another word."}
          </p>
        )}
      </div>

      {/* Until we know who is signed in, show the menu's shape rather than pages they may not open. */}
      {sessionLoading && (
        <div aria-hidden="true" className="flex flex-col gap-2 px-1">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <span
              key={i}
              className={cn(
                "h-7 animate-pulse rounded-control bg-sidebar-hover motion-reduce:animate-none",
                i % 4 === 0 ? "mt-3 w-1/3" : "w-full",
              )}
            />
          ))}
        </div>
      )}

      {!sessionLoading &&
        groups.map(({ group, items, live }) => {
          const folded = !q && !live && collapsed.includes(group);
          return (
            <div key={group} className="flex flex-col gap-0.5">
              {live ? (
                <div className="hidden items-center gap-1.5 px-2.5 pb-1 text-label font-semibold tracking-[0.08em] text-sidebar-muted uppercase xl:flex">
                  <i aria-hidden="true" className="size-1.5 rounded-full bg-live-dot" />
                  {group}
                </div>
              ) : (
                <button
                  type="button"
                  aria-expanded={!folded}
                  onClick={() => toggle(group)}
                  className="hidden h-7 cursor-pointer items-center justify-between gap-2 rounded-control px-2.5 text-label font-semibold tracking-[0.08em] text-sidebar-muted uppercase hover:text-sidebar-ink xl:flex"
                >
                  <span className="truncate">{group}</span>
                  <span className="flex items-center gap-1.5 font-medium tracking-normal normal-case">
                    Sample
                    <ChevronDown
                      className={cn(
                        "size-3.5 transition-transform duration-(--duration-fast)",
                        folded && "-rotate-90",
                      )}
                      aria-hidden="true"
                    />
                  </span>
                </button>
              )}
              {items.map(({ href, label, icon: Icon, badge }) => {
                const active = isActive(pathname, href);
                const count = href.startsWith("/case-notes") ? notesLeft : badge;
                const unread = href === "/messages" ? unreadMessages : 0;
                return (
                  <Link
                    key={href}
                    href={href}
                    title={label}
                    aria-label={label}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "h-9 items-center justify-center gap-2.5 rounded-control px-2.5 text-small transition-colors duration-(--duration-fast) hover:no-underline xl:justify-start",
                      folded ? "flex xl:hidden" : "flex",
                      active
                        ? "bg-sidebar-active font-semibold text-sidebar-active-ink shadow-[inset_3px_0_0_var(--color-accent-fill)]"
                        : "font-medium text-sidebar-ink hover:bg-sidebar-hover",
                    )}
                  >
                    <span className="relative flex-none">
                      <Icon
                        className={cn(
                          "size-4.5",
                          active ? "text-sidebar-active-ink" : "text-sidebar-muted",
                        )}
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      {unread > 0 && (
                        <i
                          aria-hidden="true"
                          className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-sidebar bg-over-dot xl:hidden"
                        />
                      )}
                    </span>
                    <span className="hidden flex-1 truncate xl:block">{label}</span>
                    {unread > 0 && (
                      <span className="hidden h-5 min-w-5 items-center justify-center rounded-full bg-over-bg px-1.5 text-label font-semibold text-over xl:flex">
                        {unread}
                        <span className="sr-only"> unread</span>
                      </span>
                    )}
                    {count !== undefined && count > 0 && (
                      <span className="hidden h-5 min-w-5 items-center justify-center rounded-full bg-accent-tint px-1.5 text-label font-semibold text-accent xl:flex">
                        {count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}

      <div className="mt-auto flex items-center justify-center gap-2.5 border-t border-sidebar-border px-1 pt-4 md:hidden xl:justify-start xl:px-3">
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
        <span className="hidden min-w-0 flex-col xl:flex">
          <span className="text-small font-semibold text-sidebar-ink">{user.name}</span>
          <span className="text-caption font-medium text-sidebar-muted">{user.title}</span>
        </span>
      </div>
    </nav>
  );
}
