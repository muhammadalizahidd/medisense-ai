import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { RecordingsPage } from "@/features/live/recordings-page";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Recordings · Medisense" };

async function PageContent() {
  if (!(await requirePageUser("/telehealth/recordings", "therapist", "admin")))
    return <OfflinePage />;
  return (
    <PageContainer>
      <RecordingsPage />
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
