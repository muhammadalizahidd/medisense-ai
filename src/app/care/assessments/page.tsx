import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { AssessQueue } from "@/features/live/assess-queue";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Assessments · Medisense" };

async function PageContent() {
  if (!(await requirePageUser("/care/assessments", "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <AssessQueue base="/care/assessments" />
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
