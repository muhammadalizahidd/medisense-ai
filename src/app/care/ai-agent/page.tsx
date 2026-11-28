import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { AdminAgent } from "@/features/live/admin-agent";
import { OfflinePage } from "@/features/live/offline-page";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Work agent · Medisense" };

async function PageContent() {
  if (!(await requirePageUser("/care/ai-agent", "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <AdminAgent />
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
