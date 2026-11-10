"use client";

import { ArrowLeft } from "lucide-react";
import { Avatar } from "@/components/ui/premium";
import { useLiveStatus } from "@/lib/live/client";
import { cn } from "@/lib/cn";
import { ChatThread, useTypingIndicator } from "./chat-thread";
import { useConversations } from "./conversations";

/** A full-screen conversation inside the phone apps. */
export function ChatOverlay({
  conversationId,
  myId,
  onBack,
}: {
  conversationId: string;
  myId: string;
  onBack: () => void;
}) {
  const { data } = useConversations();
  const current = data?.conversations.find((c) => c.id === conversationId);
  const typing = useTypingIndicator(conversationId);
  const status = useLiveStatus();
  const title = current?.title ?? "Messages";

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-surface">
      <header className="page-hero flex items-center gap-3 rounded-none! px-3! pt-12! pb-3!">
        <button
          type="button"
          aria-label="Back"
          onClick={onBack}
          className="on-light flex size-9 flex-none cursor-pointer items-center justify-center rounded-full bg-surface/90 text-ink-900 hover:bg-surface"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </button>
        <span className="relative flex-none">
          <Avatar name={title} size={40} />
          <i
            aria-hidden="true"
            className={cn(
              "absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-surface",
              status === "live" ? "bg-healthy-dot" : "bg-monitor-dot",
            )}
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold">{title}</p>
          <p role="status" className="truncate text-caption">
            {typing
              ? "typing…"
              : status === "live"
                ? `${current?.subtitle ?? ""} · connected live`
                : "Reconnecting…"}
          </p>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <ChatThread conversationId={conversationId} myId={myId} compact />
      </div>
    </div>
  );
}
