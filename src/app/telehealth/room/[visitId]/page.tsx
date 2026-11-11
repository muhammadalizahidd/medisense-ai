import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { TelehealthRoom } from "@/features/live/telehealth-room";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Video visit · Medisense" };

export default async function Page({ params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = await params;
  if (!(await requirePageUser(`/telehealth/room/${visitId}`, "therapist"))) return <OfflinePage />;
  return (
    <PageContainer>
      <TelehealthRoom visitId={visitId} />
    </PageContainer>
  );
}
