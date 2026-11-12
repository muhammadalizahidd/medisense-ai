import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { ScheduleBoard } from "@/features/live/schedule-board";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Scheduling · Medisense" };

async function ScheduleContent() {
  if (!(await requirePageUser("/care/schedule", "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <ScheduleBoard />
    </PageContainer>
  );
}

/** Module 05: the scheduling board. The session is checked inside Suspense. */
export default function SchedulePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ScheduleContent />
    </Suspense>
  );
}
