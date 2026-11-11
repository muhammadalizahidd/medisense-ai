import { PageLoading } from "@/components/ui/page";
import type { Metadata } from "next";
import { Suspense } from "react";
import { MessagesPage } from "@/features/live/messages-page";
import { OfflinePage } from "@/features/live/offline-page";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Messages · Medisense" };

async function MessagesContent() {
  const user = await requirePageUser("/messages", "therapist");
  if (!user) return <OfflinePage />;
  return (
    // Full height under the top bar: the conversation list and chat scroll, not the page.
    <main className="w-full px-4 pt-4 pb-4 md:px-6 xl:px-10">
      <Suspense>
        <MessagesPage myId={user._id.toHexString()} />
      </Suspense>
    </main>
  );
}

/** The session is checked inside Suspense, so the page frame shows straight away. */
export default function Messages() {
  return (
    <Suspense fallback={<PageLoading />}>
      <MessagesContent />
    </Suspense>
  );
}
