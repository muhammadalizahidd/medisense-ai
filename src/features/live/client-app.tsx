"use client";

import { CalendarDays, House, LogOut, MessageCircle, UserRound } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/premium";
import { AppCard, AppHeader, AppSheet, PhoneFrame } from "@/features/mobile/phone-frame";
import { signOut, useResource, useSession } from "@/lib/live/client";
import { practitioner } from "@/lib/live/catalogue";
import { slotLabel } from "@/lib/live/time";
import type { AppointmentDto, ClientHomeDto, SessionUser } from "@/lib/live/types";
import { ErrorNote, Skeleton } from "./bits";
import { CancelVisitPanel } from "./cancel-visit";
import { ChatOverlay } from "./chat-overlay";
import { ClientVisits } from "./client-visits";
import { ConversationList, useConversations } from "./conversations";
import { SignInForm } from "./sign-in-form";

const tabs = [
  { id: "home", label: "Home", icon: House },
  { id: "visits", label: "Visits", icon: CalendarDays },
  { id: "messages", label: "Messages", icon: MessageCircle },
  { id: "me", label: "Me", icon: UserRound },
];

const frame = {
  name: "Client app",
  description:
    "For clients and families: who their therapist is, when they're coming, and a direct line to them.",
  features: [
    "Activate with the code from the care team",
    "See your therapist as soon as they accept",
    "Upcoming home visits in one place",
    "Message your therapist in real time",
  ],
};

export function ClientApp() {
  const { user, loading, reload } = useSession();
  const [tab, setTab] = useState("home");
  const [chat, setChat] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<AppointmentDto | null>(null);
  const signedIn = user?.role === "client";

  if (loading) {
    return (
      <PhoneFrame {...frame} tabs={tabs} active={tab} onTab={setTab}>
        <div className="p-4">
          <Skeleton className="h-40" />
        </div>
      </PhoneFrame>
    );
  }

  if (!signedIn) {
    return (
      <PhoneFrame {...frame} tabs={tabs} active="home" onTab={() => undefined}>
        <AppHeader eyebrow="Medisense" title="Welcome" />
        <div className="p-4">
          {user && (
            <p className="mb-3 rounded-control bg-monitor-bg px-3 py-2 text-small text-monitor">
              You&apos;re signed in as staff. Sign in with a client account to use this app.
            </p>
          )}
          <AppCard>
            <SignInForm initialMode="activate" onSignedIn={() => reload()} />
          </AppCard>
        </div>
      </PhoneFrame>
    );
  }

  return (
    <PhoneFrame
      {...frame}
      tabs={tabs}
      active={tab}
      onTab={(id) => {
        setTab(id);
        setChat(null);
        setCancelling(null);
      }}
      overlay={
        chat ? (
          <ChatOverlay conversationId={chat} myId={user.id} onBack={() => setChat(null)} />
        ) : cancelling ? (
          <AppSheet title="Cancel or change" onClose={() => setCancelling(null)}>
            <CancelVisitPanel
              visit={cancelling}
              staff={false}
              onClose={() => setCancelling(null)}
              onChanged={() => undefined}
            />
          </AppSheet>
        ) : undefined
      }
    >
      <ClientTabs
        tab={tab}
        user={user}
        onChat={setChat}
        onCancel={setCancelling}
        onSignedOut={reload}
      />
    </PhoneFrame>
  );
}

function ClientTabs({
  tab,
  user,
  onChat,
  onCancel,
  onSignedOut,
}: {
  tab: string;
  user: SessionUser;
  onChat: (id: string) => void;
  onCancel: (visit: AppointmentDto) => void;
  onSignedOut: () => void;
}) {
  const home = useResource<ClientHomeDto>(
    "/api/care/me",
    (e) => e.type === "care" || e.type === "notification",
  );
  const chats = useConversations();
  const first = user.name.split(" ")[0];

  if (home.error && !home.data)
    return (
      <div className="p-4 pt-12">
        <ErrorNote message={home.error} onRetry={home.reload} />
      </div>
    );
  const data = home.data;

  if (tab === "visits") return <ClientVisits onCancel={onCancel} />;

  if (tab === "messages") {
    return (
      <>
        <AppHeader eyebrow="Messages" title="Your care team" />
        <div className="p-4">
          <AppCard className="overflow-hidden p-0!">
            <ConversationList
              conversations={chats.data?.conversations}
              error={chats.error}
              loading={chats.loading}
              onRetry={chats.reload}
              selected={null}
              onSelect={onChat}
              emptyText="You can message your therapist once they accept."
            />
          </AppCard>
        </div>
      </>
    );
  }

  if (tab === "me") {
    return (
      <>
        <AppHeader eyebrow="Account" title={user.name} />
        <div className="p-4">
          <AppCard>
            <p className="text-caption text-ink-500">Signed in as</p>
            <p className="text-small font-semibold break-all">{user.email}</p>
          </AppCard>
          <Button
            className="w-full"
            onClick={async () => {
              await signOut();
              onSignedOut();
            }}
          >
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </>
    );
  }

  const waiting = data?.needs.filter((n) => n.status !== "assigned") ?? [];
  const next = data?.upcoming[0];
  return (
    <>
      <AppHeader eyebrow="Welcome back" title={`Hi ${first}`} />
      <div className="p-4">
        {!data ? (
          <Skeleton className="h-32" />
        ) : (
          <>
            {next && (
              <AppCard title="Next visit">
                <p className="headline text-h2">{slotLabel(next.start)}</p>
                <p className="text-caption text-ink-700">
                  {next.therapistName} · {next.discipline} · at home
                </p>
              </AppCard>
            )}
            {data.team.map((t) => (
              <AppCard key={t.discipline}>
                <div className="flex items-center gap-3">
                  <Avatar name={t.therapistName} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="text-small font-semibold">{t.therapistName}</p>
                    <p className="text-caption text-ink-700">
                      Your {practitioner[t.discipline].toLowerCase()}
                    </p>
                  </div>
                  {t.conversationId && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => t.conversationId && onChat(t.conversationId)}
                    >
                      Message
                    </Button>
                  )}
                </div>
              </AppCard>
            ))}
            {waiting.map((n) => (
              <AppCard key={n.discipline} title={n.discipline}>
                <p className="text-small text-ink-700">
                  {n.status === "waiting"
                    ? `We've asked ${n.therapistName ?? "a therapist"} to be your ${practitioner[n.discipline].toLowerCase()}. You'll see them here as soon as they accept.`
                    : "We're finding the right therapist for you. You'll hear from us soon."}
                </p>
              </AppCard>
            ))}
          </>
        )}
      </div>
    </>
  );
}
