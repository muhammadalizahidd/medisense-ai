import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { DocQueue } from "@/features/live/doc-queue";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Treatment plans � Medisense" };

async function PageContent() {
  if (!(await requirePageUser("/therapist/documentation", "therapist"))) return <OfflinePage />;
  return (
    <PageContainer>
      <DocQueue base="/therapist/documentation" />
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
