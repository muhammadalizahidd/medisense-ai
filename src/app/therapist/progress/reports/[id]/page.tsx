import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { ReportComposer } from "@/features/live/report-composer";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Treatment plan � Medisense" };

async function PageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/therapist/progress/reports/${id}`, "therapist", "admin");
  if (!user) return <OfflinePage />;
  // Older links send staff of either role here; each role has its own home for reports.
  if (user.role !== "therapist") redirect(`/care/progress/reports/${id}`);
  return (
    <PageContainer>
      <ReportComposer id={id} base="/therapist/progress" />
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
