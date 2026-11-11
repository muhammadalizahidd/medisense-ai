import type { Metadata } from "next";
import { ReferralForm } from "@/features/live/referral-form";

export const metadata: Metadata = {
  title: "Make a referral · Medisense",
  robots: { index: false, follow: false },
};

/** The referral form as it appears inside the patient app: no header, sized for a phone. */
export default function AppReferralPage() {
  return (
    <main className="min-h-dvh bg-canvas px-3 py-4">
      <ReferralForm mode="public" embedded />
    </main>
  );
}
