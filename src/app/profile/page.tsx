import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageContainer } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { ProfilePage } from "@/features/live/profile-page";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "My profile · Medisense" };

export default async function MyProfile() {
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
