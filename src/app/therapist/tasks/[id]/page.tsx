import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { TaskPage } from "@/features/live/ops-task";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Task · Medisense" };

async function PageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requirePageUser(`/therapist/tasks/${id}`, "therapist"))) return <OfflinePage />;
  return (
    <PageContainer>
      <TaskPage id={id} back="/therapist/tasks" />
    </PageContainer>
  );
}

/** The session is checked inside Suspense, so the page frame shows straight away. */
export default function Page(props: Parameters<typeof PageContent>[0]) {
  return (
    <Suspense fallback={<PageLoading />}>
      <PageContent {...props} />
    </Suspense>
  );
}
