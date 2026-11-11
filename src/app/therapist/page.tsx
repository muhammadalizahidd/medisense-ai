import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { TherapistHome } from "@/features/live/therapist-home";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "My new patients · Medisense" };

async function TherapistPageContent() {
  if (!(await requirePageUser("/therapist", "therapist"))) return <OfflinePage />;
  return (
    <PageContainer>
      <TherapistHome />
    </PageContainer>
  );
}

/** The session is checked inside Suspense, so the page frame shows straight away. */
export default function TherapistPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <TherapistPageContent />
    </Suspense>
  );
}
