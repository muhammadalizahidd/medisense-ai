import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { SessionsHub } from "@/features/live/sessions-hub";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Clinical notes · Medisense" };

async function PageContent() {
  if (!(await requirePageUser("/care/documentation", "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <SessionsHub section="notes" />
    </PageContainer>
  );
}

/** Clinical notes, its own page in the Sessions and notes menu. */
export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <PageContent />
    </Suspense>
  );
}
