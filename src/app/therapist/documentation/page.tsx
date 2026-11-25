import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { NotesPage } from "@/features/live/notes-page";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Notes · Medisense" };

async function PageContent() {
  if (!(await requirePageUser("/therapist/documentation", "therapist"))) return <OfflinePage />;
  return (
    <PageContainer>
      <NotesPage />
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
