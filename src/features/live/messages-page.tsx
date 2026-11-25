"use client";

import { ArrowLeft, MessageSquarePlus, MessageSquareText, Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/premium";
import { Segmented } from "@/components/ui/segmented";
import { api, useNow } from "@/lib/live/client";
import { relativeTime, shortDate } from "@/lib/live/time";
import type { ConversationDto } from "@/lib/live/types";
import { cn } from "@/lib/cn";
import { EmptyNote, ErrorNote, LiveBadge, Skeleton } from "./bits";
import { ChatThread } from "./chat-thread";
import { useConversations } from "./conversations";
import { NewChatSheet } from "./new-chat";

type GroupBy = "recent" | "name";
type Hit = { id: string; conversationId: string; mine: boolean; body: string; createdAt: string };

const DAY = 86_400_000;

/** Recent groups unread first, then by when the last message came; A–Z groups by first letter. */
function grouped(list: ConversationDto[], by: GroupBy, now: number) {
  const groups = new Map<string, ConversationDto[]>();
  const add = (key: string, c: ConversationDto) => groups.set(key, [...(groups.get(key) ?? []), c]);
  if (by === "name") {
    for (const c of [...list].sort((a, b) => a.title.localeCompare(b.title))) {
      add(c.title.charAt(0).toUpperCase(), c);
    }
    return [...groups];
  }
  const today = new Date(
    new Date(now + 36e6).toISOString().slice(0, 10) + "T00:00:00+10:00",
  ).getTime();
  for (const c of list) {
    const at = c.lastAt ? new Date(c.lastAt).getTime() : 0;
    const key =
      c.unread > 0
        ? "Unread"
        : !at
          ? "No messages yet"
          : at >= today
            ? "Today"
            : at >= today - 6 * DAY
              ? "This week"
              : "Earlier";
    add(key, c);
  }
  const order = ["Unread", "Today", "This week", "Earlier", "No messages yet"];
  return order.flatMap((k) => (groups.has(k) ? [[k, groups.get(k)!] as const] : []));
}

/** Highlights the searched words in a line of text. */
function Mark({ text, q }: { text: string; q: string }) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-watch-bg px-0.5 text-ink-900">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  );
}

type Who = "all" | ConversationDto["group"];

/**
 * A therapist's chats with their patients at /messages; an admin's at /care/messages, where they
 * can also start a chat with anyone: office staff, clinicians or patients.
 */
