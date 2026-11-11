import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { TherapistPatient } from "@/features/live/therapist-patient";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Patient · Medisense" };

async function TherapistPatientPageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requirePageUser(`/therapist/patients/${id}`, "therapist"))) return <OfflinePage />;
  return (
    <PageContainer>
      <TherapistPatient clientId={id} />
    </PageContainer>
  );
}

/** The session is checked inside Suspense, so the page frame shows straight away. */
export default function TherapistPatientPage(
  props: Parameters<typeof TherapistPatientPageContent>[0],
) {
  return (
    <Suspense fallback={<PageLoading />}>
      <TherapistPatientPageContent {...props} />
    </Suspense>
  );
}
