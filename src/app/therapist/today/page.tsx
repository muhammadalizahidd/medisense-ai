import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { TodayPage } from "@/features/live/today-page";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Today · Medisense" };

async function PageContent() {
  if (!(await requirePageUser("/therapist/today", "therapist"))) return <OfflinePage />;
  return (
    <PageContainer>
      <TodayPage />
    </PageContainer>
  );
}

/** The session is checked inside Suspense, so the page frame shows straight away. */
export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <PageContent />
    </Suspense>
  );
}
