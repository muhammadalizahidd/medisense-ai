import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { UserControl } from "@/features/live/user-control";
import { isSuperAdmin } from "@/lib/permissions/can";
import { requirePageUser } from "@/server/page-auth";
import { heldPermissions } from "@/server/permissions";

export const metadata: Metadata = { title: "User control · Medisense" };

async function PageContent() {
  const user = await requirePageUser("/care/users", "admin");
  if (!user) return <OfflinePage />;
  // The Super Admin and anyone holding "Manage roles" open this page; requirePageUser sends
  // everyone else to their own home.
  return (
    <PageContainer>
      <UserControl
        superAdmin={isSuperAdmin(user.staffRoles)}
        heldApps={[...heldPermissions(user)].filter((id) => id.startsWith("app."))}
      />
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
