import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { ClientDetail } from "@/features/live/client-detail";
import { OfflinePage } from "@/features/live/offline-page";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Patient · Medisense" };

async function CareClientPageContent({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  if (!(await requirePageUser(`/care/${clientId}`, "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <ClientDetail clientId={clientId} />
    </PageContainer>
  );
}

/** The session is checked inside Suspense, so the page frame shows straight away. */
export default function CareClientPage(props: Parameters<typeof CareClientPageContent>[0]) {
  return (
    <Suspense fallback={<PageLoading />}>
      <CareClientPageContent {...props} />
    </Suspense>
  );
}
