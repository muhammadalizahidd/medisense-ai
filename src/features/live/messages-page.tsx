"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page";
import { cn } from "@/lib/cn";
import { LiveBadge } from "./bits";
import { ChatThread } from "./chat-thread";
import { ConversationList, useConversations } from "./conversations";

export function MessagesPage({ myId }: { myId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { data, error, loading, reload } = useConversations();
  const conversations = data?.conversations;
  const selected = params.get("c") ?? conversations?.[0]?.id ?? null;
  const current = conversations?.find((c) => c.id === selected);
  const open = (id: string) => router.replace(`/messages?c=${id}`, { scroll: false });

  return (
    <>
      <PageHeader
        eyebrow="Messages"
        title="Patient messages"
        description="Chat with your patients and their families. Messages arrive as they're sent."
        actions={<LiveBadge />}
      />
      <div className="grid h-[min(70dvh,720px)] overflow-hidden rounded-card border border-border bg-surface surface-lift md:grid-cols-[320px_1fr]">
        <aside
          aria-label="Conversations"
          className={cn(
            "min-h-0 overflow-y-auto border-border md:border-r",
            params.get("c") && "hidden md:block",
          )}
        >
          <ConversationList
            conversations={conversations}
            error={error}
            loading={loading}
            onRetry={reload}
            selected={selected}
            onSelect={open}
            emptyText="A conversation opens when you accept a new patient."
          />
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
                  onClick={() => router.replace("/messages")}
                  className="flex size-8 cursor-pointer items-center justify-center rounded-control hover:bg-canvas md:hidden"
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                </button>
                <div>
                  <h2 className="text-small font-semibold">{current.title}</h2>
                  <p className="text-caption text-ink-500">{current.subtitle}</p>
                </div>
              </header>
              <ChatThread key={current.id} conversationId={current.id} myId={myId} />
            </>
          ) : (
            <p className="m-auto text-small text-ink-500">Choose a conversation.</p>
          )}
        </section>
      </div>
    </>
  );
}
