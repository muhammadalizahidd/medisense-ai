import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/features/live/bits";
import { ReferralForm } from "@/features/live/referral-form";
import type { KnownPatient } from "@/lib/live/referral";
import { currentUser } from "@/server/auth";
import { collections } from "@/server/db";

export const metadata: Metadata = {
  title: "Make a referral · Medisense",
  robots: { index: false, follow: false },
};

/** A signed-in patient's own details, so a new referral doesn't start from nothing. */
async function knownPatient(): Promise<KnownPatient | null> {
  const user = await currentUser();
  if (user?.role !== "client" || !user.clientId) return null;
  const c = await (await collections()).clients.findOne({ _id: user.clientId });
  if (!c?.mrn) return null;
  const parts = c.name.trim().split(/\s+/);
  const address = c.profile?.address;
  const planType = c.fundingDetails?.planType;
  return {
    mrn: c.mrn,
    firstName: parts.slice(0, -1).join(" ") || c.name,
    lastName: parts.length > 1 ? (parts.at(-1) ?? "") : "",
    dateOfBirth: c.dateOfBirth ?? "",
    email: c.email,
    phone: c.phone ?? "",
    address: {
      street: address?.street ?? "",
      suburb: address?.suburb || c.suburb,
      state: address?.state ?? "QLD",
      postcode: address?.postcode ?? "",
    },
    funding: c.funding,
    ndisNumber: c.fundingDetails?.ndisNumber ?? "",
    planEndDate: c.fundingDetails?.planEndDate ?? "",
    planType:
      planType === "Plan Managed" || planType === "Self-Managed" || planType === "Agency Managed"
        ? planType
        : "",
  };
}

async function AppForm() {
  return <ReferralForm mode="public" embedded known={await knownPatient()} />;
}

/** The referral form as it appears inside the patient app: phone-first, no page chrome. */
export default function AppReferralPage() {
  return (
    <main className="min-h-dvh bg-surface">
      {/* Scrolling stays, but no scrollbars inside the phone. */}
      <style>{`html,body{overflow-x:clip;scrollbar-width:none}html::-webkit-scrollbar,body::-webkit-scrollbar{display:none}`}</style>
      <Suspense fallback={<Skeleton className="h-150" />}>
        <AppForm />
      </Suspense>
    </main>
  );
}
