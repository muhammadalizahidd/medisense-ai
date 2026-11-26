import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { homeFor } from "@/lib/live/routes";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { HrHub } from "@/features/live/hr-hub";
import { HR_PERMISSION } from "@/server/hr";
import { requirePageUser } from "@/server/page-auth";
import { can } from "@/server/permissions";

export const metadata: Metadata = { title: "People and HR · Medisense" };

async function PageContent() {
  const user = await requirePageUser("/care/hr", "admin");
  if (!user) return <OfflinePage />;
  // People and HR opens with its permission (the Super Admin holds every permission).
  if (!can(user, HR_PERMISSION)) {
    redirect(homeFor(user.role, user.staffRoles));
  }
  return (
    <PageContainer>
      <HrHub />
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
