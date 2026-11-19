import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { CareBoard } from "@/features/live/care-board";
import { OfflinePage } from "@/features/live/offline-page";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Patients · Medisense" };

async function CarePageContent() {
  if (!(await requirePageUser("/care", "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <CareBoard />
    </PageContainer>
  );
}

/** The session is checked inside Suspense, so the page frame shows straight away. */
export default function CarePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <CarePageContent />
    </Suspense>
  );
}
