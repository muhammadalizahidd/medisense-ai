import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { ScheduleBoard } from "@/features/live/schedule-board";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Exceptions and audit · Medisense" };

async function Content() {
  if (!(await requirePageUser("/care/schedule/exceptions", "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <ScheduleBoard section="exceptions" />
    </PageContainer>
  );
}

/** Scheduling: Exceptions and audit, its own page in the Scheduling menu. */
export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Content />
    </Suspense>
  );
}
