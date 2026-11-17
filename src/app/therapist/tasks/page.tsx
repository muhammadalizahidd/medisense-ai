import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { MyTasks } from "@/features/live/ops-task";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "My tasks · Medisense" };

async function PageContent() {
  if (!(await requirePageUser("/therapist/tasks", "therapist"))) return <OfflinePage />;
  return (
    <PageContainer>
      <MyTasks />
    </PageContainer>
  );
}

/** The session is checked inside Suspense, so the page frame shows straight away. */
export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <PageContent />
    </Suspense>
  );
}
