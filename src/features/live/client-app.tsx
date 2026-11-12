"use client";

import {
  CalendarDays,
  ClipboardPlus,
  HeartPulse,
  House,
  LogOut,
  MessageCircle,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/premium";
import { AppCard, AppEmpty, AppHeader, AppSheet, PhoneFrame } from "@/features/mobile/phone-frame";
import { api, signOut, useLiveEvents, useResource, useSession } from "@/lib/live/client";
import type {
  AppointmentDto,
  ClientHomeDto,
  MessageDto,
  PublicReferralDto,
  SessionUser,
} from "@/lib/live/types";
import { PendingReferral, ReferralOverlay, SentCard, type SentReferral } from "./app-referral";
import { ErrorNote, Skeleton } from "./bits";
import { CancelVisitPanel } from "./cancel-visit";
import { ChatOverlay } from "./chat-overlay";
import { ClientVisits } from "./client-visits";
import { PatientDetailsCard, RateVisitPanel } from "./patient-panels";
import { ConversationList, useConversations, useUnreadMessages } from "./conversations";
import { PatientHome } from "./patient-home";
import { PatientProgress } from "./patient-progress";
import { SignInForm } from "./sign-in-form";

const tabs = [
  { id: "home", label: "Home", icon: House },
  { id: "visits", label: "Visits", icon: CalendarDays },
  { id: "care", label: "My care", icon: HeartPulse },
  { id: "messages", label: "Messages", icon: MessageCircle },
  { id: "me", label: "Me", icon: UserRound },
];

const frame = {
  name: "Patient app",
  description:
    "For patients and families: who their therapist is, when they're coming, and a direct line to them.",
  features: [
    "Sign in with your MRN from the care team",
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
  const [rating, setRating] = useState<AppointmentDto | null>(null);
  const [referring, setReferring] = useState(false);
  const [sent, setSent] = useState<SentReferral | null>(null);
  const [pending, setPending] = useState<{
    referral: PublicReferralDto;
    email: string;
    code: string;
  } | null>(null);
  const [formKey, setFormKey] = useState(0);
  const signedIn = user?.role === "client";
  const referralOverlay = referring ? (
    <ReferralOverlay
      onClose={() => setReferring(false)}
      onSent={(s) => {
        setSent(s);
        setReferring(false);
        setFormKey((k) => k + 1);
      }}
    />
  ) : undefined;
  const unread = useUnreadMessages(signedIn);
  const [banner, setBanner] = useState<MessageDto | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // A message from someone else, while that chat isn't open, slides in from the top.
  useLiveEvents((event) => {
    if (!signedIn || event.type !== "message") return;
    const m = event.payload.message;
    if (m.senderId === user.id || m.conversationId === chat) return;
    setBanner(m);
    clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), 4_500);
  }, signedIn);
  useEffect(() => () => clearTimeout(bannerTimer.current), []);
  const tabsWithBadges = tabs.map((t) => (t.id === "messages" ? { ...t, badge: unread } : t));

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
      <PhoneFrame
        {...frame}
        tabs={tabs}
        active="home"
        onTab={() => undefined}
        overlay={referralOverlay}
      >
        <AppHeader
          eyebrow={pending ? "Referral progress" : "Medisense"}
          title={pending ? "Your referral" : "Welcome"}
        />
        <div className="p-4">
          {user && (
            <p className="mb-3 rounded-control bg-watch-bg px-3 py-2 text-small text-watch">
              You&apos;re signed in as staff. Sign in with a patient account to use this app.
            </p>
          )}
          {pending ? (
            <PendingReferral
              referral={pending.referral}
              onBack={() => setPending(null)}
              onRefresh={async () => {
                const r = await api<{ pending?: boolean; referral?: PublicReferralDto }>(
                  "/api/auth/activate",
                  { body: { email: pending.email, code: pending.code } },
                ).catch(() => null);
                if (r?.referral) setPending({ ...pending, referral: r.referral });
                else setPending(null);
              }}
            />
          ) : (
            <>
              {sent ? (
                <SentCard sent={sent} onUseCode={() => setFormKey((k) => k + 1)} />
              ) : (
                <button
                  type="button"
                  onClick={() => setReferring(true)}
                  className="mb-3 flex w-full cursor-pointer items-center gap-3 rounded-card bg-accent-fill p-4 text-left text-on-accent shadow-overlay active:scale-99"
                >
                  <ClipboardPlus className="size-6 flex-none" aria-hidden="true" />
                  <span>
                    <span className="block text-body font-semibold">New to Medisense?</span>
                    <span className="block text-caption text-on-accent/85">
                      Make a referral. No account needed.
                    </span>
                  </span>
                </button>
              )}
              <AppCard>
                <SignInForm
                  key={formKey}
                  initialMode="activate"
                  initialEmail={sent?.appEmail ?? ""}
                  initialCode={sent?.appCode ?? ""}
                  onSignedIn={() => reload()}
                  onPending={(referral, c) => setPending({ referral, ...c })}
                />
              </AppCard>
            </>
          )}
        </div>
      </PhoneFrame>
    );
  }

  return (
    <PhoneFrame
      {...frame}
      tabs={tabsWithBadges}
      active={tab}
      onTab={(id) => {
        setTab(id);
        setChat(null);
        setCancelling(null);
        setRating(null);
      }}
      overlay={
        referralOverlay ??
        (banner && !chat ? (
          <MessageBanner
            message={banner}
            onOpen={() => {
              setChat(banner.conversationId);
              setBanner(null);
            }}
            onDismiss={() => setBanner(null)}
          />
        ) : chat ? (
          <ChatOverlay conversationId={chat} myId={user.id} onBack={() => setChat(null)} />
        ) : rating ? (
          <AppSheet title="How was your visit?" onClose={() => setRating(null)}>
            <RateVisitPanel
              visit={rating}
              onClose={() => setRating(null)}
              onDone={() => undefined}
            />
          </AppSheet>
        ) : cancelling ? (
          <AppSheet title="Cancel or change" onClose={() => setCancelling(null)}>
            <CancelVisitPanel
              visit={cancelling}
              staff={false}
              onClose={() => setCancelling(null)}
              onChanged={() => undefined}
            />
          </AppSheet>
        ) : undefined)
      }
    >
      <ClientTabs
        tab={tab}
        user={user}
        onChat={setChat}
        onCancel={setCancelling}
        onRate={setRating}
        onOpenVisits={() => setTab("visits")}
        onSignedOut={reload}
        onRefer={() => setReferring(true)}
        sent={sent}
      />
    </PhoneFrame>
  );
}

