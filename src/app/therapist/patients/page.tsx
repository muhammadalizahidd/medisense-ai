import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { PatientList } from "@/features/live/patient-list";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Patients · Medisense" };

async function PageContent() {
  if (!(await requirePageUser("/therapist/patients", "therapist"))) return <OfflinePage />;
  return (
    <PageContainer>
      <PatientList />
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
