import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { TherapistProfilePage } from "@/features/live/therapist-directory";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Therapist · Medisense" };

export default async function TherapistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requirePageUser(`/care/therapists/${id}`, "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <TherapistProfilePage id={id} />
    </PageContainer>
  );
}
