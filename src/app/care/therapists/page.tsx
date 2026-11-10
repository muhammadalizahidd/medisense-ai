import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { TherapistDirectory } from "@/features/live/therapist-directory";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Therapists · Medisense" };

export default async function TherapistsPage() {
  if (!(await requirePageUser("/care/therapists", "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <TherapistDirectory />
    </PageContainer>
  );
}
