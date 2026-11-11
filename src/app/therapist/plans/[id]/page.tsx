import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/page";
import { PlanEditor } from "@/features/live/plan-editor";
import { OfflinePage } from "@/features/live/offline-page";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Treatment plan · Medisense" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requirePageUser(`/therapist/plans/${id}`, "therapist", "admin")))
    return <OfflinePage />;
  return (
    <PageContainer>
      <PlanEditor id={id} />
    </PageContainer>
  );
}
