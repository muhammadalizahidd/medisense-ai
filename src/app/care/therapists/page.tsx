import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { TherapistDirectory } from "@/features/live/therapist-directory";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Therapists · Medisense" };

async function TherapistsPageContent() {
  if (!(await requirePageUser("/care/therapists", "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <TherapistDirectory />
    </PageContainer>
  );
}

/** The session is checked inside Suspense, so the page frame shows straight away. */
export default function TherapistsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <TherapistsPageContent />
    </Suspense>
  );
}
