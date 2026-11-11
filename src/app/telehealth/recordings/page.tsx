import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { RecordingsPage } from "@/features/live/recordings-page";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Recordings · Medisense" };

export default async function Page() {
  if (!(await requirePageUser("/telehealth/recordings", "therapist", "admin")))
    return <OfflinePage />;
  return (
    <PageContainer>
      <RecordingsPage />
    </PageContainer>
  );
}
