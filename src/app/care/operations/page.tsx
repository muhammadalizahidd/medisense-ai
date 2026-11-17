import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { OperationsHub } from "@/features/live/ops-hub";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Operations · Medisense" };

async function PageContent() {
  if (!(await requirePageUser("/care/operations", "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <OperationsHub />
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
