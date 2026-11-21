import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { TherapistWorkspace } from "@/features/live/workspace-hub";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "My workspace · Medisense" };

async function PageContent() {
  if (!(await requirePageUser("/therapist/workspace", "therapist"))) return <OfflinePage />;
  return (
    <PageContainer>
      <TherapistWorkspace />
    </PageContainer>
  );
}

/** Module 10: the clinician's whole working day in one place. */
export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <PageContent />
    </Suspense>
  );
}
