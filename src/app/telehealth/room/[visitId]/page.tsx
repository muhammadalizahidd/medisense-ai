import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { TelehealthRoom } from "@/features/live/telehealth-room";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Video visit · Medisense" };

async function PageContent({ params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = await params;
  if (!(await requirePageUser(`/telehealth/room/${visitId}`, "therapist"))) return <OfflinePage />;
  return (
    <PageContainer>
      <TelehealthRoom visitId={visitId} />
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
