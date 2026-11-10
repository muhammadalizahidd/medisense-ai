"use client";

import { useResource } from "@/lib/live/client";
import { relativeTime } from "@/lib/live/time";
import type { ConversationDto } from "@/lib/live/types";
import { Avatar } from "@/components/ui/premium";
import { cn } from "@/lib/cn";
import { EmptyNote, ErrorNote, Skeleton } from "./bits";

/** Conversations with unread counts, refreshed whenever a message or read receipt arrives. */
export function useConversations(enabled = true) {
  return useResource<{ conversations: ConversationDto[] }>(
    enabled ? "/api/conversations" : null,
    (event) => event.type === "message" || event.type === "read" || event.type === "care",
  );
}

export function ConversationList({
  conversations,
  error,
  loading,
  onRetry,
  selected,
  onSelect,
  emptyText,
}: {
  conversations: ConversationDto[] | undefined;
  error: string | null;
  loading: boolean;
  onRetry: () => void;
  selected: string | null;
  onSelect: (id: string) => void;
  emptyText: string;
}) {
  if (error && !conversations) return <ErrorNote message={error} onRetry={onRetry} />;
  if (loading && !conversations) {
    return (
      <div className="flex flex-col gap-2 p-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  }
  if (!conversations?.length) {
    return (
      <div className="p-3">
        <EmptyNote title="No conversations yet.">{emptyText}</EmptyNote>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {conversations.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            aria-current={selected === c.id ? "true" : undefined}
            onClick={() => onSelect(c.id)}
            className={cn(
              "flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-canvas",
              selected === c.id && "bg-accent-tint",
            )}
          >
            <Avatar name={c.title} size={38} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-small font-semibold">{c.title}</span>
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
                  {c.lastMessage ?? c.subtitle}
                </span>
                {c.unread > 0 && (
                  <span className="flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-accent-fill px-1.5 text-eyebrow font-semibold text-on-accent">
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
  );
}
