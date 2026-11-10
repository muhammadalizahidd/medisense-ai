"use client";

import { ArrowLeft } from "lucide-react";
import { ChatThread } from "./chat-thread";
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
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-surface">
      <header className="flex items-center gap-2 border-b border-border px-3 pt-11 pb-2.5">
        <button
          type="button"
          aria-label="Back"
          onClick={onBack}
          className="flex size-9 cursor-pointer items-center justify-center rounded-full hover:bg-canvas"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-small font-semibold">{current?.title ?? "Messages"}</p>
          <p className="truncate text-caption text-ink-500">{current?.subtitle}</p>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <ChatThread conversationId={conversationId} myId={myId} compact />
      </div>
    </div>
  );
}
