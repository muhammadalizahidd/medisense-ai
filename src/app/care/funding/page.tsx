import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { FundingOverview } from "@/features/live/funding-overview";
import { OfflinePage } from "@/features/live/offline-page";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Funding and agreements · Medisense" };

async function FundingContent() {
  if (!(await requirePageUser("/care/funding", "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <FundingOverview />
    </PageContainer>
  );
}

/** Module 06: NDIS funding and service agreements. */
export default function FundingPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <FundingContent />
    </Suspense>
  );
}
