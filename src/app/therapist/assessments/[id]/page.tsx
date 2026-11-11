import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/page";
import { AssessmentEditor } from "@/features/live/assessment-editor";
import { OfflinePage } from "@/features/live/offline-page";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Assessment · Medisense" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requirePageUser(`/therapist/assessments/${id}`, "therapist", "admin")))
    return <OfflinePage />;
  return (
    <PageContainer>
      <AssessmentEditor id={id} />
    </PageContainer>
  );
}
