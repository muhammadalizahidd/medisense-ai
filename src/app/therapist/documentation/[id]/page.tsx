import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { DocWorkspace } from "@/features/live/doc-workspace";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Treatment plan � Medisense" };

async function PageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/therapist/documentation/${id}`, "therapist", "admin");
  if (!user) return <OfflinePage />;
  // Older links send staff of either role here; each role has its own home for notes.
  if (user.role !== "therapist") redirect(`/care/documentation/${id}`);
  return (
    <PageContainer>
      <DocWorkspace id={id} base="/therapist/documentation" />
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
