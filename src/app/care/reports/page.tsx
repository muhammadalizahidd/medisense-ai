import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { ReportsHub } from "@/features/live/reports-hub";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Reports and analytics · Medisense" };

async function PageContent() {
  if (!(await requirePageUser("/care/reports", "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <ReportsHub />
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