export function MessagesPage({
  myId,
  base = "/messages",
  canStart = false,
}: {
  myId: string;
  base?: string;
  canStart?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const now = useNow() ?? 0;
  const { data, error, loading, reload } = useConversations();
  const conversations = useMemo(() => data?.conversations ?? [], [data]);
  // With nothing chosen, open the chat at the top of the list as it's shown: unread first.
  const selected = params.get("c") ?? grouped(conversations, "recent", now)[0]?.[1][0]?.id ?? null;
  const current = conversations.find((c) => c.id === selected);
  const open = (id: string) => router.replace(`${base}?c=${id}`, { scroll: false });
  const [picking, setPicking] = useState(false);
  const [who, setWho] = useState<Who>("all");
  const [query, setQuery] = useState("");
  const [by, setBy] = useState<GroupBy>("recent");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const q = query.trim();
  const unread = conversations.reduce((s, c) => s + c.unread, 0);

  // Message text is searched on the server, a moment after typing stops.
  useEffect(() => {
    if (q.length < 2) return;
    const t = setTimeout(() => {
      api<{ results: Hit[] }>(`/api/conversations/search?q=${encodeURIComponent(q)}`)
        .then((r) => setHits(r.results))
        .catch(() => setHits([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const shown = conversations
    .filter((c) => !unreadOnly || c.unread > 0)
    .filter((c) => who === "all" || c.group === who)
    .filter(
      (c) =>
        !q ||
        `${c.title} ${c.subtitle} ${c.lastMessage ?? ""}`.toLowerCase().includes(q.toLowerCase()),
    );
  const titleOf = (id: string) => conversations.find((c) => c.id === id)?.title ?? "Conversation";
  const messageHits = q.length >= 2 ? hits : [];

  return (
    <div className="flex h-[calc(100dvh-6.5rem)] min-h-130 flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-control bg-accent-tint text-accent">
            <MessageSquareText className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="type-display text-h2 leading-7">Messages</h1>
            <p className="text-caption text-ink-500">
              {conversations.length} conversation{conversations.length === 1 ? "" : "s"}
              {unread > 0 && <span className="font-semibold text-over"> · {unread} unread</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LiveBadge />
          {canStart && (
            <Button variant="primary" onClick={() => setPicking(true)}>
              <MessageSquarePlus className="size-4" aria-hidden="true" />
              New message
            </Button>
          )}
        </div>
      </header>
      {picking && (
        <NewChatSheet
          onClose={() => setPicking(false)}
          onOpen={(id) => {
            setPicking(false);
            reload();
            open(id);
          }}
        />
      )}

      <div className="grid min-h-0 flex-1 overflow-hidden rounded-card border border-border bg-surface md:grid-cols-[340px_1fr]">
        <aside
          aria-label="Conversations"
          className={cn(
            "flex min-h-0 flex-col border-border md:border-r",
            params.get("c") && "hidden md:flex",
          )}
        >
          <div className="flex flex-col gap-2 border-b border-border p-3">
            <label className="flex h-9 items-center gap-2 rounded-control border border-border-strong bg-canvas px-3 focus-within:border-accent focus-within:bg-surface focus-within:shadow-focus">
              <Search className="size-4 text-ink-500" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search messages"
                placeholder="Search names and messages"
                className="min-w-0 flex-1 bg-transparent text-small outline-none placeholder:text-ink-500"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                  className="cursor-pointer text-ink-500 hover:text-ink-900"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              )}
            </label>
            <div className="flex items-center justify-between gap-2">
              <Segmented
                label="Group by"
                value={by}
                onChange={setBy}
                options={[
                  { id: "recent", label: "Recent" },
                  { id: "name", label: "A–Z" },
                ]}
              />
              <button
                type="button"
                aria-pressed={unreadOnly}
                onClick={() => setUnreadOnly(!unreadOnly)}
                className={cn(
                  "h-7 cursor-pointer rounded-full border px-3 text-caption font-semibold",
                  unreadOnly
                    ? "border-accent-fill bg-accent-fill text-on-accent"
                    : "border-border-strong text-ink-700 hover:bg-canvas",
                )}
              >
                Unread{unread > 0 ? ` (${unread})` : ""}
              </button>
            </div>
            {canStart && (
              <Segmented
                label="Who"
                value={who}
                onChange={setWho}
                options={[
                  { id: "all", label: "All" },
                  { id: "Office staff", label: "Staff" },
                  { id: "Clinicians", label: "Clinicians" },
                  { id: "Patients", label: "Patients" },
                ]}
              />
            )}
          </div>

          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
            {error && !data ? (
              <div className="p-3">
                <ErrorNote message={error} onRetry={reload} />
              </div>
            ) : loading && !data ? (
              <div className="flex flex-col gap-2 p-3" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-3">
                <EmptyNote title="No conversations yet.">
                  {canStart
                    ? "Start one with New message: anyone in the practice can be messaged."
                    : "A conversation opens when you accept a new patient."}
                </EmptyNote>
              </div>
            ) : (
              <>
                {grouped(shown, by, now).map(([group, list]) => (
                  <section key={group} aria-label={group}>
                    <h2 className="sticky top-0 z-1 border-b border-border bg-surface/95 px-4 py-1.5 text-label font-semibold tracking-wide text-ink-500 uppercase backdrop-blur">
                      {group} · {list.length}
                    </h2>
                    <ul className="divide-y divide-border">
                      {list.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            aria-current={selected === c.id ? "true" : undefined}
                            onClick={() => open(c.id)}
                            className={cn(
                              "flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-canvas",
                              selected === c.id && "bg-accent-tint",
                            )}
                          >
                            <Avatar
                              name={c.title}
                              size={38}
                              kind={c.group === "Patients" ? "patient" : "staff"}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline justify-between gap-2">
                                <span className="truncate text-small font-semibold">
                                  <Mark text={c.title} q={q} />
                                </span>
                                {c.lastAt && (
                                  <span className="flex-none text-caption text-ink-500">
                                    {relativeTime(c.lastAt)}
                                  </span>
                                )}
                              </span>
                              <span className="flex items-center justify-between gap-2">
                                <span
                                  className={cn(
                                    "truncate text-caption",
                                    c.unread ? "font-semibold text-ink-900" : "text-ink-500",
                                  )}
                                >
                                  <Mark text={c.lastMessage ?? c.subtitle} q={q} />
                                </span>
                                {c.unread > 0 && (
                                  <span className="flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-accent-fill px-1.5 text-label font-semibold text-on-accent">
                                    <span className="sr-only">Unread: </span>
                                    {c.unread}
                                  </span>
                                )}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
                {shown.length === 0 && messageHits.length === 0 && (
                  <p className="p-4 text-small text-ink-500">
                    Nothing matches{q ? ` "${q}"` : ""}.
                  </p>
                )}
                {messageHits.length > 0 && (
                  <section aria-label="Messages found">
                    <h2 className="sticky top-0 z-1 border-b border-border bg-surface/95 px-4 py-1.5 text-label font-semibold tracking-wide text-ink-500 uppercase backdrop-blur">
                      In messages · {messageHits.length}
                    </h2>
                    <ul className="divide-y divide-border">
                      {messageHits.map((h) => (
                        <li key={h.id}>
                          <button
                            type="button"
                            onClick={() => open(h.conversationId)}
                            className="block w-full cursor-pointer px-4 py-2.5 text-left hover:bg-canvas"
                          >
                            <span className="flex justify-between gap-2 text-caption">
                              <span className="font-semibold">{titleOf(h.conversationId)}</span>
                              <span className="text-ink-500">{shortDate(h.createdAt)}</span>
                            </span>
                            <span className="line-clamp-2 text-caption text-ink-700">
                              {h.mine && <span className="text-ink-500">You: </span>}
                              <Mark text={h.body} q={q} />
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
          </div>
        </aside>

        <section
          aria-label="Conversation"
          className={cn("flex min-h-0 flex-col", !params.get("c") && "hidden md:flex")}
        >
          {current ? (
            <>
              <header className="flex items-center gap-3 border-b border-border px-5 py-3">
                <button
                  type="button"
                  aria-label="Back to conversations"
                  onClick={() => router.replace(base)}
                  className="flex size-8 cursor-pointer items-center justify-center rounded-control hover:bg-canvas md:hidden"
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                </button>
                <Avatar
                  name={current.title}
                  size={36}
                  kind={current.group === "Patients" ? "patient" : "staff"}
                />
                <div>
                  <h2 className="text-small font-semibold">{current.title}</h2>
                  <p className="text-caption text-ink-500">{current.subtitle}</p>
                </div>
              </header>
              <div className="min-h-0 flex-1">
                <ChatThread key={current.id} conversationId={current.id} myId={myId} />
              </div>
            </>
          ) : (
            <p className="m-auto text-small text-ink-500">Choose a conversation.</p>
          )}
        </section>
      </div>
    </div>
  );
}
