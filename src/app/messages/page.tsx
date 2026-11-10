import type { Metadata } from "next";
import { Suspense } from "react";
import { PageContainer } from "@/components/ui/page";
import { MessagesPage } from "@/features/live/messages-page";
import { OfflinePage } from "@/features/live/offline-page";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Messages · Medisense" };

export default async function Messages() {
  const user = await requirePageUser("/messages", "therapist");
  if (!user) return <OfflinePage />;
  return (
    <PageContainer>
      <Suspense>
        <MessagesPage myId={user._id.toHexString()} />
      </Suspense>
    </PageContainer>
  );
}
