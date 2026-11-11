import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { ProfilePage } from "@/features/live/profile-page";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "My profile · Medisense" };

async function MyProfileContent() {
  const user = await requirePageUser("/profile");
  if (!user) return <OfflinePage />;
  // Patients keep their profile in the app's Me tab.
  if (user.role === "client") redirect("/mobile/patient");
  return (
    <PageContainer>
      <ProfilePage />
    </PageContainer>
  );
}

/** The session is checked inside Suspense, so the page frame shows straight away. */
export default function MyProfile() {
  return (
    <Suspense fallback={<PageLoading />}>
      <MyProfileContent />
    </Suspense>
  );
}
