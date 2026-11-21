import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { FinanceHub } from "@/features/live/finance-hub";
import { OfflinePage } from "@/features/live/offline-page";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Billing and finance · Medisense" };

async function PageContent() {
  if (!(await requirePageUser("/care/billing", "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <FinanceHub />
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
