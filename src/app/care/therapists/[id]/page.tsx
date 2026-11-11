import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { TherapistProfilePage } from "@/features/live/therapist-directory";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Therapist · Medisense" };

async function TherapistPageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requirePageUser(`/care/therapists/${id}`, "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <TherapistProfilePage id={id} />
    </PageContainer>
  );
}

/** The session is checked inside Suspense, so the page frame shows straight away. */
export default function TherapistPage(props: Parameters<typeof TherapistPageContent>[0]) {
  return (
    <Suspense fallback={<PageLoading />}>
      <TherapistPageContent {...props} />
    </Suspense>
  );
}
