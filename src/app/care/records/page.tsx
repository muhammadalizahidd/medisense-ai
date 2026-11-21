import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { RecordList } from "@/features/live/record-list";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Clinical records · Medisense" };

async function PageContent() {
  if (!(await requirePageUser("/care/records", "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <RecordList base="/care/records" />
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
