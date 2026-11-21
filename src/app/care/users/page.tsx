import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { homeFor } from "@/lib/live/routes";
import { OfflinePage } from "@/features/live/offline-page";
import { UserControl } from "@/features/live/user-control";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "User control · Medisense" };

async function PageContent() {
  const user = await requirePageUser("/care/users", "admin");
  if (!user) return <OfflinePage />;
  // Only a Super Admin manages accounts; other admins go back to their own home.
  if (!(user.staffRoles ?? []).includes("Super Admin")) redirect(homeFor(user.role));
  return (
    <PageContainer>
      <UserControl />
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
