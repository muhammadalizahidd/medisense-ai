import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { TherapistPatient } from "@/features/live/therapist-patient";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Patient · Medisense" };

export default async function TherapistPatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await requirePageUser(`/therapist/patients/${id}`, "therapist"))) return <OfflinePage />;
  return (
    <PageContainer>
      <TherapistPatient clientId={id} />
    </PageContainer>
  );
}
