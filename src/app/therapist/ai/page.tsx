import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { AiWorkspace } from "@/features/live/enhance-workspace";
import { OfflinePage } from "@/features/live/offline-page";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "AI assistants · Medisense" };

async function PageContent() {
  if (!(await requirePageUser("/therapist/ai", "therapist"))) return <OfflinePage />;
  return (
    <PageContainer>
      <AiWorkspace />
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
