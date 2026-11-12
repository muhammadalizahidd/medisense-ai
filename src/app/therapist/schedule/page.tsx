import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { MySchedule } from "@/features/live/my-schedule";
import { OfflinePage } from "@/features/live/offline-page";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "My schedule · Medisense" };

async function MyScheduleContent() {
  if (!(await requirePageUser("/therapist/schedule", "therapist"))) return <OfflinePage />;
  return (
    <PageContainer>
      <MySchedule />
    </PageContainer>
  );
}

/** S05-06: the clinician's own agenda. */
export default function MySchedulePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <MyScheduleContent />
    </Suspense>
  );
}
