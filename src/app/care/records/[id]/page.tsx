import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { RecordPage } from "@/features/live/record-page";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Clinical record · Medisense" };

async function PageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requirePageUser(`/care/records/${id}`, "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <RecordPage clientId={id} base="/care/records" />
    </PageContainer>
  );
}

/** The session is checked inside Suspense, so the page frame shows straight away. */
export default function Page(props: Parameters<typeof PageContent>[0]) {
  return (
    <Suspense fallback={<PageLoading />}>
      <PageContent {...props} />
    </Suspense>
  );
}
