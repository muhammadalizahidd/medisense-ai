"use client";

import { ButtonLink } from "@/components/ui/button";
import { AppCard, AppHeader } from "@/features/mobile/phone-frame";
import { useResource, useSession } from "@/lib/live/client";
import type { TherapistHomeDto } from "@/lib/live/types";
import { ErrorNote, Skeleton } from "./bits";
import { ChatOverlay } from "./chat-overlay";
import { ConversationList, useConversations } from "./conversations";
import { RequestCard } from "./therapist-home";

/** The staff app's live tab: new client requests and client messages, for the signed-in therapist. */
export function StaffInbox({ onChat }: { onChat: (conversationId: string) => void }) {
  const { user, loading } = useSession();
  const isTherapist = user?.role === "therapist";
  const home = useResource<TherapistHomeDto>(
    isTherapist ? "/api/care/therapist" : null,
    (e) => e.type === "care" || e.type === "notification",
  );
  const chats = useConversations(isTherapist);

  if (loading)
    return (
      <div className="p-4 pt-12">
        <Skeleton className="h-32" />
      </div>
    );
  if (!isTherapist) {
    return (
      <>
        <AppHeader eyebrow="Inbox" title="New clients and messages" />
        <div className="p-4">
          <AppCard>
            <p className="mb-3 text-small text-ink-700">
              Sign in with your therapist account to see new client requests and chat with clients.
            </p>
            <ButtonLink href="/login?next=/mobile/staff" variant="primary" size="sm">
              Sign in
            </ButtonLink>
          </AppCard>
        </div>
      </>
    );
  }

  const requests = home.data?.requests ?? [];
  return (
    <>
      <AppHeader eyebrow="Inbox" title="New clients and messages" />
      <div className="p-4">
        {home.error && !home.data && <ErrorNote message={home.error} onRetry={home.reload} />}
        <h3 className="mb-2 text-small font-semibold">
          New client requests{requests.length ? ` (${requests.length})` : ""}
        </h3>
        {!home.data ? (
          <Skeleton className="mb-3 h-24" />
        ) : requests.length === 0 ? (
          <AppCard>
            <p className="text-small text-ink-700">No new requests right now.</p>
          </AppCard>
        ) : (
          <ul className="mb-3 flex flex-col gap-3">
            {requests.map((r) => (
              <RequestCard key={r.id} request={r} onDone={home.reload} onAccepted={onChat} />
            ))}
          </ul>
        )}
        <h3 className="mt-4 mb-2 text-small font-semibold">Messages</h3>
        <AppCard className="overflow-hidden p-0!">
          <ConversationList
            conversations={chats.data?.conversations}
            error={chats.error}
            loading={chats.loading}
            onRetry={chats.reload}
            selected={null}
            onSelect={onChat}
            emptyText="A conversation opens when you accept a client."
          />
        </AppCard>
      </div>
    </>
  );
}

export function StaffChatOverlay({
  conversationId,
  onBack,
}: {
  conversationId: string;
  onBack: () => void;
}) {
  const { user } = useSession();
  if (!user) return null;
  return <ChatOverlay conversationId={conversationId} myId={user.id} onBack={onBack} />;
}
