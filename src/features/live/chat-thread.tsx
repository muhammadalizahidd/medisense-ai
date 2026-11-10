"use client";

import { SendHorizontal } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { api, useLiveEvents } from "@/lib/live/client";
import { shortDate, timeOfDay } from "@/lib/live/time";
import type { MessageDto } from "@/lib/live/types";
import { cn } from "@/lib/cn";
import { ErrorNote, Skeleton } from "./bits";

type Pending = { tempId: string; body: string; failed: boolean };

/** A live conversation: history, new messages as they arrive, and a composer. */
export function ChatThread({
  conversationId,
  myId,
  compact = false,
}: {
  conversationId: string;
  myId: string;
  compact?: boolean;
}) {
  const [messages, setMessages] = useState<MessageDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ messages: MessageDto[] }>(
        `/api/conversations/${conversationId}/messages`,
      );
      setMessages(data.messages);
      setError(null);
      void api(`/api/conversations/${conversationId}/read`, { method: "POST" }).catch(
        () => undefined,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load messages.");
    }
  }, [conversationId]);

  useEffect(() => {
    let cancelled = false;
    api<{ messages: MessageDto[] }>(`/api/conversations/${conversationId}/messages`)
      .then((data) => {
        if (cancelled) return;
        setMessages(data.messages);
        void api(`/api/conversations/${conversationId}/read`, { method: "POST" }).catch(
          () => undefined,
        );
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load messages.");
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useLiveEvents((event) => {
    if (event.type === "connected") void load();
    if (event.type === "read" && event.payload.conversationId === conversationId) void load();
    if (event.type === "message" && event.payload.message.conversationId === conversationId) {
      const incoming = event.payload.message;
      setMessages((list) =>
        list?.some((m) => m.id === incoming.id) ? list : [...(list ?? []), incoming],
      );
      if (incoming.senderId !== myId) {
        void api(`/api/conversations/${conversationId}/read`, { method: "POST" }).catch(
          () => undefined,
        );
      }
    }
  });

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, pending]);

  async function send(body: string, tempId = crypto.randomUUID()) {
    setPending((p) => [...p.filter((x) => x.tempId !== tempId), { tempId, body, failed: false }]);
    try {
      const { message } = await api<{ message: MessageDto }>(
        `/api/conversations/${conversationId}/messages`,
        {
          body: { body },
        },
      );
      setMessages((list) =>
        list?.some((m) => m.id === message.id) ? list : [...(list ?? []), message],
      );
      setPending((p) => p.filter((x) => x.tempId !== tempId));
    } catch {
      setPending((p) => p.map((x) => (x.tempId === tempId ? { ...x, failed: true } : x)));
    }
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    void send(body);
  }

  function onKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  const lastMine = [...(messages ?? [])].reverse().find((m) => m.senderId === myId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        role="log"
        aria-live="polite"
        aria-label="Messages"
        className={cn("min-h-0 flex-1 overflow-y-auto", compact ? "px-3 py-3" : "px-5 py-4")}
      >
        {error && !messages ? (
          <ErrorNote message={error} onRetry={() => void load()} />
        ) : !messages ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="ml-auto h-10 w-1/2" />
          </div>
        ) : messages.length === 0 && pending.length === 0 ? (
          <p className="py-10 text-center text-small text-ink-500">
            No messages yet. Say hello to get things started.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {messages.map((m, i) => {
              const mine = m.senderId === myId;
              const newDay =
                i === 0 ||
                shortDate(messages[i - 1]?.createdAt ?? m.createdAt) !== shortDate(m.createdAt);
              return (
                <li key={m.id} className="flex flex-col">
                  {newDay && (
                    <span className="my-2 self-center rounded-full bg-canvas px-2.5 py-0.5 text-caption text-ink-500">
                      {shortDate(m.createdAt)}
                    </span>
                  )}
                  <Bubble mine={mine} body={m.body} meta={timeOfDay(m.createdAt)} />
                  {m.id === lastMine?.id && m.seen && (
                    <span className="mt-0.5 self-end text-caption text-ink-500">Seen</span>
                  )}
                </li>
              );
            })}
            {pending.map((p) => (
              <li key={p.tempId} className="flex flex-col">
                <Bubble mine body={p.body} meta={p.failed ? "Not sent" : "Sending…"} faded />
                {p.failed && (
                  <button
                    type="button"
                    onClick={() => void send(p.body, p.tempId)}
                    className="mt-0.5 cursor-pointer self-end text-caption font-semibold text-over"
                  >
                    Tap to retry
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
        <div ref={bottom} />
      </div>
      <form
        onSubmit={submit}
        className={cn(
          "flex items-end gap-2 border-t border-border bg-surface",
          compact ? "p-2" : "p-3",
        )}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          rows={1}
          maxLength={2000}
          aria-label="Write a message"
          placeholder="Write a message"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-control border border-border-strong bg-surface-raised px-3 py-2 text-small outline-none focus:border-accent focus:shadow-focus"
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={!draft.trim()}
          className="flex size-10 flex-none cursor-pointer items-center justify-center rounded-control bg-accent-fill text-on-accent hover:bg-accent-fill-hover disabled:cursor-not-allowed disabled:opacity-45"
        >
          <SendHorizontal className="size-4.5" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}

function Bubble({
  mine,
  body,
  meta,
  faded,
}: {
  mine: boolean;
  body: string;
  meta: string;
  faded?: boolean;
}) {
  return (
    <div
      className={cn(
        "max-w-4/5 rounded-card px-3.5 py-2 text-small",
        mine
          ? "self-end rounded-br-tag bg-accent-fill text-on-accent"
          : "self-start rounded-bl-tag bg-canvas text-ink-900",
        faded && "opacity-70",
      )}
    >
      <p className="break-words whitespace-pre-wrap">{body}</p>
      <p
        className={cn(
          "mt-0.5 text-right text-eyebrow",
          mine ? "text-on-accent/80" : "text-ink-500",
        )}
      >
        {meta}
      </p>
    </div>
  );
}
