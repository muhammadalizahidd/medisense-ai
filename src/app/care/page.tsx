import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/page";
import { CareBoard } from "@/features/live/care-board";
import { OfflinePage } from "@/features/live/offline-page";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Client onboarding · Medisense" };

export default async function CarePage() {
  if (!(await requirePageUser("/care", "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <CareBoard />
    </PageContainer>
  );
}
