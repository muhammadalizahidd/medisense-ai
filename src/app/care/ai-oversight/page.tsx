import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { AiOversight } from "@/features/live/enhance-public";
import { OfflinePage } from "@/features/live/offline-page";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "AI oversight · Medisense" };

async function PageContent() {
  if (!(await requirePageUser("/care/ai-oversight", "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <AiOversight />
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
