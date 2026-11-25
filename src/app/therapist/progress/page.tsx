import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { TherapistReportsHub } from "@/features/live/therapist-reports-hub";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Progress and reports · Medisense" };

async function PageContent() {
  if (!(await requirePageUser("/therapist/progress", "therapist"))) return <OfflinePage />;
  return (
    <PageContainer>
      <TherapistReportsHub />
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
