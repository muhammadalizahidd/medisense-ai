import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { PatientRequests } from "@/features/live/patient-requests";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Patient requests · Medisense" };

async function PageContent() {
  if (!(await requirePageUser("/care/patient-requests", "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <PatientRequests />
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
