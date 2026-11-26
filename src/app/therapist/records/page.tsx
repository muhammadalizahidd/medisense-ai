import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { ClinicalHub } from "@/features/live/clinical-hub";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Clinical · Medisense" };

async function PageContent() {
  if (!(await requirePageUser("/therapist/records", "therapist"))) return <OfflinePage />;
  return (
    <PageContainer>
      <ClinicalHub area="therapist" />
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