function ClientTabs({
  tab,
  user,
  onChat,
  onCancel,
  onRate,
  onOpenVisits,
  onSignedOut,
  onRefer,
  sent,
}: {
  tab: string;
  user: SessionUser;
  onChat: (id: string) => void;
  onCancel: (visit: AppointmentDto) => void;
  onRate: (visit: AppointmentDto) => void;
  onOpenVisits: () => void;
  onSignedOut: () => void;
  onRefer: () => void;
  sent: SentReferral | null;
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

  if (tab === "visits") return <ClientVisits onCancel={onCancel} onRate={onRate} />;
  if (tab === "care") return <PatientProgress data={data ?? null} />;

  if (tab === "messages") {
    return (
      <>
        <AppHeader eyebrow="Messages" title="Your care team" />
        <div className="px-4 pb-4">
          {chats.data && chats.data.conversations.length === 0 ? (
            <AppEmpty icon={MessageCircle} title="No messages yet">
              You can message your therapist here as soon as they accept. We&apos;ll let you know.
            </AppEmpty>
          ) : (
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
          )}
        </div>
      </>
    );
  }

  if (tab === "me") {
    return (
      <>
        <AppHeader eyebrow="Account" title={user.name} />
        <div className="px-4 pb-4">
          <AppCard>
            {data?.mrn && (
              <div className="mb-3 border-b border-border pb-3">
                <p className="text-caption text-ink-500">Medical record number (MRN)</p>
                <p className="font-mono text-section font-semibold">{data.mrn}</p>
                <p className="mt-1 text-caption text-ink-500">
                  Use it to sign in. Keep it private, like a password.
                </p>
              </div>
            )}
            <p className="text-caption text-ink-500">Signed in as</p>
            <p className="text-small font-semibold break-all">{user.email}</p>
          </AppCard>
          {data && (
            <PatientDetailsCard
              key={JSON.stringify([data.phone, data.emergencyContact])}
              home={data}
              onSaved={home.reload}
            />
          )}
          <AppCard title="Need another service?">
            {sent ? (
              <p className="text-small text-ink-700">
                Referral <strong>{sent.reference}</strong> sent. The care team will be in touch;
                it&apos;s added to your record once accepted.
              </p>
            ) : (
              <p className="mb-3 text-small text-ink-700">
                Ask for another therapy or assessment, for you or someone you care for.
              </p>
            )}
            <Button className="mt-2 w-full" onClick={onRefer}>
              <ClipboardPlus className="size-4" aria-hidden="true" />
              Request another service
            </Button>
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

  return (
    <PatientHome
      first={first ?? ""}
      data={data ?? null}
      conversations={chats.data?.conversations ?? []}
      onChat={onChat}
      onChange={onCancel}
      onRate={onRate}
      onOpenVisits={onOpenVisits}
    />
  );
}

/** A new message slides in at the top of the phone; tap to open the conversation. */
function MessageBanner({
  message,
  onOpen,
  onDismiss,
}: {
  message: MessageDto;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="banner-in absolute inset-x-2.5 top-12 z-40" role="status">
      <div className="flex items-center gap-3 rounded-card bg-surface p-3 shadow-overlay ring-1 ring-border">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
        >
          <Avatar name={message.senderName || "Therapist"} size={38} />
          <span className="min-w-0 flex-1">
            <span className="block text-caption font-semibold">{message.senderName}</span>
            <span className="block truncate text-small text-ink-700">{message.body}</span>
          </span>
        </button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="flex size-7 flex-none cursor-pointer items-center justify-center rounded-full text-ink-500 hover:bg-canvas"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
