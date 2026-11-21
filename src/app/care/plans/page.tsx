import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { PlanList } from "@/features/live/plan-list";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Treatment plans � Medisense" };

async function PageContent() {
  if (!(await requirePageUser("/care/plans", "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <PlanList base="/care/plans" />
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
