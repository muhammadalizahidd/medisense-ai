import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { SessionList } from "@/features/live/session-list";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Treatment plans � Medisense" };

async function PageContent() {
  if (!(await requirePageUser("/care/sessions", "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <SessionList base="/care/sessions" />
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
