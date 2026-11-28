import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { homeFor } from "@/lib/live/routes";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { PayRates } from "@/features/live/pay-rates";
import { requirePageUser } from "@/server/page-auth";
import { canAny } from "@/server/permissions";

export const metadata: Metadata = { title: "Pay rates · Medisense" };

async function PageContent() {
  const user = await requirePageUser("/care/hr/pay", "admin");
  if (!user) return <OfflinePage />;
  // Opens with either pay permission, so a Finance Manager sets rates without the rest of HR.
  if (!canAny(user, ["pay.view", "pay.manage"])) {
    redirect(homeFor(user.role, user.staffRoles));
  }
  return (
    <PageContainer>
      <PayRates />
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
