import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { CoordHub } from "@/features/live/coord-hub";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Treatment plans � Medisense" };

async function PageContent() {
  if (!(await requirePageUser("/care/coordination", "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <CoordHub base="/care/coordination" />
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
