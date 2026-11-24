import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { TherapistReportsHub } from "@/features/live/therapist-reports-hub";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Therapist reports · Medisense" };

async function PageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requirePageUser(`/care/reports/therapists/${id}`, "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <TherapistReportsHub therapistId={id} />
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
