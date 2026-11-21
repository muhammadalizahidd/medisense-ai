"use client";

import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock,
  Download,
  FileText,
  Mic,
  SendHorizontal,
} from "lucide-react";
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
import type { MessageAttachment, MessageDto } from "@/lib/live/types";
import { cn } from "@/lib/cn";
import { ErrorNote, Skeleton } from "./bits";

type Pending = { tempId: string; body: string; at: string; failed: boolean };

const TYPING_SHOWS_FOR = 4_000;
const TYPING_SENDS_EVERY = 2_500;

/** Who is typing in a conversation right now, from live events. Clears itself after a pause. */
export function useTypingIndicator(conversationId: string) {
  const [typing, setTyping] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useLiveEvents((event) => {
    if (event.type === "typing" && event.payload.conversationId === conversationId) {
      setTyping(event.payload.name);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setTyping(null), TYPING_SHOWS_FOR);
    }
    // Their message arriving ends the typing.
    if (event.type === "message" && event.payload.message.conversationId === conversationId) {
      setTyping(null);
    }
  });
  useEffect(() => () => clearTimeout(timer.current), []);
  return typing;
}

/** A live conversation: history, new messages as they arrive, typing and read receipts. */
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
  const typing = useTypingIndicator(conversationId);
  const bottom = useRef<HTMLDivElement>(null);
  const lastTypingSent = useRef(0);
  const markRead = useCallback(
    () =>
      void api(`/api/conversations/${conversationId}/read`, { method: "POST" }).catch(
        () => undefined,
      ),
    [conversationId],
  );

  const load = useCallback(async () => {
    try {
      const data = await api<{ messages: MessageDto[] }>(
        `/api/conversations/${conversationId}/messages`,
      );
      setMessages(data.messages);
      setError(null);
      markRead();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load messages.");
    }
  }, [conversationId, markRead]);

  useEffect(() => {
    let cancelled = false;
    api<{ messages: MessageDto[] }>(`/api/conversations/${conversationId}/messages`)
      .then((data) => {
        if (cancelled) return;
        setMessages(data.messages);
        markRead();
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load messages.");
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, markRead]);

  useLiveEvents((event) => {
    if (event.type === "connected") void load();
    if (
      event.type === "read" &&
      event.payload.conversationId === conversationId &&
      event.payload.readerId !== myId
    ) {
      // The other person has read everything; mark ours as seen without reloading.
      setMessages(
        (list) => list?.map((m) => (m.senderId === myId ? { ...m, seen: true } : m)) ?? list,
      );
    }
    if (event.type === "message" && event.payload.message.conversationId === conversationId) {
      const incoming = event.payload.message;
      setMessages((list) =>
        list?.some((m) => m.id === incoming.id) ? list : [...(list ?? []), incoming],
      );
      if (incoming.senderId !== myId) markRead();
    }
  });

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, pending, typing]);

  async function send(body: string, tempId = crypto.randomUUID()) {
    const at = new Date().toISOString();
    setPending((p) => [
      ...p.filter((x) => x.tempId !== tempId),
      { tempId, body, at, failed: false },
    ]);
    try {
      const { message } = await api<{ message: MessageDto }>(
        `/api/conversations/${conversationId}/messages`,
        { body: { body } },
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
    lastTypingSent.current = 0;
    void send(body);
  }

  function onType(value: string) {
    setDraft(value);
    const now = Date.now();
    if (value.trim() && now - lastTypingSent.current > TYPING_SENDS_EVERY) {
      lastTypingSent.current = now;
      void api(`/api/conversations/${conversationId}/typing`, { method: "POST" }).catch(
        () => undefined,
      );
    }
  }

  function onKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  const list = messages ?? [];
  const lastMine = [...list].reverse().find((m) => m.senderId === myId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        role="log"
        aria-live="polite"
        aria-label="Messages"
        className={cn(
          "min-h-0 flex-1 overflow-y-auto bg-canvas/60",
          compact ? "no-scrollbar px-3 py-3" : "px-5 py-4",
        )}
      >
        {error && !messages ? (
          <ErrorNote message={error} onRetry={() => void load()} />
        ) : !messages ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="ml-auto h-10 w-1/2" />
          </div>
        ) : list.length === 0 && pending.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 py-10 text-center">
            <p className="text-small font-semibold">Start the conversation</p>
            <p className="text-caption text-ink-500">
              Messages arrive the moment they&apos;re sent.
            </p>
          </div>
        ) : (
          <ol className="flex flex-col">
            {list.map((m, i) => {
              const mine = m.senderId === myId;
              const prev = list[i - 1];
              const newDay = !prev || shortDate(prev.createdAt) !== shortDate(m.createdAt);
              const grouped = !newDay && prev?.senderId === m.senderId;
              return (
                <li
                  key={m.id}
                  className={cn("flex flex-col", grouped ? "mt-1" : "mt-3 first:mt-0")}
                >
                  {newDay && (
                    <span className="mb-2 self-center rounded-full bg-surface px-2.5 py-0.5 text-caption text-ink-500 shadow-hairline">
                      {shortDate(m.createdAt)}
                    </span>
                  )}
                  <Bubble
                    mine={mine}
                    body={m.body}
                    attachment={m.attachment}
                    time={timeOfDay(m.createdAt)}
                    state={mine ? (m.seen ? "seen" : "sent") : null}
                  />
                  {m.id === lastMine?.id && m.seen && (
                    <span className="mt-0.5 self-end text-label text-ink-500">Seen</span>
                  )}
                </li>
              );
            })}
            {pending.map((p) => (
              <li key={p.tempId} className="mt-1 flex flex-col">
                <Bubble
                  mine
                  body={p.body}
                  time={timeOfDay(p.at)}
                  state={p.failed ? "failed" : "sending"}
                />
                {p.failed && (
                  <button
                    type="button"
                    onClick={() => void send(p.body, p.tempId)}
                    className="mt-0.5 cursor-pointer self-end text-caption font-semibold text-over"
                  >
                    Not sent. Tap to retry
                  </button>
                )}
              </li>
            ))}
            {typing && (
              <li className="bubble-in mt-3 flex items-end gap-2" aria-live="polite">
                <span className="flex h-9 items-center gap-1 rounded-card rounded-bl-tag bg-surface px-3.5 shadow-hairline">
                  {[0, 1, 2].map((d) => (
                    <i
                      key={d}
                      aria-hidden="true"
                      className="typing-dot size-1.5 rounded-full bg-ink-500"
                    />
                  ))}
                </span>
                <span className="text-caption text-ink-500">{typing} is typing…</span>
              </li>
            )}
          </ol>
        )}
        <div ref={bottom} />
      </div>
      <form
        onSubmit={submit}
        className={cn(
          "flex items-end gap-2 border-t border-border bg-surface",
          compact ? "p-2.5" : "p-3",
        )}
      >
        <textarea
          value={draft}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={onKey}
          rows={1}
          maxLength={2000}
          aria-label="Write a message"
          placeholder="Write a message…"
          className="max-h-32 min-h-11 flex-1 resize-none rounded-card border border-border-strong bg-canvas px-4 py-2.5 text-small outline-none focus:border-accent focus:bg-surface focus:shadow-focus"
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={!draft.trim()}
          className="flex size-11 flex-none cursor-pointer items-center justify-center rounded-full bg-accent-fill text-on-accent shadow-hairline transition-transform duration-150 enabled:hover:scale-105 enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SendHorizontal className="size-5" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}

type BubbleState = "sending" | "sent" | "seen" | "failed" | null;

const fileSize = (n: number) =>
  n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;

/** A sent file, playable or viewable in place. */
function Attachment({ a, mine }: { a: MessageAttachment; mine: boolean }) {
  if (a.kind === "image")
    return (
      <a href={a.url} target="_blank" rel="noreferrer" className="mb-1.5 block">
        {/* eslint-disable-next-line @next/next/no-img-element -- local demo media */}
        <img src={a.url} alt={a.name} className="max-h-64 w-full rounded-control object-cover" />
      </a>
    );
  if (a.kind === "video")
    return (
      <video
        src={a.url}
        controls
        preload="metadata"
        className="mb-1.5 aspect-video w-full rounded-control bg-call-stage"
      />
    );
  const Icon = a.kind === "audio" ? Mic : FileText;
  return (
    <div
      className={cn(
        "mb-1.5 flex flex-col gap-2 rounded-control p-2.5",
        mine ? "bg-on-accent/15" : "bg-sunken",
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "flex size-9 flex-none items-center justify-center rounded-control",
            mine ? "bg-on-accent/20" : "bg-surface text-accent",
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{a.name}</span>
          <span className={cn("block text-label", mine ? "text-on-accent/80" : "text-ink-500")}>
            {a.kind === "audio" ? "Voice note" : "PDF document"} · {fileSize(a.size)}
          </span>
        </span>
        {a.kind === "document" && (
          <a
            href={a.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${a.name}`}
            className="flex size-8 flex-none items-center justify-center rounded-full hover:bg-on-accent/10"
          >
            <Download className="size-4" aria-hidden="true" />
          </a>
        )}
      </div>
      {a.kind === "audio" && (
        <audio src={a.url} controls preload="metadata" className="h-9 w-64 max-w-full" />
      )}
    </div>
  );
}

function Bubble({
  mine,
  body,
  attachment = null,
  time,
  state,
}: {
  mine: boolean;
  body: string;
  attachment?: MessageAttachment | null;
  time: string;
  state: BubbleState;
}) {
  const Icon =
    state === "sending"
      ? Clock
      : state === "seen"
        ? CheckCheck
        : state === "failed"
          ? AlertCircle
          : Check;
  return (
    <div
      className={cn(
        "bubble-in max-w-4/5 px-3.5 py-2 text-small shadow-hairline",
        mine
          ? "self-end rounded-card rounded-br-tag bg-accent-fill text-on-accent"
          : "self-start rounded-card rounded-bl-tag bg-surface text-ink-900",
      )}
    >
      {attachment && <Attachment a={attachment} mine={mine} />}
      {body && <p className="break-words whitespace-pre-wrap">{body}</p>}
      <p
        className={cn(
          "mt-0.5 flex items-center justify-end gap-1 text-label",
          mine ? "text-on-accent/80" : "text-ink-500",
        )}
      >
        {time}
        {state && (
          <Icon
            aria-label={
              state === "seen"
                ? "Seen"
                : state === "sending"
                  ? "Sending"
                  : state === "failed"
                    ? "Not sent"
                    : "Sent"
            }
            className="size-3.5"
            strokeWidth={2.25}
          />
        )}
      </p>
    </div>
  );
}
