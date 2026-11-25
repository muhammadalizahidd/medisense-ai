import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { homeFor } from "@/lib/live/routes";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { LeaveBoard } from "@/features/live/leave-board";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Leave and absence · Medisense" };

async function PageContent() {
  const user = await requirePageUser("/care/hr/leave", "admin");
  if (!user) return <OfflinePage />;
  // HR is for the Super Admin, Clinical Leads and Operations Managers.
  const hr = ["Super Admin", "Clinical Lead", "Operations Manager"];
  if (!(user.staffRoles ?? []).some((r) => hr.includes(r))) {
    redirect(homeFor(user.role, user.staffRoles));
  }
  return (
    <PageContainer>
      <LeaveBoard />
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
