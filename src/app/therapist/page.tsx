import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { TherapistHome } from "@/features/live/therapist-home";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "My new patients · Medisense" };

export default async function TherapistPage() {
  if (!(await requirePageUser("/therapist", "therapist"))) return <OfflinePage />;
  return (
    <PageContainer>
      <TherapistHome />
    </PageContainer>
  );
}
