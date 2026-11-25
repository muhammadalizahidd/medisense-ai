"use client";

import { PageGuideButton } from "./page-guide";
import { ArrowUpRight, Bell, ChevronRight, History } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AiIcon } from "@/components/ai/provenance";
import { cn } from "@/lib/cn";
import { api, useResource, useSession } from "@/lib/live/client";
import { relativeTime } from "@/lib/live/time";
import type { NotificationDto } from "@/lib/live/types";
import { isStandalone, routeMeta } from "@/lib/navigation";
import { useUnreadMessages } from "@/features/live/conversations";
import { useDemoStore } from "@/state/demo-store";
import { QuickAdd } from "./quick-add";
import { ShellDate } from "./shell-date";
import { ThemeMenu } from "./theme-menu";
import { WorkspaceMenu } from "./workspace-menu";

/** Both open only on a click, so their code (the assistant alone is 500+ lines) loads then. */
const AssistantPanel = dynamic(() => import("./assistant-panel").then((m) => m.AssistantPanel), {
  ssr: false,
});
const AuditDrawer = dynamic(() => import("./audit-drawer").then((m) => m.AuditDrawer), {
  ssr: false,
});

function Notifications() {
  const role = useDemoStore((s) => s.role);
  const all = useDemoStore((s) => s.story.notices);
  const markRead = useDemoStore((s) => s.markNoticesRead);
  const notices = all.filter((n) => n.to === role);
  const { user } = useSession();
  const live = useResource<{ notifications: NotificationDto[] }>(
    user ? "/api/notifications" : null,
    (event) => event.type === "notification",
  );
  const liveNotes = user ? (live.data?.notifications ?? []) : [];
  const liveUnread = liveNotes.filter((n) => !n.read).length;
  const unreadMessages = useUnreadMessages(user?.role === "therapist" || user?.role === "admin");
  const unread = notices.filter((n) => !n.read).length + liveUnread + unreadMessages;
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
        aria-label={unread ? `${unread} new notifications` : "Notifications"}
        onClick={() => {
          if (!open) {
            markRead(role);
            if (liveUnread)
              void api("/api/notifications", { method: "POST" }).then(live.reload, () => undefined);
          }
          setOpen(!open);
        }}
        className="relative flex size-9 cursor-pointer items-center justify-center rounded-control text-ink-700 transition-colors duration-(--duration-fast) hover:bg-sunken hover:text-ink-900"
      >
        <Bell className="size-4.5" strokeWidth={1.75} aria-hidden="true" />
        {unread > 0 && (
          <>
            <span
              aria-hidden="true"
              className="absolute top-1.5 right-1.5 size-2 rounded-full bg-over-dot ring-2 ring-topbar"
            />
            <span className="sr-only">, {unread} unread</span>
          </>
        )}
      </button>
      {open && (
        <div
          ref={panel}
          className="absolute top-11 right-0 z-30 w-80 overflow-hidden rounded-card border border-border bg-raised shadow-overlay"
        >
          <h2 className="px-4 pt-3 pb-2 text-small font-semibold">Notifications</h2>
          {unreadMessages > 0 && (
            <Link
              href={user?.role === "admin" ? "/care/messages" : "/messages"}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 border-t border-border bg-accent-tint px-4 py-2.5 text-small font-semibold text-ink-900 hover:no-underline"
            >
              <span className="size-2 rounded-full bg-over-dot" aria-hidden="true" />
              {unreadMessages} unread {unreadMessages === 1 ? "message" : "messages"}
            </Link>
          )}
          {liveNotes.length > 0 && (
            <ul className="max-h-80 overflow-y-auto">
              {liveNotes.map((n) => (
                <li key={n.id} className="border-t border-border">
                  <Link
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "block px-4 py-2.5 text-ink-900 hover:bg-canvas hover:no-underline",
                      !n.read && "bg-accent-tint",
                    )}
                  >
                    <span className="block text-small font-semibold">{n.title}</span>
                    <span className="block text-caption text-ink-700">{n.body}</span>
                    <span className="block text-caption text-ink-500">
                      {relativeTime(n.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {(liveNotes.length > 0 || unreadMessages > 0) &&
          notices.length === 0 ? null : notices.length === 0 ? (
            <p className="border-t border-border px-4 py-4 text-small text-ink-700">
              Nothing new. Reminders and escalations will appear here.
            </p>
          ) : (
            <ul>
              {notices.map((n) => (
                <li key={n.id} className="border-t border-border">
                  <Link
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-2.5 text-small text-ink-900 hover:bg-canvas hover:no-underline"
                  >
                    {n.text}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function TopBar() {
  const pathname = usePathname();
  const { section, page } = routeMeta(pathname);
  const askField = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl+K jumps to Ask Medisense from anywhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        askField.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const auditOpen = useDemoStore((s) => s.auditOpen);
  const setAuditOpen = useDemoStore((s) => s.setAuditOpen);
  const [assistant, setAssistant] = useState<{ open: boolean; question: string; key: number }>({
    open: false,
    question: "",
    key: 0,
  });
  const [draftQuestion, setDraftQuestion] = useState("");
  const closeAssistant = useCallback(() => setAssistant((a) => ({ ...a, open: false })), []);

  if (isStandalone(pathname)) return null;

  function openAssistant(question: string) {
    setAssistant((a) => ({ open: true, question, key: a.key + 1 }));
    setDraftQuestion("");
  }

  return (
    <>
      <header className="sticky top-0 z-20 flex min-h-(--topbar-h) items-center justify-between gap-4 border-b border-border bg-topbar px-4 py-2 md:px-6 xl:pr-6 xl:pl-10 print:hidden">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <nav
            aria-label="Breadcrumb"
            className="flex max-w-[45%] min-w-0 shrink items-center gap-1.5 text-small lg:max-w-[40%]"
          >
            <span className="hidden truncate text-ink-500 sm:inline">{section}</span>
            <ChevronRight
              className="hidden size-3.5 flex-none text-ink-500 sm:block"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span className="truncate font-medium text-ink-900" aria-current="page">
              {page}
            </span>
          </nav>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              openAssistant(draftQuestion);
            }}
            className="hidden h-9 max-w-115 min-w-56 flex-1 items-center gap-2 rounded-control border border-border bg-surface pr-1.5 pl-3 text-ink-500 focus-within:border-accent focus-within:shadow-focus lg:flex"
          >
            <AiIcon className="size-4" />
            <input
              ref={askField}
              type="text"
              value={draftQuestion}
              onChange={(e) => setDraftQuestion(e.target.value)}
              aria-label="Ask Medisense"
              aria-keyshortcuts="Control+K Meta+K"
              placeholder="Ask Medisense about patients, referrals, visits…"
              className="min-w-0 flex-1 border-0 bg-transparent text-small text-ink-900 outline-none placeholder:text-ink-500 focus-visible:shadow-none"
            />
            <kbd className="hidden rounded-tag border border-border px-1.5 font-mono text-label text-ink-500 xl:block">
              ⌘K
            </kbd>
            <button
              type="submit"
              className="group inline-flex h-7 flex-none cursor-pointer items-center gap-1 rounded-tag bg-accent-fill px-2.5 text-caption font-semibold text-on-accent shadow-lift transition-all duration-(--duration-fast) hover:-translate-y-px hover:bg-accent-fill-hover active:scale-95"
            >
              Ask
              <ArrowUpRight
                className="size-3.5 transition-transform duration-(--duration-fast) group-hover:translate-x-px group-hover:-translate-y-px"
                aria-hidden="true"
              />
            </button>
          </form>
        </div>

        <div className="flex flex-none items-center justify-end gap-1">
          <PageGuideButton />
          <QuickAdd />

          <Notifications />

          <button
            type="button"
            aria-label="Open audit trail"
            onClick={() => setAuditOpen(true)}
            className="flex size-9 cursor-pointer items-center justify-center rounded-control text-ink-700 transition-colors duration-(--duration-fast) hover:bg-sunken hover:text-ink-900"
          >
            <History className="size-4.5" strokeWidth={1.75} aria-hidden="true" />
          </button>

          <ThemeMenu />

          <ShellDate className="hidden text-small whitespace-nowrap text-ink-700" />

          <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-border sm:block" />
          <WorkspaceMenu />
        </div>
      </header>

      {auditOpen && <AuditDrawer open onClose={() => setAuditOpen(false)} />}
      {assistant.open && (
        <AssistantPanel
          key={assistant.key}
          initialQuestion={assistant.question}
          onClose={closeAssistant}
        />
      )}
    </>
  );
}
