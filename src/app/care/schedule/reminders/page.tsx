import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { ScheduleBoard } from "@/features/live/schedule-board";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Reminders · Medisense" };

async function Content() {
  if (!(await requirePageUser("/care/schedule/reminders", "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <ScheduleBoard section="reminders" />
    </PageContainer>
  );
}

/** Scheduling: Reminders, its own page in the Scheduling menu. */
export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Content />
    </Suspense>
  );
}
